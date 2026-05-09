export const WHEEL_ITEM_PITCH = 94;

export function normalizeWheelDeltaY(event: WheelEvent): number {
  if (event.deltaMode === 1) {
    return event.deltaY * 16;
  }
  if (event.deltaMode === 2) {
    return event.deltaY * WHEEL_ITEM_PITCH * 3;
  }

  return event.deltaY;
}
