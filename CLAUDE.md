# Snappy Tool

A React + Vite web app for cropping photos into page-derived figure layouts for Word reports. The agreed design is `snappy_tool_proposal_v2.md` — read it before making structural changes. Build order: phases 1–5 as listed there (1–4 are done; Phase 5 — generating a `.docx` directly instead of the manifest+macro handoff — is an unstarted stretch goal).

## Commands

- `npm run dev` — Vite dev server (http://localhost:5173)
- `npm test` — vitest run (unit tests for the pure math modules)
- `npm run build` — production build to `dist/` (gitignored)
- `start.bat` (Windows only) — double-click launcher for the non-technical day-to-day path: `npm install`s on first run if `node_modules` is missing, starts the dev server, and opens it in Edge specifically (not the OS default browser — see the Firefox mix-up this avoided). Point a Desktop shortcut at it. Runs the dev server, not a production build, so it always reflects whatever's checked out — no separate build step to remember.

## Hard constraints

- **Never hard-code page geometry.** The page profile (page size, margins, gutter, DPI, row heights) is fully user-configurable because the user works on documents with templates that aren't theirs. A4/220dpi are only defaults in `src/pageGeometry.js` (`DEFAULT_PROFILE`). All box dimensions must be derived from the `pageProfile` object at runtime — no mm or px values baked into components.
- **Target browser is Edge (Chromium) on a Windows work PC.** The Mac is only the dev machine — don't over-fit macOS quirks. The File System Access API (`showOpenFilePicker`, `showDirectoryPicker`) is in-scope by design; keep the hidden-`<input type=file>` fallback working.

## File System Access picker gotchas (hard-won)

- **VS Code's embedded browser cannot show FSA pickers** — the promise hangs forever and later calls throw NotAllowedError "File picker already active". A "picker does nothing" report means: first ask which browser. Test FSA flows only in real Chrome/Edge.
- Pickers must be called from a `click` handler (pointerdown doesn't reliably carry user activation).
- Don't pass `id` to the directory pickers: Chromium's remembered location can go stale (macOS Photos temp folders), and the app persists chosen handles in IndexedDB anyway. Pass `startIn` (current handle, else a well-known directory) instead.
- Don't pass `mode: 'readwrite'` when choosing the save folder from settings — the bundled permission prompt can hang the picker promise. Request write permission at export time (`App.hasWritePermission`), where the click provides activation. The mid-export fresh pick keeps `readwrite`.
- Chromium refuses to grant root folders like Downloads/Desktop ("contains system files") — subfolders are fine; nothing to fix app-side.
- Never swallow picker errors: `pickDir` in `App.jsx` maps instant AbortErrors (browser refused to open) and busy/hung pickers to visible warnings in the settings panel, with a 30s self-heal on the busy guard.

## Architecture

Pure math lives in dependency-free modules with unit tests; React components stay thin over them:

- `src/pageGeometry.js` — mm→px derivation: `cellWidthMm = (usableWidthMm − gutter×(n−1))/n`, `mmToPx = round(mm/25.4 × dpi)`. Worked examples from the proposal are pinned in `pageGeometry.test.js`.
- `src/cropMath.js` — pan/zoom/clamp math (`minCoverScale`, `clampOffset`, `zoomAt`, `reframe`, `sourceRect`).
- `src/importPlan.js` — pure planner for distributing a multi-file import across empty boxes and deciding how many rows to append.
- `src/manifest.js` — builds the export bundle's manifest (rows → images with `widthMm`/`caption`) and derives batch-scoped filenames (`fig-<batchid>-NN.jpg`, `manifest-<batchid>.json`) from the `generated` timestamp, so multiple export batches can share one output folder without overwriting each other. Consumed by `word-macro/snappy_import.bas`.
- `src/captionCase.js` — Proper Case formatter applied on caption-field blur in `CropBox`. Title-cases ordinary words (small words — articles/conjunctions/short prepositions/"to be" forms — lowercase unless first) while leaving anything that looks technical (digits, ALL-CAPS, camelCase-style internal capitals) exactly as typed, plus a small hand-maintained whitelist (`DEFAULT_WHITELIST`) for short abbreviations that can't be told apart from an ordinary word by shape alone (`Exd`, `Em`, `AFT`, `ATC`, `JB`, …). Doesn't capitalize the last word of a caption the way full title-case convention would — known gap, left as-is; hand-edit in the caption field if a specific caption needs it.
- `src/App.jsx` — owns profile/rows/theme state. Boxes are keyed `${row.id}-${i}`; figures are numbered in document order. Cross-box coordination (Export all, multi-import) uses an imperative registry: each `CropBox` registers `{ export, loadFile }` via `onRegister` into a Map in App — image state itself is never lifted.
- `src/CropBox.jsx` — canvas crop box. Note: `showOpenFilePicker` must be called from a `click` handler (pointerdown doesn't reliably carry user activation in Chromium).
- `src/idb.js` — minimal IndexedDB KV for persisting `FileSystemDirectoryHandle`s (localStorage can't hold them). Reuse it for the Phase 3 output-folder handle.
- `src/styles.css` — token-based theming on CSS custom properties; dark mode via `data-theme` on `documentElement` plus a `prefers-color-scheme` block guarded with `:root:not([data-theme='light'])`. `?theme=` URL param overrides (also used as a test hook). On-screen scale is `DISPLAY_PX_PER_MM = 4` in App — cosmetic only, never used for export.

## Testing

- Pure math: vitest (`*.test.js` next to the module).
- Interactive flows: throwaway puppeteer-core scripts against system Chrome (headless) — mock `showOpenFilePicker`/`showDirectoryPicker` with `evaluateOnNewDocument`, build drops with `DragEvent` + `DataTransfer`, intercept `waitForFileChooser` for the fallback path. These scripts live in the session scratchpad, not the repo.

## Windows/Edge test pass

Full pass completed 2026-09-09 on the actual work PC (Edge/Windows) — pickers, paste-import and
replace-via-aim, caption persistence across reload, New document's conditional confirm, the visual
redesign, and `start.bat` on a clean machine (Node.js had to be installed first via
`winget install OpenJS.NodeJS.LTS`) all check out. `npm test` passes (36/36).
