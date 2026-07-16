import type {
  AccountlessRacerSessionInput,
  AdminTournamentByeFillInput,
  AdminTournamentByeFillResponse,
  AdminTournamentRacerRemovalInput,
  AdminTournamentRacerRemovalResponse,
  AdminNotificationInput,
  AppSnapshot,
  PhotoBoothAdminStatus,
  PhotoBoothTokenResponse,
  CreateRacerInput,
  NotificationConfig,
  PasskeyChallengeInput,
  PasskeyRegistrationStartInput,
  PasskeyRegistrationStartResponse,
  PasskeySignInStartResponse,
  ProjectorWindowResizeResult,
  ProjectorWindowSizePreset,
  QueueSignupInput,
  RacerAuthSessionResponse,
  RacerAuthSuccessResponse,
  RacerNotification,
  RacerQueueSignupInput,
  RacerQueueSignupResponse,
  Racer,
  StripeConnectionTestResult,
  StartTournamentInput,
  TournamentOptOutResponse,
  TournamentByeFillOptionsResponse,
  TournamentRacerRemovalOptionsResponse,
  TunnelDiagnostics,
  UpdateEventPaymentConfigInput,
  UpdateRacerPaymentInput,
  WebPushSubscriptionInput
} from "@roller-rumble/shared/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

export interface RuntimeEnvInfo {
  path: string;
  exists: boolean;
  loadedFiles: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const configuredBase =
  typeof import.meta.env.VITE_API_BASE === "string" ? import.meta.env.VITE_API_BASE : undefined;

interface BrowserLocation {
  hostname: string;
  origin: string;
  port: string;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function resolveApiBase(
  location: BrowserLocation,
  configuredApiBase: string | undefined = configuredBase
): string {
  if (configuredApiBase && isLoopbackHost(location.hostname)) {
    return configuredApiBase;
  }

  // Public tunnel visitors must use their current origin, not the laptop-local dev override.
  if (location.port === "5173" && isLoopbackHost(location.hostname)) {
    return "http://127.0.0.1:3187";
  }

  return location.origin;
}

export const apiBase = resolveApiBase(window.location);
const racerSessionStorageKey = "roller-rumble.racerSessionToken";

function buildUrl(path: string): string {
  return path.startsWith("http") ? path : `${apiBase}${path}`;
}

export function rememberRacerSessionToken(token?: string | null): void {
  if (token) {
    localStorage.setItem(racerSessionStorageKey, token);
  }
}

export function forgetRacerSessionToken(): void {
  localStorage.removeItem(racerSessionStorageKey);
}

function getRacerSessionHeaders(): Record<string, string> {
  const token = localStorage.getItem(racerSessionStorageKey);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildJsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...extra
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: unknown = await response
      .json()
      .catch((): Promise<unknown> => Promise.resolve({ message: "Request failed" }));
    const message =
      isRecord(error) && typeof error.message === "string" ? error.message : "Request failed";
    const code = isRecord(error) && typeof error.code === "string" ? error.code : undefined;
    throw new ApiError(message, response.status, code);
  }

  const payload = (await response.json()) as unknown;
  return payload as T;
}

export async function fetchSnapshot(): Promise<AppSnapshot> {
  return parseJson(await fetch(buildUrl("/api/snapshot")));
}

export async function fetchMeta(): Promise<{
  localBaseUrl: string;
  racerPageUrl: string;
  qrCodeDataUrl: string;
}> {
  return parseJson(await fetch(buildUrl("/api/meta")));
}

export async function fetchRacerQrCodeSvg(): Promise<string> {
  const response = await fetch(buildUrl("/api/meta/qr-code.svg"));
  if (!response.ok) {
    throw new ApiError("Failed to load QR code.", response.status);
  }
  return response.text();
}

export async function fetchRuntimeEnvInfo(): Promise<RuntimeEnvInfo> {
  return parseJson(await fetch(buildUrl("/api/runtime-env")));
}

export async function ensureRuntimeEnvFile(): Promise<RuntimeEnvInfo> {
  return parseJson(await fetch(buildUrl("/api/runtime-env/ensure"), { method: "POST" }));
}

export async function openRuntimeEnvFile(): Promise<RuntimeEnvInfo> {
  return parseJson(await fetch(buildUrl("/api/runtime-env/open"), { method: "POST" }));
}

export async function generateRuntimeEnvPushKeys(): Promise<RuntimeEnvInfo> {
  return parseJson(
    await fetch(buildUrl("/api/runtime-env/generate-push-keys"), { method: "POST" })
  );
}

export async function openLabPage(labId: "bracket" | "glow" | "notification" | "queue"): Promise<{
  url: string;
}> {
  return parseJson(await fetch(buildUrl(`/api/labs/${labId}/open`), { method: "POST" }));
}

export async function resizeProjectorWindow(
  preset: ProjectorWindowSizePreset
): Promise<ProjectorWindowResizeResult> {
  return parseJson(
    await fetch(buildUrl("/api/projector/window-size"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset })
    })
  );
}

export async function fetchNotificationConfig(): Promise<NotificationConfig> {
  return parseJson(await fetch(buildUrl("/api/notifications/config")));
}

export async function fetchPhotoBoothStatus(): Promise<PhotoBoothAdminStatus> {
  return parseJson(await fetch(buildUrl("/api/booth/status")));
}

export async function setPhotoBoothEnabled(enabled: boolean): Promise<void> {
  await fetch(buildUrl("/api/booth/enabled"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled })
  });
}

export async function rotatePhotoBoothPairing(): Promise<PhotoBoothAdminStatus> {
  return parseJson(
    await fetch(buildUrl("/api/booth/pairing/rotate"), {
      method: "POST"
    })
  );
}

export async function createPhotoBoothToken(racerId: string): Promise<PhotoBoothTokenResponse> {
  return parseJson(
    await fetch(buildUrl("/api/booth/tokens"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ racerId })
    })
  );
}

export async function createRacerPhotoBoothToken(): Promise<PhotoBoothTokenResponse> {
  return parseJson(
    await fetch(buildUrl("/api/racer/booth/tokens"), {
      method: "POST",
      credentials: "include",
      headers: getRacerSessionHeaders()
    })
  );
}

export async function fetchRacerAuthSession(): Promise<RacerAuthSessionResponse> {
  return parseJson(
    await fetch(buildUrl("/api/auth/session"), {
      credentials: "include",
      headers: getRacerSessionHeaders()
    })
  );
}

export async function signOutRacer(): Promise<RacerAuthSessionResponse> {
  return parseJson(
    await fetch(buildUrl("/api/auth/sign-out"), {
      method: "POST",
      credentials: "include",
      headers: getRacerSessionHeaders()
    })
  );
}

export async function startPasskeySignIn(email: string): Promise<PasskeySignInStartResponse> {
  return parseJson(
    await fetch(buildUrl("/api/auth/passkeys/sign-in/options"), {
      method: "POST",
      headers: buildJsonHeaders(getRacerSessionHeaders()),
      credentials: "include",
      body: JSON.stringify({ email })
    })
  );
}

export async function finishPasskeySignIn(
  input: PasskeyChallengeInput
): Promise<RacerAuthSuccessResponse> {
  return parseJson(
    await fetch(buildUrl("/api/auth/passkeys/sign-in/verify"), {
      method: "POST",
      headers: buildJsonHeaders(getRacerSessionHeaders()),
      credentials: "include",
      body: JSON.stringify(input)
    })
  );
}

// Registration deliberately omits the session Authorization header: the server
// never reads it for account creation (ADR-0016). `credentials: "include"` stays
// so the response's new session cookie is stored on the device.
export async function startPasskeyRegistration(
  input: PasskeyRegistrationStartInput
): Promise<PasskeyRegistrationStartResponse> {
  return parseJson(
    await fetch(buildUrl("/api/auth/passkeys/register/options"), {
      method: "POST",
      headers: buildJsonHeaders(),
      credentials: "include",
      body: JSON.stringify(input)
    })
  );
}

export async function finishPasskeyRegistration(
  input: PasskeyChallengeInput
): Promise<RacerAuthSuccessResponse> {
  return parseJson(
    await fetch(buildUrl("/api/auth/passkeys/register/verify"), {
      method: "POST",
      headers: buildJsonHeaders(),
      credentials: "include",
      body: JSON.stringify(input)
    })
  );
}

// Account claim is session-bound: it attaches an email + passkey to the current
// accountless racer, so it sends the session headers registration omits.
export async function startAccountClaim(
  input: PasskeyRegistrationStartInput
): Promise<PasskeyRegistrationStartResponse> {
  return parseJson(
    await fetch(buildUrl("/api/auth/passkeys/claim/options"), {
      method: "POST",
      headers: buildJsonHeaders(getRacerSessionHeaders()),
      credentials: "include",
      body: JSON.stringify(input)
    })
  );
}

export async function finishAccountClaim(
  input: PasskeyChallengeInput
): Promise<RacerAuthSuccessResponse> {
  return parseJson(
    await fetch(buildUrl("/api/auth/passkeys/claim/verify"), {
      method: "POST",
      headers: buildJsonHeaders(getRacerSessionHeaders()),
      credentials: "include",
      body: JSON.stringify(input)
    })
  );
}

export async function createAccountlessRacerSession(
  input: AccountlessRacerSessionInput
): Promise<RacerAuthSuccessResponse> {
  return parseJson(
    await fetch(buildUrl("/api/auth/accountless"), {
      method: "POST",
      headers: buildJsonHeaders(getRacerSessionHeaders()),
      credentials: "include",
      body: JSON.stringify(input)
    })
  );
}

export async function registerRacer(
  input: CreateRacerInput
): Promise<{ racer: Racer; snapshot: AppSnapshot }> {
  return parseJson(
    await fetch(buildUrl("/api/racers"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    })
  );
}

export async function createEvent(name: string): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl("/api/events"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    })
  );
}

export interface UpdateEventInput {
  name?: string;
  description?: string | null;
  signupEyebrow?: string | null;
  signupHeading?: string | null;
}

export async function updateActiveEvent(input: UpdateEventInput): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl("/api/events/current"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function signUpQueue(input: QueueSignupInput): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl("/api/admin/queue"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function signUpRacerQueue(
  input: RacerQueueSignupInput
): Promise<RacerQueueSignupResponse> {
  return parseJson(
    await fetch(buildUrl("/api/queue"), {
      method: "POST",
      headers: buildJsonHeaders(getRacerSessionHeaders()),
      credentials: "include",
      body: JSON.stringify(input)
    })
  );
}

export async function updateEventPaymentConfig(
  input: UpdateEventPaymentConfigInput
): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl("/api/events/current/payment"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function testStripeConnection(): Promise<StripeConnectionTestResult> {
  return parseJson(
    await fetch(buildUrl("/api/stripe/test-connection"), {
      method: "POST"
    })
  );
}

export async function cancelRacerCheckoutPayment(paymentId: string): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl(`/api/racer/payments/${paymentId}/cancel`), {
      method: "POST",
      credentials: "include",
      headers: getRacerSessionHeaders()
    })
  );
}

export async function saveRacerPushSubscription(
  subscription: WebPushSubscriptionInput
): Promise<NotificationConfig> {
  return parseJson(
    await fetch(buildUrl("/api/racer/notifications/subscriptions"), {
      method: "POST",
      headers: buildJsonHeaders(getRacerSessionHeaders()),
      credentials: "include",
      body: JSON.stringify(subscription)
    })
  );
}

export async function deleteRacerPushSubscription(
  subscription: WebPushSubscriptionInput
): Promise<NotificationConfig> {
  return parseJson(
    await fetch(buildUrl("/api/racer/notifications/subscriptions"), {
      method: "DELETE",
      headers: buildJsonHeaders(getRacerSessionHeaders()),
      credentials: "include",
      body: JSON.stringify(subscription)
    })
  );
}

export async function fetchRacerNotifications(): Promise<RacerNotification[]> {
  return parseJson(
    await fetch(buildUrl("/api/racer/notifications"), {
      credentials: "include",
      headers: getRacerSessionHeaders()
    })
  );
}

export async function markRacerNotificationRead(
  notificationId: string
): Promise<RacerNotification[]> {
  return parseJson(
    await fetch(buildUrl(`/api/racer/notifications/${notificationId}/read`), {
      method: "POST",
      credentials: "include",
      headers: getRacerSessionHeaders()
    })
  );
}

export async function optOutOfCurrentTournament(): Promise<TournamentOptOutResponse> {
  return parseJson(
    await fetch(buildUrl("/api/racer/tournaments/current/opt-out"), {
      method: "POST",
      credentials: "include",
      headers: getRacerSessionHeaders()
    })
  );
}

export async function leaveRacerQueue(): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl("/api/racer/queue"), {
      method: "DELETE",
      credentials: "include",
      headers: getRacerSessionHeaders()
    })
  );
}

export async function leaveRacerQueueEntry(entryId: string): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl(`/api/racer/queue/${encodeURIComponent(entryId)}`), {
      method: "DELETE",
      credentials: "include",
      headers: getRacerSessionHeaders()
    })
  );
}

export async function sendAdminNotification(
  input: AdminNotificationInput
): Promise<{ snapshot: AppSnapshot; targetCount: number }> {
  return parseJson(
    await fetch(buildUrl("/api/admin/notifications"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function updateRacerPayment(
  racerId: string,
  input: UpdateRacerPaymentInput
): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl(`/api/admin/racers/${racerId}/payment`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function stageNextRace(): Promise<AppSnapshot> {
  return parseJson(await fetch(buildUrl("/api/races/next/stage"), { method: "POST" }));
}

export async function startCurrentRace(): Promise<AppSnapshot> {
  return parseJson(await fetch(buildUrl("/api/races/current/start"), { method: "POST" }));
}

export async function unstageCurrentRace(): Promise<AppSnapshot> {
  return parseJson(await fetch(buildUrl("/api/races/current/unstage"), { method: "POST" }));
}

export async function resetCurrentRaceToStaged(): Promise<AppSnapshot> {
  return parseJson(await fetch(buildUrl("/api/races/current/reset-to-staged"), { method: "POST" }));
}

export async function unstageCurrentTournamentRace(): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl("/api/races/current/unstage-tournament"), { method: "POST" })
  );
}

export async function finalizeCurrentRace(): Promise<AppSnapshot> {
  return parseJson(await fetch(buildUrl("/api/races/current/finalize"), { method: "POST" }));
}

export async function resumeInterruptedRace(): Promise<AppSnapshot> {
  return parseJson(await fetch(buildUrl("/api/races/current/resume"), { method: "POST" }));
}

export async function restartInterruptedRace(): Promise<AppSnapshot> {
  return parseJson(await fetch(buildUrl("/api/races/current/restart"), { method: "POST" }));
}

export async function finalizeInterruptedRace(): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl("/api/races/current/finalize-interrupted"), { method: "POST" })
  );
}

export async function dismissRaceResultPresentation(): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl("/api/races/result-presentation/dismiss"), { method: "POST" })
  );
}

export async function updateSettings(
  input: Partial<AppSnapshot["settings"]>
): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl("/api/settings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function createTournament(input: StartTournamentInput): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl("/api/tournaments"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function endTournamentEarly(tournamentId: string): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl(`/api/tournaments/${tournamentId}/end`), {
      method: "POST"
    })
  );
}

export async function fetchTournamentRacerRemovalOptions(
  tournamentId: string,
  racerId: string
): Promise<TournamentRacerRemovalOptionsResponse> {
  return parseJson(
    await fetch(buildUrl(`/api/tournaments/${tournamentId}/racers/${racerId}/removal-options`))
  );
}

export async function removeRacerFromTournament(
  tournamentId: string,
  racerId: string,
  input: AdminTournamentRacerRemovalInput
): Promise<AdminTournamentRacerRemovalResponse> {
  return parseJson(
    await fetch(buildUrl(`/api/tournaments/${tournamentId}/racers/${racerId}/remove`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function stageTournamentBracketMatch(
  tournamentId: string,
  nodeId: string
): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl(`/api/tournaments/${tournamentId}/bracket/${nodeId}/stage`), {
      method: "POST"
    })
  );
}

export async function undoTournamentBracketMatch(
  tournamentId: string,
  nodeId: string
): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl(`/api/tournaments/${tournamentId}/bracket/${nodeId}/undo`), {
      method: "POST"
    })
  );
}

export async function fetchTournamentByeFillOptions(
  tournamentId: string,
  nodeId: string
): Promise<TournamentByeFillOptionsResponse> {
  return parseJson(
    await fetch(buildUrl(`/api/tournaments/${tournamentId}/bracket/${nodeId}/fill-bye-options`))
  );
}

export async function fillTournamentByeSlot(
  tournamentId: string,
  nodeId: string,
  input: AdminTournamentByeFillInput
): Promise<AdminTournamentByeFillResponse> {
  return parseJson(
    await fetch(buildUrl(`/api/tournaments/${tournamentId}/bracket/${nodeId}/fill-bye`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function stageTournamentGroupMatch(
  tournamentId: string,
  matchId: string
): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl(`/api/tournaments/${tournamentId}/group-matches/${matchId}/stage`), {
      method: "POST"
    })
  );
}

export async function undoTournamentGroupMatch(
  tournamentId: string,
  matchId: string
): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl(`/api/tournaments/${tournamentId}/group-matches/${matchId}/undo`), {
      method: "POST"
    })
  );
}

export async function startTunnel(): Promise<AppSnapshot> {
  return parseJson(await fetch(buildUrl("/api/tunnel/start"), { method: "POST" }));
}

export async function stopTunnel(): Promise<AppSnapshot> {
  return parseJson(await fetch(buildUrl("/api/tunnel/stop"), { method: "POST" }));
}

export async function fetchTunnelDiagnostics(): Promise<TunnelDiagnostics> {
  return parseJson(await fetch(buildUrl("/api/tunnel/diagnostics")));
}

export async function installCloudflared(): Promise<TunnelDiagnostics> {
  return parseJson(await fetch(buildUrl("/api/tunnel/install-cloudflared"), { method: "POST" }));
}

export async function restartTunnel(): Promise<AppSnapshot> {
  return parseJson(await fetch(buildUrl("/api/tunnel/restart"), { method: "POST" }));
}

export async function saveManagedSetting(
  id: string,
  value: string
): Promise<{ snapshot: AppSnapshot; needsTunnelRestart: boolean }> {
  return parseJson(
    await fetch(buildUrl(`/api/managed-settings/${id}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value })
    })
  );
}

export async function reloadRuntimeEnv(): Promise<AppSnapshot> {
  return parseJson(await fetch(buildUrl("/api/runtime-env/reload"), { method: "POST" }));
}

export async function fetchDiagnosticsSummary(): Promise<{ summary: string }> {
  return parseJson(await fetch(buildUrl("/api/diagnostics")));
}

export async function saveDiagnosticsBundle(): Promise<{ savedPath: string | null }> {
  return parseJson(await fetch(buildUrl("/api/diagnostics/save"), { method: "POST" }));
}

export async function removeRacerFromUpcoming(racerId: string): Promise<AppSnapshot> {
  return parseJson(await fetch(buildUrl(`/api/queue/racer/${racerId}`), { method: "DELETE" }));
}

export async function removeRacerFromQueueEntry(
  entryId: string,
  racerId: string
): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl(`/api/queue/${entryId}/racer/${racerId}`), { method: "DELETE" })
  );
}

export async function uploadAvatar(racerId: string, file: File): Promise<AppSnapshot> {
  const form = new FormData();
  form.append("avatar", file);

  return parseJson(
    await fetch(buildUrl(`/api/racers/${racerId}/avatar`), {
      method: "POST",
      body: form
    })
  );
}

export type SnapshotStreamSurface = "admin" | "projector" | "racer";

export function createWebSocketUrl(surface?: SnapshotStreamSurface): string {
  return createWebSocketUrlFromApiBase(apiBase, surface);
}

export function createWebSocketUrlFromApiBase(
  baseUrl: string,
  surface?: SnapshotStreamSurface
): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  if (surface) {
    url.searchParams.set("surface", surface);
  }
  return url.toString();
}
