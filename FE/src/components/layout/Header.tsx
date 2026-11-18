"use client";

import React from "react";
import { Search, Plus, Bell, Sparkles } from "lucide-react";

interface HeaderProps {
  onOpenUpload?: () => void;
  onOpenAskAI?: () => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export function Header({ onOpenUpload, onOpenAskAI, searchQuery, onSearchChange }: HeaderProps) {
  return (
    <header className="h-16 border-b border-stone-200 bg-white/90 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-20">
      {/* Search Input & Ask AI */}
      <div className="flex items-center gap-3">
        <div className="relative w-80 md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery || ""}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search books, videos, movies, topics..."
            className="w-full h-10 bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-2xs"
          />
        </div>

        {onOpenAskAI && (
          <button
            type="button"
            onClick={onOpenAskAI}
            className="h-10 flex items-center gap-1.5 px-3.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80 text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
            title="Ask AI anything about your library"
          >
            <Sparkles className="h-4 w-4 text-amber-600" />
            <span>Ask AI</span>
          </button>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          title="Notifications"
          className="h-10 w-10 rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-center text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
        >
          <Bell className="h-4 w-4" />
        </button>

        <button
          onClick={onOpenUpload}
          className="h-10 flex items-center gap-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-all shadow-sm shadow-amber-600/20 active:scale-95 cursor-pointer"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          <span>Add Screenshot</span>
        </button>
      </div>
    </header>
  );
}
