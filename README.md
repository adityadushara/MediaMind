# MediaMind 🧠📚🎬📰

> **An AI-powered personal media library that converts screenshots into verified, rich catalog entries for books, YouTube videos, Substack articles, newsletters, movies, TV shows, podcasts, and online courses.**

[![Architecture](https://img.shields.io/badge/Architecture-Modular%20Monolith-blue)](docs/architecture.md)
[![Backend](https://img.shields.io/badge/Backend-FastAPI%20%2B%20Python%203.12-green)](BE)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2015%20%2B%20TypeScript-black)](FE)
[![Database](https://img.shields.io/badge/Database-Supabase%20Postgres%20%2B%20pgvector-emerald)](docs/database.md)
[![Tests](https://img.shields.io/badge/Tests-107%20Passed-brightgreen)](BE/tests)
[![License](https://img.shields.io/badge/License-MIT-purple)](ABOUT.md)

---

## 🌟 Core Highlights

- **Original Screenshot Preservation**: Every upload is immutably stored in private cloud storage with a SHA-256 fingerprint. Original files are never overwritten or compressed away.
- **8 Supported Media Classes**: Native support for 📚 Books, ▶️ YouTube Videos, 📰 Substack & Web Articles, ✉️ Newsletters, 🎬 Movies, 📺 TV Shows, 🎓 Online Courses, and 🎙️ Podcasts.
- **One-Click Links & Topic Tagging**: Automatically synthesizes direct canonical links (Google Books, YouTube, IMDb, Substack, Medium) and categorizes items into topics (*Psychology*, *Habits*, *Money & Finance*, *Tech & AI*, *Essays*).
- **Distraction-Free Light Theme**: Clean, warm, minimalist study aesthetic with responsive mouse scroll wheel horizontal navigation, cursor drag-to-scroll, and touch swiping with zero visible scrollbars.
- **Computer Vision Preprocessing**: OpenCV and Pillow handle auto-orientation, EXIF correction, dimension normalization, and non-destructive visual region proposals.
- **Async Workflow Automation**: PostgreSQL-backed job queue with per-item isolation, automatic exponential backoff, worker lease tokens, and crash recovery.
- **Human Verification Center**: Uncertain matches route to `/review` for side-by-side inspection with original screenshots, authoritative external provider cards, and explainability pills.
- **Enterprise RAG ("Ask Your Library")**: Natural language semantic search and grounded Q&A over personal media records and user notes using `pgvector`.
- **LLM Observability**: Prompt versioning, latency tracking, token consumption, and automated regression benchmark suites.

---

## 🏗️ Architecture

MediaMind is organized as a production-grade modular monolith:
- `FE/`: Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn/ui.
- `BE/`: FastAPI REST API, persistent background queue worker, AI and metadata adapters.
- `migrations/`: Chronological, reproducible SQL migrations (001 through 007).
- `docs/`: In-depth architectural specifications, ADRs, database diagrams, and evaluation reports.

See [docs/architecture.md](docs/architecture.md) for full architectural documentation.

---

## 🚀 Quickstart & Local Development

### Quickest Start: Unified Full-Stack Runner
To start the entire backend (FastAPI API Server + Background Queue Worker):
```bash
# From project root:
python BE/run.py

# Or inside BE/:
cd BE
python run.py
```
Or start both backend and frontend together with a single command:
```bash
python BE/run.py --frontend
```

---

### Manual Individual Service Setup

#### 1. Backend Setup
```bash
cd BE
python -m venv venv

# On Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# On macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

#### 2. Running the Background Processing Worker
```bash
# In a second terminal with BE/venv activated:
cd BE
python -m app.worker.runner

# Or for a single-pass run:
python -m app.worker.runner --run-once
```

#### 3. Frontend Setup
```bash
cd FE
npm install
cp .env.example .env.local
npm run dev
```

Visit:
- **Web App**: [http://localhost:3000](http://localhost:3000)
- **Review Center**: [http://localhost:3000/review](http://localhost:3000/review)
- **Library**: [http://localhost:3000/library](http://localhost:3000/library)
- **API Swagger Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

---

## 🧪 Verification & Testing Suite

| Test Suite | Command | Coverage | Status |
|---|---|---|---|
| **Backend Tests** | `pytest BE/tests` | 107 unit & integration tests | ✅ 100% Passed |
| **Frontend Tests** | `cd FE && npm test` | 5 vitest unit tests | ✅ 100% Passed |
| **TypeScript Check** | `cd FE && npx tsc --noEmit` | Strict type validation | ✅ 0 Errors |
| **Production Build** | `cd FE && npm run build` | Turbopack compilation | ✅ 6 Routes Passed |

---

## 🗺️ Implementation Milestones

- ✅ **Milestone M0**: Groundwork, Architecture, Security Boundaries & Threat Modeling
- ✅ **Milestone M1**: Authentication, Private Storage Adapters, Database Schema & Initial RLS
- ✅ **Milestone M2**: Reliable Media Library & Screenshot Ingestion Foundation
- ✅ **Milestone M3**: Multimodal Extraction & Computer Vision Engine (OpenCV + Gemini AI)
- ✅ **Milestone M4**: External Metadata Provider Integrations (Google Books, YouTube, TMDB, Open Library) & Entity Resolution
- ✅ **Milestone M5**: Multi-Source Screenshot Deduplication & Human Verification Queue Polish
- ✅ **Milestone M6**: Enterprise RAG Engine ("Ask Your Library") with Hybrid Semantic Retrieval
- ✅ **Milestone M7**: Substack, Newsletter & Article Intelligence + Mouse Scroll Wheel Navigation
- 🚀 **Milestone M8**: Production Hardening & Cloud Deployment (Vercel + Supabase + Render/Railway)

---

## 🚢 Production Deployment Guide

### 1. Database & Storage (Supabase)
1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Execute SQL migrations in order from `migrations/001_initial_schema.sql` through `migrations/008_auto_confirm_users.sql`.
3. Create a private storage bucket named `screenshots`.
4. **Email Confirmation**: In Supabase Dashboard, navigate to **Authentication > Providers > Email** and turn OFF **Confirm email** so users can sign up and directly access their library without email confirmation.

### 2. Backend API & Worker (Render / Railway / Fly.io / Docker)
- **Using Docker**: Deploy with the production multi-stage `BE/Dockerfile` which automatically launches both FastAPI and the worker runner.
- **Using Native Python / Procfile**: Deploy using `BE/Procfile`:
  - Web: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
  - Worker: `python -m app.worker.runner`
  - Or unified single container: `python run.py --no-reload` (auto-detects cloud `$PORT` and `$HOST`).
- **Required Env**: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `BACKEND_CORS_ORIGINS`.

### 3. Frontend (Vercel / Docker)
1. **Vercel**: Connect repository, set root directory to `FE`.
2. **Docker Compose**: Run `docker compose up --build` from repository root to launch both frontend and backend locally or on any VPS.
3. Configure environment variable: `NEXT_PUBLIC_API_URL=https://your-backend-domain.com`.

---

## 📄 Documentation Reference

- [About MediaMind Vision](ABOUT.md)
- [System Architecture](docs/architecture.md)
- [Database Schema & Migrations](docs/database.md)
- [API Contracts](docs/api-contracts.md)
- [AI Evaluation & Observability](docs/ai-evaluation.md)
- [Quickstart Guide](start.md)
- [Engineering Guidelines](agents.md)
