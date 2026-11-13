# MediaMind 🧠📚🎬

> An AI-powered personal media library that converts screenshots into verified, rich catalog entries for books, movies, TV shows, YouTube videos, documentaries, podcasts, and online courses.

[![Architecture](https://img.shields.io/badge/Architecture-Modular%20Monolith-blue)](docs/architecture.md)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20%2B%20Python%203.12-green)](backend)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2015%20%2B%20TypeScript-black)](frontend)
[![Database](https://img.shields.io/badge/Database-Supabase%20Postgres%20%2B%20pgvector-emerald)](docs/database.md)

---

## 🌟 Core Highlights

- **Original Screenshot Preservation**: Every upload is immutably stored in private cloud storage with a SHA-256 fingerprint. Nothing is overwritten or discarded on failure.
- **Multimodal Document Intelligence**: Powered by Gemini to extract structured entities, creators, and visual clues.
- **Computer Vision Preprocessing**: OpenCV and Pillow handle aspect ratio validation, dimension analysis, and non-destructive visual region proposals.
- **Async Workflow Automation**: PostgreSQL-backed job queue with per-item isolation, automatic retries, backoff, and idempotent execution.
- **Human Verification Center**: Uncertain matches are routed to a human review queue allowing side-by-side comparison with original screenshots.
- **Enterprise RAG Engine**: Semantic search and grounded Q&A over personal media records and user notes using `pgvector`.
- **LLM Observability**: Prompt versioning, latency, token consumption, and benchmark evaluation suites.

---

## 🏗️ Architecture

MediaMind is organized as a modular monolith:
- `frontend/`: Next.js App Router, Tailwind CSS, shadcn/ui.
- `backend/`: FastAPI REST API, background queue worker, AI and metadata adapters.
- `migrations/`: Chronological, reproducible SQL migrations.
- `docs/`: Technical specifications.

See [docs/architecture.md](docs/architecture.md) for full architectural documentation.

---

## 🚀 Quickstart & Local Development

### Prerequisites
- Node.js $\ge 20$ (Recommended Node 24+)
- Python $\ge 3.11$ (Tested on Python 3.12)
- Git

### 1. Backend Setup
```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\Activate.ps1
# On macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) for the UI and [http://localhost:8000/docs](http://localhost:8000/docs) for the interactive Swagger API documentation.

---

## 📄 Documentation Reference
- [Architecture](docs/architecture.md)
- [Database Schema](docs/database.md)
- [API Contracts](docs/api-contracts.md)
- [AI Evaluation & Observability](docs/ai-evaluation.md)
- [AGENTS.md Guidelines](agents.md)
