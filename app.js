/* =========================================================
   VONDRÁŠEK — PROVOZNÍ SYSTÉM v2
   + Editace vozidel/řidičů/zakázek
   + Filtrování zakázek podle stavu
   + Export jízd podle měsíce
   + Graf km na dashboardu
   + Barevné karty zakázek
========================================================= */

const STORAGE_KEY = 'vondrasek_app_v1';
const state = loadState() || {
  role: null, driverName: null,
  jizdy: seedJizdy(), tankovani: seedTankovani(),
  vozidla: seedVozidla(), ridici: seedRidici(), zakazky: seedZakazky()
};

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } }

function seedJizdy() {
  return [
    { id: 1, datum: '2026-08-01', ridic: 'Novák J.', vozidlo: '3C1 2345', trasaOd: 'Jindřichův Hradec', trasaDo: 'Praha', km: 145, poznamka: 'Palety pro velkoobchod' },
    { id: 2, datum: '2026-08-02', ridic: 'Svoboda M.', vozidlo: '3C2 5678', trasaOd: 'Praha', trasaDo: 'Mnichov', km: 380, poznamka: 'Mezinárodní přeprava' },
    { id: 3, datum: '2026-07-28', ridic: 'Novák J.', vozidlo: '3C1 2345', trasaOd: 'Praha', trasaDo: 'Jindřichův Hradec', km: 145, poznamka: 'Zpáteční jízda' },
    { id: 4, datum: '2026-07-15', ridic: 'Svoboda M.', vozidlo: '3C2 5678', trasaOd: 'Brno', trasaDo: 'Varšava', km: 550, poznamka: 'Celovůz' },
    { id: 5, datum: '2026-06-20', ridic: 'Novák J.', vozidlo: '3C1 2345', trasaOd: 'Praha', trasaDo: 'Vídeň', km: 295, poznamka: 'Express' },
    { id: 6, datum: '2026-06-10', ridic: 'Svoboda M.', vozidlo: '3C2 5678', trasaOd: 'Ostrava', trasaDo: 'Praha', km: 370, poznamka: '' }
  ];
}
function seedTankovani() {
  return [
    { id: 1, datum: '2026-08-01', vozidlo: '3C1 2345', litry: 85, cenaCelkem: 3060, misto: 'OMV Praha', ridic: 'Novák J.' },
    { id: 2, datum: '2026-08-02', vozidlo: '3C2 5678', litry: 220, cenaCelkem: 7920, misto: 'Shell Rozvadov', ridic: 'Svoboda M.' }
  ];
}
function seedVozidla() {
  return [
    { id: 1, spz: '3C1 2345', typ: 'Dodávka', znacka: 'Mercedes Sprinter', stk: '2027-03-15', pojistka: '2027-01-01', poznamka: 'V provozu' },
    { id: 2, spz: '3C2 5678', typ: 'Kamion', znacka: 'MAN TGX', stk: '2026-11-20', pojistka: '2027-05-10', poznamka: 'V provozu' },
    { id: 3, spz: '3C3 9012', typ: 'Kamion', znacka: 'Volvo FH', stk: '2026-09-05', pojistka: '2026-12-15', poznamka: 'STK se blíží' }
  ];
}
function seedRidici() {
  return [
    { id: 1, jmeno: 'Novák Jan', telefon: '+420 601 111 222', skupina: 'C+E', kartaRidice: '2028-04-10', profesniPrukaz: '2027-06-20', pin: '1111' },
    { id: 2, jmeno: 'Svoboda Martin', telefon: '+420 602 333 444', skupina: 'C', kartaRidice: '2027-11-05', profesniPrukaz: '2028-01-15', pin: '2222' }
  ];
}
function seedZakazky() {
  return [
    { id: 1, klient: 'Výrobní firma Brno', trasa: 'Brno → Vídeň', datum: '2026-08-05', stav: 'Naplánováno', cena: 12500, poznamka: '' },
    { id: 2, klient: 'Velkoobchod Praha', trasa: 'Praha → Berlín', datum: '2026-08-07', stav: 'Probíhá', cena: 18000, poznamka: 'Urgentní' },
    { id: 3, klient: 'E-shop Plzeň', trasa: 'Plzeň → Mnichov', datum: '2026-07-20', stav: 'Dokončeno', cena: 9500, poznamka: '' },
    { id: 4, klient: 'Stavební firma', trasa: 'Praha → Ostrava', datum: '2026-07-10', stav: 'Dokončeno', cena: 7800, poznamka: '' }
  ];
}

// ---------- LOGIN ----------
document.querySelector('[data-role="owner"]').addEventListener('click', () => {
  state.role = 'owner'; state.driverName = null; state.driverId = null;
  saveState(); showApp();
});

document.getElementById('btnDriverLogin').addEventListener('click', () => {
  document.getElementById('loginStep1').hidden = true;
  document.getElementById('loginStep2').hidden = false;
  document.getElementById('pinInput').value = '';
  document.getElementById('pinError').hidden = true;
  document.getElementById('pinInput').focus();
});

document.getElementById('btnPinBack').addEventListener('click', () => {
  document.getElementById('loginStep2').hidden = true;
  document.getElementById('loginStep1').hidden = false;
});

function tryPinLogin() {
  const pin = document.getElementById('pinInput').value.trim();
  const ridic = state.ridici.find(r => r.pin === pin);
  if (!ridic) {
    document.getElementById('pinError').hidden = false;
    document.getElementById('pinInput').value = '';
    document.getElementById('pinInput').focus();
    return;
  }
  state.role = 'driver';
  state.driverName = ridic.jmeno;
  state.driverId = ridic.id;
  saveState(); showApp();
}
document.getElementById('btnPinConfirm').addEventListener('click', tryPinLogin);
document.getElementById('pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryPinLogin(); });
document.getElementById('pinInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  state.role = null; state.driverName = null; state.driverId = null; saveState();
  document.getElementById('app').hidden = true;
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('loginStep1').hidden = false;
  document.getElementById('loginStep2').hidden = true;
});
function showApp() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('app').hidden = false;
  const isOwner = state.role === 'owner';
  document.getElementById('userIc').textContent = isOwner ? '👔' : '🚚';
  document.getElementById('userName').textContent = isOwner ? 'Majitel' : state.driverName;
  document.getElementById('userRole').textContent = isOwner ? 'Plný přístup' : 'Vidí jen svoje';
  if (!isOwner) applyDriverView();
  renderSection('dashboard');
}
function applyDriverView() {
  const allowed = ['dashboard', 'jizdy', 'tankovani'];
  document.querySelectorAll('.nav-item').forEach(item => {
    if (!allowed.includes(item.dataset.section)) {
      item.style.opacity = '0.35'; item.style.pointerEvents = 'none';
    }
  });
}
// (auto-login trigger moved to end of file, after SECTIONS is defined)

// ---------- NAVIGATION ----------
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    renderSection(item.dataset.section);
    document.querySelector('.sidebar').classList.remove('open');
  });
});
document.getElementById('menuToggle').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.toggle('open');
});

// ---------- ROUTER ----------
function renderSection(name) {
  const content = document.getElementById('content');
  document.getElementById('topbarTitle').textContent = SECTIONS[name]?.title || 'Dashboard';
  content.innerHTML = (SECTIONS[name] || SECTIONS.dashboard).render();
  if (SECTIONS[name]?.after) SECTIONS[name].after();
}

const SECTIONS = {
  dashboard:    { title: 'Dashboard', render: renderDashboard, after: bindDashboard },
  jizdy:        { title: 'Evidence jízd', render: renderJizdy, after: bindJizdy },
  tankovani:    { title: 'Tankování', render: renderTankovani, after: bindTankovani },
  vozidla:      { title: 'Vozidla', render: renderVozidla, after: bindVozidla },
  ridici:       { title: 'Řidiči', render: renderRidici, after: bindRidici },
  zakazky:      { title: 'Zakázky', render: renderZakazky, after: bindZakazky },
  web:          { title: 'Web', render: () => cs('Fáze 1','🌐','Web','Sledování výkonu webu, návštěvnosti a získaných poptávek.',['Návštěvnost','Odeslané poptávky','Konverzní míra','Zdroj návštěvníků']) },
  google:       { title: 'Google', render: () => cs('Fáze 1','🔍','Google','Přehled Google Business Profile, Ads kampaní a Search Console.',['Zobrazení v mapách','Recenze','Google Ads výkon','Search Console pozice']) },
  seznam:       { title: 'Seznam / Sklik', render: () => cs('Fáze 1','📍','Seznam / Sklik','Přehled Firmy.cz, Mapy.cz a Sklik kampaní.',['Zobrazení na Firmy.cz','Kliknutí z map','Sklik výkon','Rozpočet a náklady']) },
  nabor:        { title: 'Nábor řidičů', render: () => cs('Fáze 1','🎯','Nábor řidičů','Přehled inzerátů a kandidátů na pozici řidiče skupiny C.',['Aktivní inzeráty','Kandidáti','FB Ads na nábor','Jobs.cz / Práce.cz']) },
  'ai-poptavky':{ title: 'AI správce poptávek', render: () => cs('Fáze 2 · 2026','📥','AI správce poptávek','Automatické zpracování příchozích poptávek.',['Automatická extrakce dat','Notifikace na e-mail','Zápis do přehledu','Statistika poptávek']) },
  'ai-chatbot': { title: 'Náborový chatbot', render: () => cs('Fáze 2 · 2026','💬','Náborový chatbot','Chatbot na webu, který odpovídá řidičům na typické dotazy.',['Rule-based logika','FAQ o mzdě a trasách','Sběr kontaktů','Předání náboráři']) },
  'ai-marketing':{ title: 'Marketing pomocník', render: () => cs('Fáze 2 · 2026','🤖','Marketing pomocník','Šablony příspěvků, inzerátů a měsíčních reportů.',['Šablony pro FB / LinkedIn','Šablony inzerátů','Měsíční report','Doporučení podle dat']) },
  dispecink:    { title: 'AI dispečink', render: () => cs('Fáze 3 · 2027','🧭','AI dispečink','Návrhy optimálního přiřazení vozidel a tras.',['Optimalizace tras','Přiřazení vozidel','Vytížení flotily','Snížení prázdných km']) },
  kalkulace:    { title: 'Automatické kalkulace', render: () => cs('Fáze 3 · 2027','🧮','Automatické kalkulace','Předběžný výpočet ceny přepravy.',['Kalkulátor ceny','Podle vzdálenosti','Podle typu nákladu','Podle sezóny']) },
  whatsapp:     { title: 'WhatsApp asistent', render: () => cs('Fáze 3 · 2027','📱','WhatsApp asistent','Komunikace s klienty a řidiči přes WhatsApp.',['Notifikace klientům','Komunikace s řidiči','Automatické odpovědi','Napojení na poptávky']) },
  hlas:         { title: 'Hlasový asistent', render: () => cs('Fáze 3 · 2027','🎙️','Hlasový asistent','Hlasové zadávání poptávek a dotazů.',['Hlasové ovládání','Přepis hovorů','Automatická evidence','Pro dispečink']) },
  integrace:    { title: 'Napojení na systémy', render: () => cs('Fáze 3 · 2027','🔗','Napojení na systémy','Propojení s účetnictvím, GPS a burzami nákladů.',['Účetní systémy','GPS jednotky','Tankovací karty','Burzy nákladů']) },
  'reporty-ai': { title: 'Prediktivní reporty', render: () => cs('Fáze 3 · 2027','📈','Prediktivní reporty','Předpovědi vytíženosti a doporučení pro růst.',['Predikce sezónnosti','Vytížení flotily','Doporučení pro růst','Analýza trendů']) },
  reporty:      { title: 'Reporty', render: renderReporty },
  fakturace:    { title: 'Podklady k fakturaci', render: renderFakturace }
};

// ==========================================================
// DASHBOARD
// ==========================================================
function renderDashboard() {
  const isOwner = state.role === 'owner';
  const myJizdy = isOwner ? state.jizdy : state.jizdy.filter(j => j.ridic.startsWith((state.driverName||'').split(' ')[0]));
  const kmCelkem = myJizdy.reduce((s,j) => s + (+j.km||0), 0);
  const litryCelkem = state.tankovani.reduce((s,t) => s + (+t.litry||0), 0);
  const nakladyPHM = state.tankovani.reduce((s,t) => s + (+t.cenaCelkem||0), 0);

  // Graf — km za posledních 6 měsíců
  const grafData = kmPoslednich6Mesicu(myJizdy);
  const maxKm = Math.max(...grafData.map(d => d.km), 1);

  return `
    <div class="page-head">
      <div>
        <h1>Vítej${isOwner ? ', Jardo' : ', ' + (state.driverName||'')}</h1>
        <p>Přehled provozu — aktuální stav systému.</p>
      </div>
      ${isOwner ? `<div class="page-actions"><button class="btn btn-ghost btn-sm" id="btnResetData" style="border-color:var(--red);color:var(--red);">🗑️ Smazat ukázková data</button></div>` : ''}
    </div>

    <div class="metrics">
      <div class="metric"><div class="m-label">Najeté km</div><div class="m-value">${kmCelkem.toLocaleString('cs-CZ')}</div><div class="m-delta">▲ celkem</div></div>
      <div class="metric"><div class="m-label">Počet jízd</div><div class="m-value">${myJizdy.length}</div><div class="m-delta">▲ celkem</div></div>
      ${isOwner ? `
      <div class="metric"><div class="m-label">Vozidla</div><div class="m-value">${state.vozidla.length}</div><div class="m-delta neutral">v systému</div></div>
      <div class="metric"><div class="m-label">Řidiči</div><div class="m-value">${state.ridici.length}</div><div class="m-delta neutral">v systému</div></div>
      ` : ''}
      <div class="metric"><div class="m-label">Natankováno litrů</div><div class="m-value">${litryCelkem.toLocaleString('cs-CZ')}</div><div class="m-delta neutral">celkem</div></div>
      <div class="metric"><div class="m-label">Náklady PHM</div><div class="m-value">${nakladyPHM.toLocaleString('cs-CZ')} Kč</div><div class="m-delta neutral">celkem</div></div>
    </div>

    <!-- GRAF -->
    <div class="card-panel" style="margin-bottom:20px;">
      <h3>📊 Najeté km — posledních 6 měsíců</h3>
      <p class="csub">Součet km za každý měsíc.</p>
      <div style="display:flex; align-items:flex-end; gap:10px; height:140px; margin-top:16px; padding:0 4px;">
        ${grafData.map(d => `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:6px;">
            <span style="font-size:11px; color:var(--muted);">${d.km > 0 ? d.km.toLocaleString('cs-CZ') : ''}</span>
            <div style="
              width:100%; border-radius:6px 6px 0 0;
              height:${d.km > 0 ? Math.max(Math.round((d.km/maxKm)*100), 6) : 3}px;
              background:${d.km > 0 ? 'linear-gradient(180deg,var(--purple),var(--blue))' : 'var(--card)'};
              transition: height 0.4s ease;
            "></div>
            <span style="font-size:11px; color:var(--dim); white-space:nowrap;">${d.label}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="grid-2">
      <div class="card-panel">
        <h3>🛣️ Poslední jízdy</h3>
        <p class="csub">Nejnovější zápisy z evidence.</p>
        <table class="data-table">
          <thead><tr><th>Datum</th><th>Řidič</th><th>Trasa</th><th style="text-align:right">km</th></tr></thead>
          <tbody>
            ${myJizdy.slice(0,5).map(j => `
              <tr>
                <td>${formatDate(j.datum)}</td>
                <td>${j.ridic}</td>
                <td>${j.trasaOd} → ${j.trasaDo}</td>
                <td style="text-align:right">${j.km}</td>
              </tr>
            `).join('') || '<tr><td colspan="4" class="empty-state">Žádné jízdy</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="card-panel">
        <h3>⚠️ Upozornění</h3>
        <p class="csub">Blížící se termíny.</p>
        ${renderUpozorneni()}
      </div>
    </div>

    ${isOwner ? `
    <div class="card-panel" style="margin-top:20px;">
      <h3>📋 Aktivní zakázky</h3>
      <p class="csub">Naplánované a probíhající zakázky.</p>
      <div style="display:flex; flex-wrap:wrap; gap:12px; margin-top:8px;">
        ${state.zakazky.filter(z => z.stav !== 'Dokončeno' && z.stav !== 'Zrušeno').map(z => zakazkaKarta(z)).join('') || '<p style="color:var(--muted);font-size:13px;">Žádné aktivní zakázky.</p>'}
      </div>
    </div>
    ` : ''}
  `;
}

function kmPoslednich6Mesicu(jizdy) {
  const mesice = ['Led','Úno','Bře','Dub','Kvě','Čvn','Čvc','Srp','Zář','Říj','Lis','Pro'];
  const now = new Date();
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const km = jizdy.filter(j => {
      const jd = new Date(j.datum);
      return jd.getFullYear() === y && jd.getMonth() === m;
    }).reduce((s,j) => s + (+j.km||0), 0);
    result.push({ label: mesice[m], km });
  }
  return result;
}

function zakazkaKarta(z) {
  const colors = { 'Naplánováno': 'var(--amber)', 'Probíhá': 'var(--cyan)', 'Dokončeno': 'var(--green)', 'Zrušeno': 'var(--red)' };
  const bgs = { 'Naplánováno': 'rgba(245,158,11,0.1)', 'Probíhá': 'rgba(34,211,238,0.1)', 'Dokončeno': 'rgba(16,185,129,0.1)', 'Zrušeno': 'rgba(239,68,68,0.1)' };
  const col = colors[z.stav] || 'var(--muted)';
  const bg = bgs[z.stav] || 'var(--card)';
  return `
    <div style="background:${bg}; border:1px solid ${col}; border-radius:12px; padding:16px 18px; min-width:220px; flex:1;">
      <div style="font-size:11px; font-weight:700; color:${col}; letter-spacing:1px; margin-bottom:6px;">${z.stav.toUpperCase()}</div>
      <div style="font-weight:700; font-size:15px; color:var(--white); margin-bottom:4px;">${z.klient}</div>
      <div style="font-size:12.5px; color:var(--muted); margin-bottom:8px;">${z.trasa}</div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; color:var(--dim);">${formatDate(z.datum)}</span>
        <span style="font-size:14px; font-weight:700; color:var(--white);">${(+z.cena||0).toLocaleString('cs-CZ')} Kč</span>
      </div>
    </div>
  `;
}

function bindDashboard() {
  const btn = document.getElementById('btnResetData');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!confirm('Smazat všechna ukázková data?\n\nZůstane prázdný systém připravený pro reálná data. Tato akce je nevratná.')) return;
    state.jizdy = []; state.tankovani = []; state.vozidla = []; state.ridici = []; state.zakazky = [];
    saveState(); renderSection('dashboard');
  });
}

function renderUpozorneni() {
  const dnes = new Date();
  const varovani = [];
  state.vozidla.forEach(v => {
    const s = daysDiff(v.stk, dnes);
    if (s <= 60 && s >= 0) varovani.push({ ico:'🔧', text:`STK vozidla ${v.spz} za ${s} dní`, level: s<=30?'err':'warn' });
    const p = daysDiff(v.pojistka, dnes);
    if (p <= 60 && p >= 0) varovani.push({ ico:'🛡️', text:`Pojistka vozidla ${v.spz} za ${p} dní`, level: p<=30?'err':'warn' });
  });
  state.ridici.forEach(r => {
    const k = daysDiff(r.kartaRidice, dnes);
    if (k <= 60 && k >= 0) varovani.push({ ico:'💳', text:`Karta řidiče ${r.jmeno} vyprší za ${k} dní`, level:'warn' });
  });
  if (!varovani.length) return `<div class="empty-state"><div class="empty-ic">✅</div>Žádná upozornění.</div>`;
  return varovani.map(v => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--card);border-radius:var(--radius-sm);margin-bottom:8px;border-left:3px solid ${v.level==='err'?'var(--red)':'var(--amber)'};">
      <span style="font-size:18px;">${v.ico}</span>
      <div style="flex:1;font-size:13px;">${v.text}</div>
      <span class="badge ${v.level}">${v.level==='err'?'Urgentní':'Brzy'}</span>
    </div>
  `).join('');
}

// ==========================================================
// EVIDENCE JÍZD
// ==========================================================
function renderJizdy() {
  const isOwner = state.role === 'owner';
  const list = isOwner ? state.jizdy : state.jizdy.filter(j => j.ridic.startsWith((state.driverName||'').split(' ')[0]));
  return `
    <div class="page-head">
      <div><h1>🛣️ Evidence jízd</h1><p>${isOwner ? 'Přehled všech jízd — filtruj, hledej, exportuj.' : 'Tvoje jízdy.'}</p></div>
      <div class="page-actions"><button class="btn btn-primary" id="btnAddJizda">+ Nová jízda</button></div>
    </div>
    <div class="table-wrap">
      <div class="table-toolbar">
        <input type="text" id="jizdyFilter" placeholder="Hledat (řidič, trasa, vozidlo...)">
        <select id="jizdyMesic">
          <option value="">Všechny měsíce</option>
          ${posledni12Mesicu().map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <button class="btn btn-ghost btn-sm" id="btnExportJizdy">📥 Export CSV</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Datum</th><th>Řidič</th><th>Vozidlo</th><th>Trasa</th><th style="text-align:right">km</th><th>Poznámka</th>${isOwner?'<th></th>':''}</tr></thead>
        <tbody id="jizdyBody">${renderJizdyRows(list, isOwner)}</tbody>
      </table>
    </div>
    ${renderJizdaModal()}
  `;
}

function renderJizdyRows(list, isOwner) {
  if (!list.length) return `<tr><td colspan="${isOwner?7:6}"><div class="empty-state"><div class="empty-ic">🛣️</div>Žádné jízdy.</div></td></tr>`;
  return list.map(j => `
    <tr>
      <td>${formatDate(j.datum)}</td><td>${j.ridic}</td><td>${j.vozidlo}</td>
      <td>${j.trasaOd} → ${j.trasaDo}</td>
      <td style="text-align:right">${j.km}</td>
      <td style="color:var(--muted);font-size:12.5px;">${j.poznamka||'—'}</td>
      ${isOwner?`<td><button class="btn btn-danger btn-sm" onclick="deleteJizda(${j.id})">Smazat</button></td>`:''}
    </tr>
  `).join('');
}

function bindJizdy() {
  const isOwner = state.role === 'owner';
  document.getElementById('btnAddJizda').addEventListener('click', () => openModal('jizdaModal'));
  document.getElementById('btnExportJizdy').addEventListener('click', exportJizdyCSV);

  function applyFilter() {
    const q = (document.getElementById('jizdyFilter').value||'').toLowerCase();
    const m = document.getElementById('jizdyMesic').value;
    let list = isOwner ? state.jizdy : state.jizdy.filter(j => j.ridic.startsWith((state.driverName||'').split(' ')[0]));
    if (q) list = list.filter(j => `${j.ridic} ${j.trasaOd} ${j.trasaDo} ${j.vozidlo} ${j.poznamka||''}`.toLowerCase().includes(q));
    if (m) list = list.filter(j => j.datum.startsWith(m));
    document.getElementById('jizdyBody').innerHTML = renderJizdyRows(list, isOwner);
  }
  document.getElementById('jizdyFilter').addEventListener('input', applyFilter);
  document.getElementById('jizdyMesic').addEventListener('change', applyFilter);

  document.getElementById('jizdaForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.jizdy.unshift({ id: Date.now(), datum: fd.get('datum'), ridic: fd.get('ridic'), vozidlo: fd.get('vozidlo'), trasaOd: fd.get('trasaOd'), trasaDo: fd.get('trasaDo'), km: +fd.get('km'), poznamka: fd.get('poznamka') });
    saveState(); closeModal('jizdaModal'); renderSection('jizdy');
  });
}

function renderJizdaModal() {
  const dnes = new Date().toISOString().slice(0,10);
  const isDriver = state.role === 'driver';
  return `
    <div class="modal-overlay" id="jizdaModal">
      <div class="modal">
        <h2>Nová jízda</h2><p class="modal-sub">Vyplň údaje o jízdě.</p>
        <form id="jizdaForm">
          <div class="form-cols-2">
            <div class="form-row"><label>Datum *</label><input type="date" name="datum" value="${dnes}" required></div>
            <div class="form-row"><label>Řidič *</label>
              <select name="ridic" required>
                ${state.ridici.map(r => { const s = r.jmeno.split(' ')[0]+' '+r.jmeno.split(' ')[1][0]+'.'; return `<option value="${s}" ${isDriver&&r.jmeno===state.driverName?'selected':''}>${r.jmeno}</option>`; }).join('')}
                ${state.ridici.length===0?'<option>Nejprve přidej řidiče</option>':''}
              </select>
            </div>
          </div>
          <div class="form-row"><label>Vozidlo *</label>
            <select name="vozidlo" required>
              ${state.vozidla.map(v => `<option value="${v.spz}">${v.spz} — ${v.znacka}</option>`).join('')}
              ${state.vozidla.length===0?'<option>Nejprve přidej vozidlo</option>':''}
            </select>
          </div>
          <div class="form-cols-2">
            <div class="form-row"><label>Odkud *</label><input type="text" name="trasaOd" required placeholder="např. Praha"></div>
            <div class="form-row"><label>Kam *</label><input type="text" name="trasaDo" required placeholder="např. Mnichov"></div>
          </div>
          <div class="form-row"><label>Kilometry *</label><input type="number" name="km" required min="1" placeholder="např. 380"></div>
          <div class="form-row"><label>Poznámka</label><textarea name="poznamka" rows="2"></textarea></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeModal('jizdaModal')">Zrušit</button>
            <button type="submit" class="btn btn-primary">Uložit jízdu</button>
          </div>
        </form>
      </div>
    </div>
  `;
}
window.deleteJizda = function(id) { if(!confirm('Smazat jízdu?')) return; state.jizdy = state.jizdy.filter(j=>j.id!==id); saveState(); renderSection('jizdy'); };

function exportJizdyCSV() {
  const isOwner = state.role === 'owner';
  const mesic = document.getElementById('jizdyMesic')?.value || '';
  let list = isOwner ? state.jizdy : state.jizdy.filter(j => j.ridic.startsWith((state.driverName||'').split(' ')[0]));
  if (mesic) list = list.filter(j => j.datum.startsWith(mesic));
  const rows = [['Datum','Řidič','Vozidlo','Odkud','Kam','km','Poznámka'], ...list.map(j=>[j.datum,j.ridic,j.vozidlo,j.trasaOd,j.trasaDo,j.km,j.poznamka||''])];
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile('jizdy.csv','text/csv;charset=utf-8;','\uFEFF'+csv);
}

// ==========================================================
// TANKOVÁNÍ
// ==========================================================
function renderTankovani() {
  return `
    <div class="page-head">
      <div><h1>⛽ Tankování</h1><p>Evidence tankování — litry, cena, spotřeba.</p></div>
      <div class="page-actions"><button class="btn btn-primary" id="btnAddTank">+ Nové tankování</button></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Datum</th><th>Vozidlo</th><th>Řidič</th><th>Místo</th><th style="text-align:right">Litry</th><th style="text-align:right">Cena</th><th>Účtenka</th><th></th></tr></thead>
        <tbody>
          ${state.tankovani.length===0 ? `<tr><td colspan="8"><div class="empty-state"><div class="empty-ic">⛽</div>Žádné záznamy.</div></td></tr>` :
          state.tankovani.map(t=>`
            <tr>
              <td>${formatDate(t.datum)}</td><td>${t.vozidlo}</td><td>${t.ridic}</td><td>${t.misto}</td>
              <td style="text-align:right">${t.litry} l</td>
              <td style="text-align:right"><b>${(+t.cenaCelkem).toLocaleString('cs-CZ')} Kč</b></td>
              <td>${t.uctenka ? `<img src="${t.uctenka}" class="receipt-thumb" onclick="showReceipt('${t.uctenka}')" alt="Účtenka">` : '<span style="color:var(--dim);font-size:12px;">—</span>'}</td>
              <td><button class="btn btn-danger btn-sm" onclick="deleteTank(${t.id})">Smazat</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${renderTankModal()}
    ${renderReceiptLightbox()}
  `;
}
function renderReceiptLightbox() {
  return `
    <div class="modal-overlay" id="receiptLightbox" onclick="closeModal('receiptLightbox')">
      <div style="max-width:90vw; max-height:90vh;" onclick="event.stopPropagation()">
        <img id="receiptLightboxImg" src="" style="max-width:100%; max-height:85vh; border-radius:12px; display:block;">
        <button class="btn btn-ghost btn-block" style="margin-top:12px;" onclick="closeModal('receiptLightbox')">Zavřít</button>
      </div>
    </div>
  `;
}
window.showReceipt = function(src) {
  document.getElementById('receiptLightboxImg').src = src;
  openModal('receiptLightbox');
};

function renderTankModal() {
  const dnes = new Date().toISOString().slice(0,10);
  const isDriver = state.role === 'driver';
  return `
    <div class="modal-overlay" id="tankModal">
      <div class="modal">
        <h2>Nové tankování</h2><p class="modal-sub">Zápis o tankování — klidně vyfoť účtenku.</p>
        <form id="tankForm">
          <div class="form-cols-2">
            <div class="form-row"><label>Datum *</label><input type="date" name="datum" value="${dnes}" required></div>
            <div class="form-row"><label>Místo *</label><input type="text" name="misto" required placeholder="např. OMV Praha"></div>
          </div>
          <div class="form-cols-2">
            <div class="form-row"><label>Vozidlo *</label><select name="vozidlo" required>${state.vozidla.map(v=>`<option>${v.spz}</option>`).join('')}</select></div>
            <div class="form-row"><label>Řidič *</label>
              <select name="ridic" required>
                ${state.ridici.map(r => { const s = r.jmeno.split(' ')[0]+' '+r.jmeno.split(' ')[1][0]+'.'; return `<option ${isDriver && r.id===state.driverId?'selected':''}>${s}</option>`; }).join('')}
              </select>
            </div>
          </div>
          <div class="form-cols-2">
            <div class="form-row"><label>Litry *</label><input type="number" name="litry" step="0.01" required></div>
            <div class="form-row"><label>Cena celkem (Kč) *</label><input type="number" name="cenaCelkem" step="0.01" required></div>
          </div>
          <div class="form-row">
            <label>📷 Fotka účtenky (nepovinné)</label>
            <input type="file" name="uctenka" id="uctenkaInput" accept="image/*" capture="environment">
            <div id="uctenkaPreviewWrap" style="display:none; margin-top:10px;">
              <img id="uctenkaPreview" style="max-width:160px; border-radius:8px; border:1px solid var(--border-c);">
              <button type="button" class="btn btn-ghost btn-sm" id="btnRemoveUctenka" style="margin-left:10px;">Odebrat fotku</button>
            </div>
            <span style="font-size:11.5px; color:var(--dim); margin-top:4px; display:block;">Fotka se zmenší, aby zbytečně nezabírala místo. Slouží jako doklad k záznamu.</span>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeModal('tankModal')">Zrušit</button>
            <button type="submit" class="btn btn-primary">Uložit</button>
          </div>
        </form>
      </div>
    </div>
  `;
}
function bindTankovani() {
  let uctenkaBase64 = null;

  document.getElementById('btnAddTank').addEventListener('click', () => {
    uctenkaBase64 = null;
    openModal('tankModal');
  });

  const uctenkaInput = document.getElementById('uctenkaInput');
  uctenkaInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    resizeImageToBase64(file, 900, 0.72).then(base64 => {
      uctenkaBase64 = base64;
      document.getElementById('uctenkaPreview').src = base64;
      document.getElementById('uctenkaPreviewWrap').style.display = 'block';
    });
  });
  document.getElementById('btnRemoveUctenka').addEventListener('click', () => {
    uctenkaBase64 = null;
    uctenkaInput.value = '';
    document.getElementById('uctenkaPreviewWrap').style.display = 'none';
  });

  document.getElementById('tankForm').addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    state.tankovani.unshift({
      id: Date.now(), datum: fd.get('datum'), vozidlo: fd.get('vozidlo'), ridic: fd.get('ridic'),
      misto: fd.get('misto'), litry: +fd.get('litry'), cenaCelkem: +fd.get('cenaCelkem'),
      uctenka: uctenkaBase64
    });
    saveState(); closeModal('tankModal'); renderSection('tankovani');
  });
}
window.deleteTank = function(id) { if(!confirm('Smazat záznam?')) return; state.tankovani = state.tankovani.filter(t=>t.id!==id); saveState(); renderSection('tankovani'); };

// Zmenší fotku na max šířku a zakóduje do base64 (JPEG), ať nezaplní localStorage
function resizeImageToBase64(file, maxWidth, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ==========================================================
// VOZIDLA — CRUD + EDITACE
// ==========================================================
function renderVozidla() {
  return `
    <div class="page-head">
      <div><h1>🚛 Vozidla</h1><p>Přehled vozového parku, STK a pojistek.</p></div>
      <div class="page-actions"><button class="btn btn-primary" id="btnAddVozidlo">+ Nové vozidlo</button></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>SPZ</th><th>Typ</th><th>Značka</th><th>STK</th><th>Pojistka</th><th>Poznámka</th><th></th></tr></thead>
        <tbody>
          ${state.vozidla.length===0 ? `<tr><td colspan="7"><div class="empty-state"><div class="empty-ic">🚛</div>Žádná vozidla — přidej první.</div></td></tr>` :
          state.vozidla.map(v=>`
            <tr>
              <td><b>${v.spz}</b></td><td>${v.typ}</td><td>${v.znacka}</td>
              <td>${formatDate(v.stk)} ${termBadge(v.stk)}</td>
              <td>${formatDate(v.pojistka)} ${termBadge(v.pojistka)}</td>
              <td style="color:var(--muted);font-size:12.5px;">${v.poznamka||'—'}</td>
              <td style="display:flex;gap:6px;">
                <button class="btn btn-ghost btn-sm" onclick="editVozidlo(${v.id})">Upravit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteVozidlo(${v.id})">Smazat</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${renderVozidloModal()}
  `;
}
function renderVozidloModal(v={}) {
  return `
    <div class="modal-overlay" id="vozidloModal">
      <div class="modal">
        <h2 id="vozidloModalTitle">${v.id?'Upravit vozidlo':'Nové vozidlo'}</h2>
        <p class="modal-sub">Vyplň údaje o vozidle.</p>
        <form id="vozidloForm">
          <input type="hidden" name="editId" value="${v.id||''}">
          <div class="form-cols-2">
            <div class="form-row"><label>SPZ *</label><input type="text" name="spz" required value="${v.spz||''}" placeholder="např. 3C1 2345"></div>
            <div class="form-row"><label>Typ *</label>
              <select name="typ" required>
                ${['Dodávka','Kamion','Tahač','Návěs','Jiné'].map(t=>`<option ${v.typ===t?'selected':''}>${t}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row"><label>Značka a model *</label><input type="text" name="znacka" required value="${v.znacka||''}" placeholder="např. Mercedes Sprinter 316"></div>
          <div class="form-cols-2">
            <div class="form-row"><label>STK platná do *</label><input type="date" name="stk" required value="${v.stk||''}"></div>
            <div class="form-row"><label>Pojistka platná do *</label><input type="date" name="pojistka" required value="${v.pojistka||''}"></div>
          </div>
          <div class="form-row"><label>Poznámka</label><input type="text" name="poznamka" value="${v.poznamka||''}" placeholder="např. V provozu"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeModal('vozidloModal')">Zrušit</button>
            <button type="submit" class="btn btn-primary">${v.id?'Uložit změny':'Přidat vozidlo'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}
function bindVozidla() {
  document.getElementById('btnAddVozidlo').addEventListener('click', () => openModal('vozidloModal'));
  document.getElementById('vozidloForm').addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    const editId = fd.get('editId');
    const data = { spz: fd.get('spz'), typ: fd.get('typ'), znacka: fd.get('znacka'), stk: fd.get('stk'), pojistka: fd.get('pojistka'), poznamka: fd.get('poznamka') };
    if (editId) {
      const idx = state.vozidla.findIndex(v=>v.id===+editId);
      if (idx>=0) state.vozidla[idx] = { ...state.vozidla[idx], ...data };
    } else {
      state.vozidla.push({ id: Date.now(), ...data });
    }
    saveState(); closeModal('vozidloModal'); renderSection('vozidla');
  });
}
window.editVozidlo = function(id) {
  const v = state.vozidla.find(v=>v.id===id);
  if (!v) return;
  document.getElementById('content').querySelector('.modal-overlay').remove();
  document.getElementById('content').insertAdjacentHTML('beforeend', renderVozidloModal(v));
  bindVozidla();
  openModal('vozidloModal');
};
window.deleteVozidlo = function(id) { if(!confirm('Smazat vozidlo?')) return; state.vozidla = state.vozidla.filter(v=>v.id!==id); saveState(); renderSection('vozidla'); };

// ==========================================================
// ŘIDIČI — CRUD + EDITACE
// ==========================================================
function renderRidici() {
  return `
    <div class="page-head">
      <div><h1>👷 Řidiči</h1><p>Seznam řidičů, karty a průkazy.</p></div>
      <div class="page-actions"><button class="btn btn-primary" id="btnAddRidic">+ Nový řidič</button></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Jméno</th><th>Telefon</th><th>Skupina</th><th>Karta řidiče</th><th>Profesní průkaz</th><th></th></tr></thead>
        <tbody>
          ${state.ridici.length===0 ? `<tr><td colspan="6"><div class="empty-state"><div class="empty-ic">👷</div>Žádní řidiči — přidej prvního.</div></td></tr>` :
          state.ridici.map(r=>`
            <tr>
              <td><b>${r.jmeno}</b></td>
              <td><a href="tel:${r.telefon.replace(/\s/g,'')}" style="color:var(--cyan);">${r.telefon}</a></td>
              <td><span class="badge info">${r.skupina}</span></td>
              <td>${formatDate(r.kartaRidice)} ${termBadge(r.kartaRidice)}</td>
              <td>${formatDate(r.profesniPrukaz)} ${termBadge(r.profesniPrukaz)}</td>
              <td style="display:flex;gap:6px;">
                <button class="btn btn-ghost btn-sm" onclick="editRidic(${r.id})">Upravit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteRidic(${r.id})">Smazat</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${renderRidicModal()}
  `;
}
function renderRidicModal(r={}) {
  return `
    <div class="modal-overlay" id="ridicModal">
      <div class="modal">
        <h2>${r.id?'Upravit řidiče':'Nový řidič'}</h2>
        <p class="modal-sub">Vyplň údaje o řidiči.</p>
        <form id="ridicForm">
          <input type="hidden" name="editId" value="${r.id||''}">
          <div class="form-cols-2">
            <div class="form-row"><label>Jméno a příjmení *</label><input type="text" name="jmeno" required value="${r.jmeno||''}" placeholder="např. Jan Novák"></div>
            <div class="form-row"><label>Telefon *</label><input type="tel" name="telefon" required value="${r.telefon||''}" placeholder="+420 601 111 222"></div>
          </div>
          <div class="form-row"><label>Skupina *</label>
            <select name="skupina" required>
              ${['C','C+E','D','B'].map(s=>`<option ${r.skupina===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-cols-2">
            <div class="form-row"><label>Karta řidiče platná do *</label><input type="date" name="kartaRidice" required value="${r.kartaRidice||''}"></div>
            <div class="form-row"><label>Profesní průkaz platný do *</label><input type="date" name="profesniPrukaz" required value="${r.profesniPrukaz||''}"></div>
          </div>
          <div class="form-row">
            <label>PIN pro přihlášení do appky (4 číslice) *</label>
            <input type="text" name="pin" inputmode="numeric" maxlength="4" required value="${r.pin||''}" placeholder="např. 1234" style="letter-spacing:4px; font-weight:700;">
            <span id="ridicPinError" style="display:none; color:var(--red); font-size:12px;">Tento PIN už používá jiný řidič — zvol jiný.</span>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeModal('ridicModal')">Zrušit</button>
            <button type="submit" class="btn btn-primary">${r.id?'Uložit změny':'Přidat řidiče'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}
function bindRidici() {
  document.getElementById('btnAddRidic').addEventListener('click', () => openModal('ridicModal'));
  const pinField = document.querySelector('#ridicForm [name="pin"]');
  if (pinField) pinField.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g,'').slice(0,4); });

  document.getElementById('ridicForm').addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    const editId = fd.get('editId');
    const pin = fd.get('pin');
    const pinTaken = state.ridici.some(r => r.pin === pin && r.id !== +editId);
    if (pinTaken) {
      document.getElementById('ridicPinError').style.display = 'block';
      return;
    }
    const data = { jmeno: fd.get('jmeno'), telefon: fd.get('telefon'), skupina: fd.get('skupina'), kartaRidice: fd.get('kartaRidice'), profesniPrukaz: fd.get('profesniPrukaz'), pin };
    if (editId) {
      const idx = state.ridici.findIndex(r=>r.id===+editId);
      if (idx>=0) state.ridici[idx] = { ...state.ridici[idx], ...data };
    } else {
      state.ridici.push({ id: Date.now(), ...data });
    }
    saveState(); closeModal('ridicModal'); renderSection('ridici');
  });
}
window.editRidic = function(id) {
  const r = state.ridici.find(r=>r.id===id);
  if (!r) return;
  document.getElementById('content').querySelector('.modal-overlay').remove();
  document.getElementById('content').insertAdjacentHTML('beforeend', renderRidicModal(r));
  bindRidici();
  openModal('ridicModal');
};
window.deleteRidic = function(id) { if(!confirm('Smazat řidiče?')) return; state.ridici = state.ridici.filter(r=>r.id!==id); saveState(); renderSection('ridici'); };

// ==========================================================
// ZAKÁZKY — barevné karty + filtr + CRUD + EDITACE
// ==========================================================
function renderZakazky() {
  const stavFilter = window._stavFilter || 'vse';
  const stavy = ['vse','Naplánováno','Probíhá','Dokončeno','Zrušeno'];
  let list = state.zakazky;
  if (stavFilter !== 'vse') list = list.filter(z => z.stav === stavFilter);

  return `
    <div class="page-head">
      <div><h1>📋 Zakázky</h1><p>Přehled zakázek a jejich stavu.</p></div>
      <div class="page-actions"><button class="btn btn-primary" id="btnAddZakazka">+ Nová zakázka</button></div>
    </div>

    <!-- Filtr podle stavu -->
    <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;">
      ${stavy.map(s => `
        <button class="btn ${stavFilter===s?'btn-primary':'btn-ghost'} btn-sm" onclick="setStavFilter('${s}')">
          ${s==='vse'?'Všechny':s} ${s!=='vse'?'('+state.zakazky.filter(z=>z.stav===s).length+')':'('+state.zakazky.length+')'}
        </button>
      `).join('')}
    </div>

    <!-- Barevné karty -->
    ${list.length===0 ? `<div class="empty-state" style="margin:40px auto;"><div class="empty-ic">📋</div>Žádné zakázky ${stavFilter!=='vse'?'v tomto stavu':''} — přidej první.</div>` : `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-bottom:24px;">
      ${list.map(z => zakazkaKartaFull(z)).join('')}
    </div>
    `}
    ${renderZakazkaModal()}
  `;
}

function zakazkaKartaFull(z) {
  const colors = { 'Naplánováno':'var(--amber)', 'Probíhá':'var(--cyan)', 'Dokončeno':'var(--green)', 'Zrušeno':'var(--red)' };
  const bgs = { 'Naplánováno':'rgba(245,158,11,0.1)', 'Probíhá':'rgba(34,211,238,0.1)', 'Dokončeno':'rgba(16,185,129,0.1)', 'Zrušeno':'rgba(239,68,68,0.1)' };
  const col = colors[z.stav]||'var(--muted)';
  const bg = bgs[z.stav]||'var(--card)';
  return `
    <div style="background:${bg};border:1px solid ${col};border-radius:14px;padding:18px 20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:10.5px;font-weight:700;color:${col};letter-spacing:1px;">${z.stav.toUpperCase()}</span>
        <span style="font-size:11px;color:var(--dim);">${formatDate(z.datum)}</span>
      </div>
      <div style="font-weight:800;font-size:16px;color:var(--white);margin-bottom:5px;">${z.klient}</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:4px;">📍 ${z.trasa}</div>
      ${z.poznamka?`<div style="font-size:12px;color:var(--dim);margin-bottom:8px;">📝 ${z.poznamka}</div>`:''}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">
        <span style="font-size:16px;font-weight:800;color:var(--white);">${(+z.cena||0).toLocaleString('cs-CZ')} Kč</span>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="editZakazka(${z.id})">Upravit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteZakazka(${z.id})">Smazat</button>
        </div>
      </div>
    </div>
  `;
}

window.setStavFilter = function(stav) { window._stavFilter = stav; renderSection('zakazky'); };

function renderZakazkaModal(z={}) {
  const dnes = new Date().toISOString().slice(0,10);
  return `
    <div class="modal-overlay" id="zakazkaModal">
      <div class="modal">
        <h2>${z.id?'Upravit zakázku':'Nová zakázka'}</h2>
        <p class="modal-sub">Vyplň údaje o zakázce.</p>
        <form id="zakazkaForm">
          <input type="hidden" name="editId" value="${z.id||''}">
          <div class="form-row"><label>Klient *</label><input type="text" name="klient" required value="${z.klient||''}" placeholder="např. Výrobní firma Brno"></div>
          <div class="form-cols-2">
            <div class="form-row"><label>Odkud *</label><input type="text" name="trasaOd" required value="${(z.trasa||'').split(' → ')[0]||''}" placeholder="např. Brno"></div>
            <div class="form-row"><label>Kam *</label><input type="text" name="trasaDo" required value="${(z.trasa||'').split(' → ')[1]||''}" placeholder="např. Vídeň"></div>
          </div>
          <div class="form-cols-2">
            <div class="form-row"><label>Datum *</label><input type="date" name="datum" value="${z.datum||dnes}" required></div>
            <div class="form-row"><label>Stav *</label>
              <select name="stav" required>
                ${['Naplánováno','Probíhá','Dokončeno','Zrušeno'].map(s=>`<option ${z.stav===s?'selected':''}>${s}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row"><label>Cena (Kč)</label><input type="number" name="cena" min="0" value="${z.cena||''}" placeholder="např. 12500"></div>
          <div class="form-row"><label>Poznámka</label><textarea name="poznamka" rows="2">${z.poznamka||''}</textarea></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeModal('zakazkaModal')">Zrušit</button>
            <button type="submit" class="btn btn-primary">${z.id?'Uložit změny':'Přidat zakázku'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}
function bindZakazky() {
  document.getElementById('btnAddZakazka').addEventListener('click', () => openModal('zakazkaModal'));
  document.getElementById('zakazkaForm').addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    const editId = fd.get('editId');
    const data = { klient: fd.get('klient'), trasa: `${fd.get('trasaOd')} → ${fd.get('trasaDo')}`, datum: fd.get('datum'), stav: fd.get('stav'), cena: +fd.get('cena')||0, poznamka: fd.get('poznamka') };
    if (editId) {
      const idx = state.zakazky.findIndex(z=>z.id===+editId);
      if (idx>=0) state.zakazky[idx] = { ...state.zakazky[idx], ...data };
    } else {
      state.zakazky.unshift({ id: Date.now(), ...data });
    }
    saveState(); closeModal('zakazkaModal'); renderSection('zakazky');
  });
}
window.editZakazka = function(id) {
  const z = state.zakazky.find(z=>z.id===id);
  if (!z) return;
  const mo = document.getElementById('content').querySelector('.modal-overlay');
  if (mo) mo.remove();
  document.getElementById('content').insertAdjacentHTML('beforeend', renderZakazkaModal(z));
  bindZakazky();
  openModal('zakazkaModal');
};
window.deleteZakazka = function(id) { if(!confirm('Smazat zakázku?')) return; state.zakazky = state.zakazky.filter(z=>z.id!==id); saveState(); renderSection('zakazky'); };

// ==========================================================
// REPORTY & FAKTURACE
// ==========================================================
function renderReporty() {
  const kmPerRidic = {}, kmPerVozidlo = {}, litryPerVozidlo = {};
  state.jizdy.forEach(j => { kmPerRidic[j.ridic] = (kmPerRidic[j.ridic]||0) + (+j.km||0); kmPerVozidlo[j.vozidlo] = (kmPerVozidlo[j.vozidlo]||0) + (+j.km||0); });
  state.tankovani.forEach(t => { litryPerVozidlo[t.vozidlo] = (litryPerVozidlo[t.vozidlo]||0) + (+t.litry||0); });
  return `
    <div class="page-head"><div><h1>📊 Reporty</h1><p>Výkon podle řidičů, vozidel a nákladů.</p></div></div>
    <div class="grid-2">
      <div class="card-panel">
        <h3>Najeté km podle řidiče</h3><p class="csub">Celkový součet.</p>
        <table class="data-table"><thead><tr><th>Řidič</th><th style="text-align:right">km</th></tr></thead><tbody>
          ${Object.entries(kmPerRidic).sort((a,b)=>b[1]-a[1]).map(([r,km])=>`<tr><td>${r}</td><td style="text-align:right"><b>${km.toLocaleString('cs-CZ')}</b></td></tr>`).join('') || '<tr><td colspan="2" class="empty-state">Žádná data</td></tr>'}
        </tbody></table>
      </div>
      <div class="card-panel">
        <h3>Najeté km podle vozidla</h3><p class="csub">Včetně spotřeby PHM.</p>
        <table class="data-table"><thead><tr><th>Vozidlo</th><th style="text-align:right">km</th><th style="text-align:right">l/100km</th></tr></thead><tbody>
          ${state.vozidla.map(v=>{const km=kmPerVozidlo[v.spz]||0;const l=litryPerVozidlo[v.spz]||0;return `<tr><td>${v.spz}</td><td style="text-align:right"><b>${km.toLocaleString('cs-CZ')}</b></td><td style="text-align:right">${km>0?(l/km*100).toFixed(1):'—'}</td></tr>`;}).join('')}
        </tbody></table>
      </div>
    </div>
  `;
}
function renderFakturace() {
  const suma = state.zakazky.reduce((s,z)=>s+(+z.cena||0),0);
  const dok = state.zakazky.filter(z=>z.stav==='Dokončeno');
  return `
    <div class="page-head"><div><h1>🧾 Podklady k fakturaci</h1><p>Přehled zakázek k fakturaci.</p></div></div>
    <div class="metrics">
      <div class="metric"><div class="m-label">Dokončené</div><div class="m-value">${dok.length}</div><div class="m-delta neutral">k fakturaci</div></div>
      <div class="metric"><div class="m-label">Celková hodnota</div><div class="m-value">${suma.toLocaleString('cs-CZ')} Kč</div><div class="m-delta">všechny zakázky</div></div>
    </div>
    <div class="card-panel">
      <h3>Dokončené zakázky</h3><p class="csub">Připravené k fakturaci.</p>
      <table class="data-table"><thead><tr><th>Klient</th><th>Trasa</th><th>Datum</th><th style="text-align:right">Cena</th></tr></thead><tbody>
        ${dok.length===0?'<tr><td colspan="4" class="empty-state">Žádné dokončené zakázky.</td></tr>':dok.map(z=>`<tr><td><b>${z.klient}</b></td><td>${z.trasa}</td><td>${formatDate(z.datum)}</td><td style="text-align:right"><b>${(+z.cena||0).toLocaleString('cs-CZ')} Kč</b></td></tr>`).join('')}
      </tbody></table>
    </div>
  `;
}

// ==========================================================
// COMING SOON
// ==========================================================
function cs(phase, ic, title, description, features) {
  return `
    <div class="coming-soon">
      <div class="cs-ic">${ic}</div>
      <span class="cs-phase">${phase}</span>
      <h2>${title}</h2>
      <p>${description}</p>
      <div class="cs-features">${features.map(f=>`<div class="cs-feat">${f}</div>`).join('')}</div>
      <p style="margin-top:24px;font-size:12.5px;font-style:italic;color:var(--dim);">Sekce je v přípravě — dopracujeme podle plánu.</p>
    </div>
  `;
}

// ==========================================================
// UTILS
// ==========================================================
function formatDate(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('cs-CZ'); }
function daysDiff(iso, from) { return Math.ceil((new Date(iso) - from) / 86400000); }
function termBadge(iso) {
  const d = daysDiff(iso, new Date());
  if (d < 0) return `<span class="badge err">Prošlo</span>`;
  if (d <= 30) return `<span class="badge err">${d}d</span>`;
  if (d <= 60) return `<span class="badge warn">${d}d</span>`;
  return '';
}
function posledni12Mesicu() {
  const mesice = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];
  const now = new Date(); const result = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    result.push({ value: val, label: `${mesice[d.getMonth()]} ${d.getFullYear()}` });
  }
  return result;
}
function openModal(id) { const m = document.getElementById(id); if(m) m.classList.add('open'); }
function closeModal(id) { const m = document.getElementById(id); if(m) m.classList.remove('open'); }
window.closeModal = closeModal;
function downloadFile(name, mime, data) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

// Auto-login if already logged in (must run after SECTIONS is defined above)
if (state.role) showApp();
