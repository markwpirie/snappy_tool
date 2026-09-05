// Pure page-geometry derivation. No DOM, no React — unit-testable.
//
// Every box size in the app is computed from the pageProfile at runtime.
// Nothing here (or anywhere else) may hard-code A4 numbers — documents come
// from templates the user doesn't control, so the profile is fully editable.

export const MM_PER_INCH = 25.4;

export const ROW_TYPES = [
  { id: '1up', label: '1-up', count: 1 },
  { id: '2up', label: '2-up', count: 2 },
  { id: '3up', label: '3-up', count: 3 },
];

export const HEIGHT_PRESETS = [
  { id: 'short', label: 'Short' },
  { id: 'standard', label: 'Standard' },
  { id: 'tall', label: 'Tall' },
  { id: 'portrait', label: 'Portrait' },
];

// A4 with Word-default 2.54 cm margins — the accepted starting defaults,
// editable in the settings panel.
export const DEFAULT_PROFILE = {
  pageWidthMm: 210,
  marginLeftMm: 25.4,
  marginRightMm: 25.4,
  gutterMm: 5,
  dpi: 220,
  rowHeightsMm: { short: 55, standard: 75, tall: 110, portrait: 110 },
};

// Presets only touch the page dimensions/margins; gutter, dpi and row
// heights are the user's own choices and survive a preset click.
export const PAGE_PRESETS = [
  { id: 'a4', label: 'A4', pageWidthMm: 210, marginLeftMm: 25.4, marginRightMm: 25.4 },
  { id: 'letter', label: 'Letter', pageWidthMm: 215.9, marginLeftMm: 25.4, marginRightMm: 25.4 },
];

export function rowCellCount(rowTypeId) {
  const type = ROW_TYPES.find((t) => t.id === rowTypeId);
  if (!type) throw new Error(`Unknown row type: ${rowTypeId}`);
  return type.count;
}

export function usableWidthMm(profile) {
  return profile.pageWidthMm - profile.marginLeftMm - profile.marginRightMm;
}

export function mmToPx(mm, dpi) {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

// Geometry of one cell in a row: exact mm size (unrounded, so reflows stay
// consistent) plus the export resolution in whole pixels.
export function boxGeometry(profile, rowTypeId, heightPresetId) {
  const count = rowCellCount(rowTypeId);
  const heightMm = profile.rowHeightsMm[heightPresetId];
  if (heightMm == null) throw new Error(`Unknown height preset: ${heightPresetId}`);
  const widthMm = (usableWidthMm(profile) - profile.gutterMm * (count - 1)) / count;
  return {
    count,
    widthMm,
    heightMm,
    exportW: mmToPx(widthMm, profile.dpi),
    exportH: mmToPx(heightMm, profile.dpi),
  };
}

// A profile is usable when even its narrowest cell (3-up) has positive width
// and the numbers make physical sense.
export function profileProblems(profile) {
  const problems = [];
  if (!(profile.pageWidthMm > 0)) problems.push('Page width must be positive.');
  if (profile.marginLeftMm < 0 || profile.marginRightMm < 0) problems.push('Margins cannot be negative.');
  if (profile.gutterMm < 0) problems.push('Gutter cannot be negative.');
  if (!(profile.dpi > 0)) problems.push('DPI must be positive.');
  for (const preset of HEIGHT_PRESETS) {
    if (!(profile.rowHeightsMm[preset.id] > 0)) problems.push(`${preset.label} row height must be positive.`);
  }
  const usable = usableWidthMm(profile);
  if (problems.length === 0 && !((usable - profile.gutterMm * 2) / 3 > 0)) {
    problems.push('Margins and gutter leave no usable width for a 3-up row.');
  }
  return problems;
}
