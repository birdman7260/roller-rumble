import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals
} from "@xyflow/react";
import type { NodeTypes, EdgeTypes } from "@xyflow/react";
import type { AppSnapshot, TournamentBundle } from "@goldsprints/shared/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TournamentConnectorEdge } from "./tournament-connector-edge";
import { TournamentMatchNode } from "./tournament-match-node";
import {
  buildBracketFlow,
  FLOW_NODE_ORIGIN,
  withMatchSelectCallbacks,
  type BracketFlowEdge,
  type BracketFlowNode
} from "./tournament-flow-layout";
import { Button as UiButton } from "@goldsprints/shared-ui";

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
        <UiButton
          variant="ghost"
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
        </UiButton>
        <UiButton
          variant="ghost"
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
        </UiButton>
        <UiButton
          variant="ghost"
          onClick={() => {
            onToggleExpanded();
          }}
        >
          {expanded ? "Collapse View" : "Expand View"}
        </UiButton>
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
  onMatchSelect,
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
  onMatchSelect?: (nodeId: string) => void;
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
    () => withMatchSelectCallbacks(flow.nodes, onMatchSelect),
    [flow.nodes, onMatchSelect]
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
  onMatchSelect,
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
  onMatchSelect?: (nodeId: string) => void;
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
        onMatchSelect={onMatchSelect}
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
