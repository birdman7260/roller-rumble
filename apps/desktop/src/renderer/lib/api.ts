import type {
  AppSnapshot,
  PhotoBoothAdminStatus,
  PhotoBoothTokenResponse,
  CreateRacerInput,
  QueueSignupInput,
  Racer,
  StartTournamentInput
} from "@goldsprints/shared/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const configuredBase =
  typeof import.meta.env.VITE_API_BASE === "string" ? import.meta.env.VITE_API_BASE : undefined;
export const apiBase =
  configuredBase ??
  (window.location.port === "5173" ? "http://127.0.0.1:3187" : window.location.origin);

function buildUrl(path: string): string {
  return path.startsWith("http") ? path : `${apiBase}${path}`;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: unknown = await response
      .json()
      .catch((): Promise<unknown> => Promise.resolve({ message: "Request failed" }));
    const message =
      isRecord(error) && typeof error.message === "string" ? error.message : "Request failed";
    throw new Error(message);
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
    await fetch(buildUrl("/api/queue"), {
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
  const url = new URL(apiBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}
