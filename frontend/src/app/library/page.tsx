"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import {
  checkBackendHealth,
  getLibraryItems,
  getLibraryItemDetail,
  updateLibraryItem,
  deleteLibraryItem,
  createLibraryItem,
} from "@/lib/api";
import {
  HealthStatus,
  LibraryItem,
  LibraryItemDetail,
  ContentType,
  ConsumptionStatus,
} from "@/types";
import {
  BookOpen,
  Film,
  Tv,
  Video,
  Podcast,
  GraduationCap,
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
  RefreshCw,
  Bookmark,
  PauseCircle,
  XCircle,
} from "lucide-react";

export default function LibraryPage() {
  const router = useRouter();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Detail Drawer state
  const [selectedItemDetail, setSelectedItemDetail] = useState<LibraryItemDetail | null>(null);

  // Manual Add Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCreator, setNewCreator] = useState("");
  const [newType, setNewType] = useState<ContentType>("book");
  const [newStatus, setNewStatus] = useState<ConsumptionStatus>("want_to_consume");
  const [newOverview, setNewOverview] = useState("");

  const refreshItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (selectedType !== "all") params.content_type = selectedType;
      if (selectedStatus !== "all") params.consumption_status = selectedStatus;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await getLibraryItems(params);
      setItems(res.items);
    } catch {
      // keep existing
    } finally {
      setIsLoading(false);
    }
  }, [selectedType, selectedStatus, searchQuery]);

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

    async function fetchItems() {
      try {
        const params: Record<string, string> = {};
        if (selectedType !== "all") params.content_type = selectedType;
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
  }, [selectedType, selectedStatus, searchQuery]);

  const handleOpenDetail = async (item: LibraryItem) => {
    try {
      const detail = await getLibraryItemDetail(item.id);
      setSelectedItemDetail(detail);
    } catch {
      setSelectedItemDetail({ ...item, sources: [] });
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
    if (!confirm("Are you sure you want to remove this item from your library? Original screenshots will remain preserved.")) {
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
        consumption_status: newStatus,
        overview: newOverview.trim() || undefined,
      });
      setItems((prev) => [created, ...prev]);
      setIsAddModalOpen(false);
      setNewTitle("");
      setNewCreator("");
      setNewOverview("");
    } catch (err) {
      alert("Failed to create item: " + String(err));
    }
  };

  const getTypeIcon = (type: ContentType) => {
    switch (type) {
      case "book":
        return <BookOpen className="h-4 w-4 text-emerald-400" />;
      case "movie":
        return <Film className="h-4 w-4 text-rose-400" />;
      case "tv_show":
        return <Tv className="h-4 w-4 text-purple-400" />;
      case "youtube_video":
        return <Video className="h-4 w-4 text-red-400" />;
      case "podcast":
        return <Podcast className="h-4 w-4 text-amber-400" />;
      case "course":
        return <GraduationCap className="h-4 w-4 text-blue-400" />;
      default:
        return <BookOpen className="h-4 w-4 text-neutral-400" />;
    }
  };

  const typeTabs: { label: string; value: string }[] = [
    { label: "All Items", value: "all" },
    { label: "Books", value: "book" },
    { label: "Movies", value: "movie" },
    { label: "TV Shows", value: "tv_show" },
    { label: "Videos", value: "youtube_video" },
    { label: "Podcasts", value: "podcast" },
    { label: "Courses", value: "course" },
  ];

  const statusFilters: { label: string; value: string; icon: React.ElementType }[] = [
    { label: "All Statuses", value: "all", icon: Filter },
    { label: "Want to Consume", value: "want_to_consume", icon: Bookmark },
    { label: "Consuming", value: "consuming", icon: Clock },
    { label: "Completed", value: "completed", icon: CheckCircle2 },
    { label: "On Hold", value: "on_hold", icon: PauseCircle },
    { label: "Dropped", value: "dropped", icon: XCircle },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex">
      <Sidebar health={health} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenUpload={() => router.push("/upload")}
        />

        <main className="flex-1 p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Media Library</h1>
              <p className="text-xs text-neutral-400 mt-1">
                Browse, filter, and manage your verified personal media catalog.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={refreshItems}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-xs font-medium text-neutral-300 transition-colors"
                title="Refresh library items"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>

              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-white transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Item Manually</span>
              </button>

              <div className="flex items-center border border-neutral-800 rounded-lg p-0.5 bg-neutral-900">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-md ${
                    viewMode === "grid" ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-md ${
                    viewMode === "list" ? "bg-neutral-800 text-white" : "text-neutral-400 hover:text-white"
                  }`}
                  title="List View"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Type Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {typeTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSelectedType(tab.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedType === tab.value
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                    : "bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Status Sub-Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-neutral-500 font-medium mr-1">Status:</span>
            {statusFilters.map((st) => {
              const Icon = st.icon;
              return (
                <button
                  key={st.value}
                  onClick={() => setSelectedStatus(st.value)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    selectedStatus === st.value
                      ? "bg-neutral-800 text-neutral-100 border border-neutral-700"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span>{st.label}</span>
                </button>
              );
            })}
          </div>

          {/* Items Display */}
          {isLoading ? (
            <div className="py-20 text-center text-sm text-neutral-500">Loading library items...</div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-neutral-800 rounded-xl space-y-3">
              <BookOpen className="h-8 w-8 text-neutral-500 mx-auto" />
              <p className="text-sm font-medium text-neutral-300">No media items match your filters</p>
              <p className="text-xs text-neutral-500">
                Try selecting a different filter or add new content from screenshots.
              </p>
            </div>
          ) : viewMode === "grid" ? (
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-900/80 transition-all p-4 flex flex-col justify-between space-y-3 group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2 rounded-lg bg-neutral-800 border border-neutral-700/60">
                        {getTypeIcon(item.content_type)}
                      </div>
                      <select
                        value={item.consumption_status}
                        onChange={(e) =>
                          handleStatusChange(item.id, e.target.value as ConsumptionStatus)
                        }
                        className="text-[11px] font-medium bg-neutral-800 border border-neutral-700 rounded-md px-2 py-0.5 text-neutral-300 focus:outline-none"
                      >
                        <option value="want_to_consume">Want to Consume</option>
                        <option value="consuming">Consuming</option>
                        <option value="completed">Completed</option>
                        <option value="on_hold">On Hold</option>
                        <option value="dropped">Dropped</option>
                      </select>
                    </div>

                    <h4
                      onClick={() => handleOpenDetail(item)}
                      className="font-semibold text-sm text-white group-hover:text-indigo-300 cursor-pointer line-clamp-1 transition-colors"
                      title={item.title}
                    >
                      {item.title}
                    </h4>
                    <p className="text-xs text-neutral-400 line-clamp-1 mt-0.5">
                      {item.creator || "Unknown creator"}
                      {item.release_year ? ` (${item.release_year})` : ""}
                    </p>
                    {item.overview && (
                      <p className="text-[11px] text-neutral-500 line-clamp-2 mt-2">
                        {item.overview}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((starVal) => {
                        const currentStars = item.user_rating ? Math.round(item.user_rating / 2) : 0;
                        const isFilled = starVal <= currentStars;
                        return (
                          <button
                            key={starVal}
                            onClick={() => handleRatingChange(item.id, starVal * 2)}
                            className="p-0.5"
                            title={`Rate ${starVal * 2}/10`}
                          >
                            <Star
                              className={`h-3 w-3 ${
                                isFilled
                                  ? "text-amber-400 fill-amber-400"
                                  : "text-neutral-600 hover:text-amber-400"
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenDetail(item)}
                        title="View details & original screenshot"
                        className="p-1 rounded text-neutral-400 hover:text-white transition-colors"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        title="Delete from library"
                        className="p-1 rounded text-neutral-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* List View */
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 divide-y divide-neutral-800/60 overflow-hidden">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-4 flex items-center justify-between hover:bg-neutral-900/70 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="p-2.5 rounded-lg bg-neutral-800 border border-neutral-700/60 shrink-0">
                      {getTypeIcon(item.content_type)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          onClick={() => handleOpenDetail(item)}
                          className="font-semibold text-sm text-white hover:text-indigo-300 cursor-pointer truncate"
                        >
                          {item.title}
                        </span>
                        <span className="text-xs text-neutral-500 uppercase font-mono">
                          {item.content_type.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400 truncate">
                        {item.creator || "Unknown creator"}
                        {item.release_year ? ` • ${item.release_year}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <select
                      value={item.consumption_status}
                      onChange={(e) =>
                        handleStatusChange(item.id, e.target.value as ConsumptionStatus)
                      }
                      className="text-xs font-medium bg-neutral-800 border border-neutral-700 rounded-md px-2.5 py-1 text-neutral-200 focus:outline-none"
                    >
                      <option value="want_to_consume">Want to Consume</option>
                      <option value="consuming">Consuming</option>
                      <option value="completed">Completed</option>
                      <option value="on_hold">On Hold</option>
                      <option value="dropped">Dropped</option>
                    </select>

                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                      <span className="text-xs font-medium text-neutral-300">
                        {item.user_rating ? item.user_rating.toFixed(1) : "—"}
                      </span>
                    </div>

                    <button
                      onClick={() => handleOpenDetail(item)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                      title="Inspect details & original screenshot"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 transition-colors"
                      title="Delete item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Item Detail & Original Screenshot Slide-over Drawer */}
      {selectedItemDetail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-neutral-900 border-l border-neutral-800 h-full p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-start justify-between pb-3 border-b border-neutral-800">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="p-1.5 rounded bg-neutral-800">
                      {getTypeIcon(selectedItemDetail.content_type)}
                    </span>
                    <span className="text-xs uppercase font-mono text-neutral-400">
                      {selectedItemDetail.content_type.replace("_", " ")}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white">{selectedItemDetail.title}</h3>
                  <p className="text-xs text-neutral-400">
                    {selectedItemDetail.creator || "Unknown creator"}
                    {selectedItemDetail.release_year ? ` • ${selectedItemDetail.release_year}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedItemDetail(null)}
                  className="p-1 text-neutral-400 hover:text-white rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Status and Rating */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-neutral-950/60 border border-neutral-800">
                <div>
                  <label className="text-[10px] uppercase font-mono text-neutral-400 block mb-1">
                    Consumption Status
                  </label>
                  <select
                    value={selectedItemDetail.consumption_status}
                    onChange={(e) =>
                      handleStatusChange(selectedItemDetail.id, e.target.value as ConsumptionStatus)
                    }
                    className="w-full text-xs font-medium bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-200"
                  >
                    <option value="want_to_consume">Want to Consume</option>
                    <option value="consuming">Consuming</option>
                    <option value="completed">Completed</option>
                    <option value="on_hold">On Hold</option>
                    <option value="dropped">Dropped</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-neutral-400 block mb-1">
                    Rating (0 - 10)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="10"
                    value={selectedItemDetail.user_rating || ""}
                    onChange={(e) =>
                      handleRatingChange(selectedItemDetail.id, parseFloat(e.target.value) || 0)
                    }
                    className="w-full text-xs bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-200"
                    placeholder="Rate..."
                  />
                </div>
              </div>

              {/* Overview */}
              {selectedItemDetail.overview && (
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold uppercase font-mono text-neutral-400">Overview</h4>
                  <p className="text-xs leading-relaxed text-neutral-300 bg-neutral-950/40 p-3 rounded-lg border border-neutral-800">
                    {selectedItemDetail.overview}
                  </p>
                </div>
              )}

              {/* Original Screenshot Evidence */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase font-mono text-neutral-400 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Preserved Source Screenshots ({selectedItemDetail.sources.length})</span>
                </h4>
                {selectedItemDetail.sources.length === 0 ? (
                  <p className="text-xs text-neutral-500 italic p-3 bg-neutral-950/40 rounded-lg border border-neutral-800">
                    This item was created manually without a linked screenshot asset.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedItemDetail.sources.map((src) => (
                      <div
                        key={src.id}
                        className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs text-neutral-400">
                          <span className="font-mono truncate">{src.file_name}</span>
                          <span className="text-[10px] font-mono shrink-0">
                            {src.image_width}x{src.image_height} • {(src.file_size_bytes / 1024).toFixed(0)} KB
                          </span>
                        </div>
                        {src.signed_url && (
                          <div className="relative rounded-lg overflow-hidden border border-neutral-800 bg-black">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={src.signed_url}
                              alt={src.file_name}
                              className="w-full h-auto max-h-64 object-contain mx-auto"
                            />
                          </div>
                        )}
                        <p className="text-[10px] text-neutral-500 font-mono truncate">
                          SHA256: {src.sha256_hash}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-800 flex justify-end">
              <button
                onClick={() => setSelectedItemDetail(null)}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-white transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateManualItem}
            className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-neutral-100 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <h3 className="text-base font-semibold text-white">Add Item Manually</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-neutral-300 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Designing Data-Intensive Applications"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-300 mb-1">Creator / Author</label>
                <input
                  type="text"
                  value={newCreator}
                  onChange={(e) => setNewCreator(e.target.value)}
                  placeholder="e.g. Martin Kleppmann"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-neutral-300 mb-1">Media Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as ContentType)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 text-white"
                  >
                    <option value="book">Book</option>
                    <option value="movie">Movie</option>
                    <option value="tv_show">TV Show</option>
                    <option value="youtube_video">YouTube Video</option>
                    <option value="podcast">Podcast</option>
                    <option value="course">Course</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-neutral-300 mb-1">Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as ConsumptionStatus)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 text-white"
                  >
                    <option value="want_to_consume">Want to Consume</option>
                    <option value="consuming">Consuming</option>
                    <option value="completed">Completed</option>
                    <option value="on_hold">On Hold</option>
                    <option value="dropped">Dropped</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-neutral-300 mb-1">Overview / Notes</label>
                <textarea
                  rows={3}
                  value={newOverview}
                  onChange={(e) => setNewOverview(e.target.value)}
                  placeholder="Key summary or reasons for adding..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md shadow-indigo-600/20"
              >
                Save to Library
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
