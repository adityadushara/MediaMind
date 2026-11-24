import { describe, it, expect, vi } from "vitest";
import {
  isContentTypeConstraintError,
  missingColumnFromError,
  withColumnFallback,
} from "@/lib/server/schemaFallback";

describe("schemaFallback", () => {
  it("detects a missing column from PostgREST errors", () => {
    expect(
      missingColumnFromError({
        message: "Could not find the 'direct_url' column of 'library_items' in the schema cache",
      })
    ).toBe("direct_url");

    expect(
      missingColumnFromError({
        message: "column identification_candidates.suggested_subcategory does not exist",
      })
    ).toBe("suggested_subcategory");

    expect(missingColumnFromError({ message: "permission denied" })).toBeNull();
  });

  it("retries a write without the missing optional column", async () => {
    const attempts: Array<Record<string, unknown>> = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await withColumnFallback(
      { title: "Dune", direct_url: "https://example.com/dune" },
      async (payload) => {
        attempts.push({ ...payload });
        if ("direct_url" in payload) {
          return {
            data: null,
            error: {
              message:
                "Could not find the 'direct_url' column of 'library_items' in the schema cache",
            },
          };
        }
        return { data: { ok: true }, error: null };
      },
      "test write"
    );

    expect(result.error).toBeNull();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).not.toHaveProperty("direct_url");
    expect(attempts[1].title).toBe("Dune");
    warn.mockRestore();
  });

  it("does not retry unrelated errors", async () => {
    let calls = 0;
    const result = await withColumnFallback(
      { title: "Dune" },
      async () => {
        calls++;
        return { data: null, error: { message: "permission denied" } };
      },
      "test write"
    );

    expect(calls).toBe(1);
    expect(result.error?.message).toBe("permission denied");
  });

  it("recognises content_type CHECK constraint failures", () => {
    expect(
      isContentTypeConstraintError({
        message:
          'new row violates check constraint "library_items_content_type_check"',
      })
    ).toBe(true);
    expect(
      isContentTypeConstraintError({ message: "duplicate key value" })
    ).toBe(false);
  });
});
