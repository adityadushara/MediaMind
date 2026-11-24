import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Schema-drift helpers.
 *
 * Production databases can lag behind `migrations/`. PostgREST rejects an
 * entire insert/update when one optional column is missing, which previously
 * discarded AI results and direct links. These helpers retry the same write
 * without the absent optional column so data is never silently lost.
 */

const MISSING_COLUMN_PATTERNS = [
  // PostgreSQL: `column table.column does not exist`
  /column\s+"?(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)"?\s+does not exist/i,
  // PostgREST schema cache: `Could not find the 'col' column of 'table' ...`
  /Could not find the '([^']+)' column/i,
  /column\s+'([^']+)'\s+does not exist/i,
];

export function missingColumnFromError(
  error: Pick<PostgrestError, "message"> | { message?: string } | null | undefined
): string | null {
  const message = error?.message || "";
  for (const pattern of MISSING_COLUMN_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

interface WriteResult {
  error: { message: string; code?: string } | null;
}

/**
 * Runs `operation` with `payload`; if the database rejects an unknown optional
 * column, removes that column and tries again. The retry count is bounded so a
 * genuinely broken schema still fails loudly.
 */
export async function withColumnFallback<T extends WriteResult>(
  payload: Record<string, unknown>,
  operation: (payload: Record<string, unknown>) => PromiseLike<T>,
  label: string,
  maxAttempts = 8
): Promise<T> {
  const current = { ...payload };
  let result = await operation(current);

  for (let attempt = 1; attempt < maxAttempts && result.error; attempt++) {
    const column = missingColumnFromError(result.error);
    if (!column) break;
    if (!(column in current)) break;

    delete current[column];
    console.warn(
      `[Schema] ${label}: column '${column}' is missing from this database. ` +
        "Retrying without it; apply pending migrations to persist this field."
    );
    result = await operation(current);
  }

  return result;
}

/** True when a CHECK constraint rejected a content type value. */
export function isContentTypeConstraintError(
  error: Pick<PostgrestError, "message"> | { message?: string } | null | undefined
): boolean {
  const message = (error?.message || "").toLowerCase();
  return (
    message.includes("content_type") &&
    (message.includes("check constraint") || message.includes("violates"))
  );
}
