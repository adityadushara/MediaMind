import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabaseAdmin";

/**
 * Storage helpers.
 *
 * The app must keep working when the private Supabase Storage bucket has not
 * been provisioned yet. Originals are still preserved (inline fallback), but
 * API responses should reference the media proxy rather than embedding
 * multi-megabyte base64 strings in JSON.
 */

export function getStorageBucket(): string {
  const configured = (process.env.SUPABASE_STORAGE_BUCKET || "screenshots").trim();
  return configured.replace(/^["']|["']$/g, "") || "screenshots";
}

function hasPrivilegedKey(): boolean {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    "";
  const trimmed = key.trim();
  return trimmed.length > 20 && !trimmed.toLowerCase().includes("placeholder");
}

/**
 * Storage writes need a privileged client. The caller's client is created
 * with the anon key plus a user JWT, and the private `screenshots` bucket has
 * no permissive insert policy, so uploads through it return 403. When a
 * service-role key is configured, use the admin client for bucket
 * provisioning and object writes; otherwise fall back to the caller's client
 * (which works when storage RLS policies are configured).
 */
export function getStorageClient(fallback: SupabaseClient): SupabaseClient {
  if (!hasPrivilegedKey()) return fallback;
  try {
    return getSupabaseAdmin();
  } catch {
    return fallback;
  }
}

let bucketState: "unknown" | "ready" | "missing" = "unknown";
let bucketInitPromise: Promise<boolean> | null = null;

/**
 * Verifies the bucket exists. When a server-side secret key is configured it
 * also creates the bucket automatically. Results are cached per process.
 */
export async function ensureStorageBucket(db: SupabaseClient): Promise<boolean> {
  if (bucketState === "ready") return true;
  if (bucketState === "missing") return false;
  if (bucketInitPromise) return bucketInitPromise;

  bucketInitPromise = (async () => {
    const bucket = getStorageBucket();
    const client = getStorageClient(db);
    try {
      const { data, error } = await client.storage.getBucket(bucket);
      if (!error && data) {
        bucketState = "ready";
        return true;
      }

      const message = (error?.message || "").toLowerCase();
      const notFound =
        message.includes("not found") ||
        message.includes("does not exist") ||
        message.includes("bucket not found");

      if (notFound && hasPrivilegedKey()) {
        const { error: createError } = await client.storage.createBucket(bucket, {
          public: false,
          fileSizeLimit: 15 * 1024 * 1024,
        });
        if (!createError) {
          console.info(`[Storage] Created private bucket '${bucket}'.`);
          bucketState = "ready";
          return true;
        }
        console.warn(
          `[Storage] Could not create bucket '${bucket}': ${createError.message}`
        );
      }

      console.warn(
        `[Storage] Bucket '${bucket}' is unavailable (${error?.message || "not found"}). ` +
          "Screenshots will be preserved inline. Create the bucket in Supabase Storage, " +
          "or configure SUPABASE_SERVICE_ROLE_KEY so MediaMind can create it automatically."
      );
      bucketState = "missing";
      return false;
    } catch (err) {
      console.warn(`[Storage] Bucket check failed: ${String(err)}`);
      bucketState = "missing";
      return false;
    }
  })().finally(() => {
    bucketInitPromise = null;
  });

  return bucketInitPromise;
}

export interface StorageUploadResult {
  /** Storage object path, or an inline data URL when storage is unavailable. */
  path: string;
  storedInBucket: boolean;
}

export async function uploadImage(
  db: SupabaseClient,
  objectPath: string,
  buffer: Buffer,
  contentType: string
): Promise<StorageUploadResult> {
  const bucket = getStorageBucket();
  const client = getStorageClient(db);
  const available = await ensureStorageBucket(db);

  if (available) {
    const { error } = await client.storage.from(bucket).upload(objectPath, buffer, {
      contentType,
      upsert: true,
    });
    if (!error) {
      return { path: objectPath, storedInBucket: true };
    }
    console.warn(`[Storage] Upload failed for '${objectPath}': ${error.message}`);
  }

  // Preserve evidence inline rather than losing the screenshot.
  return {
    path: `data:${contentType};base64,${buffer.toString("base64")}`,
    storedInBucket: false,
  };
}

/**
 * Storage object paths are bucket-relative, but rows written before the fix
 * stored the bucket name in the path too (`screenshots/<uid>/<file>.png`).
 * Strip that duplicate prefix so old and new rows both resolve.
 */
export function normalizeStoragePath(
  objectPath: string,
  bucket = getStorageBucket()
): string {
  const prefix = `${bucket}/`;
  return objectPath.startsWith(prefix) ? objectPath.slice(prefix.length) : objectPath;
}

export function isInlineDataUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("data:");
}

/**
 * Replaces inline base64 image payloads with `null` anywhere in an API
 * response.
 *
 * When the private bucket is unavailable, `uploadImage` preserves the original
 * as a `data:` URL in `source_assets.file_path`. Those columns are `select(*)`-ed
 * into list responses (library items, jobs, screenshots), so one 1 MB phone
 * screenshot became ~1.4 MB of base64 inside every list payload, on every
 * dashboard poll. Responses reference the authenticated media proxy instead.
 */
export function redactInlineDataUrls<T>(value: T): T {
  if (typeof value === "string") {
    return (isInlineDataUrl(value) ? null : value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactInlineDataUrls(entry)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      redacted[key] = redactInlineDataUrls(entry);
    }
    return redacted as T;
  }
  return value;
}

export function parseDataUrl(
  value: string
): { mimeType: string; buffer: Buffer } | null {
  if (!isInlineDataUrl(value)) return null;
  const match = value.match(/^data:([a-zA-Z0-9.+/-]+);base64,([\s\S]+)$/);
  if (!match) return null;
  const mimeType = match[1];
  if (!mimeType.startsWith("image/")) return null;
  try {
    return { mimeType, buffer: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}

export function buildMediaProxyUrl(
  assetId: string,
  kind: "original" | "crop" = "original",
  derivativeId?: string | null
): string {
  const params = new URLSearchParams({ kind });
  if (derivativeId) params.set("derivative_id", derivativeId);
  return `/api/v1/assets/media/${assetId}?${params.toString()}`;
}
