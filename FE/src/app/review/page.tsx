"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import {
  checkBackendHealth,
  getReviewCounts,
  listReviewCandidates,
  updateReviewCandidate,
  acceptReviewCandidate,
  rejectReviewCandidate,
  resolveMediaUrl,
} from "@/lib/api";
import { CustomSelect, SelectOption } from "@/components/ui/CustomSelect";
import { ImageViewerModal } from "@/components/ui/ImageViewerModal";
import {
  HealthStatus,
  IdentificationCandidate,
  ReviewCounts,
  ContentType,
  ConsumptionStatus,
} from "@/types";
import {
  CheckCircle2,
  XCircle,
  Eye,
  Edit3,
  RefreshCw,
  Sparkles,
  BookOpen,
  Film,
  Tv,
  Video,
  Podcast as PodcastIcon,
  GraduationCap,
  Newspaper,
  Mail,
  Folder,
  Tag,
  AlertTriangle,
  Info,
  Layers,
  ArrowRight,
  X,
  ExternalLink,
  ZoomIn,
} from "lucide-react";

const TYPE_FILTER_OPTIONS: SelectOption[] = [
  { value: "", label: "All Types" },
  { value: "book", label: "📚 Books" },
  { value: "youtube_video", label: "▶️ YouTube Videos" },
  { value: "movie", label: "🎬 Movies" },
  { value: "tv_show", label: "📺 TV Shows" },
  { value: "course", label: "🎓 Courses" },
  { value: "podcast", label: "🎙️ Podcasts" },
  { value: "article", label: "📰 Substack & Articles" },
  { value: "newsletter", label: "✉️ Newsletters" },
];

const CONTENT_TYPE_SELECT_OPTIONS: SelectOption[] = [
  { value: "book", label: "📚 Book" },
  { value: "youtube_video", label: "▶️ YouTube Video" },
  { value: "movie", label: "🎬 Movie" },
  { value: "tv_show", label: "📺 TV Show" },
  { value: "course", label: "🎓 Course" },
  { value: "podcast", label: "🎙️ Podcast" },
  { value: "article", label: "📰 Substack & Article" },
  { value: "newsletter", label: "✉️ Newsletter" },
  { value: "other", label: "📁 Other" },
];

export default function ReviewPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [counts, setCounts] = useState<ReviewCounts>({
    pending_review: 0,
    accepted: 0,
    rejected: 0,
    total: 0,
  });
  const [candidates, setCandidates] = useState<IdentificationCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("needs_review");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [viewerImage, setViewerImage] = useState<{ url: string; title: string } | null>(null);

  // Inspection Drawer State
  const [selectedCandidate, setSelectedCandidate] = useState<IdentificationCandidate | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showOriginalScreenshot, setShowOriginalScreenshot] = useState(false);

  // Editable fields in inspection drawer
  const [editTitle, setEditTitle] = useState("");
  const [editCreator, setEditCreator] = useState("");
  const [editType, setEditType] = useState<ContentType>("other");
  const [editSubcategory, setEditSubcategory] = useState("");
  const [editDirectUrl, setEditDirectUrl] = useState("");
  const [editStatus, setEditStatus] = useState<ConsumptionStatus>("want_to_consume");
  const [editYear, setEditYear] = useState<string>("");
  const [editOverview, setEditOverview] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [h, c, res] = await Promise.all([
        checkBackendHealth(),
        getReviewCounts().catch(() => ({ pending_review: 0, accepted: 0, rejected: 0, total: 0 })),
        listReviewCandidates({
          review_status: statusFilter === "all" ? undefined : statusFilter,
          content_type: typeFilter || undefined,
          limit: 50,
        }).catch(() => ({ total: 0, items: [] })),
      ]);
      setHealth(h);
      setCounts(c);
      setCandidates(res.items);
    } catch (err) {
      console.error("Error loading review queue:", err);
      showToast("Failed to load review items.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    let isSubscribed = true;
    async function fetchData() {
      try {
        const [h, c, res] = await Promise.all([
          checkBackendHealth(),
          getReviewCounts().catch(() => ({ pending_review: 0, accepted: 0, rejected: 0, total: 0 })),
          listReviewCandidates({
            review_status: statusFilter === "all" ? undefined : statusFilter,
            content_type: typeFilter || undefined,
            limit: 50,
          }).catch(() => ({ total: 0, items: [] })),
        ]);
        if (isSubscribed) {
          setHealth(h);
          setCounts(c);
          setCandidates(res.items);
          setIsLoading(false);
        }
      } catch {
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    }
    fetchData();
    return () => {
      isSubscribed = false;
    };
  }, [statusFilter, typeFilter]);

  const openInspection = (cand: IdentificationCandidate) => {
    setSelectedCandidate(cand);
    setEditTitle(cand.suggested_title);
    setEditCreator(cand.suggested_creator || "");
    setEditType((cand.suggested_type as ContentType) || "other");
    setEditSubcategory(cand.suggested_subcategory || "");
    setEditDirectUrl(cand.direct_url || "");
    setEditStatus("want_to_consume");
    setEditYear(cand.year_clue ? cand.year_clue.toString() : "");
    setEditOverview(cand.description_clue || "");
    setShowOriginalScreenshot(false);
    setIsDrawerOpen(true);
  };

  const handleSaveEdits = async () => {
    if (!selectedCandidate) return;
    setIsSubmitting(true);
    try {
      const updated = await updateReviewCandidate(selectedCandidate.id, {
        suggested_title: editTitle,
        suggested_creator: editCreator || undefined,
        suggested_type: editType,
        suggested_subcategory: editSubcategory || undefined,
        direct_url: editDirectUrl || undefined,
        year_clue: editYear ? parseInt(editYear, 10) : undefined,
        description_clue: editOverview || undefined,
      });
      setSelectedCandidate(updated);
      setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      showToast("Candidate details updated successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update candidate";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedCandidate) return;
    setIsSubmitting(true);
    try {
      await acceptReviewCandidate(selectedCandidate.id, {
        title: editTitle,
        creator: editCreator || undefined,
        content_type: editType,
        subcategory: editSubcategory || undefined,
        direct_url: editDirectUrl || undefined,
        consumption_status: editStatus,
        release_year: editYear ? parseInt(editYear, 10) : undefined,
        overview: editOverview || undefined,
      });

      showToast(`"${editTitle}" added to your media library!`);
      setIsDrawerOpen(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to accept candidate";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyProviderMatch = (match: any) => {
    const rec = match.record || match;
    if (rec.title) setEditTitle(rec.title);
    if (rec.creator) setEditCreator(rec.creator);
    if (rec.release_year) setEditYear(String(rec.release_year));
    if (rec.overview) setEditOverview(rec.overview);
    if (rec.provider_url) setEditDirectUrl(rec.provider_url);
    if (rec.genre && !editSubcategory) setEditSubcategory(rec.genre);
    showToast(`Applied verified metadata from ${rec.provider_name || 'external provider'}!`);
  };

  const handleQuickApprove = async (cand: IdentificationCandidate) => {
    try {
      await acceptReviewCandidate(cand.id, {
        title: cand.suggested_title,
        creator: cand.suggested_creator || undefined,
        content_type: (cand.suggested_type as ContentType) || "other",
        subcategory: cand.suggested_subcategory || undefined,
        direct_url: cand.direct_url || undefined,
      });
      showToast(`"${cand.suggested_title}" added to your library!`);
      await loadData();
    } catch (e) {
      showToast("Failed to approve: " + String(e), "error");
    }
  };

  const handleReject = async (candidateId: string) => {
    setIsSubmitting(true);
    try {
      await rejectReviewCandidate(candidateId);
      showToast("Candidate rejected and archived.");
      if (selectedCandidate?.id === candidateId) {
        setIsDrawerOpen(false);
      }
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reject candidate";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

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
    <div className="flex h-screen bg-[#FBF9F5] text-stone-900 overflow-hidden">
      <Sidebar health={health} pendingReviewCount={counts.pending_review} />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header />

        <main className="p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6">
          {/* Toast Notification */}
          {toast && (
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between text-sm transition-all duration-300 shadow-md ${
                toast.type === "success"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                  : "bg-rose-50 border-rose-300 text-rose-900"
              }`}
            >
              <div className="flex items-center gap-3">
                {toast.type === "success" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-600" />
                )}
                <span className="font-semibold">{toast.message}</span>
              </div>
              <button
                onClick={() => setToast(null)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Page Title & Stats */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-5">
            <div>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-stone-900">
                    Review Center
                  </h1>
                  <p className="text-sm text-stone-600">
                    Confirm detected titles, topic subcategories, and direct links before adding to your library.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={loadData}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 transition-colors shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span>Refresh Queue</span>
              </button>
            </div>
          </div>

          {/* Status Tabs and Type Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-stone-100 border border-stone-200">
              <button
                onClick={() => setStatusFilter("needs_review")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  statusFilter === "needs_review"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <span>Ready to Add</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${statusFilter === "needs_review" ? "bg-amber-700 text-white" : "bg-stone-200 text-stone-700"}`}>
                  {counts.pending_review}
                </span>
              </button>
              <button
                onClick={() => setStatusFilter("accepted")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  statusFilter === "accepted"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <span>Added to Library</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${statusFilter === "accepted" ? "bg-emerald-700 text-white" : "bg-stone-200 text-stone-700"}`}>
                  {counts.accepted}
                </span>
              </button>
              <button
                onClick={() => setStatusFilter("rejected")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  statusFilter === "rejected"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                <span>Dismissed</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${statusFilter === "rejected" ? "bg-rose-700 text-white" : "bg-stone-200 text-stone-700"}`}>
                  {counts.rejected}
                </span>
              </button>
            </div>

            {/* Content Type Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                Type:
              </span>
              <CustomSelect
                value={typeFilter}
                onChange={(val) => setTypeFilter(val)}
                options={TYPE_FILTER_OPTIONS}
                size="sm"
              />
            </div>
          </div>

          {/* Candidate Card Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-64 rounded-2xl bg-white border border-stone-200 animate-pulse shadow-sm" />
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-stone-200 bg-white shadow-sm space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-100 mx-auto flex items-center justify-center text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-stone-900">All caught up!</h3>
              <p className="text-xs text-stone-600 max-w-sm mx-auto">
                No items waiting for review. When you upload screenshots, identified media with direct links will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {candidates.map((cand) => (
                <div
                  key={cand.id}
                  className="rounded-2xl border border-stone-200 bg-white shadow-sm hover:shadow-md hover:border-amber-400 transition-all overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-5 space-y-4">
                    {/* Header: Type, Subcategory & Confidence */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-stone-100 border border-stone-200 text-xs font-bold text-stone-800">
                          {getTypeIcon(cand.suggested_type)}
                          <span className="capitalize">{cand.suggested_type?.replace("_", " ") || "Other"}</span>
                        </div>
                        {cand.suggested_subcategory && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                            {cand.suggested_subcategory}
                          </span>
                        )}
                      </div>

                      {cand.confidence_score !== null && cand.confidence_score !== undefined && (
                        <div className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200">
                          {Math.round(cand.confidence_score * 100)}% Conf
                        </div>
                      )}
                    </div>

                    {/* Thumbnail Crop & Title */}
                    <div className="flex gap-3.5">
                      {cand.crop_signed_url ? (
                        <div
                          onClick={() => setViewerImage({ url: cand.crop_signed_url || "", title: cand.suggested_title })}
                          className="h-20 w-16 flex-shrink-0 rounded-xl overflow-hidden border border-stone-200 bg-stone-50 cursor-pointer group/thumb relative"
                          title="Click to zoom crop details"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={resolveMediaUrl(cand.crop_signed_url)}
                            alt={cand.suggested_title}
                            className="h-full w-full object-cover group-hover/thumb:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-stone-900/0 group-hover/thumb:bg-stone-900/15 transition-colors flex items-center justify-center">
                            <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity drop-shadow" />
                          </div>
                        </div>
                      ) : (
                        <div className="h-20 w-16 flex-shrink-0 rounded-xl border border-dashed border-stone-200 bg-stone-50 flex flex-col items-center justify-center text-stone-400">
                          <Layers className="h-5 w-5" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-base text-stone-900 line-clamp-2 leading-snug">
                          {cand.suggested_title}
                        </h4>
                        {cand.suggested_creator && (
                          <p className="text-xs font-medium text-stone-600 line-clamp-1 mt-1">
                            by {cand.suggested_creator}
                          </p>
                        )}
                        {cand.year_clue && (
                          <p className="text-[11px] text-stone-500 mt-0.5">
                            Year clue: {cand.year_clue}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Direct Link Preview */}
                    {cand.direct_url && (
                      <a
                        href={cand.direct_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-colors"
                      >
                        <span>Open Direct Link</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => openInspection(cand)}
                      className="text-xs font-bold text-stone-700 hover:text-stone-900 flex items-center gap-1.5"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-stone-500" />
                      <span>Inspect</span>
                    </button>

                    {cand.review_status === "needs_review" && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleReject(cand.id)}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Reject"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleQuickApprove(cand)}
                          className="flex items-center gap-1 py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-all"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Add to Library</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Inspection & Edit Drawer */}
      {isDrawerOpen && selectedCandidate && (
        <div className="fixed inset-0 z-50 flex justify-end bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-white border-l border-stone-200 h-full flex flex-col justify-between overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="p-6 border-b border-stone-200 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-10">
              <div>
                <h3 className="font-bold text-lg text-stone-900">Inspect & Verify Candidate</h3>
                <p className="text-xs text-stone-500 font-mono">
                  Model: {selectedCandidate.ai_model_name || "gemini"} · Prompt: {selectedCandidate.prompt_version || "v1.0.0"}
                </p>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form & Screenshot Body */}
            <div className="p-6 space-y-6">
              {/* Visual Evidence Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Visual Evidence
                  </span>
                  {selectedCandidate.source_signed_url && (
                    <button
                      type="button"
                      onClick={() => setShowOriginalScreenshot(!showOriginalScreenshot)}
                      className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1"
                    >
                      <span>{showOriginalScreenshot ? "Show Crop Focus" : "Show Full Original Screenshot"}</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-2 flex items-center justify-center min-h-[200px] max-h-[300px] overflow-hidden relative">
                  {showOriginalScreenshot && selectedCandidate.source_signed_url ? (
                    <div
                      onClick={() => setViewerImage({ url: selectedCandidate.source_signed_url || "", title: selectedCandidate.suggested_title })}
                      className="cursor-pointer group/preview relative"
                      title="Click to zoom full screenshot"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveMediaUrl(selectedCandidate.source_signed_url)}
                        alt="Original Screenshot"
                        className="max-h-[280px] w-auto object-contain rounded-xl group-hover/preview:scale-[1.01] transition-transform"
                      />
                      <div className="absolute inset-0 bg-stone-900/0 group-hover/preview:bg-stone-900/10 transition-colors flex items-center justify-center rounded-xl">
                        <span className="opacity-0 group-hover/preview:opacity-100 transition-opacity px-2.5 py-1 rounded-lg bg-stone-900/80 text-white text-[11px] font-semibold backdrop-blur-xs flex items-center gap-1">
                          <ZoomIn className="h-3 w-3" />
                          <span>Click to Zoom</span>
                        </span>
                      </div>
                    </div>
                  ) : selectedCandidate.crop_signed_url ? (
                    <div
                      onClick={() => setViewerImage({ url: selectedCandidate.crop_signed_url || "", title: selectedCandidate.suggested_title })}
                      className="cursor-pointer group/preview relative"
                      title="Click to zoom crop"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveMediaUrl(selectedCandidate.crop_signed_url)}
                        alt="Crop"
                        className="max-h-[280px] w-auto object-contain rounded-xl shadow-xs group-hover/preview:scale-[1.01] transition-transform"
                      />
                      <div className="absolute inset-0 bg-stone-900/0 group-hover/preview:bg-stone-900/10 transition-colors flex items-center justify-center rounded-xl">
                        <span className="opacity-0 group-hover/preview:opacity-100 transition-opacity px-2.5 py-1 rounded-lg bg-stone-900/80 text-white text-[11px] font-semibold backdrop-blur-xs flex items-center gap-1">
                          <ZoomIn className="h-3 w-3" />
                          <span>Click to Zoom</span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-stone-400 text-xs">No screenshot preview</div>
                  )}
                </div>
              </div>

              {/* Clues */}
              {selectedCandidate.identifying_clues && selectedCandidate.identifying_clues.length > 0 && (
                <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50 space-y-1">
                  <span className="text-xs font-bold text-stone-700">Visual Clues:</span>
                  <ul className="text-xs text-stone-600 list-disc list-inside space-y-0.5">
                    {selectedCandidate.identifying_clues.map((c, idx) => (
                      <li key={idx}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* External Provider Match Suggestions (M4) */}
              {selectedCandidate.provider_candidates && selectedCandidate.provider_candidates.length > 0 && (
                <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
                      Authoritative Match Found
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900">
                      {(selectedCandidate.provider_candidates[0] as any).scores?.composite_score 
                        ? `${Math.round((selectedCandidate.provider_candidates[0] as any).scores.composite_score * 100)}% Match`
                        : "Verified"}
                    </span>
                  </div>

                  {selectedCandidate.provider_candidates.slice(0, 2).map((candMatch: any, idx: number) => {
                    const rec = candMatch.record || candMatch;
                    const scores = candMatch.scores;
                    return (
                      <div key={idx} className="bg-white rounded-xl p-3 border border-emerald-100 shadow-2xs space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <h4 className="text-xs font-bold text-stone-900 line-clamp-1">{rec.title}</h4>
                            <p className="text-[11px] text-stone-600">
                              {rec.creator && `by ${rec.creator}`} {rec.release_year && `(${rec.release_year})`} · <span className="uppercase text-[9px] font-bold text-emerald-800">{rec.provider_name}</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleApplyProviderMatch(candMatch)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors shrink-0 cursor-pointer"
                          >
                            Apply
                          </button>
                        </div>

                        {/* Explanation Pills */}
                        {scores?.explanation_pills && scores.explanation_pills.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {scores.explanation_pills.map((pill: string, pIdx: number) => (
                              <span key={pIdx} className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
                                {pill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Editable Fields */}
              <div className="space-y-4 pt-2 border-t border-stone-100">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 font-semibold focus:outline-none focus:border-amber-600 focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                      Creator / Author
                    </label>
                    <input
                      type="text"
                      value={editCreator}
                      onChange={(e) => setEditCreator(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                      Category
                    </label>
                    <CustomSelect
                      value={editType}
                      onChange={(val) => setEditType(val as ContentType)}
                      options={CONTENT_TYPE_SELECT_OPTIONS}
                      size="md"
                      className="w-full"
                      buttonClassName="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                      Topic / Subcategory
                    </label>
                    <input
                      type="text"
                      value={editSubcategory}
                      onChange={(e) => setEditSubcategory(e.target.value)}
                      placeholder="e.g. Psychology, Habits, Money"
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                      Direct Web Link
                    </label>
                    <input
                      type="url"
                      value={editDirectUrl}
                      onChange={(e) => setEditDirectUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Summary Clue / Overview
                  </label>
                  <textarea
                    rows={2}
                    value={editOverview}
                    onChange={(e) => setEditOverview(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Drawer Actions */}
            <div className="p-6 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleReject(selectedCandidate.id)}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-600 hover:text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors"
              >
                Dismiss
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-stone-800 text-xs font-bold transition-colors shadow-sm"
                >
                  Save Edits
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Approve & Add to Library</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Viewer Lightbox */}
      <ImageViewerModal
        isOpen={!!viewerImage}
        onClose={() => setViewerImage(null)}
        imageUrl={viewerImage?.url}
        title={viewerImage?.title}
      />
    </div>
  );
}
