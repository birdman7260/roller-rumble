# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on `birdman7260/roller-rumble`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** PRs are kept separate from the triage queue; only issues are triaged.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

How `/wayfinder` maps and tickets are expressed here. GitHub has **native** sub-issue and dependency
relationships, so use those rather than a body convention — they render the frontier visually in
GitHub's own UI.

**Labels.** A map carries `wayfinder:map`. Every ticket carries exactly one type label:
`wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.

**Parent/child.** A ticket is a native sub-issue of its map. There is no `gh` subcommand for this —
use GraphQL. Both mutations take **node IDs**, not issue numbers:

```bash
# Node ID for an issue number
gh api graphql -f query='query { repository(owner: "birdman7260", name: "roller-rumble") {
  issue(number: 31) { id } } }' --jq '.data.repository.issue.id'

# Attach a ticket to its map
gh api graphql -f query='mutation { addSubIssue(input: {
  issueId: "<MAP_NODE_ID>", subIssueId: "<TICKET_NODE_ID>" }) { subIssue { number } } }'
```

**Blocking.** Use the native dependency, via `addBlockedBy` (`removeBlockedBy` to undo). `issueId` is
the ticket being **blocked**; `blockingIssueId` is the **blocker**:

```bash
gh api graphql -f query='mutation { addBlockedBy(input: {
  issueId: "<BLOCKED_NODE_ID>", blockingIssueId: "<BLOCKER_NODE_ID>" }) { issue { number } } }'
```

**Frontier query.** Open, unblocked, unassigned children of a map — the takeable tickets:

```bash
gh api graphql -f query='query { repository(owner: "birdman7260", name: "roller-rumble") {
  issue(number: <MAP>) { subIssues(first: 50) { nodes { number title state
    assignees(first: 3) { nodes { login } }
    blockedBy(first: 10) { nodes { number state } } } } } }'
```

A ticket is on the frontier when it is open, has no assignee, and every issue in `blockedBy` is
closed. Filter client-side — `blockedBy` returns closed blockers too, so check their `state`.

**Claiming.** Assign the ticket to the dev driving the map _before_ any work:
`gh issue edit <number> --add-assignee <login>`. An open, unassigned ticket is unclaimed.

**Resolving.** Post the answer as a comment (`gh issue comment`), close the issue
(`gh issue close <number>`), then append a one-line pointer to the map's Decisions-so-far.

**Finding maps.** `gh issue list --label "wayfinder:map" --state open`.

**zsh gotcha.** This repo's shell is zsh, which does **not** word-split unquoted parameter
expansions. `for pair in "35 32"; do set -- $pair; ...` leaves `$1` as the whole string. Use
`"35:32"` with `${pair%%:*}` / `${pair##*:}` when looping over pairs of issue numbers.
