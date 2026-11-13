"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { ProcessingStatusBanner } from "@/components/dashboard/ProcessingStatusBanner";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { QuickUploadModal } from "@/components/dashboard/QuickUploadModal";
import { checkBackendHealth, getLibraryItems, getProcessingJobs } from "@/lib/api";
import { HealthStatus, LibraryItem, ProcessingJob } from "@/types";
import { RefreshCw } from "lucide-react";

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex">
      {/* Sidebar */}
      <Sidebar health={health} pendingReviewCount={pendingReviewCount} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onOpenUpload={() => setIsUploadOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <main className="flex-1 p-8 max-w-7xl w-full mx-auto space-y-8">
          {/* Welcome Banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-neutral-800">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <span>Personal Media Hub</span>
                <span className="p-1 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-mono font-medium">
                  v1.0.0
                </span>
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Your intelligent library of books, movies, videos, and courses curated from screenshots.
              </p>
            </div>

            <button
              onClick={refreshData}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-medium transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
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
    </div>
  );
}
