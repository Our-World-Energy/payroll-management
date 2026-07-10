"use server";

import { createClient } from "@supabase/supabase-js";

const TABLE = "contractor_leave_requests";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type LeaveRequest = {
  id: string;
  email: string;
  type: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  durationDays: number;
  reason: string;
  status: "Approved" | "Rejected" | "Pending";
  createdAt: string;
  updatedAt: string;
};

function toLeaveRequest(row: Record<string, unknown>): LeaveRequest {
  const status = String(row.status ?? "Pending");
  return {
    id:           String(row.id ?? ""),
    email:        String(row.email ?? ""),
    type:         String(row.type ?? ""),
    startDate:    String(row.startDate ?? "").slice(0, 10),
    endDate:      String(row.endDate ?? "").slice(0, 10),
    durationDays: Number(row.durationDays ?? 0),
    reason:       String(row.reason ?? ""),
    status:       status === "Approved" || status === "Rejected" ? status : "Pending",
    createdAt:    String(row.createdAt ?? ""),
    updatedAt:    String(row.updatedAt ?? ""),
  };
}

export async function fetchLeaveRequestsForEmail(email: string): Promise<LeaveRequest[]> {
  if (!email) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .ilike("email", email)
    .order("createdAt", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toLeaveRequest);
}

export async function updateLeaveRequestStatus(id: string, status: "Approved" | "Rejected"): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from(TABLE)
    .update({ status, updatedAt: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
