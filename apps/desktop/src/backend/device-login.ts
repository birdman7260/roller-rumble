/**
 * Read the racer's `device login` from the request. It lives only in the phone's local storage
 * and travels only as `Authorization: Bearer` (ADR-0024); cookies are never consulted.
 */
export function readDeviceLogin(req: { get(header: string): string | undefined }): string | null {
  const authorization = req.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  return null;
}
