// Pure geometry helpers for the crop box. No DOM, no React — unit-testable.

// Smallest scale at which the image still fully covers the box.
export function minCoverScale(boxW, boxH, imgW, imgH) {
  return Math.max(boxW / imgW, boxH / imgH);
}

// Clamp one offset axis so no gap opens between image edge and box edge.
// Offsets are the image top-left in box coordinates, so valid values are
// [boxDim - imgDim * scale, 0].
export function clampOffset(offset, boxDim, imgDim, scale) {
  return Math.min(0, Math.max(boxDim - imgDim * scale, offset));
}

// Zoom keeping the image point under (pivotX, pivotY) stationary.
// Returns the new, fully clamped view state.
export function zoomAt(view, img, box, newScaleRaw, pivotX, pivotY) {
  const min = minCoverScale(box.w, box.h, img.w, img.h);
  const newScale = Math.max(min, Math.min(newScaleRaw, min * 8));
  const ratio = newScale / view.scale;
  const offsetX = pivotX - (pivotX - view.offsetX) * ratio;
  const offsetY = pivotY - (pivotY - view.offsetY) * ratio;
  return {
    scale: newScale,
    offsetX: clampOffset(offsetX, box.w, img.w, newScale),
    offsetY: clampOffset(offsetY, box.h, img.h, newScale),
  };
}

// Initial view: minimum cover scale, image centered in the box.
export function initialView(img, box) {
  const scale = minCoverScale(box.w, box.h, img.w, img.h);
  return {
    scale,
    offsetX: clampOffset((box.w - img.w * scale) / 2, box.w, img.w, scale),
    offsetY: clampOffset((box.h - img.h * scale) / 2, box.h, img.h, scale),
  };
}

// Re-fit an existing view when the box changes size (page profile edits,
// row type/height changes). Preserves the user's framing: the image point at
// the box centre stays centred, and the zoom level relative to minimum cover
// is kept, then everything is re-clamped for the new box.
export function reframe(view, img, oldBox, newBox) {
  const oldMin = minCoverScale(oldBox.w, oldBox.h, img.w, img.h);
  const newMin = minCoverScale(newBox.w, newBox.h, img.w, img.h);
  const scale = Math.min(newMin * (view.scale / oldMin), newMin * 8);
  const srcCx = (oldBox.w / 2 - view.offsetX) / view.scale;
  const srcCy = (oldBox.h / 2 - view.offsetY) / view.scale;
  return {
    scale,
    offsetX: clampOffset(newBox.w / 2 - srcCx * scale, newBox.w, img.w, scale),
    offsetY: clampOffset(newBox.h / 2 - srcCy * scale, newBox.h, img.h, scale),
  };
}

// Region of the source image visible in the box, in image pixels.
// Used for the export draw call.
export function sourceRect(view, box) {
  return {
    x: -view.offsetX / view.scale,
    y: -view.offsetY / view.scale,
    w: box.w / view.scale,
    h: box.h / view.scale,
  };
}
