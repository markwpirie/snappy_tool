# Snappy Tool v2 — Figure Composer for Word Reports

## What changed from the v1 handover, and why

The v1 plan builds a good crop tool. But the stated pain point is not "I need cropped
images" — it's *"getting lots of photos into a Word document at similar sizes, evenly
spaced, consistent, with captions, mixing portrait/landscape and 1-up/2-up/grid
layouts."* Three upgrades close that gap:

1. **Aspect ratios are derived from the page, not picked from a list.**
   1:1 / 4:3 / 16:9 are screen ratios. In a report, an image's correct shape is
   dictated by the slot it will occupy: usable page width, how many images share the
   row, the gutter between them, and how tall you want that row. Snappy Tool should
   know the page geometry and *compute* each crop box's ratio and export resolution
   from it. Result: every image lands in Word at its exact final size — consistency
   is guaranteed by construction, not by careful resizing afterwards.

2. **You compose a document strip, not a fixed grid.**
   A real report isn't one 2×2 grid — it's a sequence: a big establishing photo,
   then two details side by side, then three across, etc. The UI becomes a
   vertically scrolling list of **rows**, each row independently set to 1-up, 2-up,
   3-up, or a tall/portrait variant. You build the whole figure sequence for a
   report section in one session, in document order.

3. **Captions and ordering travel with the images.**
   Type the caption in the tool while the photo is in front of you. Export a
   `manifest.json` next to the images. The existing `InsertFiguresWithCaptions`
   macro then becomes a dumb loop: read manifest → insert each image at the stated
   width in mm → apply caption with SEQ numbering. Zero layout decisions left on the
   Word side.

Everything good in v1 survives: the pan/zoom/clamp math, canvas export,
File System Access API save, Edge-only target, and the phased build discipline.

---

## Tech stack (unchanged plus one)

- React + Vite
- Plain Canvas API for render/export (no image libraries needed)
- Target browser: **Microsoft Edge** (Chromium) — firm constraint; File System
  Access API is Chromium-only by design.
- *(Phase 5 only)* the `docx` npm package, if/when we generate .docx directly.

## Core concepts

### Page profile
A small config object the whole app derives sizes from:

```
{
  pageWidthMm: 210,        // A4 portrait
  marginLeftMm: 25.4,      // Word default 2.54 cm
  marginRightMm: 25.4,
  gutterMm: 5,             // horizontal gap between images in a row
  dpi: 220                 // export density (220 matches Word's own compression target)
}
// usableWidthMm = 210 − 25.4 − 25.4 = 159.2
```

Defaults editable in a settings panel; A4/Letter presets. Set once, forget.

### Row
A horizontal band of 1–3 crop boxes (plus a 2×2 convenience that is just two 2-up
rows added at once). Each row has:

- **Row type**: 1-up / 2-up / 3-up
- **Row height preset**: e.g. Short / Standard / Tall / Portrait — each maps to a
  height in mm. (A slider or drag-handle can refine later; presets first, so
  documents stay consistent.)

From the page profile + row type + row height, each box's geometry is computed:

```
cellWidthMm  = (usableWidthMm − gutterMm × (n − 1)) / n
cellHeightMm = rowHeightPreset.mm
aspect       = cellWidthMm / cellHeightMm
exportPx     = round(mm / 25.4 × dpi)   // both dimensions
```

Worked example (A4 defaults, 220 dpi):
| Row | Cell size (mm) | Export (px) |
|---|---|---|
| 1-up, Tall (110 mm) | 159.2 × 110 | 1379 × 953 |
| 2-up, Standard (75 mm) | 77.1 × 75 | 668 × 650 |
| 2-up, Portrait (110 mm) | 77.1 × 110 | 668 × 953 |
| 3-up, Standard (75 mm) | 49.7 × 75 | 431 × 650 |

Portrait content is handled naturally: a 2-up Portrait row gives two
taller-than-wide cells. No rotation logic, no special cases — just row settings.

### Crop box (v1 logic, unchanged)
- Accepts one image via drag-and-drop **or clipboard paste** (paste is now MVP —
  the source is usually a Greenshot capture already on the clipboard).
- Pan (pointer drag) + zoom (wheel/slider), clamped so the image always fully
  covers the box: `minScale = max(boxW/imgW, boxH/imgH)`; re-clamp offsets after
  every scale change.
- Per-box caption text field underneath.
- Reset-crop and clear-image buttons.
- Paste targets the **first empty box**, so the workflow can be:
  Greenshot capture → Alt-Tab → Ctrl+V → frame it → capture next. No file explorer.

### Export bundle
Save writes, via a one-time `showDirectoryPicker` handle:

- `fig-01.jpg`, `fig-02.jpg`, … numbered in document order (row-major).
- `manifest.json`:

```json
{
  "pageProfile": { "usableWidthMm": 159.2, "gutterMm": 5, "dpi": 220 },
  "rows": [
    { "type": "2up", "images": [
      { "file": "fig-01.jpg", "widthMm": 77.1, "heightMm": 75, "caption": "North elevation prior to works" },
      { "file": "fig-02.jpg", "widthMm": 77.1, "heightMm": 75, "caption": "Detail of failed flashing" }
    ]}
  ]
}
```

The VBA macro reads this and inserts each image at `widthMm` — since the pixels
were exported at exactly that size × DPI, Word never rescales meaningfully and
every figure is pixel-consistent and evenly spaced. (If parsing JSON in VBA is
unappealing, a flat CSV with the same columns works: `file,row,widthMm,caption`.)

## Data model

```
appState = {
  pageProfile: { pageWidthMm, marginLeftMm, marginRightMm, gutterMm, dpi },
  rows: [
    {
      id, type: "1up" | "2up" | "3up",
      heightPreset: "short" | "standard" | "tall" | "portrait",
      boxes: [
        { id, imageFile: File | null, naturalWidth, naturalHeight,
          scale, offsetX, offsetY, caption: string }
      ]
    }
  ]
}
```

Box geometry (aspect, export px) is always *derived* from pageProfile + row —
never stored — so changing the gutter or DPI later re-flows everything correctly.

## Build order (validate each phase before moving on)

### Phase 1 — Single box proof of concept *(identical to v1 — this is still the heart)*
One crop box in isolation: load image (file input/drag-drop), render to canvas,
pan, zoom, **clamping** (min-scale cover + offset re-clamp on zoom), and export to
an offscreen canvas at a fixed pixel resolution independent of on-screen size,
then `canvas.toBlob()` → download. Hard-code one geometry (say 668×650 shown at
half size). Don't proceed until pan/zoom/clamp/export feels right.

### Phase 2 — Row composer
- `<CropBox>` becomes a component taking derived geometry as props.
- `<Row>` renders n boxes from row state; an "Add row" control with type +
  height-preset pickers; delete/reorder rows (up/down buttons are fine, no
  drag-and-drop needed yet).
- Page profile settings panel; geometry derivation functions with a few unit tests
  (the mm→px math is the part worth testing).

### Phase 3 — Save bundle
- File System Access API: one-time folder pick, reuse the handle each Save.
- Export all filled boxes in document order with numbered filenames + write
  `manifest.json` (and/or CSV).
- Persist the directory handle in IndexedDB so relaunches don't re-prompt.

### Phase 4 — Workflow polish
- **Clipboard paste to first empty box** (and paste onto a specific box replaces it).
- Persist session state (rows/captions, not images) in localStorage so an
  accidental close doesn't lose the layout.
- Caption fields, box labels showing final size ("77 × 75 mm"), reset buttons,
  a "New document" clear-all.

### Phase 5 — Stretch: skip the macro entirely
Generate a `.docx` directly in the browser with the `docx` npm package: one
borderless fixed-width table per row, images at exact mm sizes, caption rows
using `SEQ Figure` fields so Word auto-numbers them. The tool's output becomes
"a file you insert into your report" rather than "a folder the macro processes."
Worth doing only after Phases 1–4 prove out; the manifest+macro path already
solves the pain.

## Open decisions to confirm with the user (don't guess silently)

1. Page defaults: A4 with 2.54 cm margins assumed — match your actual report
   template's margins (this directly sets every image width).
2. Row height presets: proposed Short 55 mm / Standard 75 mm / Tall 110 mm /
   Portrait 110 mm — tune against a real report page.
3. DPI: 220 (Word's default compression target) vs 300 (print-shop quality,
   ~1.9× larger files). Suggest 220.
4. Manifest format: JSON, CSV, or both (depends on comfort editing the VBA side).
5. Filename scheme: `fig-01.jpg` sequential vs caption-derived slugs.

## Context

Downstream counterpart: existing Word VBA macro `InsertFiguresWithCaptions`.
With v2's manifest, that macro simplifies from "crop, ratio-fit, size, insert,
caption" to "insert at stated width, caption from stated text" — and Phase 5 can
retire it altogether.
