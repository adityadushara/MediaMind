import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { buildMediaProxyUrl } from "@/lib/server/storage";

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
  const now = new Date().toISOString();

  const { data: updated, error } = await db
    .from("library_items")
    .update({
      verification_status: "verified",
      updated_at: now,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*, item_sources(*, source_assets(id))")
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { detail: error?.message || "Library item not found" },
      { status: error ? 500 : 404 }
    );
  }

  // Resolve linked identification candidates and parent processing jobs so
  // dashboard review banners clear once the user confirms the item.
  const linkedAssetIds = (
    (updated.item_sources as Array<{ source_asset_id?: string | null }> | undefined) || []
  )
    .map((src) => src.source_asset_id)
    .filter((assetId): assetId is string => Boolean(assetId));

  const candidateJobIds = new Set<string>();

  const { data: resolvedByItem } = await db
    .from("identification_candidates")
    .update({
      review_status: "accepted",
      resolution_status: "accepted",
      resolved_library_item_id: id,
      resolved_at: now,
    })
    .eq("user_id", user.id)
    .eq("resolved_library_item_id", id)
    .eq("review_status", "needs_review")
    .select("job_id");

  for (const row of resolvedByItem || []) {
    if (row.job_id) candidateJobIds.add(row.job_id);
  }

  if (linkedAssetIds.length > 0) {
    const { data: resolvedByAsset } = await db
      .from("identification_candidates")
      .update({
        review_status: "accepted",
        resolution_status: "accepted",
        resolved_library_item_id: id,
        resolved_at: now,
      })
      .eq("user_id", user.id)
      .in("source_asset_id", linkedAssetIds)
      .eq("review_status", "needs_review")
      .select("job_id");

    for (const row of resolvedByAsset || []) {
      if (row.job_id) candidateJobIds.add(row.job_id);
    }

    const { data: assetJobs } = await db
      .from("processing_jobs")
      .select("id")
      .eq("user_id", user.id)
      .in("source_asset_id", linkedAssetIds)
      .eq("status", "needs_review");

    for (const job of assetJobs || []) {
      if (job.id) candidateJobIds.add(job.id);
    }
  }

  for (const jobId of candidateJobIds) {
    const { count } = await db
      .from("identification_candidates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .eq("review_status", "needs_review");

    if (!count) {
      await db
        .from("processing_jobs")
        .update({ status: "identified", updated_at: now })
        .eq("id", jobId)
        .eq("user_id", user.id)
        .eq("status", "needs_review");
    }
  }

  const firstSourceId = (
    updated.item_sources as Array<{ source_assets?: { id?: string } | null }> | undefined
  )?.[0]?.source_assets?.id;

  return NextResponse.json({
    ...updated,
    screenshot_url: firstSourceId ? buildMediaProxyUrl(firstSourceId, "original") : null,
  });
}
