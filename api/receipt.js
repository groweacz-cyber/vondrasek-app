// GET /api/receipt?id=<id tankování>  — fotka účtenky (majitel všechny, řidič jen svoje)
const { db } = require('./_lib/db');
const { vyzadujRelaci } = require('./_lib/auth');

module.exports = async (req, res) => {
  try {
    const q = await db();
    const rel = await vyzadujRelaci(req, res, q, { povolCookie: true });
    if (!rel) return;
    const id = String((req.query && req.query.id) || '');
    if (!id) return res.status(400).json({ error: 'Chybí id.' });
    if (rel.role !== 'owner') {
      const z = await q(`SELECT data FROM vnd_records WHERE coll = 'tankovani' AND id = $1 AND deleted = false`, [id]);
      if (!z.length || String(z[0].data.driverId) !== String(rel.driverId)) return res.status(403).json({ error: 'Nemáš přístup.' });
    }
    const rows = await q('SELECT data FROM vnd_receipts WHERE tank_id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Účtenka neexistuje.' });
    const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/s.exec(rows[0].data);
    if (!m) return res.status(500).json({ error: 'Poškozená účtenka.' });
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable'); // adresa nese verzi (?v=), takže je bezpečné cachovat
    return res.status(200).send(Buffer.from(m[2], 'base64'));
  } catch (e) {
    console.error('receipt:', e);
    return res.status(500).json({ error: 'Chyba serveru.' });
  }
};
