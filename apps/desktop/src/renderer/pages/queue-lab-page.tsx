import type { QueueEntry, QueueOccurrence } from "@roller-rumble/shared/types";
import { useReducer, useRef } from "react";
import {
  Button,
  EmptyState,
  Panel,
  SearchableSelect,
  StatPill,
  TextInput
} from "@roller-rumble/shared-ui";
import {
  addQueueSignup,
  findNextQueuedEntry,
  projectQueueEntries,
  removeRacerFromQueue,
  removeRacerFromSpecificQueueEntry
} from "@backend/services/queue";

interface LabRacer {
  id: string;
  displayName: string;
  raceCount: number;
  winCount: number;
}

const labEventId = "queue-lab-event";

const initialRacers: LabRacer[] = [
  { id: "lab-racer-1", displayName: "Bird", raceCount: 0, winCount: 0 },
  { id: "lab-racer-2", displayName: "Birdy", raceCount: 0, winCount: 0 },
  { id: "lab-racer-3", displayName: "Aadafsdf", raceCount: 1, winCount: 0 },
  { id: "lab-racer-4", displayName: "Canyon Cat", raceCount: 2, winCount: 1 },
  { id: "lab-racer-5", displayName: "Neon Goose", raceCount: 0, winCount: 0 },
  { id: "lab-racer-6", displayName: "Chain Lightning", raceCount: 3, winCount: 1 }
];

interface QueueLabState {
  activityLog: string[];
  challengeOpponentId: string;
  challengeRacerId: string;
  entries: QueueEntry[];
  maxActiveOccurrences: number;
  newRacerName: string;
  notice: string;
  occurrences: QueueOccurrence[];
  racers: LabRacer[];
  selectedRacerId: string;
}

const initialQueueLabState: QueueLabState = {
  activityLog: ["Queue lab loaded with demo racers."],
  challengeOpponentId: initialRacers[1]?.id ?? "",
  challengeRacerId: initialRacers[0]?.id ?? "",
  entries: [],
  maxActiveOccurrences: 3,
  newRacerName: "",
  notice: "Ready to test the queue.",
  occurrences: [],
  racers: initialRacers,
  selectedRacerId: initialRacers[0]?.id ?? ""
};

function queueLabReducer(state: QueueLabState, patch: Partial<QueueLabState>): QueueLabState {
  return { ...state, ...patch };
}

function makeTimestamp(): string {
  return new Date().toISOString();
}

function getNextSignupSequence(occurrences: QueueOccurrence[]): number {
  return Math.max(0, ...occurrences.map((occurrence) => occurrence.signupSequence)) + 1;
}

function getRacerName(racers: LabRacer[], racerId: string): string {
  return racers.find((racer) => racer.id === racerId)?.displayName ?? "Unknown racer";
}

function getEntryLabel(entry: QueueEntry): string {
  if (entry.lockType === "challenge") {
    return "Locked challenge";
  }

  if (entry.requestedType === "solo") {
    return "Solo request";
  }

  return entry.racerIds.length > 1 ? "Auto-matched" : "Waiting for match";
}

function getActiveCount(occurrences: QueueOccurrence[], racerId: string): number {
  return occurrences.filter(
    (occurrence) =>
      occurrence.racerId === racerId && ["queued", "staging", "racing"].includes(occurrence.status)
  ).length;
}

function getOccurrenceSummary(occurrences: QueueOccurrence[], occurrenceId: string): string {
  const occurrence = occurrences.find((candidate) => candidate.id === occurrenceId);
  if (!occurrence) {
    return "missing";
  }

  return `${occurrence.intent} · bumps ${occurrence.bumpCount}`;
}

interface RacerOption {
  label: string;
  value: string;
}

interface QueueLabController {
  activityLog: string[];
  challengeOpponentId: string;
  challengePairInvalid: boolean;
  challengeRacerId: string;
  entries: QueueEntry[];
  maxActiveOccurrences: number;
  newRacerName: string;
  nextReadyEntry: QueueEntry | null;
  notice: string;
  occurrences: QueueOccurrence[];
  racerOptions: RacerOption[];
  racers: LabRacer[];
  selectedRacerId: string;
  waitingEntries: QueueEntry[];
  addRacer: () => void;
  completeEntry: (entry: QueueEntry, winnerRacerId: string) => void;
  createChallenge: () => void;
  queueRacer: (racerId: string, requestedType?: "auto-match" | "solo") => void;
  removeAllForRacer: (racerId: string) => void;
  removeFromEntry: (entryId: string, racerId: string) => void;
  resetLab: () => void;
  resetQueue: () => void;
  setChallengeOpponentId: (racerId: string) => void;
  setChallengeRacerId: (racerId: string) => void;
  setMaxActiveOccurrences: (value: number) => void;
  setNewRacerName: (name: string) => void;
  setSelectedRacerId: (racerId: string) => void;
}

function QueueLabHero({
  entriesCount,
  maxActiveOccurrences,
  racersCount,
  waitingCount
}: {
  entriesCount: number;
  maxActiveOccurrences: number;
  racersCount: number;
  waitingCount: number;
}) {
  return (
    <section className="queue-lab__hero panel panel--glass">
      <div>
        <p className="eyebrow">Operations Lab</p>
        <h1>Queue Lab</h1>
        <p>
          Stress-test open time trial queue behavior with real projection logic: auto-matching,
          locked challenges, removals, bump counts, race completion, and per-racer limits.
        </p>
      </div>
      <div className="queue-lab__stats">
        <StatPill label="Racers" value={racersCount} />
        <StatPill label="Queue spots" value={entriesCount} />
        <StatPill label="Waiting" value={waitingCount} />
        <StatPill label="Max each" value={maxActiveOccurrences} />
      </div>
    </section>
  );
}

function QueueLabControlsPanel({
  challengeOpponentId,
  challengePairInvalid,
  challengeRacerId,
  maxActiveOccurrences,
  newRacerName,
  racerOptions,
  selectedRacerId,
  onAddRacer,
  onChallengeOpponentChange,
  onChallengeRacerChange,
  onCreateChallenge,
  onMaxActiveOccurrencesChange,
  onNewRacerNameChange,
  onQueueRacer,
  onResetLab,
  onResetQueue,
  onSelectedRacerChange
}: {
  challengeOpponentId: string;
  challengePairInvalid: boolean;
  challengeRacerId: string;
  maxActiveOccurrences: number;
  newRacerName: string;
  racerOptions: RacerOption[];
  selectedRacerId: string;
  onAddRacer: () => void;
  onChallengeOpponentChange: (racerId: string) => void;
  onChallengeRacerChange: (racerId: string) => void;
  onCreateChallenge: () => void;
  onMaxActiveOccurrencesChange: (value: number) => void;
  onNewRacerNameChange: (value: string) => void;
  onQueueRacer: (racerId: string, requestedType?: "auto-match" | "solo") => void;
  onResetLab: () => void;
  onResetQueue: () => void;
  onSelectedRacerChange: (racerId: string) => void;
}) {
  return (
    <Panel title="Controls" className="queue-lab__controls">
      <div className="queue-lab__control-stack">
        <label htmlFor="queue-lab-max-active">
          Max active queue entries per racer
          <TextInput
            id="queue-lab-max-active"
            min={1}
            max={10}
            type="number"
            value={maxActiveOccurrences}
            onChange={(event) => {
              const parsedValue = Number.parseInt(event.target.value, 10);
              onMaxActiveOccurrencesChange(Number.isNaN(parsedValue) ? 1 : parsedValue);
            }}
          />
        </label>
        <label htmlFor="queue-lab-new-racer">
          Add racer
          <div className="queue-lab__inline-controls">
            <TextInput
              id="queue-lab-new-racer"
              placeholder="Racer name"
              value={newRacerName}
              onChange={(event) => {
                onNewRacerNameChange(event.target.value);
              }}
            />
            <Button variant="accent" onClick={onAddRacer}>
              Add
            </Button>
          </div>
        </label>
        <label htmlFor="queue-lab-selected-racer">
          Put racer in queue
          <SearchableSelect
            id="queue-lab-selected-racer"
            value={selectedRacerId}
            options={racerOptions}
            placeholder="Choose racer"
            onValueChange={onSelectedRacerChange}
          />
        </label>
        <div className="button-row">
          <Button
            variant="accent"
            disabled={!selectedRacerId}
            onClick={() => {
              onQueueRacer(selectedRacerId);
            }}
          >
            Queue Auto
          </Button>
          <Button
            disabled={!selectedRacerId}
            onClick={() => {
              onQueueRacer(selectedRacerId, "solo");
            }}
          >
            Queue Solo
          </Button>
        </div>
      </div>

      <div className="queue-lab__challenge-builder">
        <h3>Create Challenge</h3>
        <label htmlFor="queue-lab-challenger">
          Challenger
          <SearchableSelect
            id="queue-lab-challenger"
            value={challengeRacerId}
            options={racerOptions}
            placeholder="Choose challenger"
            onValueChange={onChallengeRacerChange}
          />
        </label>
        <label htmlFor="queue-lab-opponent">
          Opponent
          <SearchableSelect
            id="queue-lab-opponent"
            value={challengeOpponentId}
            options={racerOptions}
            placeholder="Choose opponent"
            onValueChange={onChallengeOpponentChange}
          />
        </label>
        {challengePairInvalid ? (
          <p className="queue-lab__warning">A racer cannot challenge themselves.</p>
        ) : null}
        <Button
          variant="accent"
          disabled={!challengeRacerId || !challengeOpponentId || challengePairInvalid}
          onClick={onCreateChallenge}
        >
          Lock Challenge Match
        </Button>
      </div>

      <div className="queue-lab__control-footer">
        <Button variant="ghost" onClick={onResetQueue}>
          Clear Queue
        </Button>
        <Button variant="ghost" onClick={onResetLab}>
          Reset Lab
        </Button>
      </div>
    </Panel>
  );
}

function QueueLabRacersPanel({
  occurrences,
  racers,
  onQueueRacer,
  onRemoveAllForRacer
}: {
  occurrences: QueueOccurrence[];
  racers: LabRacer[];
  onQueueRacer: (racerId: string) => void;
  onRemoveAllForRacer: (racerId: string) => void;
}) {
  return (
    <Panel title="Racers" className="queue-lab__racers">
      <div className="queue-lab__racer-list">
        {racers.map((racer) => (
          <article key={racer.id} className="queue-lab__racer-card">
            <div>
              <strong>{racer.displayName}</strong>
              <span>
                {racer.raceCount} races · {racer.winCount} wins ·{" "}
                {getActiveCount(occurrences, racer.id)} active queue spots
              </span>
            </div>
            <div className="queue-lab__racer-actions">
              <Button
                variant="accent"
                onClick={() => {
                  onQueueRacer(racer.id);
                }}
              >
                Queue
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  onRemoveAllForRacer(racer.id);
                }}
              >
                Remove All
              </Button>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

function QueueLabNextRacePanel({
  nextReadyEntry,
  racers,
  onCompleteEntry
}: {
  nextReadyEntry: QueueEntry | null;
  racers: LabRacer[];
  onCompleteEntry: (entry: QueueEntry, winnerRacerId: string) => void;
}) {
  return (
    <Panel
      title="Next Race"
      className="queue-lab__next"
      actions={
        nextReadyEntry ? <StatPill label="Position" value={nextReadyEntry.position} /> : null
      }
    >
      {nextReadyEntry ? (
        <div className="queue-lab__next-race">
          <p>{getEntryLabel(nextReadyEntry)}</p>
          <div className="queue-lab__next-racers">
            {nextReadyEntry.racerIds.map((racerId) => (
              <Button
                key={racerId}
                variant="accent"
                onClick={() => {
                  onCompleteEntry(nextReadyEntry, racerId);
                }}
              >
                Complete: {getRacerName(racers, racerId)} wins
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No race ready"
          body="Queue at least two auto-match racers, create a challenge, or queue a solo run."
        />
      )}
    </Panel>
  );
}

function QueueLabProjectedQueuePanel({
  entries,
  occurrences,
  racers,
  onRemoveFromEntry
}: {
  entries: QueueEntry[];
  occurrences: QueueOccurrence[];
  racers: LabRacer[];
  onRemoveFromEntry: (entryId: string, racerId: string) => void;
}) {
  return (
    <Panel title="Projected Queue" className="queue-lab__queue">
      {entries.length > 0 ? (
        <div className="queue-lab__entries">
          {entries.map((entry) => (
            <article key={entry.id} className="queue-lab__entry-card">
              <header>
                <div>
                  <span className="queue-lab__position">#{entry.position}</span>
                  <strong>{getEntryLabel(entry)}</strong>
                </div>
                <StatPill label="Priority" value={entry.priorityScore.toFixed(1)} />
              </header>
              <div className="queue-lab__entry-racers">
                {entry.racerIds.map((racerId, index) => (
                  <div
                    key={`${entry.id}-${racerId}-${String(index)}`}
                    className="queue-lab__entry-racer"
                  >
                    <strong>{getRacerName(racers, racerId)}</strong>
                    <span>
                      {getOccurrenceSummary(occurrences, entry.occurrenceIds[index] ?? "")}
                    </span>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        onRemoveFromEntry(entry.id, racerId);
                      }}
                    >
                      Remove Here
                    </Button>
                  </div>
                ))}
              </div>
              {entry.racerIds.length < 2 && entry.requestedType === "auto-match" ? (
                <p className="queue-lab__waiting-note">
                  Waiting for a different racer to become available.
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Queue is empty"
          body="Use the controls above to add auto-match signups, solo runs, and locked challenges."
        />
      )}
    </Panel>
  );
}

function QueueLabNoticePanel({ notice }: { notice: string }) {
  return (
    <Panel title="Projection Notice" className="queue-lab__notice">
      <p>{notice}</p>
    </Panel>
  );
}

function QueueLabActivityLogPanel({ activityLog }: { activityLog: string[] }) {
  return (
    <Panel title="Activity Log" className="queue-lab__log">
      <ol>
        {activityLog.map((message, index) => (
          <li key={`${message}-${String(index)}`}>{message}</li>
        ))}
      </ol>
    </Panel>
  );
}

function useQueueLabController(): QueueLabController {
  const [state, setState] = useReducer(queueLabReducer, initialQueueLabState);
  const {
    activityLog,
    challengeOpponentId,
    challengeRacerId,
    entries,
    maxActiveOccurrences,
    newRacerName,
    notice,
    occurrences,
    racers,
    selectedRacerId
  } = state;
  const nextRacerNumberRef = useRef(initialRacers.length + 1);
  const nextOccurrenceNumberRef = useRef(1);
  const nextEntryNumberRef = useRef(1);

  const racerOptions = racers.map((racer) => ({ value: racer.id, label: racer.displayName }));
  const nextReadyEntry = findNextQueuedEntry(entries);
  const waitingEntries = entries.filter(
    (entry) => entry.status === "queued" && entry.racerIds.length < 2
  );
  const challengePairInvalid = challengeRacerId !== "" && challengeRacerId === challengeOpponentId;

  function projectQueueState(
    nextOccurrences: QueueOccurrence[],
    message: string,
    nextRacers = racers,
    sourceEntries = entries
  ): void {
    let generatedEntryNumber = nextEntryNumberRef.current;
    const projection = projectQueueEntries({
      entries: sourceEntries,
      occurrences: nextOccurrences,
      eventId: labEventId,
      timestamp: makeTimestamp(),
      getEntryId: () => {
        const id = `lab-entry-${String(generatedEntryNumber)}`;
        generatedEntryNumber += 1;
        return id;
      },
      racerStatsById: new Map(
        nextRacers.map((racer) => [
          racer.id,
          {
            raceCount: racer.raceCount
          }
        ])
      )
    });

    nextEntryNumberRef.current = generatedEntryNumber;
    setState({
      activityLog: [message, ...activityLog].slice(0, 12),
      entries: projection.entries,
      notice: message,
      occurrences: projection.occurrences
    });
  }

  function getRacerStatsMap(nextRacers = racers): Map<string, { raceCount: number }> {
    return new Map(
      nextRacers.map((racer) => [
        racer.id,
        {
          raceCount: racer.raceCount
        }
      ])
    );
  }

  function addRacer(): void {
    const displayName = newRacerName.trim();
    if (!displayName) {
      setState({ notice: "Enter a racer name first." });
      return;
    }

    const racer: LabRacer = {
      id: `lab-racer-${String(nextRacerNumberRef.current)}`,
      displayName,
      raceCount: 0,
      winCount: 0
    };
    const nextRacers = [...racers, racer];
    nextRacerNumberRef.current += 1;
    setState({
      activityLog: [`${displayName} added to the lab.`, ...activityLog].slice(0, 12),
      newRacerName: "",
      notice: `${displayName} added to the lab.`,
      racers: nextRacers,
      selectedRacerId: racer.id
    });
  }

  function queueRacer(racerId: string, requestedType: "auto-match" | "solo" = "auto-match"): void {
    const racer = racers.find((candidate) => candidate.id === racerId);
    if (!racer) {
      setState({ notice: "Choose a racer to queue." });
      return;
    }

    const occurrenceNumber = nextOccurrenceNumberRef.current;
    const occurrenceId = `lab-occurrence-${String(occurrenceNumber)}`;
    try {
      const updatedOccurrences = addQueueSignup(occurrences, {
        eventId: labEventId,
        racerId,
        requestedType,
        occurrenceId,
        timestamp: makeTimestamp(),
        signupSequence: getNextSignupSequence(occurrences),
        raceCountAtJoin: racer.raceCount,
        maxActiveOccurrencesPerRacer: maxActiveOccurrences,
        racerStatsById: getRacerStatsMap()
      });

      nextOccurrenceNumberRef.current = occurrenceNumber + 1;
      projectQueueState(
        updatedOccurrences,
        `${racer.displayName} queued as ${requestedType === "solo" ? "a solo run" : "auto-match"}.`
      );
    } catch (error) {
      setState({ notice: error instanceof Error ? error.message : "Unable to queue racer." });
    }
  }

  function createChallenge(): void {
    const challenger = racers.find((racer) => racer.id === challengeRacerId);
    const opponent = racers.find((racer) => racer.id === challengeOpponentId);
    if (!challenger || !opponent) {
      setState({ notice: "Choose both racers for the challenge." });
      return;
    }

    const occurrenceNumber = nextOccurrenceNumberRef.current;
    const occurrenceId = `lab-occurrence-${String(occurrenceNumber)}`;
    const opponentOccurrenceId = `lab-occurrence-${String(occurrenceNumber + 1)}`;
    try {
      const updatedOccurrences = addQueueSignup(occurrences, {
        eventId: labEventId,
        racerId: challenger.id,
        opponentRacerId: opponent.id,
        occurrenceId,
        opponentOccurrenceId,
        lockGroupId: `lab-lock-${String(occurrenceNumber)}`,
        timestamp: makeTimestamp(),
        signupSequence: getNextSignupSequence(occurrences),
        raceCountAtJoin: challenger.raceCount,
        opponentRaceCountAtJoin: opponent.raceCount,
        maxActiveOccurrencesPerRacer: maxActiveOccurrences,
        racerStatsById: getRacerStatsMap()
      });

      nextOccurrenceNumberRef.current = occurrenceNumber + 2;
      projectQueueState(
        updatedOccurrences,
        `${challenger.displayName} challenged ${opponent.displayName}.`
      );
    } catch (error) {
      setState({
        notice: error instanceof Error ? error.message : "Unable to create challenge."
      });
    }
  }

  function completeEntry(entry: QueueEntry, winnerRacerId: string): void {
    const occurrenceIds = new Set(entry.occurrenceIds);
    const racerIds = new Set(entry.racerIds);
    const nextOccurrences = occurrences.map((occurrence) =>
      occurrenceIds.has(occurrence.id)
        ? {
            ...occurrence,
            status: "completed" as const,
            updatedAt: makeTimestamp()
          }
        : occurrence
    );
    const nextRacers = racers.map((racer) =>
      racerIds.has(racer.id)
        ? {
            ...racer,
            raceCount: racer.raceCount + 1,
            winCount: racer.id === winnerRacerId ? racer.winCount + 1 : racer.winCount
          }
        : racer
    );

    setState({ racers: nextRacers });
    projectQueueState(
      nextOccurrences,
      `${getRacerName(racers, winnerRacerId)} completed queue spot ${String(entry.position)} as winner.`,
      nextRacers
    );
  }

  function removeFromEntry(entryId: string, racerId: string): void {
    const nextOccurrences = removeRacerFromSpecificQueueEntry(
      entries,
      occurrences,
      entryId,
      racerId
    );
    projectQueueState(
      nextOccurrences,
      `${getRacerName(racers, racerId)} removed from queue spot ${String(
        entries.find((entry) => entry.id === entryId)?.position ?? "?"
      )}.`
    );
  }

  function removeAllForRacer(racerId: string): void {
    const nextOccurrences = removeRacerFromQueue(occurrences, racerId);
    projectQueueState(
      nextOccurrences,
      `${getRacerName(racers, racerId)} removed from all active queue spots.`
    );
  }

  function resetQueue(): void {
    setState({
      activityLog: ["Queue cleared.", ...activityLog].slice(0, 12),
      entries: [],
      notice: "Queue cleared. Racer stats are preserved.",
      occurrences: []
    });
  }

  function resetLab(): void {
    nextRacerNumberRef.current = initialRacers.length + 1;
    nextOccurrenceNumberRef.current = 1;
    nextEntryNumberRef.current = 1;
    setState({
      ...initialQueueLabState,
      activityLog: ["Queue lab reset."],
      notice: "Queue lab reset."
    });
  }

  return {
    activityLog,
    challengeOpponentId,
    challengePairInvalid,
    challengeRacerId,
    entries,
    maxActiveOccurrences,
    newRacerName,
    nextReadyEntry,
    notice,
    occurrences,
    racerOptions,
    racers,
    selectedRacerId,
    waitingEntries,
    addRacer,
    completeEntry,
    createChallenge,
    queueRacer,
    removeAllForRacer,
    removeFromEntry,
    resetLab,
    resetQueue,
    setChallengeOpponentId: (racerId) => {
      setState({ challengeOpponentId: racerId });
    },
    setChallengeRacerId: (racerId) => {
      setState({ challengeRacerId: racerId });
    },
    setMaxActiveOccurrences: (value) => {
      setState({ maxActiveOccurrences: value });
    },
    setNewRacerName: (name) => {
      setState({ newRacerName: name });
    },
    setSelectedRacerId: (racerId) => {
      setState({ selectedRacerId: racerId });
    }
  };
}

function QueueLabView({ controller }: { controller: QueueLabController }) {
  const {
    activityLog,
    challengeOpponentId,
    challengePairInvalid,
    challengeRacerId,
    entries,
    maxActiveOccurrences,
    newRacerName,
    nextReadyEntry,
    notice,
    occurrences,
    racerOptions,
    racers,
    selectedRacerId,
    waitingEntries,
    addRacer,
    completeEntry,
    createChallenge,
    queueRacer,
    removeAllForRacer,
    removeFromEntry,
    resetLab,
    resetQueue,
    setChallengeOpponentId,
    setChallengeRacerId,
    setMaxActiveOccurrences,
    setNewRacerName,
    setSelectedRacerId
  } = controller;

  return (
    <div className="queue-lab">
      <QueueLabHero
        racersCount={racers.length}
        entriesCount={entries.length}
        waitingCount={waitingEntries.length}
        maxActiveOccurrences={maxActiveOccurrences}
      />

      <div className="queue-lab__grid">
        <QueueLabControlsPanel
          challengeOpponentId={challengeOpponentId}
          challengePairInvalid={challengePairInvalid}
          challengeRacerId={challengeRacerId}
          maxActiveOccurrences={maxActiveOccurrences}
          newRacerName={newRacerName}
          racerOptions={racerOptions}
          selectedRacerId={selectedRacerId}
          onAddRacer={addRacer}
          onChallengeOpponentChange={setChallengeOpponentId}
          onChallengeRacerChange={setChallengeRacerId}
          onCreateChallenge={createChallenge}
          onMaxActiveOccurrencesChange={setMaxActiveOccurrences}
          onNewRacerNameChange={setNewRacerName}
          onQueueRacer={queueRacer}
          onResetLab={resetLab}
          onResetQueue={resetQueue}
          onSelectedRacerChange={setSelectedRacerId}
        />
        <QueueLabRacersPanel
          racers={racers}
          occurrences={occurrences}
          onQueueRacer={queueRacer}
          onRemoveAllForRacer={removeAllForRacer}
        />
        <QueueLabNextRacePanel
          nextReadyEntry={nextReadyEntry}
          racers={racers}
          onCompleteEntry={completeEntry}
        />
        <QueueLabNoticePanel notice={notice} />
      </div>

      <QueueLabProjectedQueuePanel
        entries={entries}
        racers={racers}
        occurrences={occurrences}
        onRemoveFromEntry={removeFromEntry}
      />
      <QueueLabActivityLogPanel activityLog={activityLog} />
    </div>
  );
}

export function QueueLabPage() {
  const controller = useQueueLabController();

  return <QueueLabView controller={controller} />;
}
