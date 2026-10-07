import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { EventPaymentStatus, EventRecord, RacerSummary } from "@roller-rumble/shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRacerEntryCheckout } from "../../../lib/api";
import { RegistrationWizard } from "./registration-wizard";
import { useRegisteredRacerSteps } from "./use-registered-racer-steps";

vi.mock("../../../lib/api", () => ({
  registerRacer: vi.fn(),
  startRacerEntryCheckout: vi.fn(),
  createRacerPhotoBoothToken: vi.fn(() => new Promise(() => undefined))
}));

type WizardEvent = Pick<
  EventRecord,
  "paymentRequiredForQueue" | "paymentAmountCents" | "paymentCurrency"
>;

const freeEvent: WizardEvent = { paymentRequiredForQueue: false, paymentCurrency: "usd" };
const paidEvent: WizardEvent = {
  paymentRequiredForQueue: true,
  paymentAmountCents: 1000,
  paymentCurrency: "usd"
};

function makeRacer(
  options: { avatarUrl?: string | null; paymentStatus?: EventPaymentStatus } = {}
): RacerSummary {
  return {
    racer: {
      id: "racer-1",
      displayName: "Turbo Tortoise",
      avatarUrl: options.avatarUrl ?? null,
      realName: null,
      email: null,
      phone: null,
      createdAt: "2026-10-07T00:00:00.000Z",
      updatedAt: "2026-10-07T00:00:00.000Z"
    },
    stats: {} as RacerSummary["stats"],
    payment: { status: options.paymentStatus ?? "unpaid" }
  };
}

interface HarnessProps {
  racer: RacerSummary;
  event?: WizardEvent;
  onlinePaymentAvailable?: boolean;
  paymentReturnState?: string | null;
  photoBoothEnabled?: boolean;
  onAvatarUpload?: () => Promise<void>;
  onSignOut?: () => void;
}

// Mirrors the racer page: the wizard stays up until the signed-in racer has no step left.
function SignedInRacerPage({
  racer,
  event = freeEvent,
  onlinePaymentAvailable = false,
  paymentReturnState = null,
  photoBoothEnabled = false,
  onAvatarUpload = vi.fn(async () => undefined),
  onSignOut = vi.fn()
}: HarnessProps) {
  const steps = useRegisteredRacerSteps({ event, racer, onlinePaymentAvailable });
  if (steps.currentStepId === null) {
    return <p>Race page</p>;
  }
  return (
    <>
      {/* The racer page holds the photo step as soon as the racer registers. */}
      <button
        type="button"
        onClick={() => {
          steps.holdPhotoStep(racer.racer.id);
        }}
      >
        Just registered
      </button>
      <RegistrationWizard
        event={event}
        onRegistered={vi.fn()}
        signedIn={{
          racer,
          steps,
          avatarUrl: racer.racer.avatarUrl ?? null,
          avatarUploadBusy: false,
          avatarUploadMessage: null,
          onAvatarUpload,
          onSignOut,
          onlinePaymentAvailable,
          paymentReturnState,
          photoBoothEnabled
        }}
      />
    </>
  );
}

describe("RegistrationWizard after the racer is created", () => {
  beforeEach(() => {
    vi.mocked(startRacerEntryCheckout).mockReset();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("won't let the racer past the photo step without a photo", () => {
    render(<SignedInRacerPage racer={makeRacer()} />);

    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByLabelText("Take a selfie")).toHaveAttribute("capture", "user");
    expect(screen.getByLabelText("Choose a photo")).not.toHaveAttribute("capture");
  });

  it("shows the new photo with a retake option before moving on", async () => {
    const onAvatarUpload = vi.fn(async () => undefined);
    const view = render(<SignedInRacerPage racer={makeRacer()} onAvatarUpload={onAvatarUpload} />);
    fireEvent.change(screen.getByLabelText("Take a selfie"), {
      target: { files: [new File(["selfie"], "selfie.jpg", { type: "image/jpeg" })] }
    });
    await waitFor(() => {
      expect(onAvatarUpload).toHaveBeenCalled();
    });

    view.rerender(<SignedInRacerPage racer={makeRacer({ avatarUrl: "/avatars/racer-1.jpg" })} />);

    expect(screen.getByRole("img", { name: "Turbo Tortoise" })).toHaveAttribute(
      "src",
      "/avatars/racer-1.jpg"
    );
    expect(screen.getByLabelText("Retake selfie")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Race page")).toBeInTheDocument();
  });

  it("lets a racer who is stuck mid-registration sign out and start over", () => {
    const onSignOut = vi.fn();
    render(
      <SignedInRacerPage
        racer={makeRacer({ avatarUrl: "/avatars/racer-1.jpg" })}
        event={paidEvent}
        onlinePaymentAvailable
        onSignOut={onSignOut}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out and start over" }));

    expect(onSignOut).toHaveBeenCalled();
  });

  it("offers the photo booth when the event has one", () => {
    render(<SignedInRacerPage racer={makeRacer()} photoBoothEnabled />);

    expect(screen.getByText("Kaleidoscope Photo Booth")).toBeInTheDocument();
  });

  it("completes the photo step when a booth photo arrives by snapshot", () => {
    const view = render(<SignedInRacerPage racer={makeRacer()} photoBoothEnabled />);

    view.rerender(
      <SignedInRacerPage racer={makeRacer({ avatarUrl: "/avatars/booth.jpg" })} photoBoothEnabled />
    );

    expect(screen.getByText("Race page")).toBeInTheDocument();
  });

  it("lets a racer who just registered review a booth photo before moving on", () => {
    const view = render(<SignedInRacerPage racer={makeRacer()} />);
    fireEvent.click(screen.getByRole("button", { name: "Just registered" }));

    view.rerender(<SignedInRacerPage racer={makeRacer({ avatarUrl: "/avatars/booth.jpg" })} />);

    expect(screen.getByRole("img", { name: "Turbo Tortoise" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("skips payment when the event charges no entry fee", () => {
    render(<SignedInRacerPage racer={makeRacer({ avatarUrl: "/avatars/racer-1.jpg" })} />);

    expect(screen.getByText("Race page")).toBeInTheDocument();
  });

  it("opens Stripe Checkout for the entry fee", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { href: "http://localhost/racer", assign });
    vi.mocked(startRacerEntryCheckout).mockResolvedValue({
      paymentId: "payment-1",
      checkoutUrl: "https://checkout.stripe.test/session"
    });
    render(
      <SignedInRacerPage
        racer={makeRacer({ avatarUrl: "/avatars/racer-1.jpg" })}
        event={paidEvent}
        onlinePaymentAvailable
      />
    );

    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pay $10.00" }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/session");
    });
  });

  it("finishes once Stripe confirms the payment after a successful checkout", () => {
    const racer = makeRacer({ avatarUrl: "/avatars/racer-1.jpg" });
    const view = render(
      <SignedInRacerPage
        racer={racer}
        event={paidEvent}
        onlinePaymentAvailable
        paymentReturnState="success"
      />
    );

    expect(screen.getByText(/confirming your payment/i)).toBeInTheDocument();

    view.rerender(
      <SignedInRacerPage
        racer={makeRacer({ avatarUrl: "/avatars/racer-1.jpg", paymentStatus: "paid" })}
        event={paidEvent}
        onlinePaymentAvailable
        paymentReturnState="success"
      />
    );

    expect(screen.getByText("Race page")).toBeInTheDocument();
  });

  it("stays on the payment step after a cancelled checkout", () => {
    render(
      <SignedInRacerPage
        racer={makeRacer({ avatarUrl: "/avatars/racer-1.jpg" })}
        event={paidEvent}
        onlinePaymentAvailable
        paymentReturnState="cancelled"
      />
    );

    expect(screen.getByText(/checkout was cancelled/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay $10.00" })).toBeEnabled();
  });

  it("tells the racer to pay at the desk when online payment isn't set up", () => {
    const racer = makeRacer({ avatarUrl: "/avatars/racer-1.jpg" });
    const view = render(<SignedInRacerPage racer={racer} event={paidEvent} />);

    expect(screen.getByText("Pay at the desk")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pay \$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.getByText("Race page")).toBeInTheDocument();

    view.unmount();
    render(<SignedInRacerPage racer={racer} event={paidEvent} />);
    expect(screen.getByText("Race page")).toBeInTheDocument();
  });
});
