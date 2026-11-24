# Production Deployment Guide

MediaMind supports two deployment options:
1. **Option A (Recommended for 100% Vercel)**: Unified Next.js Deployment (Frontend + Server Actions + Route Handlers entirely on Vercel without Railway).
2. **Option B (Containerized)**: Next.js Frontend on Vercel + FastAPI Backend on Railway / Render.

---

## 1. Option A: Unified Vercel Deployment (Zero Railway)

In this mode, all image processing (`sharp`), multimodal AI (`@google/genai`), metadata routing, and library management run directly inside Next.js Server Actions and Route Handlers on Vercel.

```mermaid
flowchart LR
    User[End User] --> FE["MediaMind Next.js (All-in-one on Vercel)"]
    FE -->|"Auth & Storage"| SupaStorage["Supabase (PostgreSQL + Auth + Storage)"]
    FE -->|"GEMINI_API_KEY"| Gemini["Google Gemini Multimodal API"]
```

### Steps to Deploy on Vercel:
1. Go to [vercel.com](https://vercel.com/) $\rightarrow$ **Add New...** $\rightarrow$ **Project**.
2. Select your `MediaMind` GitHub repository.
3. Configure settings:
   - **Framework Preset**: Next.js
   - **Root Directory**: `FE`
   - **Build Command**: `pnpm build`
   - **Install Command**: `pnpm install`
4. Set Environment Variables in the Vercel Dashboard:

| Variable | Description | Value |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | Application Name | `MediaMind` |
| `NEXT_PUBLIC_API_URL` | Self-hosted API URL | `""` *(Leave empty so it calls local serverless routes)* |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key | `eyJh...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key | Service role secret from Supabase |
| `SUPABASE_STORAGE_BUCKET` | Storage Bucket Name | `screenshots` |
| `GEMINI_API_KEY` | Google Gemini API Key | From Google AI Studio |
| `GEMINI_RUNTIME_MODEL` | Runtime Model ID | `gemini-3.5-flash-lite` |
| `TMDB_API_KEY` | TMDB API Key (Optional) | Movie/TV metadata lookup |
| `YOUTUBE_API_KEY` | YouTube Data API Key (Optional) | YouTube video metadata lookup |

5. Click **Deploy**.

---

## 2. Option B: Split Frontend (Vercel) + Backend (Railway)

### Step 2.1: Create Project on Railway
1. Go to [railway.app](https://railway.app/) and sign in with GitHub.
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select the `MediaMind` repository.

### Step 2.2: Configure Service Settings
1. Click on the newly created service card in the Railway dashboard.
2. Go to **Settings**:
   - **Root Directory**: Set to `/BE`
   - **Build**: Railway automatically detects `BE/Dockerfile` and `BE/railway.json`.
3. In **Networking**:
   - Click **Generate Domain** (e.g., `https://mediamind-backend-production.up.railway.app`).
   - Copy this URL (needed for your frontend environment variable).

### Step 2.3: Set Backend Environment Variables
In the Railway service **Variables** tab, add:

| Variable | Description | Example / Note |
| :--- | :--- | :--- |
| `ENVIRONMENT` | Runtime environment | `production` |
| `DEBUG` | Debug logging | `false` |
| `SUPABASE_URL` | Supabase Project URL | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase Anon Key | `eyJh...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key | `eyJh...` |
| `SUPABASE_JWT_SECRET` | Supabase JWT Secret | From Supabase Project Settings → API |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres` |
| `GEMINI_API_KEY` | Google Gemini API Key | From Google AI Studio |
| `GEMINI_RUNTIME_MODEL` | Runtime Model ID | `gemini-3.5-flash-lite` |
| `BACKEND_CORS_ORIGINS` | Allowed frontend domains | `https://*.vercel.app,http://localhost:3000` |

> [!NOTE]
> `BE/run.py` automatically binds to `0.0.0.0` and the port injected by Railway's `$PORT` variable. The healthcheck endpoint is at `/health`.

---

## 3. Frontend Deployment: Vercel

### Step 3.1: Import Project in Vercel
1. Go to [vercel.com](https://vercel.com/) and click **Add New...** → **Project**.
2. Select your `MediaMind` GitHub repository.

### Step 3.2: Configure Project Settings
1. **Framework Preset**: Next.js
2. **Root Directory**: Click **Edit** and choose `FE`
3. **Build Command**: `pnpm build` (default)
4. **Output Directory**: `.next` (default)
5. **Install Command**: `pnpm install` (default)

### Step 3.3: Set Frontend Environment Variables
In the **Environment Variables** section on Vercel, configure:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | Application Name | `MediaMind` |
| `NEXT_PUBLIC_API_URL` | Railway Backend Public URL | `https://mediamind-backend-production.up.railway.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key | `eyJh...` |

4. Click **Deploy**. Vercel will build and assign a domain (e.g., `https://mediamind.vercel.app`).

---

## 4. Supabase Setup Checklist

Before going live:
1. Ensure the PostgreSQL migrations have been applied:
   ```bash
   cd BE
   python scripts/apply_migrations.py
   ```
   All migrations 001–009 are applied on the live project as of 2026-11-19.
2. In Supabase Dashboard → **Storage**:
   - Create a bucket named `screenshots` set to **Private** (migration 009 also creates it when the `storage` schema is present).
   - Set `SUPABASE_SERVICE_ROLE_KEY` in the hosting environment. The app uses it for bucket provisioning and private uploads/downloads; without it, originals fall back to inline storage.
3. In Supabase Dashboard → **Authentication** → **URL Configuration**:
   - Add your Vercel URL (e.g., `https://mediamind.vercel.app/**`) to **Redirect URLs**.

---

## 5. Verification Checklist

- [ ] Railway backend deployment shows `HEALTHY` at `/health`.
- [ ] Vercel frontend loads the landing page and allows sign-in/sign-up.
- [ ] Uploading a screenshot immediately adds an active library item.
- [ ] Zoom modal displays original screenshot preview.
- [ ] AI extraction populates title, category, author, and direct link.
