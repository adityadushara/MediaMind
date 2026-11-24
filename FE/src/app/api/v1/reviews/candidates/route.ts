import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { buildMediaProxyUrl, redactInlineDataUrls } from "@/lib/server/storage";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const { searchParams } = new URL(req.url);
  const reviewStatus = searchParams.get("review_status") || "needs_review";
  const contentType = searchParams.get("content_type");
  const jobId = searchParams.get("job_id");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  let query = db
    .from("identification_candidates")
    .select("*, source_assets!inner(user_id, file_path), image_derivatives(*)", { count: "exact" })
    .eq("source_assets.user_id", user.id)
    .order("created_at", { ascending: false });

  if (reviewStatus !== "all") {
    query = query.eq("review_status", reviewStatus);
  }
  if (contentType) {
    query = query.eq("suggested_type", contentType);
  }
  if (jobId) {
    query = query.eq("job_id", jobId);
  }

  const { data: candidates, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  const enriched = await Promise.all(
    (candidates || []).map(async (c: Record<string, unknown>) => {
      const sourceAssetId =
        typeof c.source_asset_id === "string" ? c.source_asset_id : null;
      const derivativeId =
        typeof c.derivative_id === "string" ? c.derivative_id : null;
      const providers = Array.isArray(c.provider_candidates)
        ? (c.provider_candidates as Array<Record<string, unknown>>)
        : [];
      const provider = providers[0] || {};

      return {
        ...c,
        // Recover fields stored inside provider_candidates on databases that
        // do not have suggested_subcategory/direct_url columns yet.
        suggested_subcategory:
          c.suggested_subcategory ?? provider.suggested_subcategory ?? null,
        direct_url: c.direct_url ?? provider.direct_url ?? null,
        crop_signed_url: sourceAssetId
          ? buildMediaProxyUrl(sourceAssetId, "crop", derivativeId)
          : "",
        source_signed_url: sourceAssetId
          ? buildMediaProxyUrl(sourceAssetId, "original")
          : "",
      };
    })
  );

  return NextResponse.json({
    total: count || enriched.length,
    candidates: redactInlineDataUrls(enriched),
  });
}
