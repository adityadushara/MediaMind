import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getConfiguredModel,
  getModelCandidates,
  getEmbeddingModel,
  getEmbeddingCandidates,
  getEmbeddingDimensions,
  generateContentWithFallback,
  isTransientError,
} from "@/lib/server/geminiModels";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("gemini model resolution", () => {
  it("ignores retired model ids and uses the current default", () => {
    vi.stubEnv("GEMINI_RUNTIME_MODEL", "gemini-2.5-flash");
    expect(getConfiguredModel()).toBe("gemini-3.8-flash");
    expect(getModelCandidates()).not.toContain("gemini-2.5-flash");
  });

  it("includes configured fallbacks and excludes retired models", () => {
    vi.stubEnv("GEMINI_RUNTIME_MODEL", "gemini-3.8-flash");
    vi.stubEnv(
      "GEMINI_FALLBACK_MODELS",
      "gemini-3.5-flash, gemini-2.5-flash-lite, gemini-3.1-flash-lite"
    );
    const models = getModelCandidates();
    expect(models[0]).toBe("gemini-3.8-flash");
    expect(models).toContain("gemini-3.5-flash");
    expect(models).toContain("gemini-3.1-flash-lite");
    expect(models).not.toContain("gemini-2.5-flash-lite");
  });

  it("strips quotes and models/ prefixes from configured env values", () => {
    vi.stubEnv("GEMINI_RUNTIME_MODEL", '"models/gemini-3.5-flash"');
    expect(getConfiguredModel()).toBe("gemini-3.5-flash");
  });

  it("uses the current embedding model and database-compatible dimensions", () => {
    vi.stubEnv("GEMINI_EMBEDDING_MODEL", "text-embedding-004");
    expect(getEmbeddingModel()).toBe("gemini-embedding-001");
    expect(getEmbeddingCandidates()).not.toContain("text-embedding-004");
    vi.stubEnv("GEMINI_EMBEDDING_DIMENSIONS", "512");
    expect(getEmbeddingDimensions()).toBe(512);
    vi.stubEnv("GEMINI_EMBEDDING_DIMENSIONS", "99999");
    expect(getEmbeddingDimensions()).toBe(768);
  });

  it("falls back to the next model when the configured model is retired", async () => {
    vi.stubEnv("GEMINI_RUNTIME_MODEL", "gemini-2.5-flash");
    vi.stubEnv("GEMINI_FALLBACK_MODELS", "gemini-3.5-flash-lite");

    const calls: string[] = [];
    const fakeAi = {
      models: {
        generateContent: async ({ model }: { model: string }) => {
          calls.push(model);
          if (model === "gemini-3.8-flash") {
            throw Object.assign(new Error("model retired"), { status: 404 });
          }
          return { text: '{"candidates":[]}' };
        },
      },
    };

    const result = await generateContentWithFallback<{ text?: string }>(
      fakeAi as never,
      { contents: "hello" },
      { retriesPerModel: 0 }
    );

    expect(result.model).toBe("gemini-3.5-flash-lite");
    expect(result.fallbackUsed).toBe(true);
    expect(calls).toContain("gemini-3.8-flash");
  });

  it("retries transient errors before giving up on a model", async () => {
    vi.stubEnv("GEMINI_RUNTIME_MODEL", "gemini-3.8-flash");
    vi.stubEnv("GEMINI_FALLBACK_MODELS", "gemini-3.5-flash");

    let attempts = 0;
    const fakeAi = {
      models: {
        generateContent: async () => {
          attempts++;
          if (attempts === 1) {
            throw Object.assign(new Error("high demand"), { status: 503 });
          }
          return { text: "ok" };
        },
      },
    };

    const result = await generateContentWithFallback<{ text?: string }>(
      fakeAi as never,
      { contents: "hello" },
      { retriesPerModel: 1 }
    );
    expect(result.model).toBe("gemini-3.8-flash");
    expect(result.attempts).toBe(2);
  });

  it("treats network/socket errors as transient and falls back to the next model", async () => {
    vi.stubEnv("GEMINI_RUNTIME_MODEL", "gemini-3.8-flash");
    vi.stubEnv("GEMINI_FALLBACK_MODELS", "gemini-3.5-flash-lite");

    const socketErr = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNRESET", message: "socket hang up" },
    });
    expect(isTransientError(socketErr)).toBe(true);

    const calls: string[] = [];
    const fakeAi = {
      models: {
        generateContent: async ({ model }: { model: string }) => {
          calls.push(model);
          if (model === "gemini-3.8-flash") {
            throw socketErr;
          }
          return { text: '{"candidates":[]}' };
        },
      },
    };

    const result = await generateContentWithFallback<{ text?: string }>(
      fakeAi as never,
      { contents: "hello" },
      { retriesPerModel: 0 }
    );

    expect(result.model).toBe("gemini-3.5-flash-lite");
    expect(result.fallbackUsed).toBe(true);
    expect(calls).toEqual(["gemini-3.8-flash", "gemini-3.5-flash-lite"]);
  });
});
