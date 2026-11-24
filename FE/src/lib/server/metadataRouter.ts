import { ContentType } from "@/types";
import { sanitizeExternalUrl } from "./linkResolver";

export interface NormalizedMetadataResult {
  provider_name: string;
  external_id: string;
  title: string;
  creator: string | null;
  release_year: number | null;
  overview: string | null;
  cover_image_url: string | null;
  direct_url: string | null;
  raw_metadata: Record<string, unknown>;
}

const REQUEST_TIMEOUT_MS = 5000;

const BASE_HEADERS = {
  "User-Agent": "MediaMind/1.0 (+https://github.com/mediamind)",
  Accept: "application/json",
};

function parseYear(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const year = parseInt(String(raw).slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1000 || year > new Date().getFullYear() + 2) {
    return null;
  }
  return year;
}

function httpsUrl(url: unknown): string | null {
  return sanitizeExternalUrl(typeof url === "string" ? url : null);
}

export class MetadataRouter {
  /**
   * Dispatches a title lookup according to content type. Every provider is
   * best-effort: a missing API key or a rate limit must never fail an upload.
   */
  static async search(query: {
    title: string;
    creator?: string | null;
    content_type: ContentType;
    release_year?: number | null;
  }): Promise<NormalizedMetadataResult | null> {
    const { title, creator, content_type, release_year } = query;
    if (!title || title.trim().length === 0) return null;

    try {
      if (content_type === "book") {
        return (await this.searchGoogleBooks(title, creator)) || (await this.searchOpenLibrary(title, creator));
      }

      if (content_type === "movie" || content_type === "tv_show" || content_type === "documentary") {
        return await this.searchTMDB(title, content_type, release_year);
      }

      if (content_type === "youtube_video") {
        return await this.searchYouTube(title, creator);
      }

      if (content_type === "podcast") {
        return await this.searchPodcast(title, creator);
      }
    } catch (err) {
      // Third-party metadata is an enhancement, never a hard dependency.
      console.warn(`[Metadata] ${content_type} lookup skipped: ${String(err)}`);
      return null;
    }

    return null;
  }

  private static async searchGoogleBooks(
    title: string,
    creator?: string | null
  ): Promise<NormalizedMetadataResult | null> {
    try {
      const apiKey =
        process.env.GOOGLE_BOOKS_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        "";
      const q = creator ? `intitle:${title} inauthor:${creator}` : `intitle:${title}`;
      const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : "";
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
        q
      )}&maxResults=1&printType=books${keyParam}`;

      const res = await fetch(url, {
        headers: BASE_HEADERS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as {
        items?: Array<{ id: string; volumeInfo?: Record<string, unknown> }>;
      };
      const item = data.items?.[0];
      if (!item) return null;

      const info = (item.volumeInfo || {}) as {
        title?: string;
        authors?: string[];
        publishedDate?: string;
        description?: string;
        imageLinks?: { thumbnail?: string; smallThumbnail?: string };
        canonicalVolumeLink?: string;
        infoLink?: string;
      };

      const cover = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;

      return {
        provider_name: "google_books",
        external_id: item.id,
        title: info.title || title,
        creator: info.authors?.join(", ") || creator || null,
        release_year: parseYear(info.publishedDate),
        overview: info.description || null,
        cover_image_url: httpsUrl(cover),
        direct_url: httpsUrl(info.canonicalVolumeLink || info.infoLink),
        raw_metadata: item as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }

  private static async searchOpenLibrary(
    title: string,
    creator?: string | null
  ): Promise<NormalizedMetadataResult | null> {
    try {
      // `q` is more forgiving than the deprecated `title`/`author` params.
      const query = creator ? `${title} ${creator}` : title;
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(
        query
      )}&limit=1&fields=key,title,author_name,first_publish_year,cover_i`;

      const res = await fetch(url, {
        headers: BASE_HEADERS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as {
        docs?: Array<{
          key?: string;
          title?: string;
          author_name?: string[];
          first_publish_year?: number;
          cover_i?: number;
        }>;
      };
      const doc = data.docs?.[0];
      if (!doc?.title) return null;

      const cover = doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : null;

      return {
        provider_name: "open_library",
        external_id: doc.key || "",
        title: doc.title,
        creator: doc.author_name?.join(", ") || creator || null,
        release_year: parseYear(doc.first_publish_year),
        overview: null,
        cover_image_url: httpsUrl(cover),
        direct_url: doc.key ? httpsUrl(`https://openlibrary.org${doc.key}`) : null,
        raw_metadata: doc as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }

  private static async searchTMDB(
    title: string,
    contentType: ContentType,
    year?: number | null
  ): Promise<NormalizedMetadataResult | null> {
    const bearer = (process.env.TMDB_BEARER_TOKEN || "").trim();
    const apiKey = (process.env.TMDB_API_KEY || "").trim();
    if (!bearer && !apiKey) return null;

    try {
      const endpoint = contentType === "tv_show" ? "tv" : "movie";
      const yearParam = year
        ? endpoint === "movie"
          ? `&year=${year}`
          : `&first_air_date_year=${year}`
        : "";

      const url = bearer
        ? `https://api.themoviedb.org/3/search/${endpoint}?query=${encodeURIComponent(
            title
          )}${yearParam}`
        : `https://api.themoviedb.org/3/search/${endpoint}?api_key=${encodeURIComponent(
            apiKey
          )}&query=${encodeURIComponent(title)}${yearParam}`;

      const res = await fetch(url, {
        headers: bearer
          ? { ...BASE_HEADERS, Authorization: `Bearer ${bearer}` }
          : BASE_HEADERS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as {
        results?: Array<{
          id: number;
          title?: string;
          name?: string;
          release_date?: string;
          first_air_date?: string;
          overview?: string;
          poster_path?: string;
        }>;
      };
      const match = data.results?.[0];
      if (!match) return null;

      const date = match.release_date || match.first_air_date;
      const poster = match.poster_path
        ? `https://image.tmdb.org/t/p/w500${match.poster_path}`
        : null;

      return {
        provider_name: "tmdb",
        external_id: String(match.id),
        title: match.title || match.name || title,
        creator: null,
        release_year: parseYear(date),
        overview: match.overview || null,
        cover_image_url: httpsUrl(poster),
        direct_url: httpsUrl(`https://www.themoviedb.org/${endpoint}/${match.id}`),
        raw_metadata: match as unknown as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }

  private static async searchYouTube(
    title: string,
    channel?: string | null
  ): Promise<NormalizedMetadataResult | null> {
    const apiKey = (process.env.YOUTUBE_API_KEY || "").trim();
    if (!apiKey) return null;

    try {
      const q = channel ? `${title} ${channel}` : title;
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
        q
      )}&type=video&maxResults=1&key=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url, {
        headers: BASE_HEADERS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as {
        items?: Array<{
          id?: { videoId?: string };
          snippet?: {
            title?: string;
            channelTitle?: string;
            publishedAt?: string;
            description?: string;
            thumbnails?: { high?: { url?: string }; default?: { url?: string } };
          };
        }>;
      };
      const item = data.items?.[0];
      if (!item) return null;

      const videoId = item.id?.videoId;
      if (!videoId) return null;

      const snippet = item.snippet || {};

      return {
        provider_name: "youtube",
        external_id: videoId,
        title: snippet.title || title,
        creator: snippet.channelTitle || channel || null,
        release_year: parseYear(snippet.publishedAt),
        overview: snippet.description || null,
        cover_image_url: httpsUrl(
          snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url
        ),
        direct_url: httpsUrl(`https://www.youtube.com/watch?v=${videoId}`),
        raw_metadata: item as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }

  private static async searchPodcast(
    title: string,
    creator?: string | null
  ): Promise<NormalizedMetadataResult | null> {
    try {
      const term = creator ? `${title} ${creator}` : title;
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
        term
      )}&media=podcast&entity=podcast&limit=1`;

      const res = await fetch(url, {
        headers: BASE_HEADERS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as {
        results?: Array<{
          collectionId?: number;
          collectionName?: string;
          artistName?: string;
          releaseDate?: string;
          collectionViewUrl?: string;
          artworkUrl600?: string;
          artworkUrl100?: string;
        }>;
      };
      const item = data.results?.[0];
      if (!item?.collectionName) return null;

      return {
        provider_name: "apple_podcasts",
        external_id: item.collectionId ? String(item.collectionId) : "",
        title: item.collectionName,
        creator: item.artistName || creator || null,
        release_year: parseYear(item.releaseDate),
        overview: null,
        cover_image_url: httpsUrl(item.artworkUrl600 || item.artworkUrl100),
        direct_url: httpsUrl(item.collectionViewUrl),
        raw_metadata: item as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }
}
