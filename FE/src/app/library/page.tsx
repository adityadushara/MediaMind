"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { AskLibraryModal } from "@/components/dashboard/AskLibraryModal";
import {
  checkBackendHealth,
  getLibraryItems,
  getLibraryItemDetail,
  updateLibraryItem,
  deleteLibraryItem,
  createLibraryItem,
  getSourceAssets,
  linkSourceToLibraryItem,
  unlinkSourceFromLibraryItem,
  getSubcategories,
  resolveMediaUrl,
} from "@/lib/api";
import { CustomSelect, SelectOption } from "@/components/ui/CustomSelect";
import { ImageViewerModal } from "@/components/ui/ImageViewerModal";
import {
  HealthStatus,
  LibraryItem,
  LibraryItemDetail,
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

const CARD_STATUS_OPTIONS: SelectOption[] = [
  { value: "want_to_consume", label: "Want to Study" },
  { value: "consuming", label: "Reading/Watching" },
  { value: "completed", label: "Finished" },
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

export default function LibraryPage() {
  const router = useRouter();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("all");
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isAskAIOpen, setIsAskAIOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<{ url: string; title: string } | null>(null);

  // Detail Drawer state
  const [selectedItemDetail, setSelectedItemDetail] = useState<LibraryItemDetail | null>(null);
  const [isLinkingOpen, setIsLinkingOpen] = useState(false);
  const [availableSources, setAvailableSources] = useState<SourceAsset[]>([]);
  const [selectedSourceToLink, setSelectedSourceToLink] = useState<string>("");
  const [isLinkingLoading, setIsLinkingLoading] = useState(false);

  // Manual Add Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCreator, setNewCreator] = useState("");
  const [newType, setNewType] = useState<ContentType>("book");
  const [newSubcategory, setNewSubcategory] = useState("");
  const [newDirectUrl, setNewDirectUrl] = useState("");
  const [newStatus, setNewStatus] = useState<ConsumptionStatus>("want_to_consume");
  const [newOverview, setNewOverview] = useState("");

  // Horizontal mouse scroll wheel & drag-to-scroll support for category tabs without scrollbars
  const categoryTabsRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);

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

    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    el.addEventListener("click", handleClickCapture, true);

    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      el.removeEventListener("click", handleClickCapture, true);
    };
  }, []);

  const refreshItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (selectedType !== "all") params.content_type = selectedType;
      if (selectedSubcategory !== "all") params.subcategory = selectedSubcategory;
      if (selectedStatus !== "all") params.consumption_status = selectedStatus;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await getLibraryItems(params);
      setItems(res.items);
    } catch {
      // keep existing
    } finally {
      setIsLoading(false);
    }
  }, [selectedType, selectedSubcategory, selectedStatus, searchQuery, sortBy, sortOrder]);

  useEffect(() => {
    let isSubscribed = true;
    checkBackendHealth().then((h) => {
      if (isSubscribed) setHealth(h);
    });
    return () => {
      isSubscribed = false;
    };
  }, []);

  // Fetch subcategories when content type changes
  useEffect(() => {
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
  }, [selectedType]);

  useEffect(() => {
    let isSubscribed = true;

    async function fetchItems() {
      try {
        const params: Record<string, string> = {
          sort_by: sortBy,
          sort_order: sortOrder,
        };
        if (selectedType !== "all") params.content_type = selectedType;
        if (selectedSubcategory !== "all") params.subcategory = selectedSubcategory;
        if (selectedStatus !== "all") params.consumption_status = selectedStatus;
        if (searchQuery.trim()) params.search = searchQuery.trim();

        const res = await getLibraryItems(params);
        if (isSubscribed) {
          setItems(res.items);
          setIsLoading(false);
        }
      } catch {
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    }

    fetchItems();

    return () => {
      isSubscribed = false;
    };
  }, [selectedType, selectedSubcategory, selectedStatus, searchQuery, sortBy, sortOrder]);

  const handleOpenDetail = async (item: LibraryItem) => {
    setIsLinkingOpen(false);
    try {
      const detail = await getLibraryItemDetail(item.id);
      setSelectedItemDetail(detail);
    } catch {
      setSelectedItemDetail({ ...item, sources: [] });
    }
  };

  const handleLoadAvailableSources = async () => {
    try {
      const res = await getSourceAssets({ limit: 50 });
      setAvailableSources(res.items);
      if (res.items.length > 0) {
        setSelectedSourceToLink(res.items[0].id);
      }
      setIsLinkingOpen(true);
    } catch (e) {
      console.error("Failed to load available sources", e);
    }
  };

  const handleLinkSource = async () => {
    if (!selectedItemDetail || !selectedSourceToLink) return;
    setIsLinkingLoading(true);
    try {
      await linkSourceToLibraryItem(selectedItemDetail.id, selectedSourceToLink);
      const updated = await getLibraryItemDetail(selectedItemDetail.id);
      setSelectedItemDetail(updated);
      setIsLinkingOpen(false);
    } catch (err) {
      alert("Failed to link screenshot: " + String(err));
    } finally {
      setIsLinkingLoading(false);
    }
  };

  const handleUnlinkSource = async (assetId: string) => {
    if (!selectedItemDetail) return;
    if (!confirm("Are you sure you want to unlink this screenshot? The original screenshot remains preserved.")) {
      return;
    }
    try {
      await unlinkSourceFromLibraryItem(selectedItemDetail.id, assetId);
      const updated = await getLibraryItemDetail(selectedItemDetail.id);
      setSelectedItemDetail(updated);
    } catch (err) {
      alert("Failed to unlink screenshot: " + String(err));
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
    if (!confirm("Are you sure you want to remove this item? Original screenshots remain safely in your vault.")) {
      return;
    }
    try {
      await deleteLibraryItem(itemId);
      setItems((prev) => prev.filter((it) => it.id !== itemId));
      if (selectedItemDetail?.id === itemId) {
        setSelectedItemDetail(null);
      }
    } catch (e) {
      console.error("Failed to delete item", e);
    }
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
      setNewOverview("");
    } catch (err) {
      alert("Failed to create item: " + String(err));
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
    <div className="min-h-screen bg-[#FBF9F5] text-stone-900 flex">
      <Sidebar health={health} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenUpload={() => router.push("/upload")}
          onOpenAskAI={() => setIsAskAIOpen(true)}
        />

        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
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
                onClick={() => router.push("/upload")}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-all shadow-sm active:scale-95"
              >
                <ImageIcon className="h-4 w-4" />
                <span>Add from Screenshot</span>
              </button>
            </div>
          </div>

          {/* Primary Category Tabs */}
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
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-lg font-bold text-stone-900">Your library shelf is ready</h3>
                <p className="text-sm text-stone-600">
                  Take a screenshot of any book cover, YouTube video, or movie poster and drop it here. MediaMind will organize it and give you the direct link.
                </p>
              </div>
              <button
                onClick={() => router.push("/upload")}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-sm transition-all"
              >
                <Plus className="h-4 w-4 stroke-[3]" />
                <span>Add Your First Screenshot</span>
              </button>
            </div>
          ) : viewMode === "grid" ? (
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {items.map((item) => {
                const badge = getTypeBadge(item.content_type);
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm hover:shadow-md hover:border-amber-400 transition-all flex flex-col justify-between group space-y-4"
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

                    {/* Direct Link Button (Prominent & Usable by any age) */}
                    <div className="space-y-3 pt-2 border-t border-stone-100">
                      {item.direct_url ? (
                        <a
                          href={item.direct_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-all shadow-sm group/btn"
                        >
                          <span>Open Direct Link</span>
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
                                className="p-0.5 hover:scale-110 transition-transform"
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
                            onClick={() => handleOpenDetail(item)}
                            title="Inspect details & screenshots"
                            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                          >
                            <ImageIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            title="Remove from library"
                            className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
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
                return (
                  <div
                    key={item.id}
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-stone-50/80 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className={`p-2.5 rounded-xl border shrink-0 ${badge.bg}`}>
                        {badge.icon}
                      </div>
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
                        </div>
                        <p className="text-xs text-stone-600 truncate mt-0.5">
                          {item.creator || "Unknown creator"}
                          {item.release_year ? ` • ${item.release_year}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
                      {item.direct_url && (
                        <a
                          href={item.direct_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-colors"
                        >
                          <span>Open Link</span>
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
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
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

              <div className="grid grid-cols-2 gap-3">
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

              <div className="grid grid-cols-2 gap-3">
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
                    Direct Web Link (Optional)
                  </label>
                  <input
                    type="url"
                    value={newDirectUrl}
                    onChange={(e) => setNewDirectUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-sm text-stone-900 focus:outline-none focus:border-amber-600 focus:bg-white"
                  />
                </div>
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
            <button
              onClick={() => setSelectedItemDetail(null)}
              className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100"
            >
              <X className="h-5 w-5" />
            </button>
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

            {selectedItemDetail.direct_url && (
              <a
                href={selectedItemDetail.direct_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-sm transition-all"
              >
                <span>Visit Direct Web Link</span>
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
                <span>Preserved Original Screenshots ({selectedItemDetail.sources.length})</span>
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

            {selectedItemDetail.sources.length === 0 ? (
              <p className="text-xs text-stone-500 italic p-4 bg-stone-50 rounded-xl border border-stone-200 text-center">
                No screenshots linked to this item yet.
              </p>
            ) : (
              <div className="space-y-4">
                {selectedItemDetail.sources.map((src) => (
                  <div key={src.id} className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                    <div className="flex items-center justify-between text-xs text-stone-600 font-semibold">
                      <span className="truncate">{src.file_name}</span>
                      <button
                        onClick={() => handleUnlinkSource(src.id)}
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
        title={viewerImage?.title}
      />
    </div>
  );
}
