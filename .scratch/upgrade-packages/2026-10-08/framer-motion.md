# framer-motion

| Package                     | Installed | Target |
| --------------------------- | --------- | ------ |
| framer-motion (apps/desktop) | 12.38.0   | 14.0.0 |

Sources: motiondivision/motion publishes **no GitHub Releases** (`gh release list` is empty; only tags). The primary sources are the root `CHANGELOG.md` at tag `v14.0.0` (<https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md>) and the React upgrade guide (<https://motion.dev/docs/react-upgrade-guide>, sections "13.0" and "14.0"). Below, `CL#<anchor>` stands for `https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#<anchor>`.

## Repo usage (what the verdicts were checked against)

- Imports, all from the main `"framer-motion"` entry (never `framer-motion/m`, `motion`, `motion/react`, `motion-dom` or `motion-utils`): `LazyMotion`, `domAnimation`, `m`, `AnimatePresence`, `LayoutGroup`, `useReducedMotion`, and the types `Transition` and `MotionProps`. Files: `apps/desktop/src/renderer/main.tsx:4`, `components/race-results-overlay.tsx:9`, `components/tournament-connector-edge.tsx:3`, `components/race-graphics.tsx:1`, `components/admin/tournaments-tab.tsx:1`, `components/projector-idle-stage.tsx:3`, `pages/race-page.tsx:7`, `pages/bracket-animation-lab-page.tsx:21`, `pages/racer-page.tsx:1-2`, and `pages/racer-sections/{shared.ts:2, tournament.tsx:3-4, racers.tsx:8, me.tsx:7, *-modal.tsx}`.
- `apps/desktop/src/renderer/main.tsx:20` wraps the app in `<LazyMotion features={domAnimation}>`. `domAnimation` does **not** load the layout or drag features, so every `layout` / `layout="position"` prop in the repo is already a no-op. That's why the layout fixes below don't apply.
- In the 14.0.0 tarball, `dist/index.d.ts` still exports `m`, `LazyMotion`, `domAnimation`, `AnimatePresence`, `LayoutGroup`, `useReducedMotion` and `MotionProps`. `Transition` comes through `export * from 'motion-dom'`. No import renames are needed.
- The only SVG motion element is `<m.path>` at `components/tournament-connector-edge.tsx:47`, which animates `opacity` and `pathLength` from 0 to 1.
- The repo has no `MotionConfig`, `isValidProp`, `m.create`, `motion.create`, `m(Component)`, styled-components or `@emotion` usage. All 33 `<m.*>` elements pass only DOM attributes (`className`, `role`, `aria-*`, `data-race-motion`, `d`, `src`, `alt`, `style`, `key`) plus motion props. Two kinds of props are spread in: `supportingCardMotion`, which contains only `initial`/`animate`/`exit`, and `layoutTransition`, which is used as `transition`.

## framer-motion 12.39.0

- **behavior change** — Variants re-run keyframe animations when switching between variant labels that share identical keyframe arrays ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12390-2026-05-18))
  - not used: searched `variants` (only comments and backend code), string-label `animate="` (no hits), and `variant=` (123 hits, all on non-motion UI components; none on an `<m.*>` element). No motion component uses variants.
- **behavior change** — `LazyMotion` shares React contexts between the `framer-motion` and `framer-motion/m` CJS bundles ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12390-2026-05-18))
  - not used: `m` is imported only from `"framer-motion"`. Searched `framer-motion/m` and `motion/react-m`, with no hits.
- **behavior change** — `AnimatePresence`: object-form `initial` values are now applied on re-entry after exit completes ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12390-2026-05-18))
  - not used in a way that needs code: the modal and overlay children under `<AnimatePresence>` (e.g. `racer-sections/queue-leave-confirm-modal.tsx:55-66`, `race-page.tsx:556`) use object `initial`. Re-entry now starts from that `initial`, which is the intended look, so no change is needed.
- **behavior change** — Drag fixes (`dragSnapToOrigin`, start point in `AnimatePresence initial={false}`, viewport-relative `dragConstraints`), and `useAnimate` now respects `skipAnimations` ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12390-2026-05-18))
  - not used: searched `drag=`, `dragConstraints`, `dragSnapToOrigin`, `useDragControls`, `useAnimate`, `skipAnimations`. Only native `draggable={false}` / `draggable="false"` attributes and unrelated `dragRef` code turned up.
- **behavior change** — `useScroll` hydrates `target`/`container` refs from anywhere and has a hardware-acceleration fix; `scroll` callback progress fix; `visualElement` hydration order changed ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12390-2026-05-18))
  - not used: searched `useScroll`, `scroll(`, `scrollInfo`. No SSR or hydration, since the renderer uses `ReactDOM.createRoot`.
- Additions only (`repeatType`/`repeatDelay` in sequences): nothing to do.

## framer-motion 12.40.0

Additions only (`path` transition option, `arc()`). Nothing in scope. ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12400-2026-05-21))

## framer-motion 12.41.0

- **behavior change** — `animateView`: `.enter()`/`.exit()` now refer specifically to new/old layers, and interrupted setups return a resolved animation instead of throwing ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12410-2026-06-23))
  - not used: searched `animateView`, `AnimateView`, `animateLayout`.
- **behavior change** — `AnimatePresence`: prevents stuck exit animations when children interrupt. `drag`: a child's `e.stopPropagation()` no longer breaks drag end ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12410-2026-06-23))
  - not used in a way that needs code: this is a bug fix to `AnimatePresence`, which the repo uses (see 12.43.0), and requires no code change. No drag.

## framer-motion 12.42.0

- **behavior change** — `animateView`: layers are auto-grouped to match the DOM hierarchy, and automatic `border-radius` animation is disabled ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12420-2026-06-24))
  - not used: searched `animateView`.

## framer-motion 12.42.1

- **behavior change** — `animateView`: the old layer's fade-out is cancelled when `.new()` is defined ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12421-2026-06-30))
  - not used: searched `animateView`.

## framer-motion 12.42.2

- **behavior change** — `animateView`: cropped group layers animate `border-radius` ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12422-2026-07-01))
  - not used: searched `animateView`.

## framer-motion 12.43.0

- [ ] **behavior change** — `AnimatePresence`: exiting children no longer interleave with entering children. Before, interleaving could reorder and remount children present in both renders ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12430-2026-07-27))
  - affected: no code change; verify visually. Exiting `popLayout` cards now sort separately from entering ones, so check that card order and enter/exit look right when items swap:
    - `apps/desktop/src/renderer/components/admin/tournaments-tab.tsx:313` and `:389` (`<AnimatePresence initial={false} mode="popLayout">`)
    - `apps/desktop/src/renderer/pages/racer-page.tsx:1447`
    - `apps/desktop/src/renderer/pages/racer-sections/tournament.tsx:166`
    - `apps/desktop/src/renderer/pages/racer-sections/racers.tsx:100`
- [ ] **behavior change** — Hardware acceleration (WAAPI) for SVG elements ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12430-2026-07-27))
  - affected: `apps/desktop/src/renderer/components/tournament-connector-edge.tsx:47-57`. The `<m.path>` `opacity` animation can now run on the compositor. No code change; verify that the bracket connector draw animation still fades in and ends fully opaque. See also the 13.0.0 and 13.3.0 items.
- **behavior change** — Hardware acceleration for `backgroundColor` ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12430-2026-07-27))
  - not used: searched `backgroundColor`. The only hits are the Electron `BrowserWindow` options at `apps/desktop/src/electron/main.ts:142,162`, which have nothing to do with motion.
- **breaking** — A custom `motion` component now throws when passed an incorrect `ref` type ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#12430-2026-07-27))
  - not used: searched `m.create`, `motion.create`, `m(`, `motion(`. The repo only uses built-in `m.div` / `m.img` / `m.path` tags.

## framer-motion 13.0.0-alpha.0

Prerelease with no CHANGELOG entry of its own. Its changes ship in 13.0.0 below. Nothing extra in scope. ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1300-2026-08-05))

## framer-motion 13.0.0

- **breaking** / **requirement** — Removed the optional `@emotion/is-prop-valid` dependency/peer. To keep Emotion-style prop filtering, you now pass it explicitly with `<MotionConfig isValidProp={isPropValid}>`, or wrap a styled component with `motion.create()` ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1300-2026-08-05), [upgrade guide 13.0](https://motion.dev/docs/react-upgrade-guide))
  - not used: searched `MotionConfig`, `isValidProp`, `is-prop-valid`, `@emotion`, `styled-components`, `m.create`, `motion.create`. All 33 `<m.*>` elements pass only valid DOM attributes plus motion props (see Repo usage). Without is-prop-valid, `filterProps` forwards every non-motion prop to the DOM, so no unknown prop can leak. No `MotionConfig` is needed.
  - Lockfile note: `@emotion/is-prop-valid@0.8.8` is in `pnpm-lock.yaml` only as framer-motion's optional peer, and it drops out on reinstall. Don't add it as a direct dependency.
- **behavior change** — Hardware-accelerated SVG elements correctly apply their final style on animation complete ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1300-2026-08-05))
  - covered by the 12.43.0 SVG item (`tournament-connector-edge.tsx:47`). This fix ensures the final `opacity: 1` sticks, and no code change is needed.
- **behavior change** — `AnimatePresence`: nodes are marked safe to remove when `propagate` renders with no `motion` children ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1300-2026-08-05))
  - not used: searched `propagate`.

## framer-motion 13.1.0

Additions only (multidimensional `Reorder`, automatic axis detection, RTL). Nothing in scope. ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1310-2026-08-10))

## framer-motion 13.1.1-alpha.0

Prerelease with no CHANGELOG entry of its own. Its changes ship in 13.1.1 below. Nothing extra in scope. ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1311-2026-08-18))

## framer-motion 13.1.1

- **behavior change** — Animation `window` access is guarded in non-browser runtimes, and `AnimatePresence` has improved compatibility with React 19 strict mode ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1311-2026-08-18))
  - not used in a way that needs code: the renderer runs `<React.StrictMode>` (`apps/desktop/src/renderer/main.tsx:18`) with React 19.2.5 and many `AnimatePresence` sites. This is a bug fix with no code change. Animations run only in the Electron renderer and browser, never in the Node backend.

## framer-motion 13.2.0

- **breaking** (internal) — `MotionValueState` no longer caches values in `latest`, and `set()` drops its `useDefaultValueType` argument ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1320-2026-09-03))
  - not used: searched `MotionValueState`, `useMotionValue`, `createEffect`, `addEffect`.
- **behavior change** — `spring` has a smaller filesize and better performance ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1320-2026-09-03))
  - not used in a way that needs code: spring transitions at `components/race-graphics.tsx:608`, `components/admin/tournaments-tab.tsx:304` and `pages/racer-page.tsx:1031` use the standard `stiffness`/`damping`/`mass` options, which are unchanged.

## framer-motion 13.3.0

- [ ] **behavior change** — `animate`: fixed path drawing calculations ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1330-2026-09-14))
  - affected: `apps/desktop/src/renderer/components/tournament-connector-edge.tsx:51-52` (`pathLength: 0 → 1` on `<m.path>`). No code change; verify that the connector stroke still draws fully from start to end, with no dash gaps or overshoot, in the bracket view and `bracket-animation-lab-page.tsx`.
- **behavior change** — Perf only: `springValue`/`useSpring` retargeting, `animate` startup and per-frame cost, `frame` scheduling ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1330-2026-09-14))
  - not used: searched `useSpring`, `springValue`, `frame.`, `animate(`. The only hits are unrelated: a local rAF `function animate()` at `pages/race-page.tsx:407` and non-motion `frame.` hits in the backend and shared-ui. No API change for `m.*` users.

## framer-motion 13.4.0

- **requirement** (feature-only) — New `AnimateView` component needs React 19.3 `ViewTransition` ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1340-2026-09-14))
  - not used: searched `AnimateView`. The repo is on React 19.2.5, which is fine because the package peer range is still `^18.0.0 || ^19.0.0`.

## framer-motion 13.4.1

- **behavior change** — `animate`: CSS variable writes on SVGs now go to the `style` attribute ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1341-2026-09-22))
  - not used: the only SVG motion element (`tournament-connector-edge.tsx:47`) animates `opacity`/`pathLength`, with no `--var` targets. Searched `"--` on lines with `animate`/`initial`/`exit` and found no hits.

## framer-motion 13.4.2

- **behavior change** — Unrecognised easing names no longer throw. `Reorder` origin fix ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1342-2026-09-23))
  - not used: every `ease:` value is `"easeOut"` or a cubic-bezier array (`race-results-overlay.tsx:64`, `tournaments-tab.tsx:298`, `projector-idle-stage.tsx:172`, `tournament-connector-edge.tsx:55`, `race-page.tsx:482,513`, `racer-page.tsx:1025`). Searched `Reorder`.

## framer-motion 13.4.3

- **behavior change** — `<motion>` animations replay when `Suspense` reveals memoized content ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1343-2026-09-24))
  - not used: searched `<Suspense`, `Suspense`.

## framer-motion 13.4.4

- **breaking** (internal) — Removed `ScrollTimeline` support for JS scroll callbacks. Also: `useDragControls` `snapToCursor`, `drag` `pointerend` timing, spring value validation, and `AnimatePresence` children no longer sticking on re-entry ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1344-2026-09-25))
  - not used: searched `scroll(`, `useScroll`, `ScrollTimeline`, `useDragControls`, `drag=`. The `AnimatePresence` re-entry item is a bug fix with no code change.

## framer-motion 13.4.5

- **behavior change** — `layout`: relative child no longer jumps when parent interrupts a layout animation. `AnimatePresence` can no longer drop a child added during another exit. `Reorder` guard fix ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1345-2026-09-28))
  - not used: the `layout` props (`tournaments-tab.tsx:317,348,393,426`, `racer-page.tsx:1451`, `racers.tsx:41,54,70`, `me.tsx:72`, `tournament.tsx:127,170`) are inert under `LazyMotion features={domAnimation}` (`main.tsx:20`), because `domAnimation` has no layout feature. The `AnimatePresence` part is a bug fix with no code change. Searched `Reorder`.

## framer-motion 13.4.6

- **behavior change** — `AnimatePresence` `mode="wait"` no longer drops new children when `exit` completes during a React transition ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1346-2026-09-29))
  - not used: searched `mode="wait"`. Only `mode="popLayout"` and the default mode are used.

## framer-motion 13.4.7

Tagged `v13.4.7` and listed in the CHANGELOG, but **never published to npm** (`npm view framer-motion versions` goes from 13.4.6 to 13.5.0). Its changes ship in 13.5.0.

- **behavior change** — `scroll`/`useScroll`: more `offset`s use `ViewTimeline`, `ScrollTimeline`/`ViewTimeline` observer removed. `useTransform` accelerated values clamp ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1347-2026-09-30))
  - not used: searched `useScroll`, `scroll(`, `useTransform`.

## framer-motion 13.5.0

- **behavior change** — Values are never rendered before they've been resolved ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1350-2026-10-01))
  - not used in a way that needs code: this is a global rendering-correctness change. Every `m.*` element sets explicit `initial`, or `initial={false}`, with concrete values, so no code change is needed.
- **behavior change** — `scroll`/`useScroll` use the main thread for all `offset` animations. `warning`/`error` stripped from production builds ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1350-2026-10-01))
  - not used: searched `useScroll`, `scroll(`. The stripped warnings don't affect any repo code or tests (no `*.test.ts(x)` file mentions `framer-motion` or `motion`).
- Additions only (negative `bounce` for overdamped springs): searched `bounce`, no hits.

## framer-motion 13.5.1

- **behavior change** — `<motion>` falls back to the attribute in `readSVGValue` when computed style is empty. `svgEffect` no longer writes transforms and origins as attributes ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1351-2026-10-02))
  - not used in a way that needs code: `<m.path>` at `tournament-connector-edge.tsx:47` provides an explicit `initial`, so it never reads values from the DOM. No `transform`/`x`/`scale` on SVG. Searched `svgEffect`.
- **behavior change** — `inherit={false}` now correctly stops inheriting parent animations. `styleEffect` cleanup fix. `sortNodePosition` no longer throws when a sibling isn't mounted ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1351-2026-10-02))
  - not used: searched `inherit=`, `styleEffect`, `sortNodePosition`.

## framer-motion 14.0.0

- **breaking** (internal) — Removed internal APIs that 13.5.1 had temporarily restored (e.g. `observeTimeline`). The upgrade guide states that 14.0 has "no breaking changes for Motion for React" and "deprecates some internal APIs" without naming them ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1400-2026-10-02), [upgrade guide 14.0](https://motion.dev/docs/react-upgrade-guide))
  - not used: searched `observeTimeline`, `motion-dom`, `motion-utils`. Every import uses the public entry `"framer-motion"`.
- **requirement** — Stricter internal versioning. framer-motion 14.0.0 now **pins exact** `motion-dom: 14.0.0` and `motion-utils: 14.0.0`, where 12.38.0 used caret ranges (`^12.38.0` / `^12.36.0`). Peer deps are unchanged: `react`/`react-dom` `^18.0.0 || ^19.0.0` ([source](https://github.com/motiondivision/motion/blob/v14.0.0/CHANGELOG.md#1400-2026-10-02), [upgrade guide 14.0](https://motion.dev/docs/react-upgrade-guide), `npm view framer-motion@14.0.0 dependencies peerDependencies`)
  - not used: the repo has no direct `motion-dom`/`motion-utils` dependency and no `pnpm.overrides` or resolutions for them. Searched `motion-dom`, `motion-utils` across `apps packages tools`, plus `overrides`/`motion` in the root `package.json` and `pnpm-workspace.yaml`, with no hits. Don't add overrides for them; let framer-motion's exact pins resolve. React 19.2.5 satisfies the peer range.
