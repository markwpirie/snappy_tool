import CropBox from './CropBox.jsx';

// Phase 1: one hard-coded geometry — the 2-up Standard cell (668 × 650 px
// export), shown on screen at half size. Derivation from the page profile
// arrives in Phase 2.
const EXPORT_W = 668;
const EXPORT_H = 650;

export default function App() {
  return (
    <main className="app">
      <h1>Snappy Tool</h1>
      <p className="phase-note">
        Phase 1 — single crop box. 2-up Standard cell (77.1 × 75 mm @ 220 dpi), displayed at half size.
        Drag to pan, wheel or slider to zoom; the image always fully covers the box.
      </p>
      <CropBox displayW={EXPORT_W / 2} displayH={EXPORT_H / 2} exportW={EXPORT_W} exportH={EXPORT_H} />
    </main>
  );
}
