"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { UploadCloud, X, CheckCircle2, AlertCircle, FileText, Loader2, ClipboardPaste } from "lucide-react";
import { uploadScreenshotFiles } from "@/lib/api";

// Must match the upload route's actual limits, otherwise the client lets through
// files the server is guaranteed to reject.
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/bmp",
];
const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");

function describeRejection(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `${file.name}: unsupported format (use PNG, JPG, WebP, AVIF, HEIC, GIF or BMP)`;
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `${file.name}: larger than 15 MB`;
  }
  return null;
}

interface QuickUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export function QuickUploadModal({ isOpen, onClose, onUploadSuccess }: QuickUploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSummary, setUploadSummary] = useState<{
    newCount: number;
    duplicateCount: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate locally so oversized/unsupported files produce an immediate,
  // specific message instead of an opaque server error after uploading.
  const addFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;
    const rejections: string[] = [];
    const accepted: File[] = [];
    for (const file of incoming) {
      const problem = describeRejection(file);
      if (problem) rejections.push(problem);
      else accepted.push(file);
    }

    setSelectedFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
      const merged = [...prev];
      for (const file of accepted) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(file);
        }
      }
      return merged;
    });
    setError(rejections.length > 0 ? rejections.join(" · ") : null);
  }, []);

  // Screenshots are usually pasted, not dragged. Listen while the modal is open
  // so Ctrl+V from the clipboard adds an image directly.
  useEffect(() => {
    if (!isOpen) return;
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files || []).filter((file) =>
        file.type.startsWith("image/")
      );
      if (files.length === 0) return;
      event.preventDefault();
      addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [isOpen, addFiles]);

  // Start each session clean so a closed modal never reopens showing the
  // previous selection or a stale success/error banner.
  const closeAndReset = useCallback(() => {
    if (isUploading) return;
    setSelectedFiles([]);
    setError(null);
    setUploadSummary(null);
    onClose();
  }, [isUploading, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isUploading) {
        closeAndReset();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isUploading, closeAndReset]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
      // Allow re-selecting the same file after removing it.
      e.target.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);
    setError(null);

    try {
      const res = await uploadScreenshotFiles(selectedFiles);
      const duplicateCount = (res.assets || []).filter((a) => a.is_duplicate).length;
      const newCount = Math.max(0, (res.assets?.length ?? res.total_count) - duplicateCount);
      setUploadSummary({ newCount, duplicateCount });
      setSelectedFiles([]);
      setTimeout(() => {
        onUploadSuccess();
        setUploadSummary(null);
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4 animate-in fade-in"
      onClick={closeAndReset}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add Screenshot to Library"
        className="relative w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-stone-900">Add Screenshot to Library</h3>
              <p className="text-xs text-stone-500 font-medium">
                Book, YouTube video, movie, or course
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeAndReset}
            disabled={isUploading}
            aria-label="Close upload modal"
            className="p-1 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer border-2 border-dashed border-amber-300 hover:border-amber-500 hover:bg-amber-50/40 rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-colors bg-[#FAF8F5]"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="p-3.5 rounded-2xl bg-amber-100 text-amber-700 mb-2">
            <UploadCloud className="h-7 w-7" />
          </div>
          <p className="text-sm font-bold text-stone-900">
            Click to browse, drop, or paste a screenshot
          </p>
          <p className="text-xs text-stone-500 mt-1 flex items-center justify-center gap-1">
            <ClipboardPaste className="h-3.5 w-3.5" />
            Press Ctrl/Cmd+V to paste · PNG, JPG, WebP, AVIF, HEIC, GIF, BMP · max 15 MB
          </p>
        </div>

        {/* Selected files preview */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Selected ({selectedFiles.length}):
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {selectedFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                    <span className="font-semibold text-stone-800 truncate">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[11px] text-stone-500 font-mono">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedFiles((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      title={`Remove ${f.name}`}
                      className="p-0.5 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="break-words">{error}</span>
          </div>
        )}

        {/* Success Notification */}
        {uploadSummary !== null && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              {uploadSummary.newCount === 0 && uploadSummary.duplicateCount > 0
                ? `${uploadSummary.duplicateCount} duplicate screenshot${uploadSummary.duplicateCount > 1 ? "s" : ""} already in your vault.`
                : uploadSummary.duplicateCount > 0
                  ? `Added ${uploadSummary.newCount} new screenshot${uploadSummary.newCount > 1 ? "s" : ""} (${uploadSummary.duplicateCount} duplicate skipped). AI is analyzing now.`
                  : `Added ${uploadSummary.newCount} screenshot${uploadSummary.newCount > 1 ? "s" : ""} directly to your Library! AI is analyzing now.`}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={closeAndReset}
            disabled={isUploading}
            className="px-4 py-2 rounded-xl text-stone-600 hover:text-stone-900 text-xs font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selectedFiles.length === 0 || isUploading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <span>Start AI Extraction</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
