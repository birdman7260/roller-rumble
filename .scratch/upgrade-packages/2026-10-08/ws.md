# ws

| Package   | Installed | Target |
| --------- | --------- | ------ |
| ws        | 8.20.0    | 8.22.0 |
| @types/ws | 8.18.1    | 8.18.2 |

Repo usage context: `ws` is only imported in `apps/desktop/src/backend/server.ts:11-12`. The server is created as `new WebSocketServer({ noServer: true })` (`server.ts:224`) with default options, is server→client only (no `"message"` listener anywhere in `apps/desktop/src/backend`), uses `client.readyState === 1`, `client.send(string)`, `client.ping()`, `client.terminate()` and `wsServer.close()`, and never calls `WebSocket#close(code, reason)`. The renderer (`apps/desktop/src/renderer/lib/query.tsx:147`) uses the browser's native `WebSocket`, not `ws`. Engines/peer deps unchanged at 8.22.0 (`node >=10.0.0`; optional peers `bufferutil ^4.0.1`, `utf-8-validate >=5.0.2`).

## ws 8.20.1

- **behavior change** (security fix) — `websocket.close()` no longer discloses uninitialized memory when a `TypedArray` (e.g. `Float32Array`) is passed as `reason`; only string/`Buffer` reasons are supported. ([source](https://github.com/websockets/ws/releases/tag/8.20.1))
  - not used: searched `client.close(`, `ws.close(`, `\.close(` in `apps/desktop/src/backend` — only `wsServer.close()` (server, no args), `httpServer.close`, `service.close`, serial-port/OS2L closes; no `WebSocket#close` with a reason.

## ws 8.21.0

- **behavior change** (security fix / new defaults) — New `maxBufferedChunks` and `maxFragments` options on both `WebSocketServer` and `WebSocket` client; incoming messages/streams exceeding them are now rejected (connection closed) to fix a remote memory-exhaustion DoS from many tiny fragments/chunks. Limits are on by default (set to `0` to disable). ([source](https://github.com/websockets/ws/releases/tag/8.21.0), [option docs @ 8.22.0](https://github.com/websockets/ws/blob/8.22.0/doc/ws.md))
  - not used: searched `maxBufferedChunks`, `maxFragments`, `maxPayload`, `on("message"` across `apps/`, `packages/`, `tools/` — none. Server uses default options and ignores inbound messages; outbound snapshot sends are single unfragmented frames, so the new receive-side limits don't affect our traffic. No change needed.

## ws 8.21.1

- **behavior change** — Empty fragments now count toward the `maxFragments` limit. ([source](https://github.com/websockets/ws/releases/tag/8.21.1))
  - not used: searched `maxFragments`, `on("message"`, `fin: false` — none; the server never receives fragmented messages from our clients.
- **behavior change** — Default values of `maxBufferedChunks` and `maxFragments` reduced (now 262144 and 16384 respectively per 8.22.0 docs). ([source](https://github.com/websockets/ws/releases/tag/8.21.1), [docs](https://github.com/websockets/ws/blob/8.22.0/doc/ws.md))
  - not used: searched `maxBufferedChunks`, `maxFragments` — not configured; defaults far exceed anything our server→client-only stream receives.

## ws 8.21.2

Nothing in scope (test-only fix for CITGM). ([source](https://github.com/websockets/ws/releases/tag/8.21.2))

## ws 8.21.3

- **behavior change** — Server now rejects permessage-deflate offers whose `client_max_window_bits` is smaller than the configured `clientMaxWindowBits`. ([source](https://github.com/websockets/ws/releases/tag/8.21.3))
  - not used: searched `perMessageDeflate`, `clientMaxWindowBits`, `serverMaxWindowBits` — none; permessage-deflate is disabled by default on `WebSocketServer` and we don't enable it.

## ws 8.22.0

- **behavior change** — Calling `websocket.close()` with invalid arguments no longer transitions `readyState` to `WebSocket.CLOSING` (it throws and the state stays put). ([source](https://github.com/websockets/ws/releases/tag/8.22.0))
  - not used: searched `client.close(`, `ws.close(`, `CLOSING` in `apps/desktop/src/backend` — no `WebSocket#close` calls; we use `client.terminate()` (`server.ts:304`) and `wsServer.close()` (`server.ts:1014`).
- New `protocols` option (client) — additive feature, not a breaking/behavior item. Note `@types/ws` 8.18.2 does not type it. Searched `protocols`, `handleProtocols`, `Sec-WebSocket-Protocol` — not used.

## @types/ws 8.18.2

Single change since 8.18.1: DefinitelyTyped commit [2bb69f9ac0](https://github.com/DefinitelyTyped/DefinitelyTyped/commit/2bb69f9ac0) "[ws] Add maxFragments option" (PR #75590), adding optional `maxBufferedChunks?: number` and `maxFragments?: number` to `ClientOptions` and `ServerOptions`. Additive only. ([commit history](https://github.com/DefinitelyTyped/DefinitelyTyped/commits/master/types/ws))

- **requirement** — Published package's minimum `typeScriptVersion` rose from 5.1 (8.18.1) to 5.6 (8.18.2) (DefinitelyTyped support-window bump; source: `npm view @types/ws@8.18.2 typeScriptVersion`, [npm](https://www.npmjs.com/package/@types/ws/v/8.18.2)). Dependency still `@types/node: *`.
  - not affected: repo pins `typescript ^5.8.3` (`package.json:58`, `apps/desktop/package.json:97`), installed 5.9.3 ≥ 5.6.
- **behavior change** — none; type additions don't affect `server.ts` usage (`WebSocketServer`, `WebSocket` type import).
  - not used: searched `maxBufferedChunks`, `maxFragments` — none.

Also note: `apps/desktop/package.json:67` declares `"ws": "^8.18.2"` and `:86` `"@types/ws": "^8.18.1"`; bump the ranges to the targets as part of the upgrade.
