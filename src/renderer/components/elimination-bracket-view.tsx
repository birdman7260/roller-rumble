import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useReactFlow,
  useUpdateNodeInternals
} from "@xyflow/react";
import type { NodeTypes, EdgeTypes } from "@xyflow/react";
import type { AppSnapshot, TournamentBundle } from "@shared/types";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TournamentConnectorEdge } from "./tournament-connector-edge";
import { TournamentMatchNode } from "./tournament-match-node";
import {
  buildBracketFlow,
  FLOW_NODE_ORIGIN,
  NODE_HEIGHT,
  NODE_WIDTH,
  withStageCallbacks,
  type BracketFlowEdge,
  type BracketFlowNode
} from "./tournament-flow-layout";

const nodeTypes: NodeTypes = {
  tournamentMatch: TournamentMatchNode
};

const edgeTypes: EdgeTypes = {
  tournamentConnector: TournamentConnectorEdge
};

type BracketExpandMode = "overlay" | "container";

export interface BracketPresentationRequest {
  durationMs?: number;
  key: string;
  maxZoom?: number;
  minZoom?: number;
  nodeIds?: string[];
  padding?: number;
  type: "fit-board" | "focus-node" | "focus-nodes";
}

export interface BracketWinnerAdvance {
  durationMs?: number;
  fromNodeId: string;
  key: string;
  racerAvatarUrl?: string | null;
  racerId: string;
  racerLabel: string;
  targetParticipantIndex?: 0 | 1;
  toNodeId?: string | null;
}

function TournamentViewportDirector({
  presentationRequest
}: {
  presentationRequest?: BracketPresentationRequest | null;
}) {
  const { fitView } = useReactFlow<BracketFlowNode, BracketFlowEdge>();

  useEffect(() => {
    if (!presentationRequest) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (presentationRequest.type === "fit-board") {
        void fitView({
          duration: presentationRequest.durationMs ?? 900,
          padding: presentationRequest.padding ?? 0.18,
          minZoom: presentationRequest.minZoom ?? 0.45,
          maxZoom: presentationRequest.maxZoom ?? 1.05
        });
        return;
      }

      const nodeIds = presentationRequest.nodeIds ?? [];
      if (nodeIds.length === 0) {
        return;
      }

      void fitView({
        duration: presentationRequest.durationMs ?? 900,
        padding: presentationRequest.padding ?? 0.95,
        minZoom: presentationRequest.minZoom,
        maxZoom: presentationRequest.maxZoom ?? 1.22,
        nodes: nodeIds.map((id) => ({ id }))
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [fitView, presentationRequest]);

  return null;
}

function getParticipantAnchor(
  node: BracketFlowNode,
  racerId: string,
  fallbackParticipantIndex: 0 | 1 = 0
): {
  x: number;
  y: number;
} {
  const participantIndex =
    node.data.participants[1].id === racerId
      ? 1
      : node.data.participants[0].id === racerId
        ? 0
        : fallbackParticipantIndex;
  const slotX = node.position.x - NODE_WIDTH / 2 + 38;
  const slotY = node.position.y - NODE_HEIGHT / 2 + 82 + participantIndex * 38;

  return {
    x: slotX,
    y: slotY
  };
}

function WinnerAdvanceOverlay({ winnerAdvance }: { winnerAdvance?: BracketWinnerAdvance | null }) {
  const { getNode } = useReactFlow<BracketFlowNode, BracketFlowEdge>();

  const anchors = useMemo(() => {
    if (!winnerAdvance?.toNodeId) {
      return null;
    }

    const sourceNode = getNode(winnerAdvance.fromNodeId);
    const targetNode = getNode(winnerAdvance.toNodeId);
    if (!sourceNode || !targetNode) {
      return null;
    }

    return {
      source: getParticipantAnchor(sourceNode, winnerAdvance.racerId),
      target: getParticipantAnchor(
        targetNode,
        winnerAdvance.racerId,
        winnerAdvance.targetParticipantIndex
      )
    };
  }, [getNode, winnerAdvance]);

  if (!winnerAdvance?.toNodeId || !anchors) {
    return null;
  }

  return (
    <ViewportPortal>
      <motion.div
        key={winnerAdvance.key}
        className="tournament-flow__winner-advance"
        style={{
          left: anchors.source.x,
          top: anchors.source.y
        }}
        initial={{
          opacity: 0,
          scale: 0.86,
          x: 0,
          y: 0
        }}
        animate={{
          opacity: [0, 1, 1, 0],
          scale: [0.86, 1, 1, 0.92],
          x: anchors.target.x - anchors.source.x,
          y: anchors.target.y - anchors.source.y
        }}
        transition={{
          duration: (winnerAdvance.durationMs ?? 1150) / 1000,
          ease: [0.24, 0.84, 0.22, 1],
          times: [0, 0.12, 0.82, 1]
        }}
      >
        {winnerAdvance.racerAvatarUrl ? (
          <img
            className="tournament-flow__winner-advance-avatar"
            src={winnerAdvance.racerAvatarUrl}
            alt={winnerAdvance.racerLabel}
          />
        ) : (
          <span className="tournament-flow__winner-advance-avatar tournament-flow__winner-advance-avatar--placeholder">
            {winnerAdvance.racerLabel.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="tournament-flow__winner-advance-label">{winnerAdvance.racerLabel}</span>
      </motion.div>
    </ViewportPortal>
  );
}

function TournamentViewportPanel({
  currentMatchNodeId,
  expanded,
  onToggleExpanded
}: {
  currentMatchNodeId: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const { fitView } = useReactFlow<BracketFlowNode, BracketFlowEdge>();

  return (
    <Panel position="top-right" className="tournament-flow__viewport-panel">
      <div className="button-row">
        <button
          type="button"
          className="button button--ghost"
          onClick={() => {
            void fitView({
              duration: 900,
              padding: 0.18,
              minZoom: 0.45,
              maxZoom: 1.05
            });
          }}
        >
          Fit Board
        </button>
        <button
          type="button"
          className="button button--ghost"
          disabled={!currentMatchNodeId}
          onClick={() => {
            if (!currentMatchNodeId) {
              return;
            }

            void fitView({
              duration: 900,
              padding: 0.95,
              maxZoom: 1.22,
              nodes: [{ id: currentMatchNodeId }]
            });
          }}
        >
          Focus Current
        </button>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => {
            onToggleExpanded();
          }}
        >
          {expanded ? "Collapse View" : "Expand View"}
        </button>
      </div>
    </Panel>
  );
}

function BracketCanvas({
  snapshot,
  bundle,
  interactive,
  expandMode,
  expanded,
  highlightedNodeId,
  onStageMatch,
  onToggleExpanded,
  presentationRequest,
  showViewportControls,
  winnerAdvance
}: {
  snapshot: AppSnapshot;
  bundle: TournamentBundle;
  interactive: boolean;
  expandMode: BracketExpandMode;
  expanded: boolean;
  highlightedNodeId?: string | null;
  onStageMatch?: (nodeId: string) => void;
  onToggleExpanded: () => void;
  presentationRequest?: BracketPresentationRequest | null;
  showViewportControls: boolean;
  winnerAdvance?: BracketWinnerAdvance | null;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const winnerAdvanceDurationMs = winnerAdvance?.durationMs;
  const winnerAdvanceFromNodeId = winnerAdvance?.fromNodeId;
  const winnerAdvanceKey = winnerAdvance?.key;
  const winnerAdvanceToNodeId = winnerAdvance?.toNodeId;
  const animatedAdvancementEdge = useMemo(
    () =>
      winnerAdvanceToNodeId && winnerAdvanceFromNodeId && winnerAdvanceKey
        ? {
            durationMs: winnerAdvanceDurationMs,
            fromNodeId: winnerAdvanceFromNodeId,
            key: winnerAdvanceKey,
            toNodeId: winnerAdvanceToNodeId
          }
        : null,
    [winnerAdvanceDurationMs, winnerAdvanceFromNodeId, winnerAdvanceKey, winnerAdvanceToNodeId]
  );
  const flow = useMemo(
    () =>
      buildBracketFlow(snapshot, bundle, interactive, {
        animatedAdvancementEdge,
        highlightedNodeId
      }),
    [animatedAdvancementEdge, bundle, highlightedNodeId, interactive, snapshot]
  );
  const nodes = useMemo(
    () => withStageCallbacks(flow.nodes, onStageMatch),
    [flow.nodes, onStageMatch]
  );
  const updateNodeInternals = useUpdateNodeInternals();

  const syncBracketGeometry = useCallback(() => {
    const nodeIds = flow.nodes.map((node) => node.id);
    if (nodeIds.length === 0) {
      return;
    }

    updateNodeInternals(nodeIds);
  }, [flow.nodes, updateNodeInternals]);

  useEffect(() => {
    let frameId = 0;
    let settleTimer = 0;
    const startedAt = performance.now();
    const animationBudgetMs = expandMode === "container" ? 440 : 320;

    const tick = (): void => {
      syncBracketGeometry();

      if (performance.now() - startedAt < animationBudgetMs) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);

    // One final pass after the motion settles keeps the board crisp if the last frame lands
    // slightly before Framer Motion finishes the layout transition.
    settleTimer = window.setTimeout(() => {
      syncBracketGeometry();
    }, animationBudgetMs + 40);

    return () => {
      cancelAnimationFrame(frameId);
      window.clearTimeout(settleTimer);
    };
  }, [expandMode, expanded, syncBracketGeometry]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const observer = new ResizeObserver(() => {
      syncBracketGeometry();
    });

    observer.observe(shell);
    return () => {
      observer.disconnect();
    };
  }, [syncBracketGeometry]);

  return (
    <div
      ref={shellRef}
      className={`tournament-flow-shell${
        expanded
          ? expandMode === "overlay"
            ? " tournament-flow-shell--expanded"
            : " tournament-flow-shell--container-expanded"
          : ""
      }`}
      role={expanded && expandMode === "overlay" ? "dialog" : undefined}
      aria-modal={expanded && expandMode === "overlay" ? true : undefined}
      aria-label={
        expanded && expandMode === "overlay" ? `${bundle.tournament.name} bracket` : undefined
      }
    >
      <div
        className={`tournament-flow tournament-flow--${flow.effectiveLayout}${
          expanded ? " tournament-flow--expanded" : ""
        }`}
      >
        <ReactFlow<BracketFlowNode, BracketFlowEdge>
          // Resetting the canvas when the resolved layout changes keeps fitView and camera controls
          // aligned with the newly generated board geometry. We intentionally avoid remounting on
          // expand/collapse so the bracket doesn't re-fit itself halfway through the panel motion.
          key={`${bundle.tournament.id}:${flow.effectiveLayout}`}
          nodes={nodes}
          edges={flow.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{
            padding: 0.18,
            minZoom: 0.45,
            maxZoom: 1.05
          }}
          nodeOrigin={FLOW_NODE_ORIGIN}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={interactive}
          selectionOnDrag={false}
          panOnDrag
          zoomOnDoubleClick={false}
          className="tournament-flow__canvas"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} />
          <TournamentViewportDirector presentationRequest={presentationRequest} />
          <WinnerAdvanceOverlay winnerAdvance={winnerAdvance} />
          {showViewportControls ? (
            <Controls showInteractive={false} position="bottom-right" />
          ) : null}
          {showViewportControls ? (
            <TournamentViewportPanel
              currentMatchNodeId={flow.currentMatchNodeId}
              expanded={expanded}
              onToggleExpanded={onToggleExpanded}
            />
          ) : null}
        </ReactFlow>
      </div>
    </div>
  );
}

export function EliminationBracketView({
  snapshot,
  bundle,
  interactive = false,
  expandMode = "overlay",
  expanded: controlledExpanded,
  highlightedNodeId,
  onExpandedChange,
  onStageMatch,
  presentationRequest,
  showViewportControls = true,
  winnerAdvance
}: {
  snapshot: AppSnapshot;
  bundle: TournamentBundle;
  interactive?: boolean;
  expandMode?: BracketExpandMode;
  expanded?: boolean;
  highlightedNodeId?: string | null;
  onExpandedChange?: (expanded: boolean) => void;
  onStageMatch?: (nodeId: string) => void;
  presentationRequest?: BracketPresentationRequest | null;
  showViewportControls?: boolean;
  winnerAdvance?: BracketWinnerAdvance | null;
}) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(false);
  const expanded = controlledExpanded ?? uncontrolledExpanded;

  const setExpanded = useCallback(
    (nextValue: boolean | ((current: boolean) => boolean)): void => {
      const resolvedValue = typeof nextValue === "function" ? nextValue(expanded) : nextValue;

      if (controlledExpanded == null) {
        setUncontrolledExpanded(resolvedValue);
      }

      onExpandedChange?.(resolvedValue);
    },
    [controlledExpanded, expanded, onExpandedChange]
  );

  useEffect(() => {
    if (!expanded) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded, setExpanded]);

  return (
    <ReactFlowProvider>
      <BracketCanvas
        snapshot={snapshot}
        bundle={bundle}
        interactive={interactive}
        expandMode={expandMode}
        expanded={expanded}
        highlightedNodeId={highlightedNodeId}
        onStageMatch={onStageMatch}
        presentationRequest={presentationRequest}
        showViewportControls={showViewportControls}
        winnerAdvance={winnerAdvance}
        onToggleExpanded={() => {
          setExpanded((current) => !current);
        }}
      />
    </ReactFlowProvider>
  );
}
