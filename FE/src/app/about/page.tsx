"use client";

import React, { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { QuickUploadModal } from "@/components/dashboard/QuickUploadModal";
import { AskLibraryModal } from "@/components/dashboard/AskLibraryModal";
import { checkBackendHealth } from "@/lib/api";
import { HealthStatus } from "@/types";
import {
  BookMarked,
  Sparkles,
  Camera,
  Layers,
  Search,
  Lock,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Database,
} from "lucide-react";

export default function AboutPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAskAIOpen, setIsAskAIOpen] = useState(false);

  useEffect(() => {
    checkBackendHealth().then(setHealth).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-stone-900 flex">
      <Sidebar health={health} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onOpenUpload={() => setIsUploadOpen(true)}
          onOpenAskAI={() => setIsAskAIOpen(true)}
        />

        <main className="flex-1 p-6 md:p-10 max-w-5xl w-full mx-auto space-y-10">
          {/* Hero Section */}
          <div className="space-y-4 text-center max-w-2xl mx-auto pt-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold shadow-2xs">
              <Sparkles className="h-3.5 w-3.5 text-amber-700" />
              <span>About MediaMind</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-stone-900 leading-tight">
              Transforming the <span className="text-amber-700 underline decoration-amber-300 underline-offset-4">Screenshot Graveyard</span> into Your Second Brain
            </h1>
            <p className="text-sm md:text-base text-stone-600 leading-relaxed">
              Every day, recommendations from Instagram Reels, Substack newsletters, TikTok, YouTube Shorts, and tweets get buried in camera rolls.
              MediaMind uses Computer Vision and Multimodal AI to instantly convert those screenshots into verified catalog entries with one-click direct links.
            </p>
          </div>

          {/* Core Feature Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-3">
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 w-fit">
                <Camera className="h-6 w-6" />
              </div>
              <h3 className="font-extrabold text-stone-900 text-base">Zero-Friction Ingestion</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Drop phone screenshots directly into the app. OpenCV auto-rotates phone captures, normalizes dimensions, and crops focused covers without modifying your original files.
              </p>
            </div>

            <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-3">
              <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-800 w-fit">
                <Cpu className="h-6 w-6" />
              </div>
              <h3 className="font-extrabold text-stone-900 text-base">Multimodal Intelligence</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Powered by Gemini to extract structured entities, creators, subcategories, and visual clues, while querying Google Books and YouTube for official metadata.
              </p>
            </div>

            <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-xs space-y-3">
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 w-fit">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="font-extrabold text-stone-900 text-base">Ask Your Library (RAG)</h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Natural language semantic search powered by vector similarity. Ask questions like <em>&quot;What was that podcast about habit building?&quot;</em> and get instant, grounded results.
              </p>
            </div>
          </div>

          {/* Architecture & Reliability */}
          <div className="bg-white rounded-3xl border border-stone-200 p-8 shadow-xs space-y-6">
            <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
              <div>
                <h3 className="font-extrabold text-lg text-stone-900">Enterprise Engineering Standards</h3>
                <p className="text-xs text-stone-500">Built as a production-ready modular monolith with free-tier-first architecture</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-stone-700">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Original Evidence Preservation</strong>: SHA-256 fingerprinting on private cloud storage; originals are never overwritten.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Row-Level Security (RLS)</strong>: Supabase PostgreSQL ensures complete tenant isolation for private libraries and notes.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Multi-Source Deduplication</strong>: Associating multiple screenshots of the same book or movie to a single library card.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Sub-5-Second SLA</strong>: Optimized async pipeline delivers AI extraction and semantic search under 5 seconds.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Multi-Class Ingestion</strong>: Built-in support for Books, YouTube, Substack essays, Newsletters, Movies, TV, Courses, and Podcasts.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span><strong>Zero-Distraction UX</strong>: Responsive mouse wheel horizontal category navigation and touch swiping with zero visible scrollbars.</span>
              </div>
            </div>
          </div>

          {/* Tech Stack Pills */}
          <div className="text-center space-y-3 pb-6">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-400">Powered By</span>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {["Next.js 15", "TypeScript", "Tailwind CSS", "FastAPI", "Python 3.12", "Google Gemini", "OpenCV", "Pillow", "Supabase Postgres", "pgvector"].map((tech) => (
                <span
                  key={tech}
                  className="px-3 py-1 rounded-xl bg-stone-100 text-stone-700 text-xs font-semibold border border-stone-200"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </main>
      </div>

      <QuickUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={() => {}}
      />

      <AskLibraryModal
        isOpen={isAskAIOpen}
        onClose={() => setIsAskAIOpen(false)}
      />
    </div>
  );
}
