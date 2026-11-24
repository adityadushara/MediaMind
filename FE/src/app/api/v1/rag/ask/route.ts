import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/auth";
import { createAuthenticatedClient } from "@/lib/server/supabaseAdmin";
import {
  createGeminiClient,
  generateContentWithFallback,
  getConfiguredModel,
} from "@/lib/server/geminiModels";
import { normalizeContentType, providerUrlFromMetadata, resolveDirectUrl } from "@/lib/server/linkResolver";

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
  external_provider?: string | null;
  external_id?: string | null;
  provider_metadata?: Record<string, unknown> | null;
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
      if (corpusTokens.has(token)) matched++;
    }
    score += (matched / queryTokens.length) * 0.5;
  }

  if (item.content_type && query.includes(item.content_type.toLowerCase().replace(/_/g, " "))) {
    score += 0.2;
  }
  if (item.subcategory && query.includes(item.subcategory.toLowerCase())) {
    score += 0.25;
  }
  return Number(score.toFixed(4));
}

function withLinks(item: LibraryRow): LibraryRow & { direct_url: string } {
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

function fallbackAnswer(query: string, matched: Array<LibraryRow & { direct_url: string }>): string {
  const list = matched
    .map(
      (item) =>
        `- [${item.title}](${item.direct_url}) — ${item.creator || "Unknown creator"} ` +
        `(${item.content_type}${item.subcategory ? ` · ${item.subcategory}` : ""})`
    )
    .join("\n");
  return `Based on your library, here are the most relevant items for **'${query}'**:\n\n${list}`;
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
  const topK = Math.min(20, Math.max(1, body.top_k || 5));

  if (!query) {
    return NextResponse.json({ detail: "Query is required" }, { status: 400 });
  }

  const { data: items, error } = await db
    .from("library_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ detail: error.message }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json({
      query,
      answer: `I couldn't find any records in your personal library matching **'${query}'**. Upload a screenshot first and I'll be able to search it.`,
      matched_items: [],
      duration_ms: Date.now() - startTime,
      model_name: getConfiguredModel(),
    });
  }

  const normalizedQuery = query.toLowerCase();
  const queryTokens = tokenize(query);

  const scored = (items as LibraryRow[])
    .map((item) => ({ item, score: scoreItem(item, normalizedQuery, queryTokens) }))
    .sort((a, b) => b.score - a.score);

  const matched = scored
    .filter((entry) => entry.score > 0.15)
    .slice(0, topK)
    .map((entry) => withLinks(entry.item));

  let modelName = getConfiguredModel();

  if (matched.length === 0) {
    return NextResponse.json({
      query,
      answer: `I couldn't find any records in your personal library matching **'${query}'**.\n\nTry searching by creator, content type (*books*, *YouTube videos*, *podcasts*), or subcategory.`,
      matched_items: [],
      duration_ms: Date.now() - startTime,
      model_name: modelName,
    });
  }

  let answer = "";
  try {
    const ai = createGeminiClient();
    const contextLines = matched.map(
      (item, index) =>
        `${index + 1}. Title: ${item.title}\n   Creator: ${item.creator || "Unknown"}\n   Type: ${
          item.content_type
        }\n   Subcategory: ${item.subcategory || "General"}\n   Direct Link: ${
          item.direct_url
        }\n   Overview: ${(item.overview || "").slice(0, 240)}`
    );

    const prompt = `You are MediaMind's AI Library Assistant. Answer the user's question using ONLY the verified library items below.
Be concise. Mention exact titles, creators, and include the direct link as a markdown link for each item you mention.
If the items do not answer the question, say so plainly.

=== USER'S VERIFIED LIBRARY ITEMS ===
${contextLines.join("\n\n")}

User Question: ${query}

Assistant Answer:`;

    const generation = await generateContentWithFallback<{ text?: string }>(
      ai,
      { contents: prompt },
      { retriesPerModel: 1, timeoutMs: 15_000, budgetMs: 35_000 }
    );
    answer = (generation.response.text || "").trim();
    if (answer) {
      modelName = generation.model;
    }
  } catch (aiErr) {
    console.warn(
      "[RAG] Gemini synthesis unavailable; returning grounded list:",
      aiErr instanceof Error ? aiErr.message : aiErr
    );
  }

  if (!answer) {
    answer = fallbackAnswer(query, matched);
    modelName = "keyword-fallback";
  }

  return NextResponse.json({
    query,
    answer,
    matched_items: matched,
    duration_ms: Date.now() - startTime,
    model_name: modelName,
  });
}
