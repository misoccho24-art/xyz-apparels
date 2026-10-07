/**
 * XYZ Apparels - order tracker backend (Google Apps Script).
 * Paste this whole file into Extensions > Apps Script of your Google Sheet. See SETUP.md.
 *
 * The Sheet stays PRIVATE. The website talks only to this script, which checks a password
 * (stored in Project Settings > Script properties) before it reads or writes anything.
 *   ADMIN_PASSWORD  - can view + edit
 *   VIEWER_PASSWORD - can only view
 *
 * Safety nets:
 *   - Trash tab:    deleted designs are kept 30 days and can be restored from the Admin Panel.
 *   - History tab:  a snapshot is taken before every save (last 15 kept) and can be restored.
 *   - Pictures are never deleted while the Trash or a saved version still uses them.
 */
const DESIGN_HEADERS = ['Order', 'Design', 'Image ID', 'Quantity', 'Cutting', 'Print', 'Sewing', 'Finishing', 'Name', 'Products'];
const ORDER_HEADERS = ['Order', 'Date', 'Designs', 'Name', 'Note', 'Updated', 'Products'];
const TRASH_HEADERS = ['Deleted At', 'Order', 'Design', 'Image ID', 'Quantity', 'Cutting', 'Print', 'Sewing', 'Finishing', 'Name', 'Key', 'Products'];
const HISTORY_HEADERS = ['Time', 'What happened', 'Data'];
const DEFAULT_ORDER_COUNT = 6;
const FOLDER_NAME = 'XYZ Orders Images';
const FIELDS = ['qty', 'cutting', 'print', 'sewing', 'finishing'];
const BIN_DAYS = 30;
const HISTORY_KEEP = 15;
const CHUNK = 45000;
const DAY_MS = 86400000;
const PURGE_EVERY_MS = 6 * 3600000;

// Reads are remembered for the length of one request (every Sheets call is slow)
let MEMO = {};
function memo_(key, fn) { if (!(key in MEMO)) MEMO[key] = fn(); return MEMO[key]; }

function doGet() { return ContentService.createTextOutput('OK'); }

function doPost(e) {
  MEMO = {};
  let out;
  try { out = handle_(JSON.parse(e.postData.contents)); }
  catch (err) { out = { ok: false, error: String(err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function roleFor_(pw) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fails') || 0);
  if (fails >= 10) throw new Error('Too many wrong attempts. Try again in 15 minutes.');
  const p = PropertiesService.getScriptProperties();
  // the same value in both would let every viewer into the Admin Panel
  if (p.getProperty('ADMIN_PASSWORD') && p.getProperty('ADMIN_PASSWORD') === p.getProperty('VIEWER_PASSWORD')) {
    throw new Error('Admin and viewer passwords are the same. Change one of them in Script properties.');
  }
  let role = null;
  if (pw && pw === p.getProperty('ADMIN_PASSWORD')) role = 'admin';
  else if (pw && pw === p.getProperty('VIEWER_PASSWORD')) role = 'viewer';
  if (!role) { cache.put('fails', String(fails + 1), 900); throw new Error('Wrong password'); }
  return role;
}

function adminOnly_(role) { if (role !== 'admin') throw new Error('Not allowed'); }

function handle_(req) {
  const role = roleFor_(req.password);
  switch (req.action) {
    case 'auth':    return { ok: true, role: role };
    case 'load':    return Object.assign({ ok: true, role: role }, readAll_()); // role included: no separate login request needed
    case 'images':  return { ok: true, images: readImages_(req.ids) };
    case 'image':   return { ok: true, data: readImage_(req.id) };
    case 'save':    adminOnly_(role); return writeAll_(req);
    case 'bin':     adminOnly_(role); return { ok: true, items: binList_() };
    case 'restore': adminOnly_(role); return withLock_(() => restore_(req));
    case 'binDelete': adminOnly_(role); return withLock_(() => binDelete_(req));
    case 'history': adminOnly_(role); return { ok: true, items: historyList_() };
    case 'rollback': adminOnly_(role); return withLock_(() => rollback_(req));
    default: throw new Error('Unknown action');
  }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------- sheets helpers ----------
function ensure_(sh, rows, cols) {
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
}

function sheet_(name, headers) {
  return memo_('sheet:' + name, () => openSheet_(name, headers));
}

function openSheet_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.setFrozenRows(1);
  }
  // create the header row, or add any columns that were added in a newer version
  const have = sh.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (have.join('|') !== headers.join('|')) {
    ensure_(sh, 2001, headers.length);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.getRange(2, 1, 2000, headers.length).setNumberFormat('@'); // keep everything as plain text
  }
  return sh;
}

function readRows_(sh, ncols) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, ncols).getDisplayValues();
}

function writeTable_(name, headers, rows) {
  rows = rows.map(r => { const x = r.slice(); while (x.length < headers.length) x.push(''); return x; }); // older snapshots have fewer columns
  const sh = sheet_(name, headers);
  const last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, headers.length).clearContent();
  if (rows.length) {
    ensure_(sh, rows.length + 1, headers.length);
    sh.getRange(2, 1, rows.length, headers.length).setNumberFormat('@').setValues(rows);
  }
  delete MEMO['rows:' + name];
}

function designRows_() {
  return memo_('rows:Designs', () => readRows_(sheet_('Designs', DESIGN_HEADERS), DESIGN_HEADERS.length).filter(r => r[0] !== '' && r[1] !== ''));
}
function trashRows_() {
  return memo_('rows:Trash', () => readRows_(sheet_('Trash', TRASH_HEADERS), TRASH_HEADERS.length).filter(r => r[0] !== ''));
}
function orderRows_() {
  return memo_('rows:Orders', () => readRows_(sheet_('Orders', ORDER_HEADERS), ORDER_HEADERS.length).filter(r => r[0] !== ''));
}

function ordersMeta_() {
  const meta = { _n: {}, _dates: {}, _titles: {}, _notes: {}, _updated: {}, _products: {}, _count: 0 };
  orderRows_().forEach(r => {
    const o = Number(r[0]); if (!o) return;
    meta._count = Math.max(meta._count, o);
    if (r[1]) meta._dates[o] = r[1];
    if (r[2] !== '') meta._n[o] = Number(r[2]);
    if (r[3]) meta._titles[o] = r[3];
    if (r[4]) meta._notes[o] = r[4];
    if (r[5]) meta._updated[o] = r[5];
    if (r[6]) meta._products[o] = r[6];
  });
  return meta;
}

function writeOrders_(count, m) {
  count = Math.max(1, Math.min(200, Number(count) || DEFAULT_ORDER_COUNT));
  const vals = [];
  const g = (obj, o) => (obj && obj[o] != null ? String(obj[o]) : '');
  for (let o = 1; o <= count; o++) {
    vals.push([String(o), g(m._dates, o), g(m._n, o), g(m._titles, o), g(m._notes, o), g(m._updated, o), g(m._products, o)]);
  }
  writeTable_('Orders', ORDER_HEADERS, vals);
}

function readAll_() {
  const rows = designRows_().map(r => ({
    o: Number(r[0]), i: Number(r[1]), imgId: r[2],
    qty: r[3], cutting: r[4], print: r[5], sewing: r[6], finishing: r[7], name: r[8], products: r[9]
  }));
  return { rows: rows, meta: ordersMeta_() };
}

// ---------- pictures ----------
function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME); // private
}

function readImage_(id) {
  // only pictures listed in the Designs or Trash tab can be read
  const allowed = id && (designRows_().some(r => r[2] === id) || trashRows_().some(r => r[3] === id));
  if (!allowed) throw new Error('Image not found');
  const blob = DriveApp.getFileById(id).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

// several pictures in one request (much faster than one request per picture)
function readImages_(ids) {
  ids = (Array.isArray(ids) ? ids : []).slice(0, 12);
  const allowed = {};
  designRows_().forEach(r => { if (r[2]) allowed[r[2]] = 1; });
  trashRows_().forEach(r => { if (r[3]) allowed[r[3]] = 1; });
  const out = {};
  ids.forEach(id => {
    if (!allowed[id]) return;
    try {
      const blob = DriveApp.getFileById(id).getBlob();
      out[id] = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    } catch (e) { /* missing picture: skip it */ }
  });
  return out;
}

// ---------- history (snapshots before every save) ----------
function packSnapshot_() {
  const data = JSON.stringify({ d: designRows_(), o: orderRows_() });
  return Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(data, 'application/json', 'd.json')).getBytes());
}

function unpackSnapshot_(b64) {
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip', 'd.gz');
  return JSON.parse(Utilities.ungzip(blob).getDataAsString());
}

function snapshot_(summary) {
  const b64 = packSnapshot_();
  const sh = sheet_('History', HISTORY_HEADERS);
  const last = sh.getLastRow();
  if (last >= 2) {
    const prev = sh.getRange(last, 3, 1, Math.max(1, sh.getLastColumn() - 2)).getDisplayValues()[0].join('');
    if (prev === b64) return; // nothing changed since the last snapshot
  }
  const chunks = [];
  for (let i = 0; i < b64.length; i += CHUNK) chunks.push(b64.substr(i, CHUNK));
  const row = [new Date().toISOString(), summary].concat(chunks);
  const r = Math.max(last, 1) + 1;
  ensure_(sh, r, row.length);
  sh.getRange(r, 1, 1, row.length).setNumberFormat('@').setValues([row]);
  let count = sh.getLastRow() - 1;
  while (count > HISTORY_KEEP) { sh.deleteRow(2); count--; }
}

function historyList_() {
  const sh = sheet_('History', HISTORY_HEADERS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 2).getDisplayValues().map(r => ({ time: r[0], what: r[1] })).reverse();
}

function rollback_(req) {
  const sh = sheet_('History', HISTORY_HEADERS);
  const last = sh.getLastRow();
  let snap = null;
  for (let r = 2; r <= last; r++) {
    const row = sh.getRange(r, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    if (row[0] === req.time) { snap = unpackSnapshot_(row.slice(2).join('')); break; }
  }
  if (!snap) throw new Error('That version was not found');
  snapshot_('Before restoring an older version');
  writeTable_('Designs', DESIGN_HEADERS, snap.d.map(r => { const x = r.slice(); while (x.length < DESIGN_HEADERS.length) x.push(''); return x; }));
  const nowIso = new Date().toISOString();
  writeTable_('Orders', ORDER_HEADERS, snap.o.map(r => { const x = r.slice(); while (x.length < ORDER_HEADERS.length) x.push(''); x[5] = nowIso; return x; }));
  return Object.assign({ ok: true }, readAll_());
}

// ---------- recycle bin ----------
function binList_() {
  return trashRows_().map(r => ({
    key: r[10], at: r[0], o: Number(r[1]), i: Number(r[2]), imgId: r[3],
    qty: r[4], cutting: r[5], print: r[6], sewing: r[7], finishing: r[8], name: r[9], products: r[11]
  })).reverse();
}

function restore_(req) {
  const keys = req.keys || [];
  if (!keys.length) return { ok: true };
  snapshot_('Before restoring from the recycle bin');
  const trash = trashRows_(), keep = [];
  const map = {};
  designRows_().forEach(r => { map[r[0] + '_' + r[1]] = r.slice(); });
  const om = ordersMeta_();
  let count = om._count;
  trash.forEach(t => {
    if (keys.indexOf(t[10]) < 0) { keep.push(t); return; }
    const o = Number(t[1]);
    let max = 0;
    Object.keys(map).forEach(k => { const r = map[k]; if (Number(r[0]) === o) max = Math.max(max, Number(r[1])); });
    const next = Math.max(max, om._n[o] || 0) + 1;
    map[o + '_' + next] = [String(o), String(next), t[3], t[4], t[5], t[6], t[7], t[8], t[9], t[11] || ''];
    om._n[o] = next;
    om._updated[o] = new Date().toISOString();
    count = Math.max(count, o);
  });
  const out = Object.keys(map).map(k => map[k]).sort((a, b) => (Number(a[0]) - Number(b[0])) || (Number(a[1]) - Number(b[1])));
  writeTable_('Designs', DESIGN_HEADERS, out);
  writeTable_('Trash', TRASH_HEADERS, keep);
  writeOrders_(count, om);
  return Object.assign({ ok: true }, readAll_());
}

function binDelete_(req) {
  const keys = req.keys || [];
  const keep = trashRows_().filter(t => keys.indexOf(t[10]) < 0);
  writeTable_('Trash', TRASH_HEADERS, keep);
  return { ok: true };
}

// removes old bin entries and pictures that nothing refers to any more
function purge_() {
  try {
    const now = Date.now();
    const props = PropertiesService.getScriptProperties();
    if (now - Number(props.getProperty('LAST_PURGE') || 0) < PURGE_EVERY_MS) return; // at most every few hours
    props.setProperty('LAST_PURGE', String(now));
    const trash = trashRows_();
    const keep = trash.filter(r => now - Date.parse(r[0]) < BIN_DAYS * DAY_MS);
    if (keep.length !== trash.length) writeTable_('Trash', TRASH_HEADERS, keep);

    const refs = {};
    designRows_().forEach(r => { if (r[2]) refs[r[2]] = 1; });
    keep.forEach(r => { if (r[3]) refs[r[3]] = 1; });
    const hs = sheet_('History', HISTORY_HEADERS);
    const hl = hs.getLastRow();
    if (hl >= 2) {
      const all = hs.getRange(2, 1, hl - 1, hs.getLastColumn()).getDisplayValues();
      for (let r = 0; r < all.length; r++) {
        try { unpackSnapshot_(all[r].slice(2).join('')).d.forEach(d => { if (d[2]) refs[d[2]] = 1; }); } catch (e) { return; } // unreadable history: keep every picture
      }
    }
    const files = folder_().getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (!refs[f.getId()] && now - f.getDateCreated().getTime() > DAY_MS) f.setTrashed(true);
    }
  } catch (e) { /* never block a save because of cleanup */ }
}

// ---------- save ----------
function writeAll_(req) {
  return withLock_(() => {
    const changed = req.changed || [], removed = req.removed || [], binned = req.binned || [];
    const ids = {}; // new picture ids, so the website needs no second request
    snapshot_('Before save: ' + changed.length + ' edited, ' + removed.length + ' removed' + (binned.length ? ', ' + binned.length + ' to recycle bin' : ''));

    const map = {};
    designRows_().forEach(r => { map[r[0] + '_' + r[1]] = r.slice(); });
    const known = {}; // picture ids that already exist
    Object.keys(map).forEach(k => { if (map[k][2]) known[map[k][2]] = 1; });
    trashRows_().forEach(r => { if (r[3]) known[r[3]] = 1; });

    // deleted designs go to the recycle bin (picture is kept)
    if (binned.length) {
      const at = new Date().toISOString();
      const rows = trashRows_();
      binned.forEach(b => {
        if (b.imgData) {
          const m = /^data:(.+?);base64,(.*)$/.exec(b.imgData);
          if (m) {
            const f = folder_().createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'deleted-order' + b.o + '-design' + b.i + '.jpg'));
            b.imgId = f.getId(); known[b.imgId] = 1;
          }
        }
        rows.push([at, String(b.o), String(b.i), known[b.imgId] ? b.imgId : '', b.qty || '', b.cutting || '', b.print || '', b.sewing || '', b.finishing || '', b.name || '', Utilities.getUuid(), b.products || '']);
      });
      writeTable_('Trash', TRASH_HEADERS, rows);
    }

    removed.forEach(x => { delete map[x.o + '_' + x.i]; });

    changed.forEach(x => {
      const k = x.o + '_' + x.i;
      const row = map[k] || [x.o, x.i, '', '', '', '', '', '', '', ''];
      while (row.length < DESIGN_HEADERS.length) row.push(''); // rows saved before Products existed
      row[8] = x.name == null ? '' : String(x.name);
      row[9] = x.products == null ? '' : String(x.products);
      FIELDS.forEach((f, n) => { row[3 + n] = x[f] == null ? '' : String(x[f]); });
      if (x.imgData) {
        const m = /^data:(.+?);base64,(.*)$/.exec(x.imgData);
        if (!m) throw new Error('Bad image');
        const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'order' + x.o + '-design' + x.i + '.jpg');
        const file = folder_().createFile(blob);
        row[2] = file.getId();
        known[row[2]] = 1;
        ids[x.o + '_' + x.i] = row[2];
      } else if (x.imgId) {
        if (known[x.imgId]) row[2] = x.imgId; // re-use a picture that is already stored
      } else if (x.clearImg) {
        row[2] = '';
      }
      map[k] = row;
    });

    const out = Object.keys(map).map(k => map[k])
      .sort((a, b) => (Number(a[0]) - Number(b[0])) || (Number(a[1]) - Number(b[1])));
    writeTable_('Designs', DESIGN_HEADERS, out);

    if (req.meta) {
      const m = req.meta, om = ordersMeta_(), at = new Date().toISOString();
      const count = Math.max(1, Math.min(200, Number(m._count) || DEFAULT_ORDER_COUNT));
      const touched = {};
      changed.concat(removed, binned).forEach(x => { touched[x.o] = 1; });
      const val = (obj, o) => (obj && obj[o] != null ? String(obj[o]) : '');
      for (let o = 1; o <= count; o++) {
        if ([val(m._dates, o), val(m._titles, o), val(m._notes, o), val(m._products, o)].join('\u0001') !== [val(om._dates, o), val(om._titles, o), val(om._notes, o), val(om._products, o)].join('\u0001')) touched[o] = 1;
      }
      const updated = {};
      for (let o = 1; o <= count; o++) updated[o] = touched[o] ? at : (om._updated[o] || '');
      writeOrders_(count, { _dates: m._dates, _n: m._n, _titles: m._titles, _notes: m._notes, _products: m._products, _updated: updated });
    }
    purge_();
    return { ok: true, ids: ids };
  });
}
