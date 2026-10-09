# react

| Package          | Installed                                                                   | Target |
| ---------------- | --------------------------------------------------------------------------- | ------ |
| react            | 19.2.5 (apps/desktop, packages/shared-ui); 19.2.6 (tools/photo-booth-agent) | 19.3.0 |
| react-dom        | 19.2.5 (apps/desktop); 19.2.6 (tools/photo-booth-agent)                     | 19.3.0 |
| @types/react     | 19.2.14 (apps/desktop, packages/shared-ui, tools/photo-booth-agent)         | 19.3.0 |
| @types/react-dom | 19.2.3 (apps/desktop, tools/photo-booth-agent)                              | 19.3.0 |

Summary: no breaking changes, no deprecations and no code edits required. The items marked `[ ]` are spots in the repo that 19.3 behavior changes touch. Each one needs a manual check only. Repo TypeScript is 5.9.3 (root `package.json:58` `^5.8.3`; both lockfiles resolve 5.9.3), which meets the new `@types` floor of TS 5.6.

### React Compiler / eslint-plugin-react-hooks interplay

- `babel-plugin-react-compiler@1.0.0` (`apps/desktop/vite.config.ts:25`, `apps/desktop/vitest.config.ts:9`, no `target` option, so its output imports `react/compiler-runtime`). `react@19.3.0` still exports `./compiler-runtime` (`npm view react@19.3.0 exports`). The compiler has no peer dependency on react (`npm view babel-plugin-react-compiler@1.0.0 peerDependencies` → only `@babel/types`). No change needed.
- `eslint-plugin-react-hooks@7.1.1` (`eslint.config.mjs:6`) is still the `latest` dist-tag. Its peer dependency is only `eslint`, and nothing in the 19.3 notes requires a newer plugin. No change needed.
- The new DEV warning about conditional `use()` (see 19.3.0 below) only fires when `use(promise)` is skipped based on promise status. The compiler never makes `use()` conditional, and the repo's only `use()` call reads a Context. No interplay.

## react / react-dom 19.2.6

(Applies only to apps/desktop and packages/shared-ui, which have 19.2.5 installed. The photo-booth-agent is already on 19.2.6.)

- **behavior change**: React Server Components type hardening and performance improvements for Flight replies ([source](https://github.com/facebook/react/releases/tag/v19.2.6), [#36425](https://github.com/facebook/react/pull/36425))
  - not used: searched `react-server-dom`, `react-dom/server`, `renderToString`, `renderToStaticMarkup`, `hydrateRoot`, `use server`. The app renders client-only with `ReactDOM.createRoot` (`apps/desktop/src/renderer/main.tsx:17`).

## react / react-dom 19.2.7

- **behavior change**: fixed missing `FormData` entries in Server Actions, a regression from 19.2.6 ([source](https://github.com/facebook/react/releases/tag/v19.2.7), [#36566](https://github.com/facebook/react/pull/36566))
  - not used: searched `<form ... action=`, `useActionState`, `useFormStatus`, `requestFormReset`, `use server`. No Server Actions or form actions.

## react / react-dom 19.2.8

- **behavior change**: RSC decoding performance improvements ([source](https://github.com/facebook/react/releases/tag/v19.2.8), [#37087](https://github.com/facebook/react/pull/37087))
  - not used: same RSC searches as 19.2.6, all empty.

## react / react-dom 19.3.0

Release notes: [GitHub release v19.3.0](https://github.com/facebook/react/releases/tag/v19.3.0). Release post: [react.dev/blog/2026/09/09/react-19-3](https://react.dev/blog/2026/09/09/react-19-3). The post lists no breaking changes, deprecations or upgrade steps. Requirement: `react-dom@19.3.0` peers on `react: ^19.3.0` (`npm view react-dom@19.3.0 peerDependencies`), so react and react-dom must move together in every package, as already planned. `engines` is unchanged (`node >=0.10.0`).

- [ ] **behavior change**: Transitions now render independently instead of being entangled into one render, so a slow transition no longer holds up unrelated ones ([source](https://github.com/facebook/react/releases/tag/v19.3.0), [#37290](https://github.com/facebook/react/pull/37290))
  - affected (indirectly, verify only): the repo never calls `useTransition` or `startTransition` (searched both, no hits). But TanStack Router wraps navigation in `startTransition` (`node_modules/.pnpm/@tanstack+react-router@1.169.0…/dist/esm/Transitioner.js`, `link.js`). Required change: none. Click quickly between admin tabs and routes in `pnpm dev` and confirm the router doesn't commit a stale route.
- [ ] **behavior change**: `resize` events are now batched with other continuous events until the next frame, instead of being flushed when the next discrete event arrives. They still flush before paint ([source](https://github.com/facebook/react/releases/tag/v19.3.0), [#35117](https://github.com/facebook/react/pull/35117))
  - affected (verify only): `apps/desktop/src/renderer/components/race-graphics.tsx:85`. The `useViewportHeight` resize listener calls `setHeight(window.innerHeight)`. Required change: none. Resize the projector window and confirm the rider/name sizing still tracks it.
  - `apps/desktop/src/renderer/lib/use-masonry-grid.ts:46` also listens to `resize`, but it only mutates DOM styles and never calls `setState`, so it is unaffected.
- **behavior change**: DEV-only warning when a component appears to have been unblocked by calling `use()` conditionally on promise status ([source](https://github.com/facebook/react/releases/tag/v19.3.0), [#37104](https://github.com/facebook/react/pull/37104), [#37491](https://github.com/facebook/react/pull/37491))
  - not used: searched `\buse\(`. The only React hit is `packages/shared-ui/src/toast-context.ts:15` `use(ToastContext)`, a Context rather than a promise, so it can't trigger the warning. Also searched `useSuspenseQuery`, `.promise`, `prefetchInRender`, `Suspense`, with no hits.
- [ ] **behavior change**: StrictMode now double-invokes effects for components newly mounted by Fast Refresh ([#35962](https://github.com/facebook/react/pull/35962)) and during hydration ([#35961](https://github.com/facebook/react/pull/35961)), and no longer invokes effects on moved children ([#36948](https://github.com/facebook/react/pull/36948)). All DEV-only ([source](https://github.com/facebook/react/releases/tag/v19.3.0))
  - affected (dev-only, verify only): `apps/desktop/src/renderer/main.tsx:18` and `tools/photo-booth-agent/src/kiosk/main.tsx:254` render under `StrictMode`. Required change: none. Effects must already be idempotent under StrictMode. After a Fast Refresh edit in `pnpm dev`, expect effects such as the WebSocket subscription and the resize listener to mount, unmount and mount again. The hydration change is n/a because there is no `hydrateRoot`.
- **behavior change**: Trusted Types integration enabled. React no longer string-coerces values passed to DOM sinks ([source](https://react.dev/blog/2026/09/09/react-19-3), [#35816](https://github.com/facebook/react/pull/35816))
  - not used: searched `trustedTypes`, `TrustedHTML`, `require-trusted-types`, `dangerouslySetInnerHTML`, `innerHTML`, with no hits.
- **behavior change**: `defaultValue` on `type="number"` inputs is now updated immediately like other input types, instead of being deferred until blur ([source](https://github.com/facebook/react/releases/tag/v19.3.0), [#36980](https://github.com/facebook/react/pull/36980))
  - not used: no number input uses `defaultValue`. Searched `defaultValue=`: the only hits are a text input (`apps/desktop/src/renderer/components/admin/race-tab.tsx:96`) and a textarea (`apps/desktop/src/renderer/components/admin/settings-tab.tsx:347`). The number inputs are all controlled via `value` (`race-tab.tsx:119`, `settings-tab.tsx:194`, `settings-tab.tsx:211`, `pages/queue-lab-page.tsx:219`). For those, only the DOM `value` attribute now syncs earlier, with no visible change and no code change.
- **behavior change**: `onReset` now fires when React automatically resets a form after a form action. `submit` events now include `submitter`, and `FormData` uses the submitter ([source](https://github.com/facebook/react/releases/tag/v19.3.0), [#35176](https://github.com/facebook/react/pull/35176), [#35590](https://github.com/facebook/react/pull/35590), [#29028](https://github.com/facebook/react/pull/29028))
  - not used: searched `<form ... action=`, `onReset` (the hits are only custom component props like `onResetCurrent` and `onReset` on `Button` wrappers in `glow-lab-page.tsx`, not DOM form `onReset`), `submitter`, `useActionState`, `useFormStatus`. The `onSubmit` hits (`registration-wizard.tsx:133`, `display-name-step.tsx:15`) are custom callback props, not form actions.
- **behavior change**: `useActionState` error messages say "action state" instead of "form state" ([source](https://github.com/facebook/react/releases/tag/v19.3.0), [#35790](https://github.com/facebook/react/pull/35790))
  - not used: searched `useActionState`, `form state` in source and tests, with no hits.
- **behavior change**: `useEffectEvent` now reads the latest values in `forwardRef` and `memo()` components ([source](https://github.com/facebook/react/releases/tag/v19.3.0), [#34831](https://github.com/facebook/react/pull/34831))
  - not used: `useEffectEvent` is used (`components/elimination-bracket-view.tsx:204`, `:361`; `pages/racer-page.tsx:446`), but searching `\bmemo\(`, `forwardRef` returned nothing, so the fixed path is not hit.
- **behavior change**: Activity fixes (hidden-tree `useSyncExternalStore` mutations, portal hiding, metadata hoisting, error containment) and the `useDeferredValue` stuck fix ([source](https://github.com/facebook/react/releases/tag/v19.3.0), [#36947](https://github.com/facebook/react/pull/36947), [#35091](https://github.com/facebook/react/pull/35091), [#36134](https://github.com/facebook/react/pull/36134))
  - not used: searched `\bActivity\b` (the only hit is the string "Activity Log" in `queue-lab-page.tsx:485`), `useDeferredValue`, `useSyncExternalStore`, `createPortal`, all with no React usage.
- **behavior change**: `React.lazy` resolves `.default` as the canonical value, and there are several Fast Refresh fixes for `lazy()` and `memo()` ([source](https://github.com/facebook/react/releases/tag/v19.3.0), [#34906](https://github.com/facebook/react/pull/34906), [#36965](https://github.com/facebook/react/pull/36965))
  - not used: searched `\blazy\(`, `\bmemo\(`, with no hits. Route code-splitting is via TanStack Router, not `React.lazy`, in repo code.
- **behavior change**: owner stacks are limited to 10 frames in DEV ([source](https://github.com/facebook/react/releases/tag/v19.3.0), [#34864](https://github.com/facebook/react/pull/34864))
  - not used: searched `captureOwnerStack`, `componentStack`, and console-spy assertions on React warnings. The only console spy (`apps/desktop/src/backend/services/payment.test.ts:231`) is backend-only.
- **behavior change**: React DOM additions and fixes: `toggle` event `source`, `onFullscreenChange`/`onFullscreenError`, `credentialless`, `maskType`, `fetchPriority`/`nonce` for module preloads, `innerHTML` no longer reset when unchanged ([source](https://github.com/facebook/react/releases/tag/v19.3.0))
  - not used: searched `onToggle` (only the custom prop `onToggleExpanded`), `onFullscreen`, `credentialless`, `maskType`, `preloadModule`, `preinit`, `fetchPriority`, `dangerouslySetInnerHTML`, all with no DOM usage.
- **behavior change**: React Server (Fizz) and RSC changes (abort handling, `onAllReady` no longer fires after a shell error, `onBrowserBailout`, `nonce` on import maps, and so on) ([source](https://github.com/facebook/react/releases/tag/v19.3.0))
  - not used: searched `react-dom/server`, `react-dom/static`, `renderToString`, `renderToPipeableStream`, `prerender`, `react-server-dom`, with no hits.
- New stable APIs (not breaking): `<ViewTransition>`, `addTransitionType`, Fragment refs, `react-dom` `browser()` ([source](https://github.com/facebook/react/releases/tag/v19.3.0)). No action.

## @types/react 19.2.15

- **behavior change (types)**: `fetchPriority` on `<img>`/`<link>` now also accepts `undefined` (needed under `exactOptionalPropertyTypes`) ([source](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/6e3decd6916761a6e4686304de001d5785878d87))
  - not used: searched `fetchPriority`, with no hits. The change only widens the type anyway.
- **requirement**: the published `typeScriptVersion` floor rose from 5.2 (19.2.14) to 5.3 ([source](https://registry.npmjs.org/@types/react/19.2.15), `npm view @types/react@19.2.15 typeScriptVersion`)
  - not used (already satisfied): repo TS is 5.9.3 (root `package.json:58`, `pnpm-lock.yaml`, `tools/photo-booth-agent/pnpm-lock.yaml`).

## @types/react 19.2.16

- **behavior change (types)**: `react/jsx-runtime` and `react/jsx-dev-runtime` no longer declare their own `JSX` namespace. They re-export `React.JSX` (`export { Fragment, JSX } from "./"`). Module augmentation of `JSX` inside `react/jsx-runtime` would no longer merge ([source](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/49ed2e3d3a1d88c397f0d40ea84f47f768823bf0))
  - not used: searched `jsx-runtime`, `jsx-dev-runtime`, `jsxImportSource`, `declare module "react`, `declare global`, `namespace JSX`, `JSX\.`, with no hits in apps/, packages/, tools/ or root config.

## @types/react 19.2.17

Nothing in scope. JSDoc link fixes only ([source](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/fbbe9480f84cc20727e9ff9a7bba7a1cb66157a9)).

## @types/react 19.2.18

- **behavior change (types)**: `Usable<T>` widened to include `RendererUsable<T>[keyof RendererUsable<T>]`, a new interface that renderers augment ([source](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/a414786ca9309a76c8a35fe249dab28668a69b79))
  - not used: searched `Usable\b`, `RendererUsable`, with no hits. `use(ToastContext)` (`packages/shared-ui/src/toast-context.ts:15`) is unaffected.
- **requirement**: `typeScriptVersion` floor raised to 5.6 ([source](https://registry.npmjs.org/@types/react/19.2.18), `npm view @types/react@19.2.18 typeScriptVersion`)
  - not used (already satisfied): repo TS 5.9.3.

## @types/react 19.3.0

- **behavior change (types)**: canary-only types are promoted to stable and `types/react/canary.d.ts` is emptied (-94 lines). New stable exports: `ViewTransition`, `ViewTransitionProps`/`Instance`/`Class`, `addTransitionType`, `FragmentInstance`. `FragmentProps` gains `ref?: Ref<FragmentInstance>`. `SubmitEvent.submitter: HTMLElement | null` is now declared ([source](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/de5e8f01d01a14ae4ae502283d3d09f042f1ad89))
  - not used: searched `react/canary`, `react/experimental`, `FragmentProps`, `FragmentInstance`, `<Fragment … ref`, `ViewTransition`, `addTransitionType`, `SubmitEvent`, `FormEvent`, `submitter`, with no hits. Repo code that collides with the new exported names: none.

## @types/react-dom 19.2.4

- **behavior change (types)**: adds `browser()` and `BrowserUsable` to `react-dom/canary` types ([source](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/a414786ca9309a76c8a35fe249dab28668a69b79))
  - not used: searched `react-dom/canary`, `browser()`, with no hits.
- **requirement**: `typeScriptVersion` floor rose from 5.2 (19.2.3) to 5.6 ([source](https://registry.npmjs.org/@types/react-dom/19.2.4), `npm view @types/react-dom@19.2.4 typeScriptVersion`)
  - not used (already satisfied): repo TS 5.9.3.

(DT commits between 19.2.3 and 19.2.4 that touched `types/react-dom`, namely [e429094](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/e42909429872fbf1865e12e389edba88f426f978), [1bfb3a0](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/1bfb3a01af9c94ad7c913a0f6359b3bfb8205602) and [982edf5](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/982edf5d9655b7eca3825d113f90ebdbed4aaa39), only changed `types/react-dom/test/*`. Nothing in scope.)

## @types/react-dom 19.2.5

Nothing in scope. Adds an optional `reason` parameter to `browser()` in `react-dom/canary` only ([source](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/199564ee7decf22f3e3e4166913e7fced797ecd7)). There is no `react-dom/canary` usage (searched `react-dom/canary`).

## @types/react-dom 19.2.6

- **breaking (types)**: server and static rendering options were renamed or retyped. `headersLengthHint` is renamed to `maxHeadersLength`, `nonce` is widened to `NonceOption`, `RenderToPipeableStreamOptions.onHeaders` now receives a `HeadersDescriptor` (`{ Link?: string }`) instead of `Headers`, and `resumeToPipeableStream` takes `ResumeToPipeableStreamOptions` ([source](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/15ef532b8ee6c75100990e25e7b5689d5728e256))
  - not used: searched `react-dom/server`, `react-dom/static`, `headersLengthHint`, `onHeaders`, `renderToPipeableStream`, `resumeToPipeableStream`, `prerender`. The only `Headers`-like hits are `getRacerSessionHeaders` and `buildJsonHeaders` in `apps/desktop/src/renderer/lib/api.ts`, which are fetch helpers unrelated to React.

## @types/react-dom 19.2.7

Nothing in scope. Adds `onBrowserBailout` to `react-dom/canary` server option types only ([source](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/8443606b19593c505271bda9ad1238e10a2ef78a)). There is no canary or server usage.

## @types/react-dom 19.3.0

- **requirement**: peer dependency raised to `@types/react: ^19.3.0` (was `^19.2.0`) ([source](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/de5e8f01d01a14ae4ae502283d3d09f042f1ad89), `types/react-dom/package.json`)
  - not used (already satisfied, in-group): `@types/react` moves to 19.3.0 in the same upgrade in apps/desktop and tools/photo-booth-agent. Upgrade both together.
- **behavior change (types)**: canary types promoted to stable in `react-dom` index, server and static types: the `react` module augmentation for `ViewTransitionInstance`, the `FragmentInstance` DOM methods and `RendererUsable["react-dom/browser"]`; `browser(reason?)`; `onBrowserBailout` on the server/static options. `react-dom/canary.d.ts` is emptied ([source](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/de5e8f01d01a14ae4ae502283d3d09f042f1ad89))
  - not used: searched `react-dom/canary`, `FragmentInstance`, `ViewTransition`, `browser()`, `onBrowserBailout`, `react-dom/server`, `react-dom/static`, with no hits.

## Out-of-group peer ranges checked

Every `react`/`react-dom` peer range in `pnpm-lock.yaml` and `tools/photo-booth-agent/pnpm-lock.yaml` is open-ended (`^19.0.0`, `^18 || ^19`, `>=17`, `>=18.0.0 || >=19.0.0`, `^16.8.0 || … || ^19.0.0`). Nothing outside this group needs a bump for 19.3.0.
