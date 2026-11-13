"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Library,
  UploadCloud,
  CheckCircle2,
  BarChart3,
  Settings,
  Sparkles,
  Server,
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
    { label: "Library", href: "/library", icon: Library },
    { label: "Upload Center", href: "/upload", icon: UploadCloud },
    {
      label: "Review Center",
      href: "/review",
      icon: CheckCircle2,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
    },
    { label: "Analytics", href: "/analytics", icon: BarChart3 },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  const isHealthy = health?.status === "healthy";

  return (
    <aside className="w-64 border-r border-neutral-800 bg-neutral-950 text-neutral-100 flex flex-col justify-between h-screen sticky top-0">
      <div>
        {/* Brand Header */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-neutral-800">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="font-semibold text-lg tracking-tight text-white">MediaMind</span>
            <span className="block text-[10px] text-neutral-400 uppercase tracking-widest font-mono">
              AI Library
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-neutral-800/80 text-white shadow-sm"
                    : "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn("h-4 w-4", isActive ? "text-indigo-400" : "text-neutral-400")} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer / System Status */}
      <div className="p-4 border-t border-neutral-800/80 space-y-3">
        <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-neutral-900/60 border border-neutral-800">
          <div className="flex items-center gap-2 text-neutral-400">
            <Server className="h-3.5 w-3.5" />
            <span className="font-mono text-[11px]">API Backend</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isHealthy ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-rose-500"
              )}
            />
            <span
              className={cn(
                "font-mono text-[11px] font-medium",
                isHealthy ? "text-emerald-400" : "text-rose-400"
              )}
            >
              {isHealthy ? "Online" : "Offline"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 px-2 pt-1">
          <div className="h-8 w-8 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-semibold text-neutral-300 border border-neutral-700">
            MM
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-medium text-neutral-200 truncate">Alex Developer</p>
            <p className="text-[11px] text-neutral-500 truncate">dev@mediamind.local</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
