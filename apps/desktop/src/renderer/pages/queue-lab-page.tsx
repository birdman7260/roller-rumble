import type { QueueEntry, QueueOccurrence } from "@goldsprints/shared/types";
import { useMemo, useState } from "react";
import {
  Button,
  EmptyState,
  Panel,
  SearchableSelect,
  StatPill,
  TextInput
} from "@goldsprints/shared-ui";
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

export function QueueLabPage() {
  const [racers, setRacers] = useState<LabRacer[]>(initialRacers);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [occurrences, setOccurrences] = useState<QueueOccurrence[]>([]);
  const [selectedRacerId, setSelectedRacerId] = useState(initialRacers[0]?.id ?? "");
  const [challengeRacerId, setChallengeRacerId] = useState(initialRacers[0]?.id ?? "");
  const [challengeOpponentId, setChallengeOpponentId] = useState(initialRacers[1]?.id ?? "");
  const [newRacerName, setNewRacerName] = useState("");
  const [maxActiveOccurrences, setMaxActiveOccurrences] = useState(3);
  const [nextRacerNumber, setNextRacerNumber] = useState(initialRacers.length + 1);
  const [nextOccurrenceNumber, setNextOccurrenceNumber] = useState(1);
  const [nextEntryNumber, setNextEntryNumber] = useState(1);
  const [notice, setNotice] = useState("Ready to test the queue.");
  const [activityLog, setActivityLog] = useState<string[]>(["Queue lab loaded with demo racers."]);

  const racerOptions = useMemo(
    () => racers.map((racer) => ({ value: racer.id, label: racer.displayName })),
    [racers]
  );
  const nextReadyEntry = useMemo(() => findNextQueuedEntry(entries), [entries]);
  const waitingEntries = entries.filter(
    (entry) => entry.status === "queued" && entry.racerIds.length < 2
  );
  const challengePairInvalid = challengeRacerId !== "" && challengeRacerId === challengeOpponentId;

  function appendLog(message: string): void {
    setActivityLog((currentLog) => [message, ...currentLog].slice(0, 12));
  }

  function projectQueueState(
    nextOccurrences: QueueOccurrence[],
    message: string,
    nextRacers = racers,
    sourceEntries = entries
  ): void {
    let generatedEntryNumber = nextEntryNumber;
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

    setNextEntryNumber(generatedEntryNumber);
    setOccurrences(projection.occurrences);
    setEntries(projection.entries);
    setNotice(message);
    appendLog(message);
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
      setNotice("Enter a racer name first.");
      return;
    }

    const racer: LabRacer = {
      id: `lab-racer-${String(nextRacerNumber)}`,
      displayName,
      raceCount: 0,
      winCount: 0
    };
    const nextRacers = [...racers, racer];
    setRacers(nextRacers);
    setSelectedRacerId(racer.id);
    setNewRacerName("");
    setNextRacerNumber(nextRacerNumber + 1);
    setNotice(`${displayName} added to the lab.`);
    appendLog(`${displayName} added to the lab.`);
  }

  function queueRacer(racerId: string, requestedType: "auto-match" | "solo" = "auto-match"): void {
    const racer = racers.find((candidate) => candidate.id === racerId);
    if (!racer) {
      setNotice("Choose a racer to queue.");
      return;
    }

    const occurrenceId = `lab-occurrence-${String(nextOccurrenceNumber)}`;
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

      setNextOccurrenceNumber(nextOccurrenceNumber + 1);
      projectQueueState(
        updatedOccurrences,
        `${racer.displayName} queued as ${requestedType === "solo" ? "a solo run" : "auto-match"}.`
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to queue racer.");
    }
  }

  function createChallenge(): void {
    const challenger = racers.find((racer) => racer.id === challengeRacerId);
    const opponent = racers.find((racer) => racer.id === challengeOpponentId);
    if (!challenger || !opponent) {
      setNotice("Choose both racers for the challenge.");
      return;
    }

    const occurrenceId = `lab-occurrence-${String(nextOccurrenceNumber)}`;
    const opponentOccurrenceId = `lab-occurrence-${String(nextOccurrenceNumber + 1)}`;
    try {
      const updatedOccurrences = addQueueSignup(occurrences, {
        eventId: labEventId,
        racerId: challenger.id,
        opponentRacerId: opponent.id,
        occurrenceId,
        opponentOccurrenceId,
        lockGroupId: `lab-lock-${String(nextOccurrenceNumber)}`,
        timestamp: makeTimestamp(),
        signupSequence: getNextSignupSequence(occurrences),
        raceCountAtJoin: challenger.raceCount,
        opponentRaceCountAtJoin: opponent.raceCount,
        maxActiveOccurrencesPerRacer: maxActiveOccurrences,
        racerStatsById: getRacerStatsMap()
      });

      setNextOccurrenceNumber(nextOccurrenceNumber + 2);
      projectQueueState(
        updatedOccurrences,
        `${challenger.displayName} challenged ${opponent.displayName}.`
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create challenge.");
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

    setRacers(nextRacers);
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
    setOccurrences([]);
    setEntries([]);
    setNotice("Queue cleared. Racer stats are preserved.");
    appendLog("Queue cleared.");
  }

  function resetLab(): void {
    setRacers(initialRacers);
    setEntries([]);
    setOccurrences([]);
    setSelectedRacerId(initialRacers[0]?.id ?? "");
    setChallengeRacerId(initialRacers[0]?.id ?? "");
    setChallengeOpponentId(initialRacers[1]?.id ?? "");
    setNewRacerName("");
    setMaxActiveOccurrences(3);
    setNextRacerNumber(initialRacers.length + 1);
    setNextOccurrenceNumber(1);
    setNextEntryNumber(1);
    setNotice("Queue lab reset.");
    setActivityLog(["Queue lab reset."]);
  }

  return (
    <div className="queue-lab">
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
          <StatPill label="Racers" value={racers.length} />
          <StatPill label="Queue spots" value={entries.length} />
          <StatPill label="Waiting" value={waitingEntries.length} />
          <StatPill label="Max each" value={maxActiveOccurrences} />
        </div>
      </section>

      <div className="queue-lab__grid">
        <Panel title="Controls" className="queue-lab__controls">
          <div className="queue-lab__control-stack">
            <label>
              Max active queue entries per racer
              <TextInput
                min={1}
                max={10}
                type="number"
                value={maxActiveOccurrences}
                onChange={(event) => {
                  const parsedValue = Number.parseInt(event.target.value, 10);
                  setMaxActiveOccurrences(Number.isNaN(parsedValue) ? 1 : parsedValue);
                }}
              />
            </label>
            <label>
              Add racer
              <div className="queue-lab__inline-controls">
                <TextInput
                  placeholder="Racer name"
                  value={newRacerName}
                  onChange={(event) => {
                    setNewRacerName(event.target.value);
                  }}
                />
                <Button variant="accent" onClick={addRacer}>
                  Add
                </Button>
              </div>
            </label>
            <label>
              Put racer in queue
              <SearchableSelect
                value={selectedRacerId}
                options={racerOptions}
                placeholder="Choose racer"
                onValueChange={setSelectedRacerId}
              />
            </label>
            <div className="button-row">
              <Button
                variant="accent"
                disabled={!selectedRacerId}
                onClick={() => {
                  queueRacer(selectedRacerId);
                }}
              >
                Queue Auto
              </Button>
              <Button
                disabled={!selectedRacerId}
                onClick={() => {
                  queueRacer(selectedRacerId, "solo");
                }}
              >
                Queue Solo
              </Button>
            </div>
          </div>

          <div className="queue-lab__challenge-builder">
            <h3>Create Challenge</h3>
            <label>
              Challenger
              <SearchableSelect
                value={challengeRacerId}
                options={racerOptions}
                placeholder="Choose challenger"
                onValueChange={setChallengeRacerId}
              />
            </label>
            <label>
              Opponent
              <SearchableSelect
                value={challengeOpponentId}
                options={racerOptions}
                placeholder="Choose opponent"
                onValueChange={setChallengeOpponentId}
              />
            </label>
            {challengePairInvalid ? (
              <p className="queue-lab__warning">A racer cannot challenge themselves.</p>
            ) : null}
            <Button
              variant="accent"
              disabled={!challengeRacerId || !challengeOpponentId || challengePairInvalid}
              onClick={createChallenge}
            >
              Lock Challenge Match
            </Button>
          </div>

          <div className="queue-lab__control-footer">
            <Button variant="ghost" onClick={resetQueue}>
              Clear Queue
            </Button>
            <Button variant="ghost" onClick={resetLab}>
              Reset Lab
            </Button>
          </div>
        </Panel>

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
                      queueRacer(racer.id);
                    }}
                  >
                    Queue
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      removeAllForRacer(racer.id);
                    }}
                  >
                    Remove All
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </Panel>

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
                      completeEntry(nextReadyEntry, racerId);
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

        <Panel title="Projection Notice" className="queue-lab__notice">
          <p>{notice}</p>
        </Panel>
      </div>

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
                          removeFromEntry(entry.id, racerId);
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

      <Panel title="Activity Log" className="queue-lab__log">
        <ol>
          {activityLog.map((message, index) => (
            <li key={`${message}-${String(index)}`}>{message}</li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
