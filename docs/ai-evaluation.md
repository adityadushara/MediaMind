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

The ground-truth evaluation dataset is stored under `BE/app/eval/dataset.json`:
```json
[
  {
    "id": "tc_001_single_book",
    "category": "book",
    "description": "Clear single book cover (Designing Data-Intensive Applications)",
    "expected_items": [
      {
        "title": "Designing Data-Intensive Applications",
        "creator": "Martin Kleppmann",
        "content_type": "book",
        "expected_bbox": {
          "x_min": 100,
          "y_min": 100,
          "x_max": 900,
          "y_max": 900
        },
        "requires_uncertainty": false
      }
    ]
  }
]
```

---

## 4. Benchmark Execution

Run the evaluation runner to measure multimodal extraction precision, recall, IoU, review rate, latency, and costs:

```bash
cd BE
python -m app.eval.runner --output eval_report.json
```

Or execute automated evaluation unit tests:

```bash
cd BE
pytest tests/test_eval.py -v
```

### 4.1. Official Google Gemini API Pricing Reference (Standard Tier, Prompts ≤ 200k tokens)
- **Gemini 2.5 Flash (`gemini-2.5-flash`)**:
  - Input: **$0.30** / 1M tokens ($0.00000030/token)
  - Output (including thinking tokens): **$2.50** / 1M tokens ($0.00000250/token)
- **Gemini 2.0 Flash (`gemini-2.0-flash`)**:
  - Input: **$0.15** / 1M tokens ($0.00000015/token)
  - Output: **$0.60** / 1M tokens ($0.00000060/token)
- **Gemini 1.5 Flash (`gemini-1.5-flash`)**:
  - Input: **$0.075** / 1M tokens ($0.000000075/token)
  - Output: **$0.30** / 1M tokens ($0.00000030/token)
- **Google AI Studio Free Tier**: **$0.00** (rate-limited for prototyping).

### 4.2. Evaluation Modes
- **`fixture` Mode**: Runs against independent static predictions (`fixtures/static_predictions.json`) to verify metric computation, threshold logic, and pipeline regressions offline without live network dependencies.
- **`live_gemini` Mode**: Calls live Gemini API against screenshot assets to record real model performance, true token counts, and network latency.

### 4.3. Preliminary M3 Harness Baseline (15-Case Benchmark, Fixture Mode)
> [!NOTE]
> The metrics below represent the initial **preliminary harness baseline** evaluated using independent static prediction fixtures (`fixtures/static_predictions.json`) across 15 curated test scenarios. They establish regression targets for metric computations and threshold gating before running large-scale live model evaluations.

- **Total Test Cases**: 15 (Single books, multi-video grids, collages, podcasts, banners, courses, blurry photos, dark mode, 3 negative noise controls)
- **Total Items Evaluated**: 18
- **Item Extraction Precision**: $100\%$
- **Item Extraction Recall**: $100\%$
- **F1 Score**: $1.00$
- **Bounding Box Mean IoU**: $0.9724$ (reflects realistic boundary variance)
- **Content Type Accuracy**: $100\%$
- **Human Review Flag Rate**: $16.67\%$ (correctly flags low-contrast and blurred samples)
- **Negative Controls Rejection Rate**: $100\%$ (0 false positives on terminal, spreadsheet, wallpaper)
- **Total Tokens (15 Cases)**: 18,970 input / 3,020 output
- **Average Estimated Cost per Extraction**: $\approx \$0.000883$ (Gemini 2.5 Flash standard tier) / $\$0.00$ (Free tier)
- **Mean Simulated Latency**: $\approx 435.5\text{ms}$

---

## 5. Expansion Specification for 50–100 Benchmark Dataset

To transition from the 15-case preliminary harness to a production-grade evaluation benchmark, the dataset will be systematically expanded to 50–100 manually curated real-world screenshots.

### 5.1. Stratified Content Distribution (Target: 80 Items across 60 Screenshots)
- **Books (15%)**: Single book covers, multi-book recommendation lists, Amazon / Goodreads pages, Kindle / e-reader screenshots.
- **Movies & Documentaries (20%)**: Netflix / Hulu / Disney+ carousels, Letterboxd lists, IMDb title pages, movie poster collages.
- **TV Shows (15%)**: Episode selection grids, season overview pages, streaming queues.
- **YouTube Videos (15%)**: Subscription feeds, search results, video player pages with creator and title badges.
- **Podcasts (15%)**: Spotify / Apple Podcasts player interfaces, podcast directory charts, episode lists.
- **Courses & Tutorials (10%)**: Coursera / Udemy course cards, YouTube learning playlists, platform syllabi.
- **Negative Controls (10%)**: Irrelevant non-media images (terminal consoles, code editors, spreadsheet tables, landscape wallpapers, text documents).

### 5.2. Visual Variation & Perturbation Matrix
Each category will include diverse visual real-world conditions:
- **Image Resolution**: Native desktop ($1920\times1080$), mobile screen captures ($1170\times2532$, $1080\times2400$), and downscaled low-resolution crops ($< 600\text{px}$).
- **Color Themes**: Standard light mode, AMOLED dark mode, and customized platform themes.
- **Degradation / Noise**: JPEG compression artifacts ($\text{quality} \le 60$), camera photos of screens (Moiré patterns and slight angled tilt), and motion blur.
- **Occlusion / Density**:
  - Clean isolated single items (easy).
  - Dense grids with 3–8 items in one screenshot (medium).
  - Partially obstructed or overlaid titles (notification banners, subtitles, player UI overlays).

### 5.3. Annotation & Validation Protocol
For every screenshot in `BE/app/eval/dataset.json`:
1. `id`: Unique identifier (e.g. `tc_042_yt_dense_grid`).
2. `category`: Media category or `negative_control`.
3. `expected_items`: Array of ground-truth objects containing:
   - `title`: Canonical title.
   - `creator`: Primary creator/author/channel.
   - `content_type`: Ground truth media type.
   - `expected_bbox`: Normalized bounding box coordinates `{"x_min", "y_min", "x_max", "y_max"}` in $[0, 1000]$.
   - `requires_uncertainty`: Boolean flag indicating if image quality or ambiguity should mandate routing to the human review queue.
4. `difficulty`: `clean`, `dense_grid`, `occluded`, or `degraded`.

### 5.4. Regression Threshold Gates (CI/CD Enforcement)
Automated evaluation runs enforce the following minimum gates:
- **Precision**: $\ge 90.0\%$
- **Recall**: $\ge 85.0\%$
- **Content Type Accuracy**: $\ge 92.0\%$
- **Mean Bounding Box IoU**: $\ge 0.75$
- **False Positive Rate on Negative Controls**: $\le 1.0\%$
- **All Runs Persisted**: Summary metrics stored in `evaluation_runs` table in PostgreSQL.
