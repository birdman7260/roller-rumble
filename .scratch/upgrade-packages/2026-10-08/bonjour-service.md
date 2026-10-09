# bonjour-service

| Package         | Installed | Target |
| --------------- | --------- | ------ |
| bonjour-service | 1.4.1     | 1.4.4  |

Repo usage (searched `bonjour` across `apps/`, `packages/`, `tools/`, root configs; excluding `node_modules`/`dist`): only `apps/desktop/src/backend/adapters/trigger-os2l.ts` (`import { Bonjour, type Service } from "bonjour-service"` at :2, `Bonjour | null` / `Service | null` field types at :214-215, `new Bonjour(undefined, errorCb)` at :323, `.publish({...})` at :326, `.stop()` / `.destroy()` at :346-347) plus the dep entry in `apps/desktop/package.json:51`. No tests mock the module. The prod build (`tsup`, ESM, deps external) keeps a native Node ESM named import: `dist/electron/main.js:2822` `import { Bonjour } from "bonjour-service";`, so the CJS export shape matters at runtime.

Runtime deps (`fast-deep-equal ^3.1.3`, `multicast-dns ^7.2.5`) and `engines` (none) are unchanged across 1.4.1...1.4.4. The `package.json` diff touches only `resolutions` (js-yaml) and `packageManager` (yarn 4.17.0), both dev-only. ([compare](https://github.com/onlxltd/bonjour-service/compare/1.4.1...1.4.4))

## bonjour-service 1.4.2

Nothing in scope. Only dependabot bumps to dev/transitive tooling: tar 7.5.16 (#81), undici 6.27.0 (#82), js-yaml 4.2.0 (#83). No changes to `src/`. ([source](https://github.com/onlxltd/bonjour-service/releases/tag/1.4.2))

## bonjour-service 1.4.3

- **behavior change**: the entry module `src/index.ts` was rewritten to fix ESM named imports that broke in 1.4.0 (issue #79: `cjs-module-lexer` didn't see the class-property exports). It now compiles to `export = Bonjour`, where `Bonjour` is a class merged with a namespace that carries `Bonjour`, `Service`, `Browser` and `default`. `module.exports` is now the `Bonjour` class itself, with those properties, instead of `Object.assign(Bonjour, {...})` over `exports.*`. The typings changed in the same way: the named ES exports became an `export =` namespace. In 1.4.3 the namespace exposed `Service`/`Browser` only as **values** (`export const`), so `type Service` couldn't be used as a type until 1.4.4 fixed it. Don't stop at 1.4.3. ([source](https://github.com/onlxltd/bonjour-service/releases/tag/1.4.3), [issue #79](https://github.com/onlxltd/bonjour-service/issues/79), [diff](https://github.com/onlxltd/bonjour-service/compare/1.4.2...1.4.3))
  - not used / no change needed: the only consumer is `apps/desktop/src/backend/adapters/trigger-os2l.ts:2`, which uses named imports. I verified against the published 1.4.4 tarball. In Node ESM, `import("bonjour-service")` gives the keys `Bonjour, Browser, Service, default`, with `Bonjour`/`Service` as functions and `default === Bonjour`; `new Bonjour(undefined, cb)` → `.publish`/`.destroy` work. So the bundled `import { Bonjour } from "bonjour-service"` in `dist/electron/main.js` still resolves. The repo uses `esModuleInterop`/`allowSyntheticDefaultImports` (`tsconfig.base.json:7-8`), which the `export =` typings need for named imports. Searched for `bonjour-service` default imports (`import Bonjour from`, `require("bonjour-service")`) and found none.

## bonjour-service 1.4.4

- **behavior change** (types): `Bonjour`, `Service` and `Browser` are re-exported through `export import X = ...` inside the namespace, so each is again usable as both a value and a type. The `ServiceReferer`/`ServiceConfig`/`BrowserConfig` types are re-exported the same way. Runtime JS is the same as 1.4.3. ([source](https://github.com/onlxltd/bonjour-service/releases/tag/1.4.4), [PR #84](https://github.com/onlxltd/bonjour-service/pull/84), [diff](https://github.com/onlxltd/bonjour-service/compare/1.4.3...1.4.4))
  - not used / no change needed: `trigger-os2l.ts:2,214-215` use `type Service` and `Bonjour` as types. I typechecked an exact reproduction of the adapter's usage (named import, `Bonjour | null`, `Service | null`, `new Bonjour(undefined, (error: Error) => …)`, `publish({ name, type, protocol, port, txt })`, `stop()`, `destroy()`) against the 1.4.4 typings with the repo's compiler settings (`module: ESNext`, `moduleResolution: Bundler`, `esModuleInterop`, `isolatedModules`, `strict`; tsc 5.9.3). It passed with 0 errors.
- Also in this release: dependabot bumps to tar 7.5.22 (#85) and js-yaml 4.3.0 (#86), which are dev/tooling only, and `.npmignore` now excludes `.yarn/*`, which only affects packaging. Nothing in scope.
