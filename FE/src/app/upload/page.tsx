"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import {
  checkBackendHealth,
  getProcessingJobs,
  uploadScreenshotFiles,
  retryProcessingJob,
  getSourceAssetDetail,
  acceptAllJobCandidates,
  resolveMediaUrl,
} from "@/lib/api";
import { ImageViewerModal } from "@/components/ui/ImageViewerModal";
import { HealthStatus, ProcessingJob, JobStatus } from "@/types";
import {
  UploadCloud,
  FileImage,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Eye,
  X,
  Loader2,
  Sparkles,
  BookOpen,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

interface QueuedUploadItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  errorMessage?: string;
  jobId?: string;
}

function FilePreviewCard({
  item,
  onRemove,
  onRetry,
  disabled,
}: {
  item: QueuedUploadItem;
  onRemove: () => void;
  onRetry?: () => void;
  disabled: boolean;
}) {
  const previewUrl = React.useMemo(() => URL.createObjectURL(item.file), [item.file]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-xl border text-xs transition-colors ${
        item.status === "error"
          ? "border-rose-300 bg-rose-50 text-rose-900"
          : item.status === "success"
          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : item.status === "uploading"
          ? "border-amber-400 bg-amber-50 text-amber-900"
          : "border-stone-200 bg-white text-stone-800"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-12 h-12 rounded-lg bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center">
          {previewUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
          ) : (
            <FileImage className="h-5 w-5 text-stone-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-stone-900 truncate max-w-xs">{item.file.name}</p>
          <div className="flex items-center gap-2 text-[11px] mt-0.5">
            <span className="text-stone-500 font-medium">{(item.file.size / 1024).toFixed(0)} KB</span>
            {item.status === "uploading" && (
              <span className="text-amber-800 flex items-center gap-1 font-semibold">
                <Loader2 className="h-3 w-3 animate-spin" /> Uploading screenshot...
              </span>
            )}
            {item.status === "success" && (
              <span className="text-emerald-800 flex items-center gap-1 font-bold">
                <CheckCircle2 className="h-3 w-3" /> Sent to AI
              </span>
            )}
            {item.status === "error" && (
              <span className="text-rose-700 truncate max-w-[150px] font-semibold" title={item.errorMessage}>
                {item.errorMessage || "Upload failed"}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-2">
        {item.status === "error" && onRetry && (
          <button
            type="button"
            disabled={disabled}
            onClick={onRetry}
            className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-100 transition-colors"
            title="Retry upload"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          disabled={disabled || item.status === "uploading"}
          onClick={onRemove}
          className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          title="Remove from list"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadQueue, setUploadQueue] = useState<QueuedUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedStatusTab, setSelectedStatusTab] = useState<string>("all");
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [autoAddToLibrary, setAutoAddToLibrary] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshJobs = useCallback(async () => {
    try {
      const data = await getProcessingJobs();
      setJobs(data);
    } catch {
      // keep previous state
    }
  }, []);

  useEffect(() => {
    let isSubscribed = true;

    async function loadData() {
      setIsLoading(true);
      try {
        const [h, j] = await Promise.all([checkBackendHealth(), getProcessingJobs()]);
        if (isSubscribed) {
          setHealth(h);
          setJobs(j);
          setIsLoading(false);
        }
      } catch {
        if (isSubscribed) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      isSubscribed = false;
    };
  }, []);

  // Adaptive fast polling: 1 second when jobs are queued/processing, 4 seconds when idle
  useEffect(() => {
    const hasActive = jobs.some(
      (j) => j.status === "processing" || j.status === "queued" || j.status === "awaiting_identification"
    );
    const intervalMs = hasActive || isUploading ? 1000 : 4000;

    const timer = setInterval(() => {
      refreshJobs();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [jobs, isUploading, refreshJobs]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const added: QueuedUploadItem[] = Array.from(e.target.files).map((f) => ({
        id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
        file: f,
        status: "pending",
      }));
      setUploadQueue((prev) => [...prev, ...added]);
      setUploadError(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const added: QueuedUploadItem[] = Array.from(e.dataTransfer.files).map((f) => ({
        id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
        file: f,
        status: "pending",
      }));
      setUploadQueue((prev) => [...prev, ...added]);
      setUploadError(null);
    }
  };

  const uploadSingleItem = async (item: QueuedUploadItem): Promise<boolean> => {
    setUploadQueue((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: "uploading", errorMessage: undefined } : it))
    );
    try {
      const res = await uploadScreenshotFiles([item.file]);
      const createdJobId = res.assets[0]?.job_id;
      setUploadQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: "success", jobId: createdJobId } : it))
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: "error", errorMessage: msg } : it))
      );
      return false;
    }
  };

  const handleStartUpload = async () => {
    const toUpload = uploadQueue.filter((it) => it.status === "pending" || it.status === "error");
    if (toUpload.length === 0) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress({ completed: 0, total: toUpload.length });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < toUpload.length; i++) {
      const item = toUpload[i];
      const ok = await uploadSingleItem(item);
      if (ok) successCount++;
      else failCount++;
      setUploadProgress({ completed: i + 1, total: toUpload.length });
    }

    await refreshJobs();
    setIsUploading(false);

    if (failCount === 0) {
      setUploadSuccessMessage(`Successfully uploaded ${successCount} screenshot${successCount > 1 ? "s" : ""}! AI is now reading the title, category, and direct link.`);
      setTimeout(() => {
        setUploadQueue((prev) => prev.filter((it) => it.status !== "success"));
        setUploadProgress(null);
        setUploadSuccessMessage(null);
      }, 4000);
    } else {
      setUploadError(`${failCount} file${failCount > 1 ? "s" : ""} failed to upload. You can retry below.`);
    }
  };

  const handleRetrySingleUpload = async (item: QueuedUploadItem) => {
    setIsUploading(true);
    const ok = await uploadSingleItem(item);
    setIsUploading(false);
    if (ok) {
      await refreshJobs();
      setTimeout(() => {
        setUploadQueue((prev) => prev.filter((it) => it.id !== item.id));
      }, 2000);
    }
  };

  const handleRetry = async (jobId: string) => {
    setRetryingJobId(jobId);
    try {
      const updated = await retryProcessingJob(jobId);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
    } catch (err) {
      alert("Failed to retry job: " + String(err));
    } finally {
      setRetryingJobId(null);
    }
  };

  const handleOpenPreview = async (sourceAssetId: string) => {
    setPreviewAssetId(sourceAssetId);
    try {
      const detail = await getSourceAssetDetail(sourceAssetId);
      setPreviewSignedUrl(detail.signed_url || null);
    } catch {
      setPreviewSignedUrl(null);
    }
  };

  const handleOneClickAdd = async (jobId: string) => {
    try {
      await acceptAllJobCandidates(jobId);
      await refreshJobs();
      router.push("/library");
    } catch (e) {
      alert("Failed to add to library: " + String(e));
    }
  };

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case "awaiting_identification":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <Clock className="h-3 w-3" />
            <span>Ready for AI</span>
          </span>
        );
      case "completed":
      case "identified":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            <span>Saved in Library</span>
          </span>
        );
      case "needs_review":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
            <Sparkles className="h-3 w-3 text-indigo-600" />
            <span>Identified • Ready to View</span>
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
            <span>AI Reading Screenshot...</span>
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">
            <AlertCircle className="h-3 w-3" />
            <span>Needs Retry</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-stone-100 text-stone-700 border border-stone-200">
            <Clock className="h-3 w-3" />
            <span>Queued</span>
          </span>
        );
    }
  };

  const filteredJobs = jobs.filter((j) => {
    if (selectedStatusTab === "all") return true;
    if (selectedStatusTab === "completed_group") return j.status === "identified" || j.status === "completed";
    if (selectedStatusTab === "queued_group") return j.status === "queued" || j.status === "processing";
    return j.status === selectedStatusTab;
  });

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-stone-900 flex">
      <Sidebar health={health} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-stone-900 flex items-center gap-2.5">
                <UploadCloud className="h-7 w-7 text-amber-600" />
                <span>Upload Center</span>
              </h1>
              <p className="text-sm text-stone-600 mt-1">
                Upload a screenshot of any book, YouTube video, movie, or course. AI will identify it, categorize it, and give you the direct link.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push("/library")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-xs font-bold text-stone-800 shadow-sm"
              >
                <BookOpen className="h-4 w-4" />
                <span>Go to My Library</span>
              </button>
              <button
                onClick={refreshJobs}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-xs font-bold text-stone-800 shadow-sm"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Simple How-It-Works Guide (Kid & Grandparent Friendly) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-sm flex items-start gap-3">
              <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center shrink-0 text-sm">
                1
              </span>
              <div>
                <p className="font-bold text-sm text-stone-900">Take any screenshot</p>
                <p className="text-xs text-stone-600 mt-0.5">
                  Book covers, YouTube videos, movie posters, courses, or articles.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-sm flex items-start gap-3">
              <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center shrink-0 text-sm">
                2
              </span>
              <div>
                <p className="font-bold text-sm text-stone-900">Drop it below</p>
                <p className="text-xs text-stone-600 mt-0.5">
                  Drag files or tap the box to pick an image from your device.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-sm flex items-start gap-3">
              <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center shrink-0 text-sm">
                3
              </span>
              <div>
                <p className="font-bold text-sm text-stone-900">AI organizes & links it</p>
                <p className="text-xs text-stone-600 mt-0.5">
                  Tagged by category (e.g. Psychology or Habits) with an instant link!
                </p>
              </div>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer border-2 border-dashed border-amber-300 hover:border-amber-500 hover:bg-amber-50/40 rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all bg-[#FAF8F5]"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileSelect}
              />
              <div className="p-4 rounded-2xl bg-amber-100 text-amber-700 mb-3 border border-amber-200 shadow-sm">
                <FileImage className="h-9 w-9" />
              </div>
              <p className="text-base font-bold text-stone-900 mb-1">
                Click to browse or drop screenshots here
              </p>
              <p className="text-xs font-medium text-stone-500 max-w-md">
                Supports PNG, JPEG, WebP. Your original screenshots remain safe and preserved in your vault.
              </p>
            </div>

            {/* Selected files queue & action */}
            {uploadQueue.length > 0 && (
              <div className="space-y-3 p-4 rounded-2xl bg-stone-50 border border-stone-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-stone-200">
                  <div>
                    <p className="text-xs font-bold text-stone-900">
                      Screenshots to Upload ({uploadQueue.length})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => setUploadQueue([])}
                      className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-900"
                    >
                      Clear All
                    </button>
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={handleStartUpload}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="h-4 w-4" />
                          <span>Start AI Analysis</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto">
                  {uploadQueue.map((item) => (
                    <FilePreviewCard
                      key={item.id}
                      item={item}
                      onRemove={() => setUploadQueue((prev) => prev.filter((i) => i.id !== item.id))}
                      onRetry={() => handleRetrySingleUpload(item)}
                      disabled={isUploading}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Success message banner */}
            {uploadSuccessMessage && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm font-semibold flex items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" />
                  <span>{uploadSuccessMessage}</span>
                </div>
                <button
                  onClick={() => router.push("/library")}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shrink-0 flex items-center gap-1.5"
                >
                  <span>View in Library</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Error banner */}
            {uploadError && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>

          {/* Recent Processing Status */}
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <h2 className="text-lg font-bold text-stone-900">
                Recent Screenshots & Activity ({jobs.length})
              </h2>
            </div>

            {jobs.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-stone-200 shadow-sm text-stone-500 text-sm">
                <p>No processing jobs found</p>
                <p className="text-xs text-stone-400 mt-1">Drop your first screenshot above to get started!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {jobs.slice(0, 9).map((job) => {
                  const candidate = job.candidates && job.candidates.length > 0 ? job.candidates[0] : null;
                  return (
                    <div
                      key={job.id}
                      className="p-5 rounded-2xl bg-white border border-stone-200 shadow-sm flex flex-col justify-between space-y-3 hover:border-amber-400 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider font-mono">
                            Job #{job.id.slice(0, 8)}
                          </span>
                          <div>{getStatusBadge(job.status)}</div>
                        </div>

                        <button
                          onClick={() => handleOpenPreview(job.source_asset_id)}
                          className="p-1.5 rounded-lg border border-stone-200 text-stone-500 hover:text-stone-900 hover:bg-stone-50 text-xs font-medium flex items-center gap-1 cursor-pointer"
                          title="View screenshot"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Screenshot</span>
                        </button>
                      </div>

                      {/* Display Identified Media Details & Direct Link if available */}
                      {candidate && (
                        <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 space-y-2">
                          <div className="flex items-start gap-3">
                            {candidate.crop_signed_url ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={resolveMediaUrl(candidate.crop_signed_url)}
                                alt={candidate.suggested_title}
                                className="w-12 h-16 rounded-md object-cover border border-stone-200 shrink-0 bg-white"
                              />
                            ) : (
                              <div className="w-12 h-16 rounded-md bg-amber-50 border border-amber-200 shrink-0 flex items-center justify-center text-amber-600">
                                <BookOpen className="h-6 w-6" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-stone-900 text-sm truncate" title={candidate.suggested_title}>
                                {candidate.suggested_title}
                              </p>
                              {candidate.suggested_creator && (
                                <p className="text-xs text-stone-600 truncate mt-0.5">
                                  by <span className="font-medium text-stone-800">{candidate.suggested_creator}</span>
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className="px-2 py-0.5 rounded-md bg-white border border-stone-200 text-[10px] font-bold uppercase tracking-wider text-stone-600">
                                  {candidate.suggested_type || "Media"}
                                </span>
                                {candidate.confidence_score != null && (
                                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    {(candidate.confidence_score * 100).toFixed(0)}% match
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Direct Link Action */}
                          {candidate.direct_url && (
                            <div className="pt-2 border-t border-stone-200 flex items-center justify-between">
                              <a
                                href={candidate.direct_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span>Direct Link</span>
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-stone-500">
                          <span>
                            {new Date(job.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {job.processing_time_ms && (
                            <span className="text-[11px] font-mono text-stone-400">
                              ⚡ {(job.processing_time_ms / 1000).toFixed(1)}s
                            </span>
                          )}
                        </div>

                        {job.status === "needs_review" ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => router.push("/review")}
                              className="px-2.5 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 font-semibold text-xs transition-colors"
                            >
                              Review
                            </button>
                            <button
                              onClick={() => handleOneClickAdd(job.id)}
                              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm flex items-center gap-1 transition-all active:scale-95"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Add to Library</span>
                            </button>
                          </div>
                        ) : job.status === "identified" || job.status === "completed" ? (
                          <button
                            onClick={() => router.push("/library")}
                            className="text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1"
                          >
                            <span>In Library</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Screenshot Preview Modal (Interactive Lightbox with Zoom) */}
      <ImageViewerModal
        isOpen={!!previewAssetId}
        onClose={() => {
          setPreviewAssetId(null);
          setPreviewSignedUrl(null);
        }}
        imageUrl={previewSignedUrl}
        title="Original Screenshot Inspection"
      />
    </div>
  );
}
