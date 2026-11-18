import React from "react";
import Link from "next/link";
import { Loader2, AlertCircle, ArrowRight } from "lucide-react";
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
            href="/upload"
            className="text-xs font-bold text-amber-900 hover:text-amber-950 underline underline-offset-4"
          >
            View status
          </Link>
        </div>
      )}

      {/* Needs Review Alert */}
      {pendingReviewCount > 0 && (
        <div className="flex items-center justify-between p-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 text-indigo-950 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-indigo-700" />
            <div>
              <p className="text-sm font-bold text-indigo-950">
                {pendingReviewCount} item{pendingReviewCount > 1 ? "s" : ""} identified from your screenshots
              </p>
              <p className="text-xs text-indigo-800">
                Check and confirm the detected title, topic, and links to place on your shelves.
              </p>
            </div>
          </div>
          <Link
            href="/review"
            className="px-4 py-2 rounded-xl bg-indigo-700 text-white hover:bg-indigo-800 text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
          >
            <span>Review Items</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
