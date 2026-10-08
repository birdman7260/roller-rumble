import type { AppSnapshot, QueueEntry } from "@roller-rumble/shared/types";
import { Panel } from "@roller-rumble/shared-ui";
import { m } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { queueEntryBikeColors } from "../lib/bike-colors";
import type { ProjectorIdleView } from "../lib/projector-idle-view";
import { getQueuePositionLabel } from "../lib/queue-position-label";
import { formatRaceTime } from "../lib/race-time";
import { SIGNUP_PROMPT_DEFAULTS } from "../lib/signup-prompt-copy";
import { resolveRacerName } from "../lib/snapshot-display";
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

/** The races the queue card lists, and how many more it sums up in a footnote line. */
function splitProjectorQueue(queue: readonly QueueEntry[]): {
  hiddenCount: number;
  shownEntries: QueueEntry[];
} {
  const shownEntries = queue.slice(0, PROJECTOR_QUEUE_ROWS);
  return { hiddenCount: queue.length - shownEntries.length, shownEntries };
}

/** How many lines a list needs, so the stage can size its rows to fit the card. */
function countQueueLines(queue: readonly QueueEntry[]): number {
  const { hiddenCount, shownEntries } = splitProjectorQueue(queue);
  return shownEntries.length + (hiddenCount > 0 ? 1 : 0);
}

function ProjectorQueueCard({ snapshot }: { snapshot: AppSnapshot }) {
  const { hiddenCount, shownEntries } = splitProjectorQueue(snapshot.queue);

  return (
    <Panel className="panel--glass race-page__idle-card">
      <h2 className="race-page__idle-card-title">Race queue</h2>
      <div className="race-page__idle-body">
        <div className="race-page__idle-lines">
          <ol aria-label="Race queue" className="race-page__idle-list">
            {shownEntries.map((entry, index) => (
              <li key={entry.id} className="race-page__idle-row">
                <span className="race-page__idle-rank">{entry.position}</span>
                <strong className="race-page__idle-name">
                  <RacerNamesByBike
                    colors={queueEntryBikeColors(snapshot, entry)}
                    racerIds={entry.racerIds}
                    snapshot={snapshot}
                  />
                </strong>
                <span className="race-page__idle-detail">
                  {getQueuePositionLabel(index, snapshot.settings.queueMinutesPerRace)}
                </span>
              </li>
            ))}
          </ol>
          {hiddenCount > 0 ? (
            <p className="race-page__idle-footnote">
              +{hiddenCount} more {hiddenCount === 1 ? "race" : "races"}
            </p>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

function TopRacersBoard({ snapshot }: { snapshot: AppSnapshot }) {
  return (
    <Panel className="panel--glass race-page__idle-card">
      <h2 className="race-page__idle-card-title">
        Best times · {snapshot.settings.targetDistanceMeters} m
      </h2>
      <div className="race-page__idle-body">
        <div className="race-page__idle-lines">
          <ol aria-label="Top racers" className="race-page__idle-list">
            {snapshot.raceProjection.topRacers.map((entry, index) => (
              <li key={entry.racerId} className="race-page__idle-row">
                <span className="race-page__idle-rank">{index + 1}</span>
                <strong className="race-page__idle-name">
                  {resolveRacerName(snapshot, entry.racerId)}
                </strong>
                <span className="race-page__idle-detail race-page__idle-time">
                  {formatRaceTime(entry.finishTimeMs)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
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
  // Both halves size their rows for the longer list, so the queue and the board read at one size
  // and the longer list still fits its card without spilling over the footnote.
  const lineCount = Math.max(
    leadIsSignup ? 0 : countQueueLines(snapshot.queue),
    trailIsSignup ? 0 : snapshot.raceProjection.topRacers.length
  );

  // The queue's side and the board's side stay put, so the board never jumps across the screen
  // as the queue fills and empties; whichever of the two is empty yields to the compact prompt.
  return (
    <div className="race-page__idle-split" style={{ "--idle-lines": lineCount } as CSSProperties}>
      <IdleHalf key={leadIsSignup ? "lead:signup" : "lead:queue"}>
        {leadIsSignup ? compactSignup : <ProjectorQueueCard snapshot={snapshot} />}
      </IdleHalf>
      <IdleHalf key={trailIsSignup ? "trail:signup" : "trail:board"}>
        {trailIsSignup ? compactSignup : <TopRacersBoard snapshot={snapshot} />}
      </IdleHalf>
    </div>
  );
}
