import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LandingPage } from "@/components/landing/LandingPage";
import { AuthGuard } from "@/components/auth/AuthGuard";
import * as authContext from "@/context/AuthContext";

describe("LandingPage Component", () => {
  it("renders product value proposition and interactive steps", () => {
    const handleSignIn = vi.fn();
    const handleSignUp = vi.fn();

    render(<LandingPage onSignIn={handleSignIn} onSignUp={handleSignUp} />);

    expect(screen.getByText("Never forget a book, movie, or video you saved.")).toBeDefined();
    expect(screen.getByText("Upload or Paste Screenshots")).toBeDefined();
    expect(screen.getByText("AI Vision & Metadata Match")).toBeDefined();
    expect(screen.getByText("Direct Links & RAG Chat")).toBeDefined();

    // Trigger auth calls
    const getStartedBtns = screen.getAllByRole("button", { name: /Get Started Free/i });
    fireEvent.click(getStartedBtns[0]);
    expect(handleSignUp).toHaveBeenCalled();
  });
});

describe("AuthGuard Component", () => {
  it("blocks unauthenticated users and shows login prompt", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      user: null,
      session: null,
      isLoading: false,
      isConfigured: true,
      isAuthModalOpen: false,
      authModalMode: "signin",
      openAuthModal: vi.fn(),
      closeAuthModal: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <AuthGuard featureName="Protected Feature">
        <div>Confidential Workspace Content</div>
      </AuthGuard>
    );

    expect(screen.queryByText("Confidential Workspace Content")).toBeNull();
    expect(screen.getByText(/Sign in to use Protected Feature/i)).toBeDefined();
  });

  it("renders protected content when user is authenticated", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      user: { id: "user-123", email: "user@example.com" } as any,
      session: { access_token: "mock-token" } as any,
      isLoading: false,
      isConfigured: true,
      isAuthModalOpen: false,
      authModalMode: "signin",
      openAuthModal: vi.fn(),
      closeAuthModal: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <AuthGuard featureName="Protected Feature">
        <div>Confidential Workspace Content</div>
      </AuthGuard>
    );

    expect(screen.getByText("Confidential Workspace Content")).toBeDefined();
  });
});
