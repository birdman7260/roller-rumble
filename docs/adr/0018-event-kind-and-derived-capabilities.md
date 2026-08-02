# Event kind is an immutable column on the event; surfaces branch on capabilities derived from it

**Status:** accepted — resolves [issue #31](https://github.com/birdman7260/roller-rumble/issues/31) on the [booth event map (#30)](https://github.com/birdman7260/roller-rumble/issues/30)

Running the app at an outdoor stall needs an event shape with most of the product switched off — no racer page and therefore no sign-in/passkey/recovery subsystem, no `Queue`, no tournaments, no payments, no Web Push — plus behavior a normal event does not have: the host composes each race directly, and the projector shows a top-racers board instead of the `signup prompt` while idle. We give an `Event` a **`kind`** column (`standard` | `walk-up`, TEXT, default `standard`, new migration `0011`), fix it at creation, and derive an **event capability** record from it in a `packages/shared` manifest that every surface reads. Surfaces ask `hasQueue` / `hasRacerPage` / `idleProjector`; nothing outside the manifest compares against `"walk-up"`.

The term is **`walk-up`**, not "booth". `booth` is already the photo booth's word (`photo_booth_captures`, `photo-booth.ts`), and `mode` already means competition format (`AdminSettings.mode` = `AppMode` = `SUPPORTED_TOURNAMENT_PRESETS`), so "booth mode" would have been doubly ambiguous in this codebase. `walk-up` also names the mechanic (a stranger walks up and rides) rather than the venue, so it still fits a bike shop or a trade show.

## Considered Options

**Where the state lives**

- **A `kind` column on `events` (chosen).** Costs a migration, and is the only option where the shape travels with the event: the next league night is a new event that is `standard` by default, with nothing to remember to switch back. It also keeps history interpretable — a race from last summer still knows what kind of event produced it, which the current-event-only board and the lead export both depend on. `paymentRequiredForQueue` is the working precedent for event-scoped config.
- **A field on `AdminSettings` (rejected).** Free — that setting is a JSON blob merged over defaults (`Database.getAdminSettings`), so no migration and automatic back-fill. But it is global and outlives the event it was set for, and the repo has already been burned by this split: `includeAllRaceData` exists on both `events` and `AdminSettings`, and only the settings copy is ever read.
- **A preset that flips existing toggles (rejected).** No new state, but then nothing can branch on being a walk-up event — and the projector swapping its idle card and the host bypassing the queue are exactly branches. A settings-only walk-up event is indistinguishable from a standard event with a `closed queue`.

**Boolean vs. enum**

- **A `kind` enum (chosen).** Same storage as a boolean, matches how the repo already types discriminators (`identities.type`, race states, queue lock types), and gives the capability manifest a key. A third kind is plausible enough to pay for now — the map parks photo booth as its own later effort.
- **A `boothEvent` boolean (rejected).** A second stripped kind later forces either a second boolean (making the meaningless `boothEvent && demoEvent` state representable) or a text conversion after rows exist, which the never-edit-an-applied-migration rule makes awkward.

**What surfaces branch on**

- **Capabilities derived from the kind (chosen).** The `CompetitionPresetDefinition` manifest (`createsBracket`, `supportsBracketSizing`, `supportsSeeding`) is the same pattern already in `packages/shared`, and CLAUDE.md states the rule for themes: branch on manifest attributes, never on ids. A third kind then edits one manifest row instead of every `if` in the app.
- **Direct `kind === "walk-up"` checks (rejected).** Scatters the definition of what a walk-up event _is_ across every consumer, and turns each site into a growing switch as kinds accumulate.
- **Manifest defaults with per-event overrides (rejected).** Every capability would become a column, a settings control, and an untested combination. The whole premise is that this kind is stripped down, which argues against making the stripping negotiable.

## Consequences

- **`kind` is immutable after creation.** `createEvent` takes it; `updateEvent` must not accept it, and the Event tab shows it read-only. Flipping a live event would strand data the new kind has no home for — queued occurrences in an event with no queue, a half-played bracket in an event with no tournaments — and the locked walk-up distance loses its guarantee if the kind can move underneath it. The escape hatch is the one that already exists: create a new event. The cost is near zero because the kind is picked before any data exists.
- **Capabilities are derived, never stored.** The kind stays the single source of truth. Anything an operator genuinely needs to vary within a kind belongs in `AdminSettings` as its own setting, not as a capability override.
- **The manifest is the extension point.** New capability questions are added as fields with a value for every kind, so a kind can never be silently undefined for a new question. Downstream tickets (idle board, host race composition, lead export) each add their field rather than a new branch.
- **The migration is additive and back-fills.** `ALTER TABLE events ADD COLUMN kind TEXT NOT NULL DEFAULT 'standard'` leaves every existing event a standard event, so nothing changes for current users until someone creates a walk-up event.
- **The dead `events.include_all_race_data` column stays dead.** This ADR does not resurrect it; it is cited only as the reason the state landed on the event row _instead of_ being duplicated into `AdminSettings`.
