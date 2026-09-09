import { useEffect, useRef, useState } from 'react';
import Row from './Row.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import { DEFAULT_PROFILE, ROW_TYPES, HEIGHT_PRESETS, rowCellCount, profileProblems } from './pageGeometry.js';
import { planImport } from './importPlan.js';
import { batchIdFromIso, buildManifest, figName, figNumbers, manifestName } from './manifest.js';
import { idbGet, idbSet, idbDelete } from './idb.js';

// On-screen scale: how many CSS px represent one page mm. Purely cosmetic —
// export resolution comes from the profile's dpi, never from this.
const DISPLAY_PX_PER_MM = 4;

let nextRowId = 1;
const newRow = (type, heightPreset) => ({ id: nextRowId++, type, heightPreset });

// Session state (rows/captions/profile/add-row picks) survives an accidental
// close via localStorage — deliberately excludes images, which are too big
// for it and are re-added from source each session anyway. Read once at
// module scope: every state initializer below shares this one parse instead
// of re-reading localStorage per field.
const SESSION_KEY = 'snappy-session';
let cachedSession;
function loadSession() {
  if (cachedSession !== undefined) return cachedSession;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    cachedSession = raw ? JSON.parse(raw) : null;
  } catch {
    cachedSession = null;
  }
  return cachedSession;
}

function restoredRows(session) {
  const saved = session?.rows;
  if (!Array.isArray(saved) || saved.length === 0) return null;
  const valid = saved.filter(
    (r) =>
      r && Number.isFinite(r.id) && ROW_TYPES.some((t) => t.id === r.type) && HEIGHT_PRESETS.some((p) => p.id === r.heightPreset)
  );
  if (valid.length === 0) return null;
  nextRowId = Math.max(...valid.map((r) => r.id)) + 1;
  return valid.map((r) => ({ id: r.id, type: r.type, heightPreset: r.heightPreset }));
}

export default function App() {
  const session = loadSession();
  const [profile, setProfile] = useState(() => ({ ...DEFAULT_PROFILE, ...session?.profile }));
  const [rows, setRows] = useState(() => restoredRows(session) ?? [newRow('2up', 'standard')]);
  const [captions, setCaptions] = useState(() => (session?.captions && typeof session.captions === 'object' ? session.captions : {}));
  const [filledBoxes, setFilledBoxes] = useState(() => new Set()); // boxKeys currently holding an image — never restored, images aren't persisted
  const [addType, setAddType] = useState(() => (ROW_TYPES.some((t) => t.id === session?.addType) || session?.addType === '2x2' ? session.addType : '2up'));
  const [addHeight, setAddHeight] = useState(() => (HEIGHT_PRESETS.some((p) => p.id === session?.addHeight) ? session.addHeight : 'standard'));
  const [pasteOverride, setPasteOverride] = useState(null); // boxKey the user aimed Ctrl+V at
  const [exporting, setExporting] = useState(false);
  const [pendingImport, setPendingImport] = useState(null); // { afterKey, files } from a multi-pick
  const [pendingRelocate, setPendingRelocate] = useState(null); // items bumped to a new row by a row shrink

  // Persist rows/captions/profile/add-row picks (not images) so an accidental
  // close doesn't lose the layout.
  useEffect(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ profile, rows, captions, addType, addHeight }));
    } catch {
      // private mode / quota — session just won't persist
    }
  }, [profile, rows, captions, addType, addHeight]);

  // Pinned photo folder: the file picker opens here instead of wherever the
  // browser last remembered. Persisted as a directory handle in IndexedDB.
  const [photoDir, setPhotoDir] = useState(null);
  useEffect(() => {
    idbGet('photoDir')
      .then((handle) => handle && setPhotoDir(handle))
      .catch(() => {});
  }, []);

  // Folder pickers fail silently far too easily (e.g. Chromium auto-dismisses
  // the picker with an instant AbortError after repeated prompt dismissals),
  // so failures surface in the settings panel instead of only the console.
  const [folderNote, setFolderNote] = useState(null);
  const dirPickerBusy = useRef(0); // epoch ms of a pending picker, 0 when idle

  async function pickDir(opts) {
    // Chromium never settles a picker whose dialog or bundled permission
    // prompt is stuck, and a second call then throws NotAllowedError "File
    // picker already active" — turn both into one recognizable busy error.
    // After 30s we let a retry through anyway: if a picker truly is open the
    // browser throws again, but a ghost (dialog that never appeared) doesn't
    // get to brick the button until reload.
    if (dirPickerBusy.current && Date.now() - dirPickerBusy.current < 30000) {
      throw Object.assign(new Error('a folder picker is already open'), { name: 'PickerBusyError' });
    }
    dirPickerBusy.current = Date.now();
    const t0 = performance.now();
    try {
      return await window.showDirectoryPicker(opts);
    } catch (err) {
      // A human cancel takes longer than this; an instant AbortError means the
      // browser refused to even open the picker.
      if (err?.name === 'AbortError' && performance.now() - t0 < 300) {
        throw Object.assign(new Error('the browser blocked the folder picker'), { name: 'PickerBlockedError' });
      }
      if (err?.name === 'NotAllowedError' && /already active/i.test(err?.message ?? '')) {
        throw Object.assign(new Error('a folder picker is already open'), { name: 'PickerBusyError' });
      }
      throw err;
    } finally {
      dirPickerBusy.current = 0;
    }
  }

  function noteFolderError(which, err) {
    if (err?.name === 'AbortError') return; // user cancelled — not an error
    console.error(`choosing ${which} folder failed`, err);
    setFolderNote(
      err?.name === 'PickerBusyError'
        ? 'A folder picker or its permission prompt is still open — answer or close it (it may have collapsed into an icon by the address bar). If nothing is visibly open, try again in 30 seconds or reload the page.'
        : err?.name === 'PickerBlockedError'
          ? `The browser refused to open the ${which}-folder picker (it can lock this after dismissed prompts). Click the icon left of the address bar → reset the site's permissions, or restart the browser, then try again.`
          : `Choosing the ${which} folder failed: ${err?.name ?? 'Error'} — ${err?.message ?? err}`
    );
  }

  // Both folder choosers avoid the browser's own picker memory (`id` /
  // last-used) on purpose: on macOS it can latch onto a since-deleted temp
  // folder (Photos-library picks), and a picker aimed at an inaccessible
  // location can fail to show any dialog while its promise hangs forever.
  // We persist the handles ourselves, so start at the current choice or a
  // well-known directory that is guaranteed to exist.
  async function choosePhotoDir() {
    setFolderNote(null);
    try {
      const handle = await pickDir({ startIn: photoDir ?? 'pictures' });
      setPhotoDir(handle);
      idbSet('photoDir', handle).catch(() => {});
    } catch (err) {
      noteFolderError('photo', err);
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

  // Choosing from settings picks read-only on purpose: mode 'readwrite' makes
  // Chromium bundle a "save changes?" permission prompt into the picker, and
  // leaving that prompt unanswered hangs the picker promise forever ("File
  // picker already active" on every later click). Write permission is
  // requested at export time instead, where a fresh click activation exists.
  async function pickSaveDir(mode) {
    const opts = { startIn: saveDir ?? 'documents' };
    if (mode) opts.mode = mode;
    const handle = await pickDir(opts);
    setSaveDir(handle);
    idbSet('saveDir', handle).catch(() => {});
    return handle;
  }

  async function chooseSaveDir() {
    setFolderNote(null);
    try {
      await pickSaveDir();
    } catch (err) {
      noteFolderError('save', err);
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
    const current = rows.find((r) => r.id === id);
    // Shrinking a row (e.g. 3-up → 2-up) would otherwise unmount the boxes
    // beyond the new count and silently drop their image/caption. Instead,
    // bump any filled ones into a fresh row of just the right size, inserted
    // right after this one.
    let relocateRow = null;
    let relocateItems = null;
    if (patch.type && current && rowCellCount(patch.type) < rowCellCount(current.type)) {
      const newCount = rowCellCount(patch.type);
      const oldCount = rowCellCount(current.type);
      const overflowKeys = Array.from({ length: oldCount - newCount }, (_, i) => `${id}-${newCount + i}`).filter(
        (k) => filledBoxes.has(k) || captions[k]
      );
      const relocateType = overflowKeys.length > 0 ? ROW_TYPES.find((t) => t.count >= overflowKeys.length)?.id : null;
      if (relocateType) {
        relocateRow = newRow(relocateType, current.heightPreset);
        relocateItems = overflowKeys.map((k, i) => ({
          targetKey: `${relocateRow.id}-${i}`,
          caption: captions[k],
          blobPromise: boxApis.current.get(k)?.getSourceBlob() ?? Promise.resolve(null),
        }));
      }
    }

    setRows((rs) => {
      const next = rs.map((r) => (r.id === id ? { ...r, ...patch } : r));
      if (relocateRow) next.splice(next.findIndex((r) => r.id === id) + 1, 0, relocateRow);
      return next;
    });
    if (patch.type) {
      // Boxes beyond the new count unmount; their content has already been
      // captured above for relocation (if any), so just clear the bookkeeping.
      const count = rowCellCount(patch.type);
      const dropped = (k) => k.startsWith(`${id}-`) && Number(k.split('-')[1]) >= count;
      setFilledBoxes((prev) => new Set([...prev].filter((k) => !dropped(k))));
      setCaptions((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !dropped(k))));
    }
    if (relocateItems) setPendingRelocate(relocateItems);
  }

  function deleteRow(id) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const rowKeys = Array.from({ length: rowCellCount(row.type) }, (_, i) => `${id}-${i}`);
    const hasContent = rowKeys.some((k) => filledBoxes.has(k) || captions[k]);
    if (hasContent && !window.confirm('This row contains images or captions. Delete it anyway?')) return;
    setRows((rs) => rs.filter((r) => r.id !== id));
    setFilledBoxes((prev) => new Set([...prev].filter((k) => !k.startsWith(`${id}-`))));
    setCaptions((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${id}-`))));
  }

  function onCaptionChange(boxKey, text) {
    setCaptions((prev) => (text ? { ...prev, [boxKey]: text } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== boxKey))));
  }

  // Clears the whole document — rows, images, and captions — back to a
  // single empty row. Confirms first if there's anything to lose; the fresh
  // row ids naturally unmount every CropBox, dropping their images too.
  function newDocument() {
    const hasContent = filledBoxes.size > 0 || Object.values(captions).some(Boolean);
    if (hasContent && !window.confirm('Start a new document? This clears all rows, images, and captions.')) return;
    setRows([newRow('2up', 'standard')]);
    setCaptions({});
    setFilledBoxes(new Set());
    setPasteOverride(null);
    setPendingImport(null);
    setExportStatus(null);
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

  // Places items bumped by a row shrink into the freshly-inserted row, once
  // its boxes have mounted and registered their loadFile handles.
  useEffect(() => {
    if (!pendingRelocate) return;
    if (!pendingRelocate.every((item) => boxApis.current.has(item.targetKey))) return;
    pendingRelocate.forEach((item) => {
      item.blobPromise.then((blob) => blob && boxApis.current.get(item.targetKey)?.loadFile(blob));
      if (item.caption) setCaptions((prev) => ({ ...prev, [item.targetKey]: item.caption }));
    });
    setPendingRelocate(null);
  }, [pendingRelocate, rows]);

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
        // Fresh pick mid-export: readwrite here is fine — the permission
        // prompt follows the pick immediately while the user is engaged.
        if (!dir) dir = await pickSaveDir('readwrite');
      } catch (err) {
        if (err?.name === 'AbortError') return;
        if (err?.name === 'PickerBusyError') {
          setExportStatus({ ok: false, text: 'A folder picker or permission prompt is still open — answer or close it (check by the address bar), then export again.' });
          return;
        }
        if (err?.name === 'PickerBlockedError') {
          setExportStatus({ ok: false, text: 'The browser refused to open the save-folder picker — reset the site\'s permissions (icon left of the address bar) and try again.' });
          return;
        }
        throw err;
      }
      if (!(await hasWritePermission(dir))) {
        setExportStatus({ ok: false, text: `No permission to write into “${dir.name}” — click Export all again and allow access when the browser asks.` });
        return;
      }

      const generated = new Date().toISOString();
      const batchId = batchIdFromIso(generated);
      const figs = figNumbers(rows);
      let count = 0;
      for (const key of allBoxKeys) {
        if (!filledBoxes.has(key)) continue;
        const blob = await boxApis.current.get(key)?.exportBlob();
        if (!blob) continue;
        await writeToDir(dir, figName(batchId, figs.get(key)), blob);
        count++;
      }
      const manifest = buildManifest(profile, rows, filledBoxes, generated, captions);
      const mName = manifestName(batchId);
      await writeToDir(dir, mName, new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
      setExportStatus({ ok: true, text: `Saved ${count} image${count === 1 ? '' : 's'} + ${mName} to “${dir.name}”` });
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
    const generated = new Date().toISOString();
    const manifest = buildManifest(profile, rows, filledBoxes, generated, captions);
    const mName = manifestName(batchIdFromIso(generated));
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = mName;
    a.click();
    URL.revokeObjectURL(url);
    setExportStatus({ ok: true, text: `Downloaded ${count} image${count === 1 ? '' : 's'} + ${mName}` });
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
        Phase 4 — workflow polish. Every cell's shape and export resolution derive from the page profile below.
        Paste (Ctrl+V) fills the first empty box, or aim it with a box's ⌖ button. Export all writes
        fig-NN.jpg + manifest.json (with captions) straight into your save folder. Rows and captions are
        remembered across reloads — images are not.
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
        folderNote={folderNote}
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
                captions={captions}
                onChange={updateRow}
                onDelete={deleteRow}
                onMove={moveRow}
                onImageChange={onImageChange}
                onSetPasteOverride={setPasteOverride}
                onCaptionChange={onCaptionChange}
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
            <button onClick={newDocument} title="Clear all rows, images, and captions">New document</button>
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
