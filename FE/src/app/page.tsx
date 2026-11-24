"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { ProcessingStatusBanner } from "@/components/dashboard/ProcessingStatusBanner";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { QuickUploadModal } from "@/components/dashboard/QuickUploadModal";
import { AskLibraryModal } from "@/components/dashboard/AskLibraryModal";
import { getLibraryItems, getLibraryStats, getProcessingJobs, onApiCacheUpdate } from "@/lib/api";
import { LibraryItem, LibraryStats, ProcessingJob } from "@/types";
import { RefreshCw, Loader2, UploadCloud } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LandingPage } from "@/components/landing/LandingPage";

export default function DashboardPage() {
  const { user, isLoading: isAuthLoading, openAuthModal } = useAuth();
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAskAIOpen, setIsAskAIOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Each panel paints as soon as its own data arrives. Waiting for the slowest
  // request (the job list, which does recovery work) held the counts back by
  // two seconds for no reason.
  const refreshData = useCallback(async (options?: { silent?: boolean }) => {
    if (!user) return;
    if (!options?.silent) setIsLoading(true);

    const itemsRequest = getLibraryItems({ limit: 10 })
      .then((res) => {
        setLibraryItems(Array.isArray(res?.items) ? res.items : []);
      })
      .catch(() => {});

    const statsRequest = getLibraryStats()
      .then((res) => setStats(res))
      .catch(() => {});

    const jobsRequest = getProcessingJobs()
      .then((res) => setJobs(Array.isArray(res) ? res : []))
      .catch(() => {});

    await Promise.all([itemsRequest, statsRequest, jobsRequest]);
    if (!options?.silent) setIsLoading(false);
  }, [user]);

  // Reads are served from cache and refreshed in the background, so the
  // dashboard repaints itself when a fresh copy lands instead of waiting for a
  // manual reload to notice a status change made in the library.
  useEffect(
    () =>
      onApiCacheUpdate(() => {
        void refreshData({ silent: true });
      }),
    [refreshData]
  );

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      queueMicrotask(() => {
        setLibraryItems([]);
        setJobs([]);
        setStats(null);
        setIsLoading(false);
      });
      return;
    }

    async function loadDashboard() {
      await refreshData();
    }

    loadDashboard();
  }, [user, isAuthLoading, refreshData]);

  // While a job is queued/processing, refresh so the banner and library
  // reflect completion without a manual reload.
  useEffect(() => {
    if (!user) return;
    const hasActive = jobs.some(
      (job) => job.status === "queued" || job.status === "processing"
    );
    if (!hasActive) return;

    const timer = setInterval(() => {
      void refreshData({ silent: true });
    }, 8000);

    return () => clearInterval(timer);
  }, [user, jobs, refreshData]);

  // If session is initializing, show clean spinner
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#FBF9F5] flex flex-col items-center justify-center p-6 space-y-4">
        <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
        <p className="text-sm font-semibold text-stone-600">Loading MediaMind...</p>
      </div>
    );
  }

  // If visitor is unauthenticated, show public product landing page
  if (!user) {
    return (
      <LandingPage
        onSignIn={() => openAuthModal("signin")}
        onSignUp={() => openAuthModal("signup")}
      />
    );
  }

  // Derived metrics. Counts come from the server so they stay correct past the
  // first page of library items; the loaded items are only a fallback.
  const totalItems = stats?.total ?? libraryItems.length;
  const wantToConsume = stats
    ? stats.by_status.want_to_consume
    : libraryItems.filter((i) => i.consumption_status === "want_to_consume").length;
  const consuming = stats
    ? stats.by_status.consuming
    : libraryItems.filter((i) => i.consumption_status === "consuming").length;
  const completed = stats
    ? stats.by_status.completed
    : libraryItems.filter((i) => i.consumption_status === "completed").length;
  const pendingReviewCount = Math.max(
    stats?.needs_review ?? 0,
    jobs.filter((j) => j.status === "needs_review").length
  );

  // Dashboard search filters the recent list immediately, matching the fields
  // the library search covers.
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleItems = normalizedQuery
    ? libraryItems.filter((item) =>
        [item.title, item.creator, item.subcategory, item.genre]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery))
      )
    : libraryItems;

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-stone-900 flex">
      {/* Sidebar */}
      <Sidebar pendingReviewCount={pendingReviewCount} onOpenUpload={() => setIsUploadOpen(true)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onOpenUpload={() => setIsUploadOpen(true)}
          onOpenAskAI={() => setIsAskAIOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6 min-w-0">
          {/* Welcome Banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-stone-900 flex items-center gap-2.5">
                <span>Personal Study & Media Hub</span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold">
                  v1.0.0
                </span>
              </h1>
              <p className="text-sm text-stone-600 mt-1">
                Your focused library of books, YouTube videos, and movies curated effortlessly from screenshots.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => refreshData()}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>

              <button
                onClick={() => setIsUploadOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm shadow-amber-600/20 active:scale-95 cursor-pointer"
              >
                <UploadCloud className="h-4 w-4" />
                <span>Add Screenshot</span>
              </button>
            </div>
          </div>

          {/* Processing and Review Alert Banners */}
          <ProcessingStatusBanner
            jobs={jobs}
            pendingReviewCount={pendingReviewCount}
            onRetried={() => refreshData({ silent: true })}
          />

          {/* Core Metrics Cards */}
          <MetricsCards
            totalItems={totalItems}
            wantToConsume={wantToConsume}
            consuming={consuming}
            completed={completed}
          />

          {/* Recent Activity & Content Grid */}
          <RecentActivity
            items={visibleItems}
            searchTerm={normalizedQuery}
            onOpenUpload={() => setIsUploadOpen(true)}
          />
        </main>
      </div>

      {/* Quick Upload Modal */}
      <QuickUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={refreshData}
      />

      {/* Ask Your Library AI Modal */}
      <AskLibraryModal
        isOpen={isAskAIOpen}
        onClose={() => setIsAskAIOpen(false)}
      />
    </div>
  );
}
