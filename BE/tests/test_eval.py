import json
from pathlib import Path
import pytest

from app.eval.runner import (
    calculate_iou,
    is_title_match,
    evaluate_predictions,
    run_evaluation,
)


def test_iou_calculation():
    # 1. Identical bounding boxes -> IoU = 1.0
    box_a = {"x_min": 100, "y_min": 100, "x_max": 300, "y_max": 300}
    assert calculate_iou(box_a, box_a) == 1.0

    # 2. Completely disjoint boxes -> IoU = 0.0
    box_b = {"x_min": 400, "y_min": 400, "x_max": 600, "y_max": 600}
    assert calculate_iou(box_a, box_b) == 0.0

    # 3. Partial overlap:
    # box_1: 0-100 x 0-100 (area 10000)
    # box_2: 50-150 x 0-100 (area 10000)
    # intersection: 50-100 x 0-100 (area 5000)
    # union: 10000 + 10000 - 5000 = 15000
    # IoU: 5000 / 15000 = 0.33333
    box_1 = {"x_min": 0, "y_min": 0, "x_max": 100, "y_max": 100}
    box_2 = {"x_min": 50, "y_min": 0, "x_max": 150, "y_max": 100}
    iou = calculate_iou(box_1, box_2)
    assert abs(iou - 0.33333) < 0.001


def test_is_title_match():
    # Exact match
    assert is_title_match("Clean Code", "Clean Code") is True
    # Case insensitivity
    assert is_title_match("clean code", "Clean Code") is True
    # Substring inclusion
    assert is_title_match("Designing Data-Intensive Applications", "Designing Data-Intensive Applications (Book)") is True
    # Non-match
    assert is_title_match("Inception", "The Matrix") is False


def test_evaluate_predictions_metrics():
    ground_truth = [
        {
            "id": "tc1",
            "expected_items": [
                {
                    "title": "Clean Architecture",
                    "creator": "Robert C. Martin",
                    "content_type": "book",
                    "expected_bbox": {"x_min": 100, "y_min": 100, "x_max": 500, "y_max": 500},
                }
            ],
        },
        {
            "id": "tc2",
            "expected_items": [
                {
                    "title": "Lex Fridman Podcast #400",
                    "creator": "Lex Fridman",
                    "content_type": "podcast",
                }
            ],
        },
    ]

    predictions = [
        {
            "id": "tc1",
            "candidates": [
                {
                    "title": "Clean Architecture",
                    "creator": "Robert Martin",
                    "content_type": "book",
                    "confidence": 0.95,
                    "bounding_box": {"x_min": 100, "y_min": 100, "x_max": 500, "y_max": 500},
                }
            ],
            "telemetry": {"input_tokens": 300, "output_tokens": 100, "cost_usd": 0.00005, "latency_ms": 400},
        },
        {
            "id": "tc2",
            "candidates": [
                {
                    "title": "Lex Fridman Podcast #400",
                    "creator": "Lex Fridman",
                    "content_type": "podcast",
                    "confidence": 0.80,  # Uncertain -> flags for review
                    "uncertainty_reasons": ["Host name slightly obscured"],
                },
                {
                    "title": "Random Hallucinated Ad",
                    "creator": "Unknown",
                    "content_type": "other",
                    "confidence": 0.40,
                },
            ],
            "telemetry": {"input_tokens": 250, "output_tokens": 80, "cost_usd": 0.00004, "latency_ms": 350},
        },
    ]

    metrics = evaluate_predictions(ground_truth, predictions)
    # TP = 2 (Clean Architecture, Lex Fridman)
    # FP = 1 (Random Hallucinated Ad)
    # FN = 0
    assert metrics.true_positives == 2
    assert metrics.false_positives == 1
    assert metrics.false_negatives == 0
    assert metrics.precision == round(2 / 3, 4)
    assert metrics.recall == 1.0
    assert metrics.content_type_accuracy == 1.0
    assert metrics.mean_bounding_box_iou == 1.0
    assert metrics.total_input_tokens == 550
    assert metrics.total_output_tokens == 180


def test_run_evaluation_dataset(tmp_path):
    report_file = tmp_path / "eval_report.json"
    metrics = run_evaluation(output_path=str(report_file), use_mock=True)

    assert metrics.total_test_cases >= 5
    assert metrics.precision == 1.0
    assert metrics.recall == 1.0
    assert metrics.f1_score == 1.0
    assert report_file.exists()

    with open(report_file, "r") as f:
        data = json.load(f)
        assert data["precision"] == 1.0
        assert data["f1_score"] == 1.0
        assert data["evaluation_mode"] == "fixture"
        assert "FIXTURE HARNESS MODE" in data["disclaimer"]
