"use client";

import React from "react";
import Link from "next/link";
import { BookMarked, Home, Library, Compass, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FBF9F5] text-stone-900 flex flex-col justify-center items-center p-6 selection:bg-amber-100 selection:text-amber-900">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Brand & 404 Visual Indicator */}
        <div className="flex flex-col items-center">
          <div className="relative mb-4">
            <div className="h-20 w-20 rounded-3xl bg-amber-600/10 border border-amber-500/20 flex items-center justify-center text-amber-700 shadow-sm">
              <BookMarked className="h-10 w-10" />
            </div>
            <span className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full bg-amber-600 text-white font-extrabold text-xs shadow-sm">
              404
            </span>
          </div>

          <span className="text-xs font-bold uppercase tracking-widest text-amber-700">
            Lost in the Library
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-stone-900 mt-1">
            Page Not Found
          </h1>
          <p className="text-sm text-stone-600 mt-2 leading-relaxed">
            The page or media catalog you are looking for doesn&apos;t exist, has been archived, or is currently unavailable.
          </p>
        </div>

        {/* Quick Navigation Cards */}
        <div className="bg-white rounded-2xl border border-stone-200/90 shadow-sm p-4 space-y-2 text-left">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 px-2 pb-1">
            Suggested Destinations
          </p>

          <Link
            href="/"
            className="flex items-center justify-between p-2.5 rounded-xl hover:bg-stone-50 transition-colors group border border-transparent hover:border-stone-200"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-800 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <Home className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-stone-900">Dashboard</p>
                <p className="text-[11px] text-stone-500">Recent activities and study metrics</p>
              </div>
            </div>
            <span className="text-stone-400 group-hover:text-stone-700 text-xs font-bold">→</span>
          </Link>

          <Link
            href="/library"
            className="flex items-center justify-between p-2.5 rounded-xl hover:bg-stone-50 transition-colors group border border-transparent hover:border-stone-200"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <Library className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-stone-900">Media Library</p>
                <p className="text-[11px] text-stone-500">Your books, movies, videos & courses</p>
              </div>
            </div>
            <span className="text-stone-400 group-hover:text-stone-700 text-xs font-bold">→</span>
          </Link>

          <Link
            href="/review"
            className="flex items-center justify-between p-2.5 rounded-xl hover:bg-stone-50 transition-colors group border border-transparent hover:border-stone-200"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <Compass className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-stone-900">Review Queue</p>
                <p className="text-[11px] text-stone-500">Verify extracted screenshot candidates</p>
              </div>
            </div>
            <span className="text-stone-400 group-hover:text-stone-700 text-xs font-bold">→</span>
          </Link>
        </div>

        {/* Return Button */}
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm shadow-amber-600/20 active:scale-95 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
