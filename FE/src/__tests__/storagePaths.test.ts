import { describe, it, expect } from "vitest";
import { normalizeStoragePath } from "@/lib/server/storage";

// Regression test: uploads used to store the bucket name inside the object key
// (`screenshots/<uid>/<file>.png` inside bucket `screenshots`), which made both
// signed URLs and worker downloads resolve to `screenshots/screenshots/...`
// and fail with 404. Paths must stay bucket-relative, and legacy rows must be
// readable by stripping the duplicated prefix.
describe("normalizeStoragePath", () => {
  it("strips a duplicated bucket prefix from legacy rows", () => {
    expect(normalizeStoragePath("screenshots/user-1/file.png", "screenshots")).toBe(
      "user-1/file.png"
    );
  });

  it("leaves bucket-relative paths untouched", () => {
    expect(normalizeStoragePath("user-1/file.png", "screenshots")).toBe(
      "user-1/file.png"
    );
    expect(normalizeStoragePath("derivatives/crop.jpg", "screenshots")).toBe(
      "derivatives/crop.jpg"
    );
  });

  it("only strips the configured bucket, not similar path segments", () => {
    expect(normalizeStoragePath("screenshots-backup/file.png", "screenshots")).toBe(
      "screenshots-backup/file.png"
    );
    expect(normalizeStoragePath("screenshots/user-1/file.png", "media")).toBe(
      "screenshots/user-1/file.png"
    );
  });
});
