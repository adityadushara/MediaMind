/**
 * How a stored direct link should be presented.
 *
 * When no authoritative provider match exists, the resolver degrades to a
 * provider search URL. Presenting that as "Open Direct Link" promised an item
 * page and delivered a results page, so the label says what the destination
 * actually is.
 */
export interface DirectLinkInfo {
  href: string;
  isSearch: boolean;
  label: string;
}

const SEARCH_LABELS: Array<{ match: (url: URL) => boolean; label: string }> = [
  {
    match: (url) => /(^|\.)youtube\.com$/.test(url.hostname) && url.pathname.startsWith("/results"),
    label: "Search YouTube",
  },
  {
    match: (url) =>
      /(^|\.)google\.[a-z.]+$/.test(url.hostname) &&
      url.pathname.startsWith("/search") &&
      url.searchParams.get("tbm") === "bks",
    label: "Search Google Books",
  },
  {
    match: (url) => /(^|\.)google\.[a-z.]+$/.test(url.hostname) && url.pathname.startsWith("/search"),
    label: "Search the web",
  },
  {
    match: (url) => /(^|\.)openlibrary\.org$/.test(url.hostname) && url.pathname.startsWith("/search"),
    label: "Search Open Library",
  },
  {
    match: (url) => /(^|\.)imdb\.com$/.test(url.hostname) && url.pathname.startsWith("/find"),
    label: "Search IMDb",
  },
  {
    match: (url) => /(^|\.)podcasts\.apple\.com$/.test(url.hostname) && url.pathname.includes("/search"),
    label: "Search Apple Podcasts",
  },
  {
    match: (url) => /(^|\.)substack\.com$/.test(url.hostname) && url.pathname.startsWith("/search"),
    label: "Search Substack",
  },
  {
    match: (url) => /(^|\.)coursera\.org$/.test(url.hostname) && url.pathname.startsWith("/search"),
    label: "Search Coursera",
  },
  {
    match: (url) => /(^|\.)medium\.com$/.test(url.hostname) && url.pathname.startsWith("/search"),
    label: "Search Medium",
  },
];

export function describeDirectLink(
  url: string | null | undefined,
  fallbackLabel = "Open Direct Link"
): DirectLinkInfo {
  if (!url) return { href: "", isSearch: false, label: fallbackLabel };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { href: url, isSearch: false, label: fallbackLabel };
  }

  const destination = SEARCH_LABELS.find((entry) => entry.match(parsed));
  return destination
    ? { href: url, isSearch: true, label: destination.label }
    : { href: url, isSearch: false, label: fallbackLabel };
}
