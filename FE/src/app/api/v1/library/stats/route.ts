import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";

/**
 * Aggregate counts for the dashboard.
 *
 * The dashboard used to derive its numbers from the first page of library
 * items (`limit: 10`), so totals were wrong as soon as a user owned more than
 * ten records. Counting in the database keeps the numbers correct and cheap.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);

  const countWhere = async (filters?: Record<string, string>) => {
    let query = db
      .from("library_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    for (const [column, value] of Object.entries(filters || {})) {
      query = query.eq(column, value);
    }
    const { count, error } = await query;
    return { count, error };
  };

  const [
    total,
    wantToConsume,
    consuming,
    completed,
    onHold,
    dropped,
    needsReview,
    unverified,
  ] = await Promise.all([
    countWhere(),
    countWhere({ consumption_status: "want_to_consume" }),
    countWhere({ consumption_status: "consuming" }),
    countWhere({ consumption_status: "completed" }),
    countWhere({ consumption_status: "on_hold" }),
    countWhere({ consumption_status: "dropped" }),
    countWhere({ verification_status: "needs_review" }),
    countWhere({ verification_status: "unverified" }),
  ]);

  const failed = [total, wantToConsume, consuming, completed, onHold, dropped, needsReview, unverified]
    .map((result) => result.error)
    .find(Boolean);

  if (failed) {
    return NextResponse.json({ detail: failed.message }, { status: 500 });
  }

  return NextResponse.json({
    total: total.count || 0,
    by_status: {
      want_to_consume: wantToConsume.count || 0,
      consuming: consuming.count || 0,
      completed: completed.count || 0,
      on_hold: onHold.count || 0,
      dropped: dropped.count || 0,
    },
    needs_review: needsReview.count || 0,
    unverified: unverified.count || 0,
  });
}
