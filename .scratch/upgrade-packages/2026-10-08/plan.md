Base commit: c80ddd1f1bcc839acf0ff6adc094f0199aa9a919

Scope: everything outdated (workspace + tools/db-studio + tools/photo-booth-agent). Affected counts filled in from digests.

Notes from grouping:

- typescript target is 6.0.3, not 7.0.2: typescript-eslint 8.71.1 peers `typescript >=4.8.4 <6.1.0`.
- @types/node target is 24.x: Electron 44.7.0 bundles Node 24.21.0 (releases.electronjs.org). photo-booth-agent runs on plain Node 22, so its @types/node stays on 22.x.
- better-sqlite3 13 is N-API (prebuilds bundled in the package), so it loads on Electron 44 (ABI 149); 12.x prebuilds stop at ABI 148. serialport 13.0.0 (@serialport/bindings-cpp, N-API 8) stays.
- @vitejs/plugin-react 6 peers vite ^8; the React Compiler moves to the optional peer @rolldown/plugin-babel.
- tools/photo-booth-agent links packages/shared via `file:` — reinstall it after the zod group too.

## Workspace

(TBD after research)

## tools/

(TBD after research)
