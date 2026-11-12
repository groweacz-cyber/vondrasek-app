// POST /api/profil  { malaDoprava?: bool, velkaDoprava?: bool }  (řidič / vedoucí dopravy — jen svoje zařazení)
// Řidič jinak do záznamu řidiče psát nesmí (kontakty, karty, PIN…), tady smí změnit jen tyhle dva příznaky u sebe.
const { db } = require('./_lib/db');
const { vyzadujRelaci } = require('./_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metoda není povolená.' });
  try {
    const q = await db();
    const rel = await vyzadujRelaci(req, res, q);
    if (!rel) return;
    if ((rel.role !== 'driver' && rel.role !== 'dispecer') || rel.driverId == null) {
      return res.status(403).json({ error: 'Zařazení si tady mění jen řidič; majitel to dělá v Řidičích.' });
    }
    const body = req.body || {};
    const zmena = {};
    ['malaDoprava', 'velkaDoprava'].forEach(k => { if (typeof body[k] === 'boolean') zmena[k] = body[k]; });
    if (!Object.keys(zmena).length) return res.status(400).json({ error: 'Chybí, co se má změnit.' });
    const rows = await q(
      `UPDATE vnd_records SET data = data || $2::jsonb, seq = nextval('vnd_rev'), updated_by = $3, updated_at = now()
       WHERE coll = 'ridici' AND id = $1 AND deleted = false RETURNING data`,
      [String(rel.driverId), JSON.stringify(zmena), rel.subject]);
    if (!rows.length) return res.status(404).json({ error: 'Řidič nenalezen.' });
    return res.status(200).json({ ok: true, malaDoprava: !!rows[0].data.malaDoprava, velkaDoprava: !!rows[0].data.velkaDoprava });
  } catch (e) {
    console.error('profil:', e);
    return res.status(500).json({ error: 'Chyba serveru při uložení zařazení.' });
  }
};
