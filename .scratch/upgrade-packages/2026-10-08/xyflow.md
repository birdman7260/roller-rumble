# xyflow

| Package                                 | Installed | Target |
| --------------------------------------- | --------- | ------ |
| @xyflow/react                           | 12.10.2   | 12.12.0 |
| @xyflow/system (transitive, exact pin)  | 0.0.76    | 0.0.83 |

Repo usage context: `@xyflow/react` is a direct dependency only of `apps/desktop` (`apps/desktop/package.json:48`, `^12.10.2`). `@xyflow/system` is not a direct dependency anywhere; it arrives as an exact-pinned dependency of `@xyflow/react` (12.12.0 → `@xyflow/system@0.0.83`). Usage is limited to the tournament bracket:

- `apps/desktop/src/renderer/main.tsx:5` imports `@xyflow/react/dist/style.css`.
- `apps/desktop/src/renderer/components/elimination-bracket-view.tsx` uses `ReactFlow` (read-only: `nodesDraggable={false}`, `nodesConnectable={false}`, `selectionOnDrag={false}`, `panOnDrag`, `fitView`, `nodeOrigin`), `ReactFlowProvider`, `useReactFlow().fitView`, `useUpdateNodeInternals`, `Background` (Dots, `gap={24} size={1.4}`), `Controls`, `Panel`. The `<ReactFlow>` is remounted via `key` (line 282) inside a persistent `ReactFlowProvider` (line 383).
- `tournament-match-node.tsx` uses `Handle`/`Position`/`NodeProps` (handles `in-left`, `in-right`, `out-left`, `out-right`).
- `tournament-connector-edge.tsx` uses `getSmoothStepPath`/`EdgeProps`.
- `tournament-flow-layout.ts` uses `Node`/`Edge`/`Position` types and sets `sourceHandle`/`targetHandle` (lines 450-502).
- Rendered on admin (`components/admin/tournament-board.tsx:620`), projector (`pages/race-page.tsx:486`), mobile racer page (`pages/racer-sections/tournament.tsx:204`), and the dev lab (`pages/bracket-animation-lab-page.tsx:813`).

Not used anywhere (searched `apps/`, `packages/`, `tools/`, excl. `node_modules`/`dist`): `useStore`, `useStoreApi`, `useNodeConnections`, `useKeyPress`, `MiniMap`, `NodeResizer`, `onResize*`, `shouldResize`, `autoPanOnSelection`, `onNodeDrag`, `FinalConnectionState`, `getNodesBounds`, `includeHiddenNodes`, `colorMode`, `extent:`, `nodeExtent`, `onPaneClick`, `onConnect*`, `onPanZoom*`, `onMoveStart`/`onMoveEnd`, `panOnScroll`, `panActivationKeyCode`, `isNode(`/`isEdge(`, `NodeHandle`, `BuiltInNode`, `proOptions`/`hideAttribution`/`react-flow__attribution`. (`onError` hits in `race-page.tsx:354` and `tools/photo-booth-agent/.../umbrella-panel-picker.tsx:259` are `<img onError>`, unrelated.)

Overall: no breaking changes or deprecations in range, and no code changes required. Two behavior changes touch code paths we use and only need a visual smoke test (see the checkboxes).

## @xyflow/react 12.11.0 (+ @xyflow/system 0.0.77)

- [ ] **behavior change**: `StoreUpdater` goes back to `useEffect` instead of the layout effects added in 12.10.2 (#5733, "Fix empty store during ReactFlow remount"). During a `<ReactFlow>` remount, child effects may again see an empty store (nodes/nodeLookup) for a moment. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.0), [PR #5769](https://github.com/xyflow/xyflow/pull/5769))
  - affected: `apps/desktop/src/renderer/components/elimination-bracket-view.tsx:282`: the `<ReactFlow key=...>` remounts inside the persistent `ReactFlowProvider` (line 383) when the tournament or layout changes. Children use the store only inside `requestAnimationFrame` (`fitView` at lines 64-86) or in a rAF/ResizeObserver loop (`updateNodeInternals` at lines 204-255), and those run after effects. No code change expected. Required action: smoke-test switching bracket layout or tournament on the admin board and projector. Confirm the board still fits itself (`fitView` prop) and that "Fit Board" / "Focus Current" still frame the nodes right after the remount.
- **requirement**: `@types/react` and `@types/react-dom` (`>=17`) were added as **optional** peer dependencies. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.0), [PR #5755](https://github.com/xyflow/xyflow/pull/5755))
  - not used / already satisfied: `apps/desktop/package.json:83-84` has `@types/react ^19.1.2` and `@types/react-dom ^19.1.2`. No change.
- **behavior change** (system): `.react-flow__pane` now gets `touch-action: none` in the shipped CSS, to fix the selection box on mobile. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Fsystem%400.0.77), [PR #5638](https://github.com/xyflow/xyflow/pull/5638))
  - not used (no change needed): we don't override `touch-action` on any `.react-flow__*` class (searched `touch-action` and `.react-flow` in `apps/desktop/src/renderer/app.css`; the only overrides are background, controls and transparency at lines 3697-3720 and 4001-4012). The mobile racer bracket (`pages/racer-sections/tournament.tsx:204`) already uses `panOnDrag`, so touch on the pane already pans the canvas and doesn't scroll the page. Optionally check that the racer page still scrolls past the bracket on a phone.
- **behavior change** (type): `useNodeConnections` now gives a type error when `handleId` is passed without `handleType`. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.0), [PR #5791](https://github.com/xyflow/xyflow/pull/5791))
  - not used: searched `useNodeConnections`. None.
- **behavior change** (type): the event type passed to `onNodeDrag` was fixed, and generics were improved for XYDrag/XYHandle. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.0), [PR #5105](https://github.com/xyflow/xyflow/pull/5105))
  - not used: searched `onNodeDrag`. None, and nodes are not draggable (`nodesDraggable={false}`).
- **behavior change**: node resizing is now clamped to absolute extents. Node drag state is reset when a drag is aborted (system). ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Fsystem%400.0.77), [PR #5784](https://github.com/xyflow/xyflow/pull/5784), [PR #5803](https://github.com/xyflow/xyflow/pull/5803))
  - not used: searched `NodeResizer`, `extent:`, `nodeExtent`, `onNodeDrag`. None.
- **behavior change**: dev warnings now use library-specific messages and doc links. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.0), [PR #5793](https://github.com/xyflow/xyflow/pull/5793))
  - not used: this only changes console text. We have no tests or code that match xyflow warning strings (searched `react-flow` / `xyflow` in `*.test.ts(x)`; the only bracket test mocks `EliminationBracketView` entirely, `components/admin/tournament-board-dialogs.test.tsx:9`).
- New, non-breaking: `autoPanOnSelection` prop and exported `NodeHandle` type. Not used (searched both).

## @xyflow/react 12.11.1 (+ @xyflow/system 0.0.78)

- **behavior change**: `onPaneClick` no longer fires when a connection ends on the pane. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.1), [PR #5824](https://github.com/xyflow/xyflow/pull/5824))
  - not used: searched `onPaneClick`, `onConnect`. None, and `nodesConnectable={false}`.
- **behavior change**: `Handle` now reads the shared config (`connectOnClick`, `noPanClassName`, `rfId`) from context instead of a per-handle store subscription. Handles share one connection-state object while no connection is in progress. Edge positions keep a stable reference when a connected node is deleted. All of these are internal performance changes. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.1), [PR #5818](https://github.com/xyflow/xyflow/pull/5818), [PR #5817](https://github.com/xyflow/xyflow/pull/5817), [PR #5822](https://github.com/xyflow/xyflow/pull/5822))
  - not used: we render `Handle` only inside `ReactFlow` (`tournament-match-node.tsx:45-68`), which provides the context. We don't use `useStore`, and no handle is rendered outside a flow (searched `<Handle`, `useStore`). No change.
- **behavior change** (type): the `FinalConnectionState` type now keeps its discriminated union. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Fsystem%400.0.78), [PR #5815](https://github.com/xyflow/xyflow/pull/5815))
  - not used: searched `FinalConnectionState`, `onConnectEnd`. None.
- Attribution link URL updated (#5823). Cosmetic only, and we don't hide or restyle attribution (searched `attribution`, `proOptions`).

## @xyflow/react 12.11.2 (+ @xyflow/system 0.0.79)

- **behavior change**: the viewport pan/zoom transform is now applied imperatively, so the `Viewport` component renders only once. An `XYDrag` instance is created only for draggable nodes. `MiniMap` no longer re-renders on every store update. The zoom pane extent is cached, so panning no longer forces a synchronous layout. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.2), [PR #5846](https://github.com/xyflow/xyflow/pull/5846), [PR #5825](https://github.com/xyflow/xyflow/pull/5825), [PR #5847](https://github.com/xyflow/xyflow/pull/5847), [system PR #5850](https://github.com/xyflow/xyflow/pull/5850))
  - not used (no change needed): we don't read the `.react-flow__viewport` inline transform or style it beyond `background: transparent` (`app.css:3697-3701`, searched `react-flow__viewport`). The cached pane extent is relevant because the bracket shell resizes during the expand/collapse animation (`elimination-bracket-view.tsx:213-255`). xyflow updates that cache from its own ResizeObserver, so no change is expected, but it is worth a look while doing the 12.11.0 smoke test (expand, then pan/zoom right away).
- **behavior change** (system): in dark mode, the default background pattern colors changed (dots `#777` → `#555`, lines/cross `#777` → `#333`). ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Fsystem%400.0.79), [PR #5839](https://github.com/xyflow/xyflow/pull/5839))
  - not used: we never set `colorMode` or a `dark` class on the flow (searched `colorMode`, `"dark"`, `.dark`). The light-mode defaults are unchanged.
- **behavior change** (system): `fitView` with `includeHiddenNodes` now counts unmeasured hidden nodes that declare a size. `onPanZoomEnd` always fires after a pan-on-scroll start. Clamping checks that the parent node exists. Node/edge type guards check element existence first. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Fsystem%400.0.79), [PR #5851](https://github.com/xyflow/xyflow/pull/5851), [PR #5849](https://github.com/xyflow/xyflow/pull/5849), [PR #5845](https://github.com/xyflow/xyflow/pull/5845), [PR #5837](https://github.com/xyflow/xyflow/pull/5837))
  - not used: searched `includeHiddenNodes`, `hidden:`, `panOnScroll`, `onMoveEnd`, `parentId`, `isNode(`, `isEdge(`. None. Our `fitView` calls don't pass `includeHiddenNodes`.

## @xyflow/react 12.11.3 (+ @xyflow/system 0.0.80)

- [ ] **behavior change**: the `<Background />` pattern offset math is fixed. With the default `offset={0}`, the pattern is no longer shifted by an extra 1px (for example, `translate(-11,-11)` becomes `translate(-10,-10)` for gap 20). ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.3), [PR #5938](https://github.com/xyflow/xyflow/pull/5938))
  - affected: `apps/desktop/src/renderer/components/elimination-bracket-view.tsx:302`: `<Background variant={BackgroundVariant.Dots} gap={24} size={1.4} />` (no `offset`). The dot grid moves by 1px. This is cosmetic and needs no code change; just check that the bracket background still looks right on the projector and in the pixel theme (`app.css:4001`).
- **behavior change**: an error is now raised through `onError` when an edge's handle can't be found. The edge wrapper now lists `onError` in its effect deps. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.3), [PR #5943](https://github.com/xyflow/xyflow/pull/5943))
  - not used: we pass no `onError` prop (searched `onError` in `components/`, and the only hits are `<img onError>`). Our edges always reference handle ids that exist: `getSourceHandle` returns `out-left`/`out-right` and `getTargetHandle` returns `in-left`/`in-right` (`tournament-flow-layout.ts:332-341`), and all four are rendered in `tournament-match-node.tsx:45-68`. No dev-console noise is expected.
- **behavior change**: middle-mouse panning can start from a selection rectangle. Touch panning is preferred over drag selection. `Control` + primary-button drag can activate panning. `useKeyPress` accepts combos of three or more keys. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.3), [PR #5902](https://github.com/xyflow/xyflow/pull/5902), [PR #5918](https://github.com/xyflow/xyflow/pull/5918), [PR #5922](https://github.com/xyflow/xyflow/pull/5922), [PR #5929](https://github.com/xyflow/xyflow/pull/5929))
  - not used: `selectionOnDrag={false}` and `panOnDrag` (boolean) at `elimination-bracket-view.tsx:297-298`. We don't use `panActivationKeyCode` or `useKeyPress` (searched). These changes only widen when panning can start.
- **behavior change**: `extent: 'parent'` now resolves right away when the parent has `width`/`initialWidth`. Internal `setNodes` uses the right `nodeExtent`. `getNodesBounds` no longer stretches to the origin when an id can't be resolved (system). ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.3), [PR #5889](https://github.com/xyflow/xyflow/pull/5889), [PR #5947](https://github.com/xyflow/xyflow/pull/5947), [system PR #5871](https://github.com/xyflow/xyflow/pull/5871))
  - not used: searched `extent:`, `nodeExtent`, `getNodesBounds`, `parentId`. None.

## @xyflow/react 12.11.4

- **behavior change**: in development (`NODE_ENV === 'development'`), xyflow now logs a console message if the attribution is hidden. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.4), [PR #5962](https://github.com/xyflow/xyflow/pull/5962))
  - not used: we don't set `proOptions.hideAttribution` or hide `.react-flow__attribution` / `.react-flow__panel` (searched `attribution`, `proOptions`, `hideAttribution`, `react-flow__panel`). No log is expected.
- **behavior change**: `MiniMap` keeps working after a `ReactFlow` remount, no longer zooms out to include the origin when every node is hidden, and no longer calls `useCallback` conditionally. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.4), [PR #5974](https://github.com/xyflow/xyflow/pull/5974), [PR #5976](https://github.com/xyflow/xyflow/pull/5976), [PR #5955](https://github.com/xyflow/xyflow/pull/5955))
  - not used: searched `MiniMap`. None.

## @xyflow/react 12.11.5 (+ @xyflow/system 0.0.81)

Nothing in scope. This release only bumps `@xyflow/system`, which adds the internal `handleAttributionWarning` helper behind the 12.11.4 dev log. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.5), [system source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Fsystem%400.0.81))

## @xyflow/react 12.11.6 (+ @xyflow/system 0.0.82)

- **behavior change**: when the flow unmounts, the provider store now resets **all** properties. Event handlers such as `onMove*`, `onConnect*`, `onNodeDrag*` and `defaultEdgeOptions` are reset to `undefined`. In the internal `ReactFlowState` type, those fields changed from optional (`?:`) to required `| undefined`. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.6), [PR #5994](https://github.com/xyflow/xyflow/pull/5994))
  - not used: we pass none of those handlers to `<ReactFlow>` (`elimination-bracket-view.tsx:278-301`). We don't read or construct `ReactFlowState` (searched `useStore`, `useStoreApi`, `ReactFlowState`). The keyed remount inside a persistent `ReactFlowProvider` re-supplies every prop on mount. No change.
- **behavior change**: the dev-mode attribution warning is now also suppressed when the pane itself isn't rendered or visible. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.11.6), [PR #5997](https://github.com/xyflow/xyflow/pull/5997))
  - not used: see 12.11.4. We don't hide attribution.

## @xyflow/react 12.12.0 (+ @xyflow/system 0.0.83)

- **behavior change**: `onResizeEnd` now always fires after `onResizeStart`. Values reported during a resize are correct when `shouldResize` returns `false`. ([source](https://github.com/xyflow/xyflow/releases/tag/%40xyflow%2Freact%4012.12.0), [PR #5998](https://github.com/xyflow/xyflow/pull/5998))
  - not used: searched `NodeResizer`, `NodeResizeControl`, `onResizeStart`, `onResizeEnd`, `shouldResize`. None.
- **requirement**: peer dependencies at 12.12.0 are `react >=17`, `react-dom >=17`, and optional `@types/react >=17` / `@types/react-dom >=17`. Dependencies are `zustand ^4.4.0`, `classcat ^5.0.3`, and `@xyflow/system 0.0.83` (exact). ([npm](https://www.npmjs.com/package/@xyflow/react/v/12.12.0), via `npm view @xyflow/react@12.12.0 peerDependencies dependencies`)
  - not used / already satisfied: the desktop app is on React 19 with `@types/react ^19`. `@xyflow/system` is transitive only. No package outside this group needs a bump.
