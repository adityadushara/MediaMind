import { describe, it, expect } from "vitest";
import {
  acceptCandidate,
  type CandidateRecord,
} from "@/lib/server/libraryIngest";

interface CapturedItem {
  [key: string]: unknown;
}

/**
 * Regression test for the schema mismatch that dropped every AI candidate:
 * `identification_candidates` stores provider matches in `provider_candidates`,
 * not in `provider_metadata` / `external_provider` / `external_id`.
 */
function createFakeSupabase(captured: { item?: CapturedItem }) {
  return {
    from(table: string) {
      if (table === "library_items") {
        return {
          // Dedupe lookup: .select().eq().eq().eq().maybeSingle()
          select() {
            const chain: {
              eq: () => typeof chain;
              maybeSingle: () => Promise<{ data: null; error: null }>;
            } = {
              eq: () => chain,
              maybeSingle: async () => ({ data: null, error: null }),
            };
            return chain;
          },
          insert(payload: CapturedItem) {
            captured.item = payload;
            return {
              select() {
                return {
                  single: async () => ({
                    data: { id: payload.id, ...payload },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "identification_candidates") {
        return {
          update() {
            return {
              eq() {
                return {
                  eq: async () => ({ error: null }),
                };
              },
            };
          },
        };
      }

      if (table === "item_embeddings") {
        return {
          insert: async () => ({ error: null }),
        };
      }

      throw new Error(`Unexpected table access: ${table}`);
    },
  };
}

const candidate: CandidateRecord = {
  id: "candidate-1",
  user_id: "user-1",
  source_asset_id: null,
  suggested_title: "Rich Dad Poor Dad",
  suggested_creator: "Robert Kiyosaki",
  suggested_type: "book",
  suggested_subcategory: "Finance",
  direct_url: null,
  description_clue: "Personal finance classic",
  year_clue: 1997,
  confidence_score: 0.91,
  provider_candidates: [
    {
      provider_name: "google_books",
      external_id: "book-123",
      raw_payload: {
        cover_image_url: "https://books.google.com/cover.jpg",
        volumeInfo: { title: "Rich Dad Poor Dad" },
      },
    },
  ],
};

describe("acceptCandidate", () => {
  it("reads provider data from provider_candidates and stores library metadata", async () => {
    const captured: { item?: CapturedItem } = {};
    const db = createFakeSupabase(captured);

    const item = await acceptCandidate(
      // The fake only implements the call chain used by this flow.
      db as unknown as Parameters<typeof acceptCandidate>[0],
      "user-1",
      candidate
    );

    expect(item).toBeTruthy();
    expect(captured.item?.title).toBe("Rich Dad Poor Dad");
    expect(captured.item?.external_provider).toBe("google_books");
    expect(captured.item?.external_id).toBe("book-123");
    expect(captured.item?.provider_metadata).toEqual({
      cover_image_url: "https://books.google.com/cover.jpg",
      volumeInfo: { title: "Rich Dad Poor Dad" },
      // Recoverable copies of fields whose dedicated columns may be missing
      // on databases that have not applied every migration yet.
      _mediamind: {
        subcategory: "Finance",
        direct_url: expect.stringMatching(/^https:\/\//),
      },
    });
    expect(captured.item?.cover_image_url).toBe(
      "https://books.google.com/cover.jpg"
    );
    expect(captured.item?.verification_status).toBe("verified");
    expect(String(captured.item?.direct_url)).toMatch(/^https:\/\//);
  });
});
