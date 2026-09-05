import CropBox from './CropBox.jsx';
import { boxGeometry, ROW_TYPES, HEIGHT_PRESETS } from './pageGeometry.js';

export default function Row({
  row,
  index,
  rowCount,
  profile,
  pxPerMm,
  figStart, // document-order figure number of this row's first box
  pasteTargetKey, // boxKey the next Ctrl+V lands in, or null
  pasteOverrideKey, // boxKey the user explicitly aimed at, or null
  onChange,
  onDelete,
  onMove,
  onImageChange,
  onSetPasteOverride,
  onRegisterBox,
  onExtraFiles,
}) {
  const geo = boxGeometry(profile, row.type, row.heightPreset);

  return (
    <section className="row">
      <div className="row-header">
        <span className="row-title">Row {index + 1}</span>
        <select value={row.type} onChange={(e) => onChange(row.id, { type: e.target.value })} title="Images per row">
          {ROW_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <select
          value={row.heightPreset}
          onChange={(e) => onChange(row.id, { heightPreset: e.target.value })}
          title="Row height"
        >
          {HEIGHT_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({profile.rowHeightsMm[p.id]} mm)
            </option>
          ))}
        </select>
        <span className="row-size">
          {geo.widthMm.toFixed(1)} × {geo.heightMm} mm → {geo.exportW} × {geo.exportH} px each
        </span>
        <span className="row-spacer" />
        <button onClick={() => onMove(row.id, -1)} disabled={index === 0} title="Move row up">↑</button>
        <button onClick={() => onMove(row.id, 1)} disabled={index === rowCount - 1} title="Move row down">↓</button>
        <button onClick={() => onDelete(row.id)} title="Delete row">✕</button>
      </div>
      <div className="row-boxes" style={{ gap: profile.gutterMm * pxPerMm }}>
        {Array.from({ length: geo.count }, (_, i) => {
          const boxKey = `${row.id}-${i}`;
          return (
            <CropBox
              key={boxKey}
              displayW={geo.widthMm * pxPerMm}
              displayH={geo.heightMm * pxPerMm}
              exportW={geo.exportW}
              exportH={geo.exportH}
              sizeLabel={`${geo.widthMm.toFixed(1)} × ${geo.heightMm} mm`}
              figNumber={figStart + i}
              isPasteTarget={boxKey === pasteTargetKey}
              isPasteOverride={boxKey === pasteOverrideKey}
              onSetPasteTarget={(set) => onSetPasteOverride(set ? boxKey : null)}
              onImageChange={(has) => onImageChange(boxKey, has)}
              onRegister={(api) => onRegisterBox(boxKey, api)}
              onExtraFiles={(files) => onExtraFiles(boxKey, files)}
            />
          );
        })}
      </div>
    </section>
  );
}
