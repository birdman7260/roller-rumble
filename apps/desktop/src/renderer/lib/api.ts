import type {
  AccountlessRacerSessionInput,
  AppSnapshot,
  PhotoBoothAdminStatus,
  PhotoBoothTokenResponse,
  CreateRacerInput,
  PasskeyChallengeInput,
  PasskeyRegistrationStartInput,
  PasskeyRegistrationStartResponse,
  PasskeySignInStartResponse,
  QueueSignupInput,
  RacerAuthSessionResponse,
  RacerAuthSuccessResponse,
  RacerQueueSignupInput,
  Racer,
  StartTournamentInput,
  TunnelDiagnostics,
  UpdateRacerPaymentInput
} from "@goldsprints/shared/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
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
const racerSessionStorageKey = "goldsprints.racerSessionToken";

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

export async function fetchMeta(): Promise<{ localBaseUrl: string; qrCodeDataUrl: string }> {
  return parseJson(await fetch(buildUrl("/api/meta")));
}

export async function fetchPhotoBoothStatus(): Promise<PhotoBoothAdminStatus> {
  return parseJson(await fetch(buildUrl("/api/booth/status")));
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

export async function startPasskeyRegistration(
  input: PasskeyRegistrationStartInput
): Promise<PasskeyRegistrationStartResponse> {
  return parseJson(
    await fetch(buildUrl("/api/auth/passkeys/register/options"), {
      method: "POST",
      headers: buildJsonHeaders(getRacerSessionHeaders()),
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

export async function signUpQueue(input: QueueSignupInput): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl("/api/admin/queue"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function signUpRacerQueue(input: RacerQueueSignupInput): Promise<AppSnapshot> {
  return parseJson(
    await fetch(buildUrl("/api/queue"), {
      method: "POST",
      headers: buildJsonHeaders(getRacerSessionHeaders()),
      credentials: "include",
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

export function createWebSocketUrl(): string {
  return createWebSocketUrlFromApiBase(apiBase);
}

export function createWebSocketUrlFromApiBase(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}
