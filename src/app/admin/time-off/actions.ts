"use server";

import { createClient } from "@supabase/supabase-js";
import { fetchAllContractors, fetchAllLeaveRequestsAdmin, fetchAllSpecialLeaveGrantsAdmin } from "../contractors/actions";
import { fetchCutOffTime, fetchProcessTimeAwayEnabled, fetchTimeAwayImportEnabled } from "../settings/actions";

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

/**
 * Everything Time Away Management needs, in one call.
 *
 * The five fetches used to be five separate Server Actions wrapped in a
 * client-side Promise.all — but Next serialises Server Action requests from a
 * client, so they ran one after another (five round trips, each carrying the
 * page payload) rather than concurrently. Doing the Promise.all here means one
 * round trip and genuine parallelism, since it's plain async work on the
 * server.
 *
 * Same reasoning, and the same shape, as fetchDashboardBundle in
 * app/contractor/dashboard/actions.ts — this view had simply never been given
 * the same treatment.
 *
 * Measured against the live database: the contractor read is ~565ms and the
 * other four ~140-160ms each, so serialised they summed to roughly 1.2s of
 * query time before per-round-trip overhead; concurrently they cost about as
 * much as the slowest one.
 */
export async function fetchTimeOffBundle() {
  const [contractors, requests, grants, savedCutoff, processEnabled, importEnabled] = await Promise.all([
    fetchAllContractors({ country: "All Countries", status: "All Statuses", rules: [] }),
    fetchAllLeaveRequestsAdmin(),
    fetchAllSpecialLeaveGrantsAdmin(),
    fetchCutOffTime(),
    fetchProcessTimeAwayEnabled(),
    // Added to the bundle rather than fetched on its own: a sixth Server
    // Action from the client would be a sixth serialised round trip.
    fetchTimeAwayImportEnabled(),
  ]);
  return { contractors, requests, grants, savedCutoff, processEnabled, importEnabled };
}
