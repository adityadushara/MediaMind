from app.services.link_generator import generate_direct_link, resolve_subcategory


def test_resolve_subcategory():
    assert resolve_subcategory("book", "psychology") == "Psychology"
    assert resolve_subcategory("book", "habits") == "Habits"
    assert resolve_subcategory("book", "finance") == "Money & Finance"
    assert resolve_subcategory("book", None) == "General Non-Fiction"
    assert resolve_subcategory("youtube_video", None) == "Web Video"
    assert resolve_subcategory("course", "coding") == "Programming"
    assert resolve_subcategory("article", None) == "Articles & Essays"
    assert resolve_subcategory("newsletter", "substack") == "Substack & Newsletters"


def test_generate_direct_link():
    # Raw URL preservation
    raw = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert generate_direct_link("Never Gonna Give You Up", "Rick Astley", "youtube_video", raw) == raw

    # YouTube search link synthesis
    yt_link = generate_direct_link("How to learn Python", "FreeCodeCamp", "youtube_video")
    assert "youtube.com/results?search_query=" in yt_link
    assert "How+to+learn+Python" in yt_link

    # Book search link synthesis
    book_link = generate_direct_link("Atomic Habits", "James Clear", "book")
    assert "google.com/search?tbm=bks" in book_link
    assert "Atomic+Habits" in book_link

    # Movie search link synthesis
    movie_link = generate_direct_link("Inception", "Christopher Nolan", "movie")
    assert "imdb.com/find/?q=" in movie_link
    assert "Inception" in movie_link

    # Substack / Article search link synthesis
    article_link = generate_direct_link("The Pragmatic Engineer", "Gergely Orosz", "article")
    assert "substack.com/search/" in article_link
    assert "The+Pragmatic+Engineer" in article_link
