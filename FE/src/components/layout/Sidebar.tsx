"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Library,
  Image as ImageIcon,
  BookMarked,
  Info,
  LogOut,
  LogIn,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

export const OPEN_MOBILE_NAV_EVENT = "mediamind:open-mobile-nav";

interface SidebarProps {
  pendingReviewCount?: number;
  onOpenUpload?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export function Sidebar({
  pendingReviewCount = 0,
  isMobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const { user, signOut, openAuthModal } = useAuth();
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);

  const mobileOpen = isMobileOpen ?? internalMobileOpen;
  const closeMobile = () => {
    setInternalMobileOpen(false);
    onCloseMobile?.();
  };

  useEffect(() => {
    const handleOpen = () => setInternalMobileOpen(true);
    window.addEventListener(OPEN_MOBILE_NAV_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_MOBILE_NAV_EVENT, handleOpen);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setInternalMobileOpen(false);
        onCloseMobile?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const navItems: NavItem[] = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    {
      label: "My Library",
      href: "/library",
      icon: Library,
      badge: pendingReviewCount > 0 ? pendingReviewCount : undefined,
    },
    { label: "Saved Screenshots", href: "/sources", icon: ImageIcon },
    { label: "About MediaMind", href: "/about", icon: Info },
  ];

  const renderSidebarContent = (isDrawer: boolean) => (
    <>
      <div>
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between gap-3 px-6 border-b border-stone-200/80 bg-white/50">
          <div className="flex items-center gap-3">
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
          {isDrawer && (
            <button
              type="button"
              onClick={closeMobile}
              aria-label="Close navigation menu"
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-200/60 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          )}
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
                onClick={() => {
                  if (isDrawer) closeMobile();
                }}
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

      {/* Footer / User Account */}
      <div className="p-4 border-t border-stone-200/80 bg-white/40 space-y-3">
        {/* User Account / Auth Section */}
        {user ? (
          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-full bg-amber-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-xs">
                {(user.user_metadata?.display_name || user.email || "MM").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 overflow-hidden min-w-0">
                <p className="text-xs font-semibold text-stone-900 truncate">
                  {user.user_metadata?.display_name || user.email?.split("@")[0] || "User"}
                </p>
                <p className="text-[10px] text-stone-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              title="Sign Out"
              className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-1 pt-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-full bg-stone-200 flex items-center justify-center text-xs font-bold text-stone-600 shrink-0">
                MM
              </div>
              <div className="flex-1 overflow-hidden min-w-0">
                <p className="text-xs font-semibold text-stone-900 truncate">Personal Mode</p>
                <p className="text-[10px] text-stone-500 truncate">Sign in to sync</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isDrawer) closeMobile();
                openAuthModal("signin");
              }}
              title="Sign In"
              className="px-2 py-1 rounded-lg text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer flex items-center gap-1"
            >
              <LogIn className="h-3 w-3" />
              <span>In</span>
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-stone-200 bg-[#F7F5F0] text-stone-800 flex-col justify-between h-screen sticky top-0 shrink-0 select-none">
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs"
            onClick={closeMobile}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="relative z-10 w-72 max-w-[85vw] border-r border-stone-200 bg-[#F7F5F0] text-stone-800 flex flex-col justify-between h-full shadow-2xl select-none"
          >
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}
