import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { resolveBackendAssetUrl } from "../lib/assets";
import type { BracketFlowNode } from "./tournament-flow-layout";

/** A push pin, drawn inline like the app's other small icons. */
function PinIcon() {
  return (
    <svg
      className="tournament-match-node__pin-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  );
}

export function TournamentMatchNode({ data, selected }: NodeProps<BracketFlowNode>) {
  const clickable = data.canSelect && typeof data.onSelectMatch === "function";
  const Root = clickable ? "button" : "div";

  return (
    <Root
      {...(clickable ? { type: "button" as const } : {})}
      className={`tournament-match-node tournament-match-node--${data.state}${
        data.highlighted ? " tournament-match-node--highlighted" : ""
      }${data.pinned ? " tournament-match-node--pinned" : ""}${selected ? " tournament-match-node--selected" : ""}${
        clickable ? " tournament-match-node--interactive" : ""
      } nodrag nopan`}
      onClick={
        clickable
          ? () => {
              data.onSelectMatch?.(data.appNodeId);
            }
          : undefined
      }
    >
      <Handle
        className="tournament-flow__handle"
        id="in-left"
        type="target"
        position={Position.Left}
      />
      <Handle
        className="tournament-flow__handle"
        id="in-right"
        type="target"
        position={Position.Right}
      />
      <Handle
        className="tournament-flow__handle"
        id="out-left"
        type="source"
        position={Position.Left}
      />
      <Handle
        className="tournament-flow__handle"
        id="out-right"
        type="source"
        position={Position.Right}
      />

      {data.pinned ? (
        <span className="tournament-match-node__pin">
          <PinIcon />
          <span className="visually-hidden">Pinned up next</span>
        </span>
      ) : null}

      <div className="tournament-match-node__meta">
        {data.roundLabel ? <p className="eyebrow">{data.roundLabel}</p> : null}
        <span className="tournament-match-node__status">{data.state}</span>
      </div>

      <div className="tournament-match-node__body">
        {data.participants.map((participant, index) => {
          const avatarUrl = resolveBackendAssetUrl(participant.avatarUrl);
          return (
            <div
              key={participant.id ?? `${data.appNodeId}:${index}`}
              className={`tournament-match-node__participant${
                participant.isWinner ? " winner" : ""
              }${
                participant.bikeColor
                  ? ` tournament-match-node__participant--bike-${participant.bikeColor}`
                  : ""
              }`}
            >
              <div className="tournament-match-node__identity">
                {avatarUrl ? (
                  <img
                    className="tournament-match-node__avatar"
                    src={avatarUrl}
                    alt={participant.name}
                  />
                ) : (
                  <span className="tournament-match-node__avatar tournament-match-node__avatar--placeholder">
                    {participant.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="tournament-match-node__name">{participant.name}</span>
              </div>
              <span className="tournament-match-node__result">{participant.resultText ?? ""}</span>
            </div>
          );
        })}
      </div>
    </Root>
  );
}
