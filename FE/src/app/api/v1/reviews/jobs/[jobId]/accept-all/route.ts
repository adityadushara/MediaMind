import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { acceptCandidate } from "@/lib/server/libraryIngest";
import type { CandidateRecord } from "@/lib/server/libraryIngest";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const { jobId } = await params;

  const { data: candidates, error } = await db
    .from("identification_candidates")
    .select("*")
    .eq("job_id", jobId)
    .eq("user_id", user.id)
    .neq("review_status", "accepted");

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  const createdItems: Array<Record<string, unknown>> = [];
  const failures: Array<{ candidate_id: string; error: string }> = [];

  for (const candidate of candidates || []) {
    try {
      const item = await acceptCandidate(db, user.id, candidate as CandidateRecord);
      if (item) createdItems.push(item);
    } catch (err: unknown) {
      failures.push({
        candidate_id: candidate.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json(createdItems, {
    headers:
      failures.length > 0
        ? { "X-Accept-Failures": String(failures.length) }
        : undefined,
  });
}
