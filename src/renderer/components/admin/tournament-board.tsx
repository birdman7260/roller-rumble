import type { AppSnapshot, TournamentBundle } from "@shared/types";
import { EmptyState } from "../ui";
import { resolveTournamentRacerName } from "../../lib/admin-competition";
import { EliminationBracketView } from "../elimination-bracket-view";

export function TournamentBracketBoard({
  snapshot,
  bundle,
  canStageMatches,
  hintText,
  expanded,
  onExpandedChange,
  onStageMatch
}: {
  snapshot: AppSnapshot;
  bundle: TournamentBundle;
  canStageMatches: boolean;
  hintText?: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onStageMatch: (nodeId: string) => void;
}) {
  if (bundle.bracketNodes.length === 0) {
    return (
      <EmptyState
        title="Bracket is not ready yet"
        body="As tournament racers advance, the elimination board will populate here."
      />
    );
  }

  return (
    <div
      className={`stack-md tournament-bracket-board${
        expanded ? " tournament-bracket-board--expanded" : ""
      }`}
    >
      <p className="tournament-bracket__hint">
        {hintText ??
          (canStageMatches
            ? "Click any ready matchup in the bracket to stage it."
            : "A tournament race is already staged. Finish or clear it before staging another matchup.")}
      </p>
      <EliminationBracketView
        snapshot={snapshot}
        bundle={bundle}
        interactive={canStageMatches}
        expandMode="container"
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        onStageMatch={onStageMatch}
      />
    </div>
  );
}

export function TournamentGroupMatchBoard({
  snapshot,
  bundle,
  canStageMatches,
  onStageMatch
}: {
  snapshot: AppSnapshot;
  bundle: TournamentBundle;
  canStageMatches: boolean;
  onStageMatch: (matchId: string) => void;
}) {
  if (bundle.groupMatches.length === 0) {
    return null;
  }

  return (
    <div className="stack-md">
      <div className="list">
        {bundle.groupMatches.map((match) => (
          <div key={match.id} className="list-row tournament-match-row">
            <div>
              <strong>
                {resolveTournamentRacerName(snapshot, bundle, match.racerAId)} vs{" "}
                {resolveTournamentRacerName(snapshot, bundle, match.racerBId)}
              </strong>
              <p>{match.scoreLabel ?? "Tournament match"}</p>
            </div>
            <div className="button-row">
              {match.winnerRacerId ? (
                <span>
                  Winner: {resolveTournamentRacerName(snapshot, bundle, match.winnerRacerId)}
                </span>
              ) : (
                <button
                  className="button button--ghost"
                  disabled={!canStageMatches}
                  onClick={() => {
                    onStageMatch(match.id);
                  }}
                >
                  Stage Match
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {bundle.tournament.preset === "round-robin" && bundle.standings.length > 0 ? (
        <div className="standings-grid">
          {bundle.standings.map((standing) => (
            <div key={standing.racerId} className="standing-row">
              <strong>#{standing.rank}</strong>
              <span>{resolveTournamentRacerName(snapshot, bundle, standing.racerId)}</span>
              <span>
                {standing.wins}-{standing.losses}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
