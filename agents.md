# AGENTS.md — MediaMind

## Project identity

MediaMind is an AI-powered personal media library.

Its primary workflow converts uploaded screenshots into verified library entries for books, movies, TV shows, YouTube videos, documentaries, podcasts and online courses.

This repository must prioritize reliability, traceability, security and measurable AI performance.

## Approved architecture

- Frontend (`FE/`): Next.js App Router + TypeScript
- UI: Tailwind CSS + shadcn/ui
- Backend (`BE/`): Python + FastAPI (unified runner in `BE/run.py`)
- Database: Supabase PostgreSQL
- Authentication: Supabase Auth
- Storage: Private Supabase Storage
- Runtime AI: Gemini API
- Image processing: OpenCV + Pillow
- OCR: Optional PaddleOCR
- Vector search: pgvector
- Validation: Pydantic
- Background processing: PostgreSQL-backed jobs or verified Supabase Queues/pgmq
- Deployment: Free-tier-first, with local development support

Use a modular monolith. Keep the backend API and processing worker logically separated without introducing unnecessary microservices.

## Five core engineering disciplines

All implementation decisions must support:

1. Multimodal Document Intelligence
2. Computer Vision
3. LLM Evaluation & Observability
4. AI Workflow Automation
5. Enterprise RAG Engine

Do not introduce additional AI subsystems without a clear product requirement.

## Non-negotiable product requirements

### Original screenshot preservation
- Save the original screenshot before AI processing.
- Never overwrite original files with crops or compressed derivatives.
- Maintain a stable database reference to every original.
- Allow users to inspect the original when identification fails.
- Preserve the original when users reject or correct AI output.

### Single and bulk uploads
- Both upload modes are first-class features.
- Every screenshot gets its own processing job.
- One failed job must not stop the batch.
- Track individual job states and retries.
- Support multiple detected items in one screenshot.

### Human verification
- Support Identified, Needs Review, Unidentified and Failed states.
- Show candidate matches and supporting metadata.
- Allow manual corrections and manual entry.
- Store user verification separately from AI confidence.
- Never silently discard uncertain matches.

### Library management
- Support content types and metadata.
- Support Want to Consume, Currently Consuming, Completed, On Hold and Dropped.
- Support notes and ratings.
- Prevent duplicate records without destroying source evidence.

## Engineering principles

### Before changing code
1. Read this file.
2. Inspect relevant existing code.
3. Check the current architecture and conventions.
4. Identify dependencies and side effects.
5. Explain the planned change when it affects multiple modules.

Never assume the repository is empty.

Never delete or replace existing working code without a clear reason.

### Code quality
- Use strict TypeScript.
- Use Python type hints.
- Use Pydantic for request and AI-output validation.
- Keep modules focused and cohesive.
- Avoid giant components and giant service files.
- Separate UI, business logic, persistence and external integrations.
- Prefer explicit error handling.
- Avoid unnecessary abstractions.
- Avoid unnecessary dependencies.
- Do not add LangChain, LangGraph, Redis, Celery, Kubernetes or a separate vector database without a demonstrated need.

### Database
- Every schema change must have a versioned SQL migration.
- Do not rely on manual dashboard changes as the only schema definition.
- Add foreign keys, indexes and appropriate constraints.
- Use UUID identifiers where appropriate.
- Include user ownership in user-owned records.
- Enable RLS for user-owned data.
- Test RLS with separate user identities.
- Keep migrations reproducible.
- Do not expose service-role credentials.

### AI integrations
- Keep Gemini behind a provider adapter.
- Configure the runtime model using environment variables.
- Do not hardcode model identifiers throughout the codebase.
- Validate model output before persistence.
- Treat AI output as untrusted data.
- Version prompts.
- Track model and prompt versions for evaluation.
- Handle rate limits, timeouts and malformed responses.
- Never claim a model result is verified solely because the model expresses high confidence.

### Metadata integrations
- Keep every metadata provider behind its own adapter.
- Normalize provider results into internal schemas.
- Store provider name and external identifier.
- Handle missing and conflicting metadata.
- Respect API terms, quotas and attribution requirements.
- Never fabricate provider results.

### Workflow processing
- Every job must have a clear state.
- Jobs must be idempotent.
- Implement retry limits and backoff.
- Recover safely from worker restarts.
- Record meaningful failure information.
- Keep bulk jobs independent.
- Avoid processing the same source repeatedly without a reason.
- Ensure processing status is visible to the user.

### Evaluation and observability
- Record extraction and identification outcomes.
- Measure precision, recall, review rate, latency and failures.
- Record estimated cost when reliable usage data is available.
- Maintain a labelled evaluation dataset.
- Add regression tests for previously corrected failures.
- Do not present unmeasured accuracy claims.

### RAG
- Embed verified library metadata and user notes first.
- Enforce authenticated user filters before retrieval.
- Never retrieve another user's private records.
- Ground answers in retrieved information.
- Link answers to source library items.
- Clearly indicate when the library has insufficient information.
- Do not use RAG as a substitute for authoritative metadata identification.

## Security rules

- Keep secrets out of source control.
- Use `.env.example` with placeholder values.
- Never put service-role keys or Gemini API keys in frontend code.
- Validate uploaded files by actual contents, not just filename extensions.
- Restrict file size and upload frequency.
- Use private storage.
- Use temporary signed URLs for private files.
- Enforce ownership on backend resource access.
- Protect against unsafe paths and file handling.
- Rate-limit expensive AI operations.
- Avoid exposing private image URLs or credentials in logs.
- Apply ownership filters to all RAG queries.

## Cost rules

- Prefer free-tier services.
- Keep local development functional.
- Track AI usage and estimated costs.
- Avoid unnecessary repeated model calls.
- Cache appropriate metadata lookups.
- Limit concurrent processing.
- Provide clear quota and billing errors.
- Never silently switch to an expensive service.
- Never promise unlimited free usage.

## UI and UX rules

The interface should be premium, minimal, polished and usable.

Prioritize:
- Clear information hierarchy.
- Consistent spacing and typography.
- Responsive layouts.
- Accessible controls.
- Useful empty states.
- Clear loading and error states.
- Real upload progress.
- Understandable processing states.
- Original screenshot previews.
- Easy correction and review flows.

Avoid decorative complexity that makes the library harder to use.

Do not create buttons that do nothing.

Do not present mock data as real user data.

## Testing rules

Before declaring a task complete:
- Run relevant unit tests.
- Run relevant integration tests.
- Run TypeScript checks.
- Run linting.
- Run frontend build checks when relevant.
- Run backend tests.
- Test error and retry paths for processing changes.
- Test user ownership and authorization for data-access changes.

If a test cannot run, explain why.

Never claim tests passed unless they were actually executed.

## Documentation rules

Update documentation when architecture, setup or behavior changes.

Keep:
- README.md
- docs/architecture.md
- docs/database.md
- docs/api-contracts.md
- docs/ai-evaluation.md

Document environment variables and setup commands.

Do not write real secrets into documentation.

## Working protocol

For each task:

1. Understand the request.
2. Inspect affected files.
3. State the implementation plan.
4. Implement the smallest complete change.
5. Run tests and checks.
6. Review for security and regressions.
7. Update documentation.
8. Report what changed and what remains.

For large features, divide implementation into milestones.

Do not start a later milestone before the current one has passed its required checks.

## Completion report format

Every milestone report must contain:

- Summary
- Files changed
- Database migrations
- Features implemented
- Tests executed and results
- Build/type-check results
- Security considerations
- Known limitations
- Required environment variables
- Next milestone

Be accurate. A partially implemented feature must be reported as partially implemented.