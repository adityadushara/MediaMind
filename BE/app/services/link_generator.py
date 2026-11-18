import urllib.parse
from typing import Optional


def generate_direct_link(
    title: str,
    creator: Optional[str] = None,
    content_type: str = "book",
    raw_url: Optional[str] = None,
) -> str:
    """
    Returns an authoritative, clickable direct link for a media item.
    If a valid URL was detected in the screenshot, preserves it.
    Otherwise, synthesizes a direct canonical web/search destination.
    """
    if raw_url and (raw_url.startswith("http://") or raw_url.startswith("https://")):
        return raw_url.strip()

    query_parts = [title.strip()]
    if creator and creator.strip():
        query_parts.append(creator.strip())
    query = " ".join(query_parts)
    encoded_query = urllib.parse.quote_plus(query)

    content_type = (content_type or "book").lower()

    if content_type == "youtube_video":
        return f"https://www.youtube.com/results?search_query={encoded_query}"
    elif content_type == "book":
        return f"https://www.google.com/search?tbm=bks&q={encoded_query}"
    elif content_type in ("movie", "tv_show", "documentary"):
        return f"https://www.imdb.com/find/?q={encoded_query}"
    elif content_type == "course":
        return f"https://www.google.com/search?q={encoded_query}+course"
    elif content_type == "podcast":
        return f"https://www.google.com/search?q={encoded_query}+podcast"
    elif content_type in ("article", "newsletter"):
        if "medium" in query.lower():
            return f"https://medium.com/search?q={encoded_query}"
        return f"https://substack.com/search/{encoded_query}"
    else:
        return f"https://www.google.com/search?q={encoded_query}"


def resolve_subcategory(content_type: str, subcategory: Optional[str] = None) -> str:
    """
    Ensures a clean, friendly subcategory is assigned for cataloging.
    """
    if subcategory and subcategory.strip():
        clean = subcategory.strip().title()
        # Common aliases normalization
        if clean.lower() in ("psych", "mental health"):
            return "Psychology"
        if clean.lower() in ("finance", "wealth", "investing"):
            return "Money & Finance"
        if clean.lower() in ("self improvement", "self help", "growth"):
            return "Self-Help"
        if clean.lower() in ("coding", "dev", "tech"):
            return "Programming"
        if clean.lower() in ("article", "essay", "post"):
            return "Articles & Essays"
        if clean.lower() in ("newsletter", "substack"):
            return "Substack & Newsletters"
        return clean

    defaults = {
        "book": "General Non-Fiction",
        "movie": "Feature Film",
        "tv_show": "Series",
        "youtube_video": "Web Video",
        "documentary": "Documentary",
        "podcast": "Audio Episode",
        "course": "Tutorial",
        "article": "Articles & Essays",
        "newsletter": "Substack & Newsletters",
        "other": "General Media",
    }
    return defaults.get((content_type or "").lower(), "General")
