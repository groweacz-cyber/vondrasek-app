// GET  /api/sync?since=N   -> změny od posledního stažení (řidič dostane jen svoje a jen povolené údaje)
// POST /api/sync { ops: [{ coll, id, data, receipt? } | { coll, id, del: true }] } -> uloží změny
const { db } = require('./_lib/db');
const { vyzadujRelaci } = require('./_lib/auth');
const { KOLEKCE, RIDIC_PISE, MAX_ZAZNAM, MAX_FOTKA, projekceProRidice, jeObjekt } = require('./_lib/data');

const STRANKA = 3000;
const ODDELOVAC = '\u0000';

async function ctiZmeny(req, res, q, rel) {
  const since = Math.max(0, parseInt(req.query && req.query.since, 10) || 0);
  const rows = rel.role === 'owner'
    ? await q('SELECT coll, id, data, deleted, seq FROM vnd_records WHERE seq > $1 ORDER BY seq LIMIT ' + STRANKA, [since])
    : await q(`SELECT coll, id, data, deleted, seq FROM vnd_records
               WHERE seq > $1 AND (coll IN ('vozidla', 'ridici') OR (coll IN ('jizdy', 'tankovani') AND data->>'driverId' = $2))
               ORDER BY seq LIMIT ` + STRANKA, [since, String(rel.driverId)]);
  const dalsi = rows.length === STRANKA;
  let seq;
  if (dalsi) seq = Number(rows[rows.length - 1].seq);
  else { const m = await q('SELECT COALESCE(max(seq), 0) AS m FROM vnd_records', []); seq = Number(m[0].m); }
  const records = rows.map(r => ({
    coll: r.coll, id: r.id, deleted: r.deleted, seq: Number(r.seq),
    data: rel.role === 'owner' ? r.data : projekceProRidice(r.coll, r.data)
  }));
  return res.status(200).json({ seq, more: dalsi, records, me: { role: rel.role, driverId: rel.driverId, mustChangePin: rel.mustChange } });
}

async function ulozZmeny(req, res, q, rel) {
  const ops = req.body && req.body.ops;
  if (!Array.isArray(ops) || ops.length === 0) return res.status(400).json({ error: 'Chybí změny k uložení.' });
  if (ops.length > 60) return res.status(400).json({ error: 'Příliš mnoho změn najednou.' });
  const jeMajitel = rel.role === 'owner';

  // normalizace + základní kontrola
  const seznam = ops.map(o => ({
    coll: String(o && o.coll), id: String(o && o.id), del: !!(o && o.del),
    data: o && o.data, receipt: o ? o.receipt : undefined
  }));
  const vysledky = new Array(seznam.length);

  // načtení stávajících záznamů jedním dotazem (kvůli oprávněním a zachování financí / účtenek)
  const platne = seznam.filter(o => KOLEKCE.includes(o.coll) && o.id && o.id !== 'undefined');
  const existujici = new Map();
  if (platne.length) {
    const rows = await q(`SELECT coll, id, data, deleted FROM vnd_records
                          WHERE (coll, id) IN (SELECT c, i FROM unnest($1::text[], $2::text[]) AS t(c, i))`,
      [platne.map(o => o.coll), platne.map(o => o.id)]);
    rows.forEach(r => existujici.set(r.coll + ODDELOVAC + r.id, r));
  }

  for (let i = 0; i < seznam.length; i++) {
    const o = seznam[i];
    const chyba = (text) => { vysledky[i] = { coll: o.coll, id: o.id, ok: false, error: text }; };
    if (!KOLEKCE.includes(o.coll) || !o.id || o.id === 'undefined') { chyba('Neznámá kolekce nebo chybí id.'); continue; }
    const stary = existujici.get(o.coll + ODDELOVAC + o.id);
    const staryData = stary && !stary.deleted ? stary.data : null;

    if (!jeMajitel) {
      if (!RIDIC_PISE.includes(o.coll)) { chyba('Tuhle část smí upravovat jen majitel.'); continue; }
      if (staryData && String(staryData.driverId) !== String(rel.driverId)) { chyba('Cizí záznam.'); continue; }
    }

    try {
      if (o.del) {
        if (!stary) { vysledky[i] = { coll: o.coll, id: o.id, ok: true }; continue; }
        await q(`UPDATE vnd_records SET deleted = true,
                   data = CASE WHEN data ? 'driverId' THEN jsonb_build_object('driverId', data->'driverId') ELSE '{}'::jsonb END,
                   seq = nextval('vnd_rev'), updated_by = $3, updated_at = now()
                 WHERE coll = $1 AND id = $2`, [o.coll, o.id, rel.subject]);
        if (o.coll === 'ridici') await q('DELETE FROM vnd_access WHERE subject = $1', ['driver:' + o.id]);
        if (o.coll === 'tankovani') await q('DELETE FROM vnd_receipts WHERE tank_id = $1', [o.id]);
        vysledky[i] = { coll: o.coll, id: o.id, ok: true };
        continue;
      }

      if (!jeObjekt(o.data)) { chyba('Neplatná data záznamu.'); continue; }
      const data = { ...o.data };
      if (!jeMajitel && String(data.driverId) !== String(rel.driverId)) { chyba('Záznam musí patřit přihlášenému řidiči.'); continue; }
      if (o.coll === 'ridici') delete data.pin;                       // PINy se na serveru drží jen jako otisk
      if (o.coll === 'jizdy' && !jeMajitel) data.financni = staryData ? (staryData.financni || null) : null; // finance řidič nemění
      const nahrano = {};

      if (o.coll === 'tankovani') {
        delete data.uctenka;
        if (typeof o.receipt === 'string' && o.receipt.startsWith('data:image/')) {
          if (o.receipt.length > MAX_FOTKA) { chyba('Fotka účtenky je příliš velká.'); continue; }
          const r = await q(`INSERT INTO vnd_receipts (tank_id, data, ver) VALUES ($1, $2, nextval('vnd_rev'))
                             ON CONFLICT (tank_id) DO UPDATE SET data = EXCLUDED.data, ver = nextval('vnd_rev') RETURNING ver`, [o.id, o.receipt]);
          data.uctenka = `/api/receipt?id=${encodeURIComponent(o.id)}&v=${r[0].ver}`;
          nahrano.uctenka = data.uctenka;
        } else if (o.receipt === null) {
          await q('DELETE FROM vnd_receipts WHERE tank_id = $1', [o.id]);
          data.uctenka = null;
        } else {
          data.uctenka = staryData && staryData.uctenka ? staryData.uctenka : null;
        }
      }
      if (JSON.stringify(data).length > MAX_ZAZNAM) { chyba('Záznam je příliš velký.'); continue; }

      await q(`INSERT INTO vnd_records (coll, id, data, deleted, seq, updated_by) VALUES ($1, $2, $3::jsonb, false, nextval('vnd_rev'), $4)
               ON CONFLICT (coll, id) DO UPDATE SET data = EXCLUDED.data, deleted = false, seq = nextval('vnd_rev'),
                 updated_by = EXCLUDED.updated_by, updated_at = now()`, [o.coll, o.id, JSON.stringify(data), rel.subject]);
      vysledky[i] = { coll: o.coll, id: o.id, ok: true, ...nahrano };
    } catch (e) {
      console.error('sync op:', o.coll, o.id, e);
      chyba('Chyba serveru při ukládání.');
    }
  }
  const m = await q('SELECT COALESCE(max(seq), 0) AS m FROM vnd_records', []);
  return res.status(200).json({ seq: Number(m[0].m), results: vysledky });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const q = await db();
    const rel = await vyzadujRelaci(req, res, q);
    if (!rel) return;
    if (req.method === 'GET') return await ctiZmeny(req, res, q, rel);
    if (req.method === 'POST') return await ulozZmeny(req, res, q, rel);
    return res.status(405).json({ error: 'Metoda není povolená.' });
  } catch (e) {
    console.error('sync:', e);
    return res.status(500).json({ error: 'Chyba serveru při synchronizaci.' });
  }
};
