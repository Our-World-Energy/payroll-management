"use server";

import { randomInt } from "node:crypto";
import {
  SALARY_GRANT_DAYS, SALARY_VIEWERS_SETTING_KEY, SALARY_ACCESS_ERROR,
  getSalaryAccess, serviceClient, envSalaryViewers, dbSalaryViewers, normalizeEmail, canViewSalary, parseDbInstant,
} from "@/lib/salaryAccess";
import { hashOtp, otpMatches, hasSalaryKey, isSalaryEncrypted, encryptSalary, encryptSalaryNumber } from "@/lib/salaryCrypto";
import { sendEmail, salaryOtpEmail, isMailConfigured } from "@/lib/mailer";

// Email-OTP unlock for salary visibility. Flow (see SalaryAccessContext for
// the UI): on admin load → getSalaryAccessStatus(); if eligible but not
// verified the popup offers requestSalaryOtp() → a 6-digit code is emailed →
// verifySalaryOtp(code) writes a 30-day grant. Every salary-touching action
// re-checks the grant server-side on each call, so the popup is convenience,
// not the gate.

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const GRANTS = "salary_access_grants";
const CHALLENGES = "salary_otp_challenges";

export type SalaryAccessStatus = {
  signedIn: boolean;
  email: string | null;
  isAdmin: boolean;
  eligible: boolean;
  verified: boolean;
  verifiedUntil: string | null;
  canView: boolean;
  mailConfigured: boolean;
  setupError?: string;
};

export async function getSalaryAccessStatus(): Promise<SalaryAccessStatus> {
  const a = await getSalaryAccess();
  return {
    signedIn: !!a.email,
    email: a.email,
    isAdmin: a.isAdmin,
    eligible: a.eligible,
    verified: a.verified,
    verifiedUntil: a.verifiedUntil,
    canView: a.canView,
    mailConfigured: isMailConfigured(),
    setupError: a.setupError,
  };
}

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const head = user.slice(0, Math.min(2, user.length));
  return `${head}${"•".repeat(Math.max(3, user.length - head.length))}@${domain}`;
}

export async function requestSalaryOtp(): Promise<
  { ok: true; maskedEmail: string; expiresInMinutes: number; devCode?: string }
  | { ok: false; error: string; retryAfterSeconds?: number }
> {
  const access = await getSalaryAccess();
  if (!access.email) return { ok: false, error: "You need to be signed in." };
  if (!access.isAdmin || !access.eligible) return { ok: false, error: "Your account is not permitted to view salary data." };
  if (!hasSalaryKey()) return { ok: false, error: "SALARY_MASTER_KEY is not configured on the server." };

  const sb = serviceClient();
  const email = access.email;

  // Throttle: one code per minute per email.
  const { data: latest } = await sb
    .from(CHALLENGES)
    .select("createdAt")
    .eq("email", email)
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestCreated = parseDbInstant(latest?.createdAt);
  if (latestCreated) {
    const ageSec = (Date.now() - latestCreated.getTime()) / 1000;
    if (ageSec < OTP_RESEND_SECONDS) {
      const wait = Math.ceil(OTP_RESEND_SECONDS - ageSec);
      return { ok: false, error: `Please wait ${wait}s before requesting another code.`, retryAfterSeconds: wait };
    }
  }

  // Only the newest code is valid — retire any earlier unconsumed ones.
  await sb.from(CHALLENGES).update({ consumedAt: new Date().toISOString() }).eq("email", email).is("consumedAt", null);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  const { error: insertErr } = await sb.from(CHALLENGES).insert({
    id: crypto.randomUUID(),
    email,
    codeHash: hashOtp(email, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000).toISOString(),
    attempts: 0,
    consumedAt: null,
    createdAt: now.toISOString(),
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  const mail = salaryOtpEmail(code, OTP_TTL_MINUTES, SALARY_GRANT_DAYS);
  const sent = await sendEmail({ to: email, ...mail });
  if (!sent.ok) {
    // Local development without an email provider: surface the code in the
    // server log and to the UI so the flow can still be exercised. Never in
    // production.
    if (sent.notConfigured && process.env.NODE_ENV !== "production") {
      console.warn(`[salary-access] RESEND_API_KEY not set — OTP for ${email}: ${code}`);
      return { ok: true, maskedEmail: maskEmail(email), expiresInMinutes: OTP_TTL_MINUTES, devCode: code };
    }
    return { ok: false, error: sent.error };
  }
  return { ok: true, maskedEmail: maskEmail(email), expiresInMinutes: OTP_TTL_MINUTES };
}

export async function verifySalaryOtp(codeInput: string): Promise<{ ok: true; verifiedUntil: string } | { ok: false; error: string }> {
  const access = await getSalaryAccess();
  if (!access.email) return { ok: false, error: "You need to be signed in." };
  if (!access.isAdmin || !access.eligible) return { ok: false, error: "Your account is not permitted to view salary data." };

  const code = codeInput.replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "Enter the 6-digit code." };

  const sb = serviceClient();
  const email = access.email;
  const { data: challenge, error } = await sb
    .from(CHALLENGES)
    .select("id, codeHash, expiresAt, attempts")
    .eq("email", email)
    .is("consumedAt", null)
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!challenge) return { ok: false, error: "No active code — request a new one." };
  const challengeExpires = parseDbInstant(challenge.expiresAt);
  if (!challengeExpires || challengeExpires.getTime() < Date.now()) {
    await sb.from(CHALLENGES).update({ consumedAt: new Date().toISOString() }).eq("id", challenge.id);
    return { ok: false, error: "That code has expired — request a new one." };
  }
  if (Number(challenge.attempts) >= OTP_MAX_ATTEMPTS) {
    await sb.from(CHALLENGES).update({ consumedAt: new Date().toISOString() }).eq("id", challenge.id);
    return { ok: false, error: "Too many attempts — request a new code." };
  }

  if (!otpMatches(email, code, String(challenge.codeHash))) {
    const attempts = Number(challenge.attempts) + 1;
    await sb.from(CHALLENGES).update({ attempts }).eq("id", challenge.id);
    const left = OTP_MAX_ATTEMPTS - attempts;
    return { ok: false, error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many attempts — request a new code." };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SALARY_GRANT_DAYS * 24 * 60 * 60_000).toISOString();
  const [{ error: consumeErr }, { error: grantErr }] = await Promise.all([
    sb.from(CHALLENGES).update({ consumedAt: now.toISOString() }).eq("id", challenge.id),
    sb.from(GRANTS).upsert({ email, verifiedAt: now.toISOString(), expiresAt, createdAt: now.toISOString() }, { onConflict: "email" }),
  ]);
  if (consumeErr || grantErr) return { ok: false, error: (grantErr ?? consumeErr)!.message };
  return { ok: true, verifiedUntil: expiresAt };
}

/** Re-lock salary for the current user (they'll need a fresh OTP). */
export async function lockSalaryAccess(): Promise<{ ok: boolean; error?: string }> {
  const access = await getSalaryAccess();
  if (!access.email) return { ok: false, error: "You need to be signed in." };
  const { error } = await serviceClient().from(GRANTS).delete().eq("email", access.email);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Allowlist management (Settings → Salary Visibility) ──────────────────────

export type SalaryViewerList = {
  /** From SALARY_VIEWER_EMAILS — always allowed, not removable here. */
  env: string[];
  /** From app_settings — editable by an unlocked viewer. */
  db: string[];
  /** Whether the caller may add/remove entries. */
  canManage: boolean;
};

// Only admins on the allowlist may even see who else is on it.
export async function fetchSalaryViewers(): Promise<SalaryViewerList> {
  const access = await getSalaryAccess();
  if (!access.isAdmin || !access.eligible) return { env: [], db: [], canManage: false };
  return { env: envSalaryViewers(), db: await dbSalaryViewers(), canManage: access.canView };
}

async function saveDbViewers(list: string[]): Promise<{ ok: boolean; error?: string }> {
  const { error } = await serviceClient()
    .from("app_settings")
    .upsert({ key: SALARY_VIEWERS_SETTING_KEY, value: JSON.stringify(list), updatedAt: new Date().toISOString() }, { onConflict: "key" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function addSalaryViewer(emailInput: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await canViewSalary())) return { ok: false, error: SALARY_ACCESS_ERROR };
  const email = normalizeEmail(emailInput);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  const current = await dbSalaryViewers();
  if (current.includes(email) || envSalaryViewers().includes(email)) return { ok: true };
  return saveDbViewers([...current, email].sort());
}

export async function removeSalaryViewer(emailInput: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await canViewSalary())) return { ok: false, error: SALARY_ACCESS_ERROR };
  const email = normalizeEmail(emailInput);
  if (envSalaryViewers().includes(email)) return { ok: false, error: "That email comes from SALARY_VIEWER_EMAILS and can only be removed there." };
  const current = await dbSalaryViewers();
  const [, revoke] = await Promise.all([
    saveDbViewers(current.filter((e) => e !== email)),
    // Removing someone from the list also ends their current unlock.
    serviceClient().from(GRANTS).delete().eq("email", email),
  ]);
  if (revoke.error) return { ok: false, error: revoke.error.message };
  return { ok: true };
}

// ── One-time backfill: encrypt salary figures already in the database ────────
// Idempotent — rows whose values already carry the enc:v1: prefix are skipped,
// so it can be re-run after the column-type migration, after importing legacy
// data, or after a partial failure.

const PROFILE_RATE_COLS = ["monthlyRate", "weeklyRate", "hourlyRate"] as const;
const ADJUSTMENT_MONEY_COLS = ["bonus", "misc", "retroPay", "reim", "cashAdvance", "hmo", "tax"] as const;
const PROCESSED_MONEY_COLS = [
  "hourlyRate", "monthlyRate", "weeklyRate", "gross", "deductions", "net",
  "bonus", "misc", "retroPay", "reim", "cashAdvance", "hmo", "tax", "indHoursPay",
  "sickPay", "specialPay", "advancePay", "ptoPay",
  "regPay", "regOtPay", "rdOtPay", "usHolidayPay", "hoOtPay", "localHolidayPay",
] as const;

type TableSpec = { table: string; idColumn: string; columns: readonly string[]; numeric: boolean };
const BACKFILL_TABLES: TableSpec[] = [
  { table: "contractor_profiles", idColumn: "id", columns: PROFILE_RATE_COLS, numeric: false },
  { table: "payroll_adjustments", idColumn: "id", columns: ADJUSTMENT_MONEY_COLS, numeric: true },
  { table: "process_weekly_payroll", idColumn: "id", columns: PROCESSED_MONEY_COLS, numeric: true },
];

export type SalaryEncryptionStatus = {
  keyConfigured: boolean;
  tables: Array<{ table: string; total: number; pending: number; error?: string }>;
};

async function scanTable(spec: TableSpec): Promise<{ total: number; pending: Array<Record<string, unknown>>; error?: string }> {
  const { data, error } = await serviceClient().from(spec.table).select([spec.idColumn, ...spec.columns].join(", "));
  if (error) return { total: 0, pending: [], error: error.message };
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const pending = rows.filter((r) => spec.columns.some((c) => !isSalaryEncrypted(r[c])));
  return { total: rows.length, pending };
}

export async function fetchSalaryEncryptionStatus(): Promise<SalaryEncryptionStatus> {
  const access = await getSalaryAccess();
  if (!access.isAdmin || !access.eligible) return { keyConfigured: hasSalaryKey(), tables: [] };
  const scans = await Promise.all(BACKFILL_TABLES.map(scanTable));
  return {
    keyConfigured: hasSalaryKey(),
    tables: BACKFILL_TABLES.map((spec, i) => ({ table: spec.table, total: scans[i].total, pending: scans[i].pending.length, error: scans[i].error })),
  };
}

export async function runSalaryEncryptionBackfill(): Promise<{ ok: boolean; error?: string; updated: Record<string, number> }> {
  if (!(await canViewSalary())) return { ok: false, error: SALARY_ACCESS_ERROR, updated: {} };
  if (!hasSalaryKey()) return { ok: false, error: "SALARY_MASTER_KEY is not configured on the server.", updated: {} };

  const sb = serviceClient();
  const updated: Record<string, number> = {};
  for (const spec of BACKFILL_TABLES) {
    const scan = await scanTable(spec);
    if (scan.error) return { ok: false, error: `${spec.table}: ${scan.error}`, updated };
    let count = 0;
    for (const row of scan.pending) {
      const patch: Record<string, string> = {};
      for (const col of spec.columns) {
        const v = row[col];
        if (isSalaryEncrypted(v)) continue;
        patch[col] = spec.numeric
          ? encryptSalaryNumber(v == null || v === "" ? 0 : Number(v))
          : encryptSalary(v == null ? "" : String(v));
      }
      const { error } = await sb.from(spec.table).update(patch).eq(spec.idColumn, row[spec.idColumn] as string);
      if (error) return { ok: false, error: `${spec.table}: ${error.message}`, updated: { ...updated, [spec.table]: count } };
      count++;
    }
    updated[spec.table] = count;
  }
  return { ok: true, updated };
}
