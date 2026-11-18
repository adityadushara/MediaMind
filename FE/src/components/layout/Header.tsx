"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, Sparkles, LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface HeaderProps {
  onOpenUpload?: () => void;
  onOpenAskAI?: () => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export function Header({ onOpenUpload, onOpenAskAI, searchQuery, onSearchChange }: HeaderProps) {
  const { user, signOut, openAuthModal } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName =
    user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const userInitials = displayName.slice(0, 2).toUpperCase();

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
            onClick={user ? onOpenAskAI : () => openAuthModal("signin")}
            className="h-10 flex items-center gap-1.5 px-3.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/80 text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
            title="Ask AI anything about your library"
          >
            <Sparkles className="h-4 w-4 text-amber-600" />
            <span>Ask AI</span>
          </button>
        )}
      </div>

      {/* Action Buttons & Auth */}
      <div className="flex items-center gap-3">
        {/* User Auth Section */}
        {user ? (
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="h-10 flex items-center gap-2 pl-2 pr-3 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-800 transition-colors cursor-pointer shadow-2xs"
              title={user.email}
            >
              <div className="h-6 w-6 rounded-lg bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                {userInitials}
              </div>
              <span className="text-xs font-semibold max-w-[100px] truncate hidden sm:inline">
                {displayName}
              </span>
            </button>

            {/* Dropdown Menu */}
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-stone-200 shadow-xl py-2 z-30 animate-in fade-in duration-100">
                <div className="px-4 py-2 border-b border-stone-100">
                  <p className="text-xs font-bold text-stone-900 truncate">{displayName}</p>
                  <p className="text-[11px] text-stone-500 truncate">{user.email}</p>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      setIsUserMenuOpen(false);
                      await signOut();
                    }}
                    className="w-full px-4 py-2 flex items-center gap-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors text-left cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => openAuthModal("signin")}
            className="h-10 flex items-center gap-2 px-3.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
          >
            <LogIn className="h-3.5 w-3.5 text-amber-600" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
}
