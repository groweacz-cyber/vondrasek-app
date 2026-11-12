// Jednorázová migrace (2026-11-12), bezpečné pustit znovu:
//  1) kalendář Eonu z dřívějšího úložiště (pnsRouteConfig 'eon') přesune do kolekce eonDny (po měsících),
//  2) stávajícím řidičům 1–15 (řidiči tras PNS) nastaví zařazení "malá doprava" (jen když ještě nemají žádné),
//  3) založí řidičku Renata Lišková (id 16) s příznakem trasy 20001+ (Eon) a vygeneruje jí PIN (vypíše se jen do konzole).
// Spuštění (s proměnnými z Vercelu): node scripts/zarazeni-eon-2026-11.js
const crypto = require('crypto');
const { db } = require('../api/_lib/db');
const { otisk } = require('../api/_lib/auth');

const RENATA = { id: '16', jmeno: 'Renata Lišková' };

function nahodnyPin() {
  for (;;) {
    const p = String(crypto.randomInt(1000, 10000));
    const d = p.split('').map(Number);
    const rada = d.every((x, i) => i === 0 || x === d[i - 1] + 1) || d.every((x, i) => i === 0 || x === d[i - 1] - 1);
    if (new Set(d).size < 4 || rada || /^(19|20)\d\d$/.test(p)) continue;
    return p;
  }
}

async function main() {
  const q = await db();
  const out = { presunuteDny: 0, zarazeno: 0, pin: null };

  // 1) starý kalendář Eonu -> eonDny
  const stary = await q(`SELECT data FROM vnd_records WHERE coll = 'pnsRouteConfig' AND id = 'eon' AND deleted = false`);
  if (stary.length) {
    const dny = (stary[0].data && stary[0].data.dny) || {};
    const poMesicich = {};
    Object.keys(dny).filter(k => dny[k] && /^\d{4}-\d{2}-\d{2}$/.test(k)).forEach(k => { (poMesicich[k.slice(0, 7)] = poMesicich[k.slice(0, 7)] || {})[k] = true; });
    for (const [mesic, d] of Object.entries(poMesicich)) {
      const ex = await q(`SELECT data FROM vnd_records WHERE coll = 'eonDny' AND id = $1 AND deleted = false`, [mesic]);
      const slouceno = { ...((ex[0] && ex[0].data && ex[0].data.dny) || {}), ...d };
      await q(`INSERT INTO vnd_records (coll, id, data, deleted, seq, updated_by) VALUES ('eonDny', $1, $2::jsonb, false, nextval('vnd_rev'), 'migrace')
               ON CONFLICT (coll, id) DO UPDATE SET data = EXCLUDED.data, deleted = false, seq = nextval('vnd_rev'), updated_by = 'migrace', updated_at = now()`,
        [mesic, JSON.stringify({ dny: slouceno })]);
      out.presunuteDny += Object.keys(d).length;
    }
    await q(`UPDATE vnd_records SET deleted = true, data = '{}'::jsonb, seq = nextval('vnd_rev'), updated_by = 'migrace', updated_at = now() WHERE coll = 'pnsRouteConfig' AND id = 'eon'`);
  }

  // 2) zařazení stávajících řidičů tras PNS (jen když ještě nemají žádný příznak zařazení)
  const ridici = await q(`SELECT id, data FROM vnd_records WHERE coll = 'ridici' AND deleted = false AND id <> $1`, [RENATA.id]);
  for (const r of ridici) {
    const d = r.data || {};
    if (d.malaDoprava !== undefined || d.velkaDoprava !== undefined) continue;
    await q(`UPDATE vnd_records SET data = $2::jsonb, seq = nextval('vnd_rev'), updated_by = 'migrace', updated_at = now() WHERE coll = 'ridici' AND id = $1`,
      [r.id, JSON.stringify({ ...d, malaDoprava: true, velkaDoprava: false })]);
    out.zarazeno++;
  }

  // 3) Renata Lišková — Eon
  const data = { id: +RENATA.id, jmeno: RENATA.jmeno, telefon: '', skupina: '—', kartaRidice: '', profesniPrukaz: '', posledniStazeniKarty: null, malaDoprava: true, velkaDoprava: false, eon: true };
  const ex = await q(`SELECT data, deleted FROM vnd_records WHERE coll = 'ridici' AND id = $1`, [RENATA.id]);
  const slouceno = ex.length && !ex[0].deleted ? { ...data, ...ex[0].data, eon: true } : data;
  await q(`INSERT INTO vnd_records (coll, id, data, deleted, seq, updated_by) VALUES ('ridici', $1, $2::jsonb, false, nextval('vnd_rev'), 'migrace')
           ON CONFLICT (coll, id) DO UPDATE SET data = EXCLUDED.data, deleted = false, seq = nextval('vnd_rev'), updated_by = 'migrace', updated_at = now()`,
    [RENATA.id, JSON.stringify(slouceno)]);
  const maPin = await q('SELECT 1 FROM vnd_access WHERE subject = $1', ['driver:' + RENATA.id]);
  if (!maPin.length) {
    for (;;) {
      const pin = nahodnyPin();
      try {
        await q(`INSERT INTO vnd_access (subject, pin_fp, ver, must_change) VALUES ($1, $2, 1, false)`, ['driver:' + RENATA.id, otisk(pin)]);
        out.pin = pin; break;
      } catch (e) {
        if (e && (e.code === '23505' || /unique|duplicate/i.test(String(e.message)))) continue;
        throw e;
      }
    }
  }

  console.log(`Přesunuto dnů Eonu: ${out.presunuteDny} · zařazeno řidičů do malé dopravy: ${out.zarazeno}`);
  console.log(out.pin ? `Renata Lišková (id 16, Eon) — PIN: ${out.pin}` : 'Renata Lišková už měla PIN — beze změny.');
  return out;
}

module.exports = main;
if (require.main === module) main().then(() => process.exit(0)).catch(e => { console.error(e.message || e); process.exit(1); });
