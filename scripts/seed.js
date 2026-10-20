// Jednorázové naplnění databáze pro ostrý provoz: 13 řidičů tras PNS (+ jejich stálé trasy) a PINy.
// Spuštění (s proměnnými prostředí z Vercelu):  OWNER_PIN=1234 node scripts/seed.js
// PINy řidičů se vygenerují náhodně a vypíšou se jen do konzole — v databázi jsou jen jako otisk.
// Skript je bezpečné pustit znovu: existující řidiče a trasy nepřepisuje a PINy mění jen s PINY_ZNOVU=1.
// OWNER_MUST_CHANGE=1 zapne v appce upozornění, že majitel má změnit výchozí PIN.
const crypto = require('crypto');
const { db } = require('../api/_lib/db');
const { otisk } = require('../api/_lib/auth');

const TRASY = ['20001', '20004', '20011', '20016', '20041', '20042', '20043', '20044', '20045', '20058', '20063', '20064', '20066'];

function nahodnyPin(pouzite, vyloucene) {
  for (;;) {
    const p = String(crypto.randomInt(1000, 10000));
    const d = p.split('').map(Number);
    const rada = d.every((x, i) => i === 0 || x === d[i - 1] + 1) || d.every((x, i) => i === 0 || x === d[i - 1] - 1);
    if (new Set(d).size < 4 || rada || /^(19|20)\d\d$/.test(p)) continue;
    if (pouzite.has(p) || vyloucene.some(v => v.slice(0, 3) === p.slice(0, 3) || v.slice(1) === p.slice(1))) continue;
    return p;
  }
}

async function main() {
  const ownerPin = process.env.OWNER_PIN;
  if (!/^\d{4}$/.test(ownerPin || '')) throw new Error('Nastav OWNER_PIN (4 číslice).');
  const q = await db();
  const znovu = process.env.PINY_ZNOVU === '1';
  const pouzite = new Set([ownerPin]);
  const vypis = [];

  for (const [i, trasa] of TRASY.entries()) {
    const id = String(i + 1), jmeno = `${trasa} Řidič`;
    const ex = await q(`SELECT 1 FROM vnd_records WHERE coll = 'ridici' AND id = $1`, [id]);
    if (!ex.length) {
      const data = { id: i + 1, jmeno, telefon: '', skupina: '—', kartaRidice: '', profesniPrukaz: '', posledniStazeniKarty: null };
      await q(`INSERT INTO vnd_records (coll, id, data, deleted, seq, updated_by) VALUES ('ridici', $1, $2::jsonb, false, nextval('vnd_rev'), 'seed')`, [id, JSON.stringify(data)]);
    }
    const cfg = await q(`SELECT 1 FROM vnd_records WHERE coll = 'pnsRouteConfig' AND id = $1`, [trasa]);
    if (!cfg.length) {
      const data = { cenovyModel: 'km', cenaZaKm: 0, kmZaDen: 0, pausalZaDen: 0, odhadNakladuZaDen: 0, stalyRidic: jmeno };
      await q(`INSERT INTO vnd_records (coll, id, data, deleted, seq, updated_by) VALUES ('pnsRouteConfig', $1, $2::jsonb, false, nextval('vnd_rev'), 'seed')`, [trasa, JSON.stringify(data)]);
    }
    const ma = await q('SELECT 1 FROM vnd_access WHERE subject = $1', ['driver:' + id]);
    if (!ma.length || znovu) {
      const pin = nahodnyPin(pouzite, [ownerPin]);
      pouzite.add(pin);
      await q(`INSERT INTO vnd_access (subject, pin_fp, ver, must_change) VALUES ($1, $2, 1, false)
               ON CONFLICT (subject) DO UPDATE SET pin_fp = EXCLUDED.pin_fp, ver = vnd_access.ver + 1, updated_at = now()`, ['driver:' + id, otisk(pin)]);
      vypis.push([trasa, pin]);
    }
  }
  const maMajitele = await q(`SELECT 1 FROM vnd_access WHERE subject = 'owner'`);
  if (!maMajitele.length || znovu) {
    await q(`INSERT INTO vnd_access (subject, pin_fp, ver, must_change) VALUES ('owner', $1, 1, $2)
             ON CONFLICT (subject) DO UPDATE SET pin_fp = EXCLUDED.pin_fp, ver = vnd_access.ver + 1, must_change = EXCLUDED.must_change, updated_at = now()`,
      [otisk(ownerPin), process.env.OWNER_MUST_CHANGE === '1']);
    console.log('PIN majitele nastaven.');
  }
  console.log(vypis.length ? 'PINy řidičů (zapiš si je, znovu se nezobrazí):' : 'Řidiči už měli PINy — beze změny (PINY_ZNOVU=1 je přegeneruje).');
  vypis.forEach(([t, p]) => console.log(`  trasa ${t}: ${p}`));
  return vypis;
}

module.exports = main;
if (require.main === module) main().then(() => process.exit(0)).catch(e => { console.error(e.message || e); process.exit(1); });
