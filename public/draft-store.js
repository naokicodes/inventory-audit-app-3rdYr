// Step count-drafts (session-status.md, "Step count-drafts"): unsaved count
// entries kept in localStorage so a refresh, a crash or Android killing the
// tab doesn't lose a count pass. Drafts only - nothing here ever submits; the
// server stays the record. localStorage, not sessionStorage: sessionStorage
// dies with a killed tab.
//
// Key: draft:v1:<page>:<site>:<business_date>[:<user>]. Value: { savedAt,
// fields } where a field key is <meat|dish>:<id>:<field class> - by item id,
// never DOM position, so the table, Review and Enter views share one draft.
//
// Every storage call is in try/catch: if storage fails (private window,
// blocked site data, full quota) there are simply no drafts and the page
// works as it did before.
//
// window.DraftStore = { key, load, set, removeFields, clear, restoredText }
(function () {
  const PREFIX = 'draft:v1:';
  const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
  const DEBOUNCE_MS = 300;
  // Not yet written to storage: key -> { draft, timer }. load() reads it
  // first, so a re-render inside the debounce window keeps the last keystroke.
  const pending = {};

  // user is optional so the key can gain it once login lands.
  function key(page, site, date, user) {
    return PREFIX + [page, site, date].concat(user ? [user] : []).join(':');
  }

  function read(k) {
    try {
      const d = JSON.parse(localStorage.getItem(k));
      return d && typeof d.savedAt === 'number' && d.fields && typeof d.fields === 'object' ? d : null;
    } catch (e) { return null; }
  }

  function write(k, draft) {
    try {
      if (Object.keys(draft.fields).length === 0) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(draft));
    } catch (e) { /* no drafts - the page still works */ }
  }

  function flush(k) {
    const p = pending[k];
    if (!p) return;
    clearTimeout(p.timer);
    delete pending[k];
    write(k, p.draft);
  }

  function load(k) {
    if (pending[k]) return pending[k].draft;
    return read(k);
  }

  function update(k, change) {
    const current = load(k);
    const draft = { savedAt: Date.now(), fields: Object.assign({}, current ? current.fields : {}) };
    change(draft.fields);
    if (pending[k]) clearTimeout(pending[k].timer);
    pending[k] = { draft, timer: setTimeout(() => flush(k), DEBOUNCE_MS) };
  }

  function set(k, fieldKey, value) {
    update(k, fields => { fields[fieldKey] = String(value); });
  }

  function removeFields(k, fieldKeys) {
    update(k, fields => fieldKeys.forEach(f => { delete fields[f]; }));
    flush(k);
  }

  function clear(k) {
    if (pending[k]) clearTimeout(pending[k].timer);
    delete pending[k];
    try { localStorage.removeItem(k); } catch (e) { /* nothing stored */ }
  }

  // Drop drafts older than 3 days (and anything unreadable) once per load.
  try {
    const now = Date.now();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const d = read(k);
      if (!d || now - d.savedAt > MAX_AGE_MS) localStorage.removeItem(k);
    }
  } catch (e) { /* storage unavailable */ }

  // The tab may be killed right after it is hidden - write what's pending now.
  function flushAll() { Object.keys(pending).forEach(flush); }
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });

  // The one restore line, shared so the grid and the month-opening panel say the same thing.
  function restoredText(count, savedAt) {
    const when = new Date(savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `Restored ${count} unsaved ${count === 1 ? 'entry' : 'entries'} from ${when} — not saved yet.`;
  }

  window.DraftStore = { key, load, set, removeFields, clear, restoredText };
})();
