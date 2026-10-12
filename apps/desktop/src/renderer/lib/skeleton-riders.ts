import skeletonOrangeUrl from "../assets/sprites/skeleton-orange.png";
import skeletonPurpleUrl from "../assets/sprites/skeleton-purple.png";
import type { BikeColor } from "./bike-colors";

/**
 * The skeleton rider sheets, one per bike colour. Each is a 3 × 3 grid of square frames read right
 * to left, top to bottom. The cell positions and frame order live in the
 * `race-sprite-skeleton-frames` keyframes in app.css, so a sheet with a different grid needs both
 * changed together. Frames are square, so the marker's width matches its height as it does for the
 * themed sprites.
 */
const SKELETON_RIDER_SHEET_URLS: Record<BikeColor, string> = {
  orange: skeletonOrangeUrl,
  purple: skeletonPurpleUrl
};

/**
 * How much larger the skeleton rider is drawn than the theme's rider on the same lane. The lane
 * layout reserves space from the same size, so the course grows with the rider rather than the
 * rider overlapping the lane card.
 */
export const SKELETON_RIDER_SCALE = 2;

/** Frames on the skeleton sheet's 3 × 3 grid. */
const SKELETON_RIDER_FRAME_COUNT = 9;

/**
 * One full loop of the nine-frame pedal cycle. It keeps the theme's per-frame pace for the current
 * speed state, so a fast rider pedals faster than a slow one, as the themed sprite does.
 */
export function getSkeletonRiderCycleMs(animation: {
  durationMs: number;
  frameCount: number;
}): number {
  return (animation.durationMs / animation.frameCount) * SKELETON_RIDER_FRAME_COUNT;
}

/**
 * The skeleton sheet for the bike a rider is on. The lane's bike colour decides it, so a lane swap
 * or a flipped projector changes the sheet along with the lane colour.
 */
export function getSkeletonRiderSheetUrl(bikeColor: BikeColor): string {
  return SKELETON_RIDER_SHEET_URLS[bikeColor];
}
