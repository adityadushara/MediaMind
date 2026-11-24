import { Type } from "@google/genai";
import { ContentType } from "@/types";
import {
  createGeminiClient,
  generateContentWithFallback,
  getEmbeddingCandidates,
  getEmbeddingDimensions,
  getErrorMessage,
  isModelUnavailable,
  isTransientError,
  type ResilientGenerationResult,
} from "./geminiModels";
import { normalizeContentType, sanitizeExternalUrl } from "./linkResolver";

export interface ExtractedCandidate {
  title: string;
  creator: string | null;
  content_type: ContentType;
  subcategory: string | null;
  direct_url: string | null;
  release_year: number | null;
  confidence: number;
  visual_evidence: string | null;
  uncertainty_reasons: string[];
  bounding_box: {
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
  } | null;
}

export interface GeminiExtractionResult {
  candidates: ExtractedCandidate[];
  model_name: string;
  prompt_version: string;
  duration_ms: number;
  fallback_used: boolean;
  attempts: number;
  token_usage?: {
    prompt_tokens: number;
    candidate_tokens: number;
    total_tokens: number;
  };
}

export const EXTRACTION_PROMPT_VERSION = "v1.1.0";

const EXTRACTION_SYSTEM_PROMPT = `You are an expert multimodal document and media intelligence assistant for MediaMind.
Your task is to analyze the provided screenshot and detect individual, distinct media items.

Supported Content Types:
- "book": Books, audiobooks, ebooks, manuals.
- "movie": Feature films, motion pictures.
- "tv_show": Television series, anime series, multi-episode shows.
- "youtube_video": YouTube videos, web video clips, streams.
- "documentary": Non-fiction films or series.
- "podcast": Audio shows, podcast episodes.
- "course": Online courses, educational lectures, tutorials.
- "article": Substack articles, blog posts, essays, long-form journalism, web articles.
- "newsletter": Substack publications, email newsletters, periodic dispatches.
- "other": Any other distinct creative or educational media item.

Rules:
1. Identify each distinct media item visible. If multiple items are present, return a separate candidate for each.
2. Extract ONLY information directly visible or supported by visual evidence.
3. Distinguish the true Title from platform names (e.g., Netflix, YouTube, Coursera) or headers.
4. Extract creator/author/channel if visible.
5. Return a bounding box around each media item using normalized integer coordinates [0, 1000]:
   x_min, y_min, x_max, y_max where 0 <= x_min < x_max <= 1000 and 0 <= y_min < y_max <= 1000.
6. Provide a subcategory (e.g. "Psychology", "Tech & Programming", "Sci-Fi", "Finance", "Business").
7. If an exact web link or URL is visible, extract it into direct_url. Never invent a URL.
8. If nothing identifiable is visible, return an empty candidates array.`;

const MAX_TITLE_LENGTH = 500;
const MAX_TEXT_LENGTH = 2000;
const MAX_RELEASE_YEAR_LOOKAHEAD = 2;

function cleanText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function normalizeConfidence(value: unknown): number {
  let confidence = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(confidence)) confidence = 0;
  // Models occasionally return percentages (e.g. 92 instead of 0.92).
  if (confidence > 1 && confidence <= 100) {
    confidence = confidence / 100;
  }
  return Math.min(1, Math.max(0, Number(confidence.toFixed(4))));
}

function normalizeYear(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return null;
  const maxYear = new Date().getFullYear() + MAX_RELEASE_YEAR_LOOKAHEAD;
  if (parsed < 1000 || parsed > maxYear) return null;
  return Math.round(parsed);
}

function normalizeBoundingBox(
  value: unknown
): ExtractedCandidate["bounding_box"] {
  if (!value || typeof value !== "object") return null;
  const box = value as Record<string, unknown>;
  const coords = ["x_min", "y_min", "x_max", "y_max"].map((key) => {
    const raw = box[key];
    const parsed = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
    if (!Number.isFinite(parsed)) return null;
    return Math.round(Math.min(1000, Math.max(0, parsed)));
  });

  if (coords.some((coord) => coord === null)) return null;
  const [x_min, y_min, x_max, y_max] = coords as number[];
  if (!(x_min < x_max && y_min < y_max)) return null;

  return { x_min, y_min, x_max, y_max };
}

/**
 * AI output is untrusted. Every field is validated and normalized before it
 * reaches the database.
 */
export function normalizeCandidates(rawCandidates: unknown): ExtractedCandidate[] {
  if (!Array.isArray(rawCandidates)) return [];

  const normalized: ExtractedCandidate[] = [];
  const seen = new Set<string>();

  for (const raw of rawCandidates) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Record<string, unknown>;

    const title = cleanText(candidate.title, MAX_TITLE_LENGTH);
    if (!title) continue;

    const dedupeKey = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (dedupeKey && seen.has(dedupeKey)) continue;
    if (dedupeKey) seen.add(dedupeKey);

    const uncertainty = Array.isArray(candidate.uncertainty_reasons)
      ? candidate.uncertainty_reasons
          .map((reason) => cleanText(reason, 300))
          .filter((reason): reason is string => Boolean(reason))
          .slice(0, 8)
      : [];

    normalized.push({
      title,
      creator: cleanText(candidate.creator, MAX_TITLE_LENGTH),
      content_type: normalizeContentType(candidate.content_type, "other"),
      subcategory: cleanText(candidate.subcategory, 120),
      direct_url: sanitizeExternalUrl(candidate.direct_url),
      release_year: normalizeYear(candidate.release_year),
      confidence: normalizeConfidence(candidate.confidence),
      visual_evidence: cleanText(candidate.visual_evidence, MAX_TEXT_LENGTH),
      uncertainty_reasons: uncertainty,
      bounding_box: normalizeBoundingBox(candidate.bounding_box),
    });
  }

  return normalized;
}

export class GeminiService {
  /**
   * Analyzes an image buffer using Gemini Multimodal Vision with a strict
   * JSON schema. Retries transient failures and falls back across models when
   * the configured model has been retired by Google.
   */
  static async extractMediaFromImage(
    imageBuffer: Buffer,
    mimeType: string = "image/jpeg"
  ): Promise<GeminiExtractionResult> {
    const startTime = Date.now();
    const ai = createGeminiClient();

    const base64Image = imageBuffer.toString("base64");

    const generation: ResilientGenerationResult<{
      text?: string;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    }> = await generateContentWithFallback(
      ai,
      {
        contents: [
          {
            role: "user",
            parts: [
              { text: EXTRACTION_SYSTEM_PROMPT },
              {
                inlineData: {
                  data: base64Image,
                  mimeType,
                },
              },
              {
                text: "Carefully inspect this screenshot. Detect all visible media items and return them following the JSON schema.",
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              candidates: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    creator: { type: Type.STRING, nullable: true },
                    content_type: {
                      type: Type.STRING,
                      enum: [
                        "book",
                        "movie",
                        "tv_show",
                        "youtube_video",
                        "documentary",
                        "podcast",
                        "course",
                        "article",
                        "newsletter",
                        "other",
                      ],
                    },
                    subcategory: { type: Type.STRING, nullable: true },
                    direct_url: { type: Type.STRING, nullable: true },
                    release_year: { type: Type.INTEGER, nullable: true },
                    confidence: { type: Type.NUMBER },
                    visual_evidence: { type: Type.STRING, nullable: true },
                    uncertainty_reasons: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    bounding_box: {
                      type: Type.OBJECT,
                      properties: {
                        x_min: { type: Type.INTEGER },
                        y_min: { type: Type.INTEGER },
                        x_max: { type: Type.INTEGER },
                        y_max: { type: Type.INTEGER },
                      },
                      nullable: true,
                    },
                  },
                  required: ["title", "content_type", "confidence"],
                },
              },
            },
            required: ["candidates"],
          },
        },
      },
      // Extraction runs inside a serverless request budget: prefer moving to
      // the next (faster) model over retrying one slow model. The whole job
      // must also fit in the platform limit (60s on Vercel), leaving time for
      // metadata lookup, persistence and optional embeddings.
      { retriesPerModel: 0, timeoutMs: 10_000, budgetMs: 42_000 }
    );

    const response = generation.response;
    const duration = Date.now() - startTime;
    const text = response.text || "{}";

    let parsed: { candidates?: unknown } = { candidates: [] };
    try {
      parsed = JSON.parse(text);
    } catch {
      console.warn("[Gemini] Response was not valid JSON; treating as unidentified.");
    }

    return {
      candidates: normalizeCandidates(parsed?.candidates),
      model_name: generation.model,
      prompt_version: EXTRACTION_PROMPT_VERSION,
      duration_ms: duration,
      fallback_used: generation.fallbackUsed,
      attempts: generation.attempts,
      token_usage: response.usageMetadata
        ? {
            prompt_tokens: response.usageMetadata.promptTokenCount || 0,
            candidate_tokens: response.usageMetadata.candidatesTokenCount || 0,
            total_tokens: response.usageMetadata.totalTokenCount || 0,
          }
        : undefined,
    };
  }

  /**
   * Generates a text embedding using a current Gemini embedding model.
   * The output is truncated to the database vector size (768 by default).
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    const trimmed = (text || "").trim().slice(0, 8000);
    if (!trimmed) return [];

    const ai = createGeminiClient();
    const dimensions = getEmbeddingDimensions();
    const models = getEmbeddingCandidates();

    let lastError: unknown = null;

    for (const model of models) {
      // One retry for transient failures per embedding model.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await ai.models.embedContent({
            model,
            contents: trimmed,
            config: {
              outputDimensionality: dimensions,
              abortSignal: AbortSignal.timeout(30_000),
            },
          });

          const anyResult = result as unknown as {
            embeddings?: Array<{ values?: number[] }>;
            embedding?: { values?: number[] };
          };
          const values =
            anyResult.embeddings?.[0]?.values || anyResult.embedding?.values || [];

          if (values.length === 0) {
            throw new Error("Embedding response contained no vector values.");
          }

          if (values.length > dimensions) {
            return values.slice(0, dimensions);
          }
          if (values.length < dimensions) {
            return [...values, ...new Array(dimensions - values.length).fill(0)];
          }
          return values;
        } catch (err) {
          lastError = err;
          if (isModelUnavailable(err)) break;
          if (isTransientError(err) && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            continue;
          }
          break;
        }
      }
    }

    throw new Error(`Embedding generation failed: ${getErrorMessage(lastError)}`);
  }
}
