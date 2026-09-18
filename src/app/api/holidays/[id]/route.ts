import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function DELETE(
  _request: Request,
  // Next 15 hands route handlers a promise for the dynamic segments. Typing it
  // as a plain object still compiles, but `params.id` then reads a property off
  // the promise itself and yields undefined, so the delete filtered on
  // id = undefined and removed nothing.
  { params }: { params: Promise<{ id: string }> }
) {
  // Holidays drive holiday pay, and this handler talks to Postgres with the
  // service-role key, which bypasses row-level security. It had no caller check
  // at all — harmless only for as long as the bug above kept it from deleting
  // anything. GET on this resource is public and lists every id, so an
  // unauthenticated caller could have enumerated and deleted the lot.
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing holiday id." }, { status: 400 });

  const sb = getSupabase();
  const { error } = await sb.from("holidays").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
