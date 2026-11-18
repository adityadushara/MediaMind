"use client";

import React, { useEffect } from "react";
import { AlertTriangle, Trash2, X, Loader2, Unlink } from "lucide-react";

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  icon?: "trash" | "unlink" | "warning";
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Delete",
  cancelText = "Cancel",
  variant = "danger",
  icon = "trash",
  isLoading = false,
}: ConfirmModalProps) {
  // Lock body scroll when modal is active
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

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const renderIcon = () => {
    if (icon === "unlink") {
      return <Unlink className="h-5 w-5" />;
    }
    if (icon === "warning" || variant === "warning") {
      return <AlertTriangle className="h-5 w-5" />;
    }
    return <Trash2 className="h-5 w-5" />;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => {
        if (!isLoading) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors disabled:opacity-50 cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 md:p-7">
          {/* Header with Icon Badge */}
          <div className="flex items-center gap-3.5 mb-4">
            <div
              className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                variant === "danger"
                  ? "bg-rose-50 border border-rose-200/80 text-rose-600"
                  : variant === "warning"
                  ? "bg-amber-50 border border-amber-200/80 text-amber-600"
                  : "bg-stone-100 border border-stone-200 text-stone-700"
              }`}
            >
              {renderIcon()}
            </div>
            <div>
              <h3
                id="confirm-modal-title"
                className="text-base font-bold text-stone-900 leading-snug"
              >
                {title}
              </h3>
              <span className="text-[11px] font-semibold tracking-wide uppercase text-stone-400">
                {variant === "danger" ? "Action Confirmation" : "Confirmation Required"}
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="text-xs md:text-sm text-stone-600 leading-relaxed mb-6">
            {description}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 active:bg-stone-100 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {cancelText}
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-5 py-2.5 rounded-xl text-xs font-semibold text-white shadow-xs transition-all active:scale-98 disabled:opacity-60 cursor-pointer flex items-center gap-2 ${
                variant === "danger"
                  ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                  : variant === "warning"
                  ? "bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
                  : "bg-stone-900 hover:bg-stone-800"
              }`}
            >
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{confirmText}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
