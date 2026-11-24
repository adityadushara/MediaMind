import { describe, it, expect } from "vitest";
import {
  normalizeContentType,
  sanitizeExternalUrl,
  resolveDirectUrl,
  extractYouTubeVideoId,
  providerSearchUrl,
} from "@/lib/server/linkResolver";

describe("linkResolver", () => {
  it("always returns a usable destination for every content type", () => {
    const types = [
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
    ] as const;

    for (const contentType of types) {
      const url = resolveDirectUrl({
        title: "Rich Dad Poor Dad",
        creator: "Robert Kiyosaki",
        contentType,
      });
      expect(url).toMatch(/^https?:\/\//);
    }
  });

  it("rejects unsafe schemes and accepts absolute https URLs", () => {
    expect(sanitizeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeExternalUrl("data:text/html;base64,abc")).toBeNull();
    expect(sanitizeExternalUrl("not a url")).toBeNull();
    expect(sanitizeExternalUrl("https://example.com/book")).toBe(
      "https://example.com/book"
    );
  });

  it("prefers a URL extracted from the screenshot", () => {
    const url = resolveDirectUrl({
      title: "Some Video",
      contentType: "youtube_video",
      extractedUrl: "https://youtu.be/dQw4w9WgXcQ?si=abc",
      providerUrl: "https://www.youtube.com/results?search_query=some+video",
    });
    expect(url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("falls back to a provider search page when no provider URL exists", () => {
    const url = resolveDirectUrl({
      title: "Dune",
      creator: "Denis Villeneuve",
      contentType: "movie",
    });
    expect(url).toContain("imdb.com/find");
  });

  it("normalizes model-provided content type aliases", () => {
    expect(normalizeContentType("TV Series")).toBe("tv_show");
    expect(normalizeContentType("podcasts")).toBe("podcast");
    expect(normalizeContentType("YouTube")).toBe("youtube_video");
    expect(normalizeContentType("nonsense")).toBe("other");
  });

  it("extracts YouTube ids from watch, shorts and short links", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=abc123")).toBe("abc123");
    expect(extractYouTubeVideoId("https://youtube.com/shorts/xyz789")).toBe("xyz789");
    expect(extractYouTubeVideoId("https://youtu.be/qwerty")).toBe("qwerty");
    expect(extractYouTubeVideoId("https://example.com/video")).toBeNull();
  });

  it("builds a provider search URL with encoded query", () => {
    expect(providerSearchUrl("podcast", "Huberman Lab", "Andrew Huberman")).toContain(
      "podcasts.apple.com"
    );
  });
});
