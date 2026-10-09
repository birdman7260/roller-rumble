# drizzle

| Package     | Installed | Target  |
| ----------- | --------- | ------- |
| drizzle-orm | 0.45.2    | 0.45.4  |
| drizzle-kit | 0.31.10   | 0.31.11 |

Repo usage context: drizzle-orm is imported only in `apps/desktop/src/backend/db/Database.ts:4-5` (`drizzle-orm`, `drizzle-orm/better-sqlite3`) and `apps/desktop/src/backend/db/schema.ts`. drizzle-kit is used only for `defineConfig` (`apps/desktop/drizzle.config.ts:3`, `dialect: "sqlite"`) and `drizzle-kit studio` (`tools/db-studio/package.json:6`, `scripts/run-db-studio.mjs:43`). Migrations are the app's own plain-SQL runner (`apps/desktop/src/backend/db/migrations.ts`), not drizzle-kit's `_journal.json` format.

Note for the fixer: `tools/db-studio` is a separate install (`--ignore-workspace`, `--frozen-lockfile` in `scripts/run-db-studio.mjs`); bump `tools/db-studio/package.json:10` (`"drizzle-kit": "^0.31.10"`) and regenerate `tools/db-studio/pnpm-lock.yaml` (currently pins `drizzle-kit@0.31.10` at lines 508, 919) alongside `apps/desktop/package.json:91`.

## drizzle-orm 0.45.3

- **requirement** — New `drizzle-orm/netlify-db` driver; adds `@netlify/db >=0.4.0` as an **optional** peer dependency (`peerDependenciesMeta.optional: true`, per `npm view drizzle-orm@0.45.3 peerDependencies`). No other peer/engine/dependency changes vs 0.45.2. ([source](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.3))
  - not used: searched `netlify`, `drizzle-orm/netlify-db`, `@netlify/db` across `apps/`, `packages/`, `tools/`, `scripts/`, `package.json` — no hits. Optional peer, so no install needed.

## drizzle-orm 0.45.4

- **behavior change** — `postgres-js` driver now actually uses prepared queries when `.prepare(name)` is called explicitly. ([source](https://github.com/drizzle-team/drizzle-orm/releases/tag/0.45.4))
  - not used: searched `drizzle-orm/postgres-js`, `drizzle-orm/pg-core`, `from "postgres"`, `postgres-js` — no hits. The `.prepare(` hits in `apps/desktop/src/backend/db/Database.ts` and `migrations.ts` are raw better-sqlite3 `Database#prepare` on SQLite, not the drizzle postgres-js query builder.

## drizzle-kit 0.31.11

- **behavior change** — `drizzle-kit check` now prints a warning (exit code unchanged, no DB connection) when a `_journal.json` entry's `when` timestamp is ≤ an earlier entry's, since the migrator would silently skip it. Only `drizzle-kit/src/cli/commands/check.ts` changed in kit source between the two tags. ([source](https://github.com/drizzle-team/drizzle-orm/releases/tag/drizzle-kit%400.31.11), [PR #6301](https://github.com/drizzle-team/drizzle-orm/pull/6301))
  - not used: searched `drizzle-kit check`, `drizzle-kit generate|migrate|push`, `"check"` scripts, `_journal.json`, `meta/*snapshot` — no hits. Repo runs only `drizzle-kit studio` and uses its own SQL migration runner; the configured `out` dir (`apps/desktop/src/backend/db/drizzle`) does not exist.
