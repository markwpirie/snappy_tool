# Snappy Tool — Project Handover

## Overview
A local web app for cropping/positioning multiple images into fixed-ratio grid layouts before they get used elsewhere (e.g. inserted into a Word document via a separate VBA macro). User drags an image into a box, pans/zooms it to frame the shot, hits Save, and gets pre-cropped output images at a fixed resolution/ratio — removing the need for any cropping logic downstream.

## Tech stack
- React + Vite
- Plain Canvas API for image rendering/export (no image-processing libraries needed — this is straightforward 2D transform + drawImage work)
- Target browser: **Microsoft Edge** (Chromium). This is a firm constraint, not a nice-to-have — the save mechanism (below) only exists in Chromium browsers by deliberate design choice from Firefox/Safari, so no cross-browser fallback is in scope.

## Core concept
A configurable grid of "crop boxes." Each box:
- Has a fixed target aspect ratio (square / 4:3 / 16:9 — extendable list)
- Accepts one image (drag-and-drop from file explorer, plus ideally paste-from-clipboard — see Nice-to-haves)
- Lets the user pan (click+drag) and zoom (scroll wheel or a slider) the image within the box
- Cannot show empty space at any zoom/pan combination — image always fully covers the box
- On Save, exports a cropped image at a fixed output resolution matching exactly what's visible in the box

## Build order (do NOT skip ahead — validate each phase before moving on)

### Phase 1 — Single box proof of concept
Build one crop box in isolation:
1. File input or drag-drop loads an image into the box.
2. Render image on a `<canvas>` sized for on-screen preview.
3. Implement pan: pointerdown → track drag delta → update offsetX/offsetY → redraw.
4. Implement zoom: slider (and/or wheel) → update scale → redraw.
5. Implement clamping (the important bit):
   - **Minimum zoom** = whichever scale makes the image fully cover the box, i.e. `minScale = max(boxWidth / naturalImageWidth, boxHeight / naturalImageHeight)`. Never allow zoom below this — that's what guarantees no gaps.
   - **Pan clamping** = after every pan or zoom change, clamp offsetX/offsetY so the image edges never move inward past the box edges. Recalculate clamp bounds whenever scale changes, since zooming can push a previously-valid pan position out of bounds.
6. Implement export: separate offscreen canvas at a **fixed output resolution** (independent of on-screen preview size — e.g. always export 1600×1200 for a 4:3 box regardless of how big the on-screen box was rendered). Replicate the same pan/zoom transform math scaled up to the output resolution, `drawImage`, then `canvas.toBlob()`.
7. Save button downloads or writes that one exported image.

Don't move to Phase 2 until pan/zoom/clamp/export feels right on a single box — this is the logic every other box reuses verbatim.

### Phase 2 — Multi-box grid layouts
Generalize Phase 1's box into a reusable `<CropBox>` component (aspect ratio + index as props, own pan/zoom state internally). Add a layout picker:
- 1 image
- 2 side-by-side
- 2×2 grid (4 images)
- 3 across

Each layout just changes how many `<CropBox>` components render and the CSS grid/flex wrapper around them — no changes needed to the box logic itself.

### Phase 3 — Save mechanism + polish
- Implement save via the **File System Access API** (`showDirectoryPicker` for a one-time folder pick, then reuse the returned directory handle to write files on every subsequent Save with no repeat dialogs). This is Chromium-only by design (Firefox and Safari have taken an explicit negative standards position on this API and are unlikely to ever implement it) — confirmed acceptable since Edge is the fixed target browser.
- Sensible auto-generated filenames per box (e.g. `figure1.jpg`, `figure2.jpg`, or user-editable names before save).
- Basic UI polish: zoom slider styling, box borders/labels, maybe a "reset crop" button per box.

## Data model (per crop box)
```
{
  imageFile: File | null,
  naturalWidth: number,
  naturalHeight: number,
  aspectRatio: { label: string, w: number, h: number },
  scale: number,
  offsetX: number,
  offsetY: number,
}
```

## Aspect ratio presets (starting list, easy to extend)
| Label | Ratio |
|---|---|
| Square | 1:1 |
| Standard | 4:3 |
| Widescreen | 16:9 |

## Export resolution
Decouple from on-screen box size. Suggested starting defaults (adjust to taste once seeing real output):
- Square: 1200×1200
- 4:3: 1600×1200
- 16:9: 1920×1080

## Nice-to-haves (not required for MVP, flag as future ideas)
- Paste image directly from clipboard into a box (relevant since source images are often Greenshot screen captures already on the clipboard — skips the save-to-folder-then-drag-in step entirely).
- Remember last-used folder handle across sessions (IndexedDB can persist a FileSystemDirectoryHandle so the folder doesn't need re-picking every launch).
- Drag-to-reorder boxes within a layout.

## Context / why this exists
This tool is the upstream counterpart to an existing Word VBA macro (`InsertFiguresWithCaptions`) that inserts images into a report with auto-numbered captions. That macro currently does its own crop-to-ratio logic before inserting. Once Snappy Tool is producing pre-cropped, correctly-ratioed images, the macro's job simplifies to "resize width and insert" — no aspect-ratio math needed on that end anymore. Not a dependency for this build, just context for why the ratios/resolutions matter.

## Open decisions to flag back to the user (don't guess silently on these)
- Exact export resolutions per ratio (defaults above are a starting guess).
- Whether filenames are auto-generated or user-typed per image before save.
- Whether the "3 across" layout should have equal-width columns always, or support one wide + two narrow, etc. (default assumption: equal-width columns, same as 2x2 grid rows).
