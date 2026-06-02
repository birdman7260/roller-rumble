import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { resolveBackendAssetUrl } from "../lib/assets";
import type { BracketFlowNode } from "./tournament-flow-layout";

export function TournamentMatchNode({ data, selected }: NodeProps<BracketFlowNode>) {
  const clickable = data.canSelect && typeof data.onSelectMatch === "function";
  const Root = clickable ? "button" : "div";

  return (
    <Root
      {...(clickable ? { type: "button" as const } : {})}
      className={`tournament-match-node tournament-match-node--${data.state}${
        data.highlighted ? " tournament-match-node--highlighted" : ""
      }${selected ? " tournament-match-node--selected" : ""}${
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

      <div className="tournament-match-node__meta">
        <div>
          <p className="eyebrow">{data.roundLabel}</p>
          <strong className="tournament-match-node__label">{data.label}</strong>
        </div>
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
