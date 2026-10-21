import type { RacerSummary } from "@roller-rumble/shared/types";

export type RacerSortKey = "displayName" | "realName" | "fastestTime" | "races" | "wins";
export type RacerSortDirection = "asc" | "desc";

export interface RacerSort {
  key: RacerSortKey;
  direction: RacerSortDirection;
}

/** In menu order. Counts start most-first; names and times start A-Z / quickest-first. */
export const racerSortOptions: {
  key: RacerSortKey;
  label: string;
  defaultDirection: RacerSortDirection;
}[] = [
  { key: "displayName", label: "Display name", defaultDirection: "asc" },
  { key: "realName", label: "Real name", defaultDirection: "asc" },
  { key: "fastestTime", label: "Fastest time", defaultDirection: "asc" },
  { key: "races", label: "Races", defaultDirection: "desc" },
  { key: "wins", label: "Wins", defaultDirection: "desc" }
];

/** The value a key sorts on, always from the active event; `null` means the racer has none and sinks to the bottom. */
const sortValues: Record<RacerSortKey, (entry: RacerSummary) => string | number | null> = {
  displayName: (entry) => entry.racer.displayName,
  realName: (entry) => {
    // A blank real name counts as none, so it sinks with the missing ones.
    const realName = entry.racer.realName?.trim() ?? "";
    return realName === "" ? null : realName;
  },
  fastestTime: (entry) => entry.stats.eventBestFinishTimeMs,
  races: (entry) => entry.stats.eventRaces,
  wins: (entry) => entry.stats.eventWins
};

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function compareValues(left: string | number, right: string | number): number {
  return typeof left === "number" && typeof right === "number"
    ? left - right
    : compareText(String(left), String(right));
}

export function sortRacers(racers: RacerSummary[], sort: RacerSort): RacerSummary[] {
  const valueOf = sortValues[sort.key];
  const sign = sort.direction === "asc" ? 1 : -1;
  return racers.toSorted((left, right) => {
    const leftValue = valueOf(left);
    const rightValue = valueOf(right);
    if (leftValue !== rightValue) {
      if (leftValue === null) {
        return 1;
      }
      if (rightValue === null) {
        return -1;
      }
      const order = compareValues(leftValue, rightValue);
      if (order !== 0) {
        return sign * order;
      }
    }
    // Ties (and racers missing the value) fall back to display name so the list stays stable.
    return compareText(left.racer.displayName, right.racer.displayName);
  });
}
