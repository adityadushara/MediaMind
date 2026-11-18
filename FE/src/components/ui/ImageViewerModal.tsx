"use client";

import React, { useState, useEffect } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, ExternalLink, ImageOff } from "lucide-react";
import { resolveMediaUrl } from "@/lib/api";

interface ImageViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string | null;
  altText?: string;
  title?: string;
}

export function ImageViewerModal({
  isOpen,
  onClose,
  imageUrl,
  altText = "Screenshot Preview",
  title = "Screenshot Inspection",
}: ImageViewerModalProps) {
  const [zoom, setZoom] = useState(1);
  const [hasError, setHasError] = useState(false);
  const [prevImageUrl, setPrevImageUrl] = useState(imageUrl);

  if (imageUrl !== prevImageUrl) {
    setPrevImageUrl(imageUrl);
    setZoom(1);
    setHasError(false);
  }

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  const resolvedSrc = resolveMediaUrl(imageUrl);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => setZoom(1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl w-full max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden border border-stone-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Toolbar */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-stone-200 bg-stone-50">
          <div className="min-w-0 pr-4">
            <h3 className="text-sm font-bold text-stone-900 truncate">{title}</h3>
            <p className="text-xs text-stone-500 truncate">
              Inspect original pixel details & visual evidence
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Zoom Controls */}
            <div className="flex items-center bg-white border border-stone-200 rounded-xl p-1 shadow-2xs mr-2">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
                title="Zoom Out"
                className="p-1 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-[11px] font-mono font-bold text-stone-600 px-2 select-none min-w-[42px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
                title="Zoom In"
                className="p-1 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                title="Reset Zoom"
                className="p-1 ml-1 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Open Raw in New Tab */}
            <a
              href={resolvedSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold shadow-2xs transition-colors"
              title="Open full resolution in new tab"
            >
              <span>Open Raw</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-200/80 transition-colors cursor-pointer ml-1"
              title="Close viewer (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Image Display Canvas */}
        <div className="relative flex-1 overflow-auto p-4 flex items-center justify-center bg-stone-100/70 min-h-[350px] max-h-[78vh]">
          {hasError ? (
            <div className="p-8 text-center space-y-3 max-w-sm">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <ImageOff className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-stone-900">
                Image could not be loaded
              </h4>
              <p className="text-xs text-stone-500">
                The requested asset file might not exist in local storage or the backend is offline.
              </p>
              <div className="pt-2 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHasError(false)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Retry Loading
                </button>
                <a
                  href={resolvedSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-amber-700 hover:underline font-semibold"
                >
                  Inspect asset link: {resolvedSrc}
                </a>
              </div>
            </div>
          ) : (
            <div
              className="transition-transform duration-100 ease-out flex items-center justify-center"
              style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolvedSrc}
                alt={altText}
                referrerPolicy="no-referrer"
                onError={() => setHasError(true)}
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-xl shadow-md border border-stone-200/60 bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
