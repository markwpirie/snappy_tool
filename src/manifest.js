import { boxGeometry, rowCellCount, usableWidthMm } from './pageGeometry.js';

// Filenames are document-order figure numbers. A box keeps its number even if
// earlier boxes are empty, so on-screen fig labels and exported names agree.
export const figName = (n) => `fig-${String(n).padStart(2, '0')}.jpg`;

// The save bundle's manifest.json, consumed by the Word VBA macro
// (InsertFiguresWithCaptions): it inserts each file at the stated widthMm, so
// Word never rescales meaningfully. Pure so it's unit-testable. `captions` is
// a boxKey → text map; omit it (or leave a box out of it) for an empty caption.
export function buildManifest(profile, rows, filledKeys, generated, captions = {}) {
  let fig = 1;
  const outRows = [];
  for (const row of rows) {
    const geo = boxGeometry(profile, row.type, row.heightPreset);
    const images = [];
    for (let i = 0; i < geo.count; i++) {
      const n = fig++;
      const key = `${row.id}-${i}`;
      if (!filledKeys.has(key)) continue;
      images.push({
        file: figName(n),
        widthMm: Number(geo.widthMm.toFixed(2)),
        heightMm: geo.heightMm,
        caption: captions[key] ?? '',
      });
    }
    if (images.length > 0) outRows.push({ type: row.type, heightPreset: row.heightPreset, images });
  }
  return {
    generated,
    pageProfile: {
      pageWidthMm: profile.pageWidthMm,
      marginLeftMm: profile.marginLeftMm,
      marginRightMm: profile.marginRightMm,
      usableWidthMm: Number(usableWidthMm(profile).toFixed(2)),
      gutterMm: profile.gutterMm,
      dpi: profile.dpi,
    },
    rows: outRows,
  };
}

// Document-order figure number for every current box key, filled or not.
export function figNumbers(rows) {
  const map = new Map();
  let fig = 1;
  for (const row of rows) {
    for (let i = 0; i < rowCellCount(row.type); i++) map.set(`${row.id}-${i}`, fig++);
  }
  return map;
}
