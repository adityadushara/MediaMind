import React from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { ProcessingJob } from "@/types";

interface ProcessingStatusBannerProps {
  jobs: ProcessingJob[];
  pendingReviewCount?: number;
}

export function ProcessingStatusBanner({ jobs, pendingReviewCount = 0 }: ProcessingStatusBannerProps) {
  const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "processing");
  const failedJobs = jobs.filter((j) => j.status === "failed");

  if (activeJobs.length === 0 && pendingReviewCount === 0 && failedJobs.length === 0) {
    return null;
  }

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
