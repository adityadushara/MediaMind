"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Film,
  Tv,
  Video,
  GraduationCap,
  Sparkles,
  Camera,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Search,
  MessageSquare,
  ExternalLink,
  Layers,
  Zap,
  HelpCircle,
  LogIn,
  UserPlus,
} from "lucide-react";

interface LandingPageProps {
  onSignIn: () => void;
  onSignUp: () => void;
}

export function LandingPage({ onSignIn, onSignUp }: LandingPageProps) {
  const [activeTab, setActiveTab] = useState<"book" | "youtube" | "movie">("book");

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-stone-900 flex flex-col font-sans selection:bg-amber-100 selection:text-amber-900">
      {/* 1. Header / Navbar */}
      <header className="sticky top-0 z-40 bg-[#FBF9F5]/90 backdrop-blur-md border-b border-stone-200/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-stone-950 flex items-center gap-1.5">
                MediaMind
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                  AI Library
                </span>
              </span>
              <p className="text-[11px] font-medium text-stone-500 hidden sm:block">
                Personal Study & Media Vault
              </p>
            </div>
          </div>

          {/* Navigation Anchors */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-stone-600">
            <a href="#how-it-works" className="hover:text-stone-950 transition-colors">
              How It Works
            </a>
            <a href="#features" className="hover:text-stone-950 transition-colors">
              Features
            </a>
            <a href="#media-types" className="hover:text-stone-950 transition-colors">
              Supported Media
            </a>
            <a href="#faq" className="hover:text-stone-950 transition-colors">
              FAQ
            </a>
          </nav>

          {/* Auth Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={onSignIn}
              className="px-4 py-2 text-sm font-bold text-stone-700 hover:text-stone-950 hover:bg-stone-100 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <LogIn className="h-4 w-4" />
              <span>Sign In</span>
            </button>
            <button
              onClick={onSignUp}
              className="px-4 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-[0.98] rounded-xl shadow-md shadow-amber-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Get Started Free</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-100/80 border border-amber-300/80 text-amber-900 text-xs font-bold tracking-wide animate-in fade-in duration-500">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" />
              <span>Turn your screenshots into organized knowledge</span>
            </div>

            {/* Main Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-stone-950 tracking-tight leading-[1.12]">
              Never forget a book, movie, or video you saved.
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-stone-600 leading-relaxed font-normal max-w-2xl mx-auto">
              Drop screenshots of books you saw on Instagram, YouTube videos you saved for later, or movies recommended by friends. MediaMind turns them into verified, organized library records with direct links.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
              <button
                onClick={onSignUp}
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-base shadow-lg shadow-amber-600/25 flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 cursor-pointer"
              >
                <span>Create Your Free Account</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={onSignIn}
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-white hover:bg-stone-50 border border-stone-300/80 text-stone-800 font-bold text-base shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <LogIn className="h-4 w-4 text-stone-500" />
                <span>Sign In to MediaMind</span>
              </button>
            </div>

            {/* Trust Badges */}
            <div className="flex items-center justify-center gap-6 pt-4 text-xs font-semibold text-stone-500 flex-wrap">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Original screenshots preserved
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Zero duplicate clutter
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Private Supabase authentication
              </span>
            </div>
          </div>

          {/* Interactive Live Workflow Preview Card */}
          <div className="mt-14 max-w-4xl mx-auto bg-white rounded-3xl border border-stone-200 shadow-xl overflow-hidden">
            {/* Visual Header Tabs */}
            <div className="bg-stone-50 border-b border-stone-200 px-6 py-3 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                  See how it transforms:
                </span>
                <div className="flex items-center bg-white border border-stone-200 rounded-lg p-0.5">
                  <button
                    onClick={() => setActiveTab("book")}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activeTab === "book" ? "bg-amber-500 text-white shadow-xs" : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    Book Screenshot
                  </button>
                  <button
                    onClick={() => setActiveTab("youtube")}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activeTab === "youtube" ? "bg-amber-500 text-white shadow-xs" : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    YouTube Video
                  </button>
                  <button
                    onClick={() => setActiveTab("movie")}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activeTab === "movie" ? "bg-amber-500 text-white shadow-xs" : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    Movie Recommendation
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                <Zap className="h-3.5 w-3.5" />
                <span>AI Identified in 1.4s</span>
              </div>
            </div>

            {/* Simulated Conversion Showcase */}
            <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-gradient-to-b from-white to-stone-50/50">
              {/* Left Side: Uploaded Screenshot Evidence */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-stone-500">
                  <span className="flex items-center gap-1.5">
                    <Camera className="h-4 w-4 text-amber-600" />
                    Uploaded Screenshot Evidence
                  </span>
                  <span className="font-mono text-[11px] bg-stone-100 px-2 py-0.5 rounded text-stone-600">
                    {activeTab === "book" ? "photo_book_shelf.jpg" : activeTab === "youtube" ? "youtube_feed.png" : "chat_recommendation.jpg"}
                  </span>
                </div>

                <div className="h-56 rounded-2xl bg-stone-900/5 border border-stone-200/90 relative overflow-hidden flex items-center justify-center p-4">
                  <div className="w-full h-full rounded-xl bg-stone-800 text-stone-100 flex flex-col justify-between p-4 shadow-inner relative overflow-hidden">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-amber-400 font-bold">
                        Source Visual Capture
                      </span>
                      <h4 className="text-lg font-bold text-white">
                        {activeTab === "book"
                          ? "Rich Dad Poor Dad — Robert Kiyosaki"
                          : activeTab === "youtube"
                          ? "GUESS THE RANK — Pro Gameplay Breakdown"
                          : "Interstellar — Christopher Nolan (Sci-Fi)"}
                      </h4>
                    </div>

                    <div className="absolute right-4 bottom-4 border-2 border-dashed border-amber-400 bg-amber-400/10 rounded-lg p-2 text-center">
                      <span className="text-[10px] font-mono font-bold text-amber-300 block">
                        CV Crop Detected
                      </span>
                      <span className="text-[9px] text-amber-200">
                        Confidence 98%
                      </span>
                    </div>

                    <p className="text-xs text-stone-300 line-clamp-2">
                      Original pixels preserved securely in private encrypted storage.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Side: Clean Structured Library Item */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-stone-500">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Verified Library Card & Direct Link
                  </span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Ready to Consume
                  </span>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-sm space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-22 rounded-xl bg-amber-100 border border-amber-200 text-amber-800 flex items-center justify-center shrink-0 shadow-2xs font-black text-xl">
                      {activeTab === "book" ? "📖" : activeTab === "youtube" ? "▶️" : "🎬"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-stone-100 text-stone-700">
                          {activeTab === "book" ? "Book" : activeTab === "youtube" ? "YouTube Video" : "Movie"}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          98% match
                        </span>
                      </div>
                      <h4 className="font-extrabold text-base text-stone-900 mt-1 line-clamp-1">
                        {activeTab === "book"
                          ? "Rich Dad Poor Dad"
                          : activeTab === "youtube"
                          ? "GUESS THE RANK"
                          : "Interstellar"}
                      </h4>
                      <p className="text-xs text-stone-600 font-medium">
                        by{" "}
                        <span className="text-stone-900 font-bold">
                          {activeTab === "book"
                            ? "Robert T. Kiyosaki"
                            : activeTab === "youtube"
                            ? "Popular Creator"
                            : "Christopher Nolan"}
                        </span>
                      </p>
                    </div>
                  </div>

                  <a
                    href="#how-it-works"
                    onClick={(e) => {
                      e.preventDefault();
                      onSignUp();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-all shadow-xs"
                  >
                    <span>Open Direct Canonical Link</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. How It Works (Simple 3-Step Process) */}
      <section id="how-it-works" className="py-20 bg-white border-y border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-16">
            <span className="text-xs font-extrabold uppercase tracking-widest text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              Simple 3-Step Workflow
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-stone-950 tracking-tight">
              From messy screenshots to a structured library in seconds.
            </h2>
            <p className="text-stone-600 text-base">
              No manual typing required. MediaMind takes care of extraction, verification, direct link generation, and categorization.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="p-7 rounded-3xl bg-[#FBF9F5] border border-stone-200 space-y-4 hover:border-amber-400 transition-all hover:shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black text-lg shadow-md shadow-amber-500/20">
                1
              </div>
              <h3 className="font-extrabold text-xl text-stone-900">
                Upload or Paste Screenshots
              </h3>
              <p className="text-sm text-stone-600 leading-relaxed">
                Drop one or dozens of screenshots at once. Smartphone photos, desktop snips, or tablet crops. Your original screenshot is safely preserved and never overwritten.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-7 rounded-3xl bg-[#FBF9F5] border border-stone-200 space-y-4 hover:border-amber-400 transition-all hover:shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black text-lg shadow-md shadow-amber-500/20">
                2
              </div>
              <h3 className="font-extrabold text-xl text-stone-900">
                AI Vision & Metadata Match
              </h3>
              <p className="text-sm text-stone-600 leading-relaxed">
                Multimodal AI analyzes visual text, logos, cover art, and contours. It matches authoritative providers (Google Books, TMDB, YouTube) to retrieve accurate titles, creators, and years.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-7 rounded-3xl bg-[#FBF9F5] border border-stone-200 space-y-4 hover:border-amber-400 transition-all hover:shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black text-lg shadow-md shadow-amber-500/20">
                3
              </div>
              <h3 className="font-extrabold text-xl text-stone-900">
                Direct Links & RAG Chat
              </h3>
              <p className="text-sm text-stone-600 leading-relaxed">
                Access direct canonical links to read, watch, or enroll. Mark items as Want to Consume or Completed, and use the built-in RAG AI to chat with your library anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Supported Media Types */}
      <section id="media-types" className="py-20 bg-[#FBF9F5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-14">
            <span className="text-xs font-extrabold uppercase tracking-widest text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              Universal Coverage
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-stone-950 tracking-tight">
              One home for all your recommendations.
            </h2>
            <p className="text-stone-600 text-base">
              Stop splitting your saved items across browser bookmarks, Notes app lists, and photo galleries.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { icon: BookOpen, label: "Books", desc: "ISBN, authors, summaries", color: "text-amber-700 bg-amber-100" },
              { icon: Film, label: "Movies", desc: "IMDb, release years, cast", color: "text-rose-700 bg-rose-100" },
              { icon: Tv, label: "TV Shows", desc: "Seasons, episodes, network", color: "text-purple-700 bg-purple-100" },
              { icon: Video, label: "YouTube & Video", desc: "Channel, direct video links", color: "text-red-700 bg-red-100" },
              { icon: GraduationCap, label: "Courses", desc: "Platforms, instructors, skills", color: "text-emerald-700 bg-emerald-100" },
              { icon: Layers, label: "Podcasts & Docs", desc: "Episodes, topics, hosts", color: "text-blue-700 bg-blue-100" },
            ].map((media, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-stone-200 p-5 text-center space-y-2 hover:border-amber-400 hover:shadow-xs transition-all flex flex-col items-center justify-center"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${media.color}`}>
                  <media.icon className="h-6 w-6" />
                </div>
                <h4 className="font-extrabold text-sm text-stone-900">{media.label}</h4>
                <p className="text-[11px] text-stone-500 leading-snug">{media.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Key Disciplines & Security */}
      <section id="features" className="py-20 bg-white border-t border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <span className="text-xs font-extrabold uppercase tracking-widest text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
                Enterprise Discipline
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-stone-950 tracking-tight leading-tight">
                Built for reliability, privacy, and absolute traceability.
              </h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900 text-base">Private & Isolated Storage</h4>
                    <p className="text-stone-600 text-sm mt-0.5 leading-relaxed">
                      Every screenshot is stored in your private vault with row-level security. No other user can ever view your uploaded screenshots or private library records.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900 text-base">Non-Destructive Visual Crops</h4>
                    <p className="text-stone-600 text-sm mt-0.5 leading-relaxed">
                      Derivative thumbnail crops are saved separately. You can always inspect the original pixel-for-pixel evidence behind every single library entry.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-900 text-base">Ask Library (RAG Q&A)</h4>
                    <p className="text-stone-600 text-sm mt-0.5 leading-relaxed">
                      Search and query your collection conversationally. Ask &quot;What psychology books have I added recently?&quot; and receive answers strictly grounded in your library.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature Illustration */}
            <div className="p-8 rounded-3xl bg-[#FBF9F5] border border-stone-200/90 shadow-sm space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-mono font-bold text-amber-700 uppercase tracking-wider">
                  AI Question & Answer Demonstration
                </span>
                <div className="p-4 rounded-xl bg-white border border-stone-200 text-xs font-medium text-stone-800 shadow-2xs">
                  💬 &quot;Recommend me a course or book from my library on finance or investing.&quot;
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200/90 text-xs font-normal text-amber-950 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <span>MediaMind AI Answer:</span>
                </div>
                <p className="leading-relaxed">
                  Based on your library, you have <strong className="font-bold">Rich Dad Poor Dad</strong> by Robert T. Kiyosaki saved under Money & Finance. You also saved Chetan Bhagat&apos;s <strong className="font-bold">11 Rules for Life</strong> in your Want to Consume queue.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between text-xs text-stone-500 border-t border-stone-200">
                <span>Grounded strictly in your records</span>
                <span className="font-bold text-emerald-700">Zero Hallucinations</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FAQ Section */}
      <section id="faq" className="py-20 bg-[#FBF9F5] border-t border-stone-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center space-y-3">
            <span className="text-xs font-extrabold uppercase tracking-widest text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              Frequently Asked Questions
            </span>
            <h2 className="text-3xl font-black text-stone-950 tracking-tight">
              Everything you need to know.
            </h2>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "Can I use MediaMind without creating an account or logging in?",
                a: "No. To keep your personal library, private screenshots, and notes secure and confidential, all ingestion, storage, and library features require logging in with Supabase Authentication.",
              },
              {
                q: "What screenshot formats are supported?",
                a: "MediaMind accepts PNG, JPEG, WebP, and AVIF screenshot formats. You can upload single files or batch drop multiple screenshots at once.",
              },
              {
                q: "What happens if the AI is uncertain about a screenshot?",
                a: "Instead of guessing wrong, MediaMind places uncertain items into the Human Review Queue where you can approve, reject, or adjust metadata with one click.",
              },
              {
                q: "Can I inspect the original screenshot later?",
                a: "Yes! Every single item retains a permanent link to its original visual evidence. Click 'Inspect Screenshot' on any card to view the exact original pixels at 100% zoom.",
              },
            ].map((faq, idx) => (
              <div key={idx} className="p-6 rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-2">
                <h4 className="font-bold text-base text-stone-900 flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>{faq.q}</span>
                </h4>
                <p className="text-stone-600 text-sm leading-relaxed pl-6">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Bottom CTA Banner */}
      <section className="py-20 bg-stone-900 text-white relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6 relative z-10">
          <span className="text-xs font-extrabold uppercase tracking-widest text-amber-400 bg-stone-800 px-3 py-1 rounded-full border border-stone-700">
            Start Today
          </span>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            Ready to turn chaotic screenshots into organized knowledge?
          </h2>
          <p className="text-stone-400 text-base sm:text-lg max-w-2xl mx-auto">
            Create your account in 30 seconds and start saving books, movies, YouTube videos, and courses with visual proof.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button
              onClick={onSignUp}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-base shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 cursor-pointer"
            >
              <span>Get Started Free</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={onSignIn}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-white font-bold text-base transition-all cursor-pointer"
            >
              <span>Sign In to Existing Account</span>
            </button>
          </div>
        </div>
      </section>

      {/* 8. Footer */}
      <footer className="py-8 bg-[#FBF9F5] border-t border-stone-200 text-stone-500 text-xs text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-amber-500 text-white flex items-center justify-center font-black text-xs">
              M
            </div>
            <span className="font-bold text-stone-800">MediaMind</span>
            <span>— AI-Powered Personal Study & Media Vault</span>
          </div>
          <div>
            <span>Strict privacy, Row Level Security & non-destructive evidence preservation.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
