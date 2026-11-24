import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);

  // Candidates carry user_id directly; filtering on it keeps tenant isolation
  // even when the server uses a service-role key (which bypasses RLS).
  const { data: candidates, error } = await db
    .from("identification_candidates")
    .select("review_status")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  const list = (candidates || []) as Array<{ review_status?: string | null }>;
  const pending = list.filter((c) => c.review_status === "needs_review").length;
  const accepted = list.filter(
    (c) => c.review_status === "accepted" || c.review_status === "auto_accepted"
  ).length;
  const rejected = list.filter((c) => c.review_status === "rejected").length;

  return NextResponse.json({
    pending_review: pending,
    accepted,
    rejected,
    total: list.length,
  });
}
