import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import { buildMediaProxyUrl, redactInlineDataUrls } from "@/lib/server/storage";
import { normalizeContentType, providerUrlFromMetadata, resolveDirectUrl, sanitizeExternalUrl } from "@/lib/server/linkResolver";
import { isContentTypeConstraintError, withColumnFallback } from "@/lib/server/schemaFallback";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);

  const { searchParams } = new URL(req.url);
  const contentType = searchParams.get("content_type");
  const subcategory = searchParams.get("subcategory");
  const consumptionStatus = searchParams.get("consumption_status");
  const verificationStatus = searchParams.get("verification_status");
  const search = searchParams.get("search");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  // Sort column/direction come from the client, so whitelist both. An unknown
  // column would otherwise make PostgREST reject the whole request.
  const SORTABLE_COLUMNS = new Set([
    "created_at",
    "updated_at",
    "title",
    "user_rating",
    "release_year",
  ]);
  const requestedSort = searchParams.get("sort_by") || "created_at";
  const sortBy = SORTABLE_COLUMNS.has(requestedSort) ? requestedSort : "created_at";
  const requestedOrder = (
    searchParams.get("sort_order") ||
    searchParams.get("order") ||
    "desc"
  ).toLowerCase();
  const ascending = requestedOrder === "asc";

  let query = db
    .from("library_items")
    .select("*, item_sources(*, source_assets(*))", { count: "exact" })
    .eq("user_id", user.id)
    .order(sortBy, { ascending, nullsFirst: false })
    // Stable tiebreaker so paging never repeats or skips a row.
    .order("created_at", { ascending: false });

  if (contentType) query = query.eq("content_type", contentType);
  if (subcategory) query = query.eq("subcategory", subcategory);
  if (consumptionStatus) query = query.eq("consumption_status", consumptionStatus);
  if (verificationStatus) query = query.eq("verification_status", verificationStatus);

  // Match across the fields a user actually types into the header search.
  // Strip PostgREST filter delimiters so the term cannot break the or() syntax.
  const term = (search || "").replace(/[(),%*]/g, " ").trim();
  if (term) {
    query = query.or(
      ["title", "creator", "subcategory", "genre", "overview"]
        .map((field) => `${field}.ilike.%${term}%`)
        .join(",")
    );
  }

  const { data: items, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  const enriched = await Promise.all(
    (items || []).map(async (item) => {
      const firstSource = item.item_sources?.[0]?.source_assets;
      // Serve screenshots through the authenticated media proxy instead of
      // embedding multi-megabyte base64 payloads in the list response.
      const screenshotUrl = firstSource?.id
        ? buildMediaProxyUrl(firstSource.id, "original")
        : null;

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
          providerUrl:
            mediamind?.direct_url || providerUrlFromMetadata(providerMetadata),
          providerName: item.external_provider,
          externalId: item.external_id,
        });

      return {
        ...item,
        content_type: contentType,
        subcategory: item.subcategory ?? mediamind?.subcategory ?? null,
        direct_url: directUrl,
        screenshot_url: screenshotUrl,
      };
    })
  );

  return NextResponse.json({
    total: count || enriched.length,
    items: redactInlineDataUrls(enriched),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);

  try {
    const body = await req.json();

    // Whitelist user-editable fields. Never spread an untrusted body into an
    // insert: it could target ownership or provider columns.
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
      "genre",
      "isbn",
      "language",
      "publisher",
      "runtime_minutes",
      "total_seasons",
      "total_episodes",
    ] as const;

    const values: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) values[field] = body[field];
    }

    const title =
      typeof values.title === "string" ? values.title.trim().slice(0, 500) : "";
    if (!title) {
      return NextResponse.json({ detail: "Title is required" }, { status: 400 });
    }
    values.title = title;

    if (typeof values.content_type === "string") {
      values.content_type = normalizeContentType(values.content_type);
    } else {
      values.content_type = "other";
    }
    if (typeof values.direct_url === "string") {
      values.direct_url = sanitizeExternalUrl(values.direct_url) || null;
    }

    let insertPayload: Record<string, unknown> = {
      ...values,
      id: crypto.randomUUID(),
      user_id: user.id,
      verification_status: "manual_entry",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const write = () =>
      withColumnFallback(
        insertPayload,
        (candidatePayload) =>
          db.from("library_items").insert(candidatePayload).select("*").single(),
        "library_items insert (manual entry)"
      );

    let result = await write();
    if (result.error && isContentTypeConstraintError(result.error)) {
      console.warn(
        "[Library] content_type is not allowed by this database; storing as 'other'. " +
          "Apply migrations/007_add_article_and_newsletter_types.sql."
      );
      insertPayload = { ...insertPayload, content_type: "other" };
      result = await write();
    }

    if (result.error) {
      return NextResponse.json({ detail: result.error.message }, { status: 500 });
    }

    const created = result.data as Record<string, unknown> & {
      title?: string;
      creator?: string | null;
      content_type?: string | null;
      subcategory?: string | null;
      direct_url?: string | null;
      release_year?: number | null;
    };
    const contentType = normalizeContentType(created.content_type);
    const directUrl =
      created.direct_url ||
      resolveDirectUrl({
        title: created.title || title,
        creator: created.creator,
        contentType,
        releaseYear: created.release_year,
      });

    return NextResponse.json(
      {
        ...created,
        content_type: contentType,
        subcategory: created.subcategory ?? null,
        direct_url: directUrl,
        screenshot_url: null,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Create failed" },
      { status: 400 }
    );
  }
}
