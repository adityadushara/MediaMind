"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Library,
  UploadCloud,
  Image as ImageIcon,
  CheckCircle2,
  BookMarked,
  Server,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HealthStatus } from "@/types";

interface SidebarProps {
  health: HealthStatus | null;
  pendingReviewCount?: number;
}

export function Sidebar({ health, pendingReviewCount = 0 }: SidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "My Library", href: "/library", icon: Library },
    { label: "Add Screenshot", href: "/upload", icon: UploadCloud },
    {
      label: "Review Queue",
      href: "/review",
      icon: CheckCircle2,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
    },
    { label: "Saved Screenshots", href: "/sources", icon: ImageIcon },
    { label: "About MediaMind", href: "/about", icon: Info },
  ];

  const isHealthy = health?.status === "healthy";

  return (
    <aside className="w-64 border-r border-stone-200 bg-[#F7F5F0] text-stone-800 flex flex-col justify-between h-screen sticky top-0 shrink-0 select-none">
      <div>
        {/* Brand Header */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-stone-200/80 bg-white/50">
          <div className="h-9 w-9 rounded-xl bg-amber-600 flex items-center justify-center shadow-sm shadow-amber-600/20 text-white">
            <BookMarked className="h-5 w-5" />
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight text-stone-900">MediaMind</span>
            <span className="block text-[11px] text-stone-500 font-medium">
              Study & Media Library
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all",
                  isActive
                    ? "bg-white text-stone-900 shadow-sm border border-stone-200 font-semibold"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn("h-4 w-4", isActive ? "text-amber-600" : "text-stone-500")} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer / System Status */}
      <div className="p-4 border-t border-stone-200/80 bg-white/40 space-y-3">
        <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-stone-100/80 border border-stone-200">
          <div className="flex items-center gap-2 text-stone-600">
            <Server className="h-3.5 w-3.5 text-stone-500" />
            <span className="font-medium text-xs">AI Assistant</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isHealthy ? "bg-emerald-500" : "bg-rose-500"
              )}
            />
            <span
              className={cn(
                "text-xs font-semibold",
                isHealthy ? "text-emerald-700" : "text-rose-600"
              )}
            >
              {isHealthy ? "Ready" : "Offline"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 px-1 pt-1">
          <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-900 border border-amber-200">
            MM
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-semibold text-stone-900 truncate">Personal Library</p>
            <p className="text-[11px] text-stone-500 truncate">Study & Focus Mode</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
