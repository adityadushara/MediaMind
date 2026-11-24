import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { GeminiService } from "@/lib/server/geminiService";

/**
 * Live Gemini smoke test.
 *
 * Disabled by default so CI does not require network access or paid quota.
 * Run manually with:
 *   RUN_LIVE_AI_TESTS=1 GEMINI_API_KEY=... pnpm vitest run src/__tests__/live_gemini.integration.test.ts
 */
const runLive = process.env.RUN_LIVE_AI_TESTS === "1" && Boolean(process.env.GEMINI_API_KEY);

describe.skipIf(!runLive)("live Gemini extraction", () => {
  it("identifies a media item from a real screenshot", async () => {
    const screenshot = path.resolve(
      process.cwd(),
      "../storage_data/screenshots/00000000-0000-0000-0000-000000000001/54143dba-38af-4584-b5b9-b8262c68bc4b.jpg"
    );
    if (!fs.existsSync(screenshot)) {
      throw new Error(`Test screenshot missing at ${screenshot}`);
    }

    const buffer = fs.readFileSync(screenshot);
    const result = await GeminiService.extractMediaFromImage(buffer, "image/jpeg");

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].title.length).toBeGreaterThan(0);
    expect(result.candidates[0].content_type).toBeTruthy();
    expect(result.candidates[0].confidence).toBeGreaterThan(0);
    expect(result.model_name).not.toBe("gemini-2.5-flash");
  }, 180_000);

  it("generates a 768-dimension embedding", async () => {
    const vector = await GeminiService.generateEmbedding(
      "Rich Dad Poor Dad by Robert Kiyosaki. book in Finance."
    );
    expect(vector).toHaveLength(768);
    expect(vector.some((value) => value !== 0)).toBe(true);
  }, 60_000);
});
