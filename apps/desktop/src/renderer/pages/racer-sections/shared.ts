import type { BracketNode, ChallengeReplacementOption } from "@roller-rumble/shared/types";
import type { MotionProps } from "framer-motion";

const usdPaymentAmountFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD"
});

export interface RacerQueueSignupInput {
  opponentRacerId?: string;
  requestedType?: "solo" | "auto-match";
  replaceQueueEntryId?: string;
}

export type TournamentRaceCard =
  | {
      id: string;
      kind: "bracket";
      label: string;
      racerAId?: string | null;
      racerBId?: string | null;
      roundLabel: string;
      state: BracketNode["state"];
      winnerRacerId?: string | null;
    }
  | {
      id: string;
      kind: "group";
      label: string;
      racerAId: string;
      racerBId: string;
      roundLabel: string;
      state: "ready" | "finished";
      winnerRacerId?: string | null;
    };

export interface ChallengeReplacementRequest {
  message: string;
  opponentRacerId: string;
  replaceableMatches: ChallengeReplacementOption[];
}

export interface QueueIssueModal {
  eyebrow: string;
  title: string;
  message: string;
}

export interface SectionMotionProps {
  layoutTransition: MotionProps["transition"];
  supportingCardMotion: MotionProps;
}

export function formatPaymentAmount(amountCents: number | null | undefined, currency: string): string {
  if (typeof amountCents !== "number") {
    return "fee not set";
  }

  const normalizedCurrency = currency.toUpperCase();
  if (normalizedCurrency === "USD") {
    return usdPaymentAmountFormatter.format(amountCents / 100);
  }

  return `${normalizedCurrency} ${(amountCents / 100).toFixed(2)}`;
}

export function formatFinishTime(milliseconds: number | null | undefined): string {
  if (typeof milliseconds !== "number") {
    return "No finish yet";
  }

  const totalSeconds = milliseconds / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(2)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${String(minutes)}:${seconds.toFixed(2).padStart(5, "0")}`;
}
