"use client";

import React, { useState } from "react";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  ExternalLink,
  BookOpen,
  Film,
  Tv,
  Video,
  Podcast as PodcastIcon,
  GraduationCap,
  Newspaper,
  Mail,
  Folder,
} from "lucide-react";
import { askLibrary } from "@/lib/api";
import { RAGQueryResponse, LibraryItem } from "@/types";

interface AskLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AskLibraryModal({ isOpen, onClose }: AskLibraryModalProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<RAGQueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAsk = async (textToAsk?: string) => {
    const q = (textToAsk || query).trim();
    if (!q) return;

    if (textToAsk) setQuery(textToAsk);
    setIsLoading(true);
    setError(null);

    try {
      const res = await askLibrary({ query: q, top_k: 5 });
      setResponse(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to query library";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const suggestions = [
    "What books on habits or psychology did I save?",
    "Show me podcasts about health or sleep",
    "Did I save any Substack articles or newsletters?",
    "Which YouTube tutorials should I watch?",
  ];

  const getTypeIcon = (type?: string | null) => {
    switch (type) {
      case "book":
        return <BookOpen className="h-4 w-4 text-amber-800" />;
      case "movie":
        return <Film className="h-4 w-4 text-purple-700" />;
      case "tv_show":
        return <Tv className="h-4 w-4 text-blue-700" />;
      case "youtube_video":
        return <Video className="h-4 w-4 text-red-700" />;
      case "podcast":
        return <PodcastIcon className="h-4 w-4 text-orange-800" />;
      case "course":
        return <GraduationCap className="h-4 w-4 text-emerald-800" />;
      case "article":
        return <Newspaper className="h-4 w-4 text-orange-700" />;
      case "newsletter":
        return <Mail className="h-4 w-4 text-sky-700" />;
      default:
        return <Folder className="h-4 w-4 text-stone-700" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white border border-stone-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-6 border-b border-stone-200 flex items-center justify-between bg-stone-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-800">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-stone-900 text-lg">Ask Your Library</h3>
              <p className="text-xs text-stone-500">
                Natural language semantic search across all your saved screenshots & notes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Query Input */}
        <div className="p-6 border-b border-stone-100 bg-white space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="relative flex items-center"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. 'What was that podcast on habit building I saved?'"
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl pl-4 pr-12 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-600 focus:bg-white shadow-inner font-medium"
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="absolute right-2 p-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40 disabled:hover:bg-amber-600 transition-all cursor-pointer shadow-xs"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>

          {/* Quick Suggestions */}
          {!response && !isLoading && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Try asking:</span>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAsk(s)}
                    className="text-xs px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors cursor-pointer text-left font-medium"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#FDFBF7]">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-stone-500">
              <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
              <p className="text-sm font-semibold">Searching your library and generating grounded answer...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
              {error}
            </div>
          )}

          {response && !isLoading && (
            <div className="space-y-6">
              {/* Answer Banner */}
              <div className="p-5 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Answer
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-stone-100 text-stone-600">
                    ⚡ {response.duration_ms}ms · {response.model_name}
                  </span>
                </div>
                <div className="text-sm text-stone-800 leading-relaxed whitespace-pre-line font-medium">
                  {response.answer}
                </div>
              </div>

              {/* Matched Media Cards */}
              {response.matched_items && response.matched_items.length > 0 && (
                <div className="space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Matched Library Items ({response.matched_items.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {response.matched_items.map((item: LibraryItem) => (
                      <div
                        key={item.id}
                        className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs space-y-3 flex flex-col justify-between"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-[10px] font-bold text-stone-700 uppercase">
                              {getTypeIcon(item.content_type)}
                              <span>{item.content_type.replace("_", " ")}</span>
                            </span>
                            {item.subcategory && (
                              <span className="text-[10px] font-semibold text-stone-500">
                                {item.subcategory}
                              </span>
                            )}
                          </div>
                          <h4 className="font-bold text-stone-900 text-sm line-clamp-1">{item.title}</h4>
                          {item.creator && (
                            <p className="text-xs text-stone-600 line-clamp-1">by {item.creator}</p>
                          )}
                        </div>

                        {item.direct_url && (
                          <a
                            href={item.direct_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-colors cursor-pointer"
                          >
                            <span>Open Direct Link</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
