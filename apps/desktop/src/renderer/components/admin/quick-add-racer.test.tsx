import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addRacerAtDesk } from "../../lib/api";
import { QuickAddRacerPanel } from "./quick-add-racer";

vi.mock("../../lib/api", () => ({
  addRacerAtDesk: vi.fn(async (input: { displayName: string }) => ({
    racer: { id: "racer-1", ...input },
    snapshot: {}
  }))
}));

function type(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("QuickAddRacerPanel", () => {
  beforeEach(() => {
    vi.mocked(addRacerAtDesk).mockClear();
  });

  it("requires a display name before a racer can be added", () => {
    render(<QuickAddRacerPanel />);
    type("Real name (optional)", "Ada Lovelace");

    expect(screen.getByRole("button", { name: "Add Racer" })).toBeDisabled();
  });

  it("adds a racer with only a display name", async () => {
    render(<QuickAddRacerPanel />);
    type("Display name", "  Speedy  ");
    fireEvent.click(screen.getByRole("button", { name: "Add Racer" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Added Speedy.");
    });
    expect(addRacerAtDesk).toHaveBeenCalledWith({ displayName: "Speedy" });
    expect(screen.getByLabelText("Display name")).toHaveValue("");
  });

  it("sends the optional contact details when given", async () => {
    render(<QuickAddRacerPanel />);
    type("Display name", "Speedy");
    type("Real name (optional)", "Ada Lovelace");
    type("Email (optional)", "ada@example.com");
    type("Phone (optional)", "555-010-0100");
    fireEvent.click(screen.getByRole("button", { name: "Add Racer" }));

    await waitFor(() => {
      expect(addRacerAtDesk).toHaveBeenCalledWith({
        displayName: "Speedy",
        realName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "555-010-0100"
      });
    });
  });

  it("explains a malformed email instead of sending it", () => {
    render(<QuickAddRacerPanel />);
    type("Display name", "Speedy");
    type("Email (optional)", "not-an-email");
    fireEvent.click(screen.getByRole("button", { name: "Add Racer" }));

    expect(screen.getByRole("status")).toHaveTextContent("Check the email.");
    expect(addRacerAtDesk).not.toHaveBeenCalled();
  });
});
