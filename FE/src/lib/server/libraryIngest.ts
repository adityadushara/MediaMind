import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GeminiService } from "./geminiService";
import { normalizeContentType, providerUrlFromMetadata, resolveDirectUrl, sanitizeExternalUrl } from "./linkResolver";
import { isContentTypeConstraintError, withColumnFallback } from "./schemaFallback";

export interface ProviderCandidate {
  provider_name?: string | null;
  external_id?: string | null;
  raw_payload?: Record<string, unknown> | null;
  suggested_subcategory?: string | null;
  direct_url?: string | null;
}

export interface CandidateRecord {
  id: string;
  user_id: string;
  source_asset_id: string | null;
  suggested_title: string;
  suggested_creator: string | null;
  suggested_type: string | null;
  suggested_subcategory: string | null;
  direct_url: string | null;
  description_clue: string | null;
  year_clue: number | null;
  confidence_score: number | null;
  /**
   * Provider matches are stored in the `provider_candidates` JSONB column.
   * `external_*`/`provider_metadata` are optionally accepted for older rows.
   */
  provider_candidates?: ProviderCandidate[] | null;
  external_provider?: string | null;
  external_id?: string | null;
  provider_metadata?: Record<string, unknown> | null;
}

interface ResolvedProvider {
  providerName: string | null;
  externalId: string | null;
  metadata: Record<string, unknown>;
  subcategory: string | null;
  directUrl: string | null;
}

function resolveProvider(candidate: CandidateRecord): ResolvedProvider {
  const first = Array.isArray(candidate.provider_candidates)
    ? candidate.provider_candidates[0]
    : null;

  return {
    providerName: candidate.external_provider ?? first?.provider_name ?? null,
    externalId: candidate.external_id ?? first?.external_id ?? null,
    metadata:
      candidate.provider_metadata ||
      (first?.raw_payload as Record<string, unknown> | null) ||
      {},
    subcategory: first?.suggested_subcategory ?? null,
    directUrl: first?.direct_url ?? null,
  };
}

export interface CandidateOverrides {
  title?: string | null;
  creator?: string | null;
  content_type?: string | null;
  subcategory?: string | null;
  direct_url?: string | null;
  release_year?: number | null;
  overview?: string | null;
  cover_image_url?: string | null;
  consumption_status?: string | null;
}

function providerCover(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const direct = metadata.cover_image_url;
  if (typeof direct === "string") return sanitizeExternalUrl(direct);

  const volumeInfo = metadata.volumeInfo as Record<string, unknown> | undefined;
  const links = volumeInfo?.imageLinks as Record<string, unknown> | undefined;
  if (links) {
    const thumb = links.thumbnail || links.smallThumbnail;
    if (typeof thumb === "string") return sanitizeExternalUrl(thumb);
  }

  const posterPath = metadata.poster_path;
  if (typeof posterPath === "string" && posterPath.startsWith("/")) {
    return sanitizeExternalUrl(`https://image.tmdb.org/t/p/w500${posterPath}`);
  }
  return null;
}

/**
 * Converts an accepted identification candidate into a verified library item.
 *
 * If the screenshot already has a library item (created at upload time and
 * enriched by the worker), that item is updated instead of creating a
 * duplicate record. Source evidence is preserved either way.
 */
export async function acceptCandidate(
  db: SupabaseClient,
  userId: string,
  candidate: CandidateRecord,
  overrides: CandidateOverrides = {}
): Promise<Record<string, unknown> | null> {
  const contentType = normalizeContentType(
    overrides.content_type ?? candidate.suggested_type,
    "other"
  );
  const title = (overrides.title || candidate.suggested_title || "").trim();
  const provider = resolveProvider(candidate);

  const creator =
    overrides.creator !== undefined ? overrides.creator : candidate.suggested_creator;
  const subcategory =
    overrides.subcategory !== undefined
      ? overrides.subcategory
      : candidate.suggested_subcategory ?? provider.subcategory;
  const releaseYear =
    overrides.release_year !== undefined ? overrides.release_year : candidate.year_clue;
  const overview =
    overrides.overview !== undefined ? overrides.overview : candidate.description_clue;

  const directUrl = resolveDirectUrl({
    title: title || "media",
    creator,
    contentType,
    releaseYear,
    extractedUrl: overrides.direct_url ?? candidate.direct_url ?? provider.directUrl,
    providerUrl: providerUrlFromMetadata(provider.metadata) ?? provider.directUrl,
    providerName: provider.providerName,
    externalId: provider.externalId,
  });

  const coverUrl =
    overrides.cover_image_url !== undefined
      ? sanitizeExternalUrl(overrides.cover_image_url)
      : providerCover(provider.metadata);

  const payload = {
    title: title || "Untitled media",
    creator: creator || null,
    content_type: contentType,
    subcategory: subcategory || null,
    direct_url: directUrl,
    release_year: releaseYear ?? null,
    overview: overview || null,
    cover_image_url: coverUrl,
    external_provider: provider.providerName,
    external_id: provider.externalId,
    // Keep AI fields recoverable if the dedicated columns are missing.
    provider_metadata: {
      ...provider.metadata,
      _mediamind: {
        subcategory: subcategory || null,
        direct_url: directUrl,
      },
    },
    verification_status: "verified",
    updated_at: new Date().toISOString(),
  };

  // Look for an existing item linked to the same screenshot so accepting a
  // candidate verifies it rather than duplicating the library entry.
  let existingItem: { id: string; title?: string | null } | null = null;
  if (candidate.source_asset_id) {
    const { data: links } = await db
      .from("item_sources")
      .select("library_item_id, library_items(id, title, user_id)")
      .eq("source_asset_id", candidate.source_asset_id);

    type LinkedItem = { id: string; title?: string | null; user_id?: string | null };
    const owned = (links || [])
      .flatMap((link: { library_items?: LinkedItem | LinkedItem[] | null }) => {
        const linked = link.library_items;
        if (!linked) return [];
        return Array.isArray(linked) ? linked : [linked];
      })
      .filter((item: LinkedItem) => item.user_id === userId);

    if (owned.length > 0) {
      const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      existingItem =
        owned.find(
          (item: LinkedItem) =>
            typeof item.title === "string" &&
            item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === normalizedTitle
        ) || owned[0];
    }
  }

  // Deduplicate against an existing record for the same provider identifier.
  // Migration 006 enforces a unique (user_id, external_provider, external_id)
  // index, so writing that identifier onto a second placeholder would fail and
  // silently leave an empty library entry.
  if (provider.providerName && provider.externalId) {
    const { data: duplicateById } = await db
      .from("library_items")
      .select("id, title")
      .eq("user_id", userId)
      .eq("external_provider", provider.providerName)
      .eq("external_id", provider.externalId)
      .maybeSingle();

    if (duplicateById && duplicateById.id !== existingItem?.id) {
      const placeholderId = existingItem?.id || null;
      existingItem = duplicateById;

      if (candidate.source_asset_id) {
        // Re-point the preserved screenshot to the canonical item.
        await db
          .from("item_sources")
          .update({ library_item_id: duplicateById.id })
          .eq("source_asset_id", candidate.source_asset_id);

        // Remove the now-empty placeholder created at upload time.
        if (placeholderId) {
          const { count } = await db
            .from("item_sources")
            .select("id", { count: "exact", head: true })
            .eq("library_item_id", placeholderId);
          if (!count) {
            await db
              .from("library_items")
              .delete()
              .eq("id", placeholderId)
              .eq("user_id", userId);
          }
        }
      }
    }
  }

  const writeItem = async (
    operation: (payload: Record<string, unknown>) => PromiseLike<{
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    }>,
    label: string,
    extra: Record<string, unknown> = {}
  ) => {
    let writePayload: Record<string, unknown> = { ...payload, ...extra };
    let result = await withColumnFallback(
      writePayload,
      (candidatePayload) => operation(candidatePayload),
      label
    );

    // Older content_type CHECK constraints reject article/newsletter.
    if (result.error && isContentTypeConstraintError(result.error)) {
      console.warn(
        `[LibraryIngest] ${label}: content_type '${writePayload.content_type}' is not allowed. ` +
          "Storing as 'other'. Apply migrations/007_add_article_and_newsletter_types.sql."
      );
      writePayload = { ...writePayload, content_type: "other" };
      result = await withColumnFallback(
        writePayload,
        (candidatePayload) => operation(candidatePayload),
        label
      );
    }

    return result;
  };

  let item: Record<string, unknown> | null = null;

  if (existingItem) {
    const { data: updated, error } = await writeItem(
      (candidatePayload) =>
        db
          .from("library_items")
          .update(candidatePayload)
          .eq("id", existingItem.id)
          .eq("user_id", userId)
          .select("*")
          .single(),
      `library_items update (item ${existingItem.id})`
    );
    if (error) throw new Error(error.message);
    item = updated;
  } else {
    const itemId = crypto.randomUUID();
    const { data: inserted, error } = await writeItem(
      (candidatePayload) =>
        db.from("library_items").insert(candidatePayload).select("*").single(),
      `library_items insert (item ${itemId})`,
      {
        id: itemId,
        user_id: userId,
        consumption_status: overrides.consumption_status || "want_to_consume",
        created_at: new Date().toISOString(),
      }
    );
    if (error) throw new Error(error.message);
    item = inserted;

    if (candidate.source_asset_id) {
      await db.from("item_sources").insert({
        id: crypto.randomUUID(),
        library_item_id: itemId,
        source_asset_id: candidate.source_asset_id,
        created_at: new Date().toISOString(),
      });
    }
  }

  // Mark the candidate resolved and linked to the verified item.
  await db
    .from("identification_candidates")
    .update({
      review_status: "accepted",
      resolution_status: "accepted",
      resolved_library_item_id: existingItem?.id || (item?.id as string),
      resolved_at: new Date().toISOString(),
    })
    .eq("id", candidate.id)
    .eq("user_id", userId);

  // Generate the RAG embedding (best effort).
  const itemId = (existingItem?.id || item?.id) as string | undefined;
  if (itemId) {
    try {
      const text = `${payload.title} by ${payload.creator || "Unknown"}. ${
        payload.content_type
      } ${payload.subcategory || ""}. ${payload.overview || ""}`.trim();
      const vector = await GeminiService.generateEmbedding(text);
      if (vector.length > 0) {
        await db.from("item_embeddings").insert({
          id: crypto.randomUUID(),
          user_id: userId,
          library_item_id: itemId,
          embedding_source: "metadata",
          embedding: vector,
          content_chunk: text,
          created_at: new Date().toISOString(),
        });
      }
    } catch (embErr) {
      console.warn(
        "[Review] Embedding generation skipped:",
        embErr instanceof Error ? embErr.message : embErr
      );
    }
  }

  return item;
}
