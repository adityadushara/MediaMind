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
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");
  const search = searchParams.get("search");
  const status = searchParams.get("status");
  const sort = searchParams.get("sort") === "oldest" ? "oldest" : "newest";

  // Filtering by job status must happen in the database, otherwise a page of
  // unfiltered assets is fetched and the client silently shows the wrong set.
  // `!inner` keeps only assets that have at least one matching job.
  let query = db
    .from("source_assets")
    .select(status ? "*, processing_jobs!inner(*)" : "*, processing_jobs(*)", {
      count: "exact",
    })
    .eq("user_id", user.id)
    .order("created_at", { ascending: sort === "oldest" });

  if (status) {
    query = query.eq("processing_jobs.status", status);
  }

  if (search) {
    query = query.ilike("file_name", `%${search}%`);
  }

  const { data: assets, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  const enriched = await Promise.all(
    (assets || []).map(async (asset) => {
      const jobs = asset.processing_jobs || [];
      jobs.sort(
        (a: { created_at?: string }, b: { created_at?: string }) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
      // When a status filter is active the embedded jobs are already narrowed;
      // still pick the newest one so the card shows its own state.
      const latestJob = jobs[0] || null;

      return {
        ...asset,
        // Use the authenticated media proxy; never return inline base64 here.
        signed_url: buildMediaProxyUrl(asset.id, "original"),
        latest_status: latestJob?.status || null,
        latest_job: latestJob,
      };
    })
  );

  return NextResponse.json({
    total: count || enriched.length,
    items: redactInlineDataUrls(enriched),
    assets: redactInlineDataUrls(enriched),
  });
}
