import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  deleteLibraryItem,
  unlinkSourceFromLibraryItem,
  uploadScreenshotFiles,
} from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ImageViewerModal } from "@/components/ui/ImageViewerModal";
import { QuickUploadModal } from "@/components/dashboard/QuickUploadModal";

vi.mock("next/navigation", () => ({
  usePathname: () => "/library",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      email: "qa@example.com",
      user_metadata: { display_name: "QA User" },
    },
    session: { access_token: "token-123" },
    isLoading: false,
    isConfigured: true,
    isAuthModalOpen: false,
    authModalMode: "signin",
    openAuthModal: vi.fn(),
    closeAuthModal: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  }),
}));

describe("API error handling fixes", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("throws parsed error detail when deleteLibraryItem fails", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Library item not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(deleteLibraryItem("missing-id")).rejects.toThrow(
      "Library item not found"
    );
  });

  it("throws parsed error detail when unlinkSourceFromLibraryItem fails", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Source association not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      unlinkSourceFromLibraryItem("item-1", "asset-1")
    ).rejects.toThrow("Source association not found");
  });

  it("parses JSON detail instead of raw JSON envelope in uploadScreenshotFiles", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: "File is not a supported image",
          errors: [{ file_name: "fake.png", error: "File is not a supported image" }],
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const file = new File(["not-an-image"], "fake.png", { type: "image/png" });
    await expect(uploadScreenshotFiles([file])).rejects.toThrow(
      "File is not a supported image"
    );
  });
});

describe("Responsive Sidebar & Header mobile drawer", () => {
  it("opens and closes the mobile navigation drawer from Header menu button", () => {
    render(
      <div>
        <Sidebar
          health={{
            status: "healthy",
            version: "1.0.0",
            environment: "test",
            database: "connected",
            storage: "connected",
          }}
          pendingReviewCount={2}
        />
        <Header searchQuery="" onSearchChange={vi.fn()} onOpenAskAI={vi.fn()} />
      </div>
    );

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Close navigation menu" }));
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).toBeNull();
  });
});

describe("ImageViewerModal fallback support", () => {
  it("switches to fallbackUrl when primary imageUrl fails to load", () => {
    render(
      <ImageViewerModal
        isOpen={true}
        onClose={vi.fn()}
        imageUrl="https://example.com/broken.png"
        fallbackUrl="https://example.com/fallback.png"
        title="Test Image"
      />
    );

    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://example.com/broken.png");

    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe("https://example.com/fallback.png");
  });
});

describe("QuickUploadModal UX & duplicate feedback", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("closes on Escape key when not uploading", () => {
    const onClose = vi.fn();
    render(
      <QuickUploadModal
        isOpen={true}
        onClose={onClose}
        onUploadSuccess={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows duplicate feedback when server skips an already-uploaded screenshot", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          assets: [
            {
              asset_id: "asset-1",
              file_name: "dup.png",
              job_id: "job-1",
              status: "identified",
              is_duplicate: true,
            },
          ],
          total_count: 1,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const { container } = render(
      <QuickUploadModal
        isOpen={true}
        onClose={vi.fn()}
        onUploadSuccess={vi.fn()}
      />
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["png-bytes"], "dup.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: /Start AI Extraction/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/1 duplicate screenshot already in your vault/i)
      ).toBeDefined();
    });
  });
});
