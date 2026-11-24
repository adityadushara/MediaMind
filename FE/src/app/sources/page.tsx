"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import {
  getSourceAssets,
  getSourceAssetDetail,
  retryProcessingJob,
  deleteSourceAsset,
  resolveMediaUrl,
} from "@/lib/api";
import { CustomSelect, SelectOption } from "@/components/ui/CustomSelect";
import { ImageViewerModal } from "@/components/ui/ImageViewerModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import {
  SourceAsset,
  SourceAssetDetail,
  JobStatus,
} from "@/types";
import {
  Image as ImageIcon,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  ExternalLink,
  X,
  Filter,
  ArrowUpDown,
  BookOpen,
  ZoomIn,
  Trash2,
} from "lucide-react";

const SOURCES_STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Statuses" },
  { value: "queued", label: "Queued" },
  { value: "processing", label: "Processing" },
  { value: "awaiting_identification", label: "Ready for AI" },
  { value: "identified", label: "Identified" },
  { value: "needs_review", label: "Needs Review" },
  { value: "failed", label: "Failed" },
];

const SOURCES_SORT_OPTIONS: SelectOption[] = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
];

export default function SourcesPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [assets, setAssets] = useState<SourceAsset[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [viewerImage, setViewerImage] = useState<{ url: string; title: string } | null>(null);
  const [page, setPage] = useState(0);
  const limit = 16;

  // Detail Drawer state
  const [selectedAsset, setSelectedAsset] = useState<SourceAssetDetail | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; fileName: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const promptDeleteAsset = (assetId: string, fileName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteTarget({ id: assetId, fileName });
  };

  const handleConfirmDeleteAsset = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setIsDeleting(true);

    // Remove the row the moment the person confirms. Waiting for the request
    // before updating the list made every delete look like a page reload.
    setDeleteTarget(null);
    setAssets((prev) => prev.filter((asset) => asset.id !== target.id));
    setTotalCount((prev) => Math.max(0, prev - 1));
    if (selectedAsset?.id === target.id) {
      setSelectedAsset(null);
    }

    try {
      await deleteSourceAsset(target.id);
      showToast(`'${target.fileName}' was permanently deleted.`);
      await loadSources({ silent: true });
    } catch (err) {
      showToast(
        "Failed to delete screenshot: " + (err instanceof Error ? err.message : String(err)),
        "error"
      );
      // Put the list back in sync with the server after a failed delete.
      await loadSources({ silent: true });
    } finally {
      setIsDeleting(false);
    }
  };

  const loadSources = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!user) return;
      if (!options?.silent) setIsLoading(true);
      try {
        const res = await getSourceAssets({
          search: searchQuery.trim() || undefined,
          status: statusFilter === "all" ? undefined : statusFilter,
          sort: sortOrder,
          limit,
          offset: page * limit,
        });
        const rawItems = res?.items || [];
        setAssets(Array.isArray(rawItems) ? rawItems : []);
        setTotalCount(res?.total || 0);
      } catch {
        // keep existing
      } finally {
        if (!options?.silent) setIsLoading(false);
      }
    },
    [user, searchQuery, statusFilter, sortOrder, page]
  );

  // A single fetch path: the previous duplicate effect fired two overlapping
  // requests for every filter change.
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      queueMicrotask(() => {
        setAssets([]);
        setTotalCount(0);
        setSelectedAsset(null);
        setIsLoading(false);
      });
      return;
    }
    loadSources();
  }, [loadSources, user, isAuthLoading]);

  const hasActiveJobs =
    assets.some((a) => a.latest_status === "queued" || a.latest_status === "processing") ||
    selectedAsset?.latest_job?.status === "queued" ||
    selectedAsset?.latest_job?.status === "processing";

  useEffect(() => {
    if (isAuthLoading || !user || !hasActiveJobs) return;
    const selectedId = selectedAsset?.id;
    const timer = setInterval(async () => {
      await loadSources({ silent: true });
      if (selectedId) {
        try {
          const detail = await getSourceAssetDetail(selectedId);
          setSelectedAsset(detail);
        } catch {
          // keep existing
        }
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [hasActiveJobs, loadSources, selectedAsset?.id, user, isAuthLoading]);

  const handleOpenDetail = async (assetId: string) => {
    try {
      const detail = await getSourceAssetDetail(assetId);
      setSelectedAsset(detail);
    } catch (e) {
      console.error("Failed to load asset detail", e);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    try {
      const updated = await retryProcessingJob(jobId);
      if (selectedAsset && selectedAsset.latest_job?.id === jobId) {
        setSelectedAsset({ ...selectedAsset, latest_job: updated, latest_status: updated.status as JobStatus });
      }
      setAssets((prev) =>
        prev.map((a) => (a.id === selectedAsset?.id ? { ...a, latest_status: updated.status as JobStatus } : a))
      );
      showToast("Job retry initiated successfully.");
    } catch (err) {
      showToast("Failed to retry job: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setRetryingJobId(null);
    }
  };

  const getStatusBadge = (status?: string | null) => {
    switch (status) {
      case "identified":
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            <span>{status === "completed" ? "Completed" : "Identified"}</span>
          </span>
        );
      case "needs_review":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-300">
            <AlertCircle className="h-3 w-3" />
            <span>Needs Review</span>
          </span>
        );
      case "awaiting_identification":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-300">
            <Clock className="h-3 w-3" />
            <span>Ready for AI</span>
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-300">
            <AlertCircle className="h-3 w-3" />
            <span>Failed</span>
          </span>
        );
      case "queued":
      case "processing":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-300">
            <Clock className="h-3 w-3" />
            <span>{status === "processing" ? "Processing" : "Queued"}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-600 border border-stone-300">
            <span>{status || "Stored"}</span>
          </span>
        );
    }
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <AuthGuard featureName="Saved Screenshots Vault">
      <div className="min-h-screen bg-[#FBF9F5] text-stone-900 flex">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            setPage(0);
          }}
        />

        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6 min-w-0">
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
                type="button"
                onClick={() => setToast(null)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-stone-900 flex items-center gap-2.5">
                <ImageIcon className="h-6 w-6 text-amber-600" />
                <span>Saved Screenshots</span>
              </h1>
              <p className="text-sm text-stone-600 mt-1">
                Your vault of original screenshots safely stored and linked to your books, videos, and courses.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => loadSources()}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-xs font-bold text-stone-800 transition-colors shadow-sm"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span>Refresh Vault</span>
              </button>
            </div>
          </div>

          {/* Filters & Search Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <p className="text-xs text-stone-500 font-medium w-full sm:w-auto">
              {searchQuery.trim()
                ? `Filtering by file name: “${searchQuery.trim()}”`
                : "Search by file name from the bar at the top."}
            </p>

            <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Status:</span>
                <CustomSelect
                  value={statusFilter}
                  onChange={(val) => {
                    setStatusFilter(val);
                    setPage(0);
                  }}
                  options={SOURCES_STATUS_OPTIONS}
                  size="sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Sort:</span>
                <CustomSelect
                  value={sortOrder}
                  onChange={(val) => setSortOrder(val as "newest" | "oldest")}
                  options={SOURCES_SORT_OPTIONS}
                  size="sm"
                />
              </div>
            </div>
          </div>

          {/* Sources Grid */}
          {isLoading ? (
            <div className="py-20 text-center text-xs text-stone-500">Loading source screenshots...</div>
          ) : !assets || assets.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-stone-300 rounded-xl space-y-2 bg-white">
              <ImageIcon className="h-8 w-8 text-stone-400 mx-auto" />
              <p className="text-xs font-semibold text-stone-800">No screenshots found</p>
              <p className="text-[11px] text-stone-500">
                Upload screenshots to inspect them here and attach them to media items.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  onClick={() => handleOpenDetail(asset.id)}
                  className="rounded-2xl border border-stone-200 bg-white hover:border-amber-400 p-4 flex flex-col justify-between space-y-3 cursor-pointer group transition-all shadow-sm hover:shadow-md"
                >
                  <div className="space-y-2.5">
                    {/* Thumbnail preview */}
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-stone-100 border border-stone-200 flex items-center justify-center">
                      {asset.signed_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={resolveMediaUrl(asset.signed_url)}
                          alt={asset.file_name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-stone-400" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-stone-500 truncate">
                          {asset.image_width && asset.image_height
                            ? `${asset.image_width}×${asset.image_height}`
                            : "Original"}
                        </span>
                        {getStatusBadge(asset.latest_status)}
                      </div>
                      <p className="text-xs font-bold text-stone-900 truncate group-hover:text-amber-700 transition-colors">
                        {asset.file_name}
                      </p>
                      <p className="text-[10px] text-stone-500 font-mono">
                        {(asset.file_size_bytes / (1024 * 1024)).toFixed(2)} MB • {new Date(asset.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px]">
                    <span className="font-mono text-[10px] text-stone-400 truncate">
                      SHA: {asset.sha256_hash.substring(0, 8)}...
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => promptDeleteAsset(asset.id, asset.file_name, e)}
                        disabled={isDeleting}
                        className="p-1 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Delete screenshot"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-amber-700 font-bold group-hover:underline text-xs">
                        Inspect →
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-stone-200 text-xs">
              <span className="text-stone-500 font-medium">
                Showing {page * limit + 1} to {Math.min((page + 1) * limit, totalCount)} of {totalCount} screenshots
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="px-3 py-1.5 rounded-xl bg-white border border-stone-300 text-stone-700 font-bold shadow-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="font-mono text-stone-600 font-bold">
                  {page + 1} / {totalPages}
                </span>
                <button
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-stone-300 text-stone-700 font-bold shadow-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Source Screenshot Details & Inspection Drawer */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex justify-end bg-stone-900/40 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white border-l border-stone-200 h-full p-6 flex flex-col justify-between overflow-y-auto shadow-2xl space-y-6">
            <div>
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-stone-200">
                <div>
                  <h3 className="text-lg font-bold text-stone-900 truncate max-w-sm">
                    {selectedAsset.file_name}
                  </h3>
                  <p className="text-xs font-mono text-stone-500">ID: {selectedAsset.id}</p>
                </div>
                <button
                  onClick={() => setSelectedAsset(null)}
                  className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* High-res Image Preview with signed URL */}
              <div
                onClick={() =>
                  selectedAsset.signed_url &&
                  setViewerImage({ url: selectedAsset.signed_url, title: selectedAsset.file_name })
                }
                className="rounded-2xl overflow-hidden bg-stone-100 border border-stone-200 flex items-center justify-center min-h-[250px] max-h-[420px] relative cursor-pointer group/zoom"
                title="Click to inspect full resolution screenshot"
              >
                {selectedAsset.signed_url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveMediaUrl(selectedAsset.signed_url)}
                      alt={selectedAsset.file_name}
                      className="w-full h-auto max-h-[420px] object-contain group-hover/zoom:scale-[1.01] transition-transform"
                    />
                    <div className="absolute inset-0 bg-stone-900/0 group-hover/zoom:bg-stone-900/10 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover/zoom:opacity-100 transition-opacity px-3 py-1.5 rounded-xl bg-stone-900/80 text-white text-xs font-semibold backdrop-blur-xs flex items-center gap-1.5">
                        <ZoomIn className="h-3.5 w-3.5" />
                        <span>Click to Zoom & Inspect</span>
                      </span>
                    </div>
                  </>
                ) : (
                  <ImageIcon className="h-8 w-8 text-stone-400" />
                )}
              </div>

              {/* Metadata specs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-stone-50 border border-stone-200 text-xs">
                <div>
                  <span className="text-stone-500 block text-[10px] uppercase font-mono font-semibold">Dimensions</span>
                  <span className="font-mono text-stone-800 font-semibold">
                    {selectedAsset.image_width && selectedAsset.image_height
                      ? `${selectedAsset.image_width} × ${selectedAsset.image_height} px`
                      : "Unknown"}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 block text-[10px] uppercase font-mono font-semibold">File Size</span>
                  <span className="font-mono text-stone-800 font-semibold">
                    {(selectedAsset.file_size_bytes / (1024 * 1024)).toFixed(2)} MB ({selectedAsset.mime_type})
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 block text-[10px] uppercase font-mono font-semibold">Uploaded Date</span>
                  <span className="font-mono text-stone-800 font-semibold">
                    {new Date(selectedAsset.created_at).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 block text-[10px] uppercase font-mono font-semibold">Processing State</span>
                  <div className="mt-0.5">{getStatusBadge(selectedAsset.latest_status)}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-stone-500 block text-[10px] uppercase font-mono font-semibold">SHA-256 Fingerprint</span>
                  <span className="font-mono text-[11px] text-stone-600 break-all">
                    {selectedAsset.sha256_hash}
                  </span>
                </div>
              </div>

              {/* Latest Job & Retry Actions */}
              {selectedAsset.latest_job && (
                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-stone-800">Ingestion Job</span>
                    <span className="font-mono text-stone-500 text-[10px]">
                      Attempts: {selectedAsset.latest_job.retry_count} / {selectedAsset.latest_job.max_retries}
                    </span>
                  </div>
                  {selectedAsset.latest_job.error_message && (
                    <p className="text-xs text-rose-600 font-mono">
                      Error: {selectedAsset.latest_job.error_message}
                    </p>
                  )}
                  {(selectedAsset.latest_job.status === "failed" || selectedAsset.latest_job.status === "awaiting_identification") && (
                    <div className="pt-2 flex justify-end">
                      <button
                        disabled={retryingJobId === selectedAsset.latest_job.id}
                        onClick={() => handleRetryJob(selectedAsset.latest_job!.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-stone-300 hover:bg-stone-100 text-xs font-bold text-stone-800 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className={`h-3 w-3 ${retryingJobId === selectedAsset.latest_job.id ? "animate-spin" : ""}`} />
                        <span>Re-enqueue Job</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Associated Media Library Items */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase font-mono text-stone-500 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Associated Media Items ({(selectedAsset.library_items || []).length})</span>
                </h4>
                {(selectedAsset.library_items || []).length === 0 ? (
                  <p className="text-xs text-stone-500 italic p-3 bg-stone-50 rounded-lg border border-stone-200">
                    Not linked to any media library item yet. You can attach this screenshot from the Library page.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(selectedAsset.library_items || []).map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs hover:border-amber-400 transition-colors"
                      >
                        <div>
                          <p className="font-bold text-stone-900">{it.title}</p>
                          <p className="text-[11px] text-stone-600 capitalize">
                            {it.creator ? `${it.creator} • ` : ""}{it.content_type.replace("_", " ")}
                          </p>
                        </div>
                        <a
                          href={`/library`}
                          className="p-1 rounded text-stone-400 hover:text-amber-700 transition-colors"
                          title="View in Library"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-stone-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => promptDeleteAsset(selectedAsset.id, selectedAsset.file_name)}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete Screenshot</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedAsset(null)}
                className="px-5 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold transition-colors cursor-pointer"
              >
                Close Vault Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Lightbox Modal */}
      <ImageViewerModal
        isOpen={!!viewerImage}
        onClose={() => setViewerImage(null)}
        imageUrl={viewerImage?.url}
        title={viewerImage?.title}
      />

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDeleteAsset}
        title="Permanently Delete Screenshot?"
        description={
          <div className="space-y-2">
            <p>
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-stone-900">
                &lsquo;{deleteTarget?.fileName}&rsquo;
              </span>
              ?
            </p>
            <p className="text-[11px] text-stone-500">
              This will remove the screenshot from storage and all extracted AI candidate proposals. This action cannot be undone.
            </p>
          </div>
        }
        confirmText="Permanently Delete"
        variant="danger"
        icon="trash"
        isLoading={isDeleting}
      />
    </div>
    </AuthGuard>
  );
}
