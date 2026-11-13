"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import {
  checkBackendHealth,
  getProcessingJobs,
  uploadScreenshotFiles,
  retryProcessingJob,
} from "@/lib/api";
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
} from "lucide-react";

export default function UploadCenterPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStatusTab, setSelectedStatusTab] = useState<string>("all");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);

  // Screenshot Preview Modal
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshJobs = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getProcessingJobs();
      setJobs(data);
    } catch {
      // keep existing
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isSubscribed = true;
    checkBackendHealth().then((h) => {
      if (isSubscribed) setHealth(h);
    });
    return () => {
      isSubscribed = false;
    };
  }, []);

  useEffect(() => {
    let isSubscribed = true;

    async function fetchJobs() {
      try {
        const data = await getProcessingJobs();
        if (isSubscribed) {
          setJobs(data);
          setIsLoading(false);
        }
      } catch {
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    }

    fetchJobs();

    return () => {
      isSubscribed = false;
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
      setUploadError(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
      setUploadError(null);
    }
  };

  const handleStartUpload = async () => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);
    setUploadError(null);

    try {
      const res = await uploadScreenshotFiles(selectedFiles);
      setUploadSuccessMessage(
        `Successfully enqueued ${res.total_count} screenshot${res.total_count > 1 ? "s" : ""}!`
      );
      setSelectedFiles([]);
      await refreshJobs();
      setTimeout(() => setUploadSuccessMessage(null), 3000);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload screenshots");
    } finally {
      setIsUploading(false);
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
      const res = await fetch(`http://localhost:8000/api/v1/assets/${sourceAssetId}/url`);
      if (res.ok) {
        const data = await res.json();
        setPreviewSignedUrl(data.signed_url);
      }
    } catch {
      setPreviewSignedUrl(null);
    }
  };

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case "identified":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3" />
            <span>Identified</span>
          </span>
        );
      case "needs_review":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertCircle className="h-3 w-3" />
            <span>Needs Review</span>
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Processing</span>
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertCircle className="h-3 w-3" />
            <span>Failed</span>
          </span>
        );
      case "unidentified":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700">
            <span>Unidentified</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
            <Clock className="h-3 w-3" />
            <span>Queued</span>
          </span>
        );
    }
  };

  const filteredJobs = jobs.filter((j) => {
    if (selectedStatusTab === "all") return true;
    return j.status === selectedStatusTab;
  });

  const statusTabs = [
    { label: "All Jobs", value: "all", count: jobs.length },
    {
      label: "Needs Review",
      value: "needs_review",
      count: jobs.filter((j) => j.status === "needs_review").length,
    },
    {
      label: "Identified",
      value: "identified",
      count: jobs.filter((j) => j.status === "identified").length,
    },
    {
      label: "Active / Queued",
      value: "queued",
      count: jobs.filter((j) => j.status === "queued" || j.status === "processing").length,
    },
    {
      label: "Failed",
      value: "failed",
      count: jobs.filter((j) => j.status === "failed").length,
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex">
      <Sidebar health={health} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="flex-1 p-8 max-w-7xl w-full mx-auto space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
                <UploadCloud className="h-6 w-6 text-indigo-400" />
                <span>Upload Center & Ingestion Pipeline</span>
              </h1>
              <p className="text-xs text-neutral-400 mt-1">
                Preserve original screenshots, track multimodal extraction jobs, and review batch states.
              </p>
            </div>

            <button
              onClick={refreshJobs}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-xs font-medium text-neutral-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Refresh Jobs</span>
            </button>
          </div>

          {/* Upload Dropzone */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer border-2 border-dashed border-neutral-700 hover:border-indigo-500 rounded-xl p-10 flex flex-col items-center justify-center text-center transition-colors bg-neutral-950/60 hover:bg-neutral-950/90"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileSelect}
              />
              <div className="p-4 rounded-2xl bg-indigo-500/10 text-indigo-400 mb-3 border border-indigo-500/20">
                <FileImage className="h-8 w-8" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">
                Click to browse or drop screenshots here
              </p>
              <p className="text-xs text-neutral-400 max-w-md">
                Upload single images or bulk collections. Original screenshots are preserved immutably with SHA-256 fingerprinting before AI processing.
              </p>
            </div>

            {/* Selected files row & action */}
            {selectedFiles.length > 0 && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-neutral-950 border border-neutral-800">
                <div>
                  <p className="text-xs font-semibold text-white">
                    {selectedFiles.length} file{selectedFiles.length > 1 ? "s" : ""} selected for ingestion
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    Total batch size: {(selectedFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedFiles([])}
                    className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                  >
                    Clear
                  </button>
                  <button
                    disabled={isUploading}
                    onClick={handleStartUpload}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Uploading & Enqueueing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Upload & Process Batch</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Feedback messages */}
            {uploadError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
            {uploadSuccessMessage && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{uploadSuccessMessage}</span>
              </div>
            )}
          </div>

          {/* Processing Jobs Pipeline Tracker */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">Processing Queue & History</h3>
                <p className="text-xs text-neutral-400">
                  Track per-image jobs, model extraction details, and retries.
                </p>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {statusTabs.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setSelectedStatusTab(tab.value)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                      selectedStatusTab === tab.value
                        ? "bg-neutral-800 text-white border border-neutral-700"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-neutral-900 text-neutral-400">
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Jobs Table */}
            {isLoading ? (
              <div className="py-12 text-center text-xs text-neutral-500">Loading jobs...</div>
            ) : filteredJobs.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-neutral-800 rounded-xl space-y-2">
                <Clock className="h-6 w-6 text-neutral-500 mx-auto" />
                <p className="text-xs font-medium text-neutral-400">No processing jobs found</p>
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 divide-y divide-neutral-800/60 overflow-hidden">
                {filteredJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-800/30 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-lg bg-neutral-800 border border-neutral-700/60 shrink-0">
                        <FileImage className="h-4 w-4 text-neutral-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-medium text-neutral-200 truncate">
                            Job {job.id.substring(0, 8)}...
                          </span>
                          {getStatusBadge(job.status)}
                        </div>
                        <p className="text-[11px] text-neutral-500 font-mono mt-0.5 truncate">
                          Asset ID: {job.source_asset_id} • Enqueued: {new Date(job.created_at).toLocaleTimeString()}
                        </p>
                        {job.error_message && (
                          <p className="text-xs text-rose-400 mt-1 font-mono">
                            Error: {job.error_message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => handleOpenPreview(job.source_asset_id)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
                        title="Preview original screenshot"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Inspect Screenshot</span>
                      </button>

                      {(job.status === "failed" || job.status === "unidentified") && (
                        <button
                          disabled={retryingJobId === job.id}
                          onClick={() => handleRetry(job.id)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:bg-rose-500/30 text-xs font-medium transition-colors"
                        >
                          <RotateCcw className={`h-3.5 w-3.5 ${retryingJobId === job.id ? "animate-spin" : ""}`} />
                          <span>Retry</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Screenshot Preview Modal */}
      {previewAssetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-neutral-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div>
                <h4 className="text-base font-semibold text-white">Original Screenshot Preview</h4>
                <p className="text-xs font-mono text-neutral-400">Asset: {previewAssetId}</p>
              </div>
              <button
                onClick={() => {
                  setPreviewAssetId(null);
                  setPreviewSignedUrl(null);
                }}
                className="p-1 text-neutral-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl overflow-hidden bg-black border border-neutral-800 flex items-center justify-center min-h-[300px] max-h-[500px]">
              {previewSignedUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewSignedUrl}
                  alt="Original Screenshot"
                  className="w-full h-auto max-h-[500px] object-contain"
                />
              ) : (
                <div className="p-8 text-center text-xs text-neutral-500 space-y-2">
                  <FileImage className="h-8 w-8 mx-auto text-neutral-600" />
                  <p>Screenshot stored in private storage.</p>
                  <p className="text-[10px] font-mono text-neutral-600">Access protected by signed URLs.</p>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 text-xs text-neutral-400">
              <span className="font-mono text-[11px]">Non-destructive original preservation</span>
              <button
                onClick={() => {
                  setPreviewAssetId(null);
                  setPreviewSignedUrl(null);
                }}
                className="px-4 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
