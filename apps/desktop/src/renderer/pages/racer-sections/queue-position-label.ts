/** A playful time-until label for the race `index` spots from the front of the queue. */
export function getQueuePositionLabel(index: number): string {
  switch (index) {
    case 0:
      return "NOW!";
    case 1:
      return "In 2 minutes";
    case 2:
      return "In 4 minutes";
    case 3:
      return "Get the mind right";
    case 4:
      return "Start stretching";
    default:
      return "";
  }
}
