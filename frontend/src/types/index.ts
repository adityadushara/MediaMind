export type ContentType =
  | "book"
  | "movie"
  | "tv_show"
  | "youtube_video"
  | "documentary"
  | "podcast"
  | "course";

export type ConsumptionStatus =
  | "want_to_consume"
  | "consuming"
  | "completed"
  | "on_hold"
  | "dropped";

export type JobStatus =
  | "queued"
  | "processing"
  | "identified"
  | "needs_review"
  | "unidentified"
  | "failed";

export interface LibraryItem {
  id: string;
  user_id: string;
  title: string;
  creator: string | null;
  content_type: ContentType;
  consumption_status: ConsumptionStatus;
  release_year: number | null;
  overview: string | null;
  cover_image_url: string | null;
  external_provider: string | null;
  external_id: string | null;
  provider_metadata: Record<string, unknown>;
  user_rating: number | null;
  verification_status: "verified" | "manual_entry" | "auto_accepted";
  created_at: string;
  updated_at: string;
}

export interface LinkedSourceAsset {
  id: string;
  file_name: string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  sha256_hash: string;
  image_width: number | null;
  image_height: number | null;
  signed_url: string | null;
  crop_coordinates: Record<string, unknown> | null;
  created_at: string;
}

export interface LibraryItemDetail extends LibraryItem {
  sources: LinkedSourceAsset[];
}

export interface LibraryItemListResponse {
  total: number;
  items: LibraryItem[];
}

export interface ProcessingJob {
  id: string;
  source_asset_id: string;
  status: JobStatus;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  ai_model_name: string | null;
  prompt_version: string | null;
  processing_time_ms: number | null;
  token_usage: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SourceAsset {
  id: string;
  file_name: string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  sha256_hash: string;
  image_width: number | null;
  image_height: number | null;
  created_at: string;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unreachable";
  version: string;
  environment: string;
  database: string;
  storage: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  role: string;
  display_name: string;
}
