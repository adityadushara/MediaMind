# MediaMind API Contracts Specification

## 1. Conventions & Protocols

- **Base URL**: `/api/v1`
- **Authentication**: Bearer Token in `Authorization` header (`Bearer <Supabase_JWT>`)
- **Data Exchange**: JSON (`application/json`) with `multipart/form-data` for uploads
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
  - Form-data: `file` (single binary) or `files` (multiple binaries).
  - Validates MIME type and file magic bytes (PNG, JPEG, WebP, max 15MB).
  - Computes SHA-256 hash. Saves original screenshot directly to private Supabase Storage.
  - Creates `source_assets` record and enqueues `processing_jobs`.
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
          "status": "queued"
        }
      ]
    }
    ```

- `GET /api/v1/assets/{asset_id}/url`
  - Generates a temporary signed URL (valid for 15 minutes) for inspecting the original screenshot securely.
  - Response `200 OK`:
    ```json
    {
      "asset_id": "uuid",
      "signed_url": "https://<supabase-domain>/storage/v1/object/sign/screenshots/...token=...",
      "expires_in_seconds": 900
    }
    ```

### 2.4. Processing Jobs
- `GET /api/v1/jobs`
  - Query params: `status` (`queued`, `processing`, `identified`, `needs_review`, `unidentified`, `failed`), `limit`, `offset`.
  - Returns list of jobs for authenticated user.

- `GET /api/v1/jobs/{job_id}`
  - Returns job status, execution duration, candidate matches, and error logs if failed.

- `POST /api/v1/jobs/{job_id}/retry`
  - Re-enqueues a failed or unidentified job for re-processing.
  - Response `200 OK`:
    ```json
    {
      "job_id": "uuid",
      "status": "queued",
      "retry_count": 1
    }
    ```

### 2.5. Library Items
- `GET /api/v1/library`
  - Query params: `content_type`, `consumption_status`, `search`, `sort_by` (`created_at`, `title`, `rating`), `order` (`asc`, `desc`), `limit`, `offset`.
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
          "consumption_status": "consuming",
          "release_year": 2017,
          "cover_image_url": "https://...",
          "user_rating": 9.5,
          "created_at": "2026-11-13T12:00:00Z"
        }
      ]
    }
    ```

- `POST /api/v1/library`
  - Manual creation of a library item.
  - Payload:
    ```json
    {
      "title": "Clean Code",
      "creator": "Robert C. Martin",
      "content_type": "book",
      "consumption_status": "want_to_consume",
      "release_year": 2008,
      "overview": "A Handbook of Agile Software Craftsmanship",
      "source_asset_id": "uuid (optional)"
    }
    ```

- `GET /api/v1/library/{id}`
  - Detailed view including linked source assets, notes, and progress.

- `PATCH /api/v1/library/{id}`
  - Updates consumption status, rating, or metadata.

- `DELETE /api/v1/library/{id}`
  - Deletes library item. Notice: does NOT delete underlying `source_assets`.

### 2.6. Human Review Center
- `GET /api/v1/reviews/pending`
  - Fetches candidates requiring human confirmation (`needs_review` jobs).
  - Returns candidate title, creator, confidence, evidence quote, provider candidates, and asset signed URL.

- `POST /api/v1/reviews/{candidate_id}/accept`
  - Confirms candidate match and creates library item.
  - Payload allows selecting specific provider match or overriding fields.

- `POST /api/v1/reviews/{candidate_id}/reject`
  - Marks candidate as rejected. Source screenshot remains preserved in `source_assets`.

### 2.7. Enterprise RAG Engine
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
