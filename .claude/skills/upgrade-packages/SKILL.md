---
name: upgrade-packages
description: Upgrade npm packages in lockstep groups, reading every release note between the installed and target version and fixing the code to match.
disable-model-invocation: true
argument-hint: "[scope: package names, 'patch/minor only', or blank for everything outdated]"
---

Upgrade this repo's packages one **lockstep group** at a time. A lockstep group is a set of packages that have to move together, because upgrading one without the others breaks the install, the types or the runtime. Each group gets its own **digest** of release notes, written by a subagent from primary sources. That digest is the checklist the code gets fixed against.

Everything for a run goes in `.scratch/upgrade-packages/<YYYY-MM-DD>/`: `plan.md` plus one `<group>.md` digest per group. If a `plan.md` with unchecked groups already exists there, resume at step 5 and work the first unchecked group.

## 1. Inventory

List every outdated dependency in the scope the user gave. With no scope, that's everything outdated.

- Workspace: `pnpm outdated -r --format json`.
- Each `tools/*` directory that has a `package.json`: `pnpm --ignore-workspace --dir tools/<name> outdated --format json`. These have their own installs (see CLAUDE.md), so `-r` never reaches them.

For each package, record the **installed** version (the "current" column, which comes from the lockfile, not the floor of the range), the target version (latest unless the scope says otherwise), every manifest that lists it, and whether the jump crosses a major version.

Write the base commit (`git rev-parse HEAD`) at the top of `plan.md`.

**Done when** every outdated package in scope is a row with its installed version, target version and manifests.

## 2. Group

Put every package into exactly one lockstep group. Two packages share a group when any of these hold:

- **Release train:** they are published from the same repository on a shared version line (`npm view <pkg> repository.url`). Examples: `@tanstack/react-router` + `@tanstack/router-plugin`, and `vitest` + `@vitest/*`.
- **Peer constraint:** the target version's `peerDependencies` (`npm view <pkg>@<target> peerDependencies --json`) rule out the other package's installed version. The same applies to engine fields that rule out the other package's version.
- **Types:** `@types/<x>` goes with `<x>`.
- **Host and plugin:** a tool and the plugins that load into it (vite and its plugins, eslint and its plugins and configs, typescript and `typescript-eslint`), including plugins that declare no peers.
- **Native ABI:** `electron`, `@electron/rebuild`, and every native module rebuilt against Electron (the `rebuild:native` script in `apps/desktop/package.json` lists them). A native module's target has to ship for the target Electron ABI.

Repo couplings no manifest declares:

- `@types/node` goes with `electron`. Its major tracks the Node version that Electron bundles, which may differ from the Node used for development.
- `tools/photo-booth-agent` compiles `packages/shared` and `packages/shared-ui` through `file:` links, so its `react` family moves with the workspace `react` group. Every other `tools/` package installs and builds for Node on its own, so its copies (such as `better-sqlite3` in `tools/db-studio`) form separate groups.

A package with no coupling is a group of one. Between groups, record a **blocking edge** wherever one group's target needs another group's new version, so the blocked group applies after its blocker.

**Done when** every row from step 1 sits in exactly one group, and every target's `peerDependencies` have been checked with `npm view` against the versions the plan will produce. Check these with the command, not from memory.

## 3. Research

For each group, start a background `release-notes-researcher` subagent. Choose its model at dispatch, honoring any model choice the user supplied:

- **Default:** use the model configured in `.claude/agents/release-notes-researcher.md`.
- **Complex migration:** pass `model: sonnet` when the group crosses a major version or changes the Node/Electron runtime, native ABI, or ESM/CJS module format.

Pass it the group name, every package with its installed → target versions, and the digest path. The agent reads [RELEASE-NOTES-BRIEF.md](RELEASE-NOTES-BRIEF.md) for its research instructions. Start them all at once, then wait for every one to report.

If a default-model report leaves compatibility or repo impact unresolved, dispatch one Sonnet follow-up with the existing digest and the specific open questions. Missing source access goes back to the parent for resolution. After the follow-up, report any remaining gaps as incomplete research before proceeding to the plan.

If a report names a new coupling (a peer or engine requirement on a package outside its group), merge the groups or add the blocking edge. Then research whatever the merge brought into scope.

**Done when** every group has a digest that accounts for every release in its range.

## 4. Plan

Write `plan.md` as one checkbox per group, ordered blockers first:

```markdown
Base commit: <sha>

- [ ] **<group>**: pkg 1.2.3 → 2.0.1 (major), pkg-b 1.2.3 → 2.0.0 | blocked by: <group> | affected items: 4 | digest: <group>.md
```

Show the plan to the user and stop. The user decides which groups to take now, especially the majors. Mark the groups they defer `(deferred)` and leave them unchecked.

## 5. Apply, one group at a time

Work through the accepted groups in plan order:

1. Set the target range in every manifest that lists the package, keeping the existing range style.
2. Install: `pnpm install`, plus `pnpm --ignore-workspace --dir tools/<name> install` for each tools package touched. If the group includes Electron or a native module, run `pnpm rebuild:native`.
3. Work through the digest. Fix every item marked **affected**, then mark it `[x]` with the `file:line` of the fix. If something fails and the digest doesn't explain it, switch to `/diagnosing-bugs`.
4. Run the CLAUDE.md quality gate. It has to pass.
5. Commit the group as `chore(deps): upgrade <group> to <versions>`, then check off the group in `plan.md`.

**Done when** each accepted group is checked off, with its digest's affected items all marked `[x]` and the quality gate passing on that group's commit.

## 6. Review

Run `/code-review` with the base commit from `plan.md` as the fixed point, and pass this run's `.scratch/upgrade-packages/<YYYY-MM-DD>/` folder as the spec. The Spec axis checks the diff against each digest's affected items.
