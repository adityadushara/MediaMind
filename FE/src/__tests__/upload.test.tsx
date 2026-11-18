import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import UploadPage from "@/app/upload/page";

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/upload",
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, refresh: vi.fn() }),
}));

describe("Upload Page (Legacy Redirect to In-Library Modal)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects users directly to /library?upload=true since dedicated upload page was removed", () => {
    render(<UploadPage />);

    expect(screen.getByText("Opening Library Upload...")).toBeDefined();
    expect(mockReplace).toHaveBeenCalledWith("/library?upload=true");
  });
});
