import { createAuthenticatedClient } from "./supabaseAdmin";
import { CVService } from "./cvService";
import { GeminiService, ExtractedCandidate } from "./geminiService";
import { MetadataRouter, NormalizedMetadataResult } from "./metadataRouter";
import { resolveDirectUrl } from "./linkResolver";
import {
  ensureStorageBucket,
  getStorageClient,
  isInlineDataUrl,
  normalizeStoragePath,
  parseDataUrl,
  uploadImage,
} from "./storage";
import {
  isContentTypeConstraintError,
  withColumnFallback,
} from "./schemaFallback";
import crypto from "crypto";

interface JobAsset {
  id: string;
  file_path: string | null;
  mime_type?: string | null;
  file_name?: string | null;
}

interface ProcessingJobRow {
  id: string;
  user_id: string;
  source_asset_id: string;
  retry_count?: number | null;
  max_retries?: number | null;
  source_assets?: JobAsset | JobAsset[] | null;
}

function getAsset(job: ProcessingJobRow): JobAsset | null {
  const asset = job.source_assets;
  if (!asset) return null;
  return Array.isArray(asset) ? asset[0] || null : asset;
}

type ProcessingFailureCategory =
  | "ai_config"
  | "ai_provider"
  | "storage"
  | "processing";

interface ProcessingFailure {
  category: ProcessingFailureCategory;
  /** Written to the user-visible job and item fields. */
  message: string;
}

/**
 * Auth/config rejections are permanent until a human replaces the key, so they
 * must not be reported (or retried) as a provider outage.
 */
const AUTH_FAILURE_PATTERN =
  /api key not valid|api_key_invalid|unauthenticated|invalid api key|permission_denied|access_token_type_unsupported/i;

/** The fallback ladder prints every model it tried; keep only the real cause. */
function lastProviderReason(raw: string): string {
  const tail = raw.split(/Last error:/i).pop()?.trim() || raw;
  return tail.length > 180 ? `${tail.slice(0, 177)}…` : tail;
}

function describeProcessingFailure(raw: string): ProcessingFailure {
  if (raw.includes("GEMINI_API_KEY")) {
    return {
      category: "ai_config",
      message:
        "AI is not configured: GEMINI_API_KEY is missing on the server. Add a valid key and retry.",
    };
  }
  if (AUTH_FAILURE_PATTERN.test(raw)) {
    return {
      category: "ai_config",
      message:
        "The AI provider rejected the configured API key. Replace GEMINI_API_KEY with a valid key and retry; this is not a temporary outage.",
    };
  }
  if (/quota|rate limit|high demand|overloaded/i.test(raw)) {
    return {
      category: "ai_provider",
      message: `The AI provider is rate limited right now. Retry in a moment. (${lastProviderReason(raw)})`,
    };
  }
  if (raw.includes("All Gemini models failed")) {
    return {
      category: "ai_provider",
      message: `The AI provider is temporarily unavailable. ${lastProviderReason(raw)}`,
    };
  }
  if (/Could not download|corrupt|unsupported image/i.test(raw)) {
    return { category: "storage", message: raw };
  }
  return { category: "processing", message: raw };
}

function estimateCostUsd(tokens: number): number {
  // Gemini 3.5 Flash standard tier is roughly $0.30 / 1M input tokens.
  // This is a conservative estimate for observability only.
  return Number(((tokens / 1_000_000) * 0.3).toFixed(6));
}

async function resolveUnverifiedPlaceholders(
  db: ReturnType<typeof createAuthenticatedClient>,
  userId: string,
  assetId: string,
  overviewMessage: string
): Promise<void> {
  try {
    const { data: links } = await db
      .from("item_sources")
      .select("library_item_id")
      .eq("source_asset_id", assetId);

    const itemIds = (links || [])
      .map((row: { library_item_id?: string | null }) => row.library_item_id)
      .filter((id): id is string => Boolean(id));

    if (itemIds.length === 0) return;

    const now = new Date().toISOString();
    const { error } = await db
      .from("library_items")
      .update({
        verification_status: "needs_review",
        overview: overviewMessage,
        updated_at: now,
      })
      .in("id", itemIds)
      .eq("user_id", userId)
      .eq("verification_status", "unverified");

    if (
      error &&
      (error.message.toLowerCase().includes("verification_status") ||
        error.message.toLowerCase().includes("check constraint"))
    ) {
      await db
        .from("library_items")
        .update({
          verification_status: "manual_entry",
          overview: overviewMessage,
          updated_at: now,
        })
        .in("id", itemIds)
        .eq("user_id", userId)
        .eq("verification_status", "unverified");
    }
  } catch (err) {
    console.warn("[Worker] Could not update placeholder library items:", err);
  }
}

export async function processJob(jobId: string, userToken?: string): Promise<void> {
  const startTime = Date.now();
  const db = createAuthenticatedClient(userToken);

  // 1. Fetch job
  const { data: rawJob, error: jobError } = await db
    .from("processing_jobs")
    .select("*, source_assets(*)")
    .eq("id", jobId)
    .single();

  const job = rawJob as ProcessingJobRow | null;

  if (jobError || !job) {
    console.error(`[Worker] Job ${jobId} not found:`, jobError);
    return;
  }

  // Update status to processing
  await db
    .from("processing_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  const asset = getAsset(job);
  if (!asset) {
    await db
      .from("processing_jobs")
      .update({
        status: "failed",
        error_message: "Linked source asset missing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return;
  }

  const runId = crypto.randomUUID();
  let extractionModel = "unknown";
  let promptVersion = "unknown";

  try {
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "screenshots";
    let fileBuffer: Buffer;

    // 2. Load original image (inline data URL, storage, or local fallback)
    if (isInlineDataUrl(asset.file_path)) {
      const parsed = parseDataUrl(asset.file_path || "");
      if (!parsed) {
        throw new Error("Stored screenshot data is corrupt or not a supported image.");
      }
      fileBuffer = parsed.buffer;
    } else if (asset.file_path) {
      const storage = getStorageClient(db);
      const { data: fileData, error: downloadError } = await storage.storage
        .from(bucket)
        .download(normalizeStoragePath(asset.file_path, bucket));

      if (!downloadError && fileData) {
        fileBuffer = Buffer.from(await fileData.arrayBuffer());
      } else {
        throw new Error(
          `Could not download the original screenshot from storage (${downloadError?.message || "not found"}). ` +
            "Create the Supabase Storage bucket or re-upload the screenshot."
        );
      }
    } else {
      throw new Error("Source asset has no file path.");
    }

    // 3. Computer Vision normalization
    const { orientedBuffer, metadata } = await CVService.loadAndOrientImage(fileBuffer);

    await db
      .from("source_assets")
      .update({
        image_width: metadata.oriented_width,
        image_height: metadata.oriented_height,
      })
      .eq("id", asset.id);

    // 4. Gemini extraction
    const extraction = await GeminiService.extractMediaFromImage(orientedBuffer);
    extractionModel = extraction.model_name;
    promptVersion = extraction.prompt_version;

    // Always record an observability run (AI evaluation discipline).
    await db.from("processing_runs").insert({
      id: runId,
      job_id: jobId,
      user_id: job.user_id,
      source_asset_id: asset.id,
      prompt_identifier: "gemini_multimodal_extraction",
      prompt_version: extraction.prompt_version,
      ai_model_name: extraction.model_name,
      status: "completed",
      processing_duration_ms: extraction.duration_ms,
      prompt_tokens: extraction.token_usage?.prompt_tokens ?? null,
      candidate_tokens: extraction.token_usage?.candidate_tokens ?? null,
      total_tokens: extraction.token_usage?.total_tokens ?? null,
      estimated_cost_usd: estimateCostUsd(extraction.token_usage?.total_tokens ?? 0),
      candidate_count: extraction.candidates.length,
      raw_response: { candidates: extraction.candidates },
      created_at: new Date().toISOString(),
    });

    if (!extraction.candidates || extraction.candidates.length === 0) {
      await resolveUnverifiedPlaceholders(
        db,
        job.user_id,
        asset.id,
        "No media item could be automatically identified from this screenshot. Edit details manually or inspect the original screenshot."
      );
      await db
        .from("processing_jobs")
        .update({
          status: "unidentified",
          ai_model_name: extraction.model_name,
          prompt_version: extraction.prompt_version,
          processing_time_ms: Date.now() - startTime,
          token_usage: extraction.token_usage,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return;
    }

    // Check if there is an existing library item linked to this asset from upload
    const { data: existingSources } = await db
      .from("item_sources")
      .select("library_item_id")
      .eq("source_asset_id", asset.id);

    const initialItemId = existingSources?.[0]?.library_item_id || null;

    // A person's own decision outranks the model's. When this screenshot is
    // already attached to an item the user verified or entered by hand, the
    // AI result must never rewrite their title, creator, or verification; the
    // new result is kept as a candidate instead.
    let humanDecidedItem = false;
    if (initialItemId) {
      const { data: existingItem } = await db
        .from("library_items")
        .select("verification_status")
        .eq("id", initialItemId)
        .eq("user_id", job.user_id)
        .maybeSingle();
      const existingStatus = existingItem?.verification_status as string | undefined;
      humanDecidedItem = existingStatus === "verified" || existingStatus === "manual_entry";
    }

    let hasNeedsReview = false;
    let isFirstCandidate = true;

    // Storage availability only matters for derivative crops; originals are
    // already persisted by the upload route.
    const storageAvailable = await ensureStorageBucket(db);

    // 5. Process each candidate
    for (const candidate of extraction.candidates as ExtractedCandidate[]) {
      let derivativeId: string | null = null;

      // Crop derivative if bounding box is valid
      if (candidate.bounding_box && CVService.validateBoundingBox(candidate.bounding_box)) {
        try {
          const { cropBuffer, width, height } = await CVService.generateCrop(
            orientedBuffer,
            candidate.bounding_box
          );

          const cropKey = `derivatives/${crypto.randomUUID()}.jpg`;
          const upload = storageAvailable
            ? await uploadImage(db, cropKey, cropBuffer, "image/jpeg")
            : {
                path: `data:image/jpeg;base64,${cropBuffer.toString("base64")}`,
                storedInBucket: false,
              };

          const derivativeRowId = crypto.randomUUID();
          const { error: derivError } = await db.from("image_derivatives").insert({
            id: derivativeRowId,
            user_id: job.user_id,
            source_asset_id: asset.id,
            run_id: runId,
            storage_path: upload.path,
            file_name: candidate.title
              ? `${candidate.title.slice(0, 30)}_crop.jpg`
              : "crop.jpg",
            file_size_bytes: cropBuffer.length,
            mime_type: "image/jpeg",
            derivative_type: "region_crop",
            image_width: width,
            image_height: height,
            bounding_box: candidate.bounding_box,
            processing_version: promptVersion,
            created_at: new Date().toISOString(),
          });

          if (derivError) {
            console.warn("[Worker] Derivative insert failed:", derivError.message);
          } else {
            derivativeId = derivativeRowId;
          }
        } catch (cropErr) {
          console.warn("[Worker] Crop generation failed:", cropErr);
        }
      }

      // External Metadata Enrichment (best effort)
      let meta: NormalizedMetadataResult | null = null;
      try {
        meta = await MetadataRouter.search({
          title: candidate.title,
          creator: candidate.creator,
          content_type: candidate.content_type,
          release_year: candidate.release_year,
        });
      } catch (metaErr) {
        console.warn("[Worker] Metadata lookup failed:", metaErr);
      }

      const finalTitle = meta?.title || candidate.title;
      const finalCreator = meta?.creator || candidate.creator;
      const finalYear = meta?.release_year || candidate.release_year;
      const finalOverview = meta?.overview || null;
      const finalCoverUrl = meta?.cover_image_url || null;

      const finalDirectUrl = resolveDirectUrl({
        title: finalTitle,
        creator: finalCreator,
        contentType: candidate.content_type,
        releaseYear: finalYear,
        extractedUrl: candidate.direct_url,
        providerUrl: meta?.direct_url,
        providerName: meta?.provider_name,
        externalId: meta?.external_id,
      });

      const shouldAutoAccept =
        !humanDecidedItem &&
        candidate.confidence >= 0.85 &&
        extraction.candidates.length === 1 &&
        Boolean(finalDirectUrl);

      const reviewStatus = shouldAutoAccept ? "auto_accepted" : "needs_review";
      if (reviewStatus === "needs_review") {
        hasNeedsReview = true;
      }

      // Insert candidate record. Optional columns from later migrations
      // (direct_url, suggested_subcategory) may be absent on older databases;
      // retry without them instead of losing the candidate.
      const candidateId = crypto.randomUUID();
      const { error: candidateError } = await withColumnFallback(
        {
          id: candidateId,
          job_id: jobId,
          source_asset_id: asset.id,
          user_id: job.user_id,
          run_id: runId,
          suggested_title: finalTitle,
          suggested_creator: finalCreator,
          suggested_type: candidate.content_type,
          suggested_subcategory: candidate.subcategory,
          direct_url: finalDirectUrl,
          description_clue: finalOverview,
          year_clue: finalYear,
          confidence_score: candidate.confidence,
          evidence_text: candidate.visual_evidence,
          bounding_box: candidate.bounding_box,
          uncertainty_reasons: candidate.uncertainty_reasons || [],
          // Candidate rows store provider matches in `provider_candidates`
          // (see migrations/001 + 003). Columns such as provider_metadata only
          // exist on library_items; sending them here fails the whole insert.
          provider_candidates: meta
            ? [
                {
                  provider_name: meta.provider_name,
                  external_id: meta.external_id,
                  raw_payload: meta.raw_metadata || {},
                  suggested_subcategory: candidate.subcategory || null,
                  direct_url: finalDirectUrl || null,
                },
              ]
            : [
                {
                  suggested_subcategory: candidate.subcategory || null,
                  direct_url: finalDirectUrl || null,
                },
              ],
          derivative_id: derivativeId,
          review_status: reviewStatus,
          resolution_status: "pending",
          created_at: new Date().toISOString(),
        },
        (payload) => db.from("identification_candidates").insert(payload),
        `identification_candidates insert (job ${jobId})`
      );

      if (candidateError) {
        console.warn(`[Worker] Candidate insert failed: ${candidateError.message}`);
      }

      // Build the library item update payload.
      //
      // Optional columns from migrations 005/006 may not exist on older
      // databases. `withColumnFallback` drops absent optional columns and
      // retries, so AI metadata is never discarded silently.
      let itemPayload: Record<string, unknown> = {
        title: finalTitle,
        creator: finalCreator,
        content_type: candidate.content_type,
        subcategory: candidate.subcategory,
        direct_url: finalDirectUrl,
        release_year: finalYear,
        overview: finalOverview,
        cover_image_url: finalCoverUrl,
        external_provider: meta?.provider_name || null,
        external_id: meta?.external_id || null,
        // Preserve the AI fields inside JSONB too. Older databases may not
        // have the dedicated subcategory/direct_url columns yet.
        provider_metadata: {
          ...(meta?.raw_metadata || {}),
          _mediamind: {
            subcategory: candidate.subcategory || null,
            direct_url: finalDirectUrl || null,
          },
        },
        updated_at: new Date().toISOString(),
      };

      const applyWithFallbacks = async (
        operation: (payload: Record<string, unknown>) => PromiseLike<{
          error: { message: string } | null;
        }>,
        label: string,
        extra: Record<string, unknown> = {}
      ): Promise<boolean> => {
        const preferred = shouldAutoAccept ? "auto_accepted" : "needs_review";

        const write = (verificationStatus: string) =>
          withColumnFallback(
            { ...itemPayload, ...extra, verification_status: verificationStatus },
            operation,
            label
          );

        let result = await write(preferred);
        if (!result.error) return true;

        // Older content_type CHECK constraints reject article/newsletter.
        if (isContentTypeConstraintError(result.error)) {
          console.warn(
            `[Worker] ${label}: content_type '${itemPayload.content_type}' is not allowed ` +
              "by this database. Storing as 'other'. Apply migrations/007_add_article_and_newsletter_types.sql."
          );
          itemPayload = { ...itemPayload, content_type: "other" };
          result = await write(preferred);
          if (!result.error) return true;
        }

        const message = result.error.message || "";
        const isVerificationConstraint =
          message.toLowerCase().includes("verification_status") ||
          message.toLowerCase().includes("check constraint");

        if (isVerificationConstraint) {
          console.warn(
            "[Worker] verification_status constraint is outdated; retrying without 'needs_review'. " +
              "Apply migrations/009_fix_verification_status_and_storage.sql."
          );
          const retry = await write("auto_accepted");
          if (!retry.error) return true;
          console.error(`[Worker] ${label} failed:`, retry.error.message);
          return false;
        }

        console.error(`[Worker] ${label} failed:`, message);
        return false;
      };

      let targetItemId = initialItemId;

      if (isFirstCandidate && initialItemId && humanDecidedItem) {
        // Verified or hand-entered by the person: leave the record exactly as
        // they left it. The model's finding waits in identification_candidates
        // so nothing it saw is lost.
        targetItemId = initialItemId;
        hasNeedsReview = true;
        console.info(
          `[Worker] Item ${initialItemId} was confirmed by the user; kept their fields and recorded the AI result as a candidate.`
        );
      } else if (isFirstCandidate && initialItemId) {
        // A re-upload of the same title must merge into the existing record:
        // migration 006 enforces a unique (user_id, external_provider,
        // external_id) index, so updating this placeholder with an identifier
        // that another item already owns would fail.
        let updateItemId = initialItemId;
        const providerName =
          typeof itemPayload.external_provider === "string"
            ? itemPayload.external_provider
            : null;
        const externalId =
          typeof itemPayload.external_id === "string"
            ? itemPayload.external_id
            : null;

        if (providerName && externalId) {
          const { data: duplicate } = await db
            .from("library_items")
            .select("id")
            .eq("user_id", job.user_id)
            .eq("external_provider", providerName)
            .eq("external_id", externalId)
            .neq("id", initialItemId)
            .maybeSingle();
          if (duplicate?.id) {
            updateItemId = duplicate.id;
          }
        }

        const updated = await applyWithFallbacks(
          (payload) =>
            db.from("library_items").update(payload).eq("id", updateItemId),
          `library_items update (item ${updateItemId})`
        );

        if (updated && updateItemId !== initialItemId) {
          // Move the preserved screenshot to the canonical item, then drop
          // the placeholder if nothing else references it.
          await db
            .from("item_sources")
            .update({ library_item_id: updateItemId })
            .eq("source_asset_id", asset.id)
            .eq("library_item_id", initialItemId);

          const { count } = await db
            .from("item_sources")
            .select("id", { count: "exact", head: true })
            .eq("library_item_id", initialItemId);

          if (!count) {
            await db
              .from("library_items")
              .delete()
              .eq("id", initialItemId)
              .eq("user_id", job.user_id);
          }
          targetItemId = updateItemId;
        }
      } else {
        targetItemId = crypto.randomUUID();
        const inserted = await applyWithFallbacks(
          (payload) => db.from("library_items").insert(payload),
          `library_items insert (item ${targetItemId})`,
          {
            id: targetItemId,
            user_id: job.user_id,
            consumption_status: "want_to_consume",
            created_at: new Date().toISOString(),
          }
        );

        if (!inserted) {
          targetItemId = null;
        } else {
          const { error: linkError } = await db.from("item_sources").insert({
            id: crypto.randomUUID(),
            library_item_id: targetItemId,
            source_asset_id: asset.id,
            crop_coordinates: candidate.bounding_box,
            created_at: new Date().toISOString(),
          });
          if (linkError) {
            console.warn("[Worker] Source link insert failed:", linkError.message);
          }
        }
      }

      isFirstCandidate = false;

      // Generate RAG embeddings (best effort). Skip when the job is close to
      // the serverless execution limit; embeddings can be regenerated later
      // and are never required for identification or the direct link.
      if (targetItemId && Date.now() - startTime < 42_000) {
        try {
          const embText = `${finalTitle} by ${finalCreator || "Unknown"}. ${
            candidate.content_type
          } in ${candidate.subcategory || "General"}. ${finalOverview || ""}`.trim();
          const embedding = await GeminiService.generateEmbedding(embText);
          if (embedding.length > 0) {
            const { error: embError } = await db.from("item_embeddings").insert({
              id: crypto.randomUUID(),
              user_id: job.user_id,
              library_item_id: targetItemId,
              embedding_source: "metadata",
              embedding,
              content_chunk: embText,
              created_at: new Date().toISOString(),
            });
            if (embError) {
              console.warn("[Worker] Embedding insert failed:", embError.message);
            }
          }
        } catch (embErr) {
          console.warn(
            "[Worker] Embedding generation skipped:",
            embErr instanceof Error ? embErr.message : embErr
          );
        }
      }
    }

    const finalStatus = hasNeedsReview ? "needs_review" : "identified";

    await db
      .from("processing_jobs")
      .update({
        status: finalStatus,
        ai_model_name: extraction.model_name,
        prompt_version: extraction.prompt_version,
        processing_time_ms: Date.now() - startTime,
        token_usage: extraction.token_usage,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Worker] Failed processing job ${jobId}:`, err);

    const retryCount = job.retry_count || 0;
    const maxRetries = job.max_retries || 3;
    const canRetry = retryCount < maxRetries;

    const failure = describeProcessingFailure(message);
    const friendlyMessage = failure.message;

    // Record the failed run for observability.
    try {
      await db.from("processing_runs").insert({
        id: runId,
        job_id: jobId,
        user_id: job.user_id,
        source_asset_id: asset.id,
        prompt_identifier: "gemini_multimodal_extraction",
        prompt_version: promptVersion,
        ai_model_name: extractionModel,
        status: "failed",
        processing_duration_ms: Date.now() - startTime,
        error_category: failure.category,
        error_message: message,
        created_at: new Date().toISOString(),
      });
    } catch (runErr) {
      console.warn("[Worker] Could not record failed run:", runErr);
    }

    await resolveUnverifiedPlaceholders(
      db,
      job.user_id,
      asset.id,
      `AI extraction failed: ${friendlyMessage}`
    );

    await db
      .from("processing_jobs")
      .update({
        status: "failed",
        // A config error cannot clear itself, so only a retryable failure
        // offers the automatic retry the job list performs on read.
        error_message:
          canRetry && failure.category !== "ai_config"
            ? `${friendlyMessage} Retrying automatically (${retryCount + 1} of ${maxRetries}).`
            : friendlyMessage,
        retry_count: retryCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}
