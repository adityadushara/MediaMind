# 🚀 MediaMind — Quickstart & Startup Guide (`start.md`)

Welcome to **MediaMind** — an AI-powered personal media library that converts screenshots into verified, rich catalog entries for books, movies, TV shows, YouTube videos, documentaries, podcasts, and online courses.

This guide provides clear, step-by-step instructions to set up, configure, and run the complete full-stack project locally.

---

## 📋 System Prerequisites

Ensure you have the following installed on your machine:
* **Node.js**: $\ge 20.0$ (Tested with Node 20 / 22 / 24)
* **Python**: $\ge 3.11$ (Tested with Python 3.12)
* **Package Manager**: `npm` or `pnpm`
* **Git**

---

## ⚡ Quickest Way to Run: Single Command Backend Runner

To run both backend services (FastAPI Server + Background Processing Worker) together in one terminal:
```bash
# From the project root:
python BE/run.py

# Or from inside BE directory:
cd BE
python run.py
```
Or to run the entire stack (Backend + Frontend Next.js) together:
```bash
python BE/run.py --frontend
```

---

## 🛠️ Step 1: Backend Setup (FastAPI + Python)

Open a terminal (e.g. PowerShell on Windows or Bash on macOS/Linux):

### 1. Navigate to the BE directory
```bash
cd BE
```

### 2. Create and activate the Python virtual environment
**On Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

*(If PowerShell blocks script execution, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` first)*

**On macOS / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure environment variables
Create a `.env` file in the `BE/` directory by copying the template:
```bash
cp .env.example .env
```
*(On Windows cmd: `copy .env.example .env`)*

**Key Variables inside `BE/.env`:**
```ini
# Optional: Google Gemini API Key for live AI extraction & Ask Your Library
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_RUNTIME_MODEL=gemini-3.5-flash

# Database: SQLite is the default zero-config local fallback
DATABASE_URL=sqlite:///./mediamind_dev.db

# Optional Supabase credentials for production PostgreSQL
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional external metadata provider keys (books & videos work even without keys via zero-key oEmbed / OpenLibrary)
GOOGLE_BOOKS_API_KEY=
TMDB_API_KEY=
YOUTUBE_API_KEY=
```

### 5. Start the FastAPI API Server
With your virtual environment activated:
```bash
uvicorn app.main:app --reload --port 8000
```
The backend API is now running at **`http://localhost:8000`**.  
Interactive Swagger documentation is available at **`http://localhost:8000/docs`**.

---

## ⚙️ Step 2: Running the Background Processing Worker

The background worker automatically claims queued screenshot jobs, executes OpenCV image preprocessing, invokes Gemini multimodal extraction, queries external metadata providers, and generates derivative crops.

Open a **second terminal window**, navigate to `BE/`, activate the virtual environment, and run:

**On Windows (PowerShell):**
```powershell
cd BE
.\venv\Scripts\Activate.ps1
python -m app.worker.runner
```

**On macOS / Linux:**
```bash
cd BE
source venv/bin/activate
python -m app.worker.runner
```

*(Tip: For a single execution pass during testing, pass `python -m app.worker.runner --run-once`)*

---

## 🎨 Step 3: Frontend Setup (Next.js 15 App Router)

Open a **third terminal window**:

### 1. Navigate to the FE directory
```bash
cd FE
```

### 2. Install dependencies
```bash
npm install
# or if using pnpm:
# pnpm install
```

### 3. Configure environment variables
Ensure `FE/.env.local` exists (or copy from `.env.example`):
```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 4. Start the Next.js development server
```bash
npm run dev
# or: pnpm run dev
```

Visit **`http://localhost:3000`** in your browser!

---

## 🌐 Interactive Application URLs

| Interface | URL | Purpose |
|---|---|---|
| **Dashboard** | `http://localhost:3000/` | Personal study & media hub, metrics, recent additions, Ask AI modal. |
| **Media Library** | `http://localhost:3000/library` | Filterable library by type, subcategory, 1-click playable/readable links, detail drawer. |
| **Review Center** | `http://localhost:3000/review` | Verification queue for AI-extracted screenshots, crop focus, metadata apply, approval. |
| **Upload Center** | `http://localhost:3000/upload` | Single & batch drag-and-drop screenshot uploads with real-time processing status. |
| **API Documentation** | `http://localhost:8000/docs` | Interactive OpenAPI Swagger UI for all REST endpoints. |
| **Health Check** | `http://localhost:8000/health` | Backend and database connectivity status JSON. |

---

## 🧪 Running Automated Tests

### Backend Unit & Integration Tests (107 Tests)
With the backend virtual environment activated:
```bash
cd BE
python -m pytest tests
```

### Frontend Vitest Suite (5 Tests)
```bash
cd FE
npm test
# or: pnpm test
```

### Next.js Production Build Verification
```bash
cd FE
npm run build
# or: pnpm run build
```

---

## 💡 Troubleshooting & Tips

* **CORS Errors**: The backend default allows `http://localhost:3000`. If running frontend on another port, update `BACKEND_CORS_ORIGINS` in `BE/.env`.
* **Database Reset (Local SQLite)**: To reset the local database, simply delete `BE/mediamind_dev.db`. It will automatically recreate on next backend startup.
* **Storage Location**: Local uploads and derivative crops are saved in `BE/storage_data/screenshots/` when running offline.
