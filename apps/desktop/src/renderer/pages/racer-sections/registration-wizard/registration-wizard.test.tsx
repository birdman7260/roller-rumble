import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerRacer } from "../../../lib/api";
import { RegistrationWizard } from "./registration-wizard";

vi.mock("../../../lib/api", () => ({
  registerRacer: vi.fn()
}));

const freeEvent = { paymentRequiredForQueue: false };

function type(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillContactDetails(): void {
  type("Your name", "Ada Lovelace");
  type("Phone", "(555) 010-0100");
  type("Email", "ada@example.com");
}

describe("RegistrationWizard", () => {
  beforeEach(() => {
    vi.mocked(registerRacer).mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("restores typed details after a reload", () => {
    const firstVisit = render(<RegistrationWizard event={freeEvent} onRegistered={vi.fn()} />);
    type("Your name", "Ada Lovelace");
    type("Email", "ada@example.com");
    firstVisit.unmount();

    render(<RegistrationWizard event={freeEvent} onRegistered={vi.fn()} />);

    expect(screen.getByLabelText("Your name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Email")).toHaveValue("ada@example.com");
    expect(screen.getByLabelText("Phone")).toHaveValue("");
  });

  it("returns to the racer name step after a reload once details were confirmed", () => {
    const firstVisit = render(<RegistrationWizard event={freeEvent} onRegistered={vi.fn()} />);
    fillContactDetails();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    type("Racer name", "Turbo Tortoise");
    firstVisit.unmount();

    render(<RegistrationWizard event={freeEvent} onRegistered={vi.fn()} />);

    expect(screen.getByLabelText("Racer name")).toHaveValue("Turbo Tortoise");
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });

  it("keeps Continue disabled and explains the problem until every detail is valid", () => {
    render(<RegistrationWizard event={freeEvent} onRegistered={vi.fn()} />);
    fillContactDetails();
    type("Email", "ada@");
    fireEvent.blur(screen.getByLabelText("Email"));

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Enter an email like you@example.com."
    );

    type("Email", "ada@example.com");

    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("registers with the details and racer name together, then forgets the draft", async () => {
    const result = {
      racer: { id: "racer-1", displayName: "Turbo Tortoise" },
      snapshot: {},
      sessionToken: "device-login"
    };
    vi.mocked(registerRacer).mockResolvedValue(result as never);
    const onRegistered = vi.fn();
    const view = render(<RegistrationWizard event={freeEvent} onRegistered={onRegistered} />);
    fillContactDetails();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    type("Racer name", "Turbo Tortoise");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(onRegistered).toHaveBeenCalledWith(result);
    });
    expect(registerRacer).toHaveBeenCalledWith({
      realName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "(555) 010-0100",
      displayName: "Turbo Tortoise"
    });
    view.unmount();
    render(<RegistrationWizard event={freeEvent} onRegistered={vi.fn()} />);
    expect(screen.getByLabelText("Your name")).toHaveValue("");
  });

  it("keeps the racer on the racer name step when registration fails", async () => {
    vi.mocked(registerRacer).mockRejectedValue(new Error("Registration is closed."));
    render(<RegistrationWizard event={freeEvent} onRegistered={vi.fn()} />);
    fillContactDetails();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    type("Racer name", "Turbo Tortoise");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Registration is closed.");
    expect(screen.getByLabelText("Racer name")).toHaveValue("Turbo Tortoise");
  });
});
