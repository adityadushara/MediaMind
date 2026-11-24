import React from "react";
import Link from "next/link";
import {
  BookOpen,
  Film,
  Tv,
  Video,
  Podcast,
  GraduationCap,
  Newspaper,
  Mail,
  Star,
  ArrowRight,
  PlusCircle,
  ExternalLink,
} from "lucide-react";
import { LibraryItem, ContentType } from "@/types";

interface RecentActivityProps {
  items: LibraryItem[];
  onOpenUpload: () => void;
  /** Active header search term, if any. Changes the empty state copy. */
  searchTerm?: string;
}

export function RecentActivity({ items, onOpenUpload, searchTerm }: RecentActivityProps) {
  const getContentTypeBadge = (type: ContentType) => {
    switch (type) {
      case "book":
        return {
          icon: <BookOpen className="h-3.5 w-3.5 text-amber-800" />,
          label: "Book",
          bg: "bg-amber-100 text-amber-900 border-amber-200",
        };
      case "youtube_video":
        return {
          icon: <Video className="h-3.5 w-3.5 text-red-700" />,
          label: "YouTube",
          bg: "bg-red-100 text-red-800 border-red-200",
        };
      case "movie":
        return {
          icon: <Film className="h-3.5 w-3.5 text-purple-700" />,
          label: "Movie",
          bg: "bg-purple-100 text-purple-800 border-purple-200",
        };
      case "tv_show":
        return {
          icon: <Tv className="h-3.5 w-3.5 text-blue-700" />,
          label: "TV Show",
          bg: "bg-blue-100 text-blue-800 border-blue-200",
        };
      case "course":
        return {
          icon: <GraduationCap className="h-3.5 w-3.5 text-emerald-800" />,
          label: "Course",
          bg: "bg-emerald-100 text-emerald-900 border-emerald-200",
        };
      case "podcast":
        return {
          icon: <Podcast className="h-3.5 w-3.5 text-orange-800" />,
          label: "Podcast",
          bg: "bg-orange-100 text-orange-900 border-orange-200",
        };
      case "article":
        return {
          icon: <Newspaper className="h-3.5 w-3.5 text-orange-700" />,
          label: "Substack / Article",
          bg: "bg-orange-100 text-orange-900 border-orange-200",
        };
      case "newsletter":
        return {
          icon: <Mail className="h-3.5 w-3.5 text-sky-700" />,
          label: "Newsletter",
          bg: "bg-sky-100 text-sky-900 border-sky-200",
        };
      default:
        return {
          icon: <BookOpen className="h-3.5 w-3.5 text-stone-700" />,
          label: "Media",
          bg: "bg-stone-100 text-stone-800 border-stone-200",
        };
    }
  };

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-stone-100">
        <div>
          <h3 className="text-lg font-bold text-stone-900">Recently Added to Library</h3>
          <p className="text-xs font-medium text-stone-500">
            Books, YouTube videos, and movies ready with direct links.
          </p>
        </div>
        <Link
          href="/library"
          className="flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-800 transition-colors"
        >
          <span>View All in Library</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="py-12 border-2 border-dashed border-stone-200 rounded-2xl flex flex-col items-center justify-center text-center space-y-3 bg-[#FAF8F5]">
          <div className="p-3 rounded-full bg-amber-100 text-amber-700">
            <BookOpen className="h-6 w-6" />
          </div>
          {searchTerm ? (
            <div>
              <p className="text-sm font-bold text-stone-900">No matches on this page</p>
              <p className="text-xs font-medium text-stone-500 max-w-sm mt-0.5">
                Nothing recent matches &ldquo;{searchTerm}&rdquo;. Search the full library from
                there, or clear the search field.
              </p>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm font-bold text-stone-900">Your library is currently empty</p>
                <p className="text-xs font-medium text-stone-500 max-w-sm mt-0.5">
                  Upload a screenshot of any book cover, YouTube video, or movie poster to get started.
                </p>
              </div>
              <button
                onClick={onOpenUpload}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Add First Screenshot</span>
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="divide-y divide-stone-100">
          {items.map((item) => {
            const badge = getContentTypeBadge(item.content_type);
            return (
              <div
                key={item.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/80 rounded-xl px-2.5 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className={`p-2.5 rounded-xl border shrink-0 ${badge.bg}`}>
                    {badge.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href="/library"
                        className="font-bold text-sm text-stone-900 hover:text-amber-700 transition-colors truncate"
                      >
                        {item.title}
                      </Link>
                      {item.subcategory && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
                          {item.subcategory}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-stone-500 truncate mt-0.5">
                      {item.creator || "Unknown creator"}
                      {item.release_year ? ` • ${item.release_year}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
                  {item.direct_url && (
                    <a
                      href={item.direct_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-colors shadow-sm"
                    >
                      <span>Open Link</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                    {item.consumption_status === "completed"
                      ? "Finished"
                      : item.consumption_status === "consuming"
                      ? "Reading/Watching"
                      : "Want to Study"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
