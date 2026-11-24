import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { buildMediaProxyUrl, redactInlineDataUrls } from "@/lib/server/storage";
import { normalizeContentType, providerUrlFromMetadata, resolveDirectUrl, sanitizeExternalUrl } from "@/lib/server/linkResolver";
import { isContentTypeConstraintError, withColumnFallback } from "@/lib/server/schemaFallback";

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
  const { data: item, error } = await db
    .from("library_items")
    .select("*, item_sources(*, source_assets(*))")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !item) {
    return NextResponse.json({ detail: "Library item not found" }, { status: 404 });
  }

  const sources = await Promise.all(
    (item.item_sources || []).map(
      async (sourceRel: { source_assets?: Record<string, unknown> | null; crop_coordinates?: unknown }) => {
        const asset = sourceRel.source_assets as
          | {
              id: string;
              file_name?: string;
              file_path?: string;
              file_size_bytes?: number;
              mime_type?: string;
              sha256_hash?: string;
              image_width?: number;
              image_height?: number;
              created_at?: string;
            }
          | null
          | undefined;
        if (!asset) return null;

        return {
          id: asset.id,
          file_name: asset.file_name,
          file_path: asset.file_path,
          file_size_bytes: asset.file_size_bytes,
          mime_type: asset.mime_type,
          sha256_hash: asset.sha256_hash,
          image_width: asset.image_width,
          image_height: asset.image_height,
          signed_url: buildMediaProxyUrl(asset.id, "original"),
          crop_coordinates: sourceRel.crop_coordinates,
          created_at: asset.created_at,
        };
      }
    )
  );

  const contentType = normalizeContentType(item.content_type);
  const providerMetadata = (item.provider_metadata || {}) as Record<string, unknown>;
  const mediamind = providerMetadata._mediamind as
    | { subcategory?: string | null; direct_url?: string | null }
    | undefined;
  const directUrl =
    item.direct_url ||
    resolveDirectUrl({
      title: item.title,
      creator: item.creator,
      contentType,
      releaseYear: item.release_year,
      providerUrl: mediamind?.direct_url || providerUrlFromMetadata(providerMetadata),
      providerName: item.external_provider,
      externalId: item.external_id,
    });

  return NextResponse.json(
    redactInlineDataUrls({
      ...item,
      content_type: contentType,
      subcategory: item.subcategory ?? mediamind?.subcategory ?? null,
      direct_url: directUrl,
      sources: (sources || []).filter(Boolean),
    })
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const { id } = await params;
  try {
    const body = await req.json();

    // Only metadata fields are user-editable. Ownership, ids, timestamps and
    // provider identifiers must never be reassigned through this endpoint.
    const allowedFields = [
      "title",
      "original_title",
      "creator",
      "content_type",
      "subcategory",
      "direct_url",
      "release_year",
      "overview",
      "cover_image_url",
      "consumption_status",
      "verification_status",
      "genre",
      "isbn",
      "language",
      "publisher",
      "runtime_minutes",
      "total_seasons",
      "total_episodes",
      "user_rating",
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { detail: "No editable fields were provided" },
        { status: 400 }
      );
    }
    if (typeof updates.direct_url === "string") {
      updates.direct_url = sanitizeExternalUrl(updates.direct_url) || null;
    }
    if (typeof updates.content_type === "string") {
      updates.content_type = normalizeContentType(updates.content_type);
    }
    if (typeof updates.verification_status === "string") {
      const allowedStatuses = ["verified", "manual_entry", "auto_accepted", "needs_review"];
      if (!allowedStatuses.includes(updates.verification_status)) {
        return NextResponse.json(
          { detail: "verification_status is not a valid state" },
          { status: 400 }
        );
      }
    }

    let patchPayload: Record<string, unknown> = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const write = () =>
      withColumnFallback(
        patchPayload,
        (candidatePayload) =>
          db
            .from("library_items")
            .update(candidatePayload)
            .eq("id", id)
            .eq("user_id", user.id)
            .select("*, item_sources(*, source_assets(id))")
            .single(),
        `library_items update (item ${id})`
      );

    let result = await write();
    if (result.error && isContentTypeConstraintError(result.error)) {
      console.warn(
        "[Library] content_type is not allowed by this database; storing as 'other'. " +
          "Apply migrations/007_add_article_and_newsletter_types.sql."
      );
      patchPayload = { ...patchPayload, content_type: "other" };
      result = await write();
    }

    if (result.error) {
      return NextResponse.json({ detail: result.error.message }, { status: 500 });
    }

    const updated = result.data as Record<string, unknown> & {
      title?: string;
      creator?: string | null;
      content_type?: string | null;
      subcategory?: string | null;
      direct_url?: string | null;
      release_year?: number | null;
      external_provider?: string | null;
      external_id?: string | null;
      provider_metadata?: Record<string, unknown> | null;
      item_sources?: Array<{ source_assets?: { id?: string } | null }>;
    };
    const firstSourceId = updated.item_sources?.[0]?.source_assets?.id;
    const screenshotUrl = firstSourceId
      ? buildMediaProxyUrl(firstSourceId, "original")
      : null;
    const contentType = normalizeContentType(updated.content_type);
    const providerMetadata = (updated.provider_metadata || {}) as Record<string, unknown>;
    const mediamind = providerMetadata._mediamind as
      | { subcategory?: string | null; direct_url?: string | null }
      | undefined;
    const directUrl =
      updated.direct_url ||
      resolveDirectUrl({
        title: updated.title || "media",
        creator: updated.creator,
        contentType,
        releaseYear: updated.release_year,
        providerUrl: mediamind?.direct_url || providerUrlFromMetadata(providerMetadata),
        providerName: updated.external_provider,
        externalId: updated.external_id,
      });

    return NextResponse.json({
      ...updated,
      content_type: contentType,
      subcategory: updated.subcategory ?? mediamind?.subcategory ?? null,
      direct_url: directUrl,
      screenshot_url: screenshotUrl,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Update failed" },
      { status: 400 }
    );
  }
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
    .from("library_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Item deleted" });
}
