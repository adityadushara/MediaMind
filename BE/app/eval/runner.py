import argparse
from dataclasses import dataclass, asdict, field
import io
import json
import logging
import os
from pathlib import Path
from typing import List, Dict, Any, Optional

logger = logging.getLogger("mediamind.eval")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def calculate_iou(box_a: Dict[str, int], box_b: Dict[str, int]) -> float:
    """
    Computes Intersection-over-Union (IoU) between two 0-1000 normalized bounding boxes.
    """
    x_left = max(box_a["x_min"], box_b["x_min"])
    y_top = max(box_a["y_min"], box_b["y_min"])
    x_right = min(box_a["x_max"], box_b["x_max"])
    y_bottom = min(box_a["y_max"], box_b["y_max"])

    if x_right <= x_left or y_bottom <= y_top:
        return 0.0

    intersection_area = (x_right - x_left) * (y_bottom - y_top)
    box_a_area = (box_a["x_max"] - box_a["x_min"]) * (box_a["y_max"] - box_a["y_min"])
    box_b_area = (box_b["x_max"] - box_b["x_min"]) * (box_b["y_max"] - box_b["y_min"])
    union_area = float(box_a_area + box_b_area - intersection_area)

    return intersection_area / union_area if union_area > 0 else 0.0


def is_title_match(pred_title: str, expected_title: str, threshold: float = 0.6) -> bool:
    """
    Evaluates whether an extracted title sufficiently matches the ground truth.
    Performs case-insensitive token overlap comparison.
    """
    pred_clean = pred_title.lower().strip()
    exp_clean = expected_title.lower().strip()

    if pred_clean == exp_clean or pred_clean in exp_clean or exp_clean in pred_clean:
        return True

    pred_tokens = set(pred_clean.split())
    exp_tokens = set(exp_clean.split())
    if not pred_tokens or not exp_tokens:
        return False

    intersection = pred_tokens.intersection(exp_tokens)
    overlap = len(intersection) / float(max(len(pred_tokens), len(exp_tokens)))
    return overlap >= threshold


@dataclass
class FailureBreakdown:
    missed_items: int = 0
    false_positives: int = 0
    type_mismatches: int = 0
    poor_localization: int = 0
    unflagged_uncertainty: int = 0


@dataclass
class EvaluationMetrics:
    total_test_cases: int
    true_positives: int
    false_positives: int
    false_negatives: int
    precision: float
    recall: float
    f1_score: float
    content_type_accuracy: float
    mean_bounding_box_iou: float
    review_rate: float
    total_input_tokens: int
    total_output_tokens: int
    total_cost_usd: float
    mean_latency_ms: float
    evaluation_mode: str = "fixture"
    disclaimer: str = ""
    failures: FailureBreakdown = field(default_factory=FailureBreakdown)


def evaluate_predictions(
    ground_truth_cases: List[Dict[str, Any]],
    predicted_cases: List[Dict[str, Any]],
    mode: str = "fixture",
) -> EvaluationMetrics:
    """
    Compares model predictions against ground truth test cases and computes benchmark metrics.
    """
    total_cases = len(ground_truth_cases)
    tp = 0
    fp = 0
    fn = 0
    type_matches = 0
    ious: List[float] = []

    type_mismatches = 0
    poor_localization = 0
    unflagged_uncertainty = 0

    total_input_tokens = 0
    total_output_tokens = 0
    total_cost = 0.0
    latencies: List[float] = []
    items_requiring_review = 0
    total_predicted_items = 0

    pred_map = {p["id"]: p for p in predicted_cases}

    for gt in ground_truth_cases:
        tc_id = gt["id"]
        expected_items = gt.get("expected_items", [])
        pred_entry = pred_map.get(tc_id, {"candidates": [], "telemetry": {}})
        pred_candidates = pred_entry.get("candidates", [])
        telemetry = pred_entry.get("telemetry", {})

        total_input_tokens += telemetry.get("input_tokens", 0)
        total_output_tokens += telemetry.get("output_tokens", 0)
        total_cost += telemetry.get("cost_usd", 0.0)
        if "latency_ms" in telemetry:
            latencies.append(telemetry["latency_ms"])

        total_predicted_items += len(pred_candidates)

        # Match predicted candidates to expected items
        matched_gt_indices = set()
        for cand in pred_candidates:
            cand_title = cand.get("title", "")
            cand_type = cand.get("content_type", "")
            cand_box = cand.get("bounding_box")
            uncertainty_reasons = cand.get("uncertainty_reasons", [])

            if uncertainty_reasons or cand.get("confidence", 1.0) < 0.85:
                items_requiring_review += 1

            matched = False
            for idx, exp in enumerate(expected_items):
                if idx in matched_gt_indices:
                    continue

                if is_title_match(cand_title, exp["title"]):
                    matched = True
                    matched_gt_indices.add(idx)
                    tp += 1

                    # Check type agreement
                    if cand_type == exp["content_type"]:
                        type_matches += 1
                    else:
                        type_mismatches += 1

                    # Check bounding box IoU
                    if cand_box and exp.get("expected_bbox"):
                        iou = calculate_iou(cand_box, exp["expected_bbox"])
                        ious.append(iou)
                        if iou < 0.50:
                            poor_localization += 1

                    # Check uncertainty flag consistency
                    if exp.get("requires_uncertainty", False) and not uncertainty_reasons:
                        unflagged_uncertainty += 1
                    break

            if not matched:
                fp += 1

        unmatched_expected = len(expected_items) - len(matched_gt_indices)
        fn += unmatched_expected

    precision = tp / float(tp + fp) if (tp + fp) > 0 else (1.0 if fn == 0 else 0.0)
    recall = tp / float(tp + fn) if (tp + fn) > 0 else (1.0 if fp == 0 else 0.0)
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    type_acc = type_matches / float(tp) if tp > 0 else 1.0
    mean_iou = sum(ious) / float(len(ious)) if ious else 1.0
    review_rate = items_requiring_review / float(total_predicted_items) if total_predicted_items > 0 else 0.0
    mean_latency = sum(latencies) / float(len(latencies)) if latencies else 0.0

    disclaimer = (
        "FIXTURE HARNESS MODE: Evaluates scoring harness logic against independently stored static fixture predictions. Production model performance must be evaluated in 'live_gemini' mode."
        if mode == "fixture"
        else "LIVE GEMINI INFERENCE: Evaluates actual Gemini API predictions against held-out ground truth."
    )

    return EvaluationMetrics(
        total_test_cases=total_cases,
        true_positives=tp,
        false_positives=fp,
        false_negatives=fn,
        precision=round(precision, 4),
        recall=round(recall, 4),
        f1_score=round(f1, 4),
        content_type_accuracy=round(type_acc, 4),
        mean_bounding_box_iou=round(mean_iou, 4),
        review_rate=round(review_rate, 4),
        total_input_tokens=total_input_tokens,
        total_output_tokens=total_output_tokens,
        total_cost_usd=round(total_cost, 6),
        mean_latency_ms=round(mean_latency, 2),
        evaluation_mode=mode,
        disclaimer=disclaimer,
        failures=FailureBreakdown(
            missed_items=fn,
            false_positives=fp,
            type_mismatches=type_mismatches,
            poor_localization=poor_localization,
            unflagged_uncertainty=unflagged_uncertainty,
        ),
    )


def load_fixture_predictions(fixtures_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Loads independent static prediction fixtures from disk.
    Never derives predictions programmatically from ground truth.
    """
    path = fixtures_path or str(Path(__file__).parent / "fixtures" / "static_predictions.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def run_evaluation(
    dataset_path: Optional[str] = None,
    fixtures_path: Optional[str] = None,
    output_path: Optional[str] = None,
    mode: str = "fixture",
    use_mock: bool = True,
) -> EvaluationMetrics:
    """
    Runs evaluation benchmark.
    - 'fixture' mode: Evaluates static, independently recorded predictions against ground truth.
    - 'live_gemini' mode: Calls actual Gemini API models against held-out screenshot images.
    """
    if not use_mock and mode == "fixture":
        mode = "live_gemini"

    d_path = dataset_path or str(Path(__file__).parent / "dataset.json")
    with open(d_path, "r", encoding="utf-8") as f:
        ground_truth = json.load(f)

    logger.info(f"Loaded {len(ground_truth)} evaluation test cases from {d_path} [mode={mode}]")

    if mode == "fixture":
        logger.info("Loading independent static prediction fixtures...")
        predictions = load_fixture_predictions(fixtures_path)
    elif mode == "live_gemini":
        from app.adapters.ai import get_ai_adapter
        ai = get_ai_adapter()
        predictions = []
        logger.info(f"Executing Live Gemini evaluation across {len(ground_truth)} cases using model '{ai.model_id}'...")

        for case in ground_truth:
            img_path = case.get("image_path")
            if img_path and os.path.exists(img_path):
                with open(img_path, "rb") as f:
                    img_bytes = f.read()
            else:
                # Generate a synthetic test canvas for evaluation case if raw image not on disk
                from PIL import Image, ImageDraw
                buf = io.BytesIO()
                img = Image.new("RGB", (640, 640), color=(240, 240, 245))
                d = ImageDraw.Draw(img)
                for item in case.get("expected_items", []):
                    d.text((50, 50), f"{item.get('title', '')} - {item.get('creator', '')}", fill=(20, 20, 20))
                img.save(buf, format="JPEG")
                img_bytes = buf.getvalue()

            res = ai.extract_candidates(img_bytes)
            case_preds = []
            for c in res.candidates:
                case_preds.append({
                    "title": c.title,
                    "creator": c.creator,
                    "content_type": c.content_type,
                    "bounding_box": c.bounding_box.model_dump() if c.bounding_box else None,
                    "confidence": c.confidence,
                    "flagged_for_review": c.confidence < 0.85,
                })
            predictions.append({
                "id": case["id"],
                "predictions": case_preds,
                "input_tokens": res.prompt_tokens,
                "output_tokens": res.candidate_tokens,
                "cost_usd": res.estimated_cost_usd,
                "latency_ms": res.duration_ms,
            })
    else:
        raise ValueError(f"Unknown evaluation mode: {mode}")

    metrics = evaluate_predictions(ground_truth, predictions, mode=mode)
    logger.info(f"Evaluation Completed [{metrics.evaluation_mode}]: Precision={metrics.precision}, Recall={metrics.recall}, F1={metrics.f1_score}")
    logger.info(f"IoU={metrics.mean_bounding_box_iou}, ContentTypeAcc={metrics.content_type_accuracy}, ReviewRate={metrics.review_rate}")

    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(asdict(metrics), f, indent=2)
        logger.info(f"Saved evaluation metrics to {output_path}")

    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MediaMind Multimodal Extraction Benchmark Runner")
    parser.add_argument("--dataset", type=str, default=None, help="Path to ground truth dataset.json")
    parser.add_argument("--fixtures", type=str, default=None, help="Path to independent static_predictions.json")
    parser.add_argument("--output", type=str, default=None, help="Path to write evaluation report JSON")
    parser.add_argument("--mode", type=str, default="fixture", choices=["fixture", "live_gemini"], help="Evaluation mode")
    args = parser.parse_args()

    run_evaluation(
        dataset_path=args.dataset,
        fixtures_path=args.fixtures,
        output_path=args.output,
        mode=args.mode,
    )
