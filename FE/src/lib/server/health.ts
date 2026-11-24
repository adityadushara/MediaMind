import { getSupabaseAdmin } from "./supabaseAdmin";
import {
  getConfiguredModel,
  getModelCandidates,
  getEmbeddingModel,
  getApiKey,
} from "./geminiModels";
import { getStorageBucket } from "./storage";
import { missingColumnFromError } from "./schemaFallback";

export interface HealthReport {
  status: "healthy" | "degraded";
  version: string;
  environment: string;
  database: "connected" | "error";
  storage: "available" | "unavailable" | "unknown";
  schema: {
    pending_columns: string[];
  };
  ai: {
    configured: boolean;
    model: string;
    fallback_models: string[];
    embedding_model: string;
  };
  bucket: string;
  checks: Record<string, string>;
}

export async function buildHealthReport(): Promise<HealthReport> {
  const checks: Record<string, string> = {};

  let database: HealthReport["database"] = "connected";
  try {
    const { error } = await getSupabaseAdmin()
      .from("library_items")
      .select("id", { count: "exact", head: true })
      .limit(1);
    if (error) {
      database = "error";
      checks.database = error.message;
    } else {
      checks.database = "ok";
    }
  } catch (err) {
    database = "error";
    checks.database = err instanceof Error ? err.message : String(err);
  }

  let storage: HealthReport["storage"] = "unknown";
  const bucket = getStorageBucket();
  try {
    const { error } = await getSupabaseAdmin().storage.getBucket(bucket);
    if (error) {
      storage = "unavailable";
      checks.storage = error.message;
    } else {
      storage = "available";
      checks.storage = "ok";
    }
  } catch (err) {
    storage = "unavailable";
    checks.storage = err instanceof Error ? err.message : String(err);
  }

  const aiConfigured = Boolean(getApiKey());
  checks.ai = aiConfigured ? "configured" : "GEMINI_API_KEY missing";

  // Detect migrations that have not been applied to this database. The app
  // degrades gracefully, but the operator should know why some fields are only
  // recoverable from JSONB metadata.
  const pendingColumns: string[] = [];
  const schemaProbes: Array<{ table: string; column: string }> = [
    { table: "library_items", column: "direct_url" },
    { table: "library_items", column: "subcategory" },
    { table: "identification_candidates", column: "direct_url" },
    { table: "identification_candidates", column: "suggested_subcategory" },
  ];
  for (const probe of schemaProbes) {
    try {
      const { error } = await getSupabaseAdmin()
        .from(probe.table)
        .select(probe.column)
        .limit(1);
      if (error && missingColumnFromError(error)) {
        pendingColumns.push(`${probe.table}.${probe.column}`);
      }
    } catch {
      // Ignore probe failures; the main database check already reports them.
    }
  }
  if (pendingColumns.length > 0) {
    checks.schema = `pending migrations: ${pendingColumns.join(", ")}`;
  } else {
    checks.schema = "ok";
  }

  const status: HealthReport["status"] =
    database === "connected" && aiConfigured && pendingColumns.length === 0
      ? "healthy"
      : "degraded";

  return {
    status,
    version: "1.1.0",
    environment: process.env.VERCEL ? "vercel-serverless" : "local",
    database,
    storage,
    bucket,
    schema: { pending_columns: pendingColumns },
    ai: {
      configured: aiConfigured,
      model: getConfiguredModel(),
      fallback_models: getModelCandidates().slice(1),
      embedding_model: getEmbeddingModel(),
    },
    checks,
  };
}
