// Jednorázový skript (2026-11-12): založí vozidla firmy (bez přiřazení řidičů, bez STK a pojistek).
// Bezpečné pustit znovu — vozidlo se stejnou SPZ přeskočí. Spuštění (s proměnnými z Vercelu):
//   node scripts/vozidla-2026-11.js
const { db } = require('../api/_lib/db');

const MALA = [
  ['Ford Transit Connect', '8C20814'], ['Ford Transit Connect', '9A81220'], ['Ford Transit Connect', '1CD8778'],
  ['Ford Transit Connect', '1CI5348'], ['Ford Transit Connect', '9C82735'], ['Ford Transit Connect', '1AN8128'],
  ['Ford Transit Connect', '2AM0670'], ['Ford Transit Connect', '3P89927'], ['Ford Transit Connect', '8C18356'],
  ['Ford Transit Connect', '8C73564'], ['Ford Transit Connect', '2AD4840'], ['Ford Transit Connect', '9A75250'],
  ['Ford Transit', '1AX4670'], ['Ford Transit Long', '1CI8351'], ['Ford Transit Courier', '2BC6945']
].map(([znacka, spz]) => ({ spz, typ: 'Dodávka', znacka, doprava: 'mala' }));
const VELKA = [
  { spz: '1CE6756', typ: 'Kamion', znacka: 'DAF LF', doprava: 'velka' },
  { spz: '5CO4903', typ: 'Přípojný vlek', znacka: 'Přípojný vlek', doprava: 'velka' }
];

async function main() {
  const q = await db();
  const ex = await q(`SELECT id, data FROM vnd_records WHERE coll = 'vozidla'`);
  const mapa = new Set(ex.filter(r => r.data && r.data.spz).map(r => String(r.data.spz).replace(/\s/g, '').toUpperCase()));
  let id = ex.reduce((m, r) => Math.max(m, +r.id || 0), 0);
  let pridano = 0, preskoceno = 0;
  for (const v of MALA.concat(VELKA)) {
    if (mapa.has(v.spz)) { preskoceno++; continue; }
    id++;
    const data = { id, ...v, stk: '', pojistka: '', dalnicniZnamka: null, poznamka: '', amortizaceKm: 0, mytoKm: 0, prumernaSpotreba: 0, objemNadrze: 0, servisKm: 0, fixniMesicne: 0, posledniStazeniTacho: null, ridicId: null };
    await q(`INSERT INTO vnd_records (coll, id, data, deleted, seq, updated_by) VALUES ('vozidla', $1, $2::jsonb, false, nextval('vnd_rev'), 'migrace')
             ON CONFLICT (coll, id) DO UPDATE SET data = EXCLUDED.data, deleted = false, seq = nextval('vnd_rev'), updated_by = 'migrace', updated_at = now()`,
      [String(id), JSON.stringify(data)]);
    pridano++;
  }
  console.log(`Vozidla: přidáno ${pridano}, přeskočeno (už existují) ${preskoceno}.`);
  return { pridano, preskoceno };
}

module.exports = main;
if (require.main === module) main().then(() => process.exit(0)).catch(e => { console.error(e.message || e); process.exit(1); });
