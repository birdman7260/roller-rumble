import type { EventPaymentStatus } from "@roller-rumble/shared/types";
import { formatRaceTime } from "../../lib/race-time";

export const paymentStatusLabels: Record<EventPaymentStatus, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  waived: "Waived",
  refunded: "Refunded"
};

/** A racer's speed stat, or a dash before they have raced. */
export function formatSpeed(kph: number): string {
  return kph > 0 ? `${kph.toFixed(1)} km/h` : "—";
}

/** A racer's best finish, or a dash before they have one. */
export function formatFastestTime(milliseconds: number | null | undefined): string {
  return typeof milliseconds === "number" ? formatRaceTime(milliseconds) : "—";
}
