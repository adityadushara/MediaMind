import { GoogleGenAI, type GenerateContentParameters } from "@google/genai";

/**
 * Gemini model configuration and resilient generation helper.
 *
 * Google periodically retires model IDs for new API keys. A retired model
 * returns HTTP 404 with a message such as:
 *   "This model models/gemini-2.5-flash is no longer available to new users."
 *
 * Hard-coding a single model therefore breaks the whole extraction pipeline.
 * This module resolves the configured model, filters out known-retired IDs and
 * falls back across models with retries for transient 429/5xx responses.
 */

export const DEFAULT_RUNTIME_MODEL = "gemini-3.8-flash";

/**
 * Conservative fallback ladder. Each entry must support multimodal
 * `generateContent`. Older IDs are intentionally excluded because Google
 * rejects them for new users.
 */
export const DEFAULT_FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
];

/** Models observed to be retired for new API keys. */
const RETIRED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "text-embedding-004",
  "text-embedding-005",
]);

const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
const DEFAULT_EMBEDDING_FALLBACKS = ["gemini-embedding-2", "gemini-embedding-2-preview"];

function normalizeModelId(raw: string | undefined | null): string {
  if (!raw) return "";
  let value = raw.trim();
  // Values copied from dashboards occasionally include quotes or the
  // "models/" resource prefix.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (value.startsWith("models/")) {
    value = value.slice("models/".length);
  }
  return value;
}

function parseModelList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((entry) => normalizeModelId(entry))
    .filter((entry) => entry.length > 0);
}

export function getConfiguredModel(): string {
  const configured = normalizeModelId(process.env.GEMINI_RUNTIME_MODEL);
  if (configured && !RETIRED_MODELS.has(configured)) {
    return configured;
  }
  return DEFAULT_RUNTIME_MODEL;
}

export function getModelCandidates(): string[] {
  const configured = normalizeModelId(process.env.GEMINI_RUNTIME_MODEL);
  const fallbacks = parseModelList(process.env.GEMINI_FALLBACK_MODELS);
  const fallbackList = fallbacks.length > 0 ? fallbacks : DEFAULT_FALLBACK_MODELS;

  const ordered =
    configured && !RETIRED_MODELS.has(configured)
      ? [configured, ...fallbackList, DEFAULT_RUNTIME_MODEL]
      : [DEFAULT_RUNTIME_MODEL, ...fallbackList];

  const unique: string[] = [];
  for (const model of ordered) {
    if (!model) continue;
    if (RETIRED_MODELS.has(model)) continue;
    if (!unique.includes(model)) unique.push(model);
  }
  return unique.length > 0 ? unique : [DEFAULT_RUNTIME_MODEL];
}

export function getEmbeddingModel(): string {
  const configured = normalizeModelId(process.env.GEMINI_EMBEDDING_MODEL);
  if (configured && !RETIRED_MODELS.has(configured)) {
    return configured;
  }
  return DEFAULT_EMBEDDING_MODEL;
}

export function getEmbeddingCandidates(): string[] {
  const configured = normalizeModelId(process.env.GEMINI_EMBEDDING_MODEL);
  const fallbacks = parseModelList(process.env.GEMINI_EMBEDDING_FALLBACK_MODELS);
  const fallbackList = fallbacks.length > 0 ? fallbacks : DEFAULT_EMBEDDING_FALLBACKS;

  const ordered =
    configured && !RETIRED_MODELS.has(configured)
      ? [configured, ...fallbackList, DEFAULT_EMBEDDING_MODEL]
      : [DEFAULT_EMBEDDING_MODEL, ...fallbackList];

  const unique: string[] = [];
  for (const model of ordered) {
    if (!model) continue;
    if (RETIRED_MODELS.has(model)) continue;
    if (!unique.includes(model)) unique.push(model);
  }
  return unique.length > 0 ? unique : [DEFAULT_EMBEDDING_MODEL];
}

/**
 * Embedding dimensions must match the `item_embeddings.embedding` column
 * (vector(768) in migration 001).
 */
export function getEmbeddingDimensions(): number {
  const parsed = parseInt(process.env.GEMINI_EMBEDDING_DIMENSIONS || "768", 10);
  if (!Number.isFinite(parsed) || parsed < 128 || parsed > 3072) {
    return 768;
  }
  return parsed;
}

export function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  return apiKey.trim().replace(/^["']|["']$/g, "");
}

export function createGeminiClient(): GoogleGenAI {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Add it to the server environment to enable AI extraction."
    );
  }
  return new GoogleGenAI({ apiKey });
}

interface ErrorLike {
  status?: number;
  code?: number | string;
  name?: string;
  message?: string;
  cause?: unknown;
}

export function getErrorStatus(err: unknown): number | null {
  const e = err as ErrorLike | null;
  const raw = e?.status ?? e?.code;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && /^\d{3}$/.test(raw)) return parseInt(raw, 10);
  return null;
}

export function getErrorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  const e = err as ErrorLike;
  const base = e?.message || String(err);
  const cause = e?.cause as ErrorLike | undefined;
  if (cause && typeof cause === "object") {
    const causeDetail = cause.code || cause.message;
    if (causeDetail && !base.includes(String(causeDetail))) {
      return `${base} (${String(causeDetail)})`;
    }
  }
  return base;
}

/** True when another model in the fallback chain may succeed. */
export function isModelUnavailable(err: unknown): boolean {
  const status = getErrorStatus(err);
  if (status === 404) return true;
  const message = getErrorMessage(err).toLowerCase();
  return (
    message.includes("no longer available") ||
    message.includes("not found") ||
    message.includes("is not supported for") ||
    message.includes("unsupported model")
  );
}

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_ABORTED",
]);

/** True when a retry of the same model or fallback to another model may succeed. */
export function isTransientError(err: unknown): boolean {
  const status = getErrorStatus(err);
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  const e = err as ErrorLike | null;
  const cause = (e?.cause && typeof e.cause === "object" ? e.cause : null) as ErrorLike | null;
  const codes = [e?.code, cause?.code]
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.toUpperCase());
  if (codes.some((c) => TRANSIENT_NETWORK_CODES.has(c))) {
    return true;
  }

  const names = [e?.name, cause?.name].filter((n): n is string => typeof n === "string");
  if (names.some((n) => n === "AbortError" || n === "TimeoutError")) {
    return true;
  }

  const message = `${getErrorMessage(err)} ${cause?.message || ""}`.toLowerCase();
  return (
    message.includes("aborted") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("high demand") ||
    message.includes("temporar") ||
    message.includes("overloaded") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("fetch failed") ||
    message.includes("socket hang up") ||
    message.includes("connection reset") ||
    message.includes("other side closed") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("und_err_") ||
    message.includes("network") ||
    message.includes("unavailable")
  );
}

/** Retired-model errors must never be retried on the same model. */
export function isRetiredModelError(err: unknown): boolean {
  return getErrorMessage(err).toLowerCase().includes("no longer available");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ResilientGenerationResult<T> {
  response: T;
  model: string;
  attempts: number;
  fallbackUsed: boolean;
}

export interface ResilientGenerationOptions {
  /** Total attempts per model for transient errors. */
  retriesPerModel?: number;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Overall budget across all models in milliseconds. */
  budgetMs?: number;
}

function readableProviderError(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: { message?: string };
        message?: string;
      };
      const inner = parsed.error?.message || parsed.message;
      if (inner) return inner.replace(/\s+/g, " ").slice(0, 300);
    } catch {
      // Not JSON; fall through.
    }
  }
  return trimmed.replace(/\s+/g, " ").slice(0, 300);
}

/**
 * Calls `generateContent`, trying the configured model first and then each
 * fallback. Transient failures are retried with exponential backoff before
 * moving to the next model. Retired model IDs are skipped immediately.
 */
export async function generateContentWithFallback<T>(
  ai: GoogleGenAI,
  request: Omit<GenerateContentParameters, "model">,
  options: ResilientGenerationOptions = {}
): Promise<ResilientGenerationResult<T>> {
  const retriesPerModel = Math.max(0, options.retriesPerModel ?? 1);
  const timeoutMs = options.timeoutMs ?? 60_000;
  const budgetMs = options.budgetMs ?? 55_000;
  const startedAt = Date.now();
  const candidates = getModelCandidates();

  let lastError: unknown = null;
  let attempts = 0;
  // The configured model's error explains the failure; the final fallback's
  // error is usually a misleading side effect ("model not found"). Keep both,
  // primary first, so the job message names a cause a human can act on.
  const failures: Array<{ model: string; reason: string }> = [];

  for (let modelIndex = 0; modelIndex < candidates.length; modelIndex++) {
    const model = candidates[modelIndex];

    for (let retry = 0; retry <= retriesPerModel; retry++) {
      const remainingBudget = budgetMs - (Date.now() - startedAt);
      if (remainingBudget < 1_000) {
        throw new Error(
          `Gemini generation exceeded its ${budgetMs}ms budget. ` +
            `Tried: ${candidates.slice(0, modelIndex + 1).join(", ")}. ` +
            `Last error: ${getErrorMessage(lastError)}`
        );
      }

      attempts++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remainingBudget));

      try {
        const response = (await ai.models.generateContent({
          ...request,
          model,
          config: {
            ...(request.config as Record<string, unknown> | undefined),
            abortSignal: controller.signal,
          },
        })) as T;

        clearTimeout(timer);
        return { response, model, attempts, fallbackUsed: modelIndex > 0 };
      } catch (err) {
        clearTimeout(timer);
        lastError = err;

        if (isModelUnavailable(err)) {
          failures.push({ model, reason: readableProviderError(getErrorMessage(err)) });
          console.warn(
            `[Gemini] Model '${model}' is unavailable (${getErrorMessage(err).slice(0, 140)}). Trying next fallback.`
          );
          break;
        }

        if (isTransientError(err) && retry < retriesPerModel) {
          const backoff = 700 * Math.pow(2, retry) + Math.floor(Math.random() * 250);
          console.warn(
            `[Gemini] Model '${model}' transient error (status ${getErrorStatus(err) ?? "n/a"}). Retrying in ${backoff}ms.`
          );
          await sleep(backoff);
          continue;
        }

        // Non-transient errors (bad request, invalid schema, auth) should not
        // be masked by switching models.
        if (!isTransientError(err)) {
          throw err;
        }

        failures.push({ model, reason: readableProviderError(getErrorMessage(err)) });
        console.warn(
          `[Gemini] Model '${model}' failed after retries (${getErrorMessage(err).slice(0, 140)}). Trying next fallback.`
        );
        break;
      }
    }
  }

  const finalMessage = readableProviderError(getErrorMessage(lastError));
  const ordered = failures.filter((failure) => failure.reason !== finalMessage);
  const summary = [ordered[0], ordered[1] || { model: "", reason: finalMessage }]
    .filter((failure) => failure.reason)
    .map((failure) => (failure.model ? `${failure.model}: ${failure.reason}` : failure.reason))
    .join(" | ");
  throw new Error(`All Gemini models failed. ${summary}`);
}
