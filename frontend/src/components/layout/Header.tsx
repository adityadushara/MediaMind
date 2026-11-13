"use client";

import React from "react";
import { Search, Plus, Bell } from "lucide-react";

interface HeaderProps {
  onOpenUpload?: () => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export function Header({ onOpenUpload, searchQuery, onSearchChange }: HeaderProps) {
  return (
    <header className="h-16 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-20">
      {/* Search Input */}
      <div className="relative w-96">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
        <input
          type="text"
          value={searchQuery || ""}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder="Search books, movies, videos, notes..."
          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-10 pr-4 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          title="Notifications"
          className="h-9 w-9 rounded-lg border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 transition-colors"
        >
          <Bell className="h-4 w-4" />
        </button>

        <button
          onClick={onOpenUpload}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all shadow-md shadow-indigo-600/20 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          <span>Upload Screenshot</span>
        </button>
      </div>
    </header>
  );
}
