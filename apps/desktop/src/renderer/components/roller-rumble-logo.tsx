import { APP_NAME } from "@roller-rumble/shared/constants";

const ROLLER_RUMBLE_LOGO_SRC = "/brand/RollerRumbleLogo.png";

/** The Roller Rumble wordmark; the caller's class sizes it. */
export function RollerRumbleLogo({ className }: { className?: string }) {
  return (
    <img className={className} src={ROLLER_RUMBLE_LOGO_SRC} alt={APP_NAME} draggable={false} />
  );
}
