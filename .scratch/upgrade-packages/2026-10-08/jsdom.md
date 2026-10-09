# jsdom

| Package | Installed | Target |
| ------- | --------- | ------ |
| jsdom   | 26.1.0    | 30.1.2 |

Where jsdom is used: only as the Vitest test environment for `apps/desktop` (`apps/desktop/vitest.config.ts:20` `environment: "jsdom"`; setup in `apps/desktop/src/renderer/test/setup.ts`). Nothing imports `jsdom` directly (searched `from "jsdom"`, `require("jsdom")`, `VirtualConsole`, `ResourceLoader`, `CookieJar` across `apps/`, `packages/`, `tools/`, `scripts/`). `packages/shared`, `packages/shared-ui` and `tools/photo-booth-agent` have no jsdom environment (no vitest config, or `environment: "node"`), so they are not touched.

Version bump: `apps/desktop/package.json:94` `"jsdom": "^26.1.0"` → `"^30.1.2"`.

Sources: jsdom no longer ships a `Changelog.md` at the target tag (the repo root at `v30.1.2` has none), so each release's GitHub Release notes are the primary source (`https://github.com/jsdom/jsdom/releases/tag/<tag>`).

Compatibility with the installed Vitest (3.2.4, outside this group): Vitest's jsdom environment (`node_modules/vitest/dist/chunks/index.CmSc2RE5.js:422-480`) only calls the removed `VirtualConsole#sendTo()` when `environmentOptions.jsdom.console` is set, and the removed `ResourceLoader` class only when `environmentOptions.jsdom.userAgent` is set. The repo sets neither (searched `environmentOptions`, `@vitest-environment`: empty), so Vitest 3.2.4 keeps working. A scratch probe (vitest 3.2.4 + jsdom 30.1.2, Node 22.22.3) passed: dialog UA `display`, custom property round-trip, `Object.defineProperty(event, "target")`, `localStorage`, `Blob#text()`, `TextEncoder`, `element.click()`. Vitest 4/5's `makeCompatBlob` `URL.createObjectURL` breakage on jsdom 30.1 ([vitest#11336](https://github.com/vitest-dev/vitest/issues/11336)) is not present in 3.2.4 (grep `_buffer`, `createObjectURL` in its jsdom env: empty), and no test reaches `URL.createObjectURL` (it is only in `settings-tab.tsx:51`, which no test renders). That only matters if Vitest is upgraded separately.

## jsdom 27.0.0-beta.0

- **behavior change**: CSS selector engine switched from `nwsapi` to `@asamuzakjp/dom-selector` ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.0))
  - not used: the only selectors in tests are simple class/tag `querySelector` calls (`rumble.test.tsx:137,195,214,292,301`, e.g. `.racer-state-card strong`, `.racer-queue-row__eta`), and these behave the same in both engines. No `:has()`, `:scope`, `:nth-child(of)` or attribute-case selectors (searched `:has(`, `:scope`, `nth-child`, `querySelector` in `*.test.ts*`).
- **behavior change**: new event constructors (`BeforeUnloadEvent`, `BlobEvent`, `DeviceMotionEvent`, `DeviceOrientationEvent`, `PointerEvent`, `PromiseRejectionEvent`, `TransitionEvent`) may break feature detection ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.0))
  - not used: searched `PointerEvent`, `TransitionEvent`, `typeof .*Event` in `apps/desktop/src/renderer`, `packages/shared-ui/src`: no feature detection.
- **behavior change**: `element.click()` fires a `PointerEvent` instead of a `MouseEvent` ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.0))
  - not used: the only `.click()` is `apps/desktop/src/renderer/components/admin/settings-tab.tsx:56` (download link), which no test renders. Tests use Testing Library `fireEvent.click`, which builds its own `MouseEvent`.
- **behavior change**: some events are passive by default ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.0))
  - not used: searched `addEventListener("wheel`, `addEventListener("touch`, `passive` in renderer/shared-ui source: empty.
- **behavior change**: `document.createEvent()` accepts a more correct set of event names ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.0))
  - not used: searched `createEvent(`: empty outside node_modules.

## jsdom 27.0.0-beta.1

- **requirement**: Node.js v20+ minimum ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.1))
  - not used: the dev machine runs Node 22.22.3. CI (`.github/workflows/release.yml:63` `node-version: "22"`) only packages and never runs tests. See 30.0.0 for the final floor.
- **breaking**: the user agent stylesheet is now derived from the HTML Standard, not Chromium, so `getComputedStyle()` results can change ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.1))
  - not used: no test asserts computed styles (searched `getComputedStyle`, `toHaveStyle`, `toBeVisible`, `getAttribute("style")` in `*.test.ts*`: empty). Testing Library's `getByRole` checks computed `display`/`visibility` internally, and `dialog:not([open]) { display: none }` behaves the same. The probe confirmed a closed `<dialog>` computes `display: none` on 30.1.2. The 5 `getByRole/findByRole("dialog")` queries rely on the `setup.ts` polyfill setting `open = true`, which is unchanged.
- **breaking**: virtual console: `sendTo()` renamed `forwardTo()`, `omitJSDOMErrors` replaced by a `jsdomErrors` option, XHR-fetch `jsdomError`s no longer emitted, printed output streamlined ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.1))
  - not used: searched `sendTo(`, `forwardTo(`, `omitJSDOMErrors`, `VirtualConsole`: empty in repo code. Vitest 3.2.4 calls `sendTo` only when `environmentOptions.jsdom.console` is set, and it isn't (see top).
- **behavior change**: `ElementInternals` accessibility getters/setters now work; `Object.defineProperty()` works on more objects (e.g. `HTMLSelectElement`) ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.1))
  - not used: searched `attachInternals`, `ElementInternals`: empty. The only `Object.defineProperty` in tests is on a `KeyboardEvent` instance (`apps/desktop/src/renderer/lib/shortcuts.test.ts:10`), which the probe verified still works on 30.1.2.

## jsdom 27.0.0-beta.2

- **behavior change**: `Window` spec conformance: named properties, and many data properties became accessor properties ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.2))
  - not used: `vi.stubGlobal("location", …)` (`registration-wizard-after-signup.test.tsx:262`) and `vi.stubGlobal("WebSocket"|"ResizeObserver"|"fetch", …)` stub Vitest's Node global, not the jsdom `Window` (Vitest sets `global.window = global`), so the `window.location.assign` call in `payment-step.tsx:76` still resolves to the stub. No code reads `window.<elementId>` named properties (searched `window\.[a-z]+Form`, `document\.forms`: empty).
- **behavior change**: `cssstyle` updated to v4.4.0 (`CSSStyleDeclaration` conformance) ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.2))
  - not used: the only test reading style is `use-height-css-variable.test.tsx:37` (custom property `--test-dock-height` via `style.getPropertyValue`). Custom property values round-trip verbatim; the probe got `"112px"` back.

## jsdom 27.0.0-beta.3

- **breaking**: `tough-cookie` upgrade: `http://localhost/` counts as a secure context, so `Secure` cookies are returned ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.3))
  - not used: searched `document.cookie`, `CookieJar`, `cookieJar`: empty.
- **behavior change**: `<input pattern="">` now compiles with the `v` RegExp flag instead of `u` ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.3))
  - not used: searched `pattern=` / `pattern:` in `apps/desktop/src/renderer`, `packages/shared-ui/src`: empty.
- **behavior change**: CSS system colors and `initial`/`inherit`/`unset` resolve correctly; `background`, gradient color and `display` resolution fixed ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0-beta.3))
  - not used: no computed-style assertions in tests (see beta.1).

## jsdom 27.0.0

Covers everything from 26.1.0 through the betas above, plus a `cssstyle` upgrade ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0)).

- **requirement**: Node.js v20 minimum ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0))
  - not used: Node 22.22.3 in use (see 30.0.0).
- **breaking / behavior changes**: same items as 27.0.0-beta.0–beta.3 (selector engine, event constructors, `click()` → `PointerEvent`, passive events, virtual console rename, `tough-cookie`, HTML-Standard UA stylesheet, `pattern` `v` flag, Window conformance) ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0))
  - not used: see the verdicts under each beta.
- **behavior change**: `jsdom.reconfigure({ url })` now updates `document.baseURI` again ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.0))
  - not used: searched `reconfigure(`: empty.

## jsdom 27.0.1

- **requirement**: Node.js minimum quietly raised to v20.19.0+ / v22.12.0+ / v24.0.0+ (a dependency now needs `require(esm)`; older Node fails with `ERR_REQUIRE_ESM`) ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.1))
  - not used: Node 22.22.3 meets this.
- **behavior change**: selector regression fixes (`class=""` attribute changes) ([source](https://github.com/jsdom/jsdom/releases/tag/v27.0.1))
  - not used: fixes only, and no test depends on the old behavior.

## jsdom 27.1.0

- **behavior change**: CSS parsing moved to `@acemir/cssom` (nested selectors, layer statements, stricter at-rule validation); selector cache invalidation fixes ([source](https://github.com/jsdom/jsdom/releases/tag/v27.1.0))
  - not used: tests load no stylesheets (Vitest's default `css` handling turns CSS imports into empty modules), and nothing uses `document.styleSheets` or `insertRule` (searched both: empty).
- **requirement**: `package.json` `engines` now declares the 27.0.1 Node floor ([source](https://github.com/jsdom/jsdom/releases/tag/v27.1.0))
  - not used: the repo has no `engine-strict` (no `.npmrc`), and Node 22.22.3 satisfies it anyway.

## jsdom 27.2.0

- **behavior change**: new CSSOM rule classes on `Window`; `@import`-ed sheets exposed separately in CSSOM ([source](https://github.com/jsdom/jsdom/releases/tag/v27.2.0))
  - not used: searched `CSSGroupingRule`, `@import`, `styleSheets`: empty in test-reachable code.

## jsdom 27.3.0

Nothing in scope: `@acemir/cssom` parsing improvements only, and tests load no stylesheets. ([source](https://github.com/jsdom/jsdom/releases/tag/v27.3.0))

## jsdom 27.4.0

- **behavior change**: jsdom now provides its own `TextEncoder`/`TextDecoder`. Vitest previously injected Node's, and now uses jsdom's because it only injects when the window lacks them ([source](https://github.com/jsdom/jsdom/releases/tag/v27.4.0))
  - not used: searched `TextEncoder`, `TextDecoder` in `apps/desktop/src/renderer`, `packages/shared-ui/src`, `packages/shared/src`: empty.
- **behavior change**: HTML/XML byte decoding rewritten on `@exodus/bytes` ([source](https://github.com/jsdom/jsdom/releases/tag/v27.4.0))
  - not used: tests build DOM through React only. Nothing parses HTML bytes (searched `new JSDOM`, `DOMParser`: empty).

## jsdom 28.0.0

- **breaking**: resource-loading customization overhauled. The `ResourceLoader` class was removed in favor of `resources: { … }` options and `requestInterceptor()` ([source](https://github.com/jsdom/jsdom/releases/tag/v28.0.0), [README](https://github.com/jsdom/jsdom/blob/2b65c6a80af2c899e32933c5e0cb842164852149/README.md#loading-subresources))
  - not used: searched `ResourceLoader`, `resources:`, `userAgent` in `apps/desktop/vitest.config.ts` and repo code: empty. Vitest 3.2.4 calls `new ResourceLoader()` only when `environmentOptions.jsdom.userAgent` is set, and it isn't.
- **behavior change**: `WebSocket`s no longer throttled to one connection per origin (undici bug) ([source](https://github.com/jsdom/jsdom/releases/tag/v28.0.0))
  - not used: `snapshot-stream.test.tsx:66` stubs `WebSocket` with `FakeWebSocket`, so no real jsdom WebSocket is opened.
- **behavior change**: `<iframe>`/`<img>` fire `load` (not `error`) on non-OK HTTP; referrer and `ArrayBuffer` snapshotting fixes; `XMLHttpRequest` fixes ([source](https://github.com/jsdom/jsdom/releases/tag/v28.0.0))
  - not used: jsdom fetches no subresources by default (`resources` unset), and nothing uses `XMLHttpRequest` (searched: empty). The `<img src="/avatars/racer-1.jpg">` in `registration-wizard-after-signup.test.tsx:135` is never fetched.

## jsdom 28.1.0

- **behavior change**: `getComputedStyle()` accounts for specificity and `!important` ([source](https://github.com/jsdom/jsdom/releases/tag/v28.1.0))
  - not used: no stylesheets in tests, and no computed-style assertions.
- **behavior change**: `document.getElementById()` returns the first element in tree order on duplicate IDs ([source](https://github.com/jsdom/jsdom/releases/tag/v28.1.0))
  - not used: tests query by role/label/text. No duplicate-ID lookups (searched `getElementById` in `*.test.ts*`: empty).
- **behavior change**: `FileReader` event timing and `result` state follow the spec; `blob.text()`/`arrayBuffer()`/`bytes()` added ([source](https://github.com/jsdom/jsdom/releases/tag/v28.1.0))
  - not used: searched `FileReader`, `.arrayBuffer()`, `.bytes()`: empty in renderer. The photo test (`registration-wizard-after-signup.test.tsx:127`) passes a `File` to a mocked `onAvatarUpload` without reading it. `api.ts:144` `response.text()` is on a Fetch `Response`, not a jsdom `Blob`.
- **behavior change**: `<svg>` elements no longer proxy event handlers to `Window` ([source](https://github.com/jsdom/jsdom/releases/tag/v28.1.0))
  - not used: searched `<svg[^>]*on[A-Z]` in renderer: no SVG event handler props.

## jsdom 29.0.0

- **requirement**: Node.js v22.13.0+ minimum on the v22 line ([source](https://github.com/jsdom/jsdom/releases/tag/v29.0.0))
  - not used: Node 22.22.3 meets this.
- **behavior change**: CSSOM rewritten in-house (drops `cssstyle` and `@acemir/cssom`, uses `css-tree`); stricter parsing and serialization, invalid media queries become `"not all"`, `selectorText` validation ([source](https://github.com/jsdom/jsdom/releases/tag/v29.0.0))
  - not used: the only inline style written in a test path is a custom property (`apps/desktop/src/renderer/lib/use-height-css-variable.ts:24`, read back at `use-height-css-variable.test.tsx:37`), which the probe verified round-trips as `"112px"`. `packages/shared-ui/src/theme.ts:28-39` `setProperty("--theme-*")` is also custom properties. No test asserts other inline styles.
- **behavior change**: bad-port blocking per the Fetch spec ([source](https://github.com/jsdom/jsdom/releases/tag/v29.0.0))
  - not used: jsdom makes no network requests in tests. `fetch` is stubbed (`api.test.ts:74`), and Vitest's default URL `http://localhost:3000` uses an allowed port.
- **behavior change**: `XMLHttpRequest.response` returns `null` during `LOADING` for JSON ([source](https://github.com/jsdom/jsdom/releases/tag/v29.0.0))
  - not used: searched `XMLHttpRequest`: empty.

## jsdom 29.0.1

- **behavior change**: `border`/`background` shorthand parsing fixes; `getComputedStyle()` returns a fuller `CSSStyleDeclaration` again ([source](https://github.com/jsdom/jsdom/releases/tag/v29.0.1))
  - not used: no shorthand or computed-style assertions in tests.

## jsdom 29.0.2

- **behavior change**: `getComputedStyle()` applies computed-value rules across more properties (inheritance, defaulting keywords, custom properties, `currentcolor`, system colors) ([source](https://github.com/jsdom/jsdom/releases/tag/v29.0.2))
  - not used: `getComputedStyle` is reached only from `use-rows-that-fit.ts:70` (skipped in tests because jsdom has no `ResizeObserver` and `projector-idle-stage.test.tsx` doesn't stub it), and from `race-graphics.tsx:120,375` / `use-masonry-grid.ts:21`, which no test renders.

## jsdom 29.1.0

Nothing in scope: adds the ratio CSS type and fixes stale `getComputedStyle()` results. ([source](https://github.com/jsdom/jsdom/releases/tag/v29.1.0))

## jsdom 29.1.1

Nothing in scope: computed `border-radius` serialization, `background-origin`/`clip` fixes, faster first `getComputedStyle()`. ([source](https://github.com/jsdom/jsdom/releases/tag/v29.1.1))

## jsdom 30.0.0

- **requirement / breaking**: Node.js minimum raised to `^22.22.2 || ^24.15.0 || >=26.0.0` ([source](https://github.com/jsdom/jsdom/releases/tag/v30.0.0))
  - not used: the dev machine runs Node 22.22.3. The repo pins no Node version (no `.nvmrc`/`.node-version`/`engines`; searched). CI (`.github/workflows/release.yml:63` `node-version: "22"`) resolves to the latest 22.x and runs no tests. Anyone running `pnpm test` on Node 22 below 22.22.2 needs to upgrade Node.
- **behavior change**: `getComputedStyle()` converts lengths to pixels; CSS function serialization changed in `getPropertyValue()`; `CSS.escape()`/`CSS.supports()` added ([source](https://github.com/jsdom/jsdom/releases/tag/v30.0.0))
  - not used: searched `CSS.supports`, `CSS.escape`: empty. `race-graphics.tsx:120` reads `fontSize` (still `"16px"` in the probe), but no test renders it.

## jsdom 30.0.1

Nothing in scope: fixes a `getComputedStyle()` crash with `calc()` and speeds up ranges. ([source](https://github.com/jsdom/jsdom/releases/tag/v30.0.1))

## jsdom 30.1.0

- **behavior change**: `window.close()` keeps the document and its DOM reachable through retained references, and destroyed documents stop queued events, timers, animation frames and loads ([source](https://github.com/jsdom/jsdom/releases/tag/v30.1.0))
  - not used: searched `window.close`: empty in repo code. Vitest's teardown calls it after each file, so stray rAF loops (`use-lane-glow.ts`, `use-speed-streaks.ts`, `use-lead-change-flash.ts`) now stop cleanly instead of firing.
- **behavior change**: named access on `document` (`document.<name>` for `<form name>`, etc.) ([source](https://github.com/jsdom/jsdom/releases/tag/v30.1.0))
  - not used: searched `<form[^>]*name=`, `document\.[a-z]+Form`: empty.
- **behavior change**: storage quota errors now throw `QuotaExceededError` ([source](https://github.com/jsdom/jsdom/releases/tag/v30.1.0))
  - not used: searched `QuotaExceeded`: empty. `localStorage` use in tests (`api.test.ts:52-63`, `registration-wizard*.test.tsx`) stores tiny values.
- **behavior change**: DOM APIs reject user-created proxies around DOM objects; wrapper impls moved from a `Symbol(impl)` property to a private field ([source](https://github.com/jsdom/jsdom/releases/tag/v30.1.0), [vitest#11336](https://github.com/vitest-dev/vitest/issues/11336))
  - not used: searched `new Proxy(` in renderer/tests: empty. Vitest 3.2.4 doesn't read `Symbol(impl)` (no `makeCompatBlob`); that breakage only hits Vitest 4/5 via `URL.createObjectURL`/`FormData` `Blob` bodies.
- **behavior change**: `<select>` selection, `selectedOptions`, radio grouping and focus-after-removal fixes; `volumechange`/`ratechange` fire asynchronously ([source](https://github.com/jsdom/jsdom/releases/tag/v30.1.0))
  - not used: `selectedOptions` only in `settings-tab.tsx:456`, which no test renders. No radio or media tests (searched `type="radio"`, `volumechange` in `*.test.ts*`: empty).

## jsdom 30.1.1

- **behavior change**: `element.focus()` no longer focuses disabled form controls or `<input type="hidden" tabindex="">`; focus/blur event and `relatedTarget` fixes ([source](https://github.com/jsdom/jsdom/releases/tag/v30.1.1))
  - not used: no test asserts focus (searched `toHaveFocus`, `activeElement`: empty). `fireEvent.focus`/`fireEvent.blur` (`challenge-modal.test.tsx:28,49,73`, `registration-wizard.test.tsx:61`) dispatch events directly and don't depend on focusability.
- **behavior change**: invalid `style.setProperty()` no longer changes `!important` priority; `!important` longhand/shorthand handling fixed ([source](https://github.com/jsdom/jsdom/releases/tag/v30.1.1))
  - not used: searched `important` in renderer/shared-ui `setProperty` calls: none pass a priority.

## jsdom 30.1.2

- **behavior change**: `element.focus()` no longer focuses elements hidden by `display` (including inside a closed `<dialog>`) ([source](https://github.com/jsdom/jsdom/releases/tag/v30.1.2))
  - not used: `packages/shared-ui/src/ui.tsx:471` `<Button autoFocus>` mounts inside a `<dialog>` before the `setup.ts` `showModal` polyfill sets `open`, so React's autofocus is now a no-op in tests (the probe confirmed `focus()` inside a closed dialog leaves `document.activeElement === body`). No test asserts focus (searched `toHaveFocus`, `activeElement`: empty), so nothing breaks.
- **behavior change**: `getComputedStyle()` staleness fixes for stylesheet edits, form-state pseudo-classes and `:focus*`; it no longer throws for XML/MathML elements; CSS custom-property inheritance fix; negative sizing value fix ([source](https://github.com/jsdom/jsdom/releases/tag/v30.1.2))
  - not used: no computed-style assertions in tests. These are regression fixes only.
- **behavior change**: IDN URLs support Unicode 18 ([source](https://github.com/jsdom/jsdom/releases/tag/v30.1.2))
  - not used: `api.test.ts:38-44` URLs are ASCII (`roller-rumble.birdsnest.family`).

Unchanged and still needed: jsdom 30.1.2 still does not implement `HTMLDialogElement#showModal`/`close` (`lib/jsdom/living/nodes/HTMLDialogElement.webidl` at `v30.1.2` has them commented out; the probe saw `showModal === undefined`), so keep the polyfill in `apps/desktop/src/renderer/test/setup.ts:4-13`. `ResizeObserver` and `matchMedia` are still not provided, so the existing test stubs remain correct.
