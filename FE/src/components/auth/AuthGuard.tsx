"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Lock, LogIn, UserPlus, ArrowLeft, Loader2, Sparkles } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
  featureName?: string;
  description?: string;
}

export function AuthGuard({
  children,
  featureName = "this feature",
  description = "Sign in or create a free MediaMind account to access your personal vault, upload screenshots, review candidate matches, and chat with your library.",
}: AuthGuardProps) {
  const { user, isLoading, openAuthModal } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FBF9F5] flex flex-col items-center justify-center p-6 space-y-4">
        <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
        <p className="text-sm font-semibold text-stone-600">
          Checking your authentication status...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FBF9F5] text-stone-900 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-8 shadow-xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
          {/* Lock Icon */}
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-md shadow-amber-500/10">
            <Lock className="h-8 w-8" />
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold uppercase tracking-wider">
              <Sparkles className="h-3 w-3" />
              <span>Authentication Required</span>
            </div>
            <h2 className="text-2xl font-black text-stone-950 tracking-tight">
              Sign in to use {featureName}
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
              {description}
            </p>
          </div>

          {/* Action CTAs */}
          <div className="space-y-3 pt-2">
            <button
              onClick={() => openAuthModal("signin")}
              className="w-full py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white font-bold text-sm shadow-md shadow-amber-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="h-4 w-4" />
              <span>Sign In to Your Account</span>
            </button>

            <button
              onClick={() => openAuthModal("signup")}
              className="w-full py-3 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 active:scale-[0.98] text-stone-800 font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Create a Free Account</span>
            </button>
          </div>

          {/* Back to Home Link */}
          <div className="pt-2 border-t border-stone-100">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to MediaMind Overview</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
