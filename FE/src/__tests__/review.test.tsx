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

  it("opens the library filtered to items needing review", () => {
    render(<ReviewPage />);

    expect(screen.getByText(/Opening items that need review/)).toBeDefined();
    expect(mockReplace).toHaveBeenCalledWith(
      "/library?verification_status=needs_review"
    );
  });
});
