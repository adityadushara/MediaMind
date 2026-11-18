import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReviewPage from "@/app/review/page";
import * as api from "@/lib/api";
import { IdentificationCandidate } from "@/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/review",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  checkBackendHealth: vi.fn(),
  getReviewCounts: vi.fn(),
  listReviewCandidates: vi.fn(),
  updateReviewCandidate: vi.fn(),
  acceptReviewCandidate: vi.fn(),
  rejectReviewCandidate: vi.fn(),
  resolveMediaUrl: vi.fn((url: string) => url),
}));

const mockCandidates: IdentificationCandidate[] = [
  {
    id: "cand-1",
    job_id: "job-1",
    source_asset_id: "asset-1",
    user_id: "user-1",
    suggested_title: "Designing Data-Intensive Applications",
    suggested_creator: "Martin Kleppmann",
    additional_creators: [],
    suggested_type: "book",
    description_clue: "Reliable, Scalable, and Maintainable Systems",
    year_clue: 2017,
    visible_text: ["Designing Data-Intensive Applications", "Martin Kleppmann"],
    identifying_clues: ["O'Reilly Animal Cover"],
    uncertainty_reasons: [],
    confidence_score: 0.94,
    review_status: "needs_review",
    resolution_status: "pending",
    crop_signed_url: "/api/v1/assets/media/crop1.jpg",
    source_signed_url: "/api/v1/assets/media/source1.jpg",
    bounding_box: { x_min: 100, y_min: 150, x_max: 500, y_max: 700 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe("Review Center Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.checkBackendHealth).mockResolvedValue({
      status: "healthy",
      version: "0.3.0",
      environment: "development",
      database: "connected",
      storage: "local",
    });
    vi.mocked(api.getReviewCounts).mockResolvedValue({
      pending_review: 1,
      accepted: 0,
      rejected: 0,
      total: 1,
    });
    vi.mocked(api.listReviewCandidates).mockResolvedValue({
      total: 1,
      items: mockCandidates,
    });
  });

  it("renders the review queue with candidate cards", async () => {
    render(<ReviewPage />);

    expect(screen.getByRole("heading", { name: "Review Center" })).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText("Designing Data-Intensive Applications")).toBeDefined();
      expect(screen.getByText("by Martin Kleppmann")).toBeDefined();
      expect(screen.getByText("94% Conf")).toBeDefined();
    });
  });

  it("opens inspection drawer when Inspect is clicked", async () => {
    render(<ReviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Designing Data-Intensive Applications")).toBeDefined();
    });

    const inspectBtn = screen.getByText("Inspect");
    fireEvent.click(inspectBtn);

    expect(screen.getByText("Inspect & Verify Candidate")).toBeDefined();
    expect(screen.getByDisplayValue("Designing Data-Intensive Applications")).toBeDefined();
    expect(screen.getByDisplayValue("Martin Kleppmann")).toBeDefined();
    expect(screen.getByText("O'Reilly Animal Cover")).toBeDefined();
  });

  it("approves candidate and adds to media library", async () => {
    vi.mocked(api.acceptReviewCandidate).mockResolvedValue({
      id: "lib-1",
      user_id: "user-1",
      title: "Designing Data-Intensive Applications",
      creator: "Martin Kleppmann",
      content_type: "book",
      subcategory: "Software Architecture",
      direct_url: "https://books.google.com/sample",
      consumption_status: "want_to_consume",
      release_year: 2017,
      overview: "Reliable, Scalable, and Maintainable Systems",
      cover_image_url: null,
      external_provider: null,
      external_id: null,
      provider_metadata: {},
      user_rating: null,
      verification_status: "verified",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    render(<ReviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Designing Data-Intensive Applications")).toBeDefined();
    });

    const inspectBtn = screen.getByText("Inspect");
    fireEvent.click(inspectBtn);

    const approveBtn = screen.getByText("Approve & Add to Library");
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(api.acceptReviewCandidate).toHaveBeenCalledWith("cand-1", expect.objectContaining({
        title: "Designing Data-Intensive Applications",
        creator: "Martin Kleppmann",
        content_type: "book",
      }));
    });
  });

  it("rejects candidate when Reject is clicked", async () => {
    vi.mocked(api.rejectReviewCandidate).mockResolvedValue({
      success: true,
      candidate_id: "cand-1",
      review_status: "rejected",
    });

    render(<ReviewPage />);

    await waitFor(() => {
      expect(screen.getByText("Designing Data-Intensive Applications")).toBeDefined();
    });

    const rejectBtn = screen.getByTitle("Reject");
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(api.rejectReviewCandidate).toHaveBeenCalledWith("cand-1");
    });
  });
});
