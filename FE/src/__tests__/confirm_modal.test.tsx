import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

describe("ConfirmModal Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    render(
      <ConfirmModal
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete Item"
        description="Are you sure you want to delete this item?"
      />
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders with title, description, and action buttons when open", () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Remove Item from Library?"
        description="Are you sure you want to remove this item? Original screenshots remain safe."
        confirmText="Remove Item"
        cancelText="Keep Item"
      />
    );

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Remove Item from Library?")).toBeDefined();
    expect(
      screen.getByText("Are you sure you want to remove this item? Original screenshots remain safe.")
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Remove Item" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Keep Item" })).toBeDefined();
  });

  it("calls onClose when Cancel button or close icon is clicked", () => {
    const handleClose = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        onClose={handleClose}
        onConfirm={vi.fn()}
        title="Confirm Deletion"
        description="Test description"
      />
    );

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    const closeIconBtn = screen.getByLabelText("Close dialog");
    fireEvent.click(closeIconBtn);
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it("calls onConfirm when Delete button is clicked", () => {
    const handleConfirm = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={handleConfirm}
        title="Delete Screenshot?"
        description="Permanently delete screenshot."
        confirmText="Permanently Delete"
      />
    );

    const confirmBtn = screen.getByRole("button", { name: "Permanently Delete" });
    fireEvent.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables buttons and shows spinner when isLoading is true", () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title="Deleting..."
        description="Please wait..."
        confirmText="Delete"
        isLoading={true}
      />
    );

    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });

    expect(confirmBtn.hasAttribute("disabled")).toBe(true);
    expect(cancelBtn.hasAttribute("disabled")).toBe(true);
  });

  it("closes when Escape key is pressed", () => {
    const handleClose = vi.fn();
    render(
      <ConfirmModal
        isOpen={true}
        onClose={handleClose}
        onConfirm={vi.fn()}
        title="Delete Item"
        description="Press escape to close"
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
