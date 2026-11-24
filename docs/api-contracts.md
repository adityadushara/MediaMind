# MediaMind API Contracts Specification

## 1. Conventions & Protocols

- **Base URL**: `/api/v1`
- **Authentication**: Bearer Token in `Authorization` header (`Bearer <Supabase_JWT>`)
- **Data Exchange**: JSON (`application/json`) with `multipart/form-data` for uploads
- **Media payloads**: list and detail responses never embed image bytes. Screenshots
  are referenced through `signed_url` / `screenshot_url`
  (`/api/v1/assets/media/{asset_id}?kind=original&token=...`); any inline
  `data:` URL in `source_assets.file_path` is redacted to `null` before
  serialization so a list response stays kilobytes instead of megabytes.
- **Pagination**: `limit` (default 20, max 100), `offset` (default 0)
- **Standard Error Envelope**:
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested item does not exist or access is forbidden",
    "details": {}
  }
}
```

---

## 2. Endpoints Overview

### 2.1. System & Health
- `GET /health`
  - Returns backend health status, database ping, and storage accessibility.
  - Response `200 OK`:
    ```json
    {
      "status": "healthy",
      "version": "1.0.0",
      "database": "connected",
      "storage": "connected"
    }
    ```

### 2.2. Authentication & Current User
- `GET /api/v1/auth/me`
  - Returns authenticated user profile and subscription tier/quotas.
  - Response `200 OK`:
    ```json
    {
      "id": "uuid",
      "email": "user@example.com",
      "display_name": "Alex",
      "created_at": "2026-11-13T12:00:00Z"
    }
    ```

### 2.3. Source Assets & Ingestion
- `POST /api/v1/assets/upload`
  - Form-data: `files` (one or more image files).
  - Headers: `Idempotency-Key` (optional string, deduplicates client retries).
  - Query parameters: `force_reupload` (boolean, default false. When false, identical files by SHA-256 return existing asset reference).
  - Validates MIME type and file magic bytes (PNG, JPEG, WebP, AVIF, HEIC, GIF, BMP; max 15MB).
  - Computes SHA-256 hash. Saves original screenshot directly to private storage (`screenshots/{user_id}/{asset_id}.ext`).
  - Creates `source_assets` record and initializes `processing_jobs` (in M2, sets status to `awaiting_identification`).
  - Creates a placeholder library item with `verification_status = "unverified"`; the worker later promotes it to `needs_review` or `auto_accepted`, and only the user can mark it `verified`.
  - Storage failure cleanup: If database creation fails after storage upload, storage is immediately cleaned up; if storage cleanup fails, an error is logged with orphan details for administrative recovery.
  - Response `202 Accepted`:
    ```json
    {
      "assets": [
        {
          "asset_id": "uuid",
          "file_name": "screenshot_01.png",
          "sha256_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "file_size_bytes": 1048576,
          "mime_type": "image/png",
          "job_id": "uuid",
          "status": "awaiting_identification",
          "is_duplicate": false
        }
      ],
      "total_count": 1
    }
    ```

- `GET /api/v1/assets`
  - Query params: `search` (case-insensitive filename match), `status` (latest job status), `sort` (`newest`, `oldest`), `limit`, `offset`.
  - Returns paginated list of private source assets belonging to the authenticated user.
  - Response `200 OK`:
    ```json
    {
      "total": 12,
      "limit": 20,
      "offset": 0,
      "items": [
        {
          "id": "uuid",
          "user_id": "uuid",
          "file_path": "screenshots/.../id.png",
          "file_name": "screenshot_01.png",
          "file_size_bytes": 1048576,
          "mime_type": "image/png",
          "sha256_hash": "e3b0...",
          "image_width": 1920,
          "image_height": 1080,
          "created_at": "2026-11-13T12:00:00Z",
          "latest_status": "awaiting_identification"
        }
      ]
    }
    ```

- `GET /api/v1/assets/{asset_id}`
  - Returns source asset detail including linked library items, latest processing job, and a temporary signed URL.

- `GET /api/v1/assets/{asset_id}/url`
  - Generates a temporary signed URL (valid for 15 minutes) for inspecting the original screenshot securely.
  - Response `200 OK`:
    ```json
    {
      "asset_id": "uuid",
      "signed_url": "https://<storage-domain>/...token=...",
      "expires_in_seconds": 900
    }
    ```

### 2.4. Processing Jobs
- `GET /api/v1/jobs`
  - Query params: `status` (`queued`, `processing`, `awaiting_identification`, `completed`, `identified`, `needs_review`, `unidentified`, `failed`), `limit`, `offset`.
  - Returns list of jobs for authenticated user.

- `GET /api/v1/jobs/{job_id}`
  - Returns job status, execution duration, candidate matches, retry count, and error logs if failed.

- `POST /api/v1/jobs/{job_id}/retry`
  - Re-enqueues a failed or unidentified job for re-processing.
  - `GET /api/v1/jobs` also auto-retries a failed job whose `error_message`
    matches a retryable pattern (retired model, provider outage, rate limit) as
    long as `retry_count < max_retries`. Authentication/configuration failures
    (invalid or missing `GEMINI_API_KEY`) are never auto-retried, because only a
    human can clear them.
  - Re-processing a screenshot never overwrites an item the user already
    verified or entered by hand: the new AI result is stored in
    `identification_candidates` and the library record is left untouched.
  - Enforces `retry_count < max_retries`. Returns `400 Bad Request` if max retries exceeded.
  - Response `200 OK`:
    ```json
    {
      "id": "uuid",
      "status": "queued",
      "retry_count": 1,
      "max_retries": 3
    }
    ```

- `POST /api/v1/jobs/claim`
  - Atomic concurrency endpoint for background workers to claim pending `queued` jobs safely without duplicate execution.
  - Payload: `worker_id` (string), `batch_size` (integer, default 1, max 10).
  - Conditionally updates jobs to `processing` and records `claimed_at` and `claimed_by`.

- `POST /api/v1/jobs/recover-stale`
  - Maintenance endpoint to detect and recover orphaned/stale jobs where a worker process crashed.
  - Payload: `stale_seconds` (integer, default 300).
  - Resets stale `processing` jobs to `queued` if under `max_retries`, or marks them `failed` if retry limit reached.

### 2.5. Library Items & Associations
- `GET /api/v1/library`
  - Query params: `content_type` (`book`, `movie`, `tv_show`, `youtube_video`, `documentary`, `podcast`, `course`, `article`, `newsletter`, `other`), `subcategory` (filter by category/topic, e.g. `Psychology`, `Habits`), `consumption_status`, `verification_status` (`unverified`, `needs_review`, `auto_accepted`, `verified`, `manual_entry`), `search` (matches title, creator, subcategory, genre and overview), `sort_by` (`created_at`, `updated_at`, `title`, `user_rating`, `release_year`; unknown columns fall back to `created_at`), `sort_order` (`asc`, `desc`), `limit`, `offset`.
  - Response `200 OK`:
    ```json
    {
      "total": 42,
      "items": [
        {
          "id": "uuid",
          "title": "Designing Data-Intensive Applications",
          "creator": "Martin Kleppmann",
          "content_type": "book",
          "subcategory": "Software Architecture",
          "direct_url": "https://books.google.com/books?isbn=9781449373320",
          "consumption_status": "consuming",
          "release_year": 2017,
          "cover_image_url": "https://...",
          "user_rating": 9.5,
          "created_at": "2026-11-13T12:00:00Z",
          "updated_at": "2026-11-13T12:30:00Z"
        }
      ]
    }
    ```

- `GET /api/v1/library/stats`
  - Server-side aggregate counts for the dashboard, so metrics are not limited to the first page of items.
  - Response `200 OK`:
    ```json
    {
      "total": 42,
      "by_status": {
        "want_to_consume": 20,
        "consuming": 5,
        "completed": 14,
        "on_hold": 2,
        "dropped": 1
      },
      "needs_review": 3,
      "unverified": 0
    }
    ```

- `GET /api/v1/library/subcategories`
  - Query params: `content_type` (optional filter).
  - Returns distinct subcategories/topics populated in the user's library.
  - Response `200 OK`:
    ```json
    [
      "Habits",
      "Psychology",
      "Money & Finance",
      "Software Architecture"
    ]
    ```

- `POST /api/v1/library`
  - Manual creation of a library item.
  - Payload:
    ```json
    {
      "title": "Clean Code",
      "creator": "Robert C. Martin",
      "content_type": "book",
      "subcategory": "Software Engineering",
      "direct_url": "https://books.google.com/books?id=...",
      "consumption_status": "want_to_consume",
      "release_year": 2008,
      "overview": "A Handbook of Agile Software Craftsmanship",
      "source_asset_id": "uuid (optional)"
    }
    ```

- `GET /api/v1/library/{id}`
  - Detailed view including linked source assets (with temporary signed URLs), notes, progress, and `screenshot_url`.

- `PATCH /api/v1/library/{id}`
  - Updates consumption status, user rating, verification status, or metadata.

- `POST /api/v1/library/{id}/verify`
  - Confirms and verifies a pending library item (`verification_status = "verified"`), keeping it permanently in the library and resolving any linked AI extraction candidates.

- `POST /api/v1/library/verify-all`
  - 1-click batch verification for all items currently marked `needs_review`.
  - Response `200 OK`: `{"verified_count": 3}`

- `DELETE /api/v1/library/{id}`
  - Deletes library item. Notice: does NOT delete underlying `source_assets`.

- `POST /api/v1/library/{item_id}/sources/{asset_id}`
  - Associates a source screenshot with a library item.
  - Enforces cross-user ownership verification: both item and asset must belong to the authenticated user.
  - Returns `409 Conflict` with a readable message if the screenshot is already attached, and `404` if either record is gone.

- `DELETE /api/v1/library/{item_id}/sources/{asset_id}`
  - Removes association between a library item and a source screenshot.
  - The underlying `source_assets` record and storage file remain preserved.

### 2.6. Human Review Center (`/api/v1/reviews`)

- `GET /api/v1/reviews/counts`
  - Fetches summary statistics of candidates by review state for the authenticated user.
  - Response `200 OK`:
    ```json
    {
      "pending_review": 3,
      "accepted": 12,
      "rejected": 1,
      "total": 16
    }
    ```

- `GET /api/v1/reviews/candidates`
  - Lists multimodal extraction candidates with authorized temporary signed URLs for crops and original screenshots.
  - Query params: `review_status` (`needs_review`, `accepted`, `rejected`, `all`), `content_type`, `job_id`, `source_asset_id`, `limit`, `offset`.
  - Response `200 OK`:
    ```json
    {
      "total": 1,
      "items": [
        {
          "id": "uuid",
          "job_id": "uuid",
          "source_asset_id": "uuid",
          "suggested_title": "Designing Data-Intensive Applications",
          "suggested_creator": "Martin Kleppmann",
          "suggested_type": "book",
          "suggested_subcategory": "Software Architecture",
          "direct_url": "https://books.google.com/books?isbn=9781449373320",
          "confidence_score": 0.94,
          "bounding_box": {"x_min": 100, "y_min": 150, "x_max": 500, "y_max": 700},
          "visible_text": ["Designing Data-Intensive Applications", "Martin Kleppmann"],
          "identifying_clues": ["O'Reilly Animal Cover"],
          "uncertainty_reasons": [],
          "review_status": "needs_review",
          "resolution_status": "pending",
          "crop_signed_url": "https://.../derivatives/...jpg",
          "source_signed_url": "https://.../screenshots/...jpg",
          "created_at": "2026-11-13T12:00:00Z"
        }
      ]
    }
    ```

- `GET /api/v1/reviews/candidates/{id}`
  - Fetches complete candidate detail and evidence for side-by-side inspection.

- `PATCH /api/v1/reviews/candidates/{id}`
  - Updates candidate suggested fields (title, creator, content_type, subcategory, direct_url, year, description) prior to approval.
  - Payload:
    ```json
    {
      "suggested_title": "Updated Title",
      "suggested_creator": "Updated Creator",
      "suggested_type": "book",
      "suggested_subcategory": "Habits",
      "direct_url": "https://example.com/item",
      "year_clue": 2024
    }
    ```

- `POST /api/v1/reviews/candidates/{id}/accept`
  - Approves candidate: creates verified `library_items` record (with `subcategory` and `direct_url`), creates traceable `item_sources` record linking the original screenshot, marks candidate `accepted`, and resolves parent job to `identified`.
  - Payload:
    ```json
    {
      "title": "Optional Title Override",
      "creator": "Optional Creator Override",
      "content_type": "book",
      "subcategory": "Habits",
      "direct_url": "https://example.com/item",
      "consumption_status": "want_to_consume",
      "release_year": 2024,
      "overview": "Notes",
      "user_rating": 9.0
    }
    ```
  - Response `200 OK`: `LibraryItemResponse`.

- `POST /api/v1/reviews/jobs/{job_id}/accept-all`
  - 1-click batch acceptance for all pending candidates extracted from a specific screenshot job.
  - Generates library items with their identified titles, creators, direct URLs, and subcategories.
  - Response `200 OK`:
    ```json
    [
      {
        "id": "uuid",
        "title": "Atomic Habits",
        "creator": "James Clear",
        "content_type": "book",
        "subcategory": "Habits",
        "direct_url": "https://books.google.com/books?isbn=9780735211292"
      }
    ]
    ```
  - Response `200 OK`: `LibraryItemResponse`.

- `POST /api/v1/reviews/candidates/{id}/reject`
  - Rejects candidate from the review queue. The original screenshot in `source_assets` is preserved intact.
  - Response `200 OK`:
    ```json
    {
      "success": true,
      "candidate_id": "uuid",
      "review_status": "rejected"
    }
    ```

- `POST /api/v1/reviews/{candidate_id}/accept`
  - Confirms candidate match and creates library item.
  - Payload allows selecting specific provider match or overriding fields.

- `POST /api/v1/reviews/{candidate_id}/reject`
  - Marks candidate as rejected. Source screenshot remains preserved in `source_assets`.

### 2.7. Enterprise RAG Engine
- `POST /api/v1/rag/ask`
  - Answers a natural-language question. The whole library (up to 200 items) plus
    the names of the saved screenshots are put in the model's context, so the
    answer is grounded in what the user actually has.
  - When the library does not cover the question, the response says so and the
    answer itself comes from general knowledge, with a `suggestions` entry the UI
    can offer as "Add to library": the title, creator, type, year, a rationale,
    and a `direct_url` resolved through the metadata providers (falling back to a
    provider search, flagged by `link_is_search`).
  - Response `200 OK`:
    ```json
    {
      "query": "Recommend a documentary about space",
      "answer": "Your library has none saved. Cosmos: A Spacetime Odyssey ...",
      "matched_items": [],
      "library_covered": false,
      "suggestions": [
        {
          "title": "Cosmos: A Spacetime Odyssey",
          "creator": "Neil deGrasse Tyson",
          "content_type": "documentary",
          "release_year": 2014,
          "rationale": "A visually stunning journey through space and science.",
          "direct_url": "https://www.imdb.com/title/tt2395695/",
          "link_is_search": false
        }
      ],
      "duration_ms": 3200,
      "model_name": "gemini-3.5-flash-lite"
    }
    ```
- `POST /api/v1/rag/query`
  - Grounded question-answering over user's personal media catalog.
  - Payload:
    ```json
    {
      "query": "Which books in my library cover distributed consensus?",
      "top_k": 5
    }
    ```
  - Response `200 OK`:
    ```json
    {
      "answer": "Based on your library, 'Designing Data-Intensive Applications' by Martin Kleppmann covers Paxos, Raft, and distributed consensus in Chapter 8 and 9.",
      "sources": [
        {
          "library_item_id": "uuid",
          "title": "Designing Data-Intensive Applications",
          "citation": "Chapter 9 notes: Consensus and total order broadcast"
        }
      ]
    }
    ```
