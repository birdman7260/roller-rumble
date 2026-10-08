import type {
  RacerNotification,
  RacerSummary,
  TournamentBundle
} from "@roller-rumble/shared/types";
import { Button, Panel } from "@roller-rumble/shared-ui";
import { m } from "framer-motion";
import type { ChangeEvent, ReactNode } from "react";
import { fireAndForget } from "../../lib/ui-actions";
import { AvatarPicker } from "./avatar-picker";
import { PhotoBoothQr } from "./photo-booth-qr";
import { ExpandedRacerStats } from "./stats";
import type { SectionMotionProps } from "./shared";

function PhotoBoothCard() {
  return (
    <Panel title="Photo Booth">
      <PhotoBoothQr />
    </Panel>
  );
}

export function MeTab({
  avatarUploadBusy,
  avatarUploadMessage,
  deviceNotificationsEnabled,
  notificationConfigured,
  notificationConfigMessage,
  notificationMessage,
  onAvatarUpload,
  onEnableNotifications,
  onMarkNotificationRead,
  onSignOut,
  photoBoothEnabled,
  racerNotifications,
  registration,
  selectedRacer,
  selectedRacerAvatarUrl,
  selectedRacerRealName,
  shouldShowNotificationPrompt,
  showNotificationDebugList,
  unreadNotificationCount,
  visibleTournament,
  layoutTransition,
  supportingCardMotion
}: SectionMotionProps & {
  avatarUploadBusy: boolean;
  avatarUploadMessage: string | null;
  deviceNotificationsEnabled: boolean;
  notificationConfigured: boolean;
  notificationConfigMessage: string | null | undefined;
  notificationMessage: string | null;
  onAvatarUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onEnableNotifications: () => Promise<void>;
  onMarkNotificationRead: (notification: RacerNotification) => Promise<void>;
  onSignOut: () => void;
  photoBoothEnabled: boolean;
  racerNotifications: RacerNotification[];
  /** The registration wizard, shown while this phone has no racer signed in. */
  registration: ReactNode;
  selectedRacer?: RacerSummary | null;
  selectedRacerAvatarUrl: string | null;
  selectedRacerRealName: string | null;
  shouldShowNotificationPrompt: boolean;
  showNotificationDebugList: boolean;
  unreadNotificationCount: number;
  visibleTournament: TournamentBundle | null;
}) {
  return (
    <m.div
      key="racer-identity"
      layout="position"
      transition={layoutTransition}
      {...supportingCardMotion}
      className="racer-page-grid__card racer-page-grid__card--supporting stack-md"
    >
      {selectedRacer ? (
        <Panel title="Your Race Card">
          <div className="stack-md">
            <div className="racer-race-card">
              <div className="racer-race-card__names">
                <strong>{selectedRacer.racer.displayName}</strong>
                {selectedRacerRealName ? <span>{selectedRacerRealName}</span> : null}
              </div>
              <AvatarPicker
                avatarUrl={selectedRacerAvatarUrl}
                displayName={selectedRacer.racer.displayName}
                busy={avatarUploadBusy}
                onUpload={(event) => {
                  fireAndForget(onAvatarUpload(event), "upload racer avatar");
                }}
              />
            </div>
            {avatarUploadBusy || avatarUploadMessage ? (
              <p>{avatarUploadBusy ? "Uploading avatar…" : avatarUploadMessage}</p>
            ) : null}
            <div className="button-row">
              <Button variant="ghost" onClick={onSignOut}>
                Sign out
              </Button>
            </div>
            {!deviceNotificationsEnabled ? (
              <div className="racer-notification-center stack-sm">
                <div className="racer-section-heading">
                  <strong>Race Notifications</strong>
                  <p>
                    {unreadNotificationCount > 0
                      ? `${unreadNotificationCount} unread update${
                          unreadNotificationCount === 1 ? "" : "s"
                        }.`
                      : "Get phone alerts when your race or tournament is coming up."}
                  </p>
                </div>
                {shouldShowNotificationPrompt ? (
                  <div className="racer-notification-callout">
                    <span>
                      {notificationConfigured
                        ? "Enable notifications on this phone so you do not miss your race."
                        : (notificationConfigMessage ?? "Notification setup is still loading.")}
                    </span>
                    <Button
                      variant="accent"
                      disabled={!notificationConfigured}
                      onClick={() => {
                        fireAndForget(onEnableNotifications(), "enable notifications");
                      }}
                    >
                      Enable Notifications
                    </Button>
                  </div>
                ) : (
                  <div className="button-row">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        fireAndForget(onEnableNotifications(), "enable notifications");
                      }}
                    >
                      Enable Notifications
                    </Button>
                  </div>
                )}
                {notificationMessage ? <p>{notificationMessage}</p> : null}
                {showNotificationDebugList && racerNotifications.length > 0 ? (
                  <div className="racer-notification-list">
                    {racerNotifications.slice(0, 5).map((notification) => (
                      <article
                        key={notification.id}
                        className={`racer-notification-item${
                          notification.readAt ? "" : " racer-notification-item--unread"
                        }`}
                      >
                        <div>
                          <strong>{notification.title}</strong>
                          <p>{notification.body}</p>
                        </div>
                        {!notification.readAt ? (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              fireAndForget(
                                onMarkNotificationRead(notification),
                                "mark notification read"
                              );
                            }}
                          >
                            Mark read
                          </Button>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Panel>
      ) : (
        registration
      )}
      {photoBoothEnabled && selectedRacer && !selectedRacerAvatarUrl ? <PhotoBoothCard /> : null}
      {selectedRacer ? (
        <Panel title="Your Stats">
          <ExpandedRacerStats entry={selectedRacer} visibleTournament={visibleTournament} />
        </Panel>
      ) : null}
      {photoBoothEnabled && selectedRacer && selectedRacerAvatarUrl ? <PhotoBoothCard /> : null}
    </m.div>
  );
}
