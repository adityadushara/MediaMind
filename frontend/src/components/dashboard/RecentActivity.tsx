import React from "react";
import Link from "next/link";
import {
  BookOpen,
  Film,
  Tv,
  Video,
  Podcast,
  GraduationCap,
  Star,
  ArrowRight,
  PlusCircle,
} from "lucide-react";
import { LibraryItem, ContentType } from "@/types";

interface RecentActivityProps {
  items: LibraryItem[];
  onOpenUpload: () => void;
}

export function RecentActivity({ items, onOpenUpload }: RecentActivityProps) {
  const getContentTypeIcon = (type: ContentType) => {
    switch (type) {
      case "book":
        return <BookOpen className="h-3.5 w-3.5 text-emerald-400" />;
      case "movie":
        return <Film className="h-3.5 w-3.5 text-rose-400" />;
      case "tv_show":
        return <Tv className="h-3.5 w-3.5 text-purple-400" />;
      case "youtube_video":
        return <Video className="h-3.5 w-3.5 text-red-400" />;
      case "podcast":
        return <Podcast className="h-3.5 w-3.5 text-amber-400" />;
      case "course":
        return <GraduationCap className="h-3.5 w-3.5 text-blue-400" />;
      default:
        return <BookOpen className="h-3.5 w-3.5 text-neutral-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "consuming":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
            Consuming
          </span>
        );
      case "completed":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Completed
          </span>
        );
      case "on_hold":
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            On Hold
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
            Want to Consume
          </span>
        );
    }
  };

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 backdrop-blur-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Recent Media Library Items</h3>
          <p className="text-xs text-neutral-400">
            Verified books, videos, and movies in your personal collection.
          </p>
        </div>
        <Link
          href="/library"
          className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
        >
          <span>View all</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="py-12 border border-dashed border-neutral-800 rounded-xl flex flex-col items-center justify-center text-center space-y-3">
          <div className="p-3 rounded-full bg-neutral-800/80 text-neutral-400">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-200">No media saved yet</p>
            <p className="text-xs text-neutral-500 max-w-sm mt-0.5">
              Upload screenshots of books, movie watchlists, or YouTube recommendations to start building your library.
            </p>
          </div>
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Upload Your First Screenshot</span>
          </button>
        </div>
      ) : (
        <div className="divide-y divide-neutral-800/60">
          {items.slice(0, 5).map((item) => (
            <div
              key={item.id}
              className="py-3.5 flex items-center justify-between hover:bg-neutral-800/30 px-3 -mx-3 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="p-2.5 rounded-lg bg-neutral-800 border border-neutral-700/60 shrink-0">
                  {getContentTypeIcon(item.content_type)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-100 truncate">{item.title}</p>
                  <p className="text-xs text-neutral-400 truncate">
                    {item.creator || "Unknown creator"}
                    {item.release_year ? ` • ${item.release_year}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {item.user_rating && (
                  <div className="flex items-center gap-1 text-xs text-amber-400 font-medium">
                    <Star className="h-3 w-3 fill-amber-400" />
                    <span>{item.user_rating}</span>
                  </div>
                )}
                {getStatusBadge(item.consumption_status)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
