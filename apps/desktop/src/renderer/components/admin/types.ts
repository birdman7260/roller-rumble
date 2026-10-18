export type AdminTabId = "event" | "race" | "racers" | "tournaments" | "settings" | "sensor";

export const adminTabs: {
  id: AdminTabId;
  label: string;
  description: string;
}[] = [
  {
    id: "event",
    label: "Event",
    description: "Current event details, mode snapshot, and session totals."
  },
  {
    id: "race",
    label: "Race Desk",
    description: "Stage, start, recover, and manage the active race queue."
  },
  {
    id: "racers",
    label: "Racers",
    description: "Register riders quickly and manage upcoming participation."
  },
  {
    id: "tournaments",
    label: "Tournaments",
    description: "Create bracket presets and review the tournament list."
  },
  {
    id: "settings",
    label: "Settings",
    description: "Theme, cue triggers, data scope, and public tunnel controls."
  },
  {
    id: "sensor",
    label: "Bike Sensor",
    description: "Watch the race box live, dial in how riders are measured, and follow the app log."
  }
];
