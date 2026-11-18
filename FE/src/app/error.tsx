"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-stone-900 flex flex-col justify-center items-center p-6 selection:bg-amber-100 selection:text-amber-900">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Error Visual */}
        <div className="flex flex-col items-center">
          <div className="h-20 w-20 rounded-3xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-sm mb-4">
            <AlertTriangle className="h-10 w-10" />
          </div>

          <span className="text-xs font-bold uppercase tracking-widest text-rose-600">
            System Error
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight text-stone-900 mt-1">
            Something Went Wrong
          </h1>
          <p className="text-sm text-stone-600 mt-2 leading-relaxed">
            An unexpected error interrupted this view. You can reload the component or return to the dashboard.
          </p>
        </div>

        {/* Error Detail (if available) */}
        {error?.message && (
          <div className="p-3 bg-white rounded-xl border border-stone-200 text-left text-xs font-mono text-stone-600 truncate max-w-full">
            <span className="font-semibold text-rose-700">Error:</span> {error.message}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm shadow-amber-600/20 active:scale-95 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Try Again</span>
          </button>

          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-stone-50 text-stone-800 border border-stone-200 text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
          >
            <Home className="h-4 w-4" />
            <span>Go to Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
