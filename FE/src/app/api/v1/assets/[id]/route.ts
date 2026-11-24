import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { buildMediaProxyUrl, redactInlineDataUrls } from "@/lib/server/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const { id } = await params;
  const { data: asset, error } = await db
    .from("source_assets")
    .select("*, processing_jobs(*), identification_candidates(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !asset) {
    return NextResponse.json({ detail: "Asset not found" }, { status: 404 });
  }

  const signedUrl = buildMediaProxyUrl(asset.id, "original");

  // Fetch linked library items via item_sources
  const { data: itemSources } = await db
    .from("item_sources")
    .select("*, library_items(*)")
    .eq("source_asset_id", id);

  const libraryItems = (itemSources || [])
    .map((is: { library_items?: unknown }) => is.library_items)
    .filter(Boolean);

  const jobs = asset.processing_jobs || [];
  jobs.sort(
    (a: { created_at?: string }, b: { created_at?: string }) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
  const latestJob = jobs[0] || null;

  return NextResponse.json(
    redactInlineDataUrls({
      ...asset,
      signed_url: signedUrl,
      latest_status: latestJob?.status || null,
      latest_job: latestJob,
      library_items: libraryItems || [],
    })
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const { id } = await params;
  const { error } = await db
    .from("source_assets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Asset deleted" });
}
