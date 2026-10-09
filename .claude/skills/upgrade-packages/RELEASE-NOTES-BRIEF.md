# Release-notes digest brief

You are researching one lockstep group of package upgrades. You'll be given the group name, each package with its installed → target version, and the path of the digest file to write. That digest file is the only thing you write. Another agent will fix the code from it, so every item in it has to be actionable without re-reading the sources.

## Sources

Read **primary sources**: notes written by the package's own maintainers. In priority order:

1. The repository's GitHub Releases (`npm view <pkg> repository.url`, then `gh release list` / `gh release view <tag> -R <owner>/<repo>`).
2. The `CHANGELOG.md` at the target tag. In a monorepo, use the changelog under that package's own directory.
3. The official migration or upgrade guide, for every major version crossed.

Cite the URL of each item's source. A blog post or third-party summary only helps you find a primary source; cite the source it points to.

## Range

Cover every release after the installed version, up to and including the target, for every package in the group. When a stable release's notes defer to its prereleases ("see the betas"), read the prerelease notes as well.

## Items

From each release, pull out every:

- **breaking** change,
- **deprecation**,
- **behavior change** (same API, different result: defaults, timing, output, error handling),
- **requirement** change (peer dependencies, engines, Node or Electron versions, ESM/CJS format).

For each item, search the repo (`apps/`, `packages/`, `tools/`, config files; leave out `node_modules` and `dist`) for the APIs, options and config it touches, then give a **verdict**:

- **affected**: the `file:line` locations, plus the exact change each one needs.
- **not used**: the searches you ran that came back empty.

## Digest format

```markdown
# <group>

| Package | Installed | Target |
| ------- | --------- | ------ |

## <pkg> <version>

- [ ] **breaking** — <what changed> ([source](url))
  - affected: `apps/desktop/src/x.ts:42` — <required change>
- **deprecation** — <what changed> ([source](url))
  - not used: searched `fooOption`, `useFoo(`

## <pkg> <version>

Nothing in scope. ([source](url))
```

Give every **affected** item a `[ ]` checkbox. List every release in range under its own heading, including ones with nothing in scope.

## Done

You're done when every release in range has a heading, and every item has a verdict backed by a cited source and a repo search. Then report back in under 100 words: how many items are affected, and any requirement on a package **outside** this group, naming the package and the version it needs.
