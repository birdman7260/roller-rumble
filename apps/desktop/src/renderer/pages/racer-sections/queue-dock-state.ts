export type QueueDockState = "hidden" | "closed" | "open";

/**
 * Whether the docked queue actions above the racer tabs show. They appear only where a racer could
 * act on them: a tournament pauses open queueing (and the bracket view takes the whole screen), so
 * the dock gets out of the way rather than offering buttons that would be refused. A closed queue
 * keeps the dock in place but swaps the buttons for the operator's closed message.
 */
export function getQueueDockState(input: {
  signedIn: boolean;
  tournamentMode: boolean;
  bracketExpanded: boolean;
  queueOpen: boolean;
}): QueueDockState {
  if (!input.signedIn || input.tournamentMode || input.bracketExpanded) {
    return "hidden";
  }
  return input.queueOpen ? "open" : "closed";
}
