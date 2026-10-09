# prettier

| Package  | Installed | Target |
| -------- | --------- | ------ |
| prettier | 3.8.3     | 3.9.9  |

**Config check.** `prettier.config.mjs` uses `semi`, `singleQuote`, `trailingComma`, `printWidth`, `arrowParens`. None of these options was removed, renamed or re-defaulted anywhere from 3.8.4 to 3.9.9. `.prettierignore` patterns are unaffected. There's no `.editorconfig`, no plugins, and no `--cache` flag in the scripts. `engines.node` is still `>=14` and there are no peer deps.

**Verified reformat set.** I installed prettier@3.9.9 in a scratch dir and ran `prettier --list-different .` from the repo root with the repo config. Then I diffed each file with `--stdin-filepath`. Compared with the 3.8.3 baseline, 3.9.9 reformats exactly 7 tracked files, all listed as **affected** below. After the version bump, `pnpm format` produces exactly these changes and no hand edits are needed. Commit them with the bump, or `pnpm quality` fails.

The baseline (3.8.3) already flags `.scratch/upgrade-packages/2026-10-08/{adm-zip,nanoid,plan,ws}.md`. That's untracked scratch output and not caused by this upgrade. `pnpm format` will rewrite those files too, which is harmless.

## prettier 3.8.4

- **behavior change**: Markdown keeps blank lines between list items and nested sub-lists, so loose lists stay loose ([source](https://github.com/prettier/prettier/blob/3.9.9/CHANGELOG.md#384))
  - not used: the 3.9.9 run over all 57 tracked `*.md` files showed no list-related diff

## prettier 3.8.5

- **behavior change**: Flow accepts `readonly` as a variance annotation ([source](https://github.com/prettier/prettier/blob/3.9.9/CHANGELOG.md#385))
  - not used: no Flow files (`git ls-files '*.js.flow'` returned nothing, and there are no `@flow` sources)

## prettier 3.9.0

Release notes are the blog post ([source](https://prettier.io/blog/2026/06/27/3.9.0), repo copy `website/blog/2026-06-27-3.9.0.md` at tag 3.9.9).

- [ ] **behavior change**: TypeScript "Don't break union type when it can fit" (#18827). A union alias that fits on one indented line is no longer exploded into a leading-`|` list ([source](https://prettier.io/blog/2026/06/27/3.9.0#change-18827-2))
  - affected: `apps/desktop/src/renderer/lib/projector-idle-view.ts:9` — `ProjectorIdleView` collapses to `  "signup-prompt" | "queue-and-top-racers" | "signup-and-top-racers" | "queue-and-signup";` on the line after `=`. Apply with `pnpm format`.
  - affected: `packages/shared/src/managed-settings.ts:10` — `SubsystemId` collapses to `  "tunnel" | "stripe" | "webPush" | "network" | "os2l" | "photoBooth" | "sensor";`. Apply with `pnpm format`.
  - affected: `tools/photo-booth-agent/src/state.ts:3` — `BoothFlowState` collapses to `  "idle" | "token-scanned" | "photo-mode" | "capturing" | "reviewing" | "syncing" | "error";`. Apply with `pnpm format`.
  - affected: `tools/photo-booth-agent/src/kiosk/components/hardware-status.tsx:39` — the `as | HardwareComponentHealth | undefined` cast collapses to `as\n            HardwareComponentHealth | undefined;`. Apply with `pnpm format`.
- [ ] **behavior change**: TypeScript "Fix inconsistent formatting of arrow function" (#18589). A sole arrow-function argument with a return-type annotation now hugs the call (`map((x): T => ...)`) instead of breaking onto its own indented line ([source](https://prettier.io/blog/2026/06/27/3.9.0#change-18589))
  - affected: `apps/desktop/src/backend/services/competition.ts:196`, `:239`, `:396`, `:420` — `.map(\n (candidate|node): BracketNode =>` becomes `.map((candidate|node): BracketNode =>` and the body dedents one level. At `:420` the `state:` ternary also re-joins onto one line. Apply with `pnpm format`.
- [ ] **behavior change**: HTML "Fix closing tag of pre-like elements being split across lines" (#19046). `</pre\n  >` is now printed as `</pre>` ([source](https://prettier.io/blog/2026/06/27/3.9.0#change-19046))
  - affected: `docs/architecture-review-2026-06-23.html:124`, `:528`, `:546`, `:625`, `:644` — each `</pre\n              >` becomes `</pre>`. Apply with `pnpm format`.
- [ ] **behavior change**: Markdown parser upgraded from remark-parse v8 to micromark v4 (#18277), which brings better CommonMark/GFM compliance. A GFM table directly under a paragraph line, with no blank line between them, is now recognized as a table. It gets blank-line separation and aligned columns ([source](https://prettier.io/blog/2026/06/27/3.9.0#change-18277))
  - affected: `docs/opensprints-protocol.md:29-50` — a blank line is inserted after `**Host → device**` (line 29) and after `**Device → host**` (line 40), and both tables get padded, aligned columns. Rendered content is unchanged because GitHub already treated these as tables. Apply with `pnpm format`.
- **breaking**: support dropped for the legacy import-assertions syntax `import x from "y" assert { type: "json" }`, so it no longer parses. Use `with { ... }` instead ([source](https://prettier.io/blog/2026/06/27/3.9.0#change-18611))
  - not used: `git grep -nE "assert \{"` over the repo returned nothing
- **behavior change**: `json-stringify` parser (used for `package.json` and similar) preserves the original number and string representation, such as `"ÿ"` and `1e3` ([source](https://prettier.io/blog/2026/06/27/3.9.0#change-18405))
  - not used: the 3.9.9 run produced no diff in any `*.json` / `package.json`
- **behavior change**: TypeScript `quoteProps` is now respected for enum keys and method signatures (#18700, #18702) ([source](https://prettier.io/blog/2026/06/27/3.9.0#change-18700))
  - not used: `quoteProps` isn't set (the default `as-needed` applies), and the 3.9.9 run produced no diff for it
- **behavior change**: CLI treats a `.git` _file_ (worktree or submodule) as the project root when it looks for EditorConfig (#18891) ([source](https://prettier.io/blog/2026/06/27/3.9.0#change-18891))
  - not used: the repo has no `.editorconfig` (`ls .editorconfig` found no such file)
- **behavior change**: CLI `--cache-strategy content` now actually compares content (#18914) ([source](https://prettier.io/blog/2026/06/27/3.9.0#change-18914))
  - not used: the scripts in `package.json` don't pass `--cache` or `--cache-strategy`
- **behavior change**: Miscellaneous: the `Printer.print` plugin interface signature changed (#19014) ([source](https://prettier.io/blog/2026/06/27/3.9.0#change-19014))
  - not used: there are no custom prettier plugins, and `git grep -i prettier` shows only the config, the scripts and `eslint-config-prettier`
- **behavior change**: YAML parser upgraded to `yaml` v2 (#18419), plus YAML mapping, block-scalar and blank-line fixes ([source](https://prettier.io/blog/2026/06/27/3.9.0#change-18419))
  - not used: there's no diff in `.github/workflows/release.yml` or `pnpm-workspace.yaml`. `pnpm-lock.yaml` is ignored.
- **behavior change**: all remaining 3.9.0 formatting changes: JS comment placement, `no-semi` mode, return-statement parentheses, logical-not printing, JSX attribute blank lines, member chains, non-null assertions, mapped types, CSS/SCSS, Markdown setext/CJK/emphasis, GraphQL, Angular and Flow ([source](https://prettier.io/blog/2026/06/27/3.9.0))
  - not used: the full-repo `prettier@3.9.9 --list-different .` showed no diffs beyond the affected files above. The repo has no `.less`, `.scss`, `.graphql`, `.mdx` or Flow files and uses `semi: true`.
- **requirement**: none changed. `engines.node` is `>=14` for both 3.8.3 and 3.9.9 (`npm view prettier@3.9.9 engines`). The release notes recommend pinning an exact version (`"prettier": "3.9.9"` rather than `^`). That's optional, and the root `package.json:57` currently uses `^3.8.3` ([source](https://prettier.io/blog/2026/06/27/3.9.0))

## prettier 3.9.1

- **behavior change**: CLI no longer caches ignored files incorrectly (#19483) ([source](https://github.com/prettier/prettier/releases/tag/3.9.1))
  - not used: the scripts don't pass `--cache`

## prettier 3.9.2

Nothing in scope. The version was published to npm 9 minutes before 3.9.3 but has no GitHub release and no CHANGELOG entry. 3.9.3's diff link compares `3.9.1...3.9.3`, so 3.9.2 was superseded. ([source](https://github.com/prettier/prettier/blob/3.9.9/CHANGELOG.md#393))

## prettier 3.9.3

- **behavior change**: Markdown no longer drops characters in multi-line Liquid `{{ ... }}` (#19489) ([source](https://github.com/prettier/prettier/releases/tag/3.9.3))
  - not used: `git grep -lE "\{\{|\{%" -- '*.md'` returned nothing
- **behavior change**: TypeScript allows decorators on `declare` class fields (#19492) ([source](https://github.com/prettier/prettier/releases/tag/3.9.3))
  - not used: `git grep -nE "@\w+ declare "` in `apps packages tools` returned nothing

## prettier 3.9.4

- **behavior change**: Angular `@content(name)` is now printed as `@content (name)` (#19499) ([source](https://github.com/prettier/prettier/releases/tag/3.9.4))
  - not used: there are no Angular templates (the repo uses React)

## prettier 3.9.5

- **behavior change**: Markdown ordered-list numbers are capped at 999,999,999. Empty links with a title keep `<>`, and wiki links with aliases are preserved ([source](https://github.com/prettier/prettier/blob/3.9.9/CHANGELOG.md#395))
  - not used: `git grep -nE "\]\(<>"` and `git grep -nE "\[\[[^]]+\]\]"` over `*.md` returned nothing, and the 3.9.9 run showed no list diff
- **behavior change**: CSS no longer adds a space in `type(<x>+)` (#19516) ([source](https://github.com/prettier/prettier/blob/3.9.9/CHANGELOG.md#395))
  - not used: `git grep -nE "type\([^)]*\+\)"` returned nothing
- **behavior change**: Less map-lookup, merge-marker and adjacent-comment fixes (#19503, #19517, #19574) ([source](https://github.com/prettier/prettier/blob/3.9.9/CHANGELOG.md#395))
  - not used: `git ls-files '*.less'` returned nothing
- **behavior change**: TypeScript keeps comments on `type` import/export specifiers, ignores comments in mapped types when checking type parameters, and prints a comment-only object type as `{/* c */}` (#19565, #19572, #19583) ([source](https://github.com/prettier/prettier/blob/3.9.9/CHANGELOG.md#395))
  - not used: `git grep -nE "type /\*"` returned nothing, and the 3.9.9 run produced no such diff
- **behavior change**: JavaScript dangling comments inside an empty `switch` body stay in the body (#19581) ([source](https://github.com/prettier/prettier/blob/3.9.9/CHANGELOG.md#395))
  - not used: the 3.9.9 run produced no such diff
- **behavior change**: Miscellaneous: `comment.placement` is restored for plugins, and Flow/Angular fixes (#19567, #19568, #19571) ([source](https://github.com/prettier/prettier/blob/3.9.9/CHANGELOG.md#395))
  - not used: there are no plugins, Flow files or Angular templates

## prettier 3.9.6

- **behavior change**: TypeScript keeps the quotes on methods named `"new"` and supports `import defer` (#19621, #19624) ([source](https://github.com/prettier/prettier/releases/tag/3.9.6))
  - not used: `git grep -nE "import defer|\"new\"\("` returned nothing
- **behavior change**: new optional official plugin `@prettier/plugin-yuku` ([source](https://github.com/prettier/prettier/releases/tag/3.9.6))
  - not used: it's opt-in and no plugin is configured

## prettier 3.9.7

- **behavior change**: fixes 3.9 regressions in Markdown: list-item code-block and HTML-block indentation drift, Liquid after tables, single tildes (`H~2~O` was rewritten to `~~`), blockquotes containing `>`, and setext headings in blockquotes (#19647, #19730, #19739, #19802, #19878, #19987) ([source](https://github.com/prettier/prettier/blob/3.9.9/CHANGELOG.md#397))
  - not used: the single-tilde search `git grep -nE "(^|[^~])~[^~ ]+~([^~]|$)" -- '*.md'` returned nothing, and the 3.9.9 run showed no Markdown diff other than `docs/opensprints-protocol.md` (see 3.9.0)
- **behavior change**: JavaScript embedded template-literal idempotency fix (#19725) and Angular `@boundary` support (#20014) ([source](https://github.com/prettier/prettier/blob/3.9.9/CHANGELOG.md#397))
  - not used: there are no `html`/`css` tagged templates with diffs in the 3.9.9 run, and no Angular templates

## prettier 3.9.8

- **behavior change**: Markdown no longer lets Liquid objects `{{...}}` interrupt paragraphs (#20087) ([source](https://github.com/prettier/prettier/releases/tag/3.9.8))
  - not used: `git grep -lE "\{\{|\{%" -- '*.md'` returned nothing

## prettier 3.9.9

- **behavior change**: Markdown no longer parses text containing `$` as math syntax (#20140) ([source](https://github.com/prettier/prettier/releases/tag/3.9.9))
  - not used: the 3.9.9 run over all `*.md` showed no `$`-related diff
