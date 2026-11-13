import React from "react";
import Link from "next/link";
import { Loader2, AlertCircle } from "lucide-react";
import { ProcessingJob } from "@/types";

interface ProcessingStatusBannerProps {
  jobs: ProcessingJob[];
  pendingReviewCount: number;
}

export function ProcessingStatusBanner({ jobs, pendingReviewCount }: ProcessingStatusBannerProps) {
  const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "processing");
  const failedJobs = jobs.filter((j) => j.status === "failed");

  if (activeJobs.length === 0 && pendingReviewCount === 0 && failedJobs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Active Processing Alert */}
      {activeJobs.length > 0 && (
        <div className="flex items-center justify-between p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/20 text-neutral-200">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-indigo-400 animate-spin" />
            <div>
              <p className="text-sm font-semibold text-white">
                Processing {activeJobs.length} screenshot{activeJobs.length > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-neutral-400">
                AI extraction and metadata matching in progress...
              </p>
            </div>
          </div>
          <Link
            href="/upload"
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 underline underline-offset-4"
          >
            View queue
          </Link>
        </div>
      )}

      {/* Needs Review Alert */}
      {pendingReviewCount > 0 && (
        <div className="flex items-center justify-between p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 text-neutral-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-white">
                {pendingReviewCount} match{pendingReviewCount > 1 ? "es" : ""} require your review
              </p>
              <p className="text-xs text-neutral-400">
                Verify AI suggestions against original screenshots to add to your library.
              </p>
            </div>
          </div>
          <Link
            href="/review"
            className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-medium transition-colors"
          >
            Review Now
          </Link>
        </div>
      )}
    </div>
  );
}
