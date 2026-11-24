"use server";

import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import {
  acceptCandidate,
  type CandidateOverrides,
  type CandidateRecord,
} from "@/lib/server/libraryIngest";
import { revalidatePath } from "next/cache";

/**
 * Server actions kept for forms that cannot call the REST endpoints directly.
 * The accept path delegates to `acceptCandidate` so schema handling, ownership
 * checks, link resolution and deduplication stay in one place.
 */
export async function acceptCandidateAction(
  userId: string,
  candidateId: string,
  overrides: CandidateOverrides = {},
  token?: string
) {
  const db = createAuthenticatedClient(token);
  const { data: candidate, error } = await db
    .from("identification_candidates")
    .select("*")
    .eq("id", candidateId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !candidate) throw new Error("Candidate not found");

  const item = await acceptCandidate(
    db,
    userId,
    candidate as CandidateRecord,
    overrides
  );
  if (!item) throw new Error("Could not create a library item from this candidate");

  revalidatePath("/review");
  revalidatePath("/library");
  return item;
}

export async function rejectCandidateAction(
  candidateId: string,
  token?: string,
  userId?: string
) {
  const db = createAuthenticatedClient(token);
  let resolvedUserId = userId;
  if (!resolvedUserId && token) {
    const { data } = await db.auth.getUser(token);
    resolvedUserId = data?.user?.id;
  }
  if (!resolvedUserId) {
    throw new Error("Unauthorized");
  }

  const { data: updated, error } = await db
    .from("identification_candidates")
    .update({
      review_status: "rejected",
      resolution_status: "rejected",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", candidateId)
    .eq("user_id", resolvedUserId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!updated) throw new Error("Candidate not found");
  revalidatePath("/review");
  return { success: true };
}
