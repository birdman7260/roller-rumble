# adm-zip

| Package        | Installed | Target                                   |
| -------------- | --------- | ---------------------------------------- |
| adm-zip        | 0.5.17    | 0.6.1                                    |
| @types/adm-zip | 0.5.8     | remove (adm-zip 0.6 ships its own types) |

Repo usage (searched `adm-zip`, `AdmZip`, `IZipEntry` across `apps/`, `packages/`, `tools/`, `scripts/`, root configs): only `apps/desktop/src/electron/main.ts:5` (`import AdmZip from "adm-zip"`) and `main.ts:207-211` (`saveDiagnosticsBundle`: `new AdmZip()`, `zip.addFile(name, Buffer)`, `zip.writeZip(filePath)`). The app only **writes** small zips; it never reads, extracts, or uses `addLocalFolder*`.

## adm-zip 0.5.18

- **behavior change** — Writing now supports zip64 (large archives / many entries get zip64 records when needed) ([source](https://github.com/cthackers/adm-zip/releases/tag/v0.5.18), PR #562)
  - not used: diagnostics bundle is a handful of small text files via `addFile`/`writeZip` (`main.ts:207-211`); zip64 thresholds (4 GiB / 65535 entries) are never reached. No change.
- **behavior change** — Round-tripping entries that have a data descriptor no longer produces a corrupted zip; zips with empty directories now open in macOS Archive Utility ([source](https://github.com/cthackers/adm-zip/releases/tag/v0.5.18), PRs #564, #563)
  - not used: no reading/re-writing of existing archives and no directory entries (searched `new AdmZip(` with args, `addLocalFolder`, `getEntries`, `readFile`, `extract`). No change.
- **behavior change** — No longer crashes when `process.versions` is an empty object ([source](https://github.com/cthackers/adm-zip/releases/tag/v0.5.18), PR #551)
  - not used: runs in Electron main where `process.versions` is populated. No change.

## adm-zip 0.6.0

- **requirement** — Minimum Node.js is now 14 (`engines.node` `>=12.0` → `>=14.0`) ([source](https://github.com/cthackers/adm-zip/releases/tag/v0.6.0))
  - not used: runs in Electron main process; `apps/desktop/package.json:92` pins `electron ^35.2.0` (Node 22). No change.
- **breaking** — Built-in TypeScript definitions (`types.d.ts`, `"types": "types.d.ts"` in package.json, `export = AdmZip`); release notes say "you can drop @types/adm-zip" ([source](https://github.com/cthackers/adm-zip/releases/tag/v0.6.0))
  - [ ] affected: `apps/desktop/package.json:75` — remove `"@types/adm-zip": "^0.5.8"` from devDependencies (and refresh the lockfile). TypeScript resolves the package's own `types` field before `@types/*`, so the old package becomes dead weight and its 0.5 declarations no longer describe the library. `import AdmZip from "adm-zip"` at `apps/desktop/src/electron/main.ts:5` keeps working with the bundled `export = AdmZip` because `tsconfig.base.json:7-8` enables `esModuleInterop`/`allowSyntheticDefaultImports`. Bundled signatures used: `addFile(entryName: string, content: Buffer | string, comment?: string, attr?: number | Stats): AdmZip.IZipEntry` (was `void` in @types — return value is ignored at `main.ts:209`, so no edit) and `writeZip(targetFileName?: string, callback?: (error: Error | null) => void): void` (unchanged for `main.ts:211`). Verify with `pnpm typecheck`.
- **behavior change** — `extractEntryTo(dirEntry, target, maintainEntryPath = false)` now preserves subdirectories instead of flattening by basename ([source](https://github.com/cthackers/adm-zip/releases/tag/v0.6.0), #306)
  - not used: searched `extractEntryTo`, `extractAllTo`, `maintainEntryPath` — no hits.
- **behavior change** — Extraction no longer fails when mtime can't be set (`utimes` is best-effort); directory permissions are now restored on extract ([source](https://github.com/cthackers/adm-zip/releases/tag/v0.6.0), #379, #530)
  - not used: searched `extractAllTo`, `extractEntryTo`, `extractAllToAsync` — no hits.
- **behavior change** — `test()` now returns true for valid archives with files (always returned false before) ([source](https://github.com/cthackers/adm-zip/releases/tag/v0.6.0))
  - not used: searched `.test(` on zip objects / `zip.test` — no adm-zip `test()` calls (only `zip.addFile`, `zip.writeZip` at `main.ts:209,211`).
- **behavior change** — `writeZipFileToAsync` no longer crashes the process on write failure (now reports error); directory entries no longer get an empty name; `addLocalFolder` no longer recurses infinitely on symlink loops ([source](https://github.com/cthackers/adm-zip/releases/tag/v0.6.0), #470, #466, #541)
  - not used: searched `writeZipFileToAsync`, `writeZipPromise`, `addLocalFolder`, `isDirectory` — no hits. App uses sync `writeZip` only.
- **behavior change** — Security: CVE-2026-39244 (bounded allocation for declared uncompressed size), prototype-less entry table against `__proto__` names, data-descriptor regression fix rejecting valid archives (#568, #548, #533, #554) ([source](https://github.com/cthackers/adm-zip/releases/tag/v0.6.0))
  - not used: all are read/parse-path changes; app never opens an existing archive (searched `new AdmZip(` with a path/buffer arg, `getEntry`, `readFile`, `readAsText`). No change.

## adm-zip 0.6.1

- **behavior change** — Archives with duplicate entry names are now rejected on read (`DUPLICATE_ENTRY` thrown while parsing the central directory) ([source](https://github.com/cthackers/adm-zip/releases/tag/v0.6.1))
  - not used: the check is in the read path (`zipFile.js` central-directory parse); writing via `addFile` with an existing name still updates that entry. App never reads archives (searched `new AdmZip(` with args, `getEntries`, `readFile`). No change.
- **behavior change** — Extraction hardening: setuid/setgid/sticky bits stripped from extracted files; extraction won't write through symlinks inside the target; entries whose declared data extent runs past the buffer are rejected; decompression size cap enforced on async path and for size 0 ([source](https://github.com/cthackers/adm-zip/releases/tag/v0.6.1))
  - not used: searched `extractAllTo`, `extractEntryTo`, `extractAllToAsync`, `getDataAsync`, `readFileAsync` — no hits.
- **behavior change** — Async error handling: malformed-header parse errors and malformed DEFLATE data now go to the async callback instead of crashing; `addLocalFolderPromise` no longer hangs on empty folders / swallows errors; `addLocalFolderAsync2` no longer mangles Windows paths; `addLocalFolder` no longer follows symlinks out of the folder ([source](https://github.com/cthackers/adm-zip/releases/tag/v0.6.1))
  - not used: searched `addLocalFolder`, `addLocalFolderPromise`, `addLocalFolderAsync2`, `getDataAsync` — no hits.
