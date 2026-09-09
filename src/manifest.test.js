import { describe, it, expect } from 'vitest';
import { batchIdFromIso, buildManifest, figName, figNumbers, manifestName } from './manifest.js';
import { DEFAULT_PROFILE } from './pageGeometry.js';

const WHEN = '2026-09-05T12:00:00.000Z';
const BATCH = batchIdFromIso(WHEN);

describe('batchIdFromIso', () => {
  it('strips punctuation and milliseconds into a filename-safe id', () => {
    expect(batchIdFromIso(WHEN)).toBe('20260905-120000');
  });
});

describe('figName', () => {
  it('zero-pads to two digits, scoped to a batch id', () => {
    expect(figName(BATCH, 1)).toBe(`fig-${BATCH}-01.jpg`);
    expect(figName(BATCH, 12)).toBe(`fig-${BATCH}-12.jpg`);
  });
});

describe('manifestName', () => {
  it('scopes the manifest filename to a batch id', () => {
    expect(manifestName(BATCH)).toBe(`manifest-${BATCH}.json`);
  });
});

describe('figNumbers', () => {
  it('numbers every box in document order regardless of fill', () => {
    const rows = [
      { id: 1, type: '2up', heightPreset: 'standard' },
      { id: 2, type: '3up', heightPreset: 'short' },
    ];
    const map = figNumbers(rows);
    expect(map.get('1-0')).toBe(1);
    expect(map.get('1-1')).toBe(2);
    expect(map.get('2-0')).toBe(3);
    expect(map.get('2-2')).toBe(5);
    expect(map.size).toBe(5);
  });
});

describe('buildManifest', () => {
  const rows = [
    { id: 1, type: '2up', heightPreset: 'standard' },
    { id: 2, type: '1up', heightPreset: 'tall' },
  ];

  it('matches the proposal worked example for a full 2-up standard row', () => {
    const m = buildManifest(DEFAULT_PROFILE, rows.slice(0, 1), new Set(['1-0', '1-1']), WHEN);
    expect(m.generated).toBe(WHEN);
    expect(m.batchId).toBe(BATCH);
    expect(m.pageProfile).toEqual({
      pageWidthMm: 210,
      marginLeftMm: 25.4,
      marginRightMm: 25.4,
      usableWidthMm: 159.2,
      gutterMm: 5,
      dpi: 220,
    });
    expect(m.rows).toEqual([
      {
        type: '2up',
        heightPreset: 'standard',
        images: [
          { file: `fig-${BATCH}-01.jpg`, widthMm: 77.1, heightMm: 75, caption: '' },
          { file: `fig-${BATCH}-02.jpg`, widthMm: 77.1, heightMm: 75, caption: '' },
        ],
      },
    ]);
  });

  it('skips empty boxes but keeps their figure numbers', () => {
    const m = buildManifest(DEFAULT_PROFILE, rows, new Set(['1-1', '2-0']), WHEN);
    expect(m.rows).toHaveLength(2);
    expect(m.rows[0].images).toEqual([{ file: `fig-${BATCH}-02.jpg`, widthMm: 77.1, heightMm: 75, caption: '' }]);
    expect(m.rows[1].images).toEqual([{ file: `fig-${BATCH}-03.jpg`, widthMm: 159.2, heightMm: 110, caption: '' }]);
  });

  it('omits rows with no filled boxes', () => {
    const m = buildManifest(DEFAULT_PROFILE, rows, new Set(['2-0']), WHEN);
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].type).toBe('1up');
  });

  it('fills in caption text by boxKey, defaulting to empty', () => {
    const m = buildManifest(DEFAULT_PROFILE, rows.slice(0, 1), new Set(['1-0', '1-1']), WHEN, {
      '1-0': 'North elevation prior to works',
    });
    expect(m.rows[0].images[0].caption).toBe('North elevation prior to works');
    expect(m.rows[0].images[1].caption).toBe('');
  });

  it('derives sizes from a custom profile, not baked-in A4', () => {
    const profile = {
      ...DEFAULT_PROFILE,
      pageWidthMm: 215.9,
      marginLeftMm: 20,
      marginRightMm: 20,
      gutterMm: 4,
      dpi: 300,
      rowHeightsMm: { ...DEFAULT_PROFILE.rowHeightsMm, standard: 80 },
    };
    const m = buildManifest(profile, rows.slice(0, 1), new Set(['1-0']), WHEN);
    expect(m.pageProfile.usableWidthMm).toBe(175.9);
    expect(m.rows[0].images[0]).toEqual({ file: `fig-${BATCH}-01.jpg`, widthMm: 85.95, heightMm: 80, caption: '' });
  });
});
