/* =========================================================
   VONDRÁŠEK — PROVOZNÍ SYSTÉM
   + Editace vozidel/řidičů/zakázek
   + Filtrování zakázek podle stavu
   + Export jízd podle měsíce
   + Graf km na dashboardu
   + Barevné karty zakázek
========================================================= */

// Data žijí na serveru — pracovní kopie `state`, saveState() a přihlášení jsou v sync.js.
// Tady zůstává jen seznam tras PNS a doplnění chybějící konfigurace trasy.
const PNS_ROUTES = ['20001','20004','20011','20013','20016','20018','20041','20042','20043','20044','20045','20058','20063','20064','20066'];

// Zajistí, že konfigurace existuje pro všechny trasy (i nově přidané), a doplní chybějící pole.
// Volá se u majitele po stažení dat ze serveru (nikdy dřív, ať se nepřepíše to, co na serveru už je).
function ensureRouteConfig() {
  PNS_ROUTES.forEach(r => {
    if (!state.pnsRouteConfig[r]) {
      state.pnsRouteConfig[r] = { cenovyModel: 'km', cenaZaKm: 0, kmZaDen: 0, pausalZaDen: 0, odhadNakladuZaDen: 0, stalyRidic: '' };
    } else if (state.pnsRouteConfig[r].stalyRidic === undefined) {
      state.pnsRouteConfig[r].stalyRidic = '';
    }
  });
}

// Jízdy přihlášeného: majitel i vedoucí dopravy všechny, řidič jen své (server mu stejně pošle jen jeho)
function mojeJizdy() {
  return (state.role === 'owner' || state.role === 'dispecer') ? state.jizdy : state.jizdy.filter(j => String(j.driverId) === String(state.driverId));
}
// Řidiči k výběru ve formulářích: majitel i vedoucí dopravy všechny (zapisují i za jiné), řidič jen sám sebe
function ridiciProVyber() {
  return (state.role === 'owner' || state.role === 'dispecer') ? state.ridici : state.ridici.filter(r => String(r.id) === String(state.driverId));
}
// ID řidiče podle zkráceného jména z výběru ("Jan N."); řidič zapisuje vždy sám za sebe
function idRidiceZVyberu(kratke) {
  if (state.role === 'driver') return state.driverId;
  const r = state.ridici.find(r => kratkeJmenoRidice(r.jmeno) === kratke);
  return r ? r.id : null;
}
// Bezpečný zápis hodnoty do HTML atributu (adresy fotek obsahují &)
const hAttr = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// ---------- ČESKÉ STÁTNÍ SVÁTKY ----------
function easterSunday(year) {
  const a = year % 19, b = Math.floor(year/100), c = year % 100;
  const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
  const i = Math.floor(c/4), k = c % 4, l = (32+2*e+2*i-h-k) % 7;
  const m = Math.floor((a+11*h+22*l)/451);
  const month = Math.floor((h+l-7*m+114)/31), day = ((h+l-7*m+114) % 31) + 1;
  return new Date(year, month-1, day);
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate()+n); return d; }
function toISO(date) { const y=date.getFullYear(), m=String(date.getMonth()+1).padStart(2,'0'), d=String(date.getDate()).padStart(2,'0'); return `${y}-${m}-${d}`; }

function czechHolidays(year) {
  const easter = easterSunday(year);
  const holidays = {
    [`${year}-01-01`]: 'Nový rok',
    [toISO(addDays(easter,-2))]: 'Velký pátek',
    [toISO(addDays(easter,1))]: 'Velikonoční pondělí',
    [`${year}-05-01`]: 'Svátek práce',
    [`${year}-05-08`]: 'Den vítězství',
    [`${year}-07-05`]: 'Cyril a Metoděj',
    [`${year}-07-06`]: 'Jan Hus',
    [`${year}-09-28`]: 'Den české státnosti',
    [`${year}-10-28`]: 'Vznik Československa',
    [`${year}-11-17`]: 'Den boje za svobodu',
    [`${year}-12-24`]: 'Štědrý den',
    [`${year}-12-25`]: '1. svátek vánoční',
    [`${year}-12-26`]: '2. svátek vánoční'
  };
  return holidays;
}
// Cache svátků podle roku, ať se nepočítá pořád dokola
const _holidayCache = {};
function holidayName(iso) {
  const year = +iso.slice(0,4);
  if (!_holidayCache[year]) _holidayCache[year] = czechHolidays(year);
  return _holidayCache[year][iso] || null;
}
// Jede se každý den kromě neděle a státních svátků
function isDrivingDay(iso) {
  const d = new Date(iso);
  if (d.getDay() === 0) return false; // neděle
  if (holidayName(iso)) return false;
  return true;
}

// Sjednotí starý formát (hotovo: [...]) i nový formát (trasy: {...}) do jednoho tvaru
// Vrátí "výjimky" pro daný den (přepisy vůči výchozímu nastavení trasy) — nový formát dat
function denniVyjimky(iso) {
  const rec = state.malaDoprava[iso];
  if (!rec) return {};
  if (rec.vyjimky) return rec.vyjimky;
  // Zpětná kompatibilita se staršími formáty dat
  if (rec.trasy) return rec.trasy;
  if (rec.hotovo) {
    const t = {};
    rec.hotovo.forEach(r => t[r] = { objizdkaKm: 0 });
    return t;
  }
  return {};
}

// Pro danou trasu a den vrátí efektivní údaje (výchozí ze stálé konfigurace, případně přepsané výjimkou)
function efektivniTrasaDen(route, iso) {
  const cfg = state.pnsRouteConfig[route] || { cenovyModel:'km', cenaZaKm:0, kmZaDen:0, pausalZaDen:0, stalyRidic:'', odhadNakladuZaDen:0 };
  const vyjimka = denniVyjimky(iso)[route];
  return {
    ridic: (vyjimka && vyjimka.ridic) ? vyjimka.ridic : (cfg.stalyRidic || ''),
    objizdkaKm: (vyjimka && vyjimka.objizdkaKm) ? +vyjimka.objizdkaKm : 0,
    nejelo: !!(vyjimka && vyjimka.nejelo),
    maVyjimku: !!vyjimka
  };
}

// Spočítá příjem za daný jízdní den přes všechny trasy PNS (automaticky, podle konfigurace + výjimek)
function vypocetPrijemDne(iso) {
  let prijem = 0;
  PNS_ROUTES.forEach(route => {
    const cfg = state.pnsRouteConfig[route];
    const eff = efektivniTrasaDen(route, iso);
    if (eff.nejelo) return; // trasa ten den nejela — bez příjmu
    if (cfg.cenovyModel === 'pausal') prijem += (+cfg.pausalZaDen || 0);
    else prijem += ((+cfg.kmZaDen||0) + eff.objizdkaKm) * (+cfg.cenaZaKm||0);
  });
  return prijem;
}

// Spočítá odhadované náklady za daný jízdní den (ze součtu odhadů jednotlivých tras + ruční doplnění dne)
function vypocetOdhadNakladuDne(iso) {
  let naklady = 0;
  PNS_ROUTES.forEach(route => {
    const cfg = state.pnsRouteConfig[route];
    const eff = efektivniTrasaDen(route, iso);
    if (eff.nejelo) return;
    naklady += (+cfg.odhadNakladuZaDen || 0);
  });
  return naklady;
}

// Spočítá celkové km za daný den (základ + objížďky) přes všechny trasy PNS
function vypocetKmDne(iso) {
  let km = 0;
  PNS_ROUTES.forEach(route => {
    const cfg = state.pnsRouteConfig[route];
    const eff = efektivniTrasaDen(route, iso);
    if (eff.nejelo) return;
    km += (+cfg.kmZaDen||0) + eff.objizdkaKm;
  });
  return km;
}


// ---------- LOGIN ----------
// Majitel i řidič se přihlašují čtyřmístným PINem; PIN ověřuje server (v appce žádné PINy nejsou).
let loginRezim = 'driver'; // 'owner' | 'driver'

function otevriPinKrok(rezim) {
  loginRezim = rezim;
  document.getElementById('pinTitle').textContent = rezim === 'owner' ? '👔 Přihlášení majitele' : '👷 Přihlášení řidiče';
  document.getElementById('loginStep1').hidden = true;
  document.getElementById('loginStep2').hidden = false;
  document.getElementById('pinInput').value = '';
  zobrazChybuPinu('');
  document.getElementById('pinInput').focus();
}
function zobrazChybuPinu(text) {
  const el = document.getElementById('pinError');
  el.textContent = text; el.hidden = !text;
}
document.querySelector('[data-role="owner"]').addEventListener('click', () => otevriPinKrok('owner'));
document.getElementById('btnDriverLogin').addEventListener('click', () => otevriPinKrok('driver'));

document.getElementById('btnPinBack').addEventListener('click', () => {
  document.getElementById('loginStep2').hidden = true;
  document.getElementById('loginStep1').hidden = false;
});

let prihlasuje = false;
async function tryPinLogin() {
  if (prihlasuje) return;
  const pin = document.getElementById('pinInput').value.trim();
  if (!/^\d{4}$/.test(pin)) { zobrazChybuPinu('Zadej čtyřmístný PIN.'); return; }
  const tlacitko = document.getElementById('btnPinConfirm');
  prihlasuje = true; tlacitko.disabled = true; tlacitko.textContent = 'Přihlašuji…';
  try {
    await prihlasitPinem(loginRezim, pin);
    showApp();
  } catch (e) {
    zobrazChybuPinu(e.status === 401 ? (loginRezim === 'owner' ? 'PIN nebyl rozpoznán — zkus to znovu.' : 'PIN nebyl rozpoznán — zkus to znovu nebo se zeptej majitele.') : e.message);
    document.getElementById('pinInput').value = '';
    document.getElementById('pinInput').focus();
  } finally {
    prihlasuje = false; tlacitko.disabled = false; tlacitko.textContent = 'Přihlásit se';
  }
}
document.getElementById('btnPinConfirm').addEventListener('click', tryPinLogin);
document.getElementById('pinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') tryPinLogin(); });
document.getElementById('pinInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
});

function zobrazPrihlaseni(zprava) {
  document.getElementById('app').hidden = true;
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('loginStep1').hidden = false;
  document.getElementById('loginStep2').hidden = true;
  const hl = document.getElementById('loginMessage');
  hl.textContent = zprava || ''; hl.hidden = !zprava;
}
document.getElementById('logoutBtn').addEventListener('click', async () => {
  if (await odhlasit()) zobrazPrihlaseni();
});

function showApp() {
  document.getElementById('pinInput').value = '';
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('app').hidden = false;
  document.getElementById('content').setAttribute('data-tisk-datum', new Date().toLocaleDateString('cs-CZ'));
  const isOwner = state.role === 'owner';
  const isDispecer = state.role === 'dispecer';
  document.getElementById('userIc').textContent = isOwner ? '👔' : isDispecer ? '🧭' : '🚚';
  document.getElementById('userName').textContent = isOwner ? 'Majitel' : state.driverName;
  document.getElementById('userRole').textContent = isOwner ? 'Plný přístup' : isDispecer ? 'Vedoucí dopravy' : 'Vidí jen svoje';
  applyDriverView(!isOwner);
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.section === 'dashboard'));
  renderSection('dashboard');
  posliNotifikaceProUpozorneni();
  nastavStav(sync.stav);
  zacniSynchronizaci();
  synchronizuj();
}
// Řidič vidí jen dashboard, jízdy a tankování (vlastní); zbytek menu je zamčený.
// Při přepnutí zpět na majitele (bez obnovení stránky) se zámek zruší.
function applyDriverView(jeRidic) {
  const allowed = ['dashboard', 'jizdy', 'tankovani'];
  document.querySelectorAll('.nav-item').forEach(item => {
    item.style.opacity = ''; item.style.pointerEvents = '';
    if (jeRidic && !allowed.includes(item.dataset.section)) {
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
  if ((state.role === 'driver' || state.role === 'dispecer') && !['dashboard', 'jizdy', 'tankovani'].includes(name)) name = 'dashboard';
  const content = document.getElementById('content');
  document.getElementById('topbarTitle').textContent = SECTIONS[name]?.title || 'Dashboard';
  content.innerHTML = (SECTIONS[name] || SECTIONS.dashboard).render();
  if (SECTIONS[name]?.after) SECTIONS[name].after();
}
// Název aktuálně zvýrazněné sekce v menu — pro znovu-vykreslení po akci v modalu (modal sám neví, odkud byl otevřený)
function aktualniSekceNazev(vychozi) {
  const a = document.querySelector('.nav-item.active');
  return a ? a.dataset.section : vychozi;
}

const SECTIONS = {
  dashboard:    { title: 'Dashboard', render: renderDashboard, after: bindDashboard },
  jizdy:        { title: 'Evidence jízd', render: renderJizdy, after: bindJizdy },
  tankovani:    { title: 'Tankování', render: renderTankovani, after: bindTankovani },
  vozidla:      { title: 'Vozidla', render: renderVozidla, after: bindVozidla },
  ridici:       { title: 'Řidiči', render: renderRidici, after: bindRidici },
  zakazky:      { title: 'Zakázky', render: renderZakazky, after: bindZakazky },
  'velka-cz':   { title: 'Velká doprava (CZ – vnitro)', render: () => renderVelkaDoprava('cz'), after: () => bindVelkaDoprava('cz') },
  'velka-eu':   { title: 'Velká doprava EU (zahraničí)', render: () => renderVelkaDoprava('eu'), after: () => bindVelkaDoprava('eu') },
  'mala-doprava': { title: 'Malá doprava (PNS)', render: renderMalaDoprava, after: bindMalaDoprava },
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
  const isDispecer = state.role === 'dispecer';
  const myJizdy = mojeJizdy();
  const mojeTrasy = (sync.me && sync.me.mojeTrasy) || [];   // jen řidičova vlastní trasa/trasy PNS, nikdy cizí (viz api/sync.js → zjistiMojeTrasy)
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
      <div class="page-actions">
        <button class="btn btn-ghost btn-sm" id="btnDashAddJizda">+ Jízda</button>
        <button class="btn btn-ghost btn-sm" id="btnDashAddTank">+ Tankování</button>
        ${!isOwner ? `<button class="btn btn-ghost btn-sm" id="btnDashAddObjizdka">📣 Objížďka</button>` : ''}
        ${isDispecer ? `
        <button class="btn btn-primary btn-sm" id="btnDashAddJizdaZaRidice">🚚 Jízda za řidiče</button>
        <button class="btn btn-primary btn-sm" id="btnDashAddTankZaRidice">⛽ Tankování za řidiče</button>
        ` : ''}
      </div>
    </div>

    ${isDispecer ? `
    <div class="card-panel" style="margin-bottom:20px; border-color:var(--purple-light);">
      <h3>🧭 Zadáváš data za řidiče</h3>
      <p class="csub">Přes „+ Jízda", „+ Tankování" a „📣 Objížďka" (nahoře) i přes stránky Evidence jízd a Tankování zapisuješ záznam vždy za konkrétního řidiče — vyber ho v poli <b>Řidič</b> ve formuláři (nabízí všechny, ne jen tebe). Finance, ceny a náklady nevidíš ani nezadáváš — to zůstává jen pro majitele.</p>
    </div>` : ''}

    ${isOwner && sync.me && sync.me.mustChangePin ? `
    <div class="card-panel" style="margin-bottom:20px; border-color:var(--amber);">
      <h3>⚠️ Změň si PIN majitele</h3>
      <p class="csub">Výchozí PIN není tajný (byl dřív veřejně v kódu appky). Nastav si vlastní, ať se k datům nedostane nikdo cizí.</p>
      <button class="btn btn-primary btn-sm" onclick="openPinDialog('owner','majitele')">🔑 Změnit PIN</button>
    </div>` : ''}

    <div class="metrics">
      <div class="metric"><div class="m-label">Najeté km</div><div class="m-value">${kmCelkem.toLocaleString('cs-CZ')}</div><div class="m-delta">▲ celkem</div></div>
      <div class="metric"><div class="m-label">Počet jízd</div><div class="m-value">${myJizdy.length}</div><div class="m-delta">▲ celkem</div></div>
      ${!isOwner ? `
      <div class="metric"><div class="m-label">${mojeTrasy.length > 1 ? 'Tvoje trasy' : 'Tvoje trasa'}</div><div class="m-value">${mojeTrasy.length ? mojeTrasy.join(', ') : '—'}</div><div class="m-delta neutral">${mojeTrasy.length ? 'Malá doprava (PNS)' : 'zatím nepřiřazena'}</div></div>
      ` : ''}
      ${isOwner ? `
      <div class="metric"><div class="m-label">Vozidla</div><div class="m-value">${state.vozidla.length}</div><div class="m-delta neutral">v systému</div></div>
      <div class="metric"><div class="m-label">Řidiči</div><div class="m-value">${state.ridici.length}</div><div class="m-delta neutral">v systému</div></div>
      ` : ''}
      <div class="metric"><div class="m-label">Natankováno litrů</div><div class="m-value">${litryCelkem.toLocaleString('cs-CZ')}</div><div class="m-delta neutral">celkem</div></div>
      <div class="metric"><div class="m-label">Náklady PHM</div><div class="m-value">${nakladyPHM.toLocaleString('cs-CZ')} Kč</div><div class="m-delta neutral">celkem</div></div>
    </div>

    ${isOwner || isDispecer ? renderDnesekMalaDoprava() : ''}
    ${isOwner || isDispecer ? renderHlaseniObjizdekOwnerCard() : renderHlaseniObjizdekDriverCard()}

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
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <h3 style="margin-bottom:0;">⚠️ Upozornění</h3>
          ${renderNotifikaceOvladani()}
        </div>
        <p class="csub">Blížící se termíny.</p>
        ${renderUpozorneni()}
      </div>
    </div>

    ${isOwner ? `
    <div class="card-panel" style="margin-top:20px;">
      <h3>💾 Záloha dat</h3>
      <p class="csub">Data jsou uložená na serveru a vidí je majitel i řidiči (každý své). Záloha do souboru je jen pojistka navíc — bez fotek účtenek.</p>
      ${renderZalohaStatus()}
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
        <button class="btn btn-primary btn-sm" id="btnStahnoutZalohu">⬇️ Stáhnout zálohu</button>
        <button class="btn btn-ghost btn-sm" id="btnObnovitZalohu">⬆️ Obnovit ze zálohy</button>
        <input type="file" id="obnovaZalohyInput" accept=".json" hidden>
      </div>
    </div>
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

// Vrátí HTML se stavem poslední zálohy — žlutě upozorní, když je stará přes 30 dní nebo žádná neproběhla
function renderZalohaStatus() {
  if (!state.posledniZaloha) {
    return `<div class="badge warn">⚠️ Zatím žádná záloha</div>`;
  }
  const dny = Math.floor((new Date() - new Date(state.posledniZaloha)) / 86400000);
  const datumText = new Date(state.posledniZaloha).toLocaleString('cs-CZ');
  const predText = dny === 0 ? 'dnes' : dny === 1 ? 'před 1 dnem' : `před ${dny} dny`;
  if (dny > 30) {
    return `<div class="badge warn">⚠️ Poslední záloha ${datumText} (${predText}) — je čas na novou</div>`;
  }
  return `<p style="font-size:12.5px; color:var(--muted);">Poslední záloha: ${datumText} (${predText})</p>`;
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

// Karta "Malá doprava dnes" — kdo dnes jede kterou trasu (podle stálého řidiče a výjimek)
function renderDnesekMalaDoprava() {
  const todayIso = toISO(new Date());
  let body;
  if (!isDrivingDay(todayIso)) {
    const duvod = holidayName(todayIso) || 'neděle';
    body = `<p class="csub" style="margin-bottom:0;">Dnes se nejede — ${duvod}.</p>`;
  } else {
    const podleRidice = {};
    const bezRidice = [];
    PNS_ROUTES.forEach(route => {
      const eff = efektivniTrasaDen(route, todayIso);
      if (eff.nejelo) return;
      if (eff.ridic) podleRidice[eff.ridic] = (podleRidice[eff.ridic]||0) + 1;
      else bezRidice.push(route);
    });
    const radky = Object.entries(podleRidice).map(([r,c]) => `
      <div style="display:flex; justify-content:space-between; padding:4px 0; font-size:13px;">
        <span>👷 ${r}</span><span style="color:var(--muted);">${c} ${czechTras(c)}</span>
      </div>`).join('') || `<p style="font-size:12.5px; color:var(--dim); font-style:italic;">Žádné trase není přiřazen stálý řidič.</p>`;
    const bezRidiceHtml = bezRidice.length ? `
      <div style="margin-top:10px; padding:8px 10px; background:rgba(245,158,11,0.12); border-radius:8px; color:var(--amber); font-size:12.5px;">
        ⚠️ Bez řidiče: ${bezRidice.join(', ')}
      </div>` : '';
    body = `<p class="csub">Dnes se jede, ${PNS_ROUTES.length} tras.</p>${radky}${bezRidiceHtml}`;
  }
  return `
    <div class="card-panel" style="margin-bottom:20px; cursor:pointer;" id="dnesMalaDopravaCard">
      <h3>📰 Malá doprava dnes</h3>
      ${body}
    </div>
  `;
}

// ==========================================================
// HLÁŠENÍ OBJÍŽĎEK — řidič nahlásí km navíc na své trase, appka je rovnou
// zapíše majiteli do Malé dopravy (viz api/sync.js → aplikujHlaseniObjizdky)
// ==========================================================

// Karta pro majitele: poslední hlášení od řidičů, klikem se otevře ten den v Malé dopravě
function renderHlaseniObjizdekOwnerCard() {
  const seznam = state.hlaseniObjizdek.slice(0, 8);
  const nepectenych = state.hlaseniObjizdek.filter(h => h.stav !== 'precteno').length;
  return `
    <div class="card-panel" style="margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <h3 style="margin-bottom:0;">📣 Hlášení objížděk od řidičů</h3>
        ${nepectenych > 0 ? `<span class="badge warn">${nepectenych} ${nepectenych===1?'nové':'nových'}</span>` : ''}
      </div>
      <p class="csub">Km navíc, které řidič nahlásí, se rovnou zapíšou do Malé dopravy u dané trasy a dne.</p>
      ${seznam.length ? seznam.map(h => `
        <div style="display:flex; align-items:center; gap:12px; padding:10px 12px; background:var(--card); border-radius:var(--radius-sm); margin-bottom:8px; border-left:3px solid ${h.stav!=='precteno'?'var(--amber)':'var(--border-c)'}; cursor:pointer;" onclick="otevritHlaseniVMaleDoprave(${h.id})">
          <span style="font-size:18px;">🛣️</span>
          <div style="flex:1; font-size:13px;">
            <b>${h.driverName}</b> — trasa ${h.trasa}, <b style="color:var(--amber);">+${h.km} km</b> · ${formatDate(h.datum)}
            ${h.poznamka ? `<div style="color:var(--muted); font-size:12px; margin-top:2px;">${h.poznamka}</div>` : ''}
          </div>
          <span class="badge ${h.stav==='precteno'?'ok':'warn'}">${h.stav==='precteno'?'Přečteno':'Nové'}</span>
        </div>
      `).join('') : `<div class="empty-state"><div class="empty-ic">📣</div>Zatím žádná hlášení.</div>`}
    </div>
  `;
}

// Karta pro řidiče: co sám nahlásil a jestli to majitel už viděl
function renderHlaseniObjizdekDriverCard() {
  const seznam = state.hlaseniObjizdek.slice(0, 8);
  return `
    <div class="card-panel" style="margin-bottom:20px;">
      <h3>🛣️ Moje hlášení objížděk</h3>
      <p class="csub">Km navíc na tvé trase se po odeslání hned zapíšou majiteli do Malé dopravy.</p>
      ${seznam.length ? `
      <table class="data-table">
        <thead><tr><th>Datum</th><th>Trasa</th><th style="text-align:right">Km navíc</th><th>Poznámka</th><th></th></tr></thead>
        <tbody>
          ${seznam.map(h => `
            <tr>
              <td>${formatDate(h.datum)}</td><td>${h.trasa}</td>
              <td style="text-align:right">+${h.km} km</td>
              <td style="color:var(--muted); font-size:12.5px;">${h.poznamka||'—'}</td>
              <td><span class="badge ${h.stav==='precteno'?'ok':'warn'}">${h.stav==='precteno'?'Majitel viděl':'Odesláno'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : `<div class="empty-state"><div class="empty-ic">🛣️</div>Zatím jsi nic nenahlásil.</div>`}
    </div>
  `;
}

// Klik na hlášení v dashboardu majitele: otevře ten den v Malé dopravě a hlášení označí za přečtené
window.otevritHlaseniVMaleDoprave = function(id) {
  const h = state.hlaseniObjizdek.find(x => x.id === id);
  if (!h) return;
  if (h.stav !== 'precteno') { h.stav = 'precteno'; saveState(); }
  document.querySelector('.nav-item[data-section="mala-doprava"]').click();
  openMalaDopravaDen(h.datum);
};

// Formulář pro řidiče — nahlásit km navíc na jeho trase. Vkládá se dynamicky (ne jako součást
// vykresleného dashboardu), ať má vždy čerstvý seznam tras ze serveru (sync.me.mojeTrasy).
window.openObjizdkaHlaseniModal = function() {
  const stare = document.getElementById('objizdkaHlaseniModal'); if (stare) stare.remove();
  const jeDispecer = state.role === 'dispecer';
  const trasy = (sync.me && sync.me.mojeTrasy) || [];
  const dnes = toISO(new Date());
  // Vedoucí dopravy může nahlásit objížďku i za jiného řidiče — pak si vybere trasu ze všech tras PNS,
  // ne jen ze svých vlastních (appka stejně ověří na serveru, že se trasa s vybraným řidičem shoduje).
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="objizdkaHlaseniModal"><div class="modal">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
        <h2 style="margin-bottom:2px;">🛣️ Nahlásit objížďku</h2>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('objizdkaHlaseniModal').remove()">✕</button>
      </div>
      <p class="modal-sub">Km navíc se po odeslání rovnou zapíšou majiteli do Malé dopravy u dané trasy.</p>
      ${!jeDispecer && trasy.length === 0 ? `
        <p style="font-size:13px; color:var(--amber);">Zatím ti nevidím žádnou přiřazenou trasu PNS — zkus to za chvíli znovu, nebo to řekni majiteli.</p>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="document.getElementById('objizdkaHlaseniModal').remove()">Zavřít</button></div>
      ` : `
      <form id="objizdkaHlaseniForm">
        ${jeDispecer ? `
        <div class="form-row"><label>Řidič *</label>
          <select name="ridic" required>${ridiciProVyber().map(r => `<option value="${r.id}" ${String(r.id)===String(state.driverId)?'selected':''}>${r.jmeno}</option>`).join('')}</select>
        </div>
        <div class="form-row"><label>Trasa *</label>
          <select name="trasa" required>${PNS_ROUTES.map(t => `<option value="${t}" ${trasy[0]===t?'selected':''}>${t}</option>`).join('')}</select>
        </div>` : trasy.length > 1 ? `
        <div class="form-row"><label>Trasa *</label>
          <select name="trasa" required>${trasy.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>` : `
        <input type="hidden" name="trasa" value="${trasy[0]}">
        <p style="font-size:12.5px; color:var(--muted); margin-bottom:10px;">Trasa: <b>${trasy[0]}</b></p>`}
        <div class="form-cols-2">
          <div class="form-row"><label>Datum *</label><input type="date" name="datum" value="${dnes}" required></div>
          <div class="form-row"><label>Km navíc *</label><input type="number" name="km" min="1" step="1" required placeholder="např. 15"></div>
        </div>
        <div class="form-row"><label>Poznámka</label><textarea name="poznamka" rows="2" placeholder="např. uzavírka, objížďka přes..."></textarea></div>
        <p style="font-size:11.5px; color:var(--dim); margin-bottom:10px;">Pošleš-li hlášení znovu pro stejný den a trasu, poslední km přepíší ty předchozí (nesčítají se).</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="document.getElementById('objizdkaHlaseniModal').remove()">Zrušit</button>
          <button type="submit" class="btn btn-primary">Odeslat hlášení</button>
        </div>
      </form>
      `}
    </div></div>
  `);
  const form = document.getElementById('objizdkaHlaseniForm');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const cilovyRidic = jeDispecer ? state.ridici.find(r => String(r.id) === String(fd.get('ridic'))) : null;
    state.hlaseniObjizdek.unshift({
      id: Date.now(),
      driverId: cilovyRidic ? cilovyRidic.id : state.driverId,
      driverName: cilovyRidic ? cilovyRidic.jmeno : state.driverName,
      trasa: fd.get('trasa'), datum: fd.get('datum'), km: +fd.get('km') || 0,
      poznamka: (fd.get('poznamka') || '').trim(), vytvoreno: new Date().toISOString(), stav: 'nove'
    });
    saveState();
    document.getElementById('objizdkaHlaseniModal').remove();
    renderSection('dashboard');
    alert('Hlášení odesláno — majitel ho uvidí u objížděk.');
  });
};

// Dvě dedikovaná tlačítka na dashboardu vedoucí dopravy — na rozdíl od "+ Jízda"/"+ Tankování"
// (vlastní záznam, předvyplněný jí) tahle schválně NEpředvyplní řidiče, ať je jasné, že se zapisuje
// za NĚKOHO JINÉHO z tras, které jako vedoucí dopravy dozoruje.
window.openJizdaZaRidiceModal = function() {
  document.querySelector('.nav-item[data-section="jizdy"]').click();
  document.getElementById('content').querySelector('.modal-overlay#jizdaModal').outerHTML = renderJizdaModal(undefined, true);
  bindJizdaForm('jizdy');
  openModal('jizdaModal');
};
window.openTankovaniZaRidiceModal = function() {
  document.querySelector('.nav-item[data-section="tankovani"]').click();
  document.getElementById('content').querySelector('.modal-overlay#tankModal').outerHTML = renderTankModal({}, true);
  wireTankModal();
  openModal('tankModal');
};

// Volá sync.js, když přibude hlášení objížďky od řidiče — pošle majiteli upozornění
// (jen na tomhle zařízení a jen když má povolená oznámení; viz sync.initialLoadDone).
function oznamNoveHlaseniObjizdek(noveZaznamy) {
  if (state.role !== 'owner' || !('Notification' in window) || Notification.permission !== 'granted') return;
  noveZaznamy.forEach(h => {
    try { new Notification('Vondrášek — nová objížďka', { body: `${h.driverName}: trasa ${h.trasa}, +${h.km} km (${formatDate(h.datum)})`, icon: 'icon-192.png' }); } catch (e) {}
  });
}

function bindDashboard() {
  document.getElementById('dnesMalaDopravaCard')?.addEventListener('click', () => {
    document.querySelector('.nav-item[data-section="mala-doprava"]').click();
  });
  document.getElementById('btnZapnoutNotifikace')?.addEventListener('click', () => {
    Notification.requestPermission().then(() => renderSection('dashboard'));
  });
  document.getElementById('btnDashAddJizda').addEventListener('click', () => {
    document.querySelector('.nav-item[data-section="jizdy"]').click();
    openModal('jizdaModal');
  });
  document.getElementById('btnDashAddTank').addEventListener('click', () => {
    document.querySelector('.nav-item[data-section="tankovani"]').click();
    openModal('tankModal');
  });
  document.getElementById('btnDashAddObjizdka')?.addEventListener('click', openObjizdkaHlaseniModal);
  document.getElementById('btnDashAddJizdaZaRidice')?.addEventListener('click', openJizdaZaRidiceModal);
  document.getElementById('btnDashAddTankZaRidice')?.addEventListener('click', openTankovaniZaRidiceModal);

  // Zálohu dat vidí jen majitel (řidiči mají na dashboardu jen svoje)
  if (state.role !== 'owner') return;

  document.getElementById('btnStahnoutZalohu').addEventListener('click', () => {
    state.posledniZaloha = new Date().toISOString();
    saveState();
    downloadFile(`vondrasek-zaloha-${toISO(new Date())}.json`, 'application/json;charset=utf-8;', JSON.stringify(state, null, 2));
    renderSection('dashboard');
  });

  const obnovaInput = document.getElementById('obnovaZalohyInput');
  document.getElementById('btnObnovitZalohu').addEventListener('click', () => obnovaInput.click());
  obnovaInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      let data;
      try { data = JSON.parse(ev.target.result); } catch { alert('Soubor není platný JSON.'); return; }
      if (!data || typeof data !== 'object' || !Array.isArray(data.jizdy) || !Array.isArray(data.vozidla) || !Array.isArray(data.ridici)) {
        alert('Tento soubor nevypadá jako záloha appky Vondrášek — chybí očekávaná data (jízdy, vozidla, řidiči).');
        return;
      }
      if (!confirm('Obnovit ze zálohy PŘEPÍŠE všechna data na serveru — změna se projeví u všech (i u řidičů). Tato akce je nevratná. Pokračovat?')) return;
      const rel = nactiRelaci();
      Object.keys(state).forEach(k => delete state[k]);
      Object.assign(state, novyPrazdnyStav(), data);
      state.role = rel.role; state.driverId = rel.driverId; state.driverName = rel.driverName;
      state.ridici.forEach(r => { delete r.pin; });   // PINy se do serveru nikdy neposílají
      ulozKopii();
      odesli().then(() => { alert('Záloha je obnovena.'); location.reload(); })
              .catch(err => alert('Obnovení se nepodařilo dokončit: ' + err.message + '\nZkus to znovu s připojením k internetu.'));
    };
    reader.readAsText(file);
  });
}

// Posbírá stejná upozornění, která ukazuje dashboard (renderUpozorneni) — používá se i pro browser notifikace.
// Pole "dny" = počet dní do termínu (záporné = po termínu); u STK/pojistky/známky/karty řidiče bez přesného
// vlastního okna dopočítáme dny stejně jako zobrazený počet.
function ziskatVarovani() {
  const dnes = new Date();
  const varovani = [];
  state.vozidla.forEach(v => {
    const s = daysDiff(v.stk, dnes);
    if (s <= 60 && s >= 0) varovani.push({ ico:'🔧', text:`STK vozidla ${v.spz} za ${s} dní`, level: s<=30?'err':'warn', dny: s });
    const p = daysDiff(v.pojistka, dnes);
    if (p <= 60 && p >= 0) varovani.push({ ico:'🛡️', text:`Pojistka vozidla ${v.spz} za ${p} dní`, level: p<=30?'err':'warn', dny: p });
    const dz = daysDiff(v.dalnicniZnamka, dnes);
    if (dz <= 60 && dz >= 0) varovani.push({ ico:'🛣️', text:`Dálniční známka vozidla ${v.spz} za ${dz} dní`, level: dz<=30?'err':'warn', dny: dz });
    if (['Kamion','Tahač'].includes(v.typ)) {
      const t = stazeniVarovani(`Stažení tachografu vozidla ${v.spz}`, v.posledniStazeniTacho, 90);
      if (t) varovani.push({ ico:'📡', ...t });
    }
  });
  state.ridici.forEach(r => {
    const k = daysDiff(r.kartaRidice, dnes);
    if (k <= 60 && k >= 0) varovani.push({ ico:'💳', text:`Karta řidiče ${r.jmeno} vyprší za ${k} dní`, level:'warn', dny: k });
    const c = stazeniVarovani(`Stažení karty řidiče ${r.jmeno}`, r.posledniStazeniKarty, 28);
    if (c) varovani.push({ ico:'📥', ...c });
  });
  return varovani;
}

// Tlačítko/stav pro browser notifikace — Notification nemusí v prohlížeči existovat (starší prohlížeče, iOS bez PWA)
function renderNotifikaceOvladani() {
  if (!('Notification' in window)) return '';
  if (Notification.permission === 'granted') return `<span class="badge ok">🔔 Upozornění zapnuta</span>`;
  if (Notification.permission === 'denied') return `<span class="badge err" title="Povolení bylo zablokováno v prohlížeči">🔔 Upozornění blokována</span>`;
  return `<button class="btn btn-ghost btn-sm" id="btnZapnoutNotifikace">🔔 Zapnout upozornění</button>`;
}

// Projde stejná upozornění jako dashboard a pro ta s termínem do 7 dní (nebo prošlá) pošle browser notifikaci — max 1x denně
function posliNotifikaceProUpozorneni() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const dnesIso = toISO(new Date());
  if (state.posledniNotifikace === dnesIso) return;
  const urgentni = ziskatVarovani().filter(v => typeof v.dny === 'number' && v.dny <= 7);
  urgentni.forEach(v => {
    try { new Notification('Vondrášek — Provozní systém', { body: v.text, icon: 'icon-192.png' }); } catch (e) {}
  });
  state.posledniNotifikace = dnesIso;
  saveState();
}

function renderUpozorneni() {
  const varovani = ziskatVarovani();
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
  const list = mojeJizdy();
  return `
    <div class="page-head">
      <div><h1>🛣️ Evidence jízd</h1><p>${isOwner ? 'Přehled všech jízd — filtruj, hledej, exportuj.' : state.role === 'dispecer' ? 'Přehled jízd za všechny řidiče — bez financí.' : 'Tvoje jízdy.'}</p></div>
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
        <thead><tr><th>Datum</th><th>Řidič</th><th>Vozidlo</th><th>Trasa</th><th style="text-align:right">km</th><th>Poznámka</th>${isOwner?'<th style="text-align:right">Zisk</th><th></th>':''}</tr></thead>
        <tbody id="jizdyBody">${renderJizdyRows(list, isOwner)}</tbody>
      </table>
    </div>
    ${renderJizdaModal()}
    ${renderFinanceModal()}
  `;
}

// zobrazitTyp: na stránce, kde se mísí CZ i EU jízdy (Evidence jízd), ukáže u trasy malý štítek CZ/EU.
// Na vlastních stránkách Velké dopravy (už filtrovaných na jeden typ) je štítek zbytečný — tam se vypne.
function renderJizdyRows(list, isOwner, zobrazitTyp = true) {
  if (!list.length) return `<tr><td colspan="${isOwner?8:6}"><div class="empty-state"><div class="empty-ic">🛣️</div>Žádné jízdy.</div></td></tr>`;
  return list.map(j => {
    const jeEu = (j.typ || 'cz') === 'eu';
    const typBadge = zobrazitTyp ? `<span class="badge ${jeEu?'info':'ok'}" style="margin-right:6px;">${jeEu?'EU':'CZ'}</span>` : '';
    return `
    <tr>
      <td>${formatDate(j.datum)}</td><td>${j.ridic}</td><td>${j.vozidlo}</td>
      <td>${typBadge}${j.trasaOd} → ${j.trasaDo}</td>
      <td style="text-align:right">${j.km}</td>
      <td style="color:var(--muted);font-size:12.5px;">${j.poznamka||'—'}</td>
      ${isOwner?`<td style="text-align:right">${ziskBadge(j.financni)}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-ghost btn-sm" onclick="openFinance(${j.id})">💰 Finance</button>
        <button class="btn btn-danger btn-sm" onclick="deleteJizda(${j.id})">Smazat</button>
      </td>`:''}
    </tr>
  `;}).join('');
}

function ziskBadge(f) {
  if (!f) return `<span style="color:var(--dim); font-size:12px;">Doplnit</span>`;
  const naklady = (+f.palivo||0)+(+f.mytne||0)+(+f.clo||0)+(+f.amortizace||0)+(+f.pojisteni||0)+(+f.ridicNaklad||0)+(+f.ostatni||0);
  const zisk = (+f.fakturovano||0) - naklady;
  const barva = zisk >= 0 ? 'var(--green)' : 'var(--red)';
  return `<b style="color:${barva};">${zisk.toLocaleString('cs-CZ')} Kč</b>`;
}

function bindJizdy() {
  const isOwner = state.role === 'owner';
  document.getElementById('btnAddJizda').addEventListener('click', () => openModal('jizdaModal'));
  document.getElementById('btnExportJizdy').addEventListener('click', exportJizdyCSV);

  function applyFilter() {
    const q = (document.getElementById('jizdyFilter').value||'').toLowerCase();
    const m = document.getElementById('jizdyMesic').value;
    let list = mojeJizdy();
    if (q) list = list.filter(j => `${j.ridic} ${j.trasaOd} ${j.trasaDo} ${j.vozidlo} ${j.poznamka||''}`.toLowerCase().includes(q));
    if (m) list = list.filter(j => j.datum.startsWith(m));
    document.getElementById('jizdyBody').innerHTML = renderJizdyRows(list, isOwner);
  }
  document.getElementById('jizdyFilter').addEventListener('input', applyFilter);
  document.getElementById('jizdyMesic').addEventListener('change', applyFilter);

  bindJizdaForm('jizdy');
  if (isOwner) wireFinanceModal();
}

// Sdílený zápis formuláře nové jízdy — používá ho Evidence jízd i obě stránky Velké dopravy (mají
// vlastní #jizdaModal/#jizdaForm ve svém vykresleném obsahu, jen se po uložení vrátí na svou sekci).
function bindJizdaForm(sekceProRenderPoUlozeni) {
  document.getElementById('jizdaForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const vozidlo = fd.get('vozidlo');
    state.jizdy.unshift({
      id: Date.now(), datum: fd.get('datum'), ridic: fd.get('ridic'), driverId: idRidiceZVyberu(fd.get('ridic')),
      vozidlo, typ: fd.get('typ') === 'eu' ? 'eu' : 'cz', trasaOd: fd.get('trasaOd'), trasaDo: fd.get('trasaDo'),
      km: +fd.get('km'), poznamka: fd.get('poznamka'), financni: null
    });
    if (state.role === 'driver' && state.driverId) {
      state.lastVozidloPerDriver[state.driverId] = vozidlo;
    }
    saveState(); closeModal('jizdaModal'); renderSection(sekceProRenderPoUlozeni);
  });
}

// ==========================================================
// FINANCE NA JÍZDU — fakturováno, náklady, čistý zisk
// ==========================================================
function renderFinanceModal(j={}, f={}) {
  return `
    <div class="modal-overlay" id="financeModal">
      <div class="modal">
        <h2>💰 Finance na jízdu</h2>
        <p class="modal-sub">${j.trasaOd ? `${j.trasaOd} → ${j.trasaDo} · ${formatDate(j.datum)} · ${j.km} km` : 'Vyplň fakturovanou částku a náklady na tuto jízdu.'}</p>
        <form id="financeForm">
          <input type="hidden" name="jizdaId" value="${j.id||''}">
          <div class="form-row">
            <label>Fakturováno klientovi (Kč) *</label>
            <input type="number" name="fakturovano" step="1" min="0" required value="${f.fakturovano||''}" style="font-size:18px; font-weight:700;">
          </div>

          <div style="font-size:11px; letter-spacing:1px; color:var(--muted); text-transform:uppercase; margin:18px 0 8px; padding-top:14px; border-top:1px solid var(--border-c);">Náklady na jízdu</div>

          <div class="form-cols-2">
            <div class="form-row"><label>Palivo (Kč)</label><input type="number" name="palivo" step="1" min="0" value="${f.palivo||''}"></div>
            <div class="form-row"><label>Mýtné (Kč)</label><input type="number" name="mytne" step="1" min="0" value="${f.mytne||''}"></div>
          </div>
          <div class="form-cols-2">
            <div class="form-row"><label>Clo (Kč)</label><input type="number" name="clo" step="1" min="0" value="${f.clo||''}"></div>
            <div class="form-row">
              <label>Amortizace (Kč)</label>
              <div style="display:flex; gap:6px;">
                <input type="number" name="amortizace" step="1" min="0" value="${f.amortizace||''}" id="amortizaceField">
                <button type="button" class="btn btn-ghost btn-sm" id="btnAutoAmortizace" style="white-space:nowrap;" title="Spočítat podle km × Kč/km vozidla">Auto</button>
              </div>
            </div>
          </div>
          <div class="form-cols-2">
            <div class="form-row"><label>Pojištění (Kč)</label><input type="number" name="pojisteni" step="1" min="0" value="${f.pojisteni||''}"></div>
            <div class="form-row"><label>Náklad na řidiče (Kč)</label><input type="number" name="ridicNaklad" step="1" min="0" value="${f.ridicNaklad||''}"></div>
          </div>
          <div class="form-row"><label>Ostatní poplatky (Kč)</label><input type="number" name="ostatni" step="1" min="0" value="${f.ostatni||''}"></div>

          <div id="ziskPreview" style="margin-top:18px; padding:16px; background:var(--card); border-radius:var(--radius-sm); border:1px solid var(--border-c);"></div>

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeModal('financeModal')">Zrušit</button>
            <button type="submit" class="btn btn-primary">Uložit finance</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function wireFinanceModal() {
  const form = document.getElementById('financeForm');
  if (!form) return;

  function updatePreview() {
    const fd = new FormData(form);
    const fakturovano = +fd.get('fakturovano') || 0;
    const naklady = ['palivo','mytne','clo','amortizace','pojisteni','ridicNaklad','ostatni'].reduce((s,k) => s + (+fd.get(k)||0), 0);
    const zisk = fakturovano - naklady;
    const marze = fakturovano > 0 ? (zisk/fakturovano*100).toFixed(1) : '0.0';
    const barva = zisk >= 0 ? 'var(--green)' : 'var(--red)';
    document.getElementById('ziskPreview').innerHTML = `
      <div style="display:flex; justify-content:space-between; font-size:13px; color:var(--muted); margin-bottom:6px;">
        <span>Náklady celkem</span><span>${naklady.toLocaleString('cs-CZ')} Kč</span>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:14px; font-weight:600; color:var(--white);">Čistý zisk</span>
        <span style="font-size:22px; font-weight:800; color:${barva};">${zisk.toLocaleString('cs-CZ')} Kč</span>
      </div>
      <div style="text-align:right; font-size:11.5px; color:var(--dim); margin-top:2px;">marže ${marze} %</div>
    `;
  }
  form.querySelectorAll('input').forEach(inp => inp.addEventListener('input', updatePreview));
  updatePreview();

  const btnAuto = document.getElementById('btnAutoAmortizace');
  if (btnAuto) {
    btnAuto.addEventListener('click', () => {
      const jizdaId = +form.querySelector('[name="jizdaId"]').value;
      const j = state.jizdy.find(j=>j.id===jizdaId);
      if (!j) { alert('Nejprve jízdu ulož, pak lze dopočítat amortizaci.'); return; }
      const v = state.vozidla.find(v=>v.spz===j.vozidlo);
      if (!v || !v.amortizaceKm) { alert('U vozidla ' + j.vozidlo + ' není nastavená sazba Kč/km. Nastav ji v sekci Vozidla → Upravit.'); return; }
      document.getElementById('amortizaceField').value = Math.round(v.amortizaceKm * j.km);
      updatePreview();
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const jizdaId = +fd.get('jizdaId');
    const financni = {
      fakturovano: +fd.get('fakturovano')||0, palivo: +fd.get('palivo')||0, mytne: +fd.get('mytne')||0,
      clo: +fd.get('clo')||0, amortizace: +fd.get('amortizace')||0, pojisteni: +fd.get('pojisteni')||0,
      ridicNaklad: +fd.get('ridicNaklad')||0, ostatni: +fd.get('ostatni')||0
    };
    const idx = state.jizdy.findIndex(j=>j.id===jizdaId);
    if (idx>=0) state.jizdy[idx].financni = financni;
    saveState(); closeModal('financeModal'); renderSection(aktualniSekceNazev('jizdy'));
  });
}

window.openFinance = function(id) {
  const j = state.jizdy.find(j=>j.id===id);
  if (!j) return;
  document.getElementById('content').querySelector('.modal-overlay#financeModal').outerHTML = renderFinanceModal(j, j.financni || {});
  wireFinanceModal();
  openModal('financeModal');
};

function renderJizdaModal(vychoziTyp, zaJineho = false) {
  const dnes = new Date().toISOString().slice(0,10);
  const isDriver = state.role === 'driver';
  const isDispecer = state.role === 'dispecer';
  const jeEu = vychoziTyp === 'eu';
  return `
    <div class="modal-overlay" id="jizdaModal">
      <div class="modal">
        <h2>${zaJineho ? '🚚 Jízda za řidiče' : 'Nová jízda'}</h2>
        <p class="modal-sub">${zaJineho ? 'Zapisuješ za JINÉHO řidiče, kterého jako vedoucí dopravy dozoruješ — ne za svou vlastní trasu.' : 'Vyplň údaje o jízdě.'}</p>
        <form id="jizdaForm">
          <div class="form-cols-2">
            <div class="form-row"><label>Datum *</label><input type="date" name="datum" value="${dnes}" required></div>
            <div class="form-row"><label>Řidič *</label>
              <select name="ridic" required>
                ${zaJineho ? '<option value="" disabled selected>— vyber řidiče —</option>' : ''}
                ${ridiciProVyber().map(r => { const s = kratkeJmenoRidice(r.jmeno); const vlastni = String(r.id)===String(state.driverId); return `<option value="${s}" ${!zaJineho&&(isDriver||(isDispecer&&vlastni))?'selected':''}>${r.jmeno}</option>`; }).join('')}
                ${state.ridici.length===0?'<option>Nejprve přidej řidiče</option>':''}
              </select>
              ${isDispecer && !zaJineho ? '<span style="font-size:11px; color:var(--purple-light); display:block; margin-top:4px;">Tohle je tvůj vlastní záznam. Za jiného řidiče použij tlačítko „Jízda za řidiče" na dashboardu.</span>' : ''}
            </div>
          </div>
          <div class="form-row"><label>Typ dopravy *</label>
            <select name="typ" required>
              <option value="cz" ${!jeEu?'selected':''}>🚚 Velká doprava CZ (vnitrostátní)</option>
              <option value="eu" ${jeEu?'selected':''}>🌍 Velká doprava EU (mezinárodní)</option>
            </select>
          </div>
          <div class="form-row"><label>Vozidlo *</label>
            <select name="vozidlo" required>
              ${state.vozidla.map(v => {
                const posledni = isDriver ? state.lastVozidloPerDriver[state.driverId] : null;
                const selected = posledni ? v.spz === posledni : false;
                return `<option value="${v.spz}" ${selected?'selected':''}>${v.spz} — ${v.znacka}</option>`;
              }).join('')}
              ${state.vozidla.length===0?'<option>Nejprve přidej vozidlo</option>':''}
            </select>
            ${isDriver && state.lastVozidloPerDriver[state.driverId] ? '<span style="font-size:11px;color:var(--purple-light);">Předvyplněno podle poslední jízdy</span>' : ''}
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
window.deleteJizda = function(id) { if(!confirm('Smazat jízdu?')) return; state.jizdy = state.jizdy.filter(j=>j.id!==id); saveState(); renderSection(aktualniSekceNazev('jizdy')); };

function exportJizdyCSV() {
  const isOwner = state.role === 'owner';
  const mesic = document.getElementById('jizdyMesic')?.value || '';
  let list = mojeJizdy();
  if (mesic) list = list.filter(j => j.datum.startsWith(mesic));
  const rows = [['Datum','Typ','Řidič','Vozidlo','Odkud','Kam','km','Poznámka'], ...list.map(j=>[j.datum,(j.typ||'cz')==='eu'?'EU':'CZ',j.ridic,j.vozidlo,j.trasaOd,j.trasaDo,j.km,j.poznamka||''])];
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile('jizdy.csv','text/csv;charset=utf-8;','\uFEFF'+csv);
}

// ==========================================================
// VELKÁ DOPRAVA — CZ (vnitrostátní) a EU (mezinárodní), dvě stránky nad stejnou evidencí jízd
// ==========================================================
const VELKA_DOPRAVA_INFO = {
  cz: { nazev: 'Velká doprava (CZ – vnitrostátní)', ikona: '🚚', popis: 'Vnitrostátní přepravy po celé ČR.' },
  eu: { nazev: 'Velká doprava EU (zahraničí)', ikona: '🌍', popis: 'Mezinárodní přepravy po Evropě.' }
};

// Jízdy přihlášeného (majitel všechny, řidič své) filtrované na jeden typ dopravy
function jizdyPodleTypu(typ) {
  return mojeJizdy().filter(j => (j.typ || 'cz') === typ);
}

function renderVelkaDoprava(typ) {
  const info = VELKA_DOPRAVA_INFO[typ];
  const isOwner = state.role === 'owner';
  const list = jizdyPodleTypu(typ);
  const kmCelkem = list.reduce((s,j)=>s+(+j.km||0),0);

  // Ziskovost — jen jízdy, kde je finance vyplněné (stejná logika jako v Reportech)
  const listFinance = list.filter(j => j.financni);
  let sumFakturovano = 0, sumNaklady = 0;
  listFinance.forEach(j => {
    const f = j.financni;
    sumFakturovano += (+f.fakturovano||0);
    sumNaklady += (+f.palivo||0)+(+f.mytne||0)+(+f.clo||0)+(+f.amortizace||0)+(+f.pojisteni||0)+(+f.ridicNaklad||0)+(+f.ostatni||0);
  });
  const sumZisk = sumFakturovano - sumNaklady;
  const marze = sumFakturovano > 0 ? (sumZisk/sumFakturovano*100).toFixed(1) : '0.0';

  return `
    <div class="page-head">
      <div><h1>${info.ikona} ${info.nazev}</h1><p>${info.popis} ${isOwner ? 'Přehled všech jízd — filtruj, hledej, exportuj.' : 'Tvoje jízdy.'}</p></div>
      <div class="page-actions"><button class="btn btn-primary" id="btnAddJizdaVelka">+ Nová jízda</button></div>
    </div>

    ${isOwner ? `
    <div class="metrics" style="margin-bottom:20px;">
      <div class="metric"><div class="m-label">Počet jízd</div><div class="m-value">${list.length}</div></div>
      <div class="metric"><div class="m-label">Km celkem</div><div class="m-value">${kmCelkem.toLocaleString('cs-CZ')}</div></div>
      <div class="metric"><div class="m-label">Tržby</div><div class="m-value">${sumFakturovano.toLocaleString('cs-CZ')} Kč</div>${listFinance.length < list.length ? `<div class="m-delta neutral">${listFinance.length}/${list.length} jízd s financemi</div>` : ''}</div>
      <div class="metric"><div class="m-label">Čistý zisk</div><div class="m-value" style="color:${sumZisk>=0?'var(--green)':'var(--red)'};">${sumZisk.toLocaleString('cs-CZ')} Kč</div><div class="m-delta neutral">marže ${marze} %</div></div>
    </div>
    ` : ''}

    <div class="table-wrap">
      <div class="table-toolbar">
        <input type="text" id="velkaFilter" placeholder="Hledat (řidič, trasa, vozidlo...)">
        <select id="velkaMesic">
          <option value="">Všechny měsíce</option>
          ${posledni12Mesicu().map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <button class="btn btn-ghost btn-sm" id="btnExportVelka">📥 Export CSV</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Datum</th><th>Řidič</th><th>Vozidlo</th><th>Trasa</th><th style="text-align:right">km</th><th>Poznámka</th>${isOwner?'<th style="text-align:right">Zisk</th><th></th>':''}</tr></thead>
        <tbody id="velkaBody">${renderJizdyRows(list, isOwner, false)}</tbody>
      </table>
    </div>
    ${renderJizdaModal(typ)}
    ${renderFinanceModal()}
  `;
}

function bindVelkaDoprava(typ) {
  const isOwner = state.role === 'owner';
  const sekce = typ === 'eu' ? 'velka-eu' : 'velka-cz';
  document.getElementById('btnAddJizdaVelka').addEventListener('click', () => openModal('jizdaModal'));
  document.getElementById('btnExportVelka').addEventListener('click', () => exportVelkaDopravaCSV(typ));

  function applyFilter() {
    const q = (document.getElementById('velkaFilter').value||'').toLowerCase();
    const m = document.getElementById('velkaMesic').value;
    let list = jizdyPodleTypu(typ);
    if (q) list = list.filter(j => `${j.ridic} ${j.trasaOd} ${j.trasaDo} ${j.vozidlo} ${j.poznamka||''}`.toLowerCase().includes(q));
    if (m) list = list.filter(j => j.datum.startsWith(m));
    document.getElementById('velkaBody').innerHTML = renderJizdyRows(list, isOwner, false);
  }
  document.getElementById('velkaFilter').addEventListener('input', applyFilter);
  document.getElementById('velkaMesic').addEventListener('change', applyFilter);

  bindJizdaForm(sekce);
  if (isOwner) wireFinanceModal();
}

// Export jízd dané kategorie (CZ/EU) i s financemi — podklad pro účetnictví/fakturaci
function exportVelkaDopravaCSV(typ) {
  const mesic = document.getElementById('velkaMesic')?.value || '';
  let list = jizdyPodleTypu(typ);
  if (mesic) list = list.filter(j => j.datum.startsWith(mesic));
  const rows = [['Datum','Řidič','Vozidlo','Odkud','Kam','km','Fakturováno Kč','Náklady Kč','Zisk Kč','Poznámka'], ...list.map(j => {
    const f = j.financni;
    const naklady = f ? (+f.palivo||0)+(+f.mytne||0)+(+f.clo||0)+(+f.amortizace||0)+(+f.pojisteni||0)+(+f.ridicNaklad||0)+(+f.ostatni||0) : '';
    const fakturovano = f ? (+f.fakturovano||0) : '';
    const zisk = f ? ((+f.fakturovano||0) - naklady) : '';
    return [j.datum, j.ridic, j.vozidlo, j.trasaOd, j.trasaDo, j.km, fakturovano, naklady, zisk, j.poznamka||''];
  })];
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(`velka-doprava-${typ}-${mesic||'vse'}.csv`,'text/csv;charset=utf-8;',String.fromCharCode(0xFEFF)+csv);
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
      <div class="table-toolbar">
        <select id="tankMesic">
          <option value="">Všechny měsíce</option>
          ${posledni12Mesicu().map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
        </select>
        <div class="spacer"></div>
        <button class="btn btn-ghost btn-sm" id="btnExportTank">📥 Export CSV</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Datum</th><th>Vozidlo</th><th>Řidič</th><th>Místo</th><th style="text-align:right">Litry</th><th style="text-align:right">Cena</th><th>Účtenka</th><th></th></tr></thead>
        <tbody id="tankBody">${renderTankRows(state.tankovani)}</tbody>
      </table>
    </div>
    ${renderTankModal()}
    ${renderReceiptLightbox()}
  `;
}

function renderTankRows(list) {
  if (!list.length) return `<tr><td colspan="8"><div class="empty-state"><div class="empty-ic">⛽</div>Žádné záznamy.</div></td></tr>`;
  return list.map(t=>`
    <tr>
      <td>${formatDate(t.datum)}</td><td>${t.vozidlo}</td><td>${t.ridic}</td><td>${t.misto}</td>
      <td style="text-align:right">${t.litry} l</td>
      <td style="text-align:right"><b>${(+t.cenaCelkem).toLocaleString('cs-CZ')} Kč</b></td>
      <td>${t.uctenka ? `<img src="${hAttr(t.uctenka)}" class="receipt-thumb" onclick="showReceipt(this.src)" alt="Účtenka">` : '<span style="color:var(--dim);font-size:12px;">—</span>'}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-ghost btn-sm" onclick="editTank(${t.id})">Upravit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteTank(${t.id})">Smazat</button>
      </td>
    </tr>
  `).join('');
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

function renderTankModal(t={}, zaJineho = false) {
  const dnes = new Date().toISOString().slice(0,10);
  const isDriver = state.role === 'driver';
  const isDispecer = state.role === 'dispecer';
  return `
    <div class="modal-overlay" id="tankModal">
      <div class="modal">
        <h2>${zaJineho ? '⛽ Tankování za řidiče' : (t.id?'Upravit tankování':'Nové tankování')}</h2>
        <p class="modal-sub">${zaJineho ? 'Zapisuješ za JINÉHO řidiče, kterého jako vedoucí dopravy dozoruješ — ne za svou vlastní trasu.' : (t.id?'Uprav údaje o tankování.':'Zápis o tankování — klidně vyfoť účtenku.')}</p>
        <form id="tankForm">
          <input type="hidden" name="editId" value="${t.id||''}">
          <input type="hidden" name="uctenkaData" id="uctenkaDataField" value="${hAttr(t.uctenka)}">
          <div class="form-cols-2">
            <div class="form-row"><label>Datum *</label><input type="date" name="datum" value="${t.datum||dnes}" required></div>
            <div class="form-row"><label>Místo *</label><input type="text" name="misto" required value="${t.misto||''}" placeholder="např. OMV Praha"></div>
          </div>
          <div class="form-cols-2">
            <div class="form-row"><label>Vozidlo *</label>
              <select name="vozidlo" required>
                ${state.vozidla.map(v => {
                  const posledni = isDriver ? state.lastVozidloPerDriver[state.driverId] : null;
                  const selected = t.vozidlo ? v.spz === t.vozidlo : (posledni ? v.spz === posledni : false);
                  return `<option ${selected?'selected':''}>${v.spz}</option>`;
                }).join('')}
              </select>
              ${!t.id && isDriver && state.lastVozidloPerDriver[state.driverId] ? '<span style="font-size:11px;color:var(--purple-light);">Předvyplněno podle posledního tankování</span>' : ''}
            </div>
            <div class="form-row"><label>Řidič *</label>
              <select name="ridic" required>
                ${zaJineho ? '<option value="" disabled selected>— vyber řidiče —</option>' : ''}
                ${ridiciProVyber().map(r => {
                  const s = kratkeJmenoRidice(r.jmeno);
                  const vlastni = String(r.id)===String(state.driverId);
                  const selected = t.ridic ? t.ridic === s : (!zaJineho && (isDriver || (isDispecer && vlastni)));
                  return `<option value="${s}" ${selected?'selected':''}>${s}</option>`;
                }).join('')}
              </select>
              ${isDispecer && !zaJineho ? '<span style="font-size:11px; color:var(--purple-light); display:block; margin-top:4px;">Tohle je tvůj vlastní záznam. Za jiného řidiče použij tlačítko „Tankování za řidiče" na dashboardu.</span>' : ''}
            </div>
          </div>
          <div class="form-cols-2">
            <div class="form-row"><label>Litry *</label><input type="number" name="litry" step="0.01" required value="${t.litry||''}"></div>
            <div class="form-row"><label>Cena celkem (Kč) *</label><input type="number" name="cenaCelkem" step="0.01" required value="${t.cenaCelkem||''}"></div>
          </div>
          <div class="form-row">
            <label>📷 Fotka účtenky (nepovinné)</label>
            <input type="file" name="uctenkaFile" id="uctenkaInput" accept="image/*" capture="environment">
            <div id="uctenkaPreviewWrap" style="${t.uctenka?'':'display:none;'} margin-top:10px;">
              <img id="uctenkaPreview" src="${hAttr(t.uctenka)}" style="max-width:160px; border-radius:8px; border:1px solid var(--border-c);">
              <button type="button" class="btn btn-ghost btn-sm" id="btnRemoveUctenka" style="margin-left:10px;">Odebrat fotku</button>
            </div>
            <span style="font-size:11.5px; color:var(--dim); margin-top:4px; display:block;">Fotka se zmenší, aby zbytečně nezabírala místo. Slouží jako doklad k záznamu.</span>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeModal('tankModal')">Zrušit</button>
            <button type="submit" class="btn btn-primary">${t.id?'Uložit změny':'Uložit'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// Připojí posluchače na aktuální (právě vykreslený) tankModal formulář.
// Voláno vždy po vykreslení nového modalu — DOM uzel je vždy čerstvý, takže nehrozí zdvojení listenerů.
function wireTankModal() {
  const uctenkaInput = document.getElementById('uctenkaInput');
  const uctenkaDataField = document.getElementById('uctenkaDataField');

  uctenkaInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    resizeImageToBase64(file, 900, 0.72).then(base64 => {
      uctenkaDataField.value = base64;
      document.getElementById('uctenkaPreview').src = base64;
      document.getElementById('uctenkaPreviewWrap').style.display = 'block';
    });
  });
  document.getElementById('btnRemoveUctenka').addEventListener('click', () => {
    uctenkaDataField.value = '';
    uctenkaInput.value = '';
    document.getElementById('uctenkaPreviewWrap').style.display = 'none';
  });

  document.getElementById('tankForm').addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    const vozidlo = fd.get('vozidlo');
    const editId = fd.get('editId');
    const data = {
      datum: fd.get('datum'), vozidlo, ridic: fd.get('ridic'), driverId: idRidiceZVyberu(fd.get('ridic')),
      misto: fd.get('misto'), litry: +fd.get('litry'), cenaCelkem: +fd.get('cenaCelkem'),
      uctenka: fd.get('uctenkaData') || null
    };
    if (editId) {
      const idx = state.tankovani.findIndex(t=>t.id===+editId);
      if (idx>=0) state.tankovani[idx] = { ...state.tankovani[idx], ...data };
    } else {
      state.tankovani.unshift({ id: Date.now(), ...data });
    }
    if (state.role === 'driver' && state.driverId) {
      state.lastVozidloPerDriver[state.driverId] = vozidlo;
    }
    saveState(); closeModal('tankModal'); renderSection('tankovani');
  });
}

function bindTankovani() {
  wireTankModal();
  document.getElementById('btnAddTank').addEventListener('click', () => {
    // Nahradí modal čerstvou prázdnou verzí (kdyby předtím byl otevřený s daty k editaci)
    document.getElementById('content').querySelector('.modal-overlay#tankModal').outerHTML = renderTankModal();
    wireTankModal();
    openModal('tankModal');
  });

  document.getElementById('tankMesic').addEventListener('change', (e) => {
    const m = e.target.value;
    const list = m ? state.tankovani.filter(t => t.datum.startsWith(m)) : state.tankovani;
    document.getElementById('tankBody').innerHTML = renderTankRows(list);
  });
  document.getElementById('btnExportTank').addEventListener('click', exportTankovaniCSV);
}

function exportTankovaniCSV() {
  const mesic = document.getElementById('tankMesic')?.value || '';
  const list = mesic ? state.tankovani.filter(t => t.datum.startsWith(mesic)) : state.tankovani;
  const rows = [['Datum','Vozidlo','Řidič','Místo','Litry','Cena celkem','Cena za litr'], ...list.map(t => {
    const cenaZaLitr = (+t.litry) > 0 ? (+t.cenaCelkem / +t.litry).toFixed(2) : '';
    return [t.datum, t.vozidlo, t.ridic, t.misto, t.litry, t.cenaCelkem, cenaZaLitr];
  })];
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile('tankovani.csv','text/csv;charset=utf-8;','﻿'+csv);
}
window.editTank = function(id) {
  const t = state.tankovani.find(t=>t.id===id);
  if (!t) return;
  document.getElementById('content').querySelector('.modal-overlay#tankModal').outerHTML = renderTankModal(t);
  wireTankModal();
  openModal('tankModal');
};
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
        <thead><tr><th>SPZ</th><th>Typ</th><th>Značka</th><th>STK</th><th>Pojistka</th><th>Dálniční známka</th><th>Tachograf</th><th>Poznámka</th><th></th></tr></thead>
        <tbody>
          ${state.vozidla.length===0 ? `<tr><td colspan="9"><div class="empty-state"><div class="empty-ic">🚛</div>Žádná vozidla — přidej první.</div></td></tr>` :
          state.vozidla.map(v=>{
            const maTacho = ['Kamion','Tahač'].includes(v.typ);
            return `
            <tr>
              <td><b>${v.spz}</b></td><td>${v.typ}</td><td>${v.znacka}</td>
              <td>${formatDate(v.stk)} ${termBadge(v.stk)}</td>
              <td>${formatDate(v.pojistka)} ${termBadge(v.pojistka)}</td>
              <td>${v.dalnicniZnamka ? formatDate(v.dalnicniZnamka)+' '+termBadge(v.dalnicniZnamka) : '<span style="color:var(--dim);font-size:12px;">—</span>'}</td>
              <td>${maTacho ? (v.posledniStazeniTacho ? formatDate(v.posledniStazeniTacho)+' '+stazeniBadge(v.posledniStazeniTacho,90) : '<span style="color:var(--dim);font-size:12px;">nikdy</span>') : '<span style="color:var(--dim);font-size:12px;">—</span>'}</td>
              <td style="color:var(--muted);font-size:12.5px;">${v.poznamka||'—'}</td>
              <td style="display:flex;gap:6px;">
                ${maTacho ? `<button class="btn btn-ghost btn-sm" onclick="stazenoTachoDnes(${v.id})">📡 Staženo dnes</button>` : ''}
                <button class="btn btn-ghost btn-sm" onclick="editVozidlo(${v.id})">Upravit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteVozidlo(${v.id})">Smazat</button>
              </td>
            </tr>
          `;}).join('')}
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
          <div class="form-row"><label>Dálniční známka platná do</label><input type="date" name="dalnicniZnamka" value="${v.dalnicniZnamka||''}"></div>
          <div class="form-row" id="tachoFieldWrap" style="${['Kamion','Tahač'].includes(v.typ)?'':'display:none;'}">
            <label>Poslední stažení tachografu</label>
            <input type="date" name="posledniStazeniTacho" value="${v.posledniStazeniTacho||''}">
            <span style="font-size:11.5px; color:var(--dim); margin-top:4px; display:block;">Povinné stahovat každých 90 dní. Jen u kamionu a tahače.</span>
          </div>
          <div class="form-row">
            <label>Amortizace (Kč/km)</label>
            <input type="number" name="amortizaceKm" step="0.1" min="0" value="${v.amortizaceKm||''}" placeholder="např. 3.0">
            <span style="font-size:11.5px; color:var(--dim); margin-top:4px; display:block;">Odhad opotřebení vozidla na kilometr — použije se pro výpočet zisku na jízdu.</span>
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
  const typSelect = document.querySelector('#vozidloForm [name="typ"]');
  if (typSelect) {
    typSelect.addEventListener('change', () => {
      document.getElementById('tachoFieldWrap').style.display = ['Kamion','Tahač'].includes(typSelect.value) ? '' : 'none';
    });
  }
  document.getElementById('vozidloForm').addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    const editId = fd.get('editId');
    const data = { spz: fd.get('spz'), typ: fd.get('typ'), znacka: fd.get('znacka'), stk: fd.get('stk'), pojistka: fd.get('pojistka'), dalnicniZnamka: fd.get('dalnicniZnamka') || null, poznamka: fd.get('poznamka'), amortizaceKm: +fd.get('amortizaceKm') || 0, posledniStazeniTacho: fd.get('posledniStazeniTacho') || null };
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
window.stazenoTachoDnes = function(id) {
  const v = state.vozidla.find(v=>v.id===id);
  if (!v) return;
  v.posledniStazeniTacho = toISO(new Date());
  saveState(); renderSection('vozidla');
};

// ==========================================================
// ŘIDIČI — CRUD + EDITACE
// ==========================================================
function renderRidici() {
  return `
    <div class="page-head">
      <div><h1>👷 Řidiči</h1><p>Seznam řidičů, karty, průkazy a jejich výkon.</p></div>
      <div class="page-actions"><button class="btn btn-ghost" onclick="openPinDialog('owner','majitele')">🔑 PIN majitele</button><button class="btn btn-primary" id="btnAddRidic">+ Nový řidič</button></div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Jméno</th><th>Telefon</th><th>Skupina</th><th style="text-align:right">Jízd</th><th style="text-align:right">km celkem</th><th style="text-align:right">Zisk</th><th>Karty</th><th>Stažení karty</th><th></th></tr></thead>
        <tbody>
          ${state.ridici.length===0 ? `<tr><td colspan="9"><div class="empty-state"><div class="empty-ic">👷</div>Žádní řidiči — přidej prvního.</div></td></tr>` :
          state.ridici.map(r=>{
            const stats = ridicStats(r);
            return `
            <tr>
              <td><b>${r.jmeno}</b> ${r.vedouciDopravy ? '<span class="badge info" title="Vedoucí dopravy — zapisuje i za jiné řidiče, bez financí">🧭 vedoucí</span>' : ''}</td>
              <td><a href="tel:${r.telefon.replace(/\s/g,'')}" style="color:var(--cyan);">${r.telefon}</a></td>
              <td><span class="badge info">${r.skupina}</span></td>
              <td style="text-align:right">${stats.pocetJizd}</td>
              <td style="text-align:right">${stats.kmCelkem.toLocaleString('cs-CZ')}</td>
              <td style="text-align:right">${stats.pocetJizdSFinance>0 ? `<b style="color:${stats.zisk>=0?'var(--green)':'var(--red)'};">${stats.zisk.toLocaleString('cs-CZ')} Kč</b>` : '<span style="color:var(--dim);font-size:12px;">—</span>'}</td>
              <td>${termBadge(r.kartaRidice)||''} ${termBadge(r.profesniPrukaz)||''} ${!termBadge(r.kartaRidice)&&!termBadge(r.profesniPrukaz)?'<span class="badge ok">OK</span>':''}</td>
              <td>${r.posledniStazeniKarty ? formatDate(r.posledniStazeniKarty)+' '+stazeniBadge(r.posledniStazeniKarty,28) : '<span style="color:var(--dim);font-size:12px;">nikdy</span>'}</td>
              <td style="display:flex;gap:6px;">
                <button class="btn btn-ghost btn-sm" onclick="openRidicDetail(${r.id})">📊 Přehled</button>
                <button class="btn btn-ghost btn-sm" onclick="stazenoKartaDnes(${r.id})">📥 Staženo dnes</button>
                <button class="btn btn-ghost btn-sm" onclick="editRidic(${r.id})">Upravit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteRidic(${r.id})">Smazat</button>
              </td>
            </tr>
          `;}).join('')}
        </tbody>
      </table>
    </div>
    ${renderRidicModal()}
    ${renderRidicDetailModal()}
  `;
}

// Spočítá souhrnné statistiky řidiče — jízdy, km, zisk, tankování
function ridicStats(r) {
  const shortName = r.jmeno.split(' ')[0]+' '+r.jmeno.split(' ')[1][0]+'.';
  const jizdy = state.jizdy.filter(j => j.ridic === shortName);
  const kmCelkem = jizdy.reduce((s,j)=>s+(+j.km||0), 0);
  const jizdySFinance = jizdy.filter(j => j.financni);
  const zisk = jizdySFinance.reduce((s,j) => {
    const f = j.financni;
    const naklady = (+f.palivo||0)+(+f.mytne||0)+(+f.clo||0)+(+f.amortizace||0)+(+f.pojisteni||0)+(+f.ridicNaklad||0)+(+f.ostatni||0);
    return s + ((+f.fakturovano||0) - naklady);
  }, 0);
  const tankovani = state.tankovani.filter(t => t.ridic === shortName);
  const litryCelkem = tankovani.reduce((s,t)=>s+(+t.litry||0), 0);
  const nakladyPHM = tankovani.reduce((s,t)=>s+(+t.cenaCelkem||0), 0);
  return { shortName, jizdy, pocetJizd: jizdy.length, kmCelkem, pocetJizdSFinance: jizdySFinance.length, zisk, tankovani, litryCelkem, nakladyPHM };
}

// Statistika malé dopravy pro daného řidiče (podle celého jména) za aktuální kalendářní měsíc
function malaDopravaRidicMesic(jmeno) {
  const monthNames = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const vlastniTrasy = PNS_ROUTES.filter(r => state.pnsRouteConfig[r].stalyRidic === jmeno);

  let dnyOdjeto = 0, kmCelkem = 0, zastupy = 0;
  for (let d=1; d<=daysInMonth; d++) {
    const iso = toISO(new Date(year, month, d));
    if (!isDrivingDay(iso)) continue;
    let jelDnes = false;
    PNS_ROUTES.forEach(route => {
      const eff = efektivniTrasaDen(route, iso);
      if (eff.nejelo || eff.ridic !== jmeno) return;
      jelDnes = true;
      const cfg = state.pnsRouteConfig[route];
      kmCelkem += (+cfg.kmZaDen||0) + eff.objizdkaKm;
      if (cfg.stalyRidic !== jmeno) zastupy++;
    });
    if (jelDnes) dnyOdjeto++;
  }
  return { vlastniTrasy, dnyOdjeto, kmCelkem, zastupy, monthLabel: `${monthNames[month]} ${year}` };
}

// Sekce v detailu řidiče — zobrazí se jen když má trasu jako stálý řidič nebo letos zastupoval
function renderMalaDopravaRidicSekce(jmeno) {
  const s = malaDopravaRidicMesic(jmeno);
  if (s.vlastniTrasy.length === 0 && s.zastupy === 0) return '';
  return `
    <div style="font-size:12px; letter-spacing:1px; color:var(--muted); text-transform:uppercase; margin:20px 0 10px; padding-top:14px; border-top:1px solid var(--border-c);">📰 Malá doprava — ${s.monthLabel}</div>
    ${s.vlastniTrasy.length ? `<p style="font-size:12.5px; color:var(--muted); margin-bottom:10px;">Stálé trasy: ${s.vlastniTrasy.map(r=>`<span class="badge info" style="margin-right:4px;">${r}</span>`).join('')}</p>` : `<p style="font-size:12.5px; color:var(--dim); font-style:italic; margin-bottom:10px;">Nemá žádnou trasu jako stálý řidič.</p>`}
    <div class="metrics" style="margin-bottom:0;">
      <div class="metric"><div class="m-label">Dní odjeto</div><div class="m-value">${s.dnyOdjeto}</div></div>
      <div class="metric"><div class="m-label">Km celkem</div><div class="m-value">${s.kmCelkem.toLocaleString('cs-CZ')}</div></div>
      <div class="metric"><div class="m-label">Zástupy</div><div class="m-value">${s.zastupy}</div></div>
    </div>
  `;
}

function renderRidicDetailModal() {
  return `
    <div class="modal-overlay" id="ridicDetailModal">
      <div class="modal" style="max-width:720px;" id="ridicDetailContent"></div>
    </div>
  `;
}

window.openRidicDetail = function(id) {
  const r = state.ridici.find(r=>r.id===id);
  if (!r) return;
  const s = ridicStats(r);
  const speeda = s.kmCelkem>0 ? (s.litryCelkem/s.kmCelkem*100).toFixed(1) : '—';

  document.getElementById('ridicDetailContent').innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
      <div>
        <h2 style="margin-bottom:2px;">👷 ${r.jmeno}</h2>
        <p class="modal-sub" style="margin-bottom:0;">${r.skupina} · <a href="tel:${r.telefon.replace(/\s/g,'')}" style="color:var(--cyan);">${r.telefon}</a></p>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="closeModal('ridicDetailModal')">✕ Zavřít</button>
    </div>

    <div style="display:flex; gap:16px; margin:16px 0; flex-wrap:wrap;">
      <div style="display:flex; align-items:center; gap:8px; font-size:12.5px;">
        <span>Karta řidiče:</span> <b>${formatDate(r.kartaRidice)}</b> ${termBadge(r.kartaRidice)}
      </div>
      <div style="display:flex; align-items:center; gap:8px; font-size:12.5px;">
        <span>Profesní průkaz:</span> <b>${formatDate(r.profesniPrukaz)}</b> ${termBadge(r.profesniPrukaz)}
      </div>
    </div>

    <div class="metrics" style="margin-bottom:20px;">
      <div class="metric"><div class="m-label">Počet jízd</div><div class="m-value">${s.pocetJizd}</div></div>
      <div class="metric"><div class="m-label">Najeté km</div><div class="m-value">${s.kmCelkem.toLocaleString('cs-CZ')}</div></div>
      <div class="metric"><div class="m-label">Čistý zisk</div><div class="m-value" style="color:${s.zisk>=0?'var(--green)':'var(--red)'};">${s.pocetJizdSFinance>0 ? s.zisk.toLocaleString('cs-CZ')+' Kč' : '—'}</div>${s.pocetJizdSFinance < s.pocetJizd ? `<div class="m-delta neutral">${s.pocetJizdSFinance}/${s.pocetJizd} jízd s financemi</div>` : ''}</div>
      <div class="metric"><div class="m-label">Spotřeba</div><div class="m-value">${speeda}</div><div class="m-delta neutral">l/100 km</div></div>
    </div>

    <div style="font-size:12px; letter-spacing:1px; color:var(--muted); text-transform:uppercase; margin-bottom:10px;">Posledních 5 jízd</div>
    <table class="data-table" style="margin-bottom:20px;">
      <thead><tr><th>Datum</th><th>Trasa</th><th style="text-align:right">km</th><th style="text-align:right">Zisk</th></tr></thead>
      <tbody>
        ${s.jizdy.slice(0,5).map(j => `
          <tr>
            <td>${formatDate(j.datum)}</td>
            <td>${j.trasaOd} → ${j.trasaDo}</td>
            <td style="text-align:right">${j.km}</td>
            <td style="text-align:right">${ziskBadge(j.financni)}</td>
          </tr>
        `).join('') || `<tr><td colspan="4" class="empty-state">Žádné jízdy</td></tr>`}
      </tbody>
    </table>

    <div style="font-size:12px; letter-spacing:1px; color:var(--muted); text-transform:uppercase; margin-bottom:10px;">Posledních 5 tankování</div>
    <table class="data-table">
      <thead><tr><th>Datum</th><th>Vozidlo</th><th>Místo</th><th style="text-align:right">Litry</th><th style="text-align:right">Cena</th></tr></thead>
      <tbody>
        ${s.tankovani.slice(0,5).map(t => `
          <tr>
            <td>${formatDate(t.datum)}</td>
            <td>${t.vozidlo}</td>
            <td>${t.misto}</td>
            <td style="text-align:right">${t.litry} l</td>
            <td style="text-align:right"><b>${(+t.cenaCelkem).toLocaleString('cs-CZ')} Kč</b></td>
          </tr>
        `).join('') || `<tr><td colspan="5" class="empty-state">Žádné tankování</td></tr>`}
      </tbody>
    </table>
    ${renderMalaDopravaRidicSekce(r.jmeno)}
  `;
  openModal('ridicDetailModal');
};

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
            <label>Poslední stažení karty řidiče</label>
            <input type="date" name="posledniStazeniKarty" value="${r.posledniStazeniKarty||''}">
            <span style="font-size:11.5px; color:var(--dim); margin-top:4px; display:block;">Povinné stahovat každých 28 dní.</span>
          </div>
          <div class="form-row" style="flex-direction:row; align-items:center; gap:10px;">
            <input type="checkbox" name="vedouciDopravy" id="ridicVedouciDopravy" ${r.vedouciDopravy?'checked':''} style="width:18px; height:18px;">
            <label for="ridicVedouciDopravy" style="margin:0;">🧭 Vedoucí dopravy</label>
          </div>
          <p style="font-size:11.5px; color:var(--dim); margin:-6px 0 14px;">Navíc k vlastní trase smí zapisovat jízdy, tankování a objížďky i za ostatní řidiče (bez přístupu k financím, cenám a nákladům).</p>
          <div class="form-row">
            <label>PIN pro přihlášení do appky (4 číslice) ${r.id?'':'*'}</label>
            <input type="text" name="pin" inputmode="numeric" maxlength="4" ${r.id?'':'required'} value="" autocomplete="off" placeholder="${r.id?'nech prázdné = PIN se nemění':'např. 1234'}" style="letter-spacing:4px; font-weight:700;">
            <span style="font-size:11.5px; color:var(--dim); margin-top:4px; display:block;">PIN se ukládá jen na serveru a nelze ho zpětně zobrazit — když ho řidič zapomene, nastav mu nový.</span>
            <span id="ridicPinError" style="display:none; color:var(--red); font-size:12px;"></span>
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
// Okno pro nastavení PINu: target = 'owner' nebo id řidiče
window.openPinDialog = function(target, komu) {
  const stare = document.getElementById('pinDialog'); if (stare) stare.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="pinDialog"><div class="modal" style="max-width:380px;">
      <h2>🔑 Nový PIN</h2><p class="modal-sub">Čtyřmístný PIN pro ${komu}.</p>
      <div class="form-row"><input type="text" id="pinDialogInput" inputmode="numeric" maxlength="4" class="pin-input" autocomplete="off" placeholder="• • • •"></div>
      <p id="pinDialogErr" style="display:none; color:var(--red); font-size:12.5px;"></p>
      <div class="modal-actions"><button class="btn btn-ghost" id="pinDialogCancel">Zrušit</button><button class="btn btn-primary" id="pinDialogOk">Uložit PIN</button></div>
    </div></div>`);
  const input = document.getElementById('pinDialogInput'), err = document.getElementById('pinDialogErr');
  input.focus();
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); });
  document.getElementById('pinDialogCancel').addEventListener('click', () => document.getElementById('pinDialog').remove());
  document.getElementById('pinDialogOk').addEventListener('click', async () => {
    if (!/^\d{4}$/.test(input.value)) { err.textContent = 'PIN musí mít přesně 4 číslice.'; err.style.display = 'block'; return; }
    try {
      const odp = await api('/api/pin', { method: 'POST', body: { target: String(target), pin: input.value } });
      if (odp.token) { const rel = nactiRelaci(); ulozRelaci({ ...rel, token: odp.token }); if (sync.me) sync.me.mustChangePin = false; }
      document.getElementById('pinDialog').remove();
      alert('PIN je nastavený.');
      const aktivni = document.querySelector('.nav-item.active'); renderSection(aktivni ? aktivni.dataset.section : 'dashboard');
    } catch (e) {
      err.textContent = e.status === 409 ? 'Tento PIN už používá někdo jiný — zvol jiný.' : (e.message || 'PIN se nepodařilo uložit.');
      err.style.display = 'block';
    }
  });
};

// Zkrácené jméno ("Jan Novák" -> "Jan N."), pod kterým se řidič ukládá do jízd a tankování
function kratkeJmenoRidice(jmeno) {
  const casti = (jmeno || '').trim().split(' ');
  return casti[0] + ' ' + (casti[1] ? casti[1][0] : '') + '.';
}

// Když majitel řidiči změní jméno, přenese se do všeho, co se na řidiče odkazuje jménem:
// stálé trasy PNS, výjimky v malé dopravě, zapsané jízdy a tankování.
function prenesPrejmenovaniRidice(stare, nove) {
  if (!stare || !nove || stare === nove) return;
  Object.values(state.pnsRouteConfig).forEach(cfg => { if (cfg.stalyRidic === stare) cfg.stalyRidic = nove; });
  Object.values(state.malaDoprava).forEach(den => {
    if (den.ridic === stare) den.ridic = nove;
    [den.vyjimky, den.trasy].forEach(mapa => {
      if (mapa) Object.values(mapa).forEach(v => { if (v && v.ridic === stare) v.ridic = nove; });
    });
  });
  // Jízdy a tankování nesou jen zkrácené jméno — přepíšeme je, jen když ho nesdílí jiný řidič
  const staryKratky = kratkeJmenoRidice(stare), novyKratky = kratkeJmenoRidice(nove);
  const sdileno = state.ridici.some(r => r.jmeno !== stare && kratkeJmenoRidice(r.jmeno) === staryKratky);
  if (!sdileno) {
    state.jizdy.forEach(j => { if (j.ridic === staryKratky) j.ridic = novyKratky; });
    state.tankovani.forEach(t => { if (t.ridic === staryKratky) t.ridic = novyKratky; });
  }
  if (state.role === 'driver' && state.driverName === stare) state.driverName = nove;
}

function bindRidici() {
  document.getElementById('btnAddRidic').addEventListener('click', () => openModal('ridicModal'));
  const pinField = document.querySelector('#ridicForm [name="pin"]');
  if (pinField) pinField.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g,'').slice(0,4); });

  document.getElementById('ridicForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    const editId = fd.get('editId');
    const pin = (fd.get('pin') || '').trim();
    const chyba = document.getElementById('ridicPinError');
    chyba.style.display = 'none';
    if (pin && !/^\d{4}$/.test(pin)) { chyba.textContent = 'PIN musí mít přesně 4 číslice.'; chyba.style.display = 'block'; return; }
    const id = editId ? +editId : Date.now();
    if (pin) {
      // PIN se nastavuje přímo na serveru (ten hlídá, aby ho nemělo víc lidí); záznam řidiče PIN neobsahuje
      try { await api('/api/pin', { method: 'POST', body: { target: String(id), pin } }); }
      catch (err) {
        chyba.textContent = err.status === 409 ? 'Tento PIN už používá někdo jiný — zvol jiný.' : (err.message || 'PIN se nepodařilo uložit.');
        chyba.style.display = 'block'; return;
      }
    }
    const data = { jmeno: fd.get('jmeno'), telefon: fd.get('telefon'), skupina: fd.get('skupina'), kartaRidice: fd.get('kartaRidice'), profesniPrukaz: fd.get('profesniPrukaz'), posledniStazeniKarty: fd.get('posledniStazeniKarty') || null, vedouciDopravy: fd.get('vedouciDopravy') === 'on' };
    if (editId) {
      const idx = state.ridici.findIndex(r=>r.id===+editId);
      if (idx>=0) {
        const stareJmeno = state.ridici[idx].jmeno;
        state.ridici[idx] = { ...state.ridici[idx], ...data };
        prenesPrejmenovaniRidice(stareJmeno, data.jmeno);
      }
    } else {
      state.ridici.push({ id, ...data });
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
window.stazenoKartaDnes = function(id) {
  const r = state.ridici.find(r=>r.id===id);
  if (!r) return;
  r.posledniStazeniKarty = toISO(new Date());
  saveState(); renderSection('ridici');
};

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
// MALÁ DOPRAVA — PNS rozvoz tisku
// ==========================================================
let malaDopravaMonthOffset = 0;

// Souhrn vícenákladů z objížděk za měsíc, po trasách — jen km NAVÍC (ne základní km trasy), pro fakturaci
// platci. Dny "nejelo" se nepočítají (stejně jako jinde v appce). Paušálové trasy nemají Kč/km, takže se
// u nich vícenáklad nedá takhle vyčíslit — km se pro přehled sečtou, ale částka zůstane 0/„paušál".
function vicenakladyObjizdekMesic(year, month, daysInMonth) {
  const radky = PNS_ROUTES.map(route => {
    const cfg = state.pnsRouteConfig[route];
    let dny = 0, km = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = toISO(new Date(year, month, d));
      if (!isDrivingDay(iso)) continue;
      const eff = efektivniTrasaDen(route, iso);
      if (eff.nejelo || eff.objizdkaKm <= 0) continue;
      dny++; km += eff.objizdkaKm;
    }
    const jePausal = cfg.cenovyModel === 'pausal';
    const cenaZaKm = +cfg.cenaZaKm || 0;
    return { route, dny, km, cenaZaKm, jePausal, vicenaklad: jePausal ? 0 : km * cenaZaKm };
  });
  return { radky, sumKm: radky.reduce((s, r) => s + r.km, 0), sumVicenaklad: radky.reduce((s, r) => s + r.vicenaklad, 0) };
}

function renderMalaDoprava() {
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + malaDopravaMonthOffset, 1);
  const year = viewDate.getFullYear(), month = viewDate.getMonth();
  const monthNames = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];

  // Statistika aktuálního zobrazeného měsíce — počítá se automaticky pro KAŽDÝ jízdní den,
  // i když ho Jarda nikdy neotevřel (výchozí nastavení tras stačí)
  const daysInMonth = new Date(year, month+1, 0).getDate();
  let drivingDays = 0, exceptionDays = 0;
  let sumPrijem = 0, sumNaklady = 0;
  const todayIso = toISO(now);
  for (let d=1; d<=daysInMonth; d++) {
    const iso = toISO(new Date(year, month, d));
    if (!isDrivingDay(iso)) continue;
    drivingDays++;
    sumPrijem += vypocetPrijemDne(iso);
    sumNaklady += vypocetOdhadNakladuDne(iso);
    const rec = state.malaDoprava[iso];
    if (rec) {
      sumNaklady += (+rec.nakladyRidic||0) + (+rec.nakladyAuto||0) + (+rec.nakladyOstatni||0);
      if (Object.keys(denniVyjimky(iso)).length > 0) exceptionDays++;
    }
  }
  const sumZisk = sumPrijem - sumNaklady;
  const marze = sumPrijem > 0 ? (sumZisk/sumPrijem*100).toFixed(1) : '0.0';
  const vic = vicenakladyObjizdekMesic(year, month, daysInMonth);

  return `
    <div class="page-head">
      <div><h1>📰 Malá doprava — PNS</h1><p>Rozvoz tisku, ${PNS_ROUTES.length} tras. Jede se každý den kromě neděle a státních svátků.</p></div>
      <div class="page-actions"><button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️ Tisk / PDF</button></div>
    </div>

    <div class="card-panel" style="margin-bottom:20px;">
      <h3>Trasy</h3>
      <p class="csub">Klikni na trasu — nastavíš cenu jednou a appka ji pak automaticky použije každý den. Uvidíš tam i měsíční přehled té trasy.</p>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${PNS_ROUTES.map(r => {
          const cfg = state.pnsRouteConfig[r];
          const cenaNastavena = cfg.cenovyModel === 'pausal' ? cfg.pausalZaDen > 0 : (cfg.cenaZaKm > 0 && cfg.kmZaDen > 0);
          const nastaveno = cenaNastavena && !!cfg.stalyRidic;
          return `<button class="badge info" style="font-size:12px; padding:6px 14px; border:none; cursor:pointer; ${!nastaveno?'opacity:0.55;':''}" onclick="openTrasaDetail('${r}')" title="${nastaveno?'Nastaveno':'Zatím bez nastavené ceny — klikni pro nastavení'}">${r}${!nastaveno?' ⚠':''}</button>`;
        }).join('')}
      </div>
    </div>

    <div class="card-panel" style="margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h3 style="margin-bottom:4px;">🛣️ Objížďka na více dní</h3>
          <p class="csub" style="margin-bottom:0;">Trvá objížďka déle? Zadej rozmezí dat a km jednou — appka to sama zapíše na každý jízdní den v tom období.</p>
        </div>
        <button class="btn btn-primary btn-sm" id="btnHromadnaObjizdka">+ Hromadná objížďka</button>
      </div>
    </div>

    <div class="card-panel" style="margin-bottom:20px;">
      <h3>💰 Ziskovost — ${monthNames[month]} ${year}</h3>
      <p class="csub">Počítá se automaticky ze všech ${drivingDays} jízdních dnů podle nastavení tras. ${exceptionDays>0?`${exceptionDays} dnů má zapsanou výjimku (objížďka, zástup, nejelo).`:'Zatím žádné výjimky.'}</p>
      <div class="metrics" style="margin-bottom:0;">
        <div class="metric"><div class="m-label">Příjmy</div><div class="m-value">${sumPrijem.toLocaleString('cs-CZ')} Kč</div></div>
        <div class="metric"><div class="m-label">Náklady (odhad)</div><div class="m-value">${sumNaklady.toLocaleString('cs-CZ')} Kč</div></div>
        <div class="metric"><div class="m-label">Čistý zisk</div><div class="m-value" style="color:${sumZisk>=0?'var(--green)':'var(--red)'};">${sumZisk.toLocaleString('cs-CZ')} Kč</div><div class="m-delta neutral">marže ${marze} %</div></div>
      </div>
    </div>

    <div class="card-panel" style="margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:4px;">
        <div>
          <h3 style="margin-bottom:4px;">💶 Vícenáklady z objížděk — ${monthNames[month]} ${year}</h3>
          <p class="csub" style="margin-bottom:0;">Jen km navíc (ne základní km trasy) × cena za km, po trasách — podklad k fakturaci platci za objížďky tohoto měsíce.</p>
        </div>
        <button class="btn btn-ghost btn-sm" id="btnExportVicenaklady">📥 Export k fakturaci (CSV)</button>
      </div>
      <table class="data-table" style="margin-top:14px;">
        <thead><tr><th>Trasa</th><th style="text-align:right">Dní s objížďkou</th><th style="text-align:right">Km navíc</th><th style="text-align:right">Cena/km</th><th style="text-align:right">Vícenáklad</th></tr></thead>
        <tbody>
          ${vic.radky.map(r => `
            <tr>
              <td>${r.route}</td>
              <td style="text-align:right">${r.dny || '—'}</td>
              <td style="text-align:right">${r.km>0 ? r.km.toLocaleString('cs-CZ')+' km' : '—'}</td>
              <td style="text-align:right">${r.jePausal ? 'paušál' : (r.cenaZaKm ? r.cenaZaKm.toLocaleString('cs-CZ')+' Kč' : '—')}</td>
              <td style="text-align:right">${r.jePausal ? '<span style="color:var(--dim);">— paušál</span>' : (r.vicenaklad>0 ? '<b>'+r.vicenaklad.toLocaleString('cs-CZ')+' Kč</b>' : '—')}</td>
            </tr>
          `).join('')}
          <tr style="font-weight:700;">
            <td>CELKEM</td><td></td>
            <td style="text-align:right">${vic.sumKm.toLocaleString('cs-CZ')} km</td><td></td>
            <td style="text-align:right; color:var(--amber);">${vic.sumVicenaklad.toLocaleString('cs-CZ')} Kč</td>
          </tr>
        </tbody>
      </table>
      ${vic.sumVicenaklad === 0 ? `<p style="font-size:12.5px; color:var(--dim); font-style:italic; margin-top:10px;">Tento měsíc zatím žádné vyčíslitelné vícenáklady z objížděk.</p>` : ''}
    </div>

    <div class="card-panel">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <button class="btn btn-ghost btn-sm" id="btnMesicPred">← Předchozí</button>
        <h3 style="margin:0;">${monthNames[month]} ${year}</h3>
        <button class="btn btn-ghost btn-sm" id="btnMesicDal">Další →</button>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" id="btnExportMalaMesic">📥 Export měsíce (CSV)</button>
        <button class="btn btn-ghost btn-sm" id="btnExportMalaVyjimky">📥 Export výjimek (CSV)</button>
      </div>
      <p class="csub" style="margin-bottom:14px;">Trasy jedou automaticky se stálým řidičem. Klikni na den jen když nastala výjimka — objížďka, zástup, nebo že trasa nejela.</p>
      ${renderMalaDopravaCalendar(year, month)}
      <div style="display:flex; gap:18px; flex-wrap:wrap; margin-top:16px; padding-top:14px; border-top:1px solid var(--border-c); font-size:11.5px; color:var(--muted);">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--panel);border:1px solid var(--border-c);margin-right:5px;"></span>Normální den (automaticky)</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--amber);margin-right:5px;"></span>Má výjimku</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--card);border:1px solid var(--border-c);opacity:0.4;margin-right:5px;"></span>Nejede se</span>
      </div>
    </div>

    ${renderMalaDopravaModal()}
    ${renderTrasaDetailModal()}
    ${renderHromadnaObjizdkaModal()}
  `;
}

function renderMalaDopravaCalendar(year, month) {
  const dow = ['Po','Út','St','Čt','Pá','So','Ne'];
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // pondělí = 0
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const todayIso = toISO(new Date());

  let cells = '';
  for (let i=0; i<startOffset; i++) cells += `<div class="cal-cell muted"></div>`;

  for (let d=1; d<=daysInMonth; d++) {
    const iso = toISO(new Date(year, month, d));
    const holiday = holidayName(iso);
    const driving = isDrivingDay(iso);
    const isToday = iso === todayIso;

    if (!driving) {
      cells += `<div class="cal-cell muted" style="min-height:56px;" title="${holiday||'Neděle'}">
        <span class="cal-daynum" style="color:var(--dim);">${d}</span>
        <span class="cal-tag" style="color:var(--dim);">${holiday||'Ne'}</span>
      </div>`;
      continue;
    }

    const pocetVyjimek = Object.keys(denniVyjimky(iso)).length;
    const prijem = vypocetPrijemDne(iso);
    const naklady = vypocetOdhadNakladuDne(iso) + (state.malaDoprava[iso] ? (+state.malaDoprava[iso].nakladyRidic||0)+(+state.malaDoprava[iso].nakladyAuto||0)+(+state.malaDoprava[iso].nakladyOstatni||0) : 0);
    const zisk = prijem - naklady;

    let barva = 'var(--border-c)', bg = 'var(--panel)';
    if (pocetVyjimek > 0) { barva = 'var(--amber)'; bg = 'rgba(245,158,11,0.08)'; }

    cells += `<div class="cal-cell" style="min-height:56px; cursor:pointer; border-color:${barva}; background:${bg}; ${isToday?'box-shadow:0 0 0 2px var(--purple);':''}" onclick="openMalaDopravaDen('${iso}')" title="${pocetVyjimek>0?pocetVyjimek+' výjimek · ':''}zisk ${zisk.toLocaleString('cs-CZ')} Kč">
      <span class="cal-daynum">${d}</span>
      <span class="cal-tag" style="color:${pocetVyjimek>0?barva:'var(--muted)'};">${pocetVyjimek>0 ? pocetVyjimek+' výj.' : zisk.toLocaleString('cs-CZ')+' Kč'}</span>
    </div>`;
  }

  const totalCells = startOffset + daysInMonth;
  const trailing = (7 - (totalCells % 7)) % 7;
  for (let i=0; i<trailing; i++) cells += `<div class="cal-cell muted"></div>`;

  return `
    <div class="cal-grid">
      ${dow.map(d=>`<div class="cal-dow">${d}</div>`).join('')}
      ${cells}
    </div>
  `;
}

function renderMalaDopravaModal() {
  return `<div class="modal-overlay" id="malaDopravaModal"><div class="modal" style="max-width:560px;" id="malaDopravaContent"></div></div>`;
}

// ==========================================================
// HROMADNÁ OBJÍŽĎKA — zadání km navíc pro rozmezí dat najednou
// ==========================================================
function renderHromadnaObjizdkaModal() {
  const dnes = new Date().toISOString().slice(0,10);
  return `
    <div class="modal-overlay" id="hromadnaObjizdkaModal">
      <div class="modal" style="max-width:520px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <h2 style="margin-bottom:2px;">🛣️ Hromadná objížďka</h2>
          <button class="btn btn-ghost btn-sm" onclick="closeModal('hromadnaObjizdkaModal')">✕</button>
        </div>
        <p class="modal-sub">Zadej km navíc jednou pro celé období — appka je zapíše na každý jízdní den (přeskočí neděle a svátky).</p>

        <div class="form-row">
          <label>Trasa *</label>
          <select id="hoTrasa">
            ${PNS_ROUTES.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
        </div>
        <div class="form-cols-2">
          <div class="form-row"><label>Od data *</label><input type="date" id="hoOd" value="${dnes}"></div>
          <div class="form-row"><label>Do data *</label><input type="date" id="hoDo" value="${dnes}"></div>
        </div>
        <div class="form-cols-2">
          <div class="form-row"><label>Km navíc (na každý den) *</label><input type="number" id="hoKm" min="1" step="1" placeholder="např. 15"></div>
          <div class="form-row">
            <label>Řidič po dobu objížďky</label>
            <select id="hoRidic">
              <option value="">— ponechat stávající —</option>
              ${state.ridici.map(r => `<option value="${r.jmeno}">${r.jmeno}</option>`).join('')}
            </select>
          </div>
        </div>

        <div id="hoPreview" style="margin:14px 0 4px; padding:14px 16px; background:var(--card); border-radius:var(--radius-sm); border:1px solid var(--border-c); font-size:12.5px; color:var(--muted);">
          Vyplň trasu, data a km — appka spočítá, kolik to přidá do rozpočtu.
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="closeModal('hromadnaObjizdkaModal')">Zrušit</button>
          <button type="button" class="btn btn-primary" id="btnHoUlozit">Zapsat objížďku</button>
        </div>
      </div>
    </div>
  `;
}

function bindHromadnaObjizdka() {
  const btn = document.getElementById('btnHromadnaObjizdka');
  if (!btn) return;
  btn.addEventListener('click', () => openModal('hromadnaObjizdkaModal'));

  function jizdniDnyVRozmezi(odIso, doIso) {
    const dny = [];
    let cur = new Date(odIso);
    const end = new Date(doIso);
    while (cur <= end) {
      const iso = toISO(cur);
      if (isDrivingDay(iso)) dny.push(iso);
      cur.setDate(cur.getDate() + 1);
    }
    return dny;
  }

  function updateHoPreview() {
    const route = document.getElementById('hoTrasa').value;
    const od = document.getElementById('hoOd').value;
    const doD = document.getElementById('hoDo').value;
    const km = +document.getElementById('hoKm').value || 0;
    const preview = document.getElementById('hoPreview');
    if (!od || !doD || !km || od > doD) {
      preview.innerHTML = 'Vyplň trasu, platné rozmezí dat a km — appka spočítá, kolik to přidá do rozpočtu.';
      return;
    }
    const dny = jizdniDnyVRozmezi(od, doD);
    const cfg = state.pnsRouteConfig[route];
    let kcCelkem = 0, kcInfo = '';
    if (cfg.cenovyModel === 'pausal') {
      kcInfo = 'Trasa má paušál — objížďka neovlivní příjem, ale zapíše se pro přehled km.';
    } else {
      kcCelkem = dny.length * km * (+cfg.cenaZaKm || 0);
      kcInfo = `${dny.length} jízdních dnů × ${km} km × ${cfg.cenaZaKm||0} Kč/km = <b style="color:var(--amber); font-size:15px;">${kcCelkem.toLocaleString('cs-CZ')} Kč navíc</b>`;
    }
    preview.innerHTML = `
      <div style="margin-bottom:6px;">📅 Zapíše se na <b>${dny.length} jízdních dnů</b> (${formatDate(od)} – ${formatDate(doD)})</div>
      <div>${kcInfo}</div>
    `;
  }
  ['hoTrasa','hoOd','hoDo','hoKm'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateHoPreview);
    document.getElementById(id).addEventListener('change', updateHoPreview);
  });

  document.getElementById('btnHoUlozit').addEventListener('click', () => {
    const route = document.getElementById('hoTrasa').value;
    const od = document.getElementById('hoOd').value;
    const doD = document.getElementById('hoDo').value;
    const km = +document.getElementById('hoKm').value || 0;
    const ridicOverride = document.getElementById('hoRidic').value;

    if (!od || !doD || od > doD) { alert('Zadej platné rozmezí dat.'); return; }
    if (!km || km <= 0) { alert('Zadej počet km navíc.'); return; }

    const dny = jizdniDnyVRozmezi(od, doD);
    if (dny.length === 0) { alert('V tomto rozmezí není žádný jízdní den (samé neděle/svátky).'); return; }

    dny.forEach(iso => {
      if (!state.malaDoprava[iso]) state.malaDoprava[iso] = { vyjimky: {}, nakladyRidic:0, nakladyAuto:0, nakladyOstatni:0 };
      if (!state.malaDoprava[iso].vyjimky) state.malaDoprava[iso].vyjimky = {};
      const existing = state.malaDoprava[iso].vyjimky[route] || {};
      state.malaDoprava[iso].vyjimky[route] = {
        ridic: ridicOverride || existing.ridic || '',
        objizdkaKm: km,
        nejelo: existing.nejelo || false
      };
    });
    saveState();
    closeModal('hromadnaObjizdkaModal');
    renderSection('mala-doprava');
    alert(`Hotovo — objížďka ${km} km zapsána na ${dny.length} jízdních dnů u trasy ${route}.`);
  });
}

window.openMalaDopravaDen = function(iso) {
  const dateObj = new Date(iso);
  const dowNames = ['Neděle','Pondělí','Úterý','Středa','Čtvrtek','Pátek','Sobota'];
  const vyjimky = denniVyjimky(iso);

  document.getElementById('malaDopravaContent').innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
      <div>
        <h2 style="margin-bottom:2px;">📰 ${dowNames[dateObj.getDay()]} ${formatDate(iso)}</h2>
        <p class="modal-sub" style="margin-bottom:0;">Trasy jedou automaticky se stálým řidičem. Uprav jen tam, kde nastala výjimka.</p>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="closeModal('malaDopravaModal')">✕</button>
    </div>

    <label style="display:flex; align-items:center; gap:8px; padding:10px 12px; background:var(--card); border-radius:8px; margin-bottom:14px; cursor:pointer; border:1px solid var(--border-c);">
      <input type="checkbox" id="malaCelyDenNejelo" ${PNS_ROUTES.every(r => vyjimky[r] && vyjimky[r].nejelo) ? 'checked' : ''}>
      <span style="font-size:13px; font-weight:600;">Celý den nejelo (sníh, kalamita, PNS nevydala)</span>
    </label>

    <div id="malaRoutesList" style="display:flex; flex-direction:column; gap:6px; margin-bottom:16px; ${PNS_ROUTES.every(r => vyjimky[r] && vyjimky[r].nejelo) ? 'opacity:0.4;' : ''}">
      ${PNS_ROUTES.map(route => {
        const cfg = state.pnsRouteConfig[route];
        const maVyjimku = !!vyjimky[route];
        const eff = efektivniTrasaDen(route, iso);
        const cenaInfo = cfg.cenovyModel === 'pausal'
          ? `paušál ${cfg.pausalZaDen||0} Kč/den`
          : `${cfg.cenaZaKm||0} Kč/km × ${cfg.kmZaDen||0} km`;
        return `
        <div class="mala-route-row" data-route="${route}" style="background:var(--card); border-radius:8px; border:1px solid ${maVyjimku?'var(--amber)':'var(--border-c)'};">
          <div style="display:flex; align-items:center; gap:10px; padding:9px 12px;">
            <div style="flex:0 0 auto; min-width:56px;">
              <span style="font-weight:700; font-size:13px;">${route}</span>
              <div style="font-size:10.5px; color:var(--dim);">${cenaInfo}</div>
            </div>
            <div style="flex:1; font-size:12.5px; color:var(--ice);">
              👷 ${eff.ridic || '— bez stálého řidiče —'}
              ${eff.objizdkaKm>0 ? `<span style="color:var(--amber);"> · +${eff.objizdkaKm} km objížďka${cfg.cenovyModel!=='pausal' ? ' (+'+(eff.objizdkaKm*(+cfg.cenaZaKm||0)).toLocaleString('cs-CZ')+' Kč)' : ''}</span>` : ''}
              ${eff.nejelo ? `<span style="color:var(--red);"> · nejelo</span>` : ''}
            </div>
            <button type="button" class="btn btn-ghost btn-sm mala-toggle-edit" data-route="${route}">${maVyjimku?'Upravit':'+ Výjimka'}</button>
          </div>
          <div class="mala-edit-panel" data-route="${route}" style="display:none; padding:0 12px 12px; border-top:1px solid var(--border-c); margin-top:2px; padding-top:10px;">
            <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap;">
              <div class="form-row" style="margin-bottom:0; flex:1; min-width:140px;">
                <label style="font-size:11px;">Řidič (zástup)</label>
                <select class="mala-edit-ridic" data-route="${route}">
                  <option value="">— stálý (${cfg.stalyRidic||'nenastaven'}) —</option>
                  ${state.ridici.map(r => `<option value="${r.jmeno}" ${vyjimky[route]&&vyjimky[route].ridic===r.jmeno?'selected':''}>${r.jmeno}</option>`).join('')}
                </select>
              </div>
              <div class="form-row" style="margin-bottom:0; width:90px;">
                <label style="font-size:11px;">Km navíc</label>
                <input type="number" class="mala-edit-objizdka" data-route="${route}" data-cena-km="${cfg.cenaZaKm||0}" data-model="${cfg.cenovyModel}" min="0" step="1" value="${vyjimky[route]&&vyjimky[route].objizdkaKm||''}" placeholder="0">
              </div>
              <div style="min-width:90px; padding-bottom:9px;">
                <span style="font-size:10.5px; color:var(--dim); display:block;">Vícenáklad</span>
                <span class="mala-objizdka-kc" data-route="${route}" style="font-size:13px; font-weight:700; color:var(--amber);">
                  ${cfg.cenovyModel==='pausal' ? '— paušál' : (((vyjimky[route]&&vyjimky[route].objizdkaKm)||0) * (+cfg.cenaZaKm||0)).toLocaleString('cs-CZ') + ' Kč'}
                </span>
              </div>
              <label style="display:flex; align-items:center; gap:5px; font-size:11.5px; cursor:pointer; padding-bottom:8px;">
                <input type="checkbox" class="mala-edit-nejelo" data-route="${route}" ${vyjimky[route]&&vyjimky[route].nejelo?'checked':''}> Trasa nejela
              </label>
              <button type="button" class="btn btn-danger btn-sm mala-clear-exception" data-route="${route}" style="margin-bottom:2px;">Zrušit výjimku</button>
            </div>
          </div>
        </div>
      `;}).join('')}
    </div>

    <div style="font-size:11px; letter-spacing:1px; color:var(--muted); text-transform:uppercase; margin-bottom:10px; padding-top:14px; border-top:1px solid var(--border-c);">Náklady dne navíc (nepovinné)</div>

    <div class="form-cols-2">
      <div class="form-row"><label>Mimořádné náklady na řidiče (Kč)</label><input type="number" id="malaNakladyRidic" step="1" min="0" value="${(state.malaDoprava[iso]&&state.malaDoprava[iso].nakladyRidic)||''}"></div>
      <div class="form-row"><label>Mimořádné náklady na auto (Kč)</label><input type="number" id="malaNakladyAuto" step="1" min="0" value="${(state.malaDoprava[iso]&&state.malaDoprava[iso].nakladyAuto)||''}"></div>
    </div>
    <div class="form-row"><label>Ostatní mimořádné náklady (Kč)</label><input type="number" id="malaNakladyOstatni" step="1" min="0" value="${(state.malaDoprava[iso]&&state.malaDoprava[iso].nakladyOstatni)||''}"></div>

    <div id="malaZiskPreview" style="margin:14px 0 4px; padding:14px 16px; background:var(--card); border-radius:var(--radius-sm); border:1px solid var(--border-c);"></div>

    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" onclick="closeModal('malaDopravaModal')">Zavřít</button>
      <button type="button" class="btn btn-primary" id="btnMalaUlozit">Uložit</button>
    </div>
  `;

  // Rozbalení/sbalení editace výjimky u trasy
  document.querySelectorAll('.mala-toggle-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.route;
      const panel = document.querySelector(`.mala-edit-panel[data-route="${route}"]`);
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  });

  document.querySelectorAll('.mala-clear-exception').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.route;
      document.querySelector(`.mala-edit-ridic[data-route="${route}"]`).value = '';
      document.querySelector(`.mala-edit-objizdka[data-route="${route}"]`).value = '';
      document.querySelector(`.mala-edit-nejelo[data-route="${route}"]`).checked = false;
      const cfg = state.pnsRouteConfig[route];
      const kcSpan = document.querySelector(`.mala-objizdka-kc[data-route="${route}"]`);
      kcSpan.textContent = cfg.cenovyModel==='pausal' ? '— paušál' : '0 Kč';
      updateZiskPreview();
    });
  });

  function currentVyjimkyObj() {
    const v = {};
    PNS_ROUTES.forEach(route => {
      const ridic = document.querySelector(`.mala-edit-ridic[data-route="${route}"]`).value;
      const objKm = +document.querySelector(`.mala-edit-objizdka[data-route="${route}"]`).value || 0;
      const nejelo = document.querySelector(`.mala-edit-nejelo[data-route="${route}"]`).checked;
      if (ridic || objKm > 0 || nejelo) {
        v[route] = { ridic, objizdkaKm: objKm, nejelo };
      }
    });
    return v;
  }

  function ziskZeVyjimek(vyjimkyObj) {
    let prijem = 0;
    PNS_ROUTES.forEach(route => {
      const cfg = state.pnsRouteConfig[route];
      const v = vyjimkyObj[route];
      if (v && v.nejelo) return;
      const extra = (v && v.objizdkaKm) || 0;
      if (cfg.cenovyModel === 'pausal') prijem += (+cfg.pausalZaDen||0);
      else prijem += ((+cfg.kmZaDen||0)+extra) * (+cfg.cenaZaKm||0);
    });
    return prijem;
  }

  function updateZiskPreview() {
    const vyjimkyObj = currentVyjimkyObj();
    const prijem = ziskZeVyjimek(vyjimkyObj);
    const nakladyTras = PNS_ROUTES.reduce((s,route) => {
      if (vyjimkyObj[route] && vyjimkyObj[route].nejelo) return s;
      return s + (+state.pnsRouteConfig[route].odhadNakladuZaDen || 0);
    }, 0);
    const nakladyDenNavic = ['malaNakladyRidic','malaNakladyAuto','malaNakladyOstatni'].reduce((s,id) => s + (+document.getElementById(id).value||0), 0);
    const naklady = nakladyTras + nakladyDenNavic;
    const zisk = prijem - naklady;
    const marze = prijem > 0 ? (zisk/prijem*100).toFixed(1) : '0.0';
    const barva = zisk >= 0 ? 'var(--green)' : 'var(--red)';
    const pocetVyjimek = Object.keys(vyjimkyObj).length;
    document.getElementById('malaZiskPreview').innerHTML = `
      <div style="display:flex; justify-content:space-between; font-size:12.5px; color:var(--muted); margin-bottom:5px;">
        <span>Výjimek zapsáno</span><span>${pocetVyjimek}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:12.5px; color:var(--muted); margin-bottom:5px;">
        <span>Příjem dne</span><span>${prijem.toLocaleString('cs-CZ')} Kč</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:12.5px; color:var(--muted); margin-bottom:5px;">
        <span>Náklady dne (odhad + mimořádné)</span><span>${naklady.toLocaleString('cs-CZ')} Kč</span>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:13.5px; font-weight:600; color:var(--white);">Čistý zisk</span>
        <span style="font-size:20px; font-weight:800; color:${barva};">${zisk.toLocaleString('cs-CZ')} Kč</span>
      </div>
      <div style="text-align:right; font-size:11px; color:var(--dim); margin-top:2px;">marže ${marze} %</div>
    `;
  }

  document.querySelectorAll('.mala-edit-objizdka').forEach(inp => {
    inp.addEventListener('input', () => {
      const route = inp.dataset.route;
      const kcSpan = document.querySelector(`.mala-objizdka-kc[data-route="${route}"]`);
      if (inp.dataset.model === 'pausal') {
        kcSpan.textContent = '— paušál';
      } else {
        const kc = (+inp.value || 0) * (+inp.dataset.cenaKm || 0);
        kcSpan.textContent = kc.toLocaleString('cs-CZ') + ' Kč';
      }
    });
  });
  document.querySelectorAll('.mala-edit-ridic, .mala-edit-objizdka').forEach(el => el.addEventListener('input', updateZiskPreview));
  document.querySelectorAll('.mala-edit-nejelo').forEach(el => el.addEventListener('change', updateZiskPreview));
  ['malaNakladyRidic','malaNakladyAuto','malaNakladyOstatni'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateZiskPreview);
  });

  document.getElementById('malaCelyDenNejelo').addEventListener('change', (e) => {
    const checked = e.target.checked;
    PNS_ROUTES.forEach(route => {
      document.querySelector(`.mala-edit-nejelo[data-route="${route}"]`).checked = checked;
    });
    document.getElementById('malaRoutesList').style.opacity = checked ? '0.4' : '1';
    updateZiskPreview();
  });

  updateZiskPreview();

  document.getElementById('btnMalaUlozit').addEventListener('click', () => {
    const vyjimkyNove = currentVyjimkyObj();
    const nakladyRidic = +document.getElementById('malaNakladyRidic').value || 0;
    const nakladyAuto = +document.getElementById('malaNakladyAuto').value || 0;
    const nakladyOstatni = +document.getElementById('malaNakladyOstatni').value || 0;
    const hasFinance = nakladyRidic || nakladyAuto || nakladyOstatni;
    if (Object.keys(vyjimkyNove).length === 0 && !hasFinance) {
      delete state.malaDoprava[iso];
    } else {
      state.malaDoprava[iso] = { vyjimky: vyjimkyNove, nakladyRidic, nakladyAuto, nakladyOstatni };
    }
    saveState(); closeModal('malaDopravaModal'); renderSection('mala-doprava');
  });

  openModal('malaDopravaModal');
};


function renderTrasaDetailModal() {
  return `<div class="modal-overlay" id="trasaDetailModal"><div class="modal" style="max-width:560px;" id="trasaDetailContent"></div></div>`;
}

window.openTrasaDetail = function(route) {
  const cfg = state.pnsRouteConfig[route];

  // Statistika trasy za aktuálně zobrazený měsíc v kalendáři
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + malaDopravaMonthOffset, 1);
  const year = viewDate.getFullYear(), month = viewDate.getMonth();
  const monthNames = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];
  const daysInMonth = new Date(year, month+1, 0).getDate();

  let dnyJizdnich = 0, kmZakladCelkem = 0, kmObjizdkaCelkem = 0, prijemCelkem = 0, dnyNejelo = 0;
  const vyjimkyList = [];
  const ridicPocty = {};
  for (let d=1; d<=daysInMonth; d++) {
    const iso = toISO(new Date(year, month, d));
    if (!isDrivingDay(iso)) continue;
    const eff = efektivniTrasaDen(route, iso);
    if (eff.nejelo) { dnyNejelo++; if (eff.maVyjimku) vyjimkyList.push({ iso, extra:0, ridic: eff.ridic||'—', nejelo:true }); continue; }
    dnyJizdnich++;
    kmZakladCelkem += (+cfg.kmZaDen || 0);
    kmObjizdkaCelkem += eff.objizdkaKm;
    prijemCelkem += cfg.cenovyModel === 'pausal' ? (+cfg.pausalZaDen||0) : (((+cfg.kmZaDen||0)+eff.objizdkaKm) * (+cfg.cenaZaKm||0));
    if (eff.ridic) ridicPocty[eff.ridic] = (ridicPocty[eff.ridic]||0) + 1;
    if (eff.maVyjimku) vyjimkyList.push({ iso, extra: eff.objizdkaKm, ridic: eff.ridic||'—', nejelo:false });
  }
  const ridicSouhrn = Object.entries(ridicPocty).sort((a,b)=>b[1]-a[1]).map(([r,c]) => `${r} (${c}×)`).join(', ');

  document.getElementById('trasaDetailContent').innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
      <h2 style="margin-bottom:2px;">📍 Trasa ${route}</h2>
      <button class="btn btn-ghost btn-sm" onclick="closeModal('trasaDetailModal')">✕</button>
    </div>
    <p class="modal-sub">Nastav cenu jednou — appka ji pak použije automaticky, kdykoli trase přiřadíš řidiče.</p>

    <div style="font-size:11px; letter-spacing:1px; color:var(--muted); text-transform:uppercase; margin:16px 0 10px;">Cenový model</div>
    <div style="display:flex; gap:16px; margin-bottom:14px;">
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="radio" name="cenovyModel" value="km" id="modelKm" ${cfg.cenovyModel!=='pausal'?'checked':''}> Cena za km
      </label>
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="radio" name="cenovyModel" value="pausal" id="modelPausal" ${cfg.cenovyModel==='pausal'?'checked':''}> Paušál za den
      </label>
    </div>

    <div id="polaKm" class="form-cols-2" style="${cfg.cenovyModel==='pausal'?'display:none;':''}">
      <div class="form-row"><label>Cena za km (Kč)</label><input type="number" id="trasaCenaZaKm" step="0.1" min="0" value="${cfg.cenaZaKm||''}"></div>
      <div class="form-row"><label>Počet km trasy (za den)</label><input type="number" id="trasaKmZaDen" step="1" min="0" value="${cfg.kmZaDen||''}"></div>
    </div>
    <div id="poleParusal" class="form-row" style="${cfg.cenovyModel!=='pausal'?'display:none;':''}">
      <label>Paušál za den (Kč)</label>
      <input type="number" id="trasaPausalZaDen" step="1" min="0" value="${cfg.pausalZaDen||''}">
    </div>

    <div class="form-cols-2">
      <div class="form-row">
        <label>Stálý řidič</label>
        <select id="trasaStalyRidic">
          <option value="">— nevybráno —</option>
          ${state.ridici.map(r => `<option value="${r.jmeno}" ${cfg.stalyRidic===r.jmeno?'selected':''}>${r.jmeno}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label>Odhad nákladů za den (Kč)</label>
        <input type="number" id="trasaOdhadNakladu" step="1" min="0" value="${cfg.odhadNakladuZaDen||''}">
      </div>
    </div>

    <div class="modal-actions" style="margin-bottom:12px;">
      <button type="button" class="btn btn-primary" id="btnTrasaUlozit">Uložit nastavení</button>
    </div>
    <div style="display:flex; justify-content:flex-end; margin-bottom:20px;">
      <button type="button" class="btn btn-ghost btn-sm" id="btnTrasaKopirovat">Použít cenu na všechny trasy</button>
    </div>

    <div style="font-size:11px; letter-spacing:1px; color:var(--muted); text-transform:uppercase; margin-bottom:10px; padding-top:14px; border-top:1px solid var(--border-c);">Přehled — ${monthNames[month]} ${year}</div>
    <div class="metrics" style="margin-bottom:16px;">
      <div class="metric"><div class="m-label">Dní odjeto</div><div class="m-value">${dnyJizdnich}</div>${dnyNejelo>0?`<div class="m-delta" style="color:var(--red);">${dnyNejelo}× nejelo</div>`:''}</div>
      <div class="metric"><div class="m-label">Km celkem</div><div class="m-value">${(kmZakladCelkem+kmObjizdkaCelkem).toLocaleString('cs-CZ')}</div>${kmObjizdkaCelkem>0?`<div class="m-delta neutral">z toho ${kmObjizdkaCelkem} km objížďky</div>`:''}</div>
      <div class="metric"><div class="m-label">Příjem</div><div class="m-value" style="color:var(--green);">${prijemCelkem.toLocaleString('cs-CZ')} Kč</div></div>
    </div>
    ${ridicSouhrn ? `<p style="font-size:12px; color:var(--muted); margin-bottom:14px;">👷 Jezdili: ${ridicSouhrn}</p>` : ''}
    ${kmObjizdkaCelkem > 0 && cfg.cenovyModel !== 'pausal' ? `<p style="font-size:12px; color:var(--amber); margin-bottom:14px;">🛣️ Objížďky tento měsíc: ${kmObjizdkaCelkem} km navíc = ${(kmObjizdkaCelkem*(+cfg.cenaZaKm||0)).toLocaleString('cs-CZ')} Kč navíc</p>` : ''}

    ${vyjimkyList.length > 0 ? `
      <div style="font-size:12px; color:var(--muted); margin-bottom:8px;">Dny s výjimkou (${vyjimkyList.length}):</div>
      <table class="data-table">
        <thead><tr><th>Datum</th><th>Řidič</th><th>Km navíc</th><th style="text-align:right">Vícenáklad</th></tr></thead>
        <tbody>
          ${vyjimkyList.map(o => `<tr><td>${formatDate(o.iso)}</td><td>${o.ridic}</td><td>${o.nejelo?'<span style="color:var(--red);">Nejelo</span>':(o.extra>0?'+'+o.extra+' km':'zástup')}</td><td style="text-align:right">${(!o.nejelo && o.extra>0 && cfg.cenovyModel!=='pausal')?('+'+(o.extra*(+cfg.cenaZaKm||0)).toLocaleString('cs-CZ')+' Kč'):'—'}</td></tr>`).join('')}
        </tbody>
      </table>
    ` : `<p style="font-size:12.5px; color:var(--dim); font-style:italic;">Tento měsíc žádné výjimky — jelo se podle výchozího nastavení.</p>`}
  `;

  document.getElementById('modelKm').addEventListener('change', toggleCenovyModel);
  document.getElementById('modelPausal').addEventListener('change', toggleCenovyModel);
  function toggleCenovyModel() {
    const jePausal = document.getElementById('modelPausal').checked;
    document.getElementById('polaKm').style.display = jePausal ? 'none' : 'grid';
    document.getElementById('poleParusal').style.display = jePausal ? 'flex' : 'none';
  }

  document.getElementById('btnTrasaUlozit').addEventListener('click', () => {
    const cenovyModel = document.getElementById('modelPausal').checked ? 'pausal' : 'km';
    state.pnsRouteConfig[route] = {
      cenovyModel,
      cenaZaKm: +document.getElementById('trasaCenaZaKm').value || 0,
      kmZaDen: +document.getElementById('trasaKmZaDen').value || 0,
      pausalZaDen: +document.getElementById('trasaPausalZaDen').value || 0,
      odhadNakladuZaDen: +document.getElementById('trasaOdhadNakladu').value || 0,
      stalyRidic: document.getElementById('trasaStalyRidic').value
    };
    saveState(); closeModal('trasaDetailModal'); renderSection('mala-doprava');
  });

  document.getElementById('btnTrasaKopirovat').addEventListener('click', () => {
    const zdroj = {
      cenovyModel: document.getElementById('modelPausal').checked ? 'pausal' : 'km',
      cenaZaKm: +document.getElementById('trasaCenaZaKm').value || 0,
      kmZaDen: +document.getElementById('trasaKmZaDen').value || 0,
      pausalZaDen: +document.getElementById('trasaPausalZaDen').value || 0,
      odhadNakladuZaDen: +document.getElementById('trasaOdhadNakladu').value || 0
    };
    const ostatni = PNS_ROUTES.filter(r => r !== route);
    if (!confirm(`Přepsat cenu, model a odhad nákladů na ${ostatni.length} ostatních tras podle trasy ${route}?\n\nStálý řidič u každé trasy zůstane beze změny. Tato akce je nevratná.`)) return;
    ostatni.forEach(r => { state.pnsRouteConfig[r] = { ...state.pnsRouteConfig[r], ...zdroj }; });
    saveState();
    alert(`Hotovo — cena přepsána na ${ostatni.length} tras.`);
    closeModal('trasaDetailModal'); renderSection('mala-doprava');
  });

  openModal('trasaDetailModal');
};

function bindMalaDoprava() {
  document.getElementById('btnMesicPred').addEventListener('click', () => { malaDopravaMonthOffset--; renderSection('mala-doprava'); });
  document.getElementById('btnMesicDal').addEventListener('click', () => { malaDopravaMonthOffset++; renderSection('mala-doprava'); });
  document.getElementById('btnExportMalaMesic').addEventListener('click', exportMalaDopravaMesicCSV);
  document.getElementById('btnExportMalaVyjimky').addEventListener('click', exportMalaDopravaVyjimkyCSV);
  document.getElementById('btnExportVicenaklady').addEventListener('click', exportVicenakladyObjizdekCSV);
  bindHromadnaObjizdka();
}

// Aktuálně zobrazený měsíc v kalendáři malé dopravy (rok, měsíc 0-11, počet dní)
function malaDopravaAktualniMesic() {
  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + malaDopravaMonthOffset, 1);
  const year = viewDate.getFullYear(), month = viewDate.getMonth();
  return { year, month, daysInMonth: new Date(year, month+1, 0).getDate() };
}

// Export k fakturaci PNS — jeden řádek na trasu, součty za zobrazený měsíc
function exportMalaDopravaMesicCSV() {
  const { year, month, daysInMonth } = malaDopravaAktualniMesic();
  const rows = [['Trasa','Cenový model','Stálý řidič','Dní odjeto','Dní nejelo','Km základ','Km objížďky','Km celkem','Příjem Kč']];
  let sumOdjeto=0, sumNejelo=0, sumKmZaklad=0, sumKmObjizdka=0, sumKmCelkem=0, sumPrijem=0;

  PNS_ROUTES.forEach(route => {
    const cfg = state.pnsRouteConfig[route];
    let dnyOdjeto=0, dnyNejelo=0, kmZaklad=0, kmObjizdka=0, prijem=0;
    for (let d=1; d<=daysInMonth; d++) {
      const iso = toISO(new Date(year, month, d));
      if (!isDrivingDay(iso)) continue;
      const eff = efektivniTrasaDen(route, iso);
      if (eff.nejelo) { dnyNejelo++; continue; }
      dnyOdjeto++;
      kmZaklad += (+cfg.kmZaDen || 0);
      kmObjizdka += eff.objizdkaKm;
      prijem += cfg.cenovyModel === 'pausal' ? (+cfg.pausalZaDen||0) : (((+cfg.kmZaDen||0)+eff.objizdkaKm) * (+cfg.cenaZaKm||0));
    }
    const kmCelkem = kmZaklad + kmObjizdka;
    rows.push([route, cfg.cenovyModel==='pausal'?'Paušál':'Km', cfg.stalyRidic||'—', dnyOdjeto, dnyNejelo, kmZaklad, kmObjizdka, kmCelkem, prijem]);
    sumOdjeto+=dnyOdjeto; sumNejelo+=dnyNejelo; sumKmZaklad+=kmZaklad; sumKmObjizdka+=kmObjizdka; sumKmCelkem+=kmCelkem; sumPrijem+=prijem;
  });
  rows.push(['CELKEM','','', sumOdjeto, sumNejelo, sumKmZaklad, sumKmObjizdka, sumKmCelkem, sumPrijem]);

  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const mesicStr = `${year}-${String(month+1).padStart(2,'0')}`;
  downloadFile(`mala-doprava-${mesicStr}.csv`, 'text/csv;charset=utf-8;', '﻿'+csv);
}

// Export vícenákladů z objížděk pro fakturaci platci — jeden řádek na trasu, součty za zobrazený měsíc
function exportVicenakladyObjizdekCSV() {
  const { year, month, daysInMonth } = malaDopravaAktualniMesic();
  const vic = vicenakladyObjizdekMesic(year, month, daysInMonth);
  const rows = [['Trasa','Dní s objížďkou','Km navíc celkem','Cena za km Kč','Vícenáklad Kč']];
  vic.radky.forEach(r => rows.push([r.route, r.dny, r.km, r.jePausal ? 'paušál' : r.cenaZaKm, r.vicenaklad]));
  rows.push(['CELKEM', '', vic.sumKm, '', vic.sumVicenaklad]);
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const mesicStr = `${year}-${String(month+1).padStart(2,'0')}`;
  downloadFile(`objizdky-vicenaklady-${mesicStr}.csv`, 'text/csv;charset=utf-8;', '﻿'+csv);
}

// Export výjimek k fakturaci — jeden řádek na každou zapsanou výjimku v měsíci
function exportMalaDopravaVyjimkyCSV() {
  const { year, month, daysInMonth } = malaDopravaAktualniMesic();
  const rows = [['Datum','Trasa','Řidič','Km navíc','Vícenáklad Kč','Nejelo']];

  for (let d=1; d<=daysInMonth; d++) {
    const iso = toISO(new Date(year, month, d));
    if (!isDrivingDay(iso)) continue;
    const vyjimky = denniVyjimky(iso);
    PNS_ROUTES.forEach(route => {
      const v = vyjimky[route];
      if (!v) return;
      const cfg = state.pnsRouteConfig[route];
      const objKm = +v.objizdkaKm || 0;
      const vicenaklad = (!v.nejelo && objKm>0 && cfg.cenovyModel!=='pausal') ? objKm * (+cfg.cenaZaKm||0) : 0;
      rows.push([formatDate(iso), route, v.ridic || cfg.stalyRidic || '', objKm, vicenaklad, v.nejelo ? 'ano' : 'ne']);
    });
  }
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const mesicStr = `${year}-${String(month+1).padStart(2,'0')}`;
  downloadFile(`mala-doprava-vyjimky-${mesicStr}.csv`, 'text/csv;charset=utf-8;', '﻿'+csv);
}


function renderReporty() {
  const kmPerRidic = {}, kmPerVozidlo = {}, litryPerVozidlo = {};
  state.jizdy.forEach(j => { kmPerRidic[j.ridic] = (kmPerRidic[j.ridic]||0) + (+j.km||0); kmPerVozidlo[j.vozidlo] = (kmPerVozidlo[j.vozidlo]||0) + (+j.km||0); });
  state.tankovani.forEach(t => { litryPerVozidlo[t.vozidlo] = (litryPerVozidlo[t.vozidlo]||0) + (+t.litry||0); });

  // Ziskovost — jen jízdy, kde je finance vyplněné
  const jizdyFinance = state.jizdy.filter(j => j.financni);
  let sumFakturovano = 0, sumNaklady = 0;
  const ziskPerRidic = {};
  jizdyFinance.forEach(j => {
    const f = j.financni;
    const naklady = (+f.palivo||0)+(+f.mytne||0)+(+f.clo||0)+(+f.amortizace||0)+(+f.pojisteni||0)+(+f.ridicNaklad||0)+(+f.ostatni||0);
    const zisk = (+f.fakturovano||0) - naklady;
    sumFakturovano += (+f.fakturovano||0);
    sumNaklady += naklady;
    ziskPerRidic[j.ridic] = (ziskPerRidic[j.ridic]||0) + zisk;
  });
  const sumZisk = sumFakturovano - sumNaklady;
  const marze = sumFakturovano > 0 ? (sumZisk/sumFakturovano*100).toFixed(1) : '0.0';

  return `
    <div class="page-head">
      <div><h1>📊 Reporty</h1><p>Výkon podle řidičů, vozidel a nákladů.</p></div>
      <div class="page-actions"><button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️ Tisk / PDF</button></div>
    </div>

    <div class="card-panel" style="margin-bottom:20px;">
      <h3>💰 Ziskovost</h3>
      <p class="csub">${jizdyFinance.length} z ${state.jizdy.length} jízd má vyplněné finance. ${state.jizdy.length - jizdyFinance.length > 0 ? `Zbytek doplníš tlačítkem „Finance" u jízdy.` : ''}</p>
      <div class="metrics" style="margin-bottom:0;">
        <div class="metric"><div class="m-label">Tržby (fakturováno)</div><div class="m-value">${sumFakturovano.toLocaleString('cs-CZ')} Kč</div></div>
        <div class="metric"><div class="m-label">Náklady celkem</div><div class="m-value">${sumNaklady.toLocaleString('cs-CZ')} Kč</div></div>
        <div class="metric"><div class="m-label">Čistý zisk</div><div class="m-value" style="color:${sumZisk>=0?'var(--green)':'var(--red)'};">${sumZisk.toLocaleString('cs-CZ')} Kč</div><div class="m-delta neutral">marže ${marze} %</div></div>
      </div>
    </div>

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

    ${Object.keys(ziskPerRidic).length > 0 ? `
    <div class="card-panel" style="margin-top:20px;">
      <h3>Zisk podle řidiče</h3><p class="csub">Součet čistého zisku z jízd, kde jsou vyplněné finance.</p>
      <table class="data-table"><thead><tr><th>Řidič</th><th style="text-align:right">Zisk</th></tr></thead><tbody>
        ${Object.entries(ziskPerRidic).sort((a,b)=>b[1]-a[1]).map(([r,z])=>`<tr><td>${r}</td><td style="text-align:right"><b style="color:${z>=0?'var(--green)':'var(--red)'};">${z.toLocaleString('cs-CZ')} Kč</b></td></tr>`).join('')}
      </tbody></table>
    </div>
    ` : ''}
  `;
}
function renderFakturace() {
  const suma = state.zakazky.reduce((s,z)=>s+(+z.cena||0),0);
  const dok = state.zakazky.filter(z=>z.stav==='Dokončeno');
  return `
    <div class="page-head">
      <div><h1>🧾 Podklady k fakturaci</h1><p>Přehled zakázek k fakturaci.</p></div>
      <div class="page-actions"><button class="btn btn-ghost btn-sm" onclick="window.print()">🖨️ Tisk / PDF</button></div>
    </div>
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

// termBadge pro další povinné stažení (karta řidiče / tachograf) — počítá deadline z posledního stažení + interval
function stazeniBadge(posledniIso, intervalDny) {
  if (!posledniIso) return '';
  return termBadge(toISO(addDays(new Date(posledniIso), intervalDny)));
}

// Skloňování "den/dny/dní" podle počtu (1 den, 2-4 dny, 5+ dní)
function czechDny(n) {
  if (n === 1) return 'den';
  if (n >= 2 && n <= 4) return 'dny';
  return 'dní';
}
// Skloňování "trasa/trasy/tras" podle počtu
function czechTras(n) {
  if (n === 1) return 'trasa';
  if (n >= 2 && n <= 4) return 'trasy';
  return 'tras';
}

// Vrátí { text, level } když se blíží (do 7 dní) nebo prošel termín dalšího stažení, jinak null
function stazeniVarovani(popis, posledniIso, intervalDny) {
  if (!posledniIso) return null;
  const deadline = toISO(addDays(new Date(posledniIso), intervalDny));
  const d = daysDiff(deadline, new Date());
  if (d > 7) return null;
  if (d < 0) return { text: `${popis} — prošlo před ${Math.abs(d)} ${Math.abs(d)===1?'dnem':czechDny(Math.abs(d))}`, level: 'err', dny: d };
  if (d === 0) return { text: `${popis} — dnes`, level: 'err', dny: d };
  return { text: `${popis} — za ${d} ${czechDny(d)}`, level: d<=3?'err':'warn', dny: d };
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

// PWA — zaregistruje service worker, pokud to prohlížeč umí (na file:// se přeskočí)
if ('serviceWorker' in navigator) {
  try {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  } catch (e) {}
}
