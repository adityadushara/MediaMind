import { describe, it, expect } from "vitest";
import { normalizeCandidates } from "@/lib/server/geminiService";

describe("gemini candidate normalization", () => {
  it("rejects entries without a title", () => {
    const result = normalizeCandidates([
      { title: "", content_type: "book", confidence: 0.9 },
      { content_type: "book", confidence: 0.9 },
    ]);
    expect(result).toHaveLength(0);
  });

  it("converts percentage confidence into a 0-1 score", () => {
    const [candidate] = normalizeCandidates([
      { title: "Dune", content_type: "movie", confidence: 92 },
    ]);
    expect(candidate.confidence).toBe(0.92);
  });

  it("clamps out-of-range confidence and drops unsafe URLs", () => {
    const [candidate] = normalizeCandidates([
      {
        title: "Dune",
        content_type: "movie",
        confidence: 150,
        direct_url: "javascript:alert(1)",
      },
    ]);
    expect(candidate.confidence).toBe(1);
    expect(candidate.direct_url).toBeNull();
  });

  it("deduplicates repeated titles", () => {
    const result = normalizeCandidates([
      { title: "Dune", content_type: "movie", confidence: 0.8 },
      { title: "  dune ", content_type: "movie", confidence: 0.7 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Dune");
  });

  it("normalizes invalid bounding boxes and years", () => {
    const [candidate] = normalizeCandidates([
      {
        title: "Dune",
        content_type: "movie",
        confidence: 0.8,
        release_year: 99999,
        bounding_box: { x_min: 900, y_min: 100, x_max: 10, y_max: 500 },
      },
    ]);
    expect(candidate.release_year).toBeNull();
    expect(candidate.bounding_box).toBeNull();
  });

  it("keeps valid bounding boxes within 0-1000", () => {
    const [candidate] = normalizeCandidates([
      {
        title: "Dune",
        content_type: "movie",
        confidence: 0.8,
        bounding_box: { x_min: -20, y_min: 100, x_max: 1200, y_max: 500 },
      },
    ]);
    expect(candidate.bounding_box).toEqual({
      x_min: 0,
      y_min: 100,
      x_max: 1000,
      y_max: 500,
    });
  });
});
