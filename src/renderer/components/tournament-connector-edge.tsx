import { getSmoothStepPath } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import type { BracketFlowEdge } from "./tournament-flow-layout";

export function TournamentConnectorEdge({
  data,
  id,
  sourcePosition,
  sourceX,
  sourceY,
  targetPosition,
  targetX,
  targetY
}: EdgeProps<BracketFlowEdge>) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 26,
    offset: 24
  });

  const route = data?.route ?? "winner";
  const completed = data?.completed ?? false;
  const drawAnimated = data?.drawAnimated ?? false;
  const className = [
    "tournament-connector-edge",
    `tournament-connector-edge--route-${route}`,
    data?.highlighted ? "tournament-connector-edge--highlighted" : "",
    completed ? "tournament-connector-edge--completed" : "",
    drawAnimated ? "tournament-connector-edge--drawing" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <g className={className} data-edge-id={id}>
      <path className="tournament-connector-edge__base" d={edgePath} />
      {completed && !drawAnimated ? (
        <path className="tournament-connector-edge__progress" d={edgePath} />
      ) : null}
      {drawAnimated ? (
        <motion.path
          key={data?.animationKey ?? id}
          className="tournament-connector-edge__draw"
          d={edgePath}
          initial={{ opacity: 0, pathLength: 0 }}
          animate={{ opacity: 1, pathLength: 1 }}
          transition={{
            duration: (data?.animationDurationMs ?? 1200) / 1000,
            ease: [0.24, 0.84, 0.22, 1]
          }}
        />
      ) : null}
    </g>
  );
}
