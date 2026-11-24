import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";

/**
 * Aggregate counts for the dashboard.
 *
 * The dashboard used to derive its numbers from the first page of library
 * items (`limit: 10`), so totals were wrong as soon as a user owned more than
 * ten records. Counting in the database keeps the numbers correct.
 *
 * The two counters live on the same table, so one row set answers every
 * question: eight separate count requests meant eight round trips to Postgres
 * for a single dashboard render.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);

  const { data: rows, error } = await db
    .from("library_items")
    .select("consumption_status, verification_status")
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  const byStatus: Record<string, number> = {
    want_to_consume: 0,
    consuming: 0,
    completed: 0,
    on_hold: 0,
    dropped: 0,
  };
  let needsReview = 0;
  let unverified = 0;

  for (const row of rows || []) {
    const status = (row as { consumption_status?: string }).consumption_status;
    if (status && status in byStatus) byStatus[status] += 1;
    const verification = (row as { verification_status?: string }).verification_status;
    if (verification === "needs_review") needsReview += 1;
    if (verification === "unverified") unverified += 1;
  }

  return NextResponse.json({
    total: rows?.length || 0,
    by_status: byStatus,
    needs_review: needsReview,
    unverified,
  });
}
