import { useEffect, useRef, useState } from 'react';
import { initialView, minCoverScale, clampOffset, zoomAt, reframe, sourceRect } from './cropMath.js';
import { properCaseCaption } from './captionCase.js';

export default function CropBox({
  displayW,
  displayH,
  exportW,
  exportH,
  sizeLabel,
  figNumber,
  isPasteTarget,
  isPasteOverride,
  photoDir,
  caption,
  onCaptionChange,
  onSetPasteTarget,
  onImageChange,
  onRegister,
  onExtraFiles, // called with files beyond the first from a multi-pick/drop
}) {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragRef = useRef(null); // { pointerId, lastX, lastY } while panning
  const [image, setImage] = useState(null); // { el, w, h }
  const [view, setView] = useState(null); // { scale, offsetX, offsetY }
  const [dragOver, setDragOver] = useState(false);

  const box = { w: displayW, h: displayH };

  function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      const img = { el, w: el.naturalWidth, h: el.naturalHeight };
      setImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.el.src);
        return img;
      });
      setView(initialView(img, box));
      onImageChange?.(true);
    };
    el.src = url;
  }

  // A multi-select or multi-file drop: first image lands here, the rest are
  // handed up to App to flow into the following empty boxes.
  function acceptFiles(fileList) {
    const files = [...fileList].filter((f) => f && f.type.startsWith('image/'));
    if (files.length === 0) return;
    loadFile(files[0]);
    if (files.length > 1) onExtraFiles?.(files.slice(1));
  }

  // File picker. showOpenFilePicker's `id` makes Edge/Chrome reopen the
  // last-used directory for that id across sessions — the "remember my photo
  // folder" behavior — and allows multi-select. Hidden input is the fallback.
  async function pickFiles() {
    if (!window.showOpenFilePicker) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const opts = {
        multiple: true,
        types: [
          {
            description: 'Images',
            accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'] },
          },
        ],
      };
      // A pinned folder beats the browser's own last-used memory (`id`),
      // which can latch onto temp folders (e.g. macOS Photos-library picks).
      if (photoDir) opts.startIn = photoDir;
      else opts.id = 'snappy-photos';
      const handles = await window.showOpenFilePicker(opts);
      acceptFiles(await Promise.all(handles.map((h) => h.getFile())));
    } catch (err) {
      if (err?.name === 'AbortError') return; // user cancelled the picker
      console.error('showOpenFilePicker failed, falling back to file input', err);
      fileInputRef.current?.click();
    }
  }

  // When the page profile or row settings resize this box, carry the user's
  // framing across instead of resetting it.
  const prevBoxRef = useRef(box);
  useEffect(() => {
    const prev = prevBoxRef.current;
    prevBoxRef.current = { w: displayW, h: displayH };
    if (!image || (prev.w === displayW && prev.h === displayH)) return;
    setView((v) => v && reframe(v, image, prev, { w: displayW, h: displayH }));
  }, [displayW, displayH, image]);

  // Redraw the visible canvas whenever the view changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displayW, displayH);
    if (image && view) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image.el, view.offsetX, view.offsetY, image.w * view.scale, image.h * view.scale);
    }
  }, [image, view, displayW, displayH]);

  // Ctrl+V anywhere on the page loads a clipboard image (e.g. a Greenshot
  // capture) into the first empty box in document order — App marks that box
  // via isPasteTarget so exactly one box handles the event.
  useEffect(() => {
    if (!isPasteTarget) return;
    function onPaste(e) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      if (!item) return;
      e.preventDefault();
      loadFile(item.getAsFile());
      // A manually aimed paste is one-shot: revert to first-empty afterwards.
      if (isPasteOverride) onSetPasteTarget?.(false);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [isPasteTarget, isPasteOverride, displayW, displayH]);

  // The original file, not the cropped render — lets a box that inherits
  // this image (e.g. a row shrink bumping it to a new row) fit its own crop
  // against full source detail instead of re-cropping an already-tight one.
  async function getSourceBlob() {
    if (!image) return null;
    const res = await fetch(image.el.src);
    return res.blob();
  }

  // Expose an imperative export handle so App's "Export all" can walk the
  // boxes in document order.
  useEffect(() => {
    onRegister?.({ export: exportImage, exportBlob: renderBlob, getSourceBlob, loadFile });
    return () => onRegister?.(null);
  });

  // Wheel zoom needs a non-passive listener to preventDefault page scroll.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function onWheel(e) {
      e.preventDefault();
      if (!image) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => v && zoomAt(v, image, box, v.scale * Math.exp(-e.deltaY * 0.0015), px, py));
    }
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [image, displayW, displayH]);

  function onPointerDown(e) {
    // Empty box opens the picker from onClick — showOpenFilePicker needs the
    // user-activation grant, which pointerdown doesn't reliably carry.
    if (!image) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
  }

  function onPointerMove(e) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !image) return;
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    setView((v) =>
      v && {
        scale: v.scale,
        offsetX: clampOffset(v.offsetX + dx, box.w, image.w, v.scale),
        offsetY: clampOffset(v.offsetY + dy, box.h, image.h, v.scale),
      }
    );
  }

  function onPointerUp(e) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }

  function onSliderChange(e) {
    if (!image) return;
    const newScale = Number(e.target.value);
    setView((v) => v && zoomAt(v, image, box, newScale, box.w / 2, box.h / 2));
  }

  function resetCrop() {
    if (image) setView(initialView(image, box));
  }

  function clearImage() {
    if (image) URL.revokeObjectURL(image.el.src);
    setImage(null);
    setView(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onImageChange?.(false);
  }

  // Render the crop at export resolution as a JPEG blob. "Export all" writes
  // these straight into the save folder; the per-box button downloads one.
  function renderBlob() {
    if (!image || !view) return Promise.resolve(null);
    const out = document.createElement('canvas');
    out.width = exportW;
    out.height = exportH;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const src = sourceRect(view, box);
    ctx.drawImage(image.el, src.x, src.y, src.w, src.h, 0, 0, exportW, exportH);
    return new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', 0.92));
  }

  async function exportImage() {
    const blob = await renderBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fig-${String(figNumber ?? 1).padStart(2, '0')}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const min = image ? minCoverScale(box.w, box.h, image.w, image.h) : 1;

  return (
    <div className="cropbox">
      <div
        className={`cropbox-frame${dragOver ? ' drag-over' : ''}${isPasteTarget ? ' paste-target' : ''}`}
        style={{ width: displayW, height: displayH }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          acceptFiles(e.dataTransfer.files);
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: displayW, height: displayH, cursor: image ? 'grab' : 'pointer', touchAction: 'none' }}
          onClick={() => {
            if (!image) pickFiles();
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {!image && (
          <div className="cropbox-placeholder">
            {isPasteTarget ? <>Paste (Ctrl+V),<br />drop, or click</> : <>Drop images<br />or click to choose</>}
          </div>
        )}
        {figNumber != null && <div className="cropbox-fig">fig-{String(figNumber).padStart(2, '0')}</div>}
        <button
          className={`paste-target-btn${isPasteTarget ? ' active' : ''}`}
          title={
            isPasteTarget
              ? isPasteOverride
                ? 'Next Ctrl+V pastes here (click to revert to first empty box)'
                : 'Next Ctrl+V pastes here'
              : 'Send the next Ctrl+V paste to this box'
          }
          onClick={() => onSetPasteTarget?.(!isPasteOverride)}
        >
          {isPasteTarget ? 'Ctrl+V →' : '⌖'}
        </button>
      </div>

      <div className="cropbox-controls" style={{ width: displayW }}>
        <label className="zoom-row">
          <input
            type="range"
            min={min}
            max={min * 8}
            step="any"
            value={view ? view.scale : min}
            disabled={!image}
            onChange={onSliderChange}
            title="Zoom"
          />
          <span className="zoom-label">{view ? `${Math.round((view.scale / min) * 100)}%` : '—'}</span>
        </label>
        <div className="button-row">
          <button onClick={resetCrop} disabled={!image} title="Reset crop">Reset</button>
          <button onClick={clearImage} disabled={!image} title="Remove image">Clear</button>
          <button className="primary" onClick={exportImage} disabled={!image} title={`Export ${exportW} × ${exportH} px JPEG`}>
            Export
          </button>
        </div>
        {sizeLabel && <div className="cropbox-size">{sizeLabel}</div>}
        <input
          type="text"
          className="caption-input"
          placeholder="Caption…"
          value={caption ?? ''}
          onChange={(e) => onCaptionChange?.(e.target.value)}
          onBlur={(e) => onCaptionChange?.(properCaseCaption(e.target.value))}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => acceptFiles(e.target.files)}
      />
    </div>
  );
}
