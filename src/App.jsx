import { useEffect, useRef, useState } from 'react';
import Row from './Row.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import { DEFAULT_PROFILE, ROW_TYPES, HEIGHT_PRESETS, rowCellCount, profileProblems } from './pageGeometry.js';
import { planImport } from './importPlan.js';
import { buildManifest, figName, figNumbers } from './manifest.js';
import { idbGet, idbSet, idbDelete } from './idb.js';

// On-screen scale: how many CSS px represent one page mm. Purely cosmetic —
// export resolution comes from the profile's dpi, never from this.
const DISPLAY_PX_PER_MM = 4;

let nextRowId = 1;
const newRow = (type, heightPreset) => ({ id: nextRowId++, type, heightPreset });

export default function App() {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [rows, setRows] = useState([newRow('2up', 'standard')]);
  const [filledBoxes, setFilledBoxes] = useState(() => new Set()); // boxKeys currently holding an image
  const [addType, setAddType] = useState('2up');
  const [addHeight, setAddHeight] = useState('standard');
  const [pasteOverride, setPasteOverride] = useState(null); // boxKey the user aimed Ctrl+V at
  const [exporting, setExporting] = useState(false);
  const [pendingImport, setPendingImport] = useState(null); // { afterKey, files } from a multi-pick

  // Pinned photo folder: the file picker opens here instead of wherever the
  // browser last remembered. Persisted as a directory handle in IndexedDB.
  const [photoDir, setPhotoDir] = useState(null);
  useEffect(() => {
    idbGet('photoDir')
      .then((handle) => handle && setPhotoDir(handle))
      .catch(() => {});
  }, []);

  async function choosePhotoDir() {
    try {
      const handle = await window.showDirectoryPicker({ id: 'snappy-photo-dir' });
      setPhotoDir(handle);
      await idbSet('photoDir', handle);
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('choosing photo folder failed', err);
    }
  }

  function clearPhotoDir() {
    setPhotoDir(null);
    idbDelete('photoDir').catch(() => {});
  }

  // Save folder: where "Export all" writes fig-NN.jpg + manifest.json.
  // Picked once (or on the first export), persisted like the photo folder.
  const [saveDir, setSaveDir] = useState(null);
  const [exportStatus, setExportStatus] = useState(null); // { ok, text }
  useEffect(() => {
    idbGet('saveDir')
      .then((handle) => handle && setSaveDir(handle))
      .catch(() => {});
  }, []);

  async function pickSaveDir() {
    const handle = await window.showDirectoryPicker({ id: 'snappy-save-dir', mode: 'readwrite' });
    setSaveDir(handle);
    idbSet('saveDir', handle).catch(() => {});
    return handle;
  }

  async function chooseSaveDir() {
    try {
      await pickSaveDir();
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('choosing save folder failed', err);
    }
  }

  function clearSaveDir() {
    setSaveDir(null);
    idbDelete('saveDir').catch(() => {});
  }

  // A handle restored from IndexedDB comes back with its permission reset to
  // "prompt" — re-requesting inside the Export-all click keeps the activation.
  async function hasWritePermission(handle) {
    try {
      if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
      return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
    } catch {
      return false;
    }
  }

  const boxApis = useRef(new Map()); // boxKey → { export, exportBlob, loadFile }

  // Theme: 'system' follows the OS; 'light'/'dark' pin it via data-theme.
  // A ?theme= URL param wins over the stored choice.
  const [theme, setTheme] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('theme');
    if (['system', 'light', 'dark'].includes(fromUrl)) return fromUrl;
    try {
      return localStorage.getItem('snappy-theme') || 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      localStorage.setItem('snappy-theme', theme);
    } catch {
      // private mode etc. — theme just won't persist
    }
  }, [theme]);

  const problems = profileProblems(profile);

  function addRow() {
    setRows((rs) =>
      addType === '2x2'
        ? [...rs, newRow('2up', addHeight), newRow('2up', addHeight)]
        : [...rs, newRow(addType, addHeight)]
    );
  }

  function updateRow(id, patch) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (patch.type) {
      // Boxes beyond the new count unmount and lose their image.
      const count = rowCellCount(patch.type);
      setFilledBoxes((prev) => new Set([...prev].filter((k) => !k.startsWith(`${id}-`) || Number(k.split('-')[1]) < count)));
    }
  }

  function deleteRow(id) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const hasImages = Array.from({ length: rowCellCount(row.type) }, (_, i) => `${id}-${i}`).some((k) => filledBoxes.has(k));
    if (hasImages && !window.confirm('This row contains images. Delete it anyway?')) return;
    setRows((rs) => rs.filter((r) => r.id !== id));
    setFilledBoxes((prev) => new Set([...prev].filter((k) => !k.startsWith(`${id}-`))));
  }

  function moveRow(id, dir) {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function onImageChange(boxKey, has) {
    setFilledBoxes((prev) => {
      const next = new Set(prev);
      has ? next.add(boxKey) : next.delete(boxKey);
      return next;
    });
  }

  function registerBox(boxKey, api) {
    if (api) boxApis.current.set(boxKey, api);
    else boxApis.current.delete(boxKey);
  }

  // Document-order keys of every current box.
  const allBoxKeys = rows.flatMap((row) =>
    Array.from({ length: rowCellCount(row.type) }, (_, i) => `${row.id}-${i}`)
  );

  // Clipboard pastes land in the explicitly aimed box if one is set (and
  // still exists), otherwise the first empty box in document order.
  const overrideValid = pasteOverride != null && allBoxKeys.includes(pasteOverride);
  const pasteTargetKey = overrideValid ? pasteOverride : allBoxKeys.find((k) => !filledBoxes.has(k)) ?? null;

  // Distribute a multi-pick's overflow files into empty boxes after the box
  // that took the first file, appending rows (of the add-row bar's current
  // shape) when the document runs out. Runs as an effect so freshly added
  // rows have mounted and registered their loadFile handles.
  const addTypeEffective = addType === '2x2' ? '2up' : addType;
  useEffect(() => {
    if (!pendingImport) return;
    const plan = planImport(
      allBoxKeys,
      filledBoxes,
      pendingImport.afterKey,
      pendingImport.files.length,
      rowCellCount(addTypeEffective)
    );
    plan.assignments.forEach((key, i) => boxApis.current.get(key)?.loadFile(pendingImport.files[i]));
    const remaining = pendingImport.files.slice(plan.assignments.length);
    if (remaining.length === 0) {
      setPendingImport(null);
      return;
    }
    setPendingImport({
      afterKey: plan.assignments[plan.assignments.length - 1] ?? pendingImport.afterKey,
      files: remaining,
    });
    setRows((rs) => [...rs, ...Array.from({ length: plan.rowsToAdd }, () => newRow(addTypeEffective, addHeight))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImport, rows]);

  async function exportAll() {
    setExporting(true);
    setExportStatus(null);
    try {
      if (!window.showDirectoryPicker) {
        await exportAllViaDownloads();
        return;
      }

      // Reuse the persisted folder if it's still writable; otherwise (first
      // export, revoked permission, deleted folder) prompt for one now — the
      // click gives us the user activation both pickers and prompts need.
      let dir = saveDir;
      if (dir && !(await hasWritePermission(dir))) dir = null;
      try {
        if (!dir) dir = await pickSaveDir();
      } catch (err) {
        if (err?.name === 'AbortError') return;
        throw err;
      }

      const figs = figNumbers(rows);
      let count = 0;
      for (const key of allBoxKeys) {
        if (!filledBoxes.has(key)) continue;
        const blob = await boxApis.current.get(key)?.exportBlob();
        if (!blob) continue;
        await writeToDir(dir, figName(figs.get(key)), blob);
        count++;
      }
      const manifest = buildManifest(profile, rows, filledBoxes, new Date().toISOString());
      await writeToDir(dir, 'manifest.json', new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
      setExportStatus({ ok: true, text: `Saved ${count} image${count === 1 ? '' : 's'} + manifest.json to “${dir.name}”` });
    } catch (err) {
      console.error('export all failed', err);
      setExportStatus({ ok: false, text: 'Export failed — see the browser console for details.' });
    } finally {
      setExporting(false);
    }
  }

  async function writeToDir(dir, name, blob) {
    const fileHandle = await dir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  // No File System Access API (e.g. Firefox/Safari): fall back to one download
  // per image, sequential with a gap so the browser treats them separately,
  // plus the manifest as a download of its own.
  async function exportAllViaDownloads() {
    let count = 0;
    for (const key of allBoxKeys) {
      if (!filledBoxes.has(key)) continue;
      await boxApis.current.get(key)?.export();
      count++;
      await new Promise((r) => setTimeout(r, 350));
    }
    const manifest = buildManifest(profile, rows, filledBoxes, new Date().toISOString());
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'manifest.json';
    a.click();
    URL.revokeObjectURL(url);
    setExportStatus({ ok: true, text: `Downloaded ${count} image${count === 1 ? '' : 's'} + manifest.json` });
  }

  // Document-order figure number of each row's first box.
  const figStarts = [];
  let fig = 1;
  for (const row of rows) {
    figStarts.push(fig);
    fig += rowCellCount(row.type);
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>Snappy Tool</h1>
        <button className="theme-toggle" onClick={() => setTheme((t) => (t === 'system' ? 'dark' : t === 'dark' ? 'light' : 'system'))} title="Cycle color theme">
          {theme === 'system' ? '◐ Auto' : theme === 'dark' ? '● Dark' : '○ Light'}
        </button>
      </header>
      <p className="phase-note">
        Phase 3 — save bundle. Every cell's shape and export resolution derive from the page profile below.
        Paste (Ctrl+V) fills the first empty box, or aim it with a box's ⌖ button. Export all writes
        fig-NN.jpg + manifest.json straight into your save folder.
      </p>

      <SettingsPanel
        profile={profile}
        onChange={setProfile}
        photoDir={photoDir}
        onChoosePhotoDir={choosePhotoDir}
        onClearPhotoDir={clearPhotoDir}
        saveDir={saveDir}
        onChooseSaveDir={chooseSaveDir}
        onClearSaveDir={clearSaveDir}
      />

      {problems.length === 0 ? (
        <>
          <div className="rows">
            {rows.map((row, index) => (
              <Row
                key={row.id}
                row={row}
                index={index}
                rowCount={rows.length}
                profile={profile}
                pxPerMm={DISPLAY_PX_PER_MM}
                photoDir={photoDir}
                figStart={figStarts[index]}
                pasteTargetKey={pasteTargetKey}
                pasteOverrideKey={overrideValid ? pasteOverride : null}
                onChange={updateRow}
                onDelete={deleteRow}
                onMove={moveRow}
                onImageChange={onImageChange}
                onSetPasteOverride={setPasteOverride}
                onRegisterBox={registerBox}
                onExtraFiles={(boxKey, files) =>
                  setPendingImport((prev) =>
                    prev ? { ...prev, files: [...prev.files, ...files] } : { afterKey: boxKey, files }
                  )
                }
              />
            ))}
          </div>

          <div className="add-row">
            <span>Add row:</span>
            <select value={addType} onChange={(e) => setAddType(e.target.value)}>
              {ROW_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
              <option value="2x2">2×2 (two 2-up rows)</option>
            </select>
            <select value={addHeight} onChange={(e) => setAddHeight(e.target.value)}>
              {HEIGHT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({profile.rowHeightsMm[p.id]} mm)
                </option>
              ))}
            </select>
            <button className="primary" onClick={addRow}>Add</button>
            <span className="row-spacer" />
            <button className="primary" onClick={exportAll} disabled={filledBoxes.size === 0 || exporting}>
              {exporting ? 'Exporting…' : `Export all (${filledBoxes.size})`}
            </button>
          </div>
          {exportStatus && (
            <p className={`export-status${exportStatus.ok ? '' : ' export-status-error'}`}>{exportStatus.text}</p>
          )}
        </>
      ) : (
        <p className="profile-invalid">Fix the page profile above to continue — the current values leave no room for image cells.</p>
      )}
    </main>
  );
}
