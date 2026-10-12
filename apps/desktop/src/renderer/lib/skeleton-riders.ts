import skeletonOrangeUrl from "../assets/sprites/skeleton-orange-tight.png";
import skeletonPurpleUrl from "../assets/sprites/skeleton-purple-tight.png";
import type { BikeColor } from "./bike-colors";

/**
 * The skeleton rider sheets, one per bike colour. Each is a 3 × 3 grid of square frames read right
 * to left, top to bottom. The cell positions and frame order live in the
 * `race-sprite-skeleton-frames` keyframes in app.css, so a sheet with a different grid needs both
 * changed together. Frames are square, so the marker's width matches its height as it does for the
 * themed sprites.
 *
 * The `-tight` sheets are the original art cropped to a 200px square around the rider in each
 * cell (the originals were 256px cells with empty margin above and below the rider).
 */
const SKELETON_RIDER_SHEET_URLS: Record<BikeColor, string> = {
  orange: skeletonOrangeUrl,
  purple: skeletonPurpleUrl
};

/** Frame size of the tight sheets, in pixels. */
const SKELETON_TIGHT_FRAME_PX = 200;
/** Frame size of the original sheets the tight ones were cropped from, in pixels. */
const SKELETON_SOURCE_FRAME_PX = 256;

/**
 * How much larger the skeleton rider is drawn than the theme's rider on the same lane. The rider
 * itself is twice the theme's size; the box it sits in is smaller, because the tight frame drops
 * the empty margin around the rider.
 */
const SKELETON_RIDER_SCALE = 2;

/**
 * The scale applied to the lane's marker size and the sprite's box for skeleton riders. The lane
 * layout reserves space from this same size, so the course grows and shrinks with the rider.
 */
export const SKELETON_RIDER_BOX_SCALE =
  SKELETON_RIDER_SCALE * (SKELETON_TIGHT_FRAME_PX / SKELETON_SOURCE_FRAME_PX);

/** Frames on the skeleton sheet's 3 × 3 grid. */
const SKELETON_RIDER_FRAME_COUNT = 9;

/**
 * How much faster the skeleton pedals than the theme's pace. At 2 the nine-frame loop takes half the
 * time the theme's per-frame pace would give it.
 */
const SKELETON_RIDER_PLAYBACK_SPEEDUP = 2;

/**
 * One full loop of the nine-frame pedal cycle. It keeps the theme's per-frame pace for the current
 * speed state, so a fast rider pedals faster than a slow one, as the themed sprite does, then runs
 * at {@link SKELETON_RIDER_PLAYBACK_SPEEDUP}.
 */
export function getSkeletonRiderCycleMs(animation: {
  durationMs: number;
  frameCount: number;
}): number {
  const themedFrameMs = animation.durationMs / animation.frameCount;
  return (themedFrameMs * SKELETON_RIDER_FRAME_COUNT) / SKELETON_RIDER_PLAYBACK_SPEEDUP;
}

/**
 * The skeleton sheet for the bike a rider is on. The lane's bike colour decides it, so a lane swap
 * or a flipped projector changes the sheet along with the lane colour.
 */
export function getSkeletonRiderSheetUrl(bikeColor: BikeColor): string {
  return SKELETON_RIDER_SHEET_URLS[bikeColor];
}
