# shared-ui stays dependency-free; shared modals animate with CSS

`@roller-rumble/shared-ui` has exactly one dependency — a `react` peer dep — and every surface imports it. When we needed a reusable `ConfirmModal` (the first shared modal), we built it with a CSS fade/scale transition rather than reaching for `framer-motion`, even though every existing bespoke modal (e.g. `racer-sections/tournament-opt-out-confirm-modal.tsx`) animates with `framer-motion`'s `AnimatePresence`/`m`. We chose to protect `shared-ui`'s zero-runtime-dependency property over matching the spring feel one-for-one.

## Why this is written down

A future reader will see the shared modal hand-rolling CSS keyframes while the app-level modals use `framer-motion`, assume it's an oversight, and be tempted to "fix" it by adding `framer-motion` to `shared-ui`. That would silently give a foundational package a real runtime dependency that every surface then inherits. This ADR marks the CSS-only choice as deliberate.

## Trade-off

- **Cost:** the shared modal's enter/exit is a plain CSS transition, not a `framer-motion` spring, so it won't feel pixel-identical to the racer-page modals.
- **Benefit:** `shared-ui` keeps its zero-runtime-dependency shape. Adding `framer-motion` there would be hard to walk back once other consumers rely on it.

If a shared component ever genuinely needs `framer-motion`, revisit this rather than adding the dependency casually — the bar is "the animation is load-bearing," not "it would look a bit nicer."
