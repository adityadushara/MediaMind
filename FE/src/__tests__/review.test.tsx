import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ReviewPage from "@/app/review/page";

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/review",
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, refresh: vi.fn() }),
}));

describe("Review Page (Legacy Redirect)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects users directly to /library since review queue has been removed", () => {
    render(<ReviewPage />);

    expect(screen.getByText("Redirecting to Your Library...")).toBeDefined();
    expect(mockReplace).toHaveBeenCalledWith("/library");
  });
});
