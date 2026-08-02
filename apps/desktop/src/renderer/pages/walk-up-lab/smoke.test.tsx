import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WalkUpLabPage } from "./walk-up-lab-page";

function renderVariant(variant: string) {
  return render(<WalkUpLabPage variant={variant} onVariantChange={() => undefined} />);
}

describe("walk-up lab smoke", () => {
  it("command line stages a returning rider and runs the loop", () => {
    vi.useFakeTimers();
    renderVariant("command-line");
    const field = screen.getByLabelText(/Type a name/i);
    fireEvent.change(field, { target: { value: "Kit" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByText("Kit")).toBeTruthy();

    fireEvent.keyDown(field, { key: "Enter" });
    act(() => {
      vi.advanceTimersByTime(12000);
    });
    expect(screen.getByText(/Next Rider/i)).toBeTruthy();
    vi.useRealTimers();
  });

  it("two bikes seats a rider from the picker", () => {
    renderVariant("two-bikes");
    const addButtons = screen.getAllByText(/Seat a rider/i);
    fireEvent.click(addButtons[0]);
    const chip = screen.getAllByText("Marisol Vega")[0];
    fireEvent.click(chip);
    expect(screen.getAllByText(/Solo run/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Move Across/i)).toBeTruthy();
  });

  it("roster stages by tapping a chip and swaps with S", () => {
    renderVariant("roster");
    fireEvent.click(screen.getByText("Marisol Vega"));
    expect(screen.getByText(/Left bike: Marisol Vega/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "s" });
    expect(screen.getByText(/Right bike: Marisol Vega/)).toBeTruthy();
  });
});
