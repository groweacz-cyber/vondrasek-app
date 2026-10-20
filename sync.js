/* =========================================================
   VONDRÁŠEK — SYNCHRONIZACE SE SERVEREM
   Všechna provozní data žijí na serveru (databáze), prohlížeč si drží jen kopii.
   - state = pracovní kopie dat v paměti (kolekce + pár lokálních nastavení)
   - saveState() uloží kopii do prohlížeče a naplánuje odeslání změn na server
   - každých 15 s (a při návratu na kartu) se stáhnou změny od ostatních
   - bez připojení se změny drží a odešlou se, jakmile se síť vrátí
   Majitel dostane všechno, řidič jen svoje jízdy a tankování (filtruje server).
========================================================= */

const STORAGE_KEY = 'vondrasek_app_v3';   // kopie dat v prohlížeči (v1/v2 = starší verze bez serveru)
const SESSION_KEY = 'vondrasek_session_v3';

const SYNC_POLE = ['jizdy', 'tankovani', 'vozidla', 'ridici', 'zakazky', 'hlaseniObjizdek'];   // seznamy záznamů s číselným id
const SYNC_MAPY = ['malaDoprava', 'pnsRouteConfig'];                        // záznamy podle klíče (datum / číslo trasy)
const SYNC_VSE = SYNC_POLE.concat(SYNC_MAPY);
const RIDIC_SMI_PSAT = ['jizdy', 'tankovani', 'hlaseniObjizdek'];
const RAZENI_SESTUPNE = ['jizdy', 'tankovani', 'zakazky', 'hlaseniObjizdek'];                  // nejnovější nahoře
const INTERVAL_STAHOVANI_MS = 15000;

function novyPrazdnyStav() {
  return {
    role: null, driverName: null, driverId: null,
    jizdy: [], tankovani: [], vozidla: [], ridici: [], zakazky: [], hlaseniObjizdek: [],
    malaDoprava: {}, pnsRouteConfig: {},
    lastVozidloPerDriver: {},          // jen na tomto zařízení (předvyplnění vozidla)
    posledniZaloha: null, posledniNotifikace: null,
    malaDopravaDateFixApplied: true
  };
}

const sync = {
  since: 0,            // poslední číslo změny, které už máme
  snapshot: {},        // co podle nás drží server: { kolekce: { id: kanonický JSON } }
  me: null,            // údaje ze serveru o přihlášeném (mustChangePin, mojeTrasy u řidiče …)
  stav: 'ok',          // ok | sync | offline | chyba
  cekaNaRender: false,
  odmitnuto: {},       // změny, které server odmítl (aby se neposílaly dokola)
  initialLoadDone: true // false jen během prvního stažení po přihlášení — ať se tehdy nespustí notifikace o "nových" hlášeních
};

// ---------- relace a kopie v prohlížeči ----------
function nactiRelaci() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function ulozRelaci(r) { localStorage.setItem(SESSION_KEY, JSON.stringify(r)); }
function smazRelaci() { try { localStorage.removeItem(SESSION_KEY); } catch {} }

function nactiKopii() {
  try {
    const c = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (c && c.state) { sync.since = c.since || 0; sync.snapshot = c.snapshot || {}; return c.state; }
  } catch {}
  return null;
}
function ulozKopii() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, since: sync.since, snapshot: sync.snapshot })); } catch (e) { /* plné úložiště — data jsou beztak na serveru */ }
}

const state = nactiKopii() || novyPrazdnyStav();
(function () {
  const rel = nactiRelaci();
  state.role = rel ? rel.role : null;
  state.driverId = rel ? rel.driverId : null;
  state.driverName = rel ? rel.driverName : null;
})();

function resetStavu() {
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, novyPrazdnyStav());
  sync.since = 0; sync.snapshot = {}; sync.me = null; sync.odmitnuto = {};
}

// ---------- volání serveru ----------
class ApiChyba extends Error { constructor(status, zprava) { super(zprava); this.status = status; } }

async function api(cesta, { method = 'GET', body } = {}) {
  const rel = nactiRelaci();
  let r;
  try {
    r = await fetch(cesta, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(rel ? { Authorization: 'Bearer ' + rel.token } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) { throw new ApiChyba(0, 'Bez připojení k serveru.'); }
  let data = null;
  try { data = await r.json(); } catch {}
  if (r.status === 401 && rel) { vynucenyOdhlas(); throw new ApiChyba(401, (data && data.error) || 'Přihlášení vypršelo.'); }
  if (!r.ok) throw new ApiChyba(r.status, (data && data.error) || 'Chyba serveru.');
  return data;
}

// ---------- porovnávání záznamů ----------
function kanon(v) {
  if (Array.isArray(v)) return '[' + v.map(kanon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + kanon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

function zaznamy(coll) {   // Map: id -> záznam (aktuální stav v paměti)
  const m = new Map();
  if (SYNC_POLE.includes(coll)) (state[coll] || []).forEach(z => m.set(String(z.id), z));
  else Object.entries(state[coll] || {}).forEach(([k, z]) => m.set(k, z));
  return m;
}

function vytvorOp(coll, id, rec) {
  if (coll === 'tankovani') {
    // fotka účtenky se posílá zvlášť; neposíláme-li ji, server ponechá tu stávající
    const { uctenka, ...zbytek } = rec;
    const op = { coll, id, data: zbytek };
    if (typeof uctenka === 'string' && uctenka.startsWith('data:')) op.receipt = uctenka;
    else if (!uctenka) op.receipt = null;
    return op;
  }
  return { coll, id, data: rec };
}

function spocitejZmeny() {
  if (!state.role) return [];
  const kolekce = state.role === 'owner' ? SYNC_VSE : RIDIC_SMI_PSAT;
  const ops = [];
  kolekce.forEach(coll => {
    const snap = sync.snapshot[coll] || {};
    const cur = zaznamy(coll);
    cur.forEach((rec, id) => {
      const j = kanon(rec);
      if (snap[id] === j) return;
      if (sync.odmitnuto[coll + '|' + id] === j) return;     // server tuhle verzi už odmítl
      ops.push({ op: vytvorOp(coll, id, rec), json: j, rec });
    });
    Object.keys(snap).forEach(id => { if (!cur.has(id)) ops.push({ op: { coll, id, del: true }, json: null, rec: null }); });
  });
  return ops;
}

function pocetNeodeslanych() { return spocitejZmeny().length; }

// ---------- odeslání změn ----------
async function odesli() {
  const zmeny = spocitejZmeny();
  if (!zmeny.length) return;
  let odmitnuto = null;
  for (let i = 0; i < zmeny.length; i += 40) {
    const davka = zmeny.slice(i, i + 40);
    const odp = await api('/api/sync', { method: 'POST', body: { ops: davka.map(z => z.op) } });
    odp.results.forEach((vysl, k) => {
      const z = davka[k];
      const coll = z.op.coll, id = z.op.id;
      if (!vysl.ok) { sync.odmitnuto[coll + '|' + id] = z.json; odmitnuto = odmitnuto || vysl.error; return; }
      sync.snapshot[coll] = sync.snapshot[coll] || {};
      if (z.op.del) { delete sync.snapshot[coll][id]; return; }
      if (vysl.uctenka) {
        const odeslane = { ...z.rec, uctenka: vysl.uctenka };
        if (kanon(z.rec) === z.json) z.rec.uctenka = vysl.uctenka;      // záznam se mezitím neměnil -> hned ukazuje adresu fotky
        sync.snapshot[coll][id] = kanon(odeslane);
      } else {
        sync.snapshot[coll][id] = z.json;
      }
    });
  }
  ulozKopii();
  if (odmitnuto) {
    // server nepřijal změnu (např. nemáš oprávnění) — vrátíme data do stavu, jaký je na serveru
    alert('Změnu se nepodařilo uložit: ' + odmitnuto + '\nData se obnoví podle serveru.');
    await plneStazeni();
  }
}

// ---------- stažení změn ----------
function seraditKolekce() {
  RAZENI_SESTUPNE.forEach(c => state[c].sort((a, b) => (+b.id || 0) - (+a.id || 0)));
  ['vozidla', 'ridici'].forEach(c => state[c].sort((a, b) => (+a.id || 0) - (+b.id || 0)));
}

function pouzijZaznamy(records) {
  let zmeneno = false;
  const noveHlaseni = [];       // nová (dosud neznámá) hlášení objížděk — pro upozornění majitele
  records.forEach(r => {
    const coll = r.coll, id = String(r.id);
    if (!SYNC_VSE.includes(coll)) return;
    const snap = (sync.snapshot[coll] = sync.snapshot[coll] || {});
    const pole = SYNC_POLE.includes(coll);
    const existujici = pole ? state[coll].find(z => String(z.id) === id) : state[coll][id];
    const lokalniZmena = existujici !== undefined && snap[id] !== undefined && kanon(existujici) !== snap[id];

    if (r.deleted) {
      if (existujici === undefined || lokalniZmena) return;     // lokální neodeslaná úprava má přednost
      if (pole) state[coll] = state[coll].filter(z => String(z.id) !== id); else delete state[coll][id];
      delete snap[id]; zmeneno = true; return;
    }
    if (lokalniZmena) return;
    const nova = r.data;
    const bylaTuNova = existujici !== undefined;
    if (bylaTuNova && kanon(existujici) === kanon(nova)) { snap[id] = kanon(nova); return; }
    if (pole) {
      const idx = state[coll].findIndex(z => String(z.id) === id);
      if (idx >= 0) state[coll][idx] = nova; else state[coll].push(nova);
    } else state[coll][id] = nova;
    snap[id] = kanon(nova); zmeneno = true;
    if (coll === 'hlaseniObjizdek' && !bylaTuNova) noveHlaseni.push(nova);
  });
  if (zmeneno) seraditKolekce();
  if (noveHlaseni.length && sync.initialLoadDone && typeof window.oznamNoveHlaseniObjizdek === 'function') {
    window.oznamNoveHlaseniObjizdek(noveHlaseni);
  }
  return zmeneno;
}

async function stahni() {
  let since = Math.max(0, sync.since - 50);       // malý překryv — kdyby se souběžný zápis dostal do databáze se zpožděním
  let zmeneno = false;
  for (;;) {
    const odp = await api('/api/sync?since=' + since);
    sync.me = odp.me;
    if (pouzijZaznamy(odp.records)) zmeneno = true;
    if (odp.more) { since = odp.seq; continue; }
    sync.since = odp.seq;
    break;
  }
  if (state.role === 'driver' && state.driverId != null) {
    const ja = state.ridici.find(r => String(r.id) === String(state.driverId));
    if (ja && ja.jmeno !== state.driverName) { state.driverName = ja.jmeno; const rel = nactiRelaci(); if (rel) { rel.driverName = ja.jmeno; ulozRelaci(rel); } zmeneno = true; }
  }
  if (state.role === 'owner' && typeof ensureRouteConfig === 'function') ensureRouteConfig();  // doplní jen chybějící trasy
  ulozKopii();
  return zmeneno;
}

// Úplné stažení: zahodí lokální kopii kolekcí a načte všechno ze serveru
async function plneStazeni() {
  SYNC_POLE.forEach(c => { state[c] = []; });
  SYNC_MAPY.forEach(c => { state[c] = {}; });
  sync.since = 0; sync.snapshot = {}; sync.odmitnuto = {};
  await stahni();
  if (typeof sync.priZmene === 'function') sync.priZmene();
}

// ---------- řízení synchronizace ----------
let fronta = Promise.resolve();
let casovacOdeslani = null;

function nastavStav(s) {
  sync.stav = s;
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const texty = {
    ok: ['☁️ Synchronizováno', ''],
    sync: ['↻ Synchronizuji…', ''],
    offline: ['⚠️ Bez připojení — změny se odešlou později', 'warn'],
    chyba: ['⚠️ Synchronizace selhala — zkusím znovu', 'warn']
  };
  const [text, trida] = texty[s] || texty.ok;
  el.textContent = text; el.className = 'sync-status ' + trida;
  const n = pocetNeodeslanych();
  if (n && s !== 'ok') el.title = `Neodeslaných změn: ${n}`; else el.title = '';
}

function synchronizuj() {
  fronta = fronta.then(async () => {
    if (!state.role) return;
    try {
      nastavStav('sync');
      await odesli();
      const zmeneno = await stahni();
      nastavStav('ok');
      if (zmeneno || sync.cekaNaRender) prekresliPoSynchronizaci();
    } catch (e) {
      if (e.status === 401) return;
      nastavStav(e.status === 0 ? 'offline' : 'chyba');
    }
  });
  return fronta;
}

function planujOdeslani() {
  if (!state.role) return;
  clearTimeout(casovacOdeslani);
  casovacOdeslani = setTimeout(synchronizuj, 500);
}

function saveState() { ulozKopii(); planujOdeslani(); }

// Překreslí otevřenou sekci, ale ne uprostřed psaní nebo s otevřeným oknem — to by uživateli smazalo rozepsané
function prekresliPoSynchronizaci() {
  const rozepsano = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if (document.querySelector('.modal-overlay.open') || rozepsano) { sync.cekaNaRender = true; return; }
  sync.cekaNaRender = false;
  const aktivni = document.querySelector('.nav-item.active');
  if (typeof renderSection === 'function') renderSection(aktivni ? aktivni.dataset.section : 'dashboard');
}

let sledovaniBezi = false;
function zacniSynchronizaci() {
  if (sledovaniBezi) return;
  sledovaniBezi = true;
  setInterval(() => { if (!document.hidden && state.role) synchronizuj(); }, INTERVAL_STAHOVANI_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.role) synchronizuj(); });
  window.addEventListener('online', () => { if (state.role) synchronizuj(); });
}

// ---------- přihlášení a odhlášení ----------
async function prihlasitPinem(role, pin) {
  let r, data = null;
  try {
    r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, pin }) });
    data = await r.json();
  } catch (e) { throw new ApiChyba(0, 'Bez připojení k serveru — zkus to znovu.'); }
  if (!r.ok) throw new ApiChyba(r.status, (data && data.error) || 'Přihlášení se nepovedlo.');
  resetStavu();
  ulozRelaci({ token: data.token, role: data.role, driverId: data.driverId, driverName: data.driverName });
  state.role = data.role; state.driverId = data.driverId; state.driverName = data.driverName;
  sync.initialLoadDone = false;   // první stažení po přihlášení přinese spoustu "nových" záznamů — notifikace z nich nechceme
  await plneStazeni();
  sync.initialLoadDone = true;
  sync.me = { ...(sync.me || {}), mustChangePin: data.mustChangePin };
  return data;
}

function smazMistniData() {
  smazRelaci();
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  resetStavu();
}

// Odhlášení: nejdřív se pokusí odeslat, co zbývá; při neúspěchu se zeptá, jestli změny zahodit
async function odhlasit() {
  try { await odesli(); } catch (e) { /* offline */ }
  const zbyva = pocetNeodeslanych();
  if (zbyva && !confirm(`Neodeslaných změn: ${zbyva} (chybí připojení).\nPo odhlášení se ztratí. Opravdu se odhlásit?`)) return false;
  try { await fetch('/api/logout', { method: 'POST' }); } catch {}
  smazMistniData();
  return true;
}

// Server řekl, že relace neplatí (vypršela, změnil se PIN, řidič byl smazán)
function vynucenyOdhlas() {
  smazMistniData();
  if (typeof zobrazPrihlaseni === 'function') zobrazPrihlaseni('Přihlášení vypršelo nebo bylo změněno — přihlas se prosím znovu.');
}
