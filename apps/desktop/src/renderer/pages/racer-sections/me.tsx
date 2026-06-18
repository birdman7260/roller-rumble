import type { PhotoBoothTokenResponse, QueueEntry, RacerNotification, RacerSummary, TournamentBundle } from "@roller-rumble/shared/types";
import { Button, Panel, TextInput } from "@roller-rumble/shared-ui";
import { m } from "framer-motion";
import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { createRacerPhotoBoothToken } from "../../lib/api";
import { fireAndForget } from "../../lib/ui-actions";
import { AuthForm } from "./auth";
import type { AuthFormProps } from "./auth";
import { ExpandedRacerStats } from "./stats";
import type { SectionMotionProps } from "./shared";

function PhotoBoothQr() {
  const [tokenResponse, setTokenResponse] = useState<PhotoBoothTokenResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: number | null = null;

    async function refreshToken(): Promise<void> {
      try {
        const nextToken = await createRacerPhotoBoothToken();
        if (cancelled) {
          return;
        }

        setTokenResponse(nextToken);
        setErrorMessage(null);
        const refreshInMs = Math.max(
          15_000,
          new Date(nextToken.expiresAt).getTime() - Date.now() - 30_000
        );
        refreshTimer = window.setTimeout(() => {
          fireAndForget(refreshToken(), "refresh photo booth QR");
        }, refreshInMs);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : "Could not load booth QR");
      }
    }

    fireAndForget(refreshToken(), "load photo booth QR");
    return () => {
      cancelled = true;
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
    };
  }, []);

  return (
    <div className="photo-booth-qr">
      <div className="racer-section-heading">
        <strong>Kaleidoscope Photo Booth</strong>
        <p>Show this QR to the booth scanner to take or retake your event avatar.</p>
      </div>
      {tokenResponse ? (
        <img
          className="photo-booth-qr__image"
          src={tokenResponse.qrCodeDataUrl}
          alt="Booth scanner token"
        />
      ) : (
        <div className="photo-booth-qr__placeholder">Preparing your booth QR...</div>
      )}
      <div className="photo-booth-qr__footer">
        <span>
          {tokenResponse
            ? `Refreshes automatically - expires ${new Date(
                tokenResponse.expiresAt
              ).toLocaleTimeString()}`
            : "Keep this page open while you walk up to the booth."}
        </span>
        <Button
          variant="ghost"
          onClick={() => {
            fireAndForget(
              createRacerPhotoBoothToken().then((nextToken) => {
                setTokenResponse(nextToken);
                setErrorMessage(null);
              }),
              "manual photo booth QR refresh"
            );
          }}
        >
          Refresh QR
        </Button>
      </div>
      {errorMessage ? <p className="form-error">{errorMessage}</p> : null}
    </div>
  );
}

function PhotoBoothCard() {
  return (
    <Panel title="Photo Booth">
      <PhotoBoothQr />
    </Panel>
  );
}

export function MeTab({
  authBusy,
  authFormProps,
  authMessage,
  avatarUploadBusy,
  avatarUploadMessage,
  deviceNotificationsEnabled,
  notificationConfigured,
  notificationConfigMessage,
  notificationMessage,
  onAvatarUpload,
  onEnableNotifications,
  onMarkNotificationRead,
  onPasskeyRegistration,
  onSignOut,
  racerNotifications,
  selectedRacer,
  selectedRacerAvatarUrl,
  selectedRacerHasEmail,
  shouldShowNotificationPrompt,
  showNotificationDebugList,
  unreadNotificationCount,
  upcoming,
  upgradeDisplayName,
  upgradeEmail,
  visibleTournament,
  setUpgradeDisplayName,
  setUpgradeEmail,
  layoutTransition,
  supportingCardMotion
}: SectionMotionProps & {
  authBusy: boolean;
  authFormProps: AuthFormProps;
  authMessage: string | null;
  avatarUploadBusy: boolean;
  avatarUploadMessage: string | null;
  deviceNotificationsEnabled: boolean;
  notificationConfigured: boolean;
  notificationConfigMessage: string | null | undefined;
  notificationMessage: string | null;
  onAvatarUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onEnableNotifications: () => Promise<void>;
  onMarkNotificationRead: (notification: RacerNotification) => Promise<void>;
  onPasskeyRegistration: (input: { displayName: string; email: string }) => Promise<void>;
  onSignOut: () => Promise<void>;
  racerNotifications: RacerNotification[];
  selectedRacer?: RacerSummary | null;
  selectedRacerAvatarUrl: string | null;
  selectedRacerHasEmail: boolean;
  shouldShowNotificationPrompt: boolean;
  showNotificationDebugList: boolean;
  unreadNotificationCount: number;
  upcoming: QueueEntry[];
  upgradeDisplayName: string;
  upgradeEmail: string;
  visibleTournament: TournamentBundle | null;
  setUpgradeDisplayName: (value: string) => void;
  setUpgradeEmail: (value: string) => void;
}) {
  return (
    <m.div
      key="racer-identity"
      layout="position"
      transition={layoutTransition}
      {...supportingCardMotion}
      className="racer-page-grid__card racer-page-grid__card--supporting stack-md"
    >
      <Panel title={selectedRacer ? "Your Race Card" : "Register"}>
        {selectedRacer ? (
          <div className="stack-md">
            <div className="race-metric-card__header">
              {selectedRacerAvatarUrl ? (
                <div className="racer-avatar-frame">
                  <img
                    className="racer-avatar racer-avatar--large"
                    src={selectedRacerAvatarUrl}
                    alt={selectedRacer.racer.displayName}
                  />
                  <label
                    className={`racer-avatar-edit-button${avatarUploadBusy ? " is-disabled" : ""}`}
                    aria-label="Upload new avatar"
                    title="Upload new avatar"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                      <path d="M4 20h4l11-11-4-4L4 16v4z" />
                      <path d="M14 6l4 4" />
                    </svg>
                    <input
                      className="racer-avatar-edit-button__input"
                      type="file"
                      accept="image/*"
                      disabled={avatarUploadBusy}
                      onChange={(event) => {
                        fireAndForget(onAvatarUpload(event), "upload racer avatar");
                      }}
                    />
                  </label>
                </div>
              ) : (
                <span className="racer-avatar racer-avatar--large">
                  {selectedRacer.racer.displayName[0]}
                </span>
              )}
              <div>
                <strong>{selectedRacer.racer.displayName}</strong>
              </div>
            </div>
            {selectedRacerAvatarUrl && avatarUploadMessage ? <p>{avatarUploadMessage}</p> : null}
            <div className="button-row">
              <Button
                variant="ghost"
                onClick={() => {
                  fireAndForget(onSignOut(), "sign out racer");
                }}
              >
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
            {!selectedRacerAvatarUrl ? (
              <>
                <label htmlFor="racer-avatar-upload">
                  Upload avatar
                  <input
                    id="racer-avatar-upload"
                    type="file"
                    accept="image/*"
                    disabled={avatarUploadBusy}
                    onChange={(event) => {
                      fireAndForget(onAvatarUpload(event), "upload racer avatar");
                    }}
                  />
                </label>
                {avatarUploadMessage ? <p>{avatarUploadMessage}</p> : null}
              </>
            ) : null}
            {!selectedRacerHasEmail ? (
              <div className="stack-sm">
                <div className="racer-section-heading">
                  <strong>Secure This Account</strong>
                  <p>Add an email and passkey so this racer profile can come with you.</p>
                </div>
                <label htmlFor="racer-upgrade-email">
                  Email
                  <TextInput
                    id="racer-upgrade-email"
                    value={upgradeEmail}
                    onChange={(event) => {
                      setUpgradeEmail(event.target.value);
                    }}
                    placeholder="email@example.com"
                  />
                </label>
                <label htmlFor="racer-upgrade-display-name">
                  Display name
                  <TextInput
                    id="racer-upgrade-display-name"
                    value={upgradeDisplayName}
                    onChange={(event) => {
                      setUpgradeDisplayName(event.target.value);
                    }}
                    placeholder={selectedRacer.racer.displayName}
                  />
                </label>
                <Button
                  disabled={!upgradeEmail || authBusy}
                  onClick={() => {
                    fireAndForget(
                      onPasskeyRegistration({
                        email: upgradeEmail,
                        displayName: upgradeDisplayName.trim() || selectedRacer.racer.displayName
                      }),
                      "upgrade accountless racer"
                    );
                  }}
                >
                  Create Passkey
                </Button>
                {authMessage ? <p className="form-error">{authMessage}</p> : null}
              </div>
            ) : null}
          </div>
        ) : (
          <AuthForm {...authFormProps} />
        )}
      </Panel>
      {selectedRacer && !selectedRacerAvatarUrl ? <PhotoBoothCard /> : null}
      {selectedRacer ? (
        <Panel title="Your Stats">
          <ExpandedRacerStats
            entry={selectedRacer}
            upcoming={upcoming}
            visibleTournament={visibleTournament}
          />
        </Panel>
      ) : null}
      {selectedRacer && selectedRacerAvatarUrl ? <PhotoBoothCard /> : null}
    </m.div>
  );
}
