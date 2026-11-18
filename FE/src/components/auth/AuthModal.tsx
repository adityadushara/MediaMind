"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  BookMarked,
} from "lucide-react";

export function AuthModal() {
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalMode,
    openAuthModal,
    signIn,
    signUp,
    isConfigured,
  } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">(authModalMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync mode with context on change during render
  const [prevAuthModalMode, setPrevAuthModalMode] = useState(authModalMode);
  if (authModalMode !== prevAuthModalMode) {
    setPrevAuthModalMode(authModalMode);
    setMode(authModalMode);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  // Handle Escape key
  useEffect(() => {
    if (!isAuthModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAuthModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAuthModalOpen, closeAuthModal]);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (mode === "signup" && !displayName.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!email.trim()) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message?.toLowerCase().includes("email not confirmed")) {
            setErrorMessage(
              "Email confirmation is still enabled in your Supabase project. In Supabase Dashboard > Authentication > Providers > Email, turn OFF 'Confirm email', or confirm this user in Authentication > Users."
            );
          } else {
            setErrorMessage(error.message || "Failed to sign in. Please verify your credentials.");
          }
        } else {
          // Success is handled by AuthContext closing modal
          setEmail("");
          setPassword("");
        }
      } else {
        const { error, data } = await signUp(email, password, displayName);
        if (error) {
          if (error.message?.toLowerCase().includes("email not confirmed")) {
            setErrorMessage(
              "Email confirmation is required by your Supabase project settings. In Supabase Dashboard > Authentication > Providers > Email, turn OFF 'Confirm email' to allow direct login."
            );
          } else {
            setErrorMessage(error.message || "Sign up failed. Please try again.");
          }
        } else if (data?.session) {
          setSuccessMessage("Account created successfully! Welcome to MediaMind.");
          setEmail("");
          setPassword("");
          setDisplayName("");
          closeAuthModal();
        } else {
          // Attempt immediate sign-in if not already signed in
          const { error: signInErr } = await signIn(email, password);
          if (signInErr) {
            if (signInErr.message?.toLowerCase().includes("email not confirmed")) {
              setErrorMessage(
                "Account created, but email confirmation is enabled in Supabase. In Supabase Dashboard > Authentication > Providers > Email, turn OFF 'Confirm email' so users can log in directly without confirmation."
              );
            } else {
              setErrorMessage(signInErr.message || "Account created, but automatic sign-in failed. Please sign in.");
            }
          } else {
            setSuccessMessage("Account created successfully! Welcome to MediaMind.");
            setEmail("");
            setPassword("");
            setDisplayName("");
            closeAuthModal();
          }
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={closeAuthModal}
    >
      <div
        className="relative max-w-md w-full bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header decoration */}
        <div className="bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent px-6 pt-6 pb-4 border-b border-stone-100 relative">
          <button
            type="button"
            onClick={closeAuthModal}
            className="absolute top-5 right-5 p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
            title="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-2xl bg-amber-600 flex items-center justify-center shadow-md shadow-amber-600/20 text-white">
              <BookMarked className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900">
                {mode === "signin" ? "Welcome Back" : "Create Account"}
              </h2>
              <p className="text-xs text-stone-500 font-medium">
                {mode === "signin"
                  ? "Sign in to access your verified media library"
                  : "Organize books, movies, videos & courses with AI"}
              </p>
            </div>
          </div>

          {/* Mode Switch Tabs */}
          <div className="mt-4 flex rounded-xl bg-stone-100 p-1 border border-stone-200/80">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                openAuthModal("signin");
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                mode === "signin"
                  ? "bg-white text-stone-900 shadow-2xs font-semibold"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                openAuthModal("signup");
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                mode === "signup"
                  ? "bg-white text-stone-900 shadow-2xs font-semibold"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              Sign Up
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {/* Supabase Status Notice if not configured */}
          {!isConfigured && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
              <Sparkles className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Local Development Mode</p>
                <p className="text-[11px] text-amber-800/90 mt-0.5">
                  Supabase credentials are using local defaults. Set{" "}
                  <code className="px-1 py-0.5 bg-amber-100 rounded text-amber-900 font-mono text-[10px]">
                    NEXT_PUBLIC_SUPABASE_URL
                  </code>{" "}
                  for cloud auth.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-xs text-rose-800 animate-in fade-in">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="leading-snug">{errorMessage}</p>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2 text-xs text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="leading-snug">{successMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Display Name (Only in Sign Up - Mandatory) */}
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Full Name <span className="text-amber-600 font-bold">*</span>
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Jane Doe"
                    required
                    disabled={isSubmitting}
                    className="w-full h-10 pl-10 pr-3.5 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-800 placeholder-stone-400 focus:outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-60"
                  />
                </div>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  disabled={isSubmitting}
                  className="w-full h-10 pl-10 pr-3.5 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-800 placeholder-stone-400 focus:outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-60"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-stone-700">
                  Password
                </label>
                {mode === "signup" && (
                  <span className="text-[10px] text-stone-400">Min 6 characters</span>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isSubmitting}
                  className="w-full h-10 pl-10 pr-10 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-800 placeholder-stone-400 focus:outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 transition-colors"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 mt-2 flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-all shadow-sm shadow-amber-600/20 active:scale-98 disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{mode === "signin" ? "Signing In..." : "Creating Account..."}</span>
                </>
              ) : (
                <span>{mode === "signin" ? "Sign In" : "Create Account"}</span>
              )}
            </button>
          </form>

          {/* Bottom Switcher */}
          <div className="pt-2 text-center text-xs text-stone-500">
            {mode === "signin" ? (
              <p>
                Don&apos;t have an account yet?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    openAuthModal("signup");
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="text-amber-700 font-bold hover:underline"
                >
                  Sign Up
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    openAuthModal("signin");
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="text-amber-700 font-bold hover:underline"
                >
                  Sign In
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
