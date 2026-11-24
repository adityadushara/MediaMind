# MediaMind — DeepSeek v4 Change Log

Date: 2026-11-19
Scope: all uncommitted working-tree changes made so far (frontend runtime, API routes, AI services, database migration, tests, docs and browser-verified fixes).
Repository root: `D:\projects\MediaMind`

> This file is a handoff record of everything changed in this working tree. The changes are **not committed**. The live Vercel deployment is the Next.js app in `FE/` (Vercel project `mediamind`, team `aditya-dusharas-projects`), not the Python `BE/` FastAPI app.
>
> **Live status (2026-11-19):** `https://mediamind-red.vercel.app/api/health` → `200 healthy`; migrations 001–009 applied; private `screenshots` bucket active; sidebar reports **Ready**.

---

## 1. Root causes diagnosed

1. **Gemini 404s / model retirement.** `gemini-2.5-flash` and `gemini-2.5-flash-lite` are no longer available to new users; `text-embedding-004` also 404s. Verified working models: `gemini-3.8-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`; embeddings use `gemini-embedding-001` with `outputDimensionality: 768`.
2. **Production schema drift (resolved 2026-11-19).** Live Supabase project `wtdvxcueczmnyhdimhpq` originally had only migrations 001–004 applied. All of 005–009 were then applied through the Supabase Management API, so `direct_url`, `subcategory`, `isbn`, `genre`, the extended `content_type` values, `needs_review`, and the deduplication index now exist live.
3. **Candidate writes silently discarded.** Candidate inserts referenced columns that do not exist in the schema (`provider_metadata`, `external_provider`, `external_id`), so an entire insert failed and AI results were lost.
4. **Storage bucket missing (resolved 2026-11-19).** The private `screenshots` bucket was created through migration 009, and `SUPABASE_SERVICE_ROLE_KEY` is now set in Vercel Production. New uploads are stored in Supabase Storage and served through the authenticated media proxy; historic inline originals still render.
5. **Frontend pointed at a dead backend.** `next.config.ts` rewrote `/api/v1/*` to `http://localhost:8000`, and `FE/src/lib/api.ts` defaulted `NEXT_PUBLIC_API_URL` to that same URL. On Vercel this produced failed API calls. The frontend now calls its own Next.js Route Handlers.
6. **Mock data on the landing page.** The landing page contained a fake "AI identified in 1.4s" interactive demo with fabricated results. It was removed so the public page no longer presents mock data as real.

---

## 2. Tracked files modified

### `BE/scripts/apply_migrations.py`
- Added `migrations/009_fix_verification_status_and_storage.sql` to `MIGRATION_FILES`.

### `FE/next.config.ts`
- Removed the `rewrites()` block that proxied `/api/v1/:path*` to `NEXT_PUBLIC_API_URL || http://localhost:8000`.

### `FE/package.json` / `FE/pnpm-lock.yaml` / `FE/pnpm-workspace.yaml`
- Added runtime dependencies: `@google/genai ^3.4.0` and `sharp ^0.35.5`.
- Lockfile regenerated; workspace config adjusted.

### `FE/.gitignore`
- Added `.vercel`.

### `FE/vercel.json`
- Added `"name": "mediamind"`.

### `FE/src/lib/api.ts`
- `API_BASE` now defaults to `""` (same-origin Route Handlers) instead of `http://localhost:8000`; an explicitly set `NEXT_PUBLIC_API_URL` still wins.
- `getAuthHeaders()` now falls back to the cached access token when session lookup fails or returns no session.
- `checkBackendHealth()` now parses the valid health body returned with HTTP 503 (`degraded`) instead of treating it as unreachable.

### `FE/src/components/layout/Sidebar.tsx`
- System status shows three honest states: green `Ready`, amber `Degraded` (database/AI working but migrations or storage pending), and red `Offline` (unreachable). Previously any 503 showed "Offline" even though the assistant was usable.

### `FE/src/components/dashboard/ProcessingStatusBanner.tsx`
- Added a failed-job alert with the recorded error and a working **Retry processing** button that calls `retryProcessingJob()` for each failed job.
- The banner is now a client component with retry progress and inline error feedback.

### `FE/src/app/page.tsx` (dashboard)
- Defensive normalization of API responses: `itemsRes?.items` and `jobsRes` are checked with `Array.isArray` before storing in state.
- Removed `setIsLoading(false)` from the `!user` early return so loading state is cleared only by the authenticated fetch path.

### `FE/src/app/library/page.tsx`
- Thumbnail state is synchronized during render instead of with a cascading `useEffect` (Next.js 16 / React 19 friendly).
- Defensive array normalization for library items and linked source assets.
- `?upload=true` now opens the upload dialog via `queueMicrotask` instead of a synchronous effect side effect.
- All `selectedItemDetail.sources` accesses are null-safe.
- Category-tab wheel/drag scrolling now attaches after authentication resolves. The listener effect previously ran once while `AuthGuard` was still showing its spinner, so the element was null and the chips could not be scrolled.

### `FE/src/app/sources/page.tsx`
- Defensive normalization of asset list/total; null-safe `selectedAsset.library_items` rendering.

### `FE/src/components/dashboard/ProcessingStatusBanner.tsx`
- `jobs` defaults to `[]` and is guarded with `Array.isArray` before filtering.

### `FE/src/components/landing/LandingPage.tsx`
- Removed the fabricated interactive "Book / YouTube / Movie" workflow demo and trust badges; removed now-unused `useState`.
- Kept the real product value proposition and sign-in/sign-up CTAs.

### `FE/src/__tests__/landing.test.tsx`
- Replaced two `as any` casts with `AuthContextType["user"]` / `AuthContextType["session"]` to keep strict TypeScript happy.

### `docs/deployment.md`
- Rewritten around two deployment options: unified Vercel (recommended) and split Vercel + Railway.
- Documents env vars, root directory `FE`, build/install commands and the architecture diagram.

---

## 3. New files — server libraries (`FE/src/lib/server/`)

### `auth.ts`
- `getAuthUser(req)` verifies the Supabase bearer token on every protected Route Handler and returns `{ id, token, email }`.

### `supabaseAdmin.ts`
- `getSupabaseAdmin()` lazily creates the server Supabase client. Previously the client was created at module scope, which made `next build` fail during page-data collection on Vercel with `Error: supabaseKey is required` when no build-time service-role key was present.
- Removed hardcoded Supabase URL/anon-key fallbacks; missing credentials now produce a clear runtime error instead of silently using a placeholder.
- `createAuthenticatedClient(token)` builds a Supabase client with the caller's JWT (never a service-role key on the frontend path).

### `geminiModels.ts`
- Centralized model configuration (no hardcoded IDs scattered through the codebase):
  - `DEFAULT_RUNTIME_MODEL = "gemini-3.8-flash"`
  - `DEFAULT_FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-latest"]`
  - `DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"`, 768 dimensions.
- Reads `GEMINI_RUNTIME_MODEL`, `GEMINI_FALLBACK_MODELS`, `GEMINI_EMBEDDING_MODEL`, `GEMINI_EMBEDDING_DIMENSIONS`, `GEMINI_API_KEY` from env.
- `generateContentWithFallback<T>()` implements a bounded ladder across models with per-model retries, an overall time/millisecond budget, and classification of transient (429/5xx/timeouts), retired-model and unrecoverable errors.

### `geminiService.ts`
- `EXTRACTION_PROMPT_VERSION = "v1.1.0"`.
- `normalizeCandidates()` validates and normalizes untrusted model JSON into typed candidates (title, creator, content type, subcategory, year, confidence, bounding box, evidence, direct URL, uncertainty reasons).
- `GeminiService.extractMediaFromImage()` sends the oriented image to Gemini, parses/validates the response, records model name, prompt version, token usage and duration. Runs with `{ retriesPerModel: 0, timeoutMs: 15_000, budgetMs: 38_000 }` so extraction plus persistence fits Vercel's 60s function limit.
- `GeminiService.generateEmbedding()` uses `gemini-embedding-001` (768 dims) with fallback.

### `cvService.ts`
- OpenCV/Pillow-equivalent processing via `sharp`: EXIF orientation, dimension metadata, bounding-box validation and deterministic crop generation for multi-item screenshots.

### `metadataRouter.ts`
- Provider adapters behind one interface (Open Library, TMDB, YouTube, Apple Podcasts, Google Books, Substack, generic) returning a normalized `NormalizedMetadataResult`.
- Missing/conflicting metadata is handled without fabricating results; provider name and external ID are retained.

### `linkResolver.ts`
- `resolveDirectUrl()` builds a direct link with this priority: extracted URL → provider page URL recovered from raw metadata → provider-specific search → Google/IMDb/Apple Podcasts/Substack/Coursera/Medium/YouTube search.
- URL sanitization (scheme allowlist), content-type normalization, `buildSearchQuery()`, `providerUrlFromMetadata()`, and per-provider URL builders.

### `schemaFallback.ts`
- `missingColumnFromError()` recognizes PostgREST errors such as `Could not find the 'direct_url' column of 'library_items' in the schema cache` and PostgreSQL `column table.column does not exist`.
- `withColumnFallback()` retries a write without each missing optional column (max 8 attempts) so lagging databases never silently discard AI output; emits a warning telling the operator to apply migrations.
- `isContentTypeConstraintError()` recognizes old CHECK-constraint rejections.
- Fixed during browser verification: the missing-column regex now handles qualified names like `identification_candidates.suggested_subcategory`.

### `storage.ts`
- `ensureStorageBucket()` finds the private bucket and can create it when a service-role key is configured.
- `getStorageClient()` uses the admin client for bucket/object operations when `SUPABASE_SERVICE_ROLE_KEY` is set. The caller's anon-key client cannot write to the private bucket, so uploads previously fell back to inline storage even after the bucket existed.
- `uploadImage()` stores to Supabase Storage when available, otherwise returns an inline data URL (originals are never lost).
- `isInlineDataUrl()`, `parseDataUrl()`, `buildMediaProxyUrl()`.
- Originals are never overwritten by crops/compressed derivatives.

### `processJob.ts`
- Full worker pipeline: fetch job → load original (inline data URL, storage, local path) → CV orientation → Gemini extraction → observability run record → per-candidate crop, metadata enrichment, direct-link resolution, candidate insert, library item upsert, RAG embedding, final job status.
- Uses `withColumnFallback` for both `identification_candidates` inserts and `library_items` writes, so `direct_url` / `subcategory` loss no longer breaks processing.
- Candidate provider data lives only in `provider_candidates` with `suggested_subcategory` / `direct_url` nested inside it; AI fields are additionally copied into `library_items.provider_metadata._mediamind` for recovery on older schemas.
- Downloads originals from the private bucket with the privileged storage client.
- Re-uploading an already-known title merges into the existing record: it looks up the same `(user_id, external_provider, external_id)`, updates that item, moves the preserved screenshot link, and removes the empty upload placeholder. The unique index from migration 006 is therefore enforced without breaking uploads.
- Content-type CHECK fallback: store as `other` and warn. Verification-status constraint fallback: retry with `auto_accepted` and warn.
- `after()`-safe: retry limits, error messages, run records for failures, token/cost telemetry.
- Skips RAG embedding generation when the job has already run longer than 42s, so a slow AI provider cannot push the write past the platform limit.

### `libraryIngest.ts`
- `acceptCandidate()` converts a reviewed candidate into a verified library item.
- Before writing, it checks for an existing item with the same provider identifier, re-points the preserved screenshot to it, and removes the redundant placeholder. This keeps review acceptance consistent with the unique deduplication index.
- Recovers provider metadata from `provider_candidates[].raw_payload` (older code only looked at non-existent top-level columns).
- Restores `subcategory` / `direct_url` from `provider_metadata._mediamind` when the dedicated columns are missing.
- Uses column/constraint fallbacks for the item update and avoids duplicate records by reusing the item linked to the same source asset.

### `health.ts`
- `buildHealthReport()` reports database connectivity, storage/bucket availability, AI model configuration and `schema.pending_columns`.
- `/api/health` returns 503 when degraded so monitoring can detect it.

---

## 4. New files — Route Handlers (`FE/src/app/api/`)

| Route | Purpose |
| --- | --- |
| `api/health/route.ts` | JSON health endpoint backed by `buildHealthReport()`. |
| `api/v1/auth/me/route.ts` | Current authenticated user. |
| `api/v1/assets/route.ts` | List source screenshots owned by the user. |
| `api/v1/assets/[id]/route.ts` | Inspect/delete a single source asset. |
| `api/v1/assets/media/[id]/route.ts` | Authenticated private media proxy (original + derivative) with signed-token query; enables previews while the bucket is missing. |
| `api/v1/assets/upload/route.ts` | Magic-byte file validation, size/type checks, saves the original unchanged, creates placeholder library item and job, schedules `processJob` with `after()`. |
| `api/v1/jobs/route.ts` | List jobs for the user; recovers jobs stuck in `processing` for more than 3 minutes by marking them failed with a retry message. |
| `api/v1/jobs/[id]/route.ts` | Job detail. |
| `api/v1/jobs/[id]/retry/route.ts` | Ownership-checked retry; resets status to `queued` and re-runs `processJob` via `after()`. |
| `api/v1/library/route.ts` | List/create library items with ownership filters, search, type/status filters and schema fallbacks. |
| `api/v1/library/subcategories/route.ts` | Returns distinct subcategories (no longer 500s on the old schema). |
| `api/v1/library/[id]/route.ts` | Item detail, PATCH with strict whitelist, DELETE; linked source assets. |
| `api/v1/library/[id]/verify/route.ts` | Manual verification of one item. |
| `api/v1/library/verify-all/route.ts` | Bulk verification. |
| `api/v1/library/[id]/sources/[assetId]/route.ts` | Link/unlink a preserved source screenshot. |
| `api/v1/reviews/candidates/route.ts` | Review queue listing. |
| `api/v1/reviews/candidates/[id]/route.ts` | Candidate detail. |
| `api/v1/reviews/candidates/[id]/accept/route.ts` | Accept candidate → verified library item via `acceptCandidate()`. |
| `api/v1/reviews/candidates/[id]/reject/route.ts` | Reject candidate while preserving the original screenshot. |
| `api/v1/reviews/counts/route.ts` | Pending/accepted/rejected counts. |
| `api/v1/reviews/jobs/[jobId]/accept-all/route.ts` | Accept all candidates for a job. |
| `api/v1/rag/ask/route.ts` | Grounded Ask AI over the user's verified library items and notes, with user filters. |
| `app/api/health/route.ts` and `app/health/route.ts` | Health page/endpoint entry points. |
| `src/actions/libraryActions.ts`, `src/actions/reviewActions.ts` | Server actions for library/review mutations. |

---

## 5. New files — migrations and tests

### `migrations/009_fix_verification_status_and_storage.sql`
- Extends the `verification_status` CHECK to include `needs_review` and inserts the private `screenshots` storage bucket.
- **Not applied on the live Supabase project** (no service-role/DB credentials available).

### Tests added
- `FE/src/__tests__/geminiModels.test.ts` — model ladder, env configuration, error classification.
- `FE/src/__tests__/geminiCandidates.test.ts` — extraction/validation of untrusted model output.
- `FE/src/__tests__/libraryIngest.test.ts` — candidate acceptance, provider payload recovery, `_mediamind` field preservation.
- `FE/src/__tests__/linkResolver.test.ts` — direct-link resolution and URL sanitization.
- `FE/src/__tests__/schemaFallback.test.ts` — missing-column detection (including qualified names), bounded retry, unrelated-error no-retry, CHECK-constraint detection.
- `FE/src/__tests__/live_gemini.integration.test.ts` — optional live integration coverage.

---

## 6. Verification performed

### Local checks
- `pnpm exec tsc --noEmit` — no errors.
- `pnpm test` — 41 passed, 2 skipped (11 files).
- `pnpm lint` — 0 errors, 28 pre-existing warnings (unused imports/props).
- `pnpm build` — passes (re-run after every production change).

### Local browser E2E (playwright-cli, `http://localhost:3100`)
- Public pages `/`, `/login`, `/about`, `/health` and unauthenticated 401s verified.
- Temp account `mediamind337586@euploading.com` created/confirmed and used for authenticated flows.
- Upload preserved the original and served it through `/api/v1/assets/media/[id]`.
- Initial run exposed old-schema failures; after the fallback fixes, retrying job `ee6754be-745a-46d4-bef4-466b0652bead` completed successfully with **"Rich Dad, Poor Dad"** by Robert T. Kiyosaki, type `book`, subcategory `Finance`, direct URL `https://openlibrary.org/works/OL2010879W`, provider `open_library`, status `auto_accepted`.
- `/api/v1/library/subcategories` returns `200 []` instead of `500`.

### Production (Vercel) verification
- Deployment `https://mediamind-red.vercel.app` is **Ready** (aliased production URL).
- `GET /api/health` now returns **HTTP 200 `healthy`**: database connected, storage available, `schema.pending_columns: []`, AI configured on `gemini-3.8-flash`.
- Migrations **005–009** applied live through the Supabase Management API; `subcategory`, `direct_url`, `isbn`, `genre`, the extended content types, `needs_review`, and the deduplication index all exist.
- Private `screenshots` bucket created (not public, 15 MB file limit) and `SUPABASE_SERVICE_ROLE_KEY` added to Vercel Production.
- Signed in with the temp account; the sidebar reports **Ready** and the library shows the identified book with a working Open Library direct link.
- `/sources` lists the preserved originals; both the historic inline screenshots still serve `200 image/jpeg` through the media proxy.
- `POST /api/v1/rag/ask` returns a grounded answer linking to the library item.
- Real production upload now reports `storage: "bucket"` and stores the original at `screenshots/<user>/<uuid>.jpg`; the media proxy serves it as `200 image/jpeg`.
- Re-uploading the same book merged into the existing item: library total stayed **1**, the item gained the new source link, the empty placeholder was removed, and the AI job completed in **10.9s** with `gemini-3.5-flash-lite`. The test duplicate source was then removed while the original evidence stayed preserved.

---

## 7. Known limitations / remaining work

- Gemini free-tier quota/rate limits: `gemini-3.8-flash` can time out and `gemini-3.5-flash` can return 429. Extraction uses a 38s budget with a 15s per-model timeout so the whole job fits Vercel's 60s limit; the fallback ladder usually finishes on `gemini-3.5-flash-lite`.
- RAG embeddings are skipped when a job runs longer than 42s; the RAG endpoint still answers via keyword/metadata scoring and embeddings can be regenerated later.
- `verification_status` on auto-identified items reads `auto_accepted`; items needing review read `needs_review`. Confirm the UI mapping with a multi-candidate screenshot.
- Browser flows still to exercise: review queue accept/reject (no pending candidates currently), manual entry, and edit/delete from the UI.
- The Supabase service-role key is stored as a Vercel Secret; rotating it requires updating Vercel and the local/backend environment together.

---

## 8. Required environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `NEXT_PUBLIC_API_URL` | Leave empty (`""`) so the frontend uses its own Route Handlers |
| `GEMINI_API_KEY` | Gemini API key (server-side only) |
| `GEMINI_RUNTIME_MODEL` | Runtime extraction model, e.g. `gemini-3.8-flash` (update from the retired `gemini-2.5-flash`) |
| `GEMINI_FALLBACK_MODELS` | Optional comma-separated fallback ladder |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` |
| `GEMINI_EMBEDDING_DIMENSIONS` | `768` |
| `SUPABASE_STORAGE_BUCKET` | `screenshots` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; required for private-bucket uploads/downloads and bucket provisioning. Set in Vercel Production as a Secret; never expose to the browser. |
| `TMDB_API_KEY`, `YOUTUBE_API_KEY` | Optional metadata providers |

---

## 9. Complete changed-file inventory (`git status --short`)

```
 M BE/scripts/apply_migrations.py
 M FE/.gitignore
 M FE/next.config.ts
 M FE/package.json
 M FE/pnpm-lock.yaml
 M FE/pnpm-workspace.yaml
 M FE/src/__tests__/landing.test.tsx
 M FE/src/app/library/page.tsx
 M FE/src/app/page.tsx
 M FE/src/app/sources/page.tsx
 M FE/src/components/dashboard/ProcessingStatusBanner.tsx
 M FE/src/components/landing/LandingPage.tsx
 M FE/src/components/layout/Sidebar.tsx
 M FE/src/lib/api.ts
 M FE/vercel.json
 M docs/deployment.md
?? deepseek v4.md
?? FE/src/__tests__/geminiCandidates.test.ts
?? FE/src/__tests__/geminiModels.test.ts
?? FE/src/__tests__/libraryIngest.test.ts
?? FE/src/__tests__/linkResolver.test.ts
?? FE/src/__tests__/live_gemini.integration.test.ts
?? FE/src/__tests__/schemaFallback.test.ts
?? FE/src/actions/
?? FE/src/app/api/
?? FE/src/app/health/
?? FE/src/lib/server/
?? migrations/009_fix_verification_status_and_storage.sql
```

Test-only artifacts (`.playwright-cli/`, lint logs, screenshots, `dev-server.log`) were removed before deploying.

---

## 10. Vercel production deployment — error fixed and shipped

### The deployment error
The failed deployment (`mediamind-9n4pxx50z`) aborted during **"Collecting page data"**:

```
Error: Failed to collect configuration for /api/v1/assets/[id]
[cause]: Error: supabaseKey is required.
    at module evaluation (src/lib/server/auth.ts:2:1)
    at module evaluation (src/app/api/v1/assets/[id]/route.ts:2:1)
```

Cause: `supabaseAdmin.ts` created the Supabase client at module scope. On Vercel the build environment did not provide `SUPABASE_SERVICE_ROLE_KEY`, so importing any route that pulled in `auth.ts` crashed the build.

### Fixes shipped
1. **Lazy Supabase client** — `getSupabaseAdmin()` creates the client inside the request, not at module evaluation. `auth.ts`, the media proxy and `health.ts` were updated. Hardcoded URL/key fallbacks were removed in favour of clear runtime errors.
2. **Production model env corrected** — Vercel `GEMINI_RUNTIME_MODEL` was overwritten with `gemini-3.8-flash` (`vercel env add ... --force`), matching the code default and avoiding the retired `gemini-2.5-flash` 404.
3. **Serverless timeout budget** — extraction reduced to a 38s total budget / 15s per model; RAG embeddings are skipped after 42s. This keeps upload → AI → persistence inside the 60s function limit.
4. **Stuck-job recovery** — a worker killed by the platform left jobs in `processing` forever. `GET /api/v1/jobs` now marks jobs untouched for 3+ minutes as failed with a retry message.
5. **Retry UI** — the dashboard banner now lists failed jobs and offers a working **Retry processing** button using the existing retry endpoint.
6. **Retired-model failures self-heal** — `GET /api/v1/jobs` automatically requeues failed jobs whose error mentions a retired model (e.g. the `gemini-2.5-flash` 404), within the job's retry budget, and re-runs them with the current model ladder.
7. **Readable errors** — raw provider JSON is reduced to a concise message (`readableProviderError`), and the banner translates retired-model/rate-limit failures into plain language instead of showing the raw payload.
8. **Live progress** — the dashboard polls every 8s while any job is queued/processing, so the banner and library update automatically.
9. **Accurate status indicator** — the sidebar shows `Ready`, `Degraded` (amber) or `Offline` (red), parsing the 503 health body instead of treating it as unreachable.
10. **Degraded status actually resolved** — migrations 005–009 applied to the live Supabase project, the private `screenshots` bucket created, and `SUPABASE_SERVICE_ROLE_KEY` set in Vercel Production. `/api/health` now returns `200 healthy`.
11. **Storage writes use a privileged client** — bucket provisioning, uploads and downloads previously used the caller's anon-key client, so writes to the private bucket fell back inline with 403. `storage.ts` now selects the admin client when a service-role key exists; the media proxy signs URLs with the same client.
12. **Deduplication merge** — re-uploading a known title now updates the existing `(user_id, external_provider, external_id)` record, moves the preserved screenshot link, and deletes the empty placeholder instead of violating migration 006's unique index.

### Deployment result
- `vercel deploy --prod` → **Ready**, production alias `https://mediamind-red.vercel.app`.
- Deployments: `mediamind-ksnfjzblq` (build fix), `mediamind-alxsaikcj` (timeouts/retry), `mediamind-dseilhi4v` (retired-model recovery), `mediamind-jzq7lehrc` (category scrolling), `mediamind-6adgvb8n2` (storage client + dedupe, current production).
- Production smoke tests:
  - `/api/health` → `200 healthy`, `pending_columns: []`, storage available.
  - Library renders the identified book once with a working direct link; sidebar shows **Ready**.
  - `/sources` renders preserved originals; inline and bucket-backed screenshots both return `200`.
  - `POST /api/v1/rag/ask` → grounded answer with source link.
  - Real upload → `storage: "bucket"`, job **identified in 10.9s** with `gemini-3.5-flash-lite`; title, creator, subcategory and `https://openlibrary.org/works/OL2010879W` persisted.
  - Re-upload of the same book merged into the existing item (library total stayed 1, placeholder removed). Stale-job recovery and retry were verified earlier; original screenshots remain preserved.
