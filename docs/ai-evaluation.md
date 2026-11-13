# MediaMind AI Evaluation & Observability Framework

## 1. Principles

1. **Evidence-Based Accuracy**: No AI extraction or matching claim is accepted without empirical benchmark evaluation.
2. **Separation of Concerns**: Evaluation runs are isolated from production user traffic and stored in `evaluation_runs`.
3. **Traceability**: Every AI inference records `ai_model_name`, `prompt_version`, token usage, execution time, and extracted confidence.
4. **Regression Guard**: Previously failed or misidentified screenshots are added to a curated evaluation dataset to prevent regressions across prompt iterations.

---

## 2. Evaluation Metrics

### 2.1. Multimodal Extraction Metrics
- **Entity Precision**: Fraction of extracted entities (titles, creators, media types) that accurately match ground truth.
$$\text{Precision} = \frac{\text{True Positives}}{\text{True Positives} + \text{False Positives}}$$
- **Entity Recall**: Fraction of visible media items in the screenshot that were successfully discovered.
$$\text{Recall} = \frac{\text{True Positives}}{\text{True Positives} + \text{False Negatives}}$$
- **Type Accuracy**: Accuracy in determining the correct media type (`book`, `movie`, `tv_show`, `youtube_video`, `podcast`, `course`).

### 2.2. Entity Resolution & Matching Metrics
- **Auto-Accept Rate**: Percentage of processed screenshots meeting the automated acceptance threshold ($\text{confidence} \ge 0.85$ + high metadata provider agreement).
- **Review Rate**: Percentage of screenshots routed to the Human Review Queue ($0.50 \le \text{confidence} < 0.85$).
- **False Acceptance Rate (FAR)**: Instances where an incorrect external metadata item was auto-accepted into the user's library. Target: $< 1.0\%$.

### 2.3. Operational & Cost Observability
- **End-to-End Latency**: Median ($P50$) and 95th percentile ($P95$) time from upload to resolution.
- **Token Efficiency**: Average input tokens, output tokens, and reasoning tokens consumed per screenshot.
- **Estimated Cost per Screenshot**: Calculated based on current Gemini pricing tier.

---

## 3. Labelled Evaluation Dataset Schema

The ground-truth evaluation dataset is stored under `tests/eval_dataset/`:
```json
{
  "test_cases": [
    {
      "id": "eval_001_youtube_video",
      "image_path": "fixtures/screenshots/yt_lex_karpathy.png",
      "ground_truth_items": [
        {
          "title": "Andrej Karpathy: Building a Software 2.0 Company, Tesla, OpenAI",
          "creator": "Lex Fridman",
          "content_type": "youtube_video",
          "release_year": 2024,
          "bounding_box": [120, 200, 640, 360]
        }
      ]
    },
    {
      "id": "eval_002_multi_book_shelf",
      "image_path": "fixtures/screenshots/books_shelf_3_items.png",
      "ground_truth_items": [
        {
          "title": "Designing Data-Intensive Applications",
          "creator": "Martin Kleppmann",
          "content_type": "book"
        },
        {
          "title": "Database Internals",
          "creator": "Alex Petrov",
          "content_type": "book"
        },
        {
          "title": "System Design Interview",
          "creator": "Alex Xu",
          "content_type": "book"
        }
      ]
    }
  ]
}
```

---

## 4. Evaluation CLI & Automation

An evaluation runner script `backend/scripts/run_eval.py` executes test fixtures against the current prompt version and records outcomes into `evaluation_runs`:
```bash
python -m backend.scripts.run_eval --prompt-version v1.0.0 --model gemini-2.5-flash
```
Outputs:
- JSON summary with precision, recall, and review rate.
- Cost estimate.
- Regression diff against baseline.
