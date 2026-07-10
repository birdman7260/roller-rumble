// Default copy for the projector signup prompt. Each piece is shown when the
// active event leaves the matching override unset (null). The admin event form
// reuses these as input placeholders so the operator sees the fallback.
export const SIGNUP_PROMPT_DEFAULTS = {
  eyebrow: "Race queue is open",
  heading: "Scan to race",
  body: "Register on your phone, pick your matchup, and jump into the next Roller Rumble run."
} as const;
