import re
import difflib
import logging
from typing import List, Optional, Tuple
from app.schemas.metadata import (
    NormalizedMetadataRecord,
    MatchFeatureScores,
    ProviderCandidateMatch,
)
from app.schemas.common import GeminiCandidateOutput, ContentType

logger = logging.getLogger(__name__)


def normalize_title(title: str) -> str:
    """Lowercases, strips leading articles and punctuation."""
    if not title:
        return ""
    t = title.lower().strip()
    t = re.sub(r"^(the|a|an)\s+", "", t)
    t = re.sub(r"[^\w\s]", "", t)
    return " ".join(t.split())


def token_sort_similarity(s1: str, s2: str) -> float:
    """Computes similarity after tokenizing and sorting word tokens."""
    w1 = " ".join(sorted(normalize_title(s1).split()))
    w2 = " ".join(sorted(normalize_title(s2).split()))
    if not w1 or not w2:
        return 0.0
    return difflib.SequenceMatcher(None, w1, w2).ratio()


class EntityResolutionEngine:
    """
    Evaluates external provider metadata records against Gemini visual clues
    and computes calibrated feature scores, confidence weights, and explanation pills.
    """

    W_TITLE = 0.45
    W_CREATOR = 0.25
    W_TYPE = 0.15
    W_YEAR = 0.10
    W_CLUES = 0.05

    TYPE_COMPATIBILITY = {
        ("book", "book"): 1.0,
        ("movie", "movie"): 1.0,
        ("tv_show", "tv_show"): 1.0,
        ("youtube_video", "youtube_video"): 1.0,
        ("podcast", "podcast"): 1.0,
        ("course", "course"): 1.0,
        ("movie", "tv_show"): 0.4,
        ("tv_show", "movie"): 0.4,
        ("book", "movie"): 0.2,
        ("movie", "book"): 0.2,
    }

    def compute_title_score(
        self, clue_title: str, candidate_title: str, original_title: Optional[str] = None
    ) -> Tuple[float, Optional[str]]:
        t_clue = normalize_title(clue_title)
        t_cand = normalize_title(candidate_title)

        if not t_clue or not t_cand:
            return 0.0, None

        if t_clue == t_cand:
            return 1.0, f"Exact title match ('{candidate_title}')"

        # Subtitle containment
        if t_clue in t_cand or t_cand in t_clue:
            ratio = min(len(t_clue), len(t_cand)) / max(len(t_clue), len(t_cand))
            score = max(0.85, ratio)
            return score, f"Title containment match ('{candidate_title}')"

        token_score = token_sort_similarity(clue_title, candidate_title)

        if original_title:
            orig_score = token_sort_similarity(clue_title, original_title)
            if orig_score > token_score:
                return orig_score, f"Original title match ('{original_title}')"

        if token_score >= 0.8:
            return token_score, f"High title similarity ({int(token_score * 100)}%)"
        return token_score, None

    def compute_creator_score(
        self, clue_creator: Optional[str], candidate_creator: Optional[str]
    ) -> Tuple[float, Optional[str]]:
        if not clue_creator:
            return 0.5, None  # Neutral

        if not candidate_creator:
            return 0.5, None  # Neutral

        c1 = normalize_title(clue_creator)
        c2 = normalize_title(candidate_creator)

        if c1 == c2:
            return 1.0, f"Creator verified: {candidate_creator}"

        # Check surname match (e.g., 'Kleppmann' in 'Martin Kleppmann')
        c1_words = c1.split()
        c2_words = c2.split()
        if c1_words and c2_words and c1_words[-1] == c2_words[-1]:
            return 0.85, f"Creator surname match: {candidate_creator}"

        # Substring overlap
        if c1 in c2 or c2 in c1:
            return 0.80, f"Creator name overlap: {candidate_creator}"

        # Contradiction
        return 0.1, f"Creator discrepancy ({clue_creator} vs {candidate_creator})"

    def compute_type_score(
        self, clue_type: Optional[str], candidate_type: str
    ) -> Tuple[float, Optional[str]]:
        if not clue_type or clue_type == "other":
            return 0.6, None

        key = (clue_type.lower(), candidate_type.lower())
        score = self.TYPE_COMPATIBILITY.get(key, 0.3)
        if score == 1.0:
            return 1.0, f"Media type matches: {candidate_type}"
        elif score < 0.5:
            return score, f"Media format conflict ({clue_type} vs {candidate_type})"
        return score, None

    def compute_year_score(
        self, clue_year: Optional[int], candidate_year: Optional[int]
    ) -> Tuple[float, Optional[str]]:
        if not clue_year or not candidate_year:
            return 0.5, None  # Neutral

        delta = abs(clue_year - candidate_year)
        if delta == 0:
            return 1.0, f"Release year matches: {candidate_year}"
        elif delta == 1:
            return 0.85, f"Release year close ({candidate_year} vs {clue_year})"
        elif delta <= 3:
            return 0.60, f"Release year within 3 years ({candidate_year})"
        else:
            return 0.10, f"Year discrepancy ({candidate_year} vs {clue_year})"

    def compute_clues_score(
        self, visible_texts: List[str], identifying_clues: List[str], record: NormalizedMetadataRecord
    ) -> Tuple[float, Optional[str]]:
        if not visible_texts and not identifying_clues:
            return 0.5, None

        all_clues = [c.lower() for c in (visible_texts + identifying_clues) if c]
        matched = 0
        search_corpus = f"{record.title} {record.creator or ''} {record.overview or ''} {record.publisher or ''}".lower()

        for clue in all_clues:
            if len(clue) >= 4 and clue in search_corpus:
                matched += 1

        if matched > 0:
            return min(1.0, 0.5 + matched * 0.2), f"{matched} visual clue(s) confirmed in metadata"
        return 0.5, None

    def score_candidate(
        self,
        gemini_clue: GeminiCandidateOutput,
        record: NormalizedMetadataRecord,
    ) -> ProviderCandidateMatch:
        pills: List[str] = []

        # 1. ISBN exact match override
        if record.isbn:
            clean_rec_isbn = record.isbn.replace("-", "").strip()
            for text in gemini_clue.visible_text:
                clean_text = text.replace("-", "").strip()
                if clean_rec_isbn and clean_rec_isbn in clean_text:
                    pills.append(f"* Verified by ISBN barcode / text ({record.isbn})")
                    scores = MatchFeatureScores(
                        title_score=1.0,
                        creator_score=1.0,
                        type_score=1.0,
                        year_score=1.0,
                        clues_score=1.0,
                        composite_score=1.0,
                        explanation_pills=pills,
                    )
                    return ProviderCandidateMatch(record=record, scores=scores, is_top_match=True)

        # 2. Individual feature scores
        s_title, pill_title = self.compute_title_score(
            gemini_clue.title, record.title, record.original_title
        )
        if pill_title:
            pills.append(pill_title)

        s_creator, pill_creator = self.compute_creator_score(gemini_clue.creator, record.creator)
        if pill_creator:
            pills.append(pill_creator)

        s_type, pill_type = self.compute_type_score(gemini_clue.content_type, record.content_type)
        if pill_type:
            pills.append(pill_type)

        s_year, pill_year = self.compute_year_score(gemini_clue.year_clue, record.release_year)
        if pill_year:
            pills.append(pill_year)

        s_clues, pill_clues = self.compute_clues_score(
            gemini_clue.visible_text, gemini_clue.identifying_clues, record
        )
        if pill_clues:
            pills.append(pill_clues)

        # 3. Composite score
        composite = (
            self.W_TITLE * s_title
            + self.W_CREATOR * s_creator
            + self.W_TYPE * s_type
            + self.W_YEAR * s_year
            + self.W_CLUES * s_clues
        )
        composite = round(min(1.0, max(0.0, composite)), 3)

        scores = MatchFeatureScores(
            title_score=round(s_title, 3),
            creator_score=round(s_creator, 3),
            type_score=round(s_type, 3),
            year_score=round(s_year, 3),
            clues_score=round(s_clues, 3),
            composite_score=composite,
            explanation_pills=pills,
        )

        return ProviderCandidateMatch(
            record=record,
            scores=scores,
            is_top_match=(composite >= 0.85),
        )

    def rank_candidates(
        self,
        gemini_clue: GeminiCandidateOutput,
        records: List[NormalizedMetadataRecord],
    ) -> List[ProviderCandidateMatch]:
        """
        Scores and ranks all candidate records in descending order of composite score.
        """
        matches = [self.score_candidate(gemini_clue, r) for r in records]
        matches.sort(key=lambda m: m.scores.composite_score, reverse=True)

        if matches:
            # Mark the highest scoring match if it clears threshold
            top_score = matches[0].scores.composite_score
            for m in matches:
                m.is_top_match = (m.scores.composite_score == top_score and top_score >= 0.60)

        return matches
