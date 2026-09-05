import { describe, it, expect } from 'vitest';
import { minCoverScale, clampOffset, initialView, zoomAt, reframe, sourceRect } from './cropMath.js';

const img = { w: 2000, h: 1000 };

describe('minCoverScale', () => {
  it('picks the axis that needs more magnification', () => {
    expect(minCoverScale(400, 300, 2000, 1000)).toBe(0.3); // height-limited
    expect(minCoverScale(400, 100, 2000, 1000)).toBe(0.2); // width-limited
  });
});

describe('clampOffset', () => {
  it('never lets a gap open on either edge', () => {
    // image 2000 * 0.3 = 600 wide in a 400 box → offset range [-200, 0]
    expect(clampOffset(50, 400, 2000, 0.3)).toBe(0);
    expect(clampOffset(-500, 400, 2000, 0.3)).toBe(-200);
    expect(clampOffset(-100, 400, 2000, 0.3)).toBe(-100);
  });
});

describe('initialView', () => {
  it('centers at minimum cover scale', () => {
    const v = initialView(img, { w: 400, h: 300 });
    expect(v.scale).toBe(0.3);
    expect(v.offsetX).toBe(-100); // (400 - 600) / 2
    expect(v.offsetY).toBe(0); // exact fit vertically
  });
});

describe('zoomAt', () => {
  const box = { w: 400, h: 300 };

  it('keeps the pivot point stationary', () => {
    const v = initialView(img, box);
    const z = zoomAt(v, img, box, v.scale * 2, 200, 150);
    // Source-image point under the pivot must be unchanged.
    const before = (200 - v.offsetX) / v.scale;
    const after = (200 - z.offsetX) / z.scale;
    expect(after).toBeCloseTo(before, 6);
  });

  it('clamps below minimum cover scale', () => {
    const v = initialView(img, box);
    const z = zoomAt(v, img, box, v.scale / 10, 0, 0);
    expect(z.scale).toBe(v.scale);
  });
});

describe('reframe', () => {
  const oldBox = { w: 400, h: 300 };

  it('keeps the centred image point and relative zoom when the box changes', () => {
    const v = zoomAt(initialView(img, oldBox), img, oldBox, 0.6, 200, 150);
    const newBox = { w: 600, h: 300 };
    const r = reframe(v, img, oldBox, newBox);
    // Same relative zoom above minimum cover…
    expect(r.scale / minCoverScale(newBox.w, newBox.h, img.w, img.h)).toBeCloseTo(
      v.scale / minCoverScale(oldBox.w, oldBox.h, img.w, img.h),
      6
    );
    // …and the old centre point sits at the new centre.
    const oldCx = (oldBox.w / 2 - v.offsetX) / v.scale;
    const newCx = (newBox.w / 2 - r.offsetX) / r.scale;
    expect(newCx).toBeCloseTo(oldCx, 6);
  });

  it('output is always fully clamped for the new box', () => {
    const v = { scale: 0.3, offsetX: -200, offsetY: 0 }; // panned hard left in old box
    const newBox = { w: 500, h: 400 };
    const r = reframe(v, img, oldBox, newBox);
    expect(r.offsetX).toBeLessThanOrEqual(0);
    expect(r.offsetX).toBeGreaterThanOrEqual(newBox.w - img.w * r.scale);
    expect(r.offsetY).toBeLessThanOrEqual(0);
    expect(r.offsetY).toBeGreaterThanOrEqual(newBox.h - img.h * r.scale);
    expect(r.scale).toBeGreaterThanOrEqual(minCoverScale(newBox.w, newBox.h, img.w, img.h));
  });
});

describe('sourceRect', () => {
  it('maps the visible box back to image pixels', () => {
    const box = { w: 400, h: 300 };
    const v = initialView(img, box);
    const src = sourceRect(v, box);
    expect(src.x).toBeCloseTo(1000 / 3, 6);
    expect(src.y).toBeCloseTo(0, 6);
    expect(src.w).toBeCloseTo(400 / 0.3, 6);
    expect(src.h).toBeCloseTo(1000, 6);
  });
});
