import { NextRequest, NextResponse, after } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { processJob } from "@/lib/server/processJob";

export const maxDuration = 60;

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
  const { data: job, error } = await db
    .from("processing_jobs")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !job) {
    return NextResponse.json({ detail: "Job not found" }, { status: 404 });
  }

  await db
    .from("processing_jobs")
    .update({
      status: "queued",
      retry_count: (job.retry_count || 0) + 1,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  // Reset unedited failure/unidentified placeholders back to "unverified" so
  // the library card shows "Analyzing" again while the retry runs.
  if (job.source_asset_id) {
    const { data: links } = await db
      .from("item_sources")
      .select("library_item_id")
      .eq("source_asset_id", job.source_asset_id);

    const itemIds = (links || [])
      .map((row: { library_item_id?: string | null }) => row.library_item_id)
      .filter((itemId): itemId is string => Boolean(itemId));

    if (itemIds.length > 0) {
      const { data: linkedItems } = await db
        .from("library_items")
        .select("id, overview, verification_status")
        .in("id", itemIds)
        .eq("user_id", user.id)
        .eq("verification_status", "needs_review");

      const resetIds = (linkedItems || [])
        .filter(
          (item: { overview?: string | null }) =>
            typeof item.overview === "string" &&
            (item.overview.startsWith("AI extraction failed:") ||
              item.overview.startsWith("No media item could be automatically identified") ||
              item.overview.startsWith("Processing did not finish"))
        )
        .map((item: { id: string }) => item.id);

      if (resetIds.length > 0) {
        await db
          .from("library_items")
          .update({
            verification_status: "unverified",
            overview: "AI is analyzing screenshot details...",
            updated_at: new Date().toISOString(),
          })
          .in("id", resetIds)
          .eq("user_id", user.id);
      }
    }
  }

  // Keep processing alive after the HTTP response on serverless platforms.
  after(async () => {
    try {
      await processJob(id, user.token);
    } catch (err) {
      console.error(`Retry error for job ${id}:`, err);
    }
  });

  return NextResponse.json({
    ...job,
    status: "queued",
  });
}
