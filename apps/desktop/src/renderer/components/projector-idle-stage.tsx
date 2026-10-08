import type { AppSnapshot } from "@roller-rumble/shared/types";
import { Panel } from "@roller-rumble/shared-ui";
import { m } from "framer-motion";
import type { ReactNode } from "react";
import { queueEntryBikeColors } from "../lib/bike-colors";
import type { ProjectorIdleView } from "../lib/projector-idle-view";
import { getQueuePositionLabel } from "../lib/queue-position-label";
import { formatRaceTime } from "../lib/race-time";
import { SIGNUP_PROMPT_DEFAULTS } from "../lib/signup-prompt-copy";
import {
  PROJECTOR_NAME_MAX_LENGTH,
  resolveRacerName,
  truncateRacerName
} from "../lib/snapshot-display";
import { useRowsThatFit } from "../lib/use-rows-that-fit";
import { RacerNamesByBike } from "./racer-names-by-bike";

/** How many races the projector's queue card lists before summing up the rest. */
const PROJECTOR_QUEUE_ROWS = 6;

function RacerSignupPrompt({
  compact = false,
  event: { description, signupEyebrow, signupHeading },
  qrCodeDataUrl
}: {
  /** The half-stage card: the QR with the eyebrow and heading, leaving out the body line. */
  compact?: boolean;
  event: Pick<AppSnapshot["activeEvent"], "description" | "signupEyebrow" | "signupHeading">;
  qrCodeDataUrl?: string;
}) {
  return (
    <Panel
      className={`panel--glass race-page__signup-prompt${
        compact ? " race-page__signup-prompt--compact" : ""
      }`}
    >
      <div className="race-page__signup-copy">
        <span>{signupEyebrow ?? SIGNUP_PROMPT_DEFAULTS.eyebrow}</span>
        <strong>{signupHeading ?? SIGNUP_PROMPT_DEFAULTS.heading}</strong>
        {compact ? null : (
          <p className="race-page__signup-desc">{description ?? SIGNUP_PROMPT_DEFAULTS.body}</p>
        )}
      </div>
      <div className="race-page__signup-qr-wrap">
        {qrCodeDataUrl ? (
          <img className="race-page__signup-qr" src={qrCodeDataUrl} alt="QR code for racer page" />
        ) : (
          <div className="race-page__signup-qr race-page__signup-qr--loading">Preparing QR</div>
        )}
      </div>
    </Panel>
  );
}

interface FittedRow {
  key: string;
  rank: ReactNode;
  name: ReactNode;
  detail: ReactNode;
  detailClassName?: string;
}

/**
 * A card's list, showing as many leading rows as fit. A row wraps when a long name needs a second
 * line, so how many fit depends on the names; the rest are left out. When `describeLeftOut` is
 * given, a footnote under the last row says how many races that leaves, counting `leftOutBefore`
 * that never made the list.
 */
function FittedRows({
  describeLeftOut,
  label,
  leftOutBefore = 0,
  rows
}: {
  describeLeftOut?: (count: number) => string;
  label: string;
  leftOutBefore?: number;
  rows: FittedRow[];
}) {
  const { boxRef, count, footnoteRef, footnoteTop, listRef } = useRowsThatFit(rows.length, {
    footnote: describeLeftOut == null ? "none" : leftOutBefore > 0 ? "always" : "when-cut"
  });
  const leftOut = leftOutBefore + rows.length - count;

  return (
    <div ref={boxRef} className="race-page__idle-body">
      <ol ref={listRef} aria-label={label} className="race-page__idle-list">
        {rows.map((row, index) => (
          <li
            key={row.key}
            className="race-page__idle-row"
            data-clipped={index >= count ? "" : undefined}
          >
            <span className="race-page__idle-rank">{row.rank}</span>
            <strong className="race-page__idle-name">{row.name}</strong>
            <span className={`race-page__idle-detail ${row.detailClassName ?? ""}`}>
              {row.detail}
            </span>
          </li>
        ))}
      </ol>
      {describeLeftOut ? (
        // Always rendered so its height can be reserved before it is needed.
        <p
          ref={footnoteRef}
          className="race-page__idle-footnote"
          data-clipped={leftOut > 0 ? undefined : ""}
          style={{ top: footnoteTop }}
        >
          {describeLeftOut(Math.max(leftOut, 1))}
        </p>
      ) : null}
    </div>
  );
}

function ProjectorQueueCard({ snapshot }: { snapshot: AppSnapshot }) {
  const shownEntries = snapshot.queue.slice(0, PROJECTOR_QUEUE_ROWS);

  return (
    <Panel className="panel--glass race-page__idle-card">
      <h2 className="race-page__idle-card-title">Race queue</h2>
      <FittedRows
        label="Race queue"
        leftOutBefore={snapshot.queue.length - shownEntries.length}
        describeLeftOut={(count) => `+${String(count)} more ${count === 1 ? "race" : "races"}`}
        rows={shownEntries.map((entry, index) => ({
          key: entry.id,
          rank: entry.position,
          name: (
            <RacerNamesByBike
              colors={queueEntryBikeColors(snapshot, entry)}
              maxNameLength={PROJECTOR_NAME_MAX_LENGTH}
              racerIds={entry.racerIds}
              snapshot={snapshot}
            />
          ),
          detail: getQueuePositionLabel(index, snapshot.settings.queueMinutesPerRace)
        }))}
      />
    </Panel>
  );
}

function TopRacersBoard({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <Panel className="panel--glass race-page__idle-card">
      <h2 className="race-page__idle-card-title">
        Best times · {snapshot.settings.targetDistanceMeters} m
      </h2>
      <FittedRows
        label="Top racers"
        rows={snapshot.raceProjection.topRacers.map((entry, index) => ({
          key: entry.racerId,
          rank: index + 1,
          name: truncateRacerName(resolveRacerName(snapshot, entry.racerId)),
          detail: formatRaceTime(entry.finishTimeMs),
          detailClassName: "race-page__idle-time"
        }))}
      />
    </Panel>
  );
}

/** One half of the split stage, easing in when the view swaps what it holds. */
function IdleHalf({ children }: { children: ReactNode }) {
  return (
    <m.div
      className="race-page__idle-half"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.84, 0.2, 1] }}
    >
      {children}
    </m.div>
  );
}

/**
 * The projector's stage between open time trial races: the full `signup prompt` until there is
 * something to show, then the `Queue` (or a compact signup prompt) beside the `top racers board`.
 */
export function ProjectorIdleStage({
  qrCodeDataUrl,
  snapshot,
  view
}: {
  qrCodeDataUrl?: string;
  snapshot: AppSnapshot;
  view: ProjectorIdleView;
}) {
  if (view === "signup-prompt") {
    return <RacerSignupPrompt event={snapshot.activeEvent} qrCodeDataUrl={qrCodeDataUrl} />;
  }

  const compactSignup = (
    <RacerSignupPrompt compact event={snapshot.activeEvent} qrCodeDataUrl={qrCodeDataUrl} />
  );
  const leadIsSignup = view === "signup-and-top-racers";
  const trailIsSignup = view === "queue-and-signup";
  // The queue's side and the board's side stay put, so the board never jumps across the screen
  // as the queue fills and empties; whichever of the two is empty yields to the compact prompt.
  return (
    <div className="race-page__idle-split">
      <IdleHalf key={leadIsSignup ? "lead:signup" : "lead:queue"}>
        {leadIsSignup ? compactSignup : <ProjectorQueueCard snapshot={snapshot} />}
      </IdleHalf>
      <IdleHalf key={trailIsSignup ? "trail:signup" : "trail:board"}>
        {trailIsSignup ? compactSignup : <TopRacersBoard snapshot={snapshot} />}
      </IdleHalf>
    </div>
  );
}
