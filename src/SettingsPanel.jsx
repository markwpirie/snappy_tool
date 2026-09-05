import { useEffect, useState } from 'react';
import {
  DEFAULT_PROFILE,
  PAGE_PRESETS,
  HEIGHT_PRESETS,
  usableWidthMm,
  boxGeometry,
  profileProblems,
} from './pageGeometry.js';

// Numeric input that lets the user type freely (including a transient empty
// field) and only commits parseable positive-or-zero values upward.
function NumberField({ label, value, onCommit, min = 0, step = 0.1, unit }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  function handleChange(e) {
    setDraft(e.target.value);
    const n = Number(e.target.value);
    if (e.target.value !== '' && Number.isFinite(n) && n >= min) onCommit(n);
  }

  return (
    <label className="settings-field">
      <span>{label}</span>
      <span className="settings-input">
        <input type="number" min={min} step={step} value={draft} onChange={handleChange} onBlur={() => setDraft(String(value))} />
        {unit && <span className="settings-unit">{unit}</span>}
      </span>
    </label>
  );
}

export default function SettingsPanel({ profile, onChange }) {
  const problems = profileProblems(profile);
  const set = (patch) => onChange({ ...profile, ...patch });
  const setHeight = (id, mm) => onChange({ ...profile, rowHeightsMm: { ...profile.rowHeightsMm, [id]: mm } });

  const sample = problems.length === 0 ? boxGeometry(profile, '2up', 'standard') : null;

  return (
    <details className="settings" open>
      <summary>
        Page profile
        <span className="settings-summary-note">
          usable width {usableWidthMm(profile).toFixed(1)} mm · {profile.dpi} dpi
        </span>
      </summary>

      <div className="settings-presets">
        {PAGE_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => set({ pageWidthMm: p.pageWidthMm, marginLeftMm: p.marginLeftMm, marginRightMm: p.marginRightMm })}
          >
            {p.label}
          </button>
        ))}
        <button onClick={() => onChange({ ...DEFAULT_PROFILE, rowHeightsMm: { ...DEFAULT_PROFILE.rowHeightsMm } })}>
          Reset to defaults
        </button>
      </div>

      <div className="settings-grid">
        <NumberField label="Page width" unit="mm" value={profile.pageWidthMm} onCommit={(v) => set({ pageWidthMm: v })} />
        <NumberField label="Left margin" unit="mm" value={profile.marginLeftMm} onCommit={(v) => set({ marginLeftMm: v })} />
        <NumberField label="Right margin" unit="mm" value={profile.marginRightMm} onCommit={(v) => set({ marginRightMm: v })} />
        <NumberField label="Gutter" unit="mm" value={profile.gutterMm} onCommit={(v) => set({ gutterMm: v })} />
        <NumberField label="Export density" unit="dpi" value={profile.dpi} step={1} onCommit={(v) => set({ dpi: v })} />
      </div>

      <div className="settings-grid">
        {HEIGHT_PRESETS.map((p) => (
          <NumberField
            key={p.id}
            label={`${p.label} row`}
            unit="mm"
            value={profile.rowHeightsMm[p.id]}
            onCommit={(v) => setHeight(p.id, v)}
          />
        ))}
      </div>

      {problems.length > 0 ? (
        <div className="settings-problems">
          {problems.map((p) => (
            <div key={p}>⚠ {p}</div>
          ))}
        </div>
      ) : (
        <div className="settings-sample">
          e.g. a 2-up Standard cell is {sample.widthMm.toFixed(1)} × {sample.heightMm} mm → exports at{' '}
          {sample.exportW} × {sample.exportH} px
        </div>
      )}
    </details>
  );
}
