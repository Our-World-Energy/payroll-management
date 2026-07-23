"use server";

import { createClient } from "@supabase/supabase-js";
import type { DeptTree } from "@/components/ContractorConfigContext";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ── Load all org config ───────────────────────────────────────────────────────

export async function fetchOrgConfig(): Promise<{
  officeLocations: string[];
  managers: string[];
  countryLocations: string[];
  deptTree: DeptTree;
}> {
  const sb = getSupabase();

  const [locRes, mgrRes, countryRes, deptRes, subRes, roleRes] = await Promise.all([
    sb.from("org_office_locations").select("name").order("name"),
    sb.from("org_managers").select("name").order("name"),
    sb.from("org_country_locations").select("name").order("name"),
    sb.from("org_departments").select("id, name").order("name"),
    sb.from("org_sub_departments").select("id, departmentId, name").order("name"),
    sb.from("org_roles").select("subDepartmentId, name").order("name"),
  ]);

  const officeLocations: string[] = (locRes.data ?? []).map((r: { name: string }) => r.name);
  const managers: string[] = (mgrRes.data ?? []).map((r: { name: string }) => r.name);
  const countryLocations: string[] = (countryRes.data ?? []).map((r: { name: string }) => r.name);

  const deptTree: DeptTree = {};
  for (const dept of (deptRes.data ?? []) as { id: string; name: string }[]) {
    deptTree[dept.name] = {};
    const subs = ((subRes.data ?? []) as { id: string; departmentId: string; name: string }[])
      .filter((s) => s.departmentId === dept.id);
    for (const sub of subs) {
      const roles = ((roleRes.data ?? []) as { subDepartmentId: string; name: string }[])
        .filter((r) => r.subDepartmentId === sub.id)
        .map((r) => r.name);
      deptTree[dept.name][sub.name] = roles;
    }
  }

  return { officeLocations, managers, countryLocations, deptTree };
}

// ── Office locations ──────────────────────────────────────────────────────────

export async function addOfficeLocation(name: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { error } = await sb
    .from("org_office_locations")
    .insert({ id: crypto.randomUUID(), name: name.trim(), createdAt: now });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeOfficeLocation(name: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("org_office_locations").delete().eq("name", name);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Country locations ─────────────────────────────────────────────────────────

export async function addCountryLocation(name: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { error } = await sb
    .from("org_country_locations")
    .insert({ id: crypto.randomUUID(), name: name.trim(), createdAt: now });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeCountryLocation(name: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("org_country_locations").delete().eq("name", name);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Managers ──────────────────────────────────────────────────────────────────

export async function addManager(name: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { error } = await sb
    .from("org_managers")
    .insert({ id: crypto.randomUUID(), name: name.trim(), createdAt: now });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeManager(name: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { error } = await sb.from("org_managers").delete().eq("name", name);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Departments ───────────────────────────────────────────────────────────────

export async function addDepartment(name: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { error } = await sb
    .from("org_departments")
    .insert({ id: crypto.randomUUID(), name: name.trim(), createdAt: now });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeDepartment(name: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { data: dept, error: fetchErr } = await sb
    .from("org_departments")
    .select("id")
    .eq("name", name)
    .single();
  if (fetchErr || !dept) return { ok: false, error: fetchErr?.message ?? "Not found" };
  const { error } = await sb.from("org_departments").delete().eq("id", dept.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Sub-departments ───────────────────────────────────────────────────────────

export async function addSubDepartment(
  deptName: string,
  subName: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { data: dept, error: fetchErr } = await sb
    .from("org_departments")
    .select("id")
    .eq("name", deptName)
    .single();
  if (fetchErr || !dept) return { ok: false, error: fetchErr?.message ?? "Department not found" };
  const now = new Date().toISOString();
  const { error } = await sb
    .from("org_sub_departments")
    .insert({ id: crypto.randomUUID(), departmentId: dept.id, name: subName.trim(), createdAt: now });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeSubDepartment(
  deptName: string,
  subName: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { data: dept, error: fetchErr } = await sb
    .from("org_departments")
    .select("id")
    .eq("name", deptName)
    .single();
  if (fetchErr || !dept) return { ok: false, error: fetchErr?.message ?? "Department not found" };
  const { error } = await sb
    .from("org_sub_departments")
    .delete()
    .eq("departmentId", dept.id)
    .eq("name", subName);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Roles ─────────────────────────────────────────────────────────────────────

export async function addRole(
  deptName: string,
  subName: string,
  roleName: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { data: dept, error: fetchErr } = await sb
    .from("org_departments")
    .select("id")
    .eq("name", deptName)
    .single();
  if (fetchErr || !dept) return { ok: false, error: fetchErr?.message ?? "Department not found" };
  const { data: sub, error: subErr } = await sb
    .from("org_sub_departments")
    .select("id")
    .eq("departmentId", dept.id)
    .eq("name", subName)
    .single();
  if (subErr || !sub) return { ok: false, error: subErr?.message ?? "Sub-department not found" };
  const now = new Date().toISOString();
  const { error } = await sb
    .from("org_roles")
    .insert({ id: crypto.randomUUID(), subDepartmentId: sub.id, name: roleName.trim(), createdAt: now });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeRole(
  deptName: string,
  subName: string,
  roleName: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { data: dept, error: fetchErr } = await sb
    .from("org_departments")
    .select("id")
    .eq("name", deptName)
    .single();
  if (fetchErr || !dept) return { ok: false, error: fetchErr?.message ?? "Department not found" };
  const { data: sub, error: subErr } = await sb
    .from("org_sub_departments")
    .select("id")
    .eq("departmentId", dept.id)
    .eq("name", subName)
    .single();
  if (subErr || !sub) return { ok: false, error: subErr?.message ?? "Sub-department not found" };
  const { error } = await sb
    .from("org_roles")
    .delete()
    .eq("subDepartmentId", sub.id)
    .eq("name", roleName);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Seed helpers (called once to migrate hardcoded defaults into DB) ──────────

export async function seedOrgDefaults(
  officeLocations: string[],
  managers: string[],
  deptTree: DeptTree,
  countryLocations: string[] = [],
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const now = new Date().toISOString();

  // Check if already seeded (if any dept exists, skip)
  const { data: existing } = await sb.from("org_departments").select("id").limit(1);
  if (existing && existing.length > 0) return { ok: true };

  // Insert office locations
  if (officeLocations.length) {
    await sb.from("org_office_locations").insert(
      officeLocations.map((name) => ({ id: crypto.randomUUID(), name, createdAt: now })),
    );
  }

  // Insert managers
  if (managers.length) {
    await sb.from("org_managers").insert(
      managers.map((name) => ({ id: crypto.randomUUID(), name, createdAt: now })),
    );
  }

  // Insert country locations
  if (countryLocations.length) {
    await sb.from("org_country_locations").insert(
      countryLocations.map((name) => ({ id: crypto.randomUUID(), name, createdAt: now })),
    );
  }

  // Insert dept tree
  for (const [deptName, subs] of Object.entries(deptTree)) {
    const deptId = crypto.randomUUID();
    await sb.from("org_departments").insert({ id: deptId, name: deptName, createdAt: now });
    for (const [subName, roles] of Object.entries(subs)) {
      const subId = crypto.randomUUID();
      await sb.from("org_sub_departments").insert({ id: subId, departmentId: deptId, name: subName, createdAt: now });
      if (roles.length) {
        await sb.from("org_roles").insert(
          roles.map((name) => ({ id: crypto.randomUUID(), subDepartmentId: subId, name, createdAt: now })),
        );
      }
    }
  }

  return { ok: true };
}

// ── Time Off cut off date ──────────────────────────────────────────────────
// Single-row table: month name + day number only (no year — recurs annually).

export async function fetchCutOffTime(): Promise<{ monthName: string; monthNo: number } | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from("cut_off_time")
    .select("cut_off_month_name, cut_off_month_no")
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { monthName: data.cut_off_month_name, monthNo: data.cut_off_month_no };
}

export async function saveCutOffTime(monthName: string, monthNo: number): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  const { data: existing, error: lookupErr } = await sb.from("cut_off_time").select("id").limit(1).maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };

  const payload = { cut_off_month_name: monthName, cut_off_month_no: monthNo, updatedAt: new Date().toISOString() };

  const { error } = existing
    ? await sb.from("cut_off_time").update(payload).eq("id", existing.id)
    : await sb.from("cut_off_time").insert({ id: crypto.randomUUID(), ...payload });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
