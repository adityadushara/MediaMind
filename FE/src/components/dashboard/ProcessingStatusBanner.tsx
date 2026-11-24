"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, ArrowRight, AlertTriangle, RefreshCw } from "lucide-react";
import { ProcessingJob } from "@/types";
import { retryProcessingJob } from "@/lib/api";

interface ProcessingStatusBannerProps {
  jobs: ProcessingJob[];
  pendingReviewCount?: number;
}

function describeJobError(message?: string | null): string {
  if (!message) {
    return "The original screenshot is preserved. Retry the AI extraction.";
  }
  const lower = message.toLowerCase();
  if (lower.includes("no longer available")) {
    return "The AI model used for this screenshot was retired. Retry to use the current model.";
  }
  if (lower.includes("quota") || lower.includes("rate limit")) {
    return "The AI provider is rate-limited right now. Retry in a moment.";
  }
  if (message.trim().startsWith("{")) {
    return "The AI provider could not process this screenshot. Retry to run it again.";
  }
  return message.length > 220 ? `${message.slice(0, 220)}…` : message;
}

export function ProcessingStatusBanner({ jobs = [], pendingReviewCount = 0 }: ProcessingStatusBannerProps) {
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const activeJobs = safeJobs.filter((j) => j.status === "queued" || j.status === "processing");
  const failedJobs = safeJobs.filter((j) => j.status === "failed");
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (activeJobs.length === 0 && pendingReviewCount === 0 && failedJobs.length === 0) {
    return null;
  }

  const handleRetry = async () => {
    setIsRetrying(true);
    setRetryError(null);
    try {
      for (const job of failedJobs) {
        await retryProcessingJob(job.id);
      }
      // The dashboard loads its data on mount; reload so the retried jobs and
      // their progress are visible immediately.
      window.location.reload();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Could not retry processing.");
      setIsRetrying(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Active Processing Alert */}
      {activeJobs.length > 0 && (
        <div className="flex items-center justify-between p-4 rounded-2xl border border-amber-300 bg-amber-50 text-amber-950 shadow-sm">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-amber-700 animate-spin" />
            <div>
              <p className="text-sm font-bold text-amber-950">
                Reading {activeJobs.length} screenshot{activeJobs.length > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-amber-800">
                AI is identifying titles, subcategories, and web links...
              </p>
            </div>
          </div>
          <Link
            href="/library"
            className="text-xs font-bold text-amber-900 hover:text-amber-950 underline underline-offset-4"
          >
            View status
          </Link>
        </div>
      )}

      {/* Failed Processing Alert */}
      {failedJobs.length > 0 && (
        <div className="flex flex-col gap-3 p-4 rounded-2xl border border-rose-200 bg-rose-50 text-rose-950 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-rose-950">
                {failedJobs.length} screenshot{failedJobs.length > 1 ? "s" : ""} could not be processed
              </p>
              <p className="text-xs text-rose-800 line-clamp-2">
                {retryError ||
                  describeJobError(failedJobs[0]?.error_message)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
          >
            {isRetrying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {isRetrying ? "Retrying..." : "Retry processing"}
          </button>
        </div>
      )}

      {/* Newly Added to Library Alert */}
      {pendingReviewCount > 0 && (
        <div className="flex items-center justify-between p-4 rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-950 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
            <div>
              <p className="text-sm font-bold text-emerald-950">
                {pendingReviewCount} new item{pendingReviewCount > 1 ? "s" : ""} added to your Library
              </p>
              <p className="text-xs text-emerald-800">
                AI has identified and categorized your screenshots directly into your library.
              </p>
            </div>
          </div>
          <Link
            href="/library"
            className="px-4 py-2 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
          >
            <span>View Library</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
