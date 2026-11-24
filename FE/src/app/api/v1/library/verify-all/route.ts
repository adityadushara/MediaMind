import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("library_items")
    .update({
      verification_status: "verified",
      updated_at: now,
    })
    .eq("user_id", user.id)
    .in("verification_status", ["needs_review", "auto_accepted"])
    .select("id");

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  await db
    .from("identification_candidates")
    .update({
      review_status: "accepted",
      resolution_status: "accepted",
      resolved_at: now,
    })
    .eq("user_id", user.id)
    .eq("review_status", "needs_review");

  await db
    .from("processing_jobs")
    .update({
      status: "identified",
      updated_at: now,
    })
    .eq("user_id", user.id)
    .eq("status", "needs_review");

  return NextResponse.json({ verified_count: data?.length || 0 });
}
