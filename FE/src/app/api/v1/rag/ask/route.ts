import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import {
  createGeminiClient,
  generateContentWithFallback,
  getConfiguredModel,
} from "@/lib/server/geminiModels";
import {
  normalizeContentType,
  providerSearchUrl,
  providerUrlFromMetadata,
  resolveDirectUrl,
  sanitizeExternalUrl,
} from "@/lib/server/linkResolver";
import { MetadataRouter } from "@/lib/server/metadataRouter";
import type { ContentType } from "@/types";

interface LibraryRow {
  id: string;
  title: string;
  creator: string | null;
  content_type: string | null;
  subcategory: string | null;
  direct_url: string | null;
  overview: string | null;
  release_year: number | null;
  consumption_status?: string | null;
  user_rating?: number | null;
  external_provider?: string | null;
  external_id?: string | null;
  provider_metadata?: Record<string, unknown> | null;
}

interface LinkedItem extends LibraryRow {
  direct_url: string;
}

interface CatalogSuggestion {
  title: string;
  creator: string | null;
  content_type: ContentType;
  release_year: number | null;
  rationale: string | null;
  direct_url: string;
  link_is_search: boolean;
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "my",
  "me",
  "show",
  "find",
  "what",
  "which",
  "did",
  "do",
  "i",
  "is",
  "are",
  "about",
  "that",
  "this",
  "any",
  "all",
  "from",
  "by",
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function scoreItem(item: LibraryRow, query: string, queryTokens: string[]): number {
  const title = (item.title || "").toLowerCase();
  const creator = (item.creator || "").toLowerCase();
  const corpus = `${title} ${creator} ${item.subcategory || ""} ${item.overview || ""} ${
    item.content_type || ""
  }`.toLowerCase();
  const corpusTokens = new Set(tokenize(corpus));

  let score = 0;
  if (title && query.includes(title)) score += 0.7;
  if (creator && creator.length > 2 && query.includes(creator)) score += 0.45;

  if (queryTokens.length > 0) {
    let matched = 0;
    for (const token of queryTokens) {
      // "focus" must match "focused": a shared word stem is real evidence,
      // an exact-string check made the fallback blind to inflections.
      const isMatch =
        corpusTokens.has(token) ||
        (token.length >= 4 &&
          Array.from(corpusTokens).some(
            (word) => word.startsWith(token) || token.startsWith(word)
          ));
      if (isMatch) matched++;
    }
    score += (matched / queryTokens.length) * 0.5;
  }

  if (item.content_type && query.includes(item.content_type.toLowerCase().replace(/_/g, " "))) {
    // A shared content-type word ("book") is not evidence the item is relevant.
    score += 0.1;
  }
  if (item.subcategory && query.includes(item.subcategory.toLowerCase())) {
    score += 0.25;
  }
  return Number(score.toFixed(4));
}

function withLinks(item: LibraryRow): LinkedItem {
  const contentType = normalizeContentType(item.content_type);
  const metadata = (item.provider_metadata || {}) as Record<string, unknown>;
  const mediamind = metadata._mediamind as
    | { subcategory?: string | null; direct_url?: string | null }
    | undefined;
  return {
    ...item,
    subcategory: item.subcategory ?? mediamind?.subcategory ?? null,
    content_type: contentType,
    direct_url: resolveDirectUrl({
      title: item.title,
      creator: item.creator,
      contentType,
      releaseYear: item.release_year,
      providerUrl: item.direct_url || mediamind?.direct_url || providerUrlFromMetadata(metadata),
      providerName: item.external_provider,
      externalId: item.external_id,
    }),
  };
}

const STATUS_LABELS: Record<string, string> = {
  want_to_consume: "want to consume",
  consuming: "currently consuming",
  completed: "completed",
  on_hold: "on hold",
  dropped: "dropped",
};

/** One compact line per saved item, so the model sees the whole library. */
function describeItem(item: LinkedItem, index: number): string {
  const bits = [
    item.creator ? `by ${item.creator}` : null,
    item.release_year ? String(item.release_year) : null,
    (item.content_type || "other").replace(/_/g, " "),
    item.subcategory || null,
    item.consumption_status ? STATUS_LABELS[item.consumption_status] || null : null,
    item.user_rating ? `rated ${item.user_rating}/10` : null,
  ].filter(Boolean);
  const overview = (item.overview || "").replace(/\s+/g, " ").slice(0, 180);
  return `${index + 1}. ${item.title} — ${bits.join(", ")}. Link: ${item.direct_url}${
    overview ? `. Notes: ${overview}` : ""
  }`;
}

function fallbackAnswer(query: string, matched: LinkedItem[]): string {
  if (matched.length === 0) {
    return `Nothing in your library covers **'${query}'** yet.`;
  }
  const list = matched
    .map(
      (item) =>
        `- [${item.title}](${item.direct_url}) — ${item.creator || "Unknown creator"} ` +
        `(${item.content_type}${item.subcategory ? ` · ${item.subcategory}` : ""})`
    )
    .join("\n");
  return `Based on your library, here are the most relevant items for **'${query}'**:\n\n${list}`;
}

interface ParsedModelReply {
  answer: string;
  libraryCovered: boolean;
  suggestion: {
    title?: string;
    creator?: string | null;
    content_type?: string | null;
    release_year?: number | null;
    why?: string | null;
  } | null;
}

const SUGGESTION_SCHEMA_HINT = `{"library_covered": true|false, "suggestion": null | {"title": "...", "creator": "...", "content_type": "book|movie|tv_show|youtube_video|documentary|podcast|course|article|newsletter|other", "release_year": 2020, "why": "one short line"}}`;

/** Returns the balanced JSON object starting at `start`, if there is one. */
function extractJsonObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Splits the trailing JSON contract off the prose answer. */
function parseModelReply(raw: string): ParsedModelReply {
  const text = raw.replace(/```[a-z]*\s*/gi, "").replace(/```/g, "").trim();
  const marker = text.lastIndexOf('"library_covered"');
  const start = marker >= 0 ? text.lastIndexOf("{", marker) : text.lastIndexOf("{");
  if (start >= 0) {
    const candidate = extractJsonObject(text, start);
    try {
      if (!candidate) throw new Error("no object");
      const parsed = JSON.parse(candidate) as {
        library_covered?: unknown;
        suggestion?: unknown;
      };
      if (typeof parsed.library_covered === "boolean") {
        const suggestion = parsed.suggestion as Record<string, unknown> | null;
        return {
          // The contract block (and anything after it) is not part of the answer.
          answer: text.slice(0, start).trim(),
          libraryCovered: parsed.library_covered,
          suggestion:
            suggestion && typeof suggestion === "object" && typeof suggestion.title === "string"
              ? {
                  title: suggestion.title,
                  creator:
                    typeof suggestion.creator === "string" ? suggestion.creator : null,
                  content_type:
                    typeof suggestion.content_type === "string"
                      ? suggestion.content_type
                      : null,
                  release_year:
                    typeof suggestion.release_year === "number"
                      ? suggestion.release_year
                      : null,
                  why: typeof suggestion.why === "string" ? suggestion.why : null,
                }
              : null,
        };
      }
    } catch {
      // Not the contract block; fall through to plain prose.
    }
  }
  return { answer: text, libraryCovered: false, suggestion: null };
}

/**
 * A suggestion is only useful if it can be acted on, so the link is resolved
 * through the metadata providers first and falls back to a provider search.
 */
async function buildSuggestion(
  suggestion: NonNullable<ParsedModelReply["suggestion"]>
): Promise<CatalogSuggestion | null> {
  const title = (suggestion.title || "").trim();
  if (!title) return null;

  const contentType = normalizeContentType(suggestion.content_type);
  const creator = suggestion.creator?.trim() || null;
  const releaseYear = suggestion.release_year ?? null;

  let directUrl: string | null = null;
  try {
    const meta = await MetadataRouter.search({
      title,
      creator,
      content_type: contentType,
      release_year: releaseYear,
    });
    if (meta?.direct_url) directUrl = sanitizeExternalUrl(meta.direct_url);
  } catch {
    // A failed lookup still leaves the search fallback below.
  }

  const fallback = providerSearchUrl(contentType, title, creator, releaseYear);
  return {
    title,
    creator,
    content_type: contentType,
    release_year: releaseYear,
    rationale: suggestion.why?.trim() || null,
    direct_url: directUrl || fallback,
    link_is_search: !directUrl,
  };
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const db = createAuthenticatedClient(user.token);
  const startTime = Date.now();

  let body: { query?: string; top_k?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const query = (body.query || "").trim();
  const topK = Math.min(20, Math.max(1, body.top_k || 6));

  if (!query) {
    return NextResponse.json({ detail: "Query is required" }, { status: 400 });
  }

  const [{ data: items, error }, { data: assets }] = await Promise.all([
    db
      .from("library_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("source_assets")
      .select("file_name, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  const library = (items || []).map((item) => withLinks(item as LibraryRow));
  const screenshotNames = (assets || [])
    .map((asset: { file_name?: string }) => asset.file_name)
    .filter((name): name is string => Boolean(name));

  const noModelResponse = (answer: string, modelName = "keyword-fallback") =>
    NextResponse.json({
      query,
      answer,
      matched_items: [] as LinkedItem[],
      library_covered: false,
      suggestions: [] as CatalogSuggestion[],
      duration_ms: Date.now() - startTime,
      model_name: modelName,
    });

  if (library.length === 0 && screenshotNames.length === 0) {
    return noModelResponse(
      `Your library is still empty, so I can't ground an answer yet. Upload a screenshot and I'll search everything you save.`
    );
  }

  const normalizedQuery = query.toLowerCase();
  const queryTokens = tokenize(query);
  const matched = library
    .map((item) => ({ item, score: scoreItem(item, normalizedQuery, queryTokens) }))
    .sort((a, b) => b.score - a.score)
    .filter((entry) => entry.score > 0.35)
    .slice(0, topK)
    .map((entry) => entry.item);

  let modelName = getConfiguredModel();
  let reply: ParsedModelReply | null = null;

  try {
    const ai = createGeminiClient();
    const libraryContext =
      library.length > 0
        ? library.map((item, index) => describeItem(item, index)).join("\n")
        : "(no media saved yet)";

    const prompt = `You are MediaMind's library assistant. Your job is to answer the user's question
accurately, using their saved library first and your own knowledge second.

=== THE USER'S ENTIRE LIBRARY (${library.length} items) ===
${libraryContext}

=== SCREENSHOTS THEY HAVE SAVED (${screenshotNames.length}) ===
${screenshotNames.length > 0 ? screenshotNames.join(", ") : "(none)"}

=== USER QUESTION ===
${query}

=== HOW TO ANSWER ===
1. Read the whole library above before answering. If items in it answer the question, answer from
   them only: name exact titles, mention the creator, and include each item's link as a markdown link.
   Do not claim the library contains something it does not.
2. If the library does not contain what they are asking about, say so in one short sentence, then
   answer the question itself accurately and helpfully from general knowledge, as an expert would.
3. When the question is about a specific book, film, show, video, course or podcast that is NOT in
   the library, also propose it as a catalog entry so they can save it.
4. Be concise and concrete. No filler, no apologies, no repeating the question.

Then end your reply with a single JSON object on its own line, exactly this shape:
${SUGGESTION_SCHEMA_HINT}
Set "library_covered" to true only when saved items answer the question. Set "suggestion" to null
unless you are proposing a specific title that is missing from the library.`;

    const runOnce = () =>
      generateContentWithFallback<{ text?: string }>(
        ai,
        { contents: prompt },
        // The ladder itself is the retry: retrying a struggling model inside the
        // request budget meant the reliable fallback never got a turn.
        { retriesPerModel: 0, timeoutMs: 12_000, budgetMs: 24_000 }
      );

    let generation;
    try {
      generation = await runOnce();
    } catch (firstError) {
      // A "high demand" burst usually clears in seconds, and one more pass is
      // cheaper than answering a knowledge question with a keyword list.
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      generation = await runOnce().catch(() => {
        throw firstError;
      });
    }
    const text = (generation.response.text || "").trim();
    if (text) {
      modelName = generation.model;
      reply = parseModelReply(text);
    }
  } catch (aiErr) {
    console.warn(
      "[RAG] Gemini synthesis unavailable; returning grounded list:",
      aiErr instanceof Error ? aiErr.message : aiErr
    );
  }

  let answer = reply?.answer?.trim() || "";
  let suggestions: CatalogSuggestion[] = [];
  let libraryCovered = reply?.libraryCovered ?? false;

  if (!answer) {
    answer = fallbackAnswer(query, matched);
    modelName = "keyword-fallback";
    libraryCovered = matched.length > 0;
  }

  if (!libraryCovered && reply?.suggestion) {
    const suggestion = await buildSuggestion(reply.suggestion);
    if (suggestion) suggestions = [suggestion];
  }

  return NextResponse.json({
    query,
    answer,
    matched_items: libraryCovered || matched.length > 0 ? matched : [],
    library_covered: libraryCovered,
    suggestions,
    duration_ms: Date.now() - startTime,
    model_name: modelName,
  });
}
