import pytest
from app.services.entity_resolution import EntityResolutionEngine, normalize_title, token_sort_similarity
from app.schemas.common import GeminiCandidateOutput
from app.schemas.metadata import NormalizedMetadataRecord


def test_normalize_title():
    assert normalize_title("The Great Gatsby!") == "great gatsby"
    assert normalize_title("  A Tale of Two Cities: Part 1  ") == "tale of two cities part 1"


def test_token_sort_similarity():
    assert token_sort_similarity("Applications Data-Intensive Designing", "Designing Data-Intensive Applications") >= 0.95
    assert token_sort_similarity("Clean Code", "Dirty Harry") < 0.5


def test_exact_match_high_score():
    engine = EntityResolutionEngine()
    clue = GeminiCandidateOutput(
        title="Atomic Habits",
        creator="James Clear",
        content_type="book",
        year_clue=2018,
    )
    record = NormalizedMetadataRecord(
        provider_name="google_books",
        external_id="vol_123",
        content_type="book",
        title="Atomic Habits",
        creator="James Clear",
        release_year=2018,
    )

    match = engine.score_candidate(clue, record)
    assert match.scores.composite_score >= 0.85
    assert match.is_top_match is True
    assert any("Exact title match" in pill for pill in match.scores.explanation_pills)
    assert any("Creator verified" in pill for pill in match.scores.explanation_pills)


def test_isbn_override_guaranteed_match():
    engine = EntityResolutionEngine()
    clue = GeminiCandidateOutput(
        title="Some Book Title",
        visible_text=["ISBN: 978-0-13-235088-4", "Prentice Hall"],
        content_type="book",
    )
    record = NormalizedMetadataRecord(
        provider_name="google_books",
        external_id="vol_clean_code",
        content_type="book",
        title="Clean Code",
        isbn="9780132350884",
    )

    match = engine.score_candidate(clue, record)
    assert match.scores.composite_score == 1.0
    assert match.is_top_match is True
    assert any("Verified by ISBN barcode" in pill for pill in match.scores.explanation_pills)


def test_creator_discrepancy_penalty():
    engine = EntityResolutionEngine()
    clue = GeminiCandidateOutput(
        title="1984",
        creator="George Orwell",
        content_type="book",
    )
    record = NormalizedMetadataRecord(
        provider_name="open_library",
        external_id="work_other",
        content_type="book",
        title="1984",
        creator="Stephen King",
    )

    match = engine.score_candidate(clue, record)
    assert match.scores.creator_score <= 0.1
    assert any("Creator discrepancy" in pill for pill in match.scores.explanation_pills)


def test_candidate_ranking():
    engine = EntityResolutionEngine()
    clue = GeminiCandidateOutput(
        title="Inception",
        content_type="movie",
        year_clue=2010,
    )
    records = [
        NormalizedMetadataRecord(
            provider_name="tmdb",
            external_id="m1",
            content_type="movie",
            title="Inception: The Documentary",
            release_year=2012,
        ),
        NormalizedMetadataRecord(
            provider_name="tmdb",
            external_id="m2",
            content_type="movie",
            title="Inception",
            release_year=2010,
        ),
    ]

    ranked = engine.rank_candidates(clue, records)
    assert len(ranked) == 2
    assert ranked[0].record.external_id == "m2"
    assert ranked[0].scores.composite_score > ranked[1].scores.composite_score
    assert ranked[0].is_top_match is True
