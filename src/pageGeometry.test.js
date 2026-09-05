import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROFILE,
  usableWidthMm,
  mmToPx,
  boxGeometry,
  rowCellCount,
  profileProblems,
} from './pageGeometry.js';

describe('usableWidthMm', () => {
  it('subtracts both margins from the page width', () => {
    expect(usableWidthMm(DEFAULT_PROFILE)).toBeCloseTo(159.2, 5);
  });

  it('works for arbitrary non-A4 profiles', () => {
    expect(usableWidthMm({ pageWidthMm: 200, marginLeftMm: 20, marginRightMm: 15 })).toBeCloseTo(165, 5);
  });
});

describe('mmToPx', () => {
  it('converts via inches and rounds to whole pixels', () => {
    expect(mmToPx(25.4, 220)).toBe(220);
    expect(mmToPx(75, 220)).toBe(650); // 649.6 rounds up
    expect(mmToPx(110, 220)).toBe(953); // 952.75 rounds up
  });

  it('scales with dpi', () => {
    expect(mmToPx(75, 300)).toBe(886);
  });
});

// The worked-example table from the v2 proposal (A4 defaults, 220 dpi).
describe('boxGeometry — proposal worked examples', () => {
  it.each([
    ['1up', 'tall', 159.2, 110, 1379, 953],
    ['2up', 'standard', 77.1, 75, 668, 650],
    ['2up', 'portrait', 77.1, 110, 668, 953],
    ['3up', 'standard', 49.7, 75, 431, 650],
  ])('%s %s → %s × %s mm, %s × %s px', (type, preset, wMm, hMm, wPx, hPx) => {
    const geo = boxGeometry(DEFAULT_PROFILE, type, preset);
    expect(geo.widthMm).toBeCloseTo(wMm, 1);
    expect(geo.heightMm).toBe(hMm);
    expect(geo.exportW).toBe(wPx);
    expect(geo.exportH).toBe(hPx);
  });
});

describe('boxGeometry — derives from the profile, nothing baked in', () => {
  const custom = {
    pageWidthMm: 250,
    marginLeftMm: 20,
    marginRightMm: 30,
    gutterMm: 8,
    dpi: 300,
    rowHeightsMm: { short: 40, standard: 60, tall: 90, portrait: 120 },
  };

  it('computes a 2-up cell for a custom page', () => {
    // usable = 200; (200 - 8) / 2 = 96 mm wide, 60 mm tall
    const geo = boxGeometry(custom, '2up', 'standard');
    expect(geo.widthMm).toBeCloseTo(96, 5);
    expect(geo.heightMm).toBe(60);
    expect(geo.exportW).toBe(Math.round((96 / 25.4) * 300)); // 1134
    expect(geo.exportH).toBe(Math.round((60 / 25.4) * 300)); // 709
  });

  it('a gutter change reflows cell widths', () => {
    const wide = boxGeometry({ ...custom, gutterMm: 20 }, '3up', 'short');
    // (200 - 40) / 3
    expect(wide.widthMm).toBeCloseTo(160 / 3, 5);
  });

  it('n cells plus gutters exactly fill the usable width', () => {
    for (const type of ['1up', '2up', '3up']) {
      const n = rowCellCount(type);
      const geo = boxGeometry(custom, type, 'standard');
      expect(geo.widthMm * n + custom.gutterMm * (n - 1)).toBeCloseTo(usableWidthMm(custom), 5);
    }
  });

  it('rejects unknown row types and height presets', () => {
    expect(() => boxGeometry(custom, '4up', 'standard')).toThrow();
    expect(() => boxGeometry(custom, '2up', 'huge')).toThrow();
  });
});

describe('profileProblems', () => {
  it('accepts the defaults', () => {
    expect(profileProblems(DEFAULT_PROFILE)).toEqual([]);
  });

  it('flags margins that consume the page', () => {
    const bad = { ...DEFAULT_PROFILE, marginLeftMm: 110, marginRightMm: 110 };
    expect(profileProblems(bad)).not.toEqual([]);
  });

  it('flags non-positive dpi and row heights', () => {
    expect(profileProblems({ ...DEFAULT_PROFILE, dpi: 0 })).not.toEqual([]);
    expect(
      profileProblems({ ...DEFAULT_PROFILE, rowHeightsMm: { ...DEFAULT_PROFILE.rowHeightsMm, tall: 0 } })
    ).not.toEqual([]);
  });
});
