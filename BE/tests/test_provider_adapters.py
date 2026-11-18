import pytest
import asyncio
import httpx
from unittest.mock import AsyncMock, patch

from app.adapters.metadata.rate_limiter import TokenBucketRateLimiter
from app.adapters.metadata.google_books import GoogleBooksAdapter
from app.adapters.metadata.open_library import OpenLibraryAdapter
from app.adapters.metadata.tmdb import TMDBAdapter
from app.adapters.metadata.youtube import YouTubeAdapter
from app.adapters.metadata.router import MetadataProviderRouter
from app.schemas.metadata import MetadataSearchQuery


@pytest.mark.asyncio
async def test_token_bucket_rate_limiter():
    limiter = TokenBucketRateLimiter(rate_per_second=20.0, capacity=2.0)
    # First 2 should be immediate
    await limiter.acquire(1.0)
    await limiter.acquire(1.0)
    assert limiter.tokens < 1.0


def test_youtube_video_id_extraction():
    assert YouTubeAdapter.extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert YouTubeAdapter.extract_video_id("https://youtu.be/dQw4w9WgXcQ?t=10") == "dQw4w9WgXcQ"
    assert YouTubeAdapter.extract_video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert YouTubeAdapter.extract_video_id("https://example.com/not-youtube") is None


@pytest.mark.asyncio
async def test_youtube_fallback_search():
    adapter = YouTubeAdapter(api_key="")
    query = MetadataSearchQuery(title="Huberman Lab Podcast", creator="Andrew Huberman", content_type="youtube_video")
    results = await adapter.search(query)
    assert len(results) == 1
    assert results[0].provider_name == "youtube"
    assert "Huberman" in results[0].title
    assert "youtube.com/results?search_query=" in results[0].provider_url


@pytest.mark.asyncio
async def test_google_books_normalization():
    mock_item = {
        "id": "vol_abc123",
        "volumeInfo": {
            "title": "Atomic Habits",
            "subtitle": "An Easy & Proven Way to Build Good Habits",
            "authors": ["James Clear"],
            "publishedDate": "2018-10-16",
            "description": "No matter your goals, Atomic Habits offers a proven framework...",
            "industryIdentifiers": [
                {"type": "ISBN_10", "identifier": "0735211299"},
                {"type": "ISBN_13", "identifier": "9780735211292"},
            ],
            "categories": ["Self-Help"],
            "imageLinks": {
                "thumbnail": "http://books.google.com/books/content?id=vol_abc123&printsec=frontcover&img=1"
            },
            "publisher": "Avery",
            "language": "en",
            "averageRating": 4.5,
            "infoLink": "https://books.google.com/books?id=vol_abc123",
        },
    }

    adapter = GoogleBooksAdapter(api_key="")
    normalized = adapter._normalize_item(mock_item)

    assert normalized is not None
    assert normalized.title == "Atomic Habits"
    assert normalized.creator == "James Clear"
    assert normalized.release_year == 2018
    assert normalized.isbn == "9780735211292"  # Prefers ISBN-13
    assert normalized.cover_image_url.startswith("https://")  # Enforced HTTPS
    assert normalized.genre == "Self-Help"
    assert normalized.publisher == "Avery"


@pytest.mark.asyncio
async def test_open_library_normalization():
    mock_doc = {
        "key": "/works/OL82563W",
        "title": "1984",
        "author_name": ["George Orwell"],
        "first_publish_year": 1949,
        "isbn": ["9780451524935"],
        "cover_i": 7222246,
        "publisher": ["Signet Classics"],
        "subject": ["Dystopian", "Classics"],
        "ratings_average": 4.6,
    }

    adapter = OpenLibraryAdapter()
    normalized = adapter._normalize_doc(mock_doc)

    assert normalized is not None
    assert normalized.title == "1984"
    assert normalized.creator == "George Orwell"
    assert normalized.release_year == 1949
    assert normalized.isbn == "9780451524935"
    assert "covers.openlibrary.org/b/id/7222246-L.jpg" in normalized.cover_image_url
    assert normalized.user_rating == 9.2  # 4.6 * 2


@pytest.mark.asyncio
async def test_tmdb_adapter_normalization():
    mock_movie = {
        "id": 27205,
        "media_type": "movie",
        "title": "Inception",
        "original_title": "Inception",
        "release_date": "2010-07-15",
        "overview": "Cobb, a skilled thief...",
        "poster_path": "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
        "vote_average": 8.364,
        "original_language": "en",
    }

    adapter = TMDBAdapter(api_key="mock_key")
    normalized = adapter._normalize_item(mock_movie)

    assert normalized is not None
    assert normalized.title == "Inception"
    assert normalized.release_year == 2010
    assert normalized.content_type == "movie"
    assert normalized.user_rating == 8.4
    assert "image.tmdb.org/t/p/w500" in normalized.cover_image_url


@pytest.mark.asyncio
async def test_metadata_router_dispatch():
    # Setup mocks
    mock_books = GoogleBooksAdapter()
    mock_books.search = AsyncMock(return_value=[])

    mock_ol = OpenLibraryAdapter()
    mock_ol.search = AsyncMock(return_value=[])

    mock_tmdb = TMDBAdapter()
    mock_tmdb.search = AsyncMock(return_value=[])

    mock_yt = YouTubeAdapter()
    mock_yt.search = AsyncMock(return_value=[])

    router = MetadataProviderRouter(
        google_books=mock_books,
        open_library=mock_ol,
        tmdb=mock_tmdb,
        youtube=mock_yt,
    )

    # 1. Book query dispatches to Google Books and falls back to Open Library
    book_query = MetadataSearchQuery(title="Deep Work", content_type="book")
    await router.search(book_query)
    mock_books.search.assert_called_once_with(book_query)
    mock_ol.search.assert_called_once_with(book_query)

    # 2. Movie query dispatches to TMDB
    movie_query = MetadataSearchQuery(title="Interstellar", content_type="movie")
    await router.search(movie_query)
    mock_tmdb.search.assert_called_once_with(movie_query)

    # 3. YouTube query dispatches to YouTube
    yt_query = MetadataSearchQuery(title="Andrew Huberman", content_type="youtube_video")
    await router.search(yt_query)
    mock_yt.search.assert_called_once_with(yt_query)
