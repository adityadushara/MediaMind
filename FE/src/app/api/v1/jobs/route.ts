import { NextRequest, NextResponse, after } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { processJob } from "@/lib/server/processJob";
import { redactInlineDataUrls } from "@/lib/server/storage";

/**
 * A serverless run has at most 60s. If a worker is killed before it can
 * update the job (cold start, provider timeout, platform limit), the job stays
 * "processing" forever and the UI offers no retry. Recover such jobs when the
 * list is read so the user can retry instead of being stuck.
 */
const STALE_PROCESSING_MS = 3 * 60 * 1000;
const STALE_MESSAGE =
  "Processing did not finish within the server time limit. Retry to run it again; the original screenshot is preserved.";

/**
 * Jobs that failed for a reason another run can plausibly clear are retried
 * automatically: a retired model (for example the former `gemini-2.5-flash`
 * 404), or a provider blip (quota, rate limit, high demand, timeout).
 * Bounded by the job's retry budget so a permanent failure cannot loop.
 */
const RETRYABLE_FAILURE_PATTERN =
  /no longer available|models\/gemini-2\.\d|unsupported model|temporarily unavailable|high demand|rate limit|quota|overloaded|timed out|timeout|503|429/i;

interface JobRow {
  id: string;
  source_asset_id?: string | null;
  status?: string | null;
  updated_at?: string | null;
  error_message?: string | null;
  retry_count?: number | null;
  max_retries?: number | null;
}

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let query = db
    .from("processing_jobs")
    .select("*, source_assets(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data: jobs, error } = await query;
  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  const now = Date.now();
  const rows = (jobs || []) as JobRow[];
  const timestamp = new Date().toISOString();

  const stale = rows.filter(
    (job) =>
      job.status === "processing" &&
      job.updated_at &&
      now - new Date(job.updated_at).getTime() > STALE_PROCESSING_MS
  );

  if (stale.length > 0) {
    await Promise.all(
      stale.map((job) =>
        db
          .from("processing_jobs")
          .update({
            status: "failed",
            error_message: STALE_MESSAGE,
            updated_at: timestamp,
          })
          .eq("id", job.id)
          .eq("user_id", user.id)
      )
    );

    const staleAssetIds = stale
      .map((job) => job.source_asset_id)
      .filter((assetId): assetId is string => Boolean(assetId));
    if (staleAssetIds.length > 0) {
      const { data: links } = await db
        .from("item_sources")
        .select("library_item_id")
        .in("source_asset_id", staleAssetIds);
      const itemIds = (links || [])
        .map((row: { library_item_id?: string | null }) => row.library_item_id)
        .filter((itemId): itemId is string => Boolean(itemId));
      if (itemIds.length > 0) {
        await db
          .from("library_items")
          .update({
            verification_status: "needs_review",
            overview: STALE_MESSAGE,
            updated_at: timestamp,
          })
          .in("id", itemIds)
          .eq("user_id", user.id)
          .eq("verification_status", "unverified");
      }
    }
  }

  const retryable = rows.filter(
    (job) =>
      job.status === "failed" &&
      RETRYABLE_FAILURE_PATTERN.test(job.error_message || "") &&
      (job.retry_count || 0) < (job.max_retries || 3)
  );

  if (retryable.length > 0) {
    await Promise.all(
      retryable.map((job) =>
        db
          .from("processing_jobs")
          .update({
            status: "queued",
            retry_count: (job.retry_count || 0) + 1,
            error_message: null,
            updated_at: timestamp,
          })
          .eq("id", job.id)
          .eq("user_id", user.id)
      )
    );

    after(async () => {
      for (const job of retryable) {
        try {
          await processJob(job.id, user.token);
        } catch (err) {
          console.error(`Auto-retry error for job ${job.id}:`, err);
        }
      }
    });
  }

  const staleIds = new Set(stale.map((job) => job.id));
  const retryIds = new Set(retryable.map((job) => job.id));
  const normalized = rows.map((job) => {
    if (staleIds.has(job.id)) {
      return { ...job, status: "failed", error_message: STALE_MESSAGE };
    }
    if (retryIds.has(job.id)) {
      return { ...job, status: "queued", error_message: null };
    }
    return job;
  });

  return NextResponse.json(redactInlineDataUrls(normalized));
}
