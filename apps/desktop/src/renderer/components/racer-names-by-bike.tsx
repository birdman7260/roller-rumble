import { Fragment, type ReactNode } from "react";
import type { AppSnapshot } from "@roller-rumble/shared/types";
import type { BikeColor } from "../lib/bike-colors";
import { resolveRacerName, truncateRacerName } from "../lib/snapshot-display";

/** Text in the colour of the bike it belongs to; left plain while no bike is known. */
export function BikeName({ color, children }: { color: BikeColor | null; children: ReactNode }) {
  return <span className={color ? `bike-name--${color}` : undefined}>{children}</span>;
}

/**
 * A race's racer names as "A vs B", each in the colour of the bike that racer will ride. A slot the
 * bracket hasn't filled reads as TBD and stays plain, since no racer is headed for that bike yet.
 */
export function RacerNamesByBike({
  colors,
  maxNameLength,
  racerIds,
  snapshot
}: {
  /** One per slot of `racerIds`, from the `bike-colors` helpers. */
  colors: (BikeColor | null)[];
  /** Cuts each name past this many characters short with an ellipsis; names show in full without it. */
  maxNameLength?: number;
  racerIds: readonly (string | null)[];
  snapshot: AppSnapshot;
}) {
  return (
    <>
      {racerIds.map((racerId, index) => (
        <Fragment key={racerId ?? `slot:${String(index)}`}>
          {index > 0 ? " vs " : null}
          <BikeName color={colors[index] ?? null}>
            {maxNameLength == null
              ? resolveRacerName(snapshot, racerId, "TBD")
              : truncateRacerName(resolveRacerName(snapshot, racerId, "TBD"), maxNameLength)}
          </BikeName>
        </Fragment>
      ))}
    </>
  );
}
