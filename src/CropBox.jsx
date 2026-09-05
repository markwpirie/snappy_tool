import { useEffect, useRef, useState } from 'react';
import { initialView, minCoverScale, clampOffset, zoomAt, sourceRect } from './cropMath.js';

export default function CropBox({ displayW, displayH, exportW, exportH }) {
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
    };
    el.src = url;
  }

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

  // Ctrl+V anywhere on the page loads a clipboard image (e.g. a Greenshot capture).
  useEffect(() => {
    function onPaste(e) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      if (!item) return;
      e.preventDefault();
      loadFile(item.getAsFile());
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

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
    if (!image) {
      fileInputRef.current?.click();
      return;
    }
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
  }

  function exportImage() {
    if (!image || !view) return;
    const out = document.createElement('canvas');
    out.width = exportW;
    out.height = exportH;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const src = sourceRect(view, box);
    ctx.drawImage(image.el, src.x, src.y, src.w, src.h, 0, 0, exportW, exportH);
    out.toBlob(
      (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fig-01-${exportW}x${exportH}.jpg`;
        a.click();
        URL.revokeObjectURL(url);
      },
      'image/jpeg',
      0.92
    );
  }

  const min = image ? minCoverScale(box.w, box.h, image.w, image.h) : 1;

  return (
    <div className="cropbox">
      <div
        className={`cropbox-frame${dragOver ? ' drag-over' : ''}`}
        style={{ width: displayW, height: displayH }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          loadFile(e.dataTransfer.files[0]);
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: displayW, height: displayH, cursor: image ? 'grab' : 'pointer', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {!image && <div className="cropbox-placeholder">Paste (Ctrl+V), drop an image,<br />or click to choose</div>}
      </div>

      <div className="cropbox-controls">
        <label className="zoom-row">
          Zoom
          <input
            type="range"
            min={min}
            max={min * 8}
            step="any"
            value={view ? view.scale : min}
            disabled={!image}
            onChange={onSliderChange}
          />
          <span className="zoom-label">{view ? `${Math.round((view.scale / min) * 100)}%` : '—'}</span>
        </label>
        <div className="button-row">
          <button onClick={() => fileInputRef.current?.click()}>Choose image…</button>
          <button onClick={resetCrop} disabled={!image}>Reset crop</button>
          <button onClick={clearImage} disabled={!image}>Clear</button>
          <button className="primary" onClick={exportImage} disabled={!image}>
            Export {exportW} × {exportH} px
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => loadFile(e.target.files[0])}
      />
    </div>
  );
}
