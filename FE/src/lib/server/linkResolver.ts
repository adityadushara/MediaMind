import { ContentType } from "@/types";

/**
 * Direct link resolution.
 *
 * MediaMind must never show an item without a way to act on it. Provider
 * lookups fail (rate limits, missing API keys, unknown titles), so we always
 * degrade to a provider-specific or web search URL instead of returning null.
 *
 * Every URL that leaves this module is validated to be http(s) only.
 */

export const CONTENT_TYPES: ContentType[] = [
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
];

const CONTENT_TYPE_ALIASES: Record<string, ContentType> = {
  books: "book",
  ebook: "book",
  audiobook: "book",
  film: "movie",
  films: "movie",
  movies: "movie",
  tv: "tv_show",
  tv_series: "tv_show",
  tvshow: "tv_show",
  series: "tv_show",
  anime: "tv_show",
  youtube: "youtube_video",
  video: "youtube_video",
  youtube_video: "youtube_video",
  podcasts: "podcast",
  courses: "course",
  class: "course",
  tutorial: "course",
  blog: "article",
  essay: "article",
  blogs: "article",
  substack: "newsletter",
  newsletter: "newsletter",
};

export function normalizeContentType(
  value: unknown,
  fallback: ContentType = "other"
): ContentType {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((CONTENT_TYPES as string[]).includes(cleaned)) {
    return cleaned as ContentType;
  }
  return CONTENT_TYPE_ALIASES[cleaned] || fallback;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Returns a safe absolute http(s) URL, or null for anything else
 * (javascript:, data:, relative paths, malformed input).
 */
export function sanitizeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = decodeHtmlEntities(raw.trim());

  // Strip common trailing punctuation from copy-pasted text.
  value = value.replace(/[)\].,;:!?"']+$/g, "");

  if (!value) return null;

  // Accept protocol-relative URLs.
  if (value.startsWith("//")) {
    value = `https:${value}`;
  }

  // Upgrade plain www. / domain inputs that are clearly web addresses.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    if (/^(www\.|[a-z0-9-]+\.[a-z]{2,}\/)/i.test(value)) {
      value = `https://${value}`;
    } else {
      return null;
    }
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (!url.hostname || !url.hostname.includes(".")) {
    return null;
  }
  return url.toString();
}

const MAX_QUERY_LENGTH = 240;

function cleanQueryPart(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/\s+/g, " ")
    .replace(/[<>"'`]/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

function encodeQuery(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

export function buildSearchQuery(
  title: string,
  creator?: string | null,
  suffix?: string
): string {
  return [cleanQueryPart(title), cleanQueryPart(creator), cleanQueryPart(suffix)]
    .filter(Boolean)
    .join(" ");
}

export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeQuery(cleanQueryPart(query))}`;
}

export function youtubeSearchUrl(title: string, creator?: string | null): string {
  const query = buildSearchQuery(title, creator);
  return `https://www.youtube.com/results?search_query=${encodeQuery(query)}`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** Extracts a YouTube video ID from common URL shapes. */
export function extractYouTubeVideoId(raw: unknown): string | null {
  const safe = sanitizeExternalUrl(raw);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = url.searchParams.get("v");
      if (v) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
        return parts[1] || null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function openLibrarySearchUrl(title: string, creator?: string | null): string {
  return `https://openlibrary.org/search?q=${encodeQuery(buildSearchQuery(title, creator))}`;
}

export function bookSearchUrl(title: string, creator?: string | null): string {
  return `https://www.google.com/search?tbm=bks&q=${encodeQuery(
    buildSearchQuery(title, creator)
  )}`;
}

export function imdbSearchUrl(title: string, creator?: string | null, year?: number | null): string {
  const query = buildSearchQuery(title, creator, year ? String(year) : undefined);
  return `https://www.imdb.com/find/?q=${encodeQuery(query)}&s=all`;
}

export function tmdbPageUrl(
  kind: "movie" | "tv",
  externalId: string
): string | null {
  if (!/^\d+$/.test(externalId)) return null;
  return `https://www.themoviedb.org/${kind}/${externalId}`;
}

export function applePodcastsSearchUrl(title: string, creator?: string | null): string {
  return `https://podcasts.apple.com/us/search?term=${encodeQuery(
    buildSearchQuery(title, creator)
  )}`;
}

export function substackSearchUrl(title: string, creator?: string | null): string {
  return `https://substack.com/search/${encodeQuery(buildSearchQuery(title, creator))}`;
}

export function courseraSearchUrl(title: string, creator?: string | null): string {
  return `https://www.coursera.org/search?query=${encodeQuery(
    buildSearchQuery(title, creator)
  )}`;
}

export function mediumSearchUrl(title: string, creator?: string | null): string {
  return `https://medium.com/search?q=${encodeQuery(buildSearchQuery(title, creator))}`;
}

export interface ProviderMetadataShape {
  [key: string]: unknown;
}

/**
 * Extracts a canonical provider page URL from stored raw metadata. This keeps
 * direct links recoverable when the `direct_url` column is missing from an
 * older database.
 */
export function providerUrlFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const record = metadata as Record<string, unknown>;

  const directCandidates = [
    record.url,
    record.link,
    record.external_url,
    record.collectionViewUrl,
    record.infoLink,
    record.canonicalVolumeLink,
  ];
  for (const candidate of directCandidates) {
    const safe = sanitizeExternalUrl(candidate);
    if (safe) return safe;
  }

  const volumeInfo = record.volumeInfo as Record<string, unknown> | undefined;
  if (volumeInfo) {
    const safe = sanitizeExternalUrl(
      volumeInfo.canonicalVolumeLink || volumeInfo.infoLink
    );
    if (safe) return safe;
  }

  return null;
}

/**
 * Provider-specific search URL used whenever authoritative metadata is
 * missing. This is a search destination, not a fabricated entity link.
 */
export function providerSearchUrl(
  contentType: ContentType,
  title: string,
  creator?: string | null,
  year?: number | null
): string {  const cleanTitle = cleanQueryPart(title) || "media";
  switch (contentType) {
    case "youtube_video":
      return youtubeSearchUrl(cleanTitle, creator);
    case "book":
      // Google Books search needs an API key for reliable quota; Open Library
      // resolves the same query anonymously and lands on the work itself.
      return openLibrarySearchUrl(cleanTitle, creator);
    case "movie":
    case "tv_show":
    case "documentary":
      return imdbSearchUrl(cleanTitle, creator, year);
    case "podcast":
      return applePodcastsSearchUrl(cleanTitle, creator);
    case "newsletter":
      return substackSearchUrl(cleanTitle, creator);
    case "article":
      return googleSearchUrl(buildSearchQuery(cleanTitle, creator, "article"));
    case "course":
      return courseraSearchUrl(cleanTitle, creator);
    default:
      return googleSearchUrl(buildSearchQuery(cleanTitle, creator));
  }
}

export interface DirectLinkInput {
  title: string;
  creator?: string | null;
  contentType: ContentType;
  releaseYear?: number | null;
  /** URL extracted from the screenshot by the vision model. */
  extractedUrl?: string | null;
  /** Authoritative URL returned by a metadata provider. */
  providerUrl?: string | null;
  providerName?: string | null;
  externalId?: string | null;
}

/**
 * Resolves the best available destination for an item.
 *
 * Priority:
 *  1. URL visibly present in the screenshot (strongest evidence).
 *  2. Authoritative provider page (Google Books, TMDB, Open Library, ...).
 *  3. Provider-specific search page.
 */
export function resolveDirectUrl(input: DirectLinkInput): string {
  const {
    title,
    creator,
    contentType,
    releaseYear,
    extractedUrl,
    providerUrl,
    providerName,
    externalId,
  } = input;

  const extracted = sanitizeExternalUrl(extractedUrl);
  if (extracted) {
    const videoId = extractYouTubeVideoId(extracted);
    if (videoId && contentType === "youtube_video") {
      return youtubeWatchUrl(videoId);
    }
    return extracted;
  }

  const provider = sanitizeExternalUrl(providerUrl);
  if (provider) return provider;

  if (providerName === "tmdb" && externalId) {
    const kind = contentType === "tv_show" ? "tv" : "movie";
    const tmdbUrl = tmdbPageUrl(kind, externalId);
    if (tmdbUrl) return tmdbUrl;
  }

  if (providerName === "youtube" && externalId) {
    return youtubeWatchUrl(externalId);
  }

  if (providerName === "open_library" && externalId) {
    const key = externalId.startsWith("/") ? externalId : `/${externalId}`;
    const openLibrary = sanitizeExternalUrl(`https://openlibrary.org${key}`);
    if (openLibrary) return openLibrary;
  }

  return providerSearchUrl(contentType, title, creator, releaseYear);
}
