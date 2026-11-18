import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import UploadPage from "@/app/upload/page";
import * as api from "@/lib/api";

vi.mock("next/navigation", () => ({
  usePathname: () => "/upload",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  checkBackendHealth: vi.fn(),
  getProcessingJobs: vi.fn(),
  uploadScreenshotFiles: vi.fn(),
  retryProcessingJob: vi.fn(),
  getSourceAssetDetail: vi.fn(),
  resolveMediaUrl: vi.fn((url: string) => url),
}));

describe("Upload Center Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.checkBackendHealth).mockResolvedValue({
      status: "healthy",
      version: "0.3.0",
      environment: "development",
      database: "connected",
      storage: "local",
    });
    vi.mocked(api.getProcessingJobs).mockResolvedValue([]);
  });

  it("renders upload dropzone and empty activity state", async () => {
    render(<UploadPage />);

    expect(screen.getByRole("heading", { name: /Upload Center/i })).toBeDefined();
    expect(screen.getByText("Click to browse or drop screenshots here")).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText("No processing jobs found")).toBeDefined();
    });
  });
});
