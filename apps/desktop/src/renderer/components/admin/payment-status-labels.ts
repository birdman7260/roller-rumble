import type { EventPaymentStatus } from "@roller-rumble/shared/types";

export const paymentStatusLabels: Record<EventPaymentStatus, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  waived: "Waived",
  refunded: "Refunded"
};
