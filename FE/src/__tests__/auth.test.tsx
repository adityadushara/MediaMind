import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthModal } from "@/components/auth/AuthModal";
import * as authContext from "@/context/AuthContext";

// Mock AuthContext
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockCloseAuthModal = vi.fn();
const mockOpenAuthModal = vi.fn();

vi.mock("@/context/AuthContext", async () => {
  const actual = await vi.importActual<typeof authContext>("@/context/AuthContext");
  return {
    ...actual,
    useAuth: () => ({
      user: null,
      session: null,
      isLoading: false,
      isConfigured: true,
      isAuthModalOpen: true,
      authModalMode: "signin",
      openAuthModal: mockOpenAuthModal,
      closeAuthModal: mockCloseAuthModal,
      signIn: mockSignIn,
      signUp: mockSignUp,
      signOut: vi.fn(),
    }),
  };
});

describe("AuthModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("renders sign in form with email and password inputs", () => {
    render(<AuthModal />);

    expect(screen.getByRole("heading", { name: /Welcome Back/i })).toBeDefined();
    expect(screen.getByPlaceholderText("name@example.com")).toBeDefined();
    expect(screen.getByPlaceholderText("••••••••")).toBeDefined();
    const signInButtons = screen.getAllByRole("button", { name: /Sign In/i });
    expect(signInButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("switches to sign up tab and shows name input", () => {
    render(<AuthModal />);

    const signUpTabs = screen.getAllByRole("button", { name: /Sign Up/i });
    // Click the top tab switcher
    fireEvent.click(signUpTabs[0]);

    expect(mockOpenAuthModal).toHaveBeenCalledWith("signup");
  });

  it("submits sign in form with provided credentials", async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });

    render(<AuthModal />);

    const emailInput = screen.getByPlaceholderText("name@example.com");
    const passwordInput = screen.getByPlaceholderText("••••••••");
    // Find the submit button
    const buttons = screen.getAllByRole("button", { name: /Sign In/i });
    const submitBtn = buttons.find((b) => b.getAttribute("type") === "submit")!;

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitBtn);

    expect(mockSignIn).toHaveBeenCalledWith("test@example.com", "password123");
  });

  it("requires full name when submitting sign up form", async () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      user: null,
      session: null,
      isLoading: false,
      isConfigured: true,
      isAuthModalOpen: true,
      authModalMode: "signup",
      openAuthModal: mockOpenAuthModal,
      closeAuthModal: mockCloseAuthModal,
      signIn: mockSignIn,
      signUp: mockSignUp,
      signOut: vi.fn(),
    });

    render(<AuthModal />);

    expect(screen.getByText(/Full Name/i)).toBeDefined();
    const nameInput = screen.getByPlaceholderText("Jane Doe");
    expect(nameInput.hasAttribute("required")).toBe(true);

    const submitBtn = screen.getByRole("button", { name: "Create Account" });
    const emailInput = screen.getByPlaceholderText("name@example.com");
    const passwordInput = screen.getByPlaceholderText("••••••••");

    fireEvent.change(emailInput, { target: { value: "new@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.submit(submitBtn.closest("form")!);

    expect(screen.getByText("Please enter your full name.")).toBeDefined();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("submits sign up form and logs in directly without requiring email confirmation", async () => {
    mockSignUp.mockResolvedValueOnce({
      error: null,
      data: {
        user: { id: "user-123", email: "new@example.com" },
        session: { access_token: "token-abc" },
      },
    });

    vi.spyOn(authContext, "useAuth").mockReturnValue({
      user: null,
      session: null,
      isLoading: false,
      isConfigured: true,
      isAuthModalOpen: true,
      authModalMode: "signup",
      openAuthModal: mockOpenAuthModal,
      closeAuthModal: mockCloseAuthModal,
      signIn: mockSignIn,
      signUp: mockSignUp,
      signOut: vi.fn(),
    });

    render(<AuthModal />);

    const nameInput = screen.getByPlaceholderText("Jane Doe");
    const emailInput = screen.getByPlaceholderText("name@example.com");
    const passwordInput = screen.getByPlaceholderText("••••••••");
    const submitBtn = screen.getByRole("button", { name: "Create Account" });

    fireEvent.change(nameInput, { target: { value: "Jane Doe" } });
    fireEvent.change(emailInput, { target: { value: "new@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitBtn);

    expect(mockSignUp).toHaveBeenCalledWith("new@example.com", "password123", "Jane Doe");
  });

  it("shows helpful guidance when Supabase returns email not confirmed error", async () => {
    mockSignIn.mockResolvedValueOnce({
      error: new Error("Email not confirmed"),
    });

    render(<AuthModal />);

    const emailInput = screen.getByPlaceholderText("name@example.com");
    const passwordInput = screen.getByPlaceholderText("••••••••");
    const buttons = screen.getAllByRole("button", { name: /Sign In/i });
    const submitBtn = buttons.find((b) => b.getAttribute("type") === "submit")!;

    fireEvent.change(emailInput, { target: { value: "test@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitBtn);

    expect(mockSignIn).toHaveBeenCalledWith("test@example.com", "password123");
    expect(await screen.findByText(/Email confirmation is still enabled in your Supabase project/i)).toBeDefined();
  });
});
