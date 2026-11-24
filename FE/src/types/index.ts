export type ContentType =
  | "book"
  | "movie"
  | "tv_show"
  | "youtube_video"
  | "documentary"
  | "podcast"
  | "course"
  | "article"
  | "newsletter"
  | "other";

export type ConsumptionStatus =
  | "want_to_consume"
  | "consuming"
  | "completed"
  | "on_hold"
  | "dropped";

export type JobStatus =
  | "queued"
  | "processing"
  | "awaiting_identification"
  | "completed"
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
  subcategory: string | null;
  direct_url: string | null;
  consumption_status: ConsumptionStatus;
  release_year: number | null;
  overview: string | null;
  cover_image_url: string | null;
  screenshot_url?: string | null;
  original_title?: string | null;
  isbn?: string | null;
  genre?: string | null;
  runtime_minutes?: number | null;
  language?: string | null;
  publisher?: string | null;
  total_seasons?: number | null;
  total_episodes?: number | null;
  last_synced_at?: string | null;
  external_provider: string | null;
  external_id: string | null;
  provider_metadata: Record<string, unknown>;
  user_rating: number | null;
  verification_status: "verified" | "manual_entry" | "auto_accepted" | "needs_review" | "unverified" | string;
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

export interface LibraryStats {
  total: number;
  by_status: Record<ConsumptionStatus, number>;
  needs_review: number;
  unverified: number;
}

export interface JobCandidateSummary {
  id: string;
  suggested_title: string;
  suggested_creator?: string | null;
  suggested_type?: ContentType | null;
  suggested_subcategory?: string | null;
  direct_url?: string | null;
  confidence_score?: number | null;
  review_status?: string | null;
  derivative_id?: string | null;
  crop_signed_url?: string | null;
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
  candidates?: JobCandidateSummary[];
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
  idempotency_key?: string | null;
  signed_url?: string | null;
  latest_status?: JobStatus | null;
  created_at: string;
}

export interface SourceAssetListResponse {
  total: number;
  items: SourceAsset[];
}

export interface LinkedLibraryItemRef {
  id: string;
  title: string;
  creator: string | null;
  content_type: ContentType;
  consumption_status: ConsumptionStatus;
  created_at: string;
}

export interface SourceAssetDetail extends SourceAsset {
  latest_job: ProcessingJob | null;
  library_items: LinkedLibraryItemRef[];
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

export interface BoundingBox {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

export type CandidateReviewStatus = "needs_review" | "accepted" | "rejected" | "pending";

export interface IdentificationCandidate {
  id: string;
  job_id: string;
  source_asset_id: string;
  user_id: string;
  run_id?: string | null;
  derivative_id?: string | null;
  suggested_title: string;
  suggested_creator?: string | null;
  additional_creators: string[];
  suggested_type?: ContentType | null;
  suggested_subcategory?: string | null;
  direct_url?: string | null;
  description_clue?: string | null;
  year_clue?: number | null;
  visible_text: string[];
  identifying_clues: string[];
  uncertainty_reasons: string[];
  confidence_score?: number | null;
  evidence_text?: string | null;
  bounding_box?: BoundingBox | null;
  provider_candidates?: Array<Record<string, unknown>>;
  review_status: CandidateReviewStatus;
  resolution_status: string;
  resolved_library_item_id?: string | null;
  prompt_version?: string | null;
  ai_model_name?: string | null;
  source_signed_url?: string | null;
  crop_signed_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidateListResponse {
  total: number;
  items: IdentificationCandidate[];
}

export interface ReviewCounts {
  pending_review: number;
  accepted: number;
  rejected: number;
  total: number;
}

export interface CandidateUpdateRequest {
  suggested_title?: string;
  suggested_creator?: string;
  suggested_type?: ContentType;
  suggested_subcategory?: string;
  direct_url?: string;
  description_clue?: string;
  year_clue?: number;
}

export interface ReviewAcceptRequest {
  title?: string;
  creator?: string;
  content_type?: ContentType;
  subcategory?: string;
  direct_url?: string;
  consumption_status?: ConsumptionStatus;
  overview?: string;
  release_year?: number;
  user_rating?: number;
}

export interface RAGQueryRequest {
  query: string;
  top_k?: number;
}

export interface RAGQueryResponse {
  query: string;
  answer: string;
  matched_items: LibraryItem[];
  duration_ms: number;
  model_name: string;
}
