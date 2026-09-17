import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function DELETE(
  _request: Request,
  // Next 15 hands route params to the handler as a Promise; awaiting it is
  // required, and typing it as a plain object fails the generated route-type
  // check that `next build` emits into .next/types.
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = getSupabase();
  const { id } = await params;
  const { error } = await sb.from("holidays").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
