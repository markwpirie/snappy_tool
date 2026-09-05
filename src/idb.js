// Minimal IndexedDB key-value store. FileSystemDirectoryHandle objects are
// structured-cloneable, so this is where directory handles persist across
// sessions (localStorage cannot hold them). Also the Phase 3 home for the
// save-bundle folder handle.

const DB_NAME = 'snappy-tool';
const STORE = 'kv';

function withStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      let req;
      try {
        // put() throws synchronously on uncloneable values — route that into
        // the promise instead of escaping as an unhandled event-handler error.
        req = fn(tx.objectStore(STORE));
      } catch (err) {
        db.close();
        reject(err);
        return;
      }
      tx.oncomplete = () => {
        db.close();
        resolve(req?.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

export const idbGet = (key) => withStore('readonly', (store) => store.get(key));
export const idbSet = (key, value) => withStore('readwrite', (store) => store.put(value, key));
export const idbDelete = (key) => withStore('readwrite', (store) => store.delete(key));
