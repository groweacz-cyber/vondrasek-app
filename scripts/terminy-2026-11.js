// Jednorázový skript (2026-11-12): založí v Hlídači termínů měsíční termín "Zaslání faktury PNS a.s." (poslední den měsíce)
// s extra poznámkou k listopadu 2026. Bezpečné pustit znovu (podle názvu se nevytvoří dvakrát).
// Spuštění (s proměnnými z Vercelu): node scripts/terminy-2026-11.js
const { db } = require('../api/_lib/db');

const NAZEV = 'Zaslání faktury PNS a.s. za odjeté jízdy a Eon svozy';

async function main() {
  const q = await db();
  const ex = await q(`SELECT id, data FROM vnd_records WHERE coll = 'terminy' AND deleted = false`);
  if (ex.some(r => r.data && r.data.nazev === NAZEV)) { console.log('Termín už existuje — beze změny.'); return { pridano: 0 }; }
  const id = ex.reduce((m, r) => Math.max(m, +r.id || 0), 0) + 1;
  const data = {
    id, nazev: NAZEV, typ: 'mesicni', den: 31, predem: 20,
    poznamka: 'Faktura za uplynulý měsíc, PNS ji zaúčtuje v následujícím měsíci a proplatí.',
    splneno: {},
    poznamky: { '2026-11': 'Vystavit export za Eon trasy vůči PNS a.s. za měsíce 9, 10, které nejsou proplaceny.' }
  };
  await q(`INSERT INTO vnd_records (coll, id, data, deleted, seq, updated_by) VALUES ('terminy', $1, $2::jsonb, false, nextval('vnd_rev'), 'migrace')
           ON CONFLICT (coll, id) DO UPDATE SET data = EXCLUDED.data, deleted = false, seq = nextval('vnd_rev'), updated_by = 'migrace', updated_at = now()`,
    [String(id), JSON.stringify(data)]);
  console.log('Termín přidán: ' + NAZEV);
  return { pridano: 1 };
}

module.exports = main;
if (require.main === module) main().then(() => process.exit(0)).catch(e => { console.error(e.message || e); process.exit(1); });
