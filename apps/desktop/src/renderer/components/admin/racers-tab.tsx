import { useId, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { RacerSummary } from "@roller-rumble/shared/types";
import { Button, Panel, TextInput } from "@roller-rumble/shared-ui";
import { signUpQueue } from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";
import { useMasonryGrid } from "../../lib/use-masonry-grid";
import { QuickAddRacerPanel } from "./quick-add-racer";
import { RacerDetailsModal } from "./racer-details-modal";
import { formatFastestTime, formatSpeed, paymentStatusLabels } from "./racer-format";
import { racerSortOptions, sortRacers, type RacerSort, type RacerSortKey } from "./racer-sort";

/** Operator-only `contact details`; racer phones never receive these. */
function RacerContactDetails({ racer }: { racer: RacerSummary["racer"] }) {
  const details = [racer.realName, racer.phone, racer.email].filter(Boolean);
  return details.length > 0 ? <p className="muted">{details.join(" · ")}</p> : null;
}

/** Vertical ellipsis: the conventional "more actions" glyph. */
function MoreIcon() {
  return (
    <svg className="button__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function RacerRow({
  entry,
  paymentRequiredForQueue,
  onOpenDetails
}: {
  entry: RacerSummary;
  paymentRequiredForQueue: boolean;
  onOpenDetails: () => void;
}) {
  return (
    <div className="list-row">
      <div>
        <strong>{entry.racer.displayName}</strong>
        <RacerContactDetails racer={entry.racer} />
        <p>
          {entry.stats.races} races · {entry.stats.wins} wins · Top{" "}
          {formatSpeed(entry.stats.topSpeedKph)} · Fastest{" "}
          {formatFastestTime(entry.stats.bestFinishTimeMs)}
        </p>
        {paymentRequiredForQueue ? (
          <p>Entrance fee: {paymentStatusLabels[entry.payment.status]}</p>
        ) : null}
      </div>
      <div className="button-row">
        <Button
          onClick={() => {
            fireAndForget(signUpQueue({ racerId: entry.racer.id, requestedType: "auto-match" }));
          }}
        >
          Queue
        </Button>
        <Button
          variant="ghost"
          className="button--icon"
          aria-label={`More for ${entry.racer.displayName}`}
          title="More"
          onClick={onOpenDetails}
        >
          <MoreIcon />
        </Button>
      </div>
    </div>
  );
}

function RacerSortControls({
  sort,
  setSort
}: {
  sort: RacerSort;
  setSort: Dispatch<SetStateAction<RacerSort>>;
}) {
  const sortById = useId();
  const ascending = sort.direction === "asc";

  return (
    <div className="racer-sort">
      <label htmlFor={sortById}>Sort by</label>
      <select
        id={sortById}
        value={sort.key}
        onChange={(event) => {
          const key = event.target.value as RacerSortKey;
          const option = racerSortOptions.find((candidate) => candidate.key === key);
          setSort({ key, direction: option?.defaultDirection ?? "asc" });
        }}
      >
        {racerSortOptions.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      <Button
        variant="ghost"
        title="Flip sort direction"
        onClick={() => {
          setSort((current) => ({
            ...current,
            direction: current.direction === "asc" ? "desc" : "asc"
          }));
        }}
      >
        <span aria-hidden="true">{ascending ? "↑" : "↓"}</span>{" "}
        {ascending ? "Ascending" : "Descending"}
      </Button>
    </div>
  );
}

export function RacersTab({
  filteredRacers,
  search,
  setSearch,
  sort,
  setSort,
  paymentRequiredForQueue
}: {
  filteredRacers: RacerSummary[];
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  sort: RacerSort;
  setSort: Dispatch<SetStateAction<RacerSort>>;
  paymentRequiredForQueue: boolean;
}) {
  const gridRef = useMasonryGrid();
  const [detailsRacerId, setDetailsRacerId] = useState<string | null>(null);
  // Looked up live so payment changes show while the dialog is open.
  const detailsEntry = filteredRacers.find((entry) => entry.racer.id === detailsRacerId);
  const sortedRacers = sortRacers(filteredRacers, sort);

  return (
    <>
      <div ref={gridRef} className="page-grid page-grid--masonry">
        <QuickAddRacerPanel />

        <Panel title="Registered Racers">
          <div className="form-row">
            <TextInput
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              placeholder="Search name, phone, or email"
              aria-label="Search racers"
            />
          </div>
          <RacerSortControls sort={sort} setSort={setSort} />
          <div className="list">
            {sortedRacers.map((entry) => (
              <RacerRow
                key={entry.racer.id}
                entry={entry}
                paymentRequiredForQueue={paymentRequiredForQueue}
                onOpenDetails={() => {
                  setDetailsRacerId(entry.racer.id);
                }}
              />
            ))}
          </div>
        </Panel>
      </div>

      {detailsEntry ? (
        <RacerDetailsModal
          entry={detailsEntry}
          paymentRequiredForQueue={paymentRequiredForQueue}
          onClose={() => {
            setDetailsRacerId(null);
          }}
        />
      ) : null}
    </>
  );
}
