"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { ProcessingStatusBanner } from "@/components/dashboard/ProcessingStatusBanner";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { QuickUploadModal } from "@/components/dashboard/QuickUploadModal";
import { AskLibraryModal } from "@/components/dashboard/AskLibraryModal";
import { checkBackendHealth, getLibraryItems, getProcessingJobs } from "@/lib/api";
import { HealthStatus, LibraryItem, ProcessingJob } from "@/types";
import { RefreshCw } from "lucide-react";

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAskAIOpen, setIsAskAIOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [healthRes, itemsRes, jobsRes] = await Promise.all([
        checkBackendHealth(),
        getLibraryItems({ limit: 10 }),
        getProcessingJobs(),
      ]);
      setHealth(healthRes);
      setLibraryItems(itemsRes.items);
      setJobs(jobsRes);
    } catch {
      // Keep previous state
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isSubscribed = true;

    async function initialFetch() {
      try {
        const [healthRes, itemsRes, jobsRes] = await Promise.all([
          checkBackendHealth(),
          getLibraryItems({ limit: 10 }),
          getProcessingJobs(),
        ]);
        if (isSubscribed) {
          setHealth(healthRes);
          setLibraryItems(itemsRes.items);
          setJobs(jobsRes);
          setIsLoading(false);
        }
      } catch {
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    }

    initialFetch();

    return () => {
      isSubscribed = false;
    };
  }, []);

  // Derived metrics
  const totalItems = libraryItems.length;
  const wantToConsume = libraryItems.filter((i) => i.consumption_status === "want_to_consume").length;
  const consuming = libraryItems.filter((i) => i.consumption_status === "consuming").length;
  const completed = libraryItems.filter((i) => i.consumption_status === "completed").length;
  const pendingReviewCount = jobs.filter((j) => j.status === "needs_review").length;

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-stone-900 flex">
      {/* Sidebar */}
      <Sidebar health={health} pendingReviewCount={pendingReviewCount} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onOpenUpload={() => setIsUploadOpen(true)}
          onOpenAskAI={() => setIsAskAIOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
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

            <button
              onClick={refreshData}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-xs font-bold transition-all shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Refresh Library</span>
            </button>
          </div>

          {/* Processing and Review Alert Banners */}
          <ProcessingStatusBanner jobs={jobs} pendingReviewCount={pendingReviewCount} />

          {/* Core Metrics Cards */}
          <MetricsCards
            totalItems={totalItems}
            wantToConsume={wantToConsume}
            consuming={consuming}
            completed={completed}
          />

          {/* Recent Activity & Content Grid */}
          <RecentActivity
            items={libraryItems}
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
