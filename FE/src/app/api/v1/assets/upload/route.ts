import { NextRequest, NextResponse, after } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { CVService } from "@/lib/server/cvService";
import { processJob } from "@/lib/server/processJob";
import { uploadImage } from "@/lib/server/storage";
import { withColumnFallback } from "@/lib/server/schemaFallback";
import crypto from "crypto";

// Vercel Hobby caps functions at 60s; the extraction pipeline retries inside
// this budget. Raise this on plans that allow longer executions.
export const maxDuration = 60;

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json(
      { detail: "Unauthorized - Please sign in to upload screenshots" },
      { status: 401 }
    );
  }

  const db = createAuthenticatedClient(user.token);
  const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null;
  const forceReupload = req.nextUrl.searchParams.get("force_reupload") === "true";

  try {
    if (idempotencyKey) {
      const { data: existingByKey, error: keyErr } = await db
        .from("source_assets")
        .select("id, file_name")
        .eq("user_id", user.id)
        .eq("idempotency_key", idempotencyKey)
        .limit(1)
        .maybeSingle();

      if (!keyErr && existingByKey) {
        const [{ data: latestJob }, { data: linkedSource }] = await Promise.all([
          db
            .from("processing_jobs")
            .select("id, status")
            .eq("source_asset_id", existingByKey.id)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          db
            .from("item_sources")
            .select("library_item_id")
            .eq("source_asset_id", existingByKey.id)
            .limit(1)
            .maybeSingle(),
        ]);

        return NextResponse.json({
          assets: [
            {
              asset_id: existingByKey.id,
              file_name: existingByKey.file_name,
              job_id: latestJob?.id || "",
              status: latestJob?.status || "queued",
              is_duplicate: true,
              library_item_id: linkedSource?.library_item_id || null,
            },
          ],
          total_count: 1,
        });
      }
    }

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ detail: "No files uploaded" }, { status: 400 });
    }

    const assetsCreated = [];
    const errors: Array<{ file_name: string; error: string }> = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());

      if (buffer.length === 0) {
        errors.push({ file_name: file.name, error: "File is empty" });
        continue;
      }
      if (buffer.length > MAX_FILE_SIZE_BYTES) {
        errors.push({
          file_name: file.name,
          error: "File exceeds the 15 MB upload limit",
        });
        continue;
      }

      // Content-based validation: never trust the extension or client MIME.
      const mimeType = CVService.detectImageMime(buffer);
      if (!mimeType) {
        errors.push({
          file_name: file.name,
          error: "File is not a supported image (JPEG, PNG, WebP, AVIF, HEIC, GIF, BMP)",
        });
        continue;
      }

      const sha256 = CVService.computeSha256(buffer);

      if (!forceReupload) {
        const { data: existingByHash } = await db
          .from("source_assets")
          .select("id, file_name")
          .eq("user_id", user.id)
          .eq("sha256_hash", sha256)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingByHash) {
          const [{ data: latestJob }, { data: linkedSource }] = await Promise.all([
            db
              .from("processing_jobs")
              .select("id, status")
              .eq("source_asset_id", existingByHash.id)
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
            db
              .from("item_sources")
              .select("library_item_id")
              .eq("source_asset_id", existingByHash.id)
              .limit(1)
              .maybeSingle(),
          ]);

          assetsCreated.push({
            asset_id: existingByHash.id,
            file_name: existingByHash.file_name,
            job_id: latestJob?.id || "",
            status: latestJob?.status || "queued",
            is_duplicate: true,
            library_item_id: linkedSource?.library_item_id || null,
          });
          continue;
        }
      }

      const extension = MIME_EXTENSIONS[mimeType] || "jpg";
      // Object keys are bucket-relative: the bucket itself already scopes
      // files to `screenshots`.
      const storageKey = `${user.id}/${crypto.randomUUID()}.${extension}`;

      const upload = await uploadImage(db, storageKey, buffer, mimeType);
      const finalFilePath = upload.path;

      // Create source asset record with user token to pass RLS
      const assetId = crypto.randomUUID();
      const { error: assetError } = await withColumnFallback(
        {
          id: assetId,
          user_id: user.id,
          file_path: finalFilePath,
          file_name: file.name || `screenshot.${extension}`,
          file_size_bytes: buffer.length,
          mime_type: mimeType,
          sha256_hash: sha256,
          ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
          created_at: new Date().toISOString(),
        },
        (payload) => db.from("source_assets").insert(payload),
        `source_assets insert (${assetId})`
      );

      if (assetError) {
        console.error("[Upload] Asset DB error:", assetError.message);
        errors.push({ file_name: file.name, error: assetError.message });
        continue;
      }

      // Immediately create a placeholder library item so the user sees the
      // upload right away. AI fills in title/link/cover after processing.
      const cleanName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]/g, " ")
        .trim();
      const displayTitle =
        cleanName && !cleanName.toLowerCase().startsWith("screenshot")
          ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
          : "Uploaded Screenshot";

      const initialItemId = crypto.randomUUID();
      const { error: itemError } = await db.from("library_items").insert({
        id: initialItemId,
        user_id: user.id,
        title: displayTitle,
        creator: null,
        content_type: "other",
        consumption_status: "want_to_consume",
        overview: "AI is analyzing screenshot details...",
        // Never store inline base64 here; the media proxy serves the original.
        cover_image_url: null,
        // Nothing has been identified yet. The worker promotes this to
        // needs_review/auto_accepted; claiming "verified" here would show users
        // an AI result as human-confirmed before processing even started.
        verification_status: "unverified",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (itemError) {
        console.error("[Upload] Library item insert failed:", itemError.message);
      } else {
        await db.from("item_sources").insert({
          id: crypto.randomUUID(),
          library_item_id: initialItemId,
          source_asset_id: assetId,
          created_at: new Date().toISOString(),
        });
      }

      // Create processing job record
      const jobId = crypto.randomUUID();
      const { error: jobError } = await db.from("processing_jobs").insert({
        id: jobId,
        user_id: user.id,
        source_asset_id: assetId,
        status: "queued",
        retry_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (jobError) {
        console.error("[Upload] Job insert failed:", jobError.message);
        errors.push({ file_name: file.name, error: jobError.message });
      }

      assetsCreated.push({
        asset_id: assetId,
        file_name: file.name,
        job_id: jobId,
        status: "queued",
        is_duplicate: false,
        library_item_id: itemError ? null : initialItemId,
        storage: upload.storedInBucket ? "bucket" : "inline",
      });

      if (!jobError) {
        // `after` keeps the promise alive after the response is sent, which is
        // required on serverless platforms. processJob records its own failures;
        // this catch only prevents an unhandled rejection in the runtime.
        after(async () => {
          try {
            await processJob(jobId, user.token);
          } catch (err) {
            console.error(`[Upload] Background processing crashed for job ${jobId}:`, err);
          }
        });
      }
    }

    if (assetsCreated.length === 0) {
      return NextResponse.json(
        {
          detail: errors[0]?.error || "No valid images were uploaded",
          errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      assets: assetsCreated,
      total_count: assetsCreated.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: unknown) {
    console.error("Upload handler error:", err);
    return NextResponse.json(
      {
        detail:
          err instanceof Error ? err.message : "Internal upload error",
      },
      { status: 500 }
    );
  }
}
