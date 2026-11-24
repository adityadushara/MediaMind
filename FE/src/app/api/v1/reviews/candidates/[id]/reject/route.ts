import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const { id } = await params;

  const { data: updated, error } = await db
    .from("identification_candidates")
    .update({
      review_status: "rejected",
      resolution_status: "rejected",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ detail: "Candidate not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    candidate_id: id,
    review_status: "rejected",
  });
}
