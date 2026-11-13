"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, X, CheckCircle2, AlertCircle, FileText, Loader2 } from "lucide-react";
import { uploadScreenshotFiles } from "@/lib/api";

interface QuickUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export function QuickUploadModal({ isOpen, onClose, onUploadSuccess }: QuickUploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);
    setError(null);

    try {
      const res = await uploadScreenshotFiles(selectedFiles);
      setSuccessCount(res.total_count);
      setSelectedFiles([]);
      setTimeout(() => {
        onUploadSuccess();
        onClose();
        setSuccessCount(null);
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-2xl space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div>
            <h3 className="text-lg font-semibold text-white">Upload Media Screenshot</h3>
            <p className="text-xs text-neutral-400">
              Upload single or batch screenshots of books, movies, videos, or courses.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drag and drop zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer border-2 border-dashed border-neutral-700 hover:border-indigo-500 rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors bg-neutral-950/40 hover:bg-neutral-950/70"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="p-3 rounded-full bg-neutral-800 mb-3 text-neutral-300">
            <UploadCloud className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-white mb-1">
            Click to upload or drag and drop
          </p>
          <p className="text-xs text-neutral-500">
            PNG, JPG or WebP (max 15MB each). Original preserved immutably.
          </p>
        </div>

        {/* Selected files preview */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase text-neutral-400">
              Selected ({selectedFiles.length})
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {selectedFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-neutral-800/60 border border-neutral-800"
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                    <span className="truncate text-neutral-200">{file.name}</span>
                  </div>
                  <span className="text-[11px] text-neutral-500 font-mono shrink-0">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error / Success messages */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successCount !== null && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Successfully enqueued {successCount} screenshot{successCount > 1 ? "s" : ""}!
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedFiles.length === 0 || isUploading}
            onClick={handleSubmit}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <span>Start Ingestion</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
