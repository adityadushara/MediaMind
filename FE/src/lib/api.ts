import {
  HealthStatus,
  LibraryItemListResponse,
  LibraryItem,
  LibraryItemDetail,
  ProcessingJob,
  SourceAssetListResponse,
  SourceAssetDetail,
  UserProfile,
  ReviewCounts,
  CandidateListResponse,
  IdentificationCandidate,
  CandidateUpdateRequest,
  ReviewAcceptRequest,
  RAGQueryRequest,
  RAGQueryResponse,
} from "@/types";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

let cachedAccessToken: string | null = null;

export function setCachedAccessToken(token: string | null): void {
  cachedAccessToken = token;
}

export function getAccessToken(): string | null {
  if (cachedAccessToken) return cachedAccessToken;
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const item = localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          return parsed?.access_token || parsed?.currentSession?.access_token || null;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (isSupabaseConfigured && typeof window !== "undefined") {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        setCachedAccessToken(data.session.access_token);
        headers["Authorization"] = `Bearer ${data.session.access_token}`;
      }
    } catch {
      // In offline or fallback mode, omit header
    }
  }
  return headers;
}

export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  let fullUrl = url.trim();

  // Upgrade Google Books and external insecure http to https
  if (fullUrl.startsWith("http://books.google.com/")) {
    fullUrl = fullUrl.replace("http://books.google.com/", "https://books.google.com/");
  } else if (fullUrl.startsWith("http://") && !fullUrl.includes("localhost") && !fullUrl.includes("127.0.0.1")) {
    fullUrl = fullUrl.replace("http://", "https://");
  }

  if (
    !fullUrl.startsWith("http://") &&
    !fullUrl.startsWith("https://") &&
    !fullUrl.startsWith("data:") &&
    !fullUrl.startsWith("blob:")
  ) {
    fullUrl = `${API_BASE}${fullUrl.startsWith("/") ? "" : "/"}${fullUrl}`;
  }

  if (fullUrl.includes("/api/v1/assets/media/") && !fullUrl.includes("token=")) {
    const token = getAccessToken();
    if (token) {
      fullUrl += `${fullUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    }
  }

  return fullUrl;
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...options?.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${errorBody || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export async function checkBackendHealth(): Promise<HealthStatus> {
  try {
    return await fetchJson<HealthStatus>("/health");
  } catch {
    return {
      status: "unreachable",
      version: "unknown",
      environment: "offline",
      database: "disconnected",
      storage: "disconnected",
    };
  }
}

export async function getUserProfile(): Promise<UserProfile> {
  return fetchJson<UserProfile>("/api/v1/auth/me");
}

export async function getLibraryItems(params?: {
  content_type?: string;
  subcategory?: string;
  consumption_status?: string;
  verification_status?: string;
  search?: string;
  sort_by?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}): Promise<LibraryItemListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.content_type) searchParams.set("content_type", params.content_type);
  if (params?.subcategory) searchParams.set("subcategory", params.subcategory);
  if (params?.consumption_status) searchParams.set("consumption_status", params.consumption_status);
  if (params?.verification_status) searchParams.set("verification_status", params.verification_status);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.sort_by) searchParams.set("sort_by", params.sort_by);
  if (params?.order) searchParams.set("order", params.order);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());

  const qs = searchParams.toString();
  return fetchJson<LibraryItemListResponse>(`/api/v1/library${qs ? `?${qs}` : ""}`);
}

export async function verifyLibraryItem(itemId: string): Promise<LibraryItem> {
  return fetchJson<LibraryItem>(`/api/v1/library/${itemId}/verify`, {
    method: "POST",
  });
}

export async function verifyAllLibraryItems(): Promise<{ verified_count: number }> {
  return fetchJson<{ verified_count: number }>(`/api/v1/library/verify-all`, {
    method: "POST",
  });
}

export async function getSubcategories(contentType?: string): Promise<string[]> {
  const qs = contentType ? `?content_type=${encodeURIComponent(contentType)}` : "";
  return fetchJson<string[]>(`/api/v1/library/subcategories${qs}`);
}

export async function acceptAllJobCandidates(jobId: string): Promise<LibraryItem[]> {
  return fetchJson<LibraryItem[]>(`/api/v1/reviews/jobs/${jobId}/accept-all`, {
    method: "POST",
  });
}

export async function createLibraryItem(payload: Partial<LibraryItem>): Promise<LibraryItem> {
  return fetchJson<LibraryItem>("/api/v1/library", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getLibraryItemDetail(id: string): Promise<LibraryItemDetail> {
  return fetchJson<LibraryItemDetail>(`/api/v1/library/${id}`);
}

export async function updateLibraryItem(
  id: string,
  payload: Partial<LibraryItem>
): Promise<LibraryItem> {
  return fetchJson<LibraryItem>(`/api/v1/library/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteLibraryItem(id: string): Promise<void> {
  const authHeaders = await getAuthHeaders();
  await fetch(`${API_BASE}/api/v1/library/${id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
}

export async function retryProcessingJob(jobId: string): Promise<ProcessingJob> {
  return fetchJson<ProcessingJob>(`/api/v1/jobs/${jobId}/retry`, {
    method: "POST",
  });
}

export async function getProcessingJobs(status?: string): Promise<ProcessingJob[]> {
  const qs = status ? `?status=${status}` : "";
  return fetchJson<ProcessingJob[]>(`/api/v1/jobs${qs}`);
}

export async function getSourceAssets(params?: {
  search?: string;
  status?: string;
  sort?: "newest" | "oldest";
  limit?: number;
  offset?: number;
}): Promise<SourceAssetListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.sort) searchParams.set("sort", params.sort);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());
  const qs = searchParams.toString();
  return fetchJson<SourceAssetListResponse>(`/api/v1/assets${qs ? `?${qs}` : ""}`);
}

export async function getSourceAssetDetail(assetId: string): Promise<SourceAssetDetail> {
  return fetchJson<SourceAssetDetail>(`/api/v1/assets/${assetId}`);
}

export async function deleteSourceAsset(assetId: string): Promise<{ success: boolean; message: string }> {
  return fetchJson<{ success: boolean; message: string }>(`/api/v1/assets/${assetId}`, {
    method: "DELETE",
  });
}

export async function linkSourceToLibraryItem(
  itemId: string,
  assetId: string
): Promise<{ status: string; library_item_id: string; source_asset_id: string }> {
  return fetchJson(`/api/v1/library/${itemId}/sources/${assetId}`, {
    method: "POST",
  });
}

export async function unlinkSourceFromLibraryItem(
  itemId: string,
  assetId: string
): Promise<void> {
  const authHeaders = await getAuthHeaders();
  await fetch(`${API_BASE}/api/v1/library/${itemId}/sources/${assetId}`, {
    method: "DELETE",
    headers: authHeaders,
  });
}

export async function uploadScreenshotFiles(
  files: File[],
  options?: {
    idempotencyKey?: string;
    forceReupload?: boolean;
  }
): Promise<{
  assets: Array<{
    asset_id: string;
    file_name: string;
    job_id: string;
    status: string;
    is_duplicate?: boolean;
    library_item_id?: string;
  }>;
  total_count: number;
}> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });

  const authHeaders = await getAuthHeaders();
  const headers: Record<string, string> = {
    ...authHeaders,
  };
  if (options?.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const query = options?.forceReupload ? "?force_reupload=true" : "";
  const res = await fetch(`${API_BASE}/api/v1/assets/upload${query}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Upload failed [${res.status}]: ${errorBody}`);
  }

  return res.json();
}

export async function getReviewCounts(): Promise<ReviewCounts> {
  return fetchJson<ReviewCounts>("/api/v1/reviews/counts");
}

export async function listReviewCandidates(params?: {
  review_status?: string;
  content_type?: string;
  job_id?: string;
  source_asset_id?: string;
  limit?: number;
  offset?: number;
}): Promise<CandidateListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.review_status) searchParams.set("review_status", params.review_status);
  if (params?.content_type) searchParams.set("content_type", params.content_type);
  if (params?.job_id) searchParams.set("job_id", params.job_id);
  if (params?.source_asset_id) searchParams.set("source_asset_id", params.source_asset_id);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  if (params?.offset) searchParams.set("offset", params.offset.toString());
  const qs = searchParams.toString();
  return fetchJson<CandidateListResponse>(`/api/v1/reviews/candidates${qs ? `?${qs}` : ""}`);
}

export async function getReviewCandidate(id: string): Promise<IdentificationCandidate> {
  return fetchJson<IdentificationCandidate>(`/api/v1/reviews/candidates/${id}`);
}

export async function updateReviewCandidate(
  id: string,
  payload: CandidateUpdateRequest
): Promise<IdentificationCandidate> {
  return fetchJson<IdentificationCandidate>(`/api/v1/reviews/candidates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function acceptReviewCandidate(
  id: string,
  payload: ReviewAcceptRequest
): Promise<LibraryItem> {
  return fetchJson<LibraryItem>(`/api/v1/reviews/candidates/${id}/accept`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rejectReviewCandidate(
  id: string
): Promise<{ success: boolean; candidate_id: string; review_status: string }> {
  return fetchJson(`/api/v1/reviews/candidates/${id}/reject`, {
    method: "POST",
  });
}

export async function askLibrary(request: RAGQueryRequest): Promise<RAGQueryResponse> {
  return fetchJson<RAGQueryResponse>("/api/v1/rag/ask", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
