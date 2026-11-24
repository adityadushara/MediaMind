"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { AskLibraryModal } from "@/components/dashboard/AskLibraryModal";
import { QuickUploadModal } from "@/components/dashboard/QuickUploadModal";
import { describeDirectLink } from "@/lib/links";
import {
  getLibraryItems,
  getLibraryItemDetail,
  updateLibraryItem,
  deleteLibraryItem,
  createLibraryItem,
  getSourceAssets,
  linkSourceToLibraryItem,
  unlinkSourceFromLibraryItem,
  getSubcategories,
  peekCachedList,
  resolveMediaUrl,
  verifyLibraryItem,
} from "@/lib/api";
import { CustomSelect, SelectOption } from "@/components/ui/CustomSelect";
import { ImageViewerModal } from "@/components/ui/ImageViewerModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/context/AuthContext";
import {
  LibraryItem,
  LibraryItemDetail,
  LibraryItemListResponse,
  ContentType,
  ConsumptionStatus,
  SourceAsset,
} from "@/types";
import {
  BookOpen,
  Film,
  Tv,
  Video,
  Podcast,
  GraduationCap,
  Newspaper,
  Mail,
  Folder,
  LayoutGrid,
  List,
  Star,
  Image as ImageIcon,
  ExternalLink,
  Trash2,
  X,
  Filter,
  Plus,
  CheckCircle2,
  Clock,
  Bookmark,
  PauseCircle,
  XCircle,
  Link2,
  Unlink,
  Tag,
  ArrowUpDown,
  ZoomIn,
  Check,
  Edit3,
  Sparkles,
  Loader2,
} from "lucide-react";

const STATUS_FILTER_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Statuses" },
  { value: "want_to_consume", label: "Want to Study/Watch", icon: <Bookmark className="h-3.5 w-3.5 text-orange-600" /> },
  { value: "consuming", label: "Reading/Watching", icon: <Clock className="h-3.5 w-3.5 text-blue-600" /> },
  { value: "completed", label: "Completed", icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> },
  { value: "on_hold", label: "On Hold", icon: <PauseCircle className="h-3.5 w-3.5 text-amber-600" /> },
  { value: "dropped", label: "Dropped", icon: <XCircle className="h-3.5 w-3.5 text-stone-400" /> },
];

const SORT_OPTIONS: SelectOption[] = [
  { value: "created_at", label: "Date Added" },
  { value: "title", label: "Title" },
  { value: "user_rating", label: "My Rating" },
];

// Human verification states, kept separate from AI confidence. "Needs Review"
// is where uncertain AI matches live until the user confirms them.
const VERIFICATION_FILTER_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Entries" },
  { value: "needs_review", label: "Needs Review", icon: <Sparkles className="h-3.5 w-3.5 text-amber-600" /> },
  { value: "unverified", label: "AI Analyzing", icon: <Loader2 className="h-3.5 w-3.5 text-stone-500" /> },
  { value: "auto_accepted", label: "AI Accepted", icon: <Check className="h-3.5 w-3.5 text-blue-600" /> },
  { value: "verified", label: "Verified", icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> },
  { value: "manual_entry", label: "Manual Entry", icon: <Edit3 className="h-3.5 w-3.5 text-stone-500" /> },
];

const CARD_STATUS_OPTIONS: SelectOption[] = [
  { value: "want_to_consume", label: "Want to Study/Watch" },
  { value: "consuming", label: "Reading/Watching" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "dropped", label: "Dropped" },
];

const CONTENT_TYPE_SELECT_OPTIONS: SelectOption[] = [
  { value: "book", label: "📚 Book" },
  { value: "youtube_video", label: "▶️ YouTube Video" },
  { value: "movie", label: "🎬 Movie" },
  { value: "tv_show", label: "📺 TV Show" },
  { value: "course", label: "🎓 Course" },
  { value: "podcast", label: "🎙️ Podcast" },
  { value: "article", label: "📰 Substack & Article" },
  { value: "newsletter", label: "✉️ Newsletter" },
  { value: "other", label: "📁 Other" },
];

function MediaItemThumbnail({
  item,
  onInspect,
  viewMode = "grid",
  badge,
}: {
  item: LibraryItem;
  onInspect: () => void;
  viewMode?: "grid" | "list";
  badge: { icon: React.ReactNode; label: string; bg: string };
}) {
  const primaryUrl = item.cover_image_url || item.screenshot_url || "";
  const fallbackUrl =
    item.screenshot_url && item.screenshot_url !== item.cover_image_url
      ? item.screenshot_url
      : "";

  const [src, setSrc] = useState<string>(resolveMediaUrl(primaryUrl));
  const [triedFallback, setTriedFallback] = useState(false);
  const [failed, setFailed] = useState(!primaryUrl);
  const [syncedPrimary, setSyncedPrimary] = useState(primaryUrl);

  // Reset derived image state when the item's media changes. Adjusting state
  // during render is the recommended alternative to a cascading effect.
  if (syncedPrimary !== primaryUrl) {
    setSyncedPrimary(primaryUrl);
    setSrc(resolveMediaUrl(primaryUrl));
    setTriedFallback(false);
    setFailed(!primaryUrl);
  }

  const handleError = () => {
    if (!triedFallback && fallbackUrl) {
      setTriedFallback(true);
      setSrc(resolveMediaUrl(fallbackUrl));
    } else {
      setFailed(true);
    }
  };

  // An item with no preserved screenshot has nothing to inspect; offering
  // "Zoom Image" there opened an empty viewer.
  const hasImage = !failed && Boolean(src);

  if (viewMode === "list") {
    return (
      <div
        onClick={hasImage ? onInspect : undefined}
        className={`h-16 w-16 rounded-xl overflow-hidden border border-stone-200 bg-stone-100 shrink-0 relative flex items-center justify-center shadow-2xs ${
          hasImage ? "cursor-pointer group/listthumb" : ""
        }`}
        title={hasImage ? "Click to view full screenshot" : undefined}
      >
        {hasImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt={item.title}
            referrerPolicy="no-referrer"
            onError={handleError}
            className="w-full h-full object-cover group-hover/listthumb:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="p-2 items-center justify-center text-stone-400">
            {badge.icon}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={hasImage ? onInspect : undefined}
      className={`relative w-full h-48 rounded-xl overflow-hidden bg-stone-100 border border-stone-200/90 mb-3 flex items-center justify-center shadow-2xs ${
        hasImage ? "cursor-pointer group/thumb" : ""
      }`}
      title={hasImage ? "Click to view full screenshot & inspect" : undefined}
    >
      {hasImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={item.title}
          referrerPolicy="no-referrer"
          onError={handleError}
          className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
        />
      ) : null}

      <div
        className={`${
          hasImage ? "hidden" : "flex"
        } flex-col items-center justify-center gap-1.5 text-stone-400 p-4 text-center`}
      >
        <div className={`p-3 rounded-2xl border ${badge.bg}`}>
          {badge.icon}
        </div>
        <span className="text-[11px] font-semibold text-stone-500">
          {badge.label}
        </span>
      </div>

      {hasImage && (
        <div className="absolute inset-0 bg-stone-900/0 group-hover/thumb:bg-stone-900/20 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover/thumb:opacity-100 transition-opacity px-3 py-1.5 rounded-lg bg-stone-900/85 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md backdrop-blur-xs">
            <ZoomIn className="h-3.5 w-3.5" />
            <span>Zoom Image</span>
          </span>
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>(() => {
    // Seed from the cached list so the shelf paints on the first frame. Deep
    // links with filters skip the seed to avoid flashing unfiltered rows.
    if (typeof window === "undefined") return [];
    if (window.location.search.replace(/^\?/, "").length > 0) return [];
    const cached = peekCachedList<LibraryItemListResponse>("/api/v1/library?");
    return Array.isArray(cached?.items) ? cached.items : [];
  });
  const [isLoading, setIsLoading] = useState(
    () => peekCachedList<LibraryItemListResponse>("/api/v1/library?") === null
  );
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("all");
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedVerification, setSelectedVerification] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [urlParamsReady, setUrlParamsReady] = useState(false);
  const fetchSeqRef = useRef(0);
  const [isAskAIOpen, setIsAskAIOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<{
    url: string;
    fallbackUrl?: string;
    title: string;
  } | null>(null);

  // Detail Drawer state
  const [selectedItemDetail, setSelectedItemDetail] = useState<LibraryItemDetail | null>(null);
  const [isLinkingOpen, setIsLinkingOpen] = useState(false);
  const [availableSources, setAvailableSources] = useState<SourceAsset[]>([]);
  const [selectedSourceToLink, setSelectedSourceToLink] = useState<string>("");
  const [isLinkingLoading, setIsLinkingLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Manual Add Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCreator, setNewCreator] = useState("");
  const [newType, setNewType] = useState<ContentType>("book");
  const [newSubcategory, setNewSubcategory] = useState("");
  const [newDirectUrl, setNewDirectUrl] = useState("");
  const [newStatus, setNewStatus] = useState<ConsumptionStatus>("want_to_consume");
  const [newOverview, setNewOverview] = useState("");

  // Edit Item Modal state
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCreator, setEditCreator] = useState("");
  const [editType, setEditType] = useState<ContentType>("book");
  const [editSubcategory, setEditSubcategory] = useState("");
  const [editDirectUrl, setEditDirectUrl] = useState("");
  const [editStatus, setEditStatus] = useState<ConsumptionStatus>("want_to_consume");
  const [editOverview, setEditOverview] = useState("");
  const [editRating, setEditRating] = useState<number>(0);
  const [isUpdating, setIsUpdating] = useState(false);

  // Horizontal mouse scroll wheel & drag-to-scroll support for category tabs without scrollbars
  const categoryTabsRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  // Category tabs overflow horizontally on narrower screens with no visible
  // scrollbar, which hid whole content types. Track the edges to show arrows.
  const [tabScroll, setTabScroll] = useState({ left: false, right: false });

  useEffect(() => {
    const el = categoryTabsRef.current;
    if (!el) return;

    // Mouse wheel horizontal scrolling
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        const canScrollRight = e.deltaY > 0 && el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
        const canScrollLeft = e.deltaY < 0 && el.scrollLeft > 0;

        if (canScrollRight || canScrollLeft) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      }
    };

    // Drag-to-scroll (mouse & touch-like cursor gesture)
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      isDraggingRef.current = true;
      hasDraggedRef.current = false;
      startXRef.current = e.pageX - el.offsetLeft;
      scrollLeftRef.current = el.scrollLeft;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const x = e.pageX - el.offsetLeft;
      const walk = x - startXRef.current;
      if (Math.abs(walk) > 5) {
        hasDraggedRef.current = true;
      }
      if (hasDraggedRef.current) {
        e.preventDefault();
        el.scrollLeft = scrollLeftRef.current - walk;
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    // Prevent tab button click when user is dragging to scroll
    const handleClickCapture = (e: MouseEvent) => {
      if (hasDraggedRef.current) {
        e.stopPropagation();
        e.preventDefault();
        hasDraggedRef.current = false;
      }
    };

    const updateScrollHints = () => {
      const maxLeft = el.scrollWidth - el.clientWidth;
      setTabScroll({
        left: el.scrollLeft > 1,
        right: maxLeft > 1 && el.scrollLeft < maxLeft - 1,
      });
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("mousedown", handleMouseDown);
    el.addEventListener("scroll", updateScrollHints, { passive: true });
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("resize", updateScrollHints);
    el.addEventListener("click", handleClickCapture, true);
    updateScrollHints();

    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("mousedown", handleMouseDown);
      el.removeEventListener("scroll", updateScrollHints);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("resize", updateScrollHints);
      el.removeEventListener("click", handleClickCapture, true);
    };
    // The tabs only exist once AuthGuard renders its children, so re-attach
    // when the authenticated user becomes available.
  }, [user]);

  const refreshItems = useCallback(async (options?: { silent?: boolean }) => {
    if (!user) return;
    const seq = ++fetchSeqRef.current;
    // Polling must not flash the full-page spinner over content the user is
    // reading, so background refreshes skip the loading state.
    if (!options?.silent) setIsLoading(true);
    try {
      const params: Record<string, string> = {
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (selectedType !== "all") params.content_type = selectedType;
      if (selectedSubcategory !== "all") params.subcategory = selectedSubcategory;
      if (selectedStatus !== "all") params.consumption_status = selectedStatus;
      if (selectedVerification !== "all") params.verification_status = selectedVerification;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await getLibraryItems(params);
      if (seq === fetchSeqRef.current) {
        setItems(Array.isArray(res?.items) ? res.items : []);
      }
    } catch {
      // keep existing
    } finally {
      if (!options?.silent && seq === fetchSeqRef.current) setIsLoading(false);
    }
  }, [
    user,
    selectedType,
    selectedSubcategory,
    selectedStatus,
    selectedVerification,
    searchQuery,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      queueMicrotask(() => setUrlParamsReady(true));
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const shouldOpenUpload = params.get("upload") === "true";
    const urlSearch = params.get("search");
    const urlVerification = params.get("verification_status");
    // Defer to a microtask: opening the dialog and applying deep-link filters
    // are side effects triggered by the URL, not synchronous render derivations.
    queueMicrotask(() => {
      if (shouldOpenUpload) setIsUploadOpen(true);
      if (urlSearch) setSearchQuery(urlSearch);
      if (urlVerification) setSelectedVerification(urlVerification);
      setUrlParamsReady(true);
    });
  }, []);

  // Fetch subcategories when content type changes
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      queueMicrotask(() => setSubcategories([]));
      return;
    }
    let isSubscribed = true;
    const typeParam = selectedType !== "all" ? selectedType : undefined;
    getSubcategories(typeParam).then((subs) => {
      if (isSubscribed) {
        setSubcategories(subs);
      }
    }).catch(() => {});
    return () => {
      isSubscribed = false;
    };
  }, [selectedType, user, isAuthLoading]);

  useEffect(() => {
    if (!urlParamsReady || isAuthLoading) return;
    if (!user) {
      queueMicrotask(() => {
        setItems([]);
        setSelectedItemDetail(null);
        setIsLoading(false);
      });
      return;
    }

    let isSubscribed = true;
    const seq = ++fetchSeqRef.current;

    async function fetchItems() {
      try {
        const params: Record<string, string> = {
          sort_by: sortBy,
          sort_order: sortOrder,
        };
        if (selectedType !== "all") params.content_type = selectedType;
        if (selectedSubcategory !== "all") params.subcategory = selectedSubcategory;
        if (selectedStatus !== "all") params.consumption_status = selectedStatus;
        if (selectedVerification !== "all") params.verification_status = selectedVerification;
        if (searchQuery.trim()) params.search = searchQuery.trim();

        const res = await getLibraryItems(params);
        if (isSubscribed && seq === fetchSeqRef.current) {
          setItems(Array.isArray(res?.items) ? res.items : []);
          setIsLoading(false);
        }
      } catch {
        if (isSubscribed && seq === fetchSeqRef.current) {
          setIsLoading(false);
        }
      }
    }

    fetchItems();

    return () => {
      isSubscribed = false;
    };
  }, [
    urlParamsReady,
    isAuthLoading,
    user,
    selectedType,
    selectedSubcategory,
    selectedStatus,
    selectedVerification,
    searchQuery,
    sortBy,
    sortOrder,
  ]);

  const hasActiveFilters =
    selectedType !== "all" ||
    selectedSubcategory !== "all" ||
    selectedStatus !== "all" ||
    selectedVerification !== "all" ||
    searchQuery.trim() !== "";

  // Newly uploaded placeholders stay "unverified" until the AI worker finishes.
  // Poll so the card swaps from "Analyzing" to its result without a reload.
  const hasUnverifiedItems = items.some(
    (item) => item.verification_status === "unverified"
  );
  useEffect(() => {
    if (isAuthLoading || !user || !hasUnverifiedItems) return;
    const timer = setInterval(() => {
      refreshItems({ silent: true });
    }, 6000);
    return () => clearInterval(timer);
  }, [hasUnverifiedItems, refreshItems, user, isAuthLoading]);

  const handleOpenDetail = async (item: LibraryItem) => {
    setIsLinkingOpen(false);
    try {
      const detail = await getLibraryItemDetail(item.id);
      setSelectedItemDetail(detail);
    } catch {
      setSelectedItemDetail({ ...item, sources: [] });
    }
  };

  // Confirming a match is a human action recorded separately from AI
  // confidence, so it lives in the evidence drawer next to the original.
  const handleVerifyItem = async () => {
    if (!selectedItemDetail) return;
    setIsVerifying(true);
    try {
      const updated = await verifyLibraryItem(selectedItemDetail.id);
      setSelectedItemDetail((prev) => (prev ? { ...prev, ...updated } : prev));
      setItems((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
      );
      showToast("Marked as verified.");
    } catch (err) {
      showToast(
        "Failed to verify: " + (err instanceof Error ? err.message : String(err)),
        "error"
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLoadAvailableSources = async () => {
    try {
      const res = await getSourceAssets({ limit: 50 });
      const rawSources = res?.items || [];
      // Screenshots already attached to this item must not be offered again;
      // picking one used to fail with an opaque 500.
      const linkedIds = new Set(
        (selectedItemDetail?.sources || []).map((source) => source.id)
      );
      const linkable = (Array.isArray(rawSources) ? rawSources : []).filter(
        (source) => !linkedIds.has(source.id)
      );
      setAvailableSources(linkable);
      if (linkable.length === 0) {
        showToast("Every saved screenshot is already attached to this item.", "error");
        return;
      }
      if (linkable.length > 0) {
        setSelectedSourceToLink(linkable[0].id);
      }
      setIsLinkingOpen(true);
    } catch (e) {
      console.error("Failed to load available sources", e);
    }
  };

  // Delete Confirmation & Toast state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "item" | "unlink";
    id: string;
    title: string;
    assetId?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleLinkSource = async () => {
    if (!selectedItemDetail || !selectedSourceToLink) return;
    setIsLinkingLoading(true);
    try {
      await linkSourceToLibraryItem(selectedItemDetail.id, selectedSourceToLink);
      const updated = await getLibraryItemDetail(selectedItemDetail.id);
      setSelectedItemDetail(updated);
      setIsLinkingOpen(false);
      showToast("Screenshot successfully linked to item.");
    } catch (err) {
      showToast("Failed to link screenshot: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setIsLinkingLoading(false);
    }
  };

  const promptUnlinkSource = (assetId: string) => {
    if (!selectedItemDetail) return;
    setDeleteTarget({
      type: "unlink",
      id: selectedItemDetail.id,
      title: selectedItemDetail.title,
      assetId,
    });
  };

  const promptDeleteItem = (itemId: string, itemTitle: string) => {
    setDeleteTarget({
      type: "item",
      id: itemId,
      title: itemTitle,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.type === "item") {
        await deleteLibraryItem(deleteTarget.id);
        setItems((prev) => prev.filter((it) => it.id !== deleteTarget.id));
        if (selectedItemDetail?.id === deleteTarget.id) {
          setSelectedItemDetail(null);
        }
        showToast(`"${deleteTarget.title}" was removed from your library.`);
      } else if (deleteTarget.type === "unlink" && deleteTarget.assetId) {
        await unlinkSourceFromLibraryItem(deleteTarget.id, deleteTarget.assetId);
        const updated = await getLibraryItemDetail(deleteTarget.id);
        setSelectedItemDetail(updated);
        showToast("Screenshot unlinked successfully.");
      }
      setDeleteTarget(null);
    } catch (err) {
      showToast("Operation failed: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (itemId: string, newStatusVal: ConsumptionStatus) => {
    try {
      await updateLibraryItem(itemId, { consumption_status: newStatusVal });
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, consumption_status: newStatusVal } : it))
      );
      if (selectedItemDetail?.id === itemId) {
        setSelectedItemDetail((prev) => (prev ? { ...prev, consumption_status: newStatusVal } : null));
      }
    } catch (e) {
      console.error("Failed to update status", e);
    }
  };

  const handleRatingChange = async (itemId: string, rating: number) => {
    try {
      await updateLibraryItem(itemId, { user_rating: rating });
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, user_rating: rating } : it))
      );
      if (selectedItemDetail?.id === itemId) {
        setSelectedItemDetail((prev) => (prev ? { ...prev, user_rating: rating } : null));
      }
    } catch (e) {
      console.error("Failed to update rating", e);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    promptDeleteItem(itemId, item?.title || "this item");
  };

  const handleCreateManualItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const created = await createLibraryItem({
        title: newTitle.trim(),
        creator: newCreator.trim() || undefined,
        content_type: newType,
        subcategory: newSubcategory.trim() || undefined,
        direct_url: newDirectUrl.trim() || undefined,
        consumption_status: newStatus,
        overview: newOverview.trim() || undefined,
      });
      setItems((prev) => [created, ...prev]);
      setIsAddModalOpen(false);
      setNewTitle("");
      setNewCreator("");
      setNewSubcategory("");
      setNewDirectUrl("");
      setNewStatus("want_to_consume");
      setNewOverview("");
      showToast(`"${created.title}" added to your library!`);
    } catch (err) {
      showToast("Failed to create item: " + (err instanceof Error ? err.message : String(err)), "error");
    }
  };

  const handleOpenEdit = (item: LibraryItem) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditCreator(item.creator || "");
    setEditType(item.content_type);
    setEditSubcategory(item.subcategory || "");
    setEditDirectUrl(item.direct_url || "");
    setEditStatus(item.consumption_status);
    setEditOverview(item.overview || "");
    setEditRating(item.user_rating || 0);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editTitle.trim()) return;

    setIsUpdating(true);
    try {
      const updated = await updateLibraryItem(editingItem.id, {
        title: editTitle.trim(),
        creator: editCreator.trim() || null,
        content_type: editType,
        subcategory: editSubcategory.trim() || null,
        direct_url: editDirectUrl.trim() || null,
        consumption_status: editStatus,
        overview: editOverview.trim() || null,
        user_rating: editRating > 0 ? editRating : null,
        verification_status: "verified",
      });
      setItems((prev) =>
        prev.map((it) =>
          it.id === editingItem.id
            ? {
                ...it,
                ...updated,
                screenshot_url: updated.screenshot_url ?? it.screenshot_url,
              }
            : it
        )
      );
      if (selectedItemDetail?.id === editingItem.id) {
        setSelectedItemDetail((prev) =>
          prev
            ? {
                ...prev,
                ...updated,
                screenshot_url: updated.screenshot_url ?? prev.screenshot_url,
              }
            : null
        );
      }
      setEditingItem(null);
      showToast(`"${updated.title}" updated successfully.`);
    } catch (err) {
      showToast("Failed to update item: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const getTypeBadge = (type: ContentType) => {
    switch (type) {
      case "book":
        return {
          icon: <BookOpen className="h-3.5 w-3.5 text-amber-800" />,
          label: "Book",
          bg: "bg-amber-100 text-amber-900 border-amber-300",
        };
      case "youtube_video":
        return {
          icon: <Video className="h-3.5 w-3.5 text-red-700" />,
          label: "YouTube",
          bg: "bg-red-100 text-red-800 border-red-200",
        };
      case "movie":
        return {
          icon: <Film className="h-3.5 w-3.5 text-purple-700" />,
          label: "Movie",
          bg: "bg-purple-100 text-purple-800 border-purple-200",
        };
      case "tv_show":
        return {
          icon: <Tv className="h-3.5 w-3.5 text-blue-700" />,
          label: "TV Show",
          bg: "bg-blue-100 text-blue-800 border-blue-200",
        };
      case "course":
        return {
          icon: <GraduationCap className="h-3.5 w-3.5 text-emerald-800" />,
          label: "Course",
          bg: "bg-emerald-100 text-emerald-900 border-emerald-300",
        };
      case "podcast":
        return {
          icon: <Podcast className="h-3.5 w-3.5 text-orange-800" />,
          label: "Podcast",
          bg: "bg-orange-100 text-orange-900 border-orange-200",
        };
      case "article":
        return {
          icon: <Newspaper className="h-3.5 w-3.5 text-orange-700" />,
          label: "Substack / Article",
          bg: "bg-orange-100 text-orange-900 border-orange-300",
        };
      case "newsletter":
        return {
          icon: <Mail className="h-3.5 w-3.5 text-sky-700" />,
          label: "Newsletter",
          bg: "bg-sky-100 text-sky-900 border-sky-300",
        };
      default:
        return {
          icon: <Folder className="h-3.5 w-3.5 text-stone-700" />,
          label: "Media",
          bg: "bg-stone-100 text-stone-800 border-stone-200",
        };
    }
  };

  const typeTabs: { label: string; value: string; emoji: string }[] = [
    { label: "All Items", value: "all", emoji: "📁" },
    { label: "Books", value: "book", emoji: "📚" },
    { label: "YouTube Videos", value: "youtube_video", emoji: "▶️" },
    { label: "Movies & Cinema", value: "movie", emoji: "🎬" },
    { label: "TV Shows", value: "tv_show", emoji: "📺" },
    { label: "Online Courses", value: "course", emoji: "🎓" },
    { label: "Podcasts", value: "podcast", emoji: "🎙️" },
    { label: "Substack & Articles", value: "article", emoji: "📰" },
    { label: "Newsletters", value: "newsletter", emoji: "✉️" },
  ];

  return (
    <AuthGuard featureName="My Media Library">
      <div className="min-h-screen bg-[#FBF9F5] text-stone-900 flex">
      <Sidebar onOpenUpload={() => setIsUploadOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenUpload={() => setIsUploadOpen(true)}
          onOpenAskAI={() => setIsAskAIOpen(true)}
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

          {/* Header & Primary Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-stone-900">
                My Media Library
              </h1>
              <p className="text-sm text-stone-600 mt-1">
                Your personal collection of books, YouTube videos, and movies with instant links and topic categories.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-sm font-semibold transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Manual Entry</span>
              </button>

              <button
                onClick={() => setIsUploadOpen(true)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <ImageIcon className="h-4 w-4" />
                <span>Add from Screenshot</span>
              </button>
            </div>
          </div>

          {/* Primary Category Tabs */}
          <div className="relative">
            <div
              ref={categoryTabsRef}
              className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none no-scrollbar overscroll-contain select-none cursor-grab active:cursor-grabbing"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {typeTabs.map((tab) => {
                const isActive = selectedType === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => {
                      setSelectedType(tab.value);
                      setSelectedSubcategory("all");
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap shrink-0 border ${
                      isActive
                        ? "bg-amber-700 text-white border-amber-700 shadow-sm"
                        : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100 hover:text-stone-900"
                    }`}
                  >
                    <span>{tab.emoji}</span>
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {tabScroll.left && (
              <button
                type="button"
                onClick={() => categoryTabsRef.current?.scrollBy({ left: -320, behavior: "smooth" })}
                aria-label="Scroll categories left"
                className="absolute left-0 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white border border-stone-200 shadow-md flex items-center justify-center text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                <span aria-hidden="true">‹</span>
              </button>
            )}
            {tabScroll.right && (
              <button
                type="button"
                onClick={() => categoryTabsRef.current?.scrollBy({ left: 320, behavior: "smooth" })}
                aria-label="Scroll categories right"
                className="absolute right-0 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white border border-stone-200 shadow-md flex items-center justify-center text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                <span aria-hidden="true">›</span>
              </button>
            )}
          </div>

          {/* Subcategory / Topic Filter Pills */}
          {subcategories.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-white border border-stone-200 shadow-sm space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-stone-500">
                <Tag className="h-3.5 w-3.5 text-amber-600" />
                <span>Topic & Subcategory Filter:</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSelectedSubcategory("all")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                    selectedSubcategory === "all"
                      ? "bg-stone-900 text-white border-stone-900 shadow-sm"
                      : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-200"
                  }`}
                >
                  All Topics
                </button>
                {subcategories.map((subcat) => {
                  const isSubActive = selectedSubcategory === subcat;
                  return (
                    <button
                      key={subcat}
                      onClick={() => setSelectedSubcategory(subcat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                        isSubActive
                          ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                          : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-200 hover:text-stone-900"
                      }`}
                    >
                      {subcat}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filter Bar (Status & View Mode) */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm py-1">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Status:</span>
                <CustomSelect
                  value={selectedStatus}
                  onChange={(val) => setSelectedStatus(val)}
                  options={STATUS_FILTER_OPTIONS}
                  size="sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Sort:</span>
                <CustomSelect
                  value={sortBy}
                  onChange={(val) => setSortBy(val)}
                  options={SORT_OPTIONS}
                  size="sm"
                />
                <button
                  type="button"
                  onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                  title={sortOrder === "asc" ? "Ascending — click for descending" : "Descending — click for ascending"}
                  aria-label={sortOrder === "asc" ? "Sort ascending" : "Sort descending"}
                  className="p-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Review:</span>
                <CustomSelect
                  value={selectedVerification}
                  onChange={(val) => setSelectedVerification(val)}
                  options={VERIFICATION_FILTER_OPTIONS}
                  size="sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200 shadow-2xs">
              <button
                onClick={() => setViewMode("grid")}
                title="Grid view"
                className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-500 hover:text-stone-900"
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                title="List view"
                className={`p-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  viewMode === "list"
                    ? "bg-white text-stone-900 shadow-xs"
                    : "text-stone-500 hover:text-stone-900"
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Library Content */}
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-stone-500 space-y-3">
              <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium">Opening your library...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center rounded-2xl bg-white border border-stone-200 p-8 shadow-sm space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700">
                <BookOpen className="h-7 w-7" />
              </div>
              {hasActiveFilters ? (
                <>
                  <div className="max-w-md mx-auto space-y-1">
                    <h3 className="text-lg font-bold text-stone-900">
                      Nothing matches these filters
                    </h3>
                    <p className="text-sm text-stone-600">
                      {selectedVerification === "needs_review"
                        ? "Nothing is waiting for review right now. Every identified item has been confirmed."
                        : "Adjust the filters or search term to see other items in your library."}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedType("all");
                      setSelectedSubcategory("all");
                      setSelectedStatus("all");
                      setSelectedVerification("all");
                      setSearchQuery("");
                      // Drop deep-link params too, otherwise a reload re-applies them.
                      if (typeof window !== "undefined") {
                        window.history.replaceState({}, "", "/library");
                      }
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 font-bold text-sm shadow-sm transition-all cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                    <span>Clear Filters</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="max-w-md mx-auto space-y-1">
                    <h3 className="text-lg font-bold text-stone-900">
                      Your library shelf is ready
                    </h3>
                    <p className="text-sm text-stone-600">
                      Take a screenshot of any book cover, YouTube video, or movie poster and drop it here. MediaMind will organize it and give you the direct link.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsUploadOpen(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="h-4 w-4 stroke-[3]" />
                    <span>Add Your First Screenshot</span>
                  </button>
                </>
              )}
            </div>
          ) : viewMode === "grid" ? (
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {items.map((item) => {
                const badge = getTypeBadge(item.content_type);
                const linkInfo = describeDirectLink(item.direct_url);

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-stone-200 hover:border-amber-400 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group space-y-4"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${badge.bg}`}>
                            {badge.icon}
                            <span>{badge.label}</span>
                          </span>
                          {item.subcategory && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-stone-100 text-stone-700 border border-stone-200">
                              {item.subcategory}
                            </span>
                          )}
                          {item.verification_status === "needs_review" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                              <Sparkles className="h-3 w-3" />
                              Needs Review
                            </span>
                          )}
                          {item.verification_status === "unverified" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-stone-100 text-stone-600 border border-stone-300">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Analyzing
                            </span>
                          )}
                        </div>

                        <CustomSelect
                          value={item.consumption_status}
                          onChange={(val) =>
                            handleStatusChange(item.id, val as ConsumptionStatus)
                          }
                          options={CARD_STATUS_OPTIONS}
                          size="xs"
                        />
                      </div>

                      {/* Real Cover Photo / Focused Thumbnail with Fail-Safe Screenshot Fallback */}
                      <MediaItemThumbnail
                        item={item}
                        onInspect={() =>
                          setViewerImage({
                            url: item.screenshot_url || item.cover_image_url || "",
                            fallbackUrl:
                              item.screenshot_url &&
                              item.cover_image_url &&
                              item.screenshot_url !== item.cover_image_url
                                ? item.cover_image_url
                                : undefined,
                            title: item.title,
                          })
                        }
                        viewMode="grid"
                        badge={badge}
                      />

                      {/* Title & Creator */}
                      <h4
                        onClick={() => handleOpenDetail(item)}
                        className="font-bold text-base text-stone-900 group-hover:text-amber-800 cursor-pointer line-clamp-2 transition-colors leading-snug"
                        title={item.title}
                      >
                        {item.title}
                      </h4>
                      <p className="text-xs font-semibold text-stone-600 line-clamp-1 mt-1">
                        {item.creator || "Unknown author/creator"}
                        {item.release_year ? ` (${item.release_year})` : ""}
                      </p>

                      {item.overview && (
                        <p className="text-xs text-stone-500 line-clamp-2 mt-2 leading-relaxed">
                          {item.overview}
                        </p>
                      )}
                    </div>

                    {/* Direct Link Button */}
                    <div className="space-y-3 pt-2 border-t border-stone-100">
                      {item.direct_url ? (
                        <a
                          href={item.direct_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-all shadow-sm group/btn"
                        >
                          <span>{linkInfo.label}</span>
                          <ExternalLink className="h-3.5 w-3.5 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                        </a>
                      ) : (
                        <div className="text-[11px] text-stone-400 italic text-center py-1">
                          No direct link available
                        </div>
                      )}

                      {/* Footer: Rating & Actions */}
                      <div className="flex items-center justify-between text-xs pt-1">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((starVal) => {
                            const currentStars = item.user_rating ? Math.round(item.user_rating / 2) : 0;
                            const isFilled = starVal <= currentStars;
                            return (
                              <button
                                key={starVal}
                                onClick={() => handleRatingChange(item.id, starVal * 2)}
                                className="p-0.5 hover:scale-110 transition-transform cursor-pointer"
                                title={`Rate ${starVal * 2}/10`}
                              >
                                <Star
                                  className={`h-3.5 w-3.5 ${
                                    isFilled
                                      ? "text-amber-500 fill-amber-500"
                                      : "text-stone-300 hover:text-amber-400"
                                  }`}
                                />
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            title="Edit details"
                            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setViewerImage({
                                url: item.screenshot_url || item.cover_image_url || "",
                                fallbackUrl:
                                  item.screenshot_url &&
                                  item.cover_image_url &&
                                  item.screenshot_url !== item.cover_image_url
                                    ? item.cover_image_url
                                    : undefined,
                                title: item.title,
                              })
                            }
                            title="Inspect screenshot"
                            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
                          >
                            <ImageIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            title="Remove from library"
                            className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List View */
            <div className="rounded-2xl border border-stone-200 bg-white divide-y divide-stone-100 overflow-hidden shadow-sm">
              {items.map((item) => {
                const badge = getTypeBadge(item.content_type);
                const linkInfo = describeDirectLink(item.direct_url);

                return (
                  <div
                    key={item.id}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-stone-50/80 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {/* Real Photo Thumbnail */}
                      <MediaItemThumbnail
                        item={item}
                        onInspect={() =>
                          setViewerImage({
                            url: item.screenshot_url || item.cover_image_url || "",
                            fallbackUrl:
                              item.screenshot_url &&
                              item.cover_image_url &&
                              item.screenshot_url !== item.cover_image_url
                                ? item.cover_image_url
                                : undefined,
                            title: item.title,
                          })
                        }
                        viewMode="list"
                        badge={badge}
                      />

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            onClick={() => handleOpenDetail(item)}
                            className="font-bold text-sm text-stone-900 hover:text-amber-700 cursor-pointer truncate"
                          >
                            {item.title}
                          </span>
                          {item.subcategory && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                              {item.subcategory}
                            </span>
                          )}
                          {item.verification_status === "needs_review" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300">
                              <Sparkles className="h-3 w-3" />
                              Needs Review
                            </span>
                          )}
                          {item.verification_status === "unverified" && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-300">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Analyzing
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-600 truncate mt-0.5">
                          {item.creator || "Unknown creator"}
                          {item.release_year ? ` • ${item.release_year}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 self-end md:self-auto flex-wrap">
                      {item.direct_url && (
                        <a
                          href={item.direct_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-colors"
                        >
                          <span>{linkInfo.isSearch ? linkInfo.label : "Open Link"}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}

                      <CustomSelect
                        value={item.consumption_status}
                        onChange={(val) =>
                          handleStatusChange(item.id, val as ConsumptionStatus)
                        }
                        options={CARD_STATUS_OPTIONS}
                        size="xs"
                      />

                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        title="Edit details"
                        className="p-1.5 rounded-lg text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        title="Remove from library"
                        className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Manual Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <Plus className="h-5 w-5 text-amber-600" />
                <span>Manual Media Entry</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualItem} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Atomic Habits, Inception, or Python Tutorial"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Author / Creator
                  </label>
                  <input
                    type="text"
                    value={newCreator}
                    onChange={(e) => setNewCreator(e.target.value)}
                    placeholder="e.g. James Clear"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <CustomSelect
                    value={newType}
                    onChange={(val) => setNewType(val as ContentType)}
                    options={CONTENT_TYPE_SELECT_OPTIONS}
                    size="md"
                    className="w-full"
                    buttonClassName="w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Subcategory / Topic
                  </label>
                  <input
                    type="text"
                    value={newSubcategory}
                    onChange={(e) => setNewSubcategory(e.target.value)}
                    placeholder="e.g. Psychology, Habits, Money"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <CustomSelect
                    value={newStatus}
                    onChange={(val) => setNewStatus(val as ConsumptionStatus)}
                    options={CARD_STATUS_OPTIONS}
                    size="md"
                    className="w-full"
                    buttonClassName="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Direct Web Link (Optional)
                </label>
                <input
                  type="text"
                  value={newDirectUrl}
                  onChange={(e) => setNewDirectUrl(e.target.value)}
                  placeholder="https://... or www.example.com"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Notes / Overview
                </label>
                <textarea
                  rows={2}
                  value={newOverview}
                  onChange={(e) => setNewOverview(e.target.value)}
                  placeholder="Key thoughts or notes..."
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-stone-600 hover:text-stone-900 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold shadow-sm"
                >
                  Save to Library
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-amber-600" />
                <span>Edit Library Item</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="e.g. Atomic Habits, Inception, or Python Tutorial"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Author / Creator
                  </label>
                  <input
                    type="text"
                    value={editCreator}
                    onChange={(e) => setEditCreator(e.target.value)}
                    placeholder="e.g. James Clear"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <CustomSelect
                    value={editType}
                    onChange={(val) => setEditType(val as ContentType)}
                    options={CONTENT_TYPE_SELECT_OPTIONS}
                    size="md"
                    className="w-full"
                    buttonClassName="w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Subcategory / Topic
                  </label>
                  <input
                    type="text"
                    value={editSubcategory}
                    onChange={(e) => setEditSubcategory(e.target.value)}
                    placeholder="e.g. Psychology, Habits, Money"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                    Status
                  </label>
                  <CustomSelect
                    value={editStatus}
                    onChange={(val) => setEditStatus(val as ConsumptionStatus)}
                    options={CARD_STATUS_OPTIONS}
                    size="md"
                    className="w-full"
                    buttonClassName="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Direct Web Link
                </label>
                <input
                  type="text"
                  value={editDirectUrl}
                  onChange={(e) => setEditDirectUrl(e.target.value)}
                  placeholder="https://... or www.example.com"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  My Rating
                </label>
                <div className="flex items-center gap-1.5 py-1">
                  {[1, 2, 3, 4, 5].map((starVal) => {
                    const currentStars = editRating ? Math.round(editRating / 2) : 0;
                    const isFilled = starVal <= currentStars;
                    return (
                      <button
                        type="button"
                        key={starVal}
                        onClick={() => setEditRating(starVal * 2)}
                        className="p-1 hover:scale-110 transition-transform cursor-pointer"
                        title={`Rate ${starVal * 2}/10`}
                      >
                        <Star
                          className={`h-5 w-5 ${
                            isFilled
                              ? "text-amber-500 fill-amber-500"
                              : "text-stone-300 hover:text-amber-400"
                          }`}
                        />
                      </button>
                    );
                  })}
                  {editRating > 0 && (
                    <span className="text-xs font-bold text-stone-600 ml-2">
                      {editRating}/10
                    </span>
                  )}
                  {editRating > 0 && (
                    <button
                      type="button"
                      onClick={() => setEditRating(0)}
                      className="text-xs text-stone-400 hover:text-stone-600 ml-1 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Notes / Overview
                </label>
                <textarea
                  rows={3}
                  value={editOverview}
                  onChange={(e) => setEditOverview(e.target.value)}
                  placeholder="Key thoughts, notes, or takeaways..."
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  disabled={isUpdating}
                  className="px-4 py-2 rounded-xl text-stone-600 hover:text-stone-900 text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail & Evidence Drawer */}
      {selectedItemDetail && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-white border-l border-stone-200 shadow-2xl p-6 overflow-y-auto space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-stone-200">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                Item Inspection & Evidence
              </span>
              <h2 className="text-xl font-bold text-stone-900 mt-0.5">{selectedItemDetail.title}</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => promptDeleteItem(selectedItemDetail.id, selectedItemDetail.title)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                title="Delete item"
              >
                <Trash2 className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedItemDetail(null)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Details & Link */}
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                {selectedItemDetail.content_type.toUpperCase()}
              </span>
              {selectedItemDetail.subcategory && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-stone-100 text-stone-800 border border-stone-200">
                  {selectedItemDetail.subcategory}
                </span>
              )}
              <span className="text-xs text-stone-500 font-medium">
                {selectedItemDetail.creator || "Unknown creator"}
              </span>
            </div>

            {selectedItemDetail.verification_status === "needs_review" && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI match needs your review
                </p>
                <p className="text-xs text-amber-800">
                  Check the identified title against the preserved screenshot below before
                  trusting it. Confirming records your verification separately from the AI
                  confidence.
                </p>
                <button
                  type="button"
                  onClick={handleVerifyItem}
                  disabled={isVerifying}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-400 text-amber-900 text-xs font-bold hover:bg-amber-100 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isVerifying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  <span>Confirm as verified</span>
                </button>
              </div>
            )}

            {selectedItemDetail.direct_url && (
              <a
                href={selectedItemDetail.direct_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-sm transition-all"
              >
                <span>
                  {describeDirectLink(selectedItemDetail.direct_url, "Visit Direct Web Link").label}
                </span>
                <ExternalLink className="h-4 w-4" />
              </a>
            )}

            {selectedItemDetail.overview && (
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-sm text-stone-700 leading-relaxed">
                <p className="font-semibold text-xs text-stone-500 uppercase tracking-wider mb-1">
                  Overview Clue:
                </p>
                {selectedItemDetail.overview}
              </div>
            )}
          </div>

          {/* Screenshot Vault Proof */}
          <div className="space-y-3 pt-3 border-t border-stone-200">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-amber-600" />
                <span>Preserved Original Screenshots ({(selectedItemDetail.sources || []).length})</span>
              </h4>
              <button
                type="button"
                onClick={handleLoadAvailableSources}
                className="text-xs text-amber-700 hover:text-amber-800 font-bold"
              >
                + Attach Screenshot
              </button>
            </div>

            {isLinkingOpen && (
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
                <span className="text-xs font-bold text-stone-800">Select Existing Screenshot:</span>
                <CustomSelect
                  value={selectedSourceToLink}
                  onChange={(val) => setSelectedSourceToLink(val)}
                  options={availableSources.map((s) => ({
                    value: s.id,
                    label: `${s.file_name} (${s.image_width || "?"}×${s.image_height || "?"}px)`,
                  }))}
                  size="sm"
                  className="w-full"
                  buttonClassName="w-full"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLinkingOpen(false)}
                    className="px-3 py-1 text-xs text-stone-600 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleLinkSource}
                    disabled={isLinkingLoading}
                    className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Attach
                  </button>
                </div>
              </div>
            )}

            {(selectedItemDetail.sources || []).length === 0 ? (
              <p className="text-xs text-stone-500 italic p-4 bg-stone-50 rounded-xl border border-stone-200 text-center">
                No screenshots linked to this item yet.
              </p>
            ) : (
              <div className="space-y-4">
                {(selectedItemDetail.sources || []).map((src) => (
                  <div key={src.id} className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                    <div className="flex items-center justify-between text-xs text-stone-600 font-semibold">
                      <span className="truncate">{src.file_name}</span>
                      <button
                        type="button"
                        onClick={() => promptUnlinkSource(src.id)}
                        className="text-stone-400 hover:text-rose-600 p-1 cursor-pointer"
                        title="Unlink"
                      >
                        <Unlink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {src.signed_url && (
                      <div
                        onClick={() => setViewerImage({ url: src.signed_url || "", title: src.file_name })}
                        className="rounded-xl overflow-hidden border border-stone-200 bg-white cursor-pointer group/img relative"
                        title="Click to inspect full resolution screenshot"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolveMediaUrl(src.signed_url)}
                          alt={src.file_name}
                          className="w-full object-contain max-h-72 group-hover/img:scale-[1.01] transition-transform"
                        />
                        <div className="absolute inset-0 bg-stone-900/0 group-hover/img:bg-stone-900/10 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover/img:opacity-100 transition-opacity px-3 py-1.5 rounded-lg bg-stone-900/80 text-white text-xs font-semibold backdrop-blur-xs flex items-center gap-1.5">
                            <ZoomIn className="h-3.5 w-3.5" />
                            <span>Click to Zoom & Inspect</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Ask Your Library AI Modal */}
      <AskLibraryModal
        isOpen={isAskAIOpen}
        onClose={() => setIsAskAIOpen(false)}
      />
      {/* Fullscreen Image Viewer Lightbox */}
      <ImageViewerModal
        isOpen={!!viewerImage}
        onClose={() => setViewerImage(null)}
        imageUrl={viewerImage?.url}
        fallbackUrl={viewerImage?.fallbackUrl}
        title={viewerImage?.title}
      />

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
        title={
          deleteTarget?.type === "item"
            ? "Remove Item from Library?"
            : "Unlink Screenshot?"
        }
        description={
          deleteTarget?.type === "item" ? (
            <div className="space-y-2">
              <p>
                Are you sure you want to remove{" "}
                <span className="font-semibold text-stone-900">
                  &lsquo;{deleteTarget.title}&rsquo;
                </span>{" "}
                from your library?
              </p>
              <p className="text-[11px] text-stone-500">
                Your original screenshots remain safely preserved in your vault and can be reviewed again anytime.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p>
                Are you sure you want to unlink this screenshot from{" "}
                <span className="font-semibold text-stone-900">
                  &lsquo;{deleteTarget?.title}&rsquo;
                </span>
                ?
              </p>
              <p className="text-[11px] text-stone-500">
                The original screenshot will remain safely preserved in your vault.
              </p>
            </div>
          )
        }
        confirmText={
          deleteTarget?.type === "item" ? "Remove Item" : "Unlink Screenshot"
        }
        variant={deleteTarget?.type === "item" ? "danger" : "warning"}
        icon={deleteTarget?.type === "item" ? "trash" : "unlink"}
        isLoading={isDeleting}
      />

      {/* Quick Screenshot Upload Modal */}
      <QuickUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={refreshItems}
      />
    </div>
    </AuthGuard>
  );
}
