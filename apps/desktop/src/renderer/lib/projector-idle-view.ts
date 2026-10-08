import type { QueueEntry, TopRacersEntry } from "@roller-rumble/shared/types";

/**
 * What the projector shows between open time trial races. The full `signup prompt` holds the stage
 * until there is something to show; after that the stage splits in two, with the `Queue` (or, while
 * it is empty, a compact signup prompt) on one side and the `top racers board` on the other. Until
 * someone posts a time, a compact signup prompt stands in for the empty board.
 */
export type ProjectorIdleView =
  | "signup-prompt"
  | "queue-and-top-racers"
  | "signup-and-top-racers"
  | "queue-and-signup";

export function getProjectorIdleView({
  queue,
  topRacers
}: {
  queue: readonly QueueEntry[];
  topRacers: readonly TopRacersEntry[];
}): ProjectorIdleView {
  const hasQueue = queue.length > 0;
  const hasTimes = topRacers.length > 0;

  if (hasQueue && hasTimes) {
    return "queue-and-top-racers";
  }

  if (hasTimes) {
    return "signup-and-top-racers";
  }

  return hasQueue ? "queue-and-signup" : "signup-prompt";
}
