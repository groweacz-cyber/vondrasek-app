// Mapy tras — vše zdarma a bez klíče: dlaždice OpenStreetMap (Leaflet), vyhledání míst přes Nominatim, trasa po silnicích přes OSRM.
// Hotová trasa (zastávky + čára) se ukládá k trase/lince, takže se mapa jen vykreslí a nic se nehledá znovu.
const MAPA_BARVY = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0fb5b5', '#f032e6', '#9a6324', '#a3a300', '#1f3a93', '#e6a800', '#2e8b57', '#d2691e', '#6a5acd', '#c71585', '#00897b', '#5d4037', '#ef6c00', '#455a64'];
const barvaTrasy = (i) => MAPA_BARVY[((i % MAPA_BARVY.length) + MAPA_BARVY.length) % MAPA_BARVY.length];
const mapaEsc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mapaSpi = (ms) => new Promise(r => setTimeout(r, ms));

const GEO_KLIC = 'vnd_geo_v1';
let mapaGeoPosledni = 0;
function mapaGeoCache() { try { return JSON.parse(localStorage.getItem(GEO_KLIC)) || {}; } catch { return {}; } }
function mapaGeoUloz(c) { try { localStorage.setItem(GEO_KLIC, JSON.stringify(c)); } catch {} }

// Najde místo podle textu (Nominatim, max. 1 dotaz za sekundu); výsledky se pamatují v prohlížeči
async function mapaGeokoduj(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const cache = mapaGeoCache();
  if (cache[t]) return { lat: cache[t][0], lon: cache[t][1] };
  const cekej = 1100 - (Date.now() - mapaGeoPosledni);
  if (cekej > 0) await mapaSpi(cekej);
  mapaGeoPosledni = Date.now();
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=cs&q=' + encodeURIComponent(t));
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.length) return null;
    const lat = +(+j[0].lat).toFixed(5), lon = +(+j[0].lon).toFixed(5);
    cache[t] = [lat, lon]; mapaGeoUloz(cache);
    return { lat, lon };
  } catch { return null; }
}

// Trasa po silnicích mezi body (OSRM); při výpadku se zobrazí aspoň přímé spojení
async function mapaOsrm(body) {
  const rovne = () => ({ linie: body.map(b => [b.lat, b.lon]), km: 0, ok: false });
  try {
    const souradnice = body.map(b => b.lon + ',' + b.lat).join(';');
    const r = await fetch('https://router.project-osrm.org/route/v1/driving/' + souradnice + '?overview=full&geometries=geojson&steps=false');
    if (!r.ok) return rovne();
    const j = await r.json();
    if (!j.routes || !j.routes.length) return rovne();
    let pts = j.routes[0].geometry.coordinates;
    const krok = Math.max(1, Math.ceil(pts.length / 700));
    pts = pts.filter((_, i) => i % krok === 0 || i === pts.length - 1).map(p => [+p[1].toFixed(4), +p[0].toFixed(4)]);
    return { linie: pts, km: Math.round(j.routes[0].distance / 100) / 10, ok: true };
  } catch { return rovne(); }
}

// Z textů zastávek (v pořadí jízdy) udělá hotovou mapu { body, linie, km, presne } + seznam nenalezených míst
async function mapaSestav(texty, prog) {
  const body = [], nenalezeno = [];
  for (let i = 0; i < texty.length; i++) {
    if (prog) prog(`Hledám místo ${i + 1}/${texty.length}: ${texty[i]}`);
    const g = await mapaGeokoduj(texty[i]);
    if (g) body.push({ t: texty[i], lat: g.lat, lon: g.lon }); else nenalezeno.push(texty[i]);
  }
  if (body.length < 2) return { mapa: null, nenalezeno };
  if (prog) prog('Počítám trasu po silnicích…');
  const r = await mapaOsrm(body);
  return { mapa: { body, linie: r.linie, km: r.km, presne: r.ok }, nenalezeno };
}
const mapaRadky = (text) => String(text || '').split('\n').map(s => s.trim()).filter(Boolean);

// Vykreslí vrstvy [{ id, nazev, barva, body, linie }] do prvku; vrací { map, skupiny }
function mapaVykresli(el, vrstvy, skryte) {
  if (el._mapa) { try { el._mapa.remove(); } catch {} el._mapa = null; }
  el.innerHTML = '';
  if (!window.L) { el.innerHTML = '<div class="mapa-chyba">Mapa se nenačetla — zkontroluj připojení k internetu.</div>'; return null; }
  const map = L.map(el, { scrollWheelZoom: false }).setView([49.4, 14.6], 8);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© přispěvatelé OpenStreetMap' }).addTo(map);
  const skupiny = {}, hranice = [];
  vrstvy.forEach(v => {
    const g = L.layerGroup();
    const linie = (v.linie && v.linie.length > 1) ? v.linie : (v.body || []).map(b => [b.lat, b.lon]);
    if (linie.length > 1) L.polyline(linie, { color: v.barva, weight: 5, opacity: 0.85 }).bindTooltip(mapaEsc(v.nazev), { sticky: true }).addTo(g);
    (v.body || []).forEach((b, i) => {
      L.marker([b.lat, b.lon], { icon: L.divIcon({ className: 'mapa-pin', html: `<span style="background:${v.barva}">${i + 1}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }) })
        .bindPopup(`<b>${mapaEsc(v.nazev)}</b><br>${i + 1}. ${mapaEsc(b.t)}`).addTo(g);
    });
    skupiny[v.id] = g;
    if (!(skryte && skryte.has(v.id))) g.addTo(map);
    linie.forEach(p => hranice.push(p));
  });
  if (hranice.length) map.fitBounds(hranice, { padding: [24, 24] });
  el._mapa = map; el._skupiny = skupiny;
  setTimeout(() => { try { map.invalidateSize(); } catch {} }, 80);
  return { map, skupiny };
}

// ---------- panel s legendou a mapou (Kompletní přehled, Malá doprava, linky, den trasy) ----------
window._mapaSkryte = window._mapaSkryte || new Set();
const popisTrasy = (v) => (v.body || []).map(b => mapaEsc(b.t)).join(' → ');

// Které vrstvy se v daném rozsahu zobrazí: 'vse' | 'linky' | 'pns' | 'den:RRRR-MM-DD'
function mapaVrstvy(scope) {
  const v = [];
  const vlastniPns = state.role === 'owner';
  if (vlastniPns && (scope === 'vse' || scope === 'pns' || scope.startsWith('den:'))) {
    const den = scope.startsWith('den:') ? scope.slice(4) : null;
    PNS_ROUTES.forEach((r, i) => {
      const c = state.pnsRouteConfig[r];
      if (!c || !c.mapa || !c.mapa.body) return;
      if (den && efektivniTrasaDen(r, den).nejelo) return;
      v.push({ id: 'pns-' + r, nazev: `Trasa ${r}${c.stalyRidic ? ' — ' + c.stalyRidic : ''}`, barva: barvaTrasy(i), body: c.mapa.body, linie: c.mapa.linie, km: c.mapa.km });
    });
  }
  if (scope === 'vse' || scope === 'linky') {
    (state.linky || []).forEach((l, i) => {
      if (!l.mapa || !l.mapa.body) return;
      v.push({ id: 'linka-' + l.id, nazev: `Linka ${l.nazev}`, barva: barvaTrasy(15 + i), body: l.mapa.body, linie: l.mapa.linie, km: l.mapa.km });
    });
  }
  return v;
}

function mapaPanelInit(el) {
  if (!el) return;
  const scope = el.dataset.scope || 'vse';
  const vrstvy = mapaVrstvy(scope);
  const skryte = scope.startsWith('den:') ? new Set() : window._mapaSkryte;   // mapa dne je vždy celá, skrývání z přehledu se na ni nepřenáší
  if (!vrstvy.length) {
    el.innerHTML = `<p class="csub" style="margin:0;">${state.role === 'owner' ? 'Zatím nemá žádná trasa nastavenou mapu. Zastávky zadáš u trasy v Malá doprava (klik na číslo trasy) nebo u linky ve Velká doprava (CZ).' : 'Zatím tu není žádná mapa.'}</p>`;
    return;
  }
  const bezMapy = scope === 'vse' || scope === 'pns' ? PNS_ROUTES.filter(r => state.role === 'owner' && !(state.pnsRouteConfig[r] && state.pnsRouteConfig[r].mapa)) : [];
  el.innerHTML = `
    <div class="mapa-panel">
      <div class="mapa-legenda">
        ${vrstvy.map(v => `
          <label class="mapa-radek">
            <input type="checkbox" data-vrstva="${mapaEsc(v.id)}" ${skryte.has(v.id) ? '' : 'checked'}>
            <span class="mapa-tecka" style="background:${v.barva}"></span>
            <span><b>${mapaEsc(v.nazev)}</b>${v.km ? ` <span class="mapa-km">${v.km.toLocaleString('cs-CZ')} km</span>` : ''}<span class="mapa-popis">${popisTrasy(v)}</span></span>
          </label>`).join('')}
        ${bezMapy.length ? `<div class="mapa-popis" style="margin-top:8px;">Bez mapy: ${bezMapy.join(', ')}</div>` : ''}
      </div>
      <div class="mapa-box"></div>
    </div>`;
  const box = el.querySelector('.mapa-box');
  mapaVykresli(box, vrstvy, skryte);
  el.querySelectorAll('input[data-vrstva]').forEach(cb => cb.addEventListener('change', () => {
    const id = cb.dataset.vrstva;
    if (cb.checked) skryte.delete(id); else skryte.add(id);
    const g = box._skupiny && box._skupiny[id];
    if (g && box._mapa) { if (cb.checked) g.addTo(box._mapa); else box._mapa.removeLayer(g); }
  }));
}
function mapaPanelyInit(koren) { (koren || document).querySelectorAll('.mapa-panel-misto').forEach(mapaPanelInit); }

// ---------- okno s mapou (jízda, linka) ----------
window.mapaOkno = async function(titul, ziskejVrstvy) {
  const stare = document.getElementById('mapaOkno'); if (stare) stare.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay open" id="mapaOkno"><div class="modal" style="max-width:780px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
        <h2 style="margin-bottom:2px;">🗺️ ${mapaEsc(titul)}</h2>
        <button class="btn btn-ghost btn-sm" id="mapaOknoZavrit">✕</button>
      </div>
      <div class="mapa-stav" id="mapaOknoStav">Načítám…</div>
      <div class="mapa-box" id="mapaOknoBox" style="height:420px;"></div>
      <div id="mapaOknoPopis" class="mapa-popis" style="margin-top:10px;"></div>
    </div></div>`);
  const zavrit = () => { const o = document.getElementById('mapaOkno'); if (o) { const b = o.querySelector('#mapaOknoBox'); if (b && b._mapa) try { b._mapa.remove(); } catch {} o.remove(); } };
  document.getElementById('mapaOknoZavrit').addEventListener('click', zavrit);
  document.getElementById('mapaOkno').addEventListener('click', (e) => { if (e.target.id === 'mapaOkno') zavrit(); });
  const stav = document.getElementById('mapaOknoStav');
  try {
    const r = await ziskejVrstvy((t) => { stav.textContent = t; });
    if (!document.getElementById('mapaOkno')) return;
    if (!r || !r.vrstvy || !r.vrstvy.length) { stav.textContent = r && r.chyba ? r.chyba : 'Trasu se nepodařilo najít na mapě.'; return; }
    stav.textContent = r.nenalezeno && r.nenalezeno.length ? 'Nenašel jsem: ' + r.nenalezeno.join(', ') : '';
    mapaVykresli(document.getElementById('mapaOknoBox'), r.vrstvy);
    document.getElementById('mapaOknoPopis').innerHTML = r.vrstvy.map(v => `<span class="mapa-tecka" style="background:${v.barva}"></span><b>${mapaEsc(v.nazev)}</b>${v.km ? ' · ' + v.km.toLocaleString('cs-CZ') + ' km' : ''}<br>${popisTrasy(v)}`).join('<br>');
  } catch (e) { stav.textContent = 'Mapu se nepodařilo načíst.'; }
};

// Mapa libovolné jízdy: když jede po lince, vezme se její uložená trasa; jinak se místa odkud → kam dohledají a zapamatují
window.jizdaMapa = function(id) {
  const j = state.jizdy.find(x => x.id === id); if (!j) return;
  mapaOkno(`${j.trasaOd} → ${j.trasaDo}`, async (prog) => {
    const linka = j.linkaId ? (state.linky || []).find(l => String(l.id) === String(j.linkaId)) : null;
    if (linka && linka.mapa && linka.mapa.body) {
      const zpet = j.smer === 'zpet';
      const body = zpet ? linka.mapa.body.slice().reverse() : linka.mapa.body;
      const linie = zpet ? linka.mapa.linie.slice().reverse() : linka.mapa.linie;
      return { vrstvy: [{ id: 'j', nazev: `Linka ${linka.nazev} (${zpet ? 'zpět' : 'tam'})`, barva: barvaTrasy(15), body, linie, km: linka.mapa.km }] };
    }
    const klic = 'vnd_mapa_v1';
    let cache = {}; try { cache = JSON.parse(localStorage.getItem(klic)) || {}; } catch {}
    const k = j.trasaOd + '|' + j.trasaDo;
    let mapa = cache[k];
    let nenalezeno = [];
    if (!mapa) {
      const r = await mapaSestav([j.trasaOd, j.trasaDo], prog);
      mapa = r.mapa; nenalezeno = r.nenalezeno;
      if (mapa) { cache[k] = mapa; try { localStorage.setItem(klic, JSON.stringify(cache)); } catch {} }
    }
    if (!mapa) return { chyba: 'Nenašel jsem místa: ' + nenalezeno.join(', ') + '. Zkus přesnější název (např. s městem).', nenalezeno };
    return { vrstvy: [{ id: 'j', nazev: `${j.trasaOd} → ${j.trasaDo}`, barva: barvaTrasy(2), body: mapa.body, linie: mapa.linie, km: mapa.km }], nenalezeno };
  });
};
