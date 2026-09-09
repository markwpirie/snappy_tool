# TODO

Personal backlog for snappy_tool — not committed to a delivery timeline. See
`snappy_tool_proposal_v2.md` for the actual phased design/build order.

- **Package for sharing with colleagues.** Not a project yet — this remains a
  personal tool under evaluation for now. When it's ready to share: an Inno
  Setup installer wrapping a pre-`npm ci`'d copy of the app plus a Node
  check/install step and a Desktop shortcut to `start.bat`. Deliberately not
  Electron — the app's picker code leans on the File System Access API and
  targets Edge/Chromium by design (see `CLAUDE.md`), and Electron would mean
  reworking that instead of just packaging it.

- **In-box brightness/contrast/saturation adjustment.** `CropBox.jsx` already
  draws through a 2D canvas context for both the live preview and export
  (`drawImage` calls) — add `ctx.filter = 'brightness(...) contrast(...)
  saturate(...)'` before each, driven by sliders alongside the existing
  zoom control, with values stored per-image next to the pan/zoom state.
  Scope to those three; canvas `filter` is fast but coarse (no
  curves/levels), fine for brightening a dim phone photo, not real editing.

- **Rotate 90°/flip in-box.** Phone photos landing sideways is common. Same
  canvas pipeline as the brightness idea above — a `ctx.rotate()` before
  `drawImage` in both the preview and export paths in `CropBox.jsx`, stored
  per-image next to the pan/zoom state. Small change, high value.

- **Drag-to-reorder boxes/rows.** Reordering is currently up/down buttons
  only (`moveRow` in `App.jsx`) — no way to swap two images between boxes
  without re-importing. Add a drag handle per box; matters once a report has
  15+ photos and one lands in the wrong slot.

- **Contact-sheet preview before export.** A read-only scaled-down view of
  the whole document layout (all rows/boxes/captions at once) so a wrong
  crop or missing caption gets caught before Export all, not after opening
  the .docx.

- **Undo for reframe (pan/zoom).** A fat-fingered drag or scroll currently
  has no way back except reloading the source image from the photo folder.
  Even a single-level undo per box would help.
