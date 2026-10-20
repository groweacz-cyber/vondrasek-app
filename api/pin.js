// POST /api/pin  { target: 'owner' | '<id řidiče>', pin: '1234' }   (jen majitel)
const { db } = require('./_lib/db');
const { vyzadujRelaci, otisk, novyToken, nastavCookie } = require('./_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metoda není povolená.' });
  try {
    const q = await db();
    const rel = await vyzadujRelaci(req, res, q);
    if (!rel) return;
    if (rel.role !== 'owner') return res.status(403).json({ error: 'PIN může měnit jen majitel.' });

    const { target, pin } = req.body || {};
    if (!/^\d{4}$/.test(String(pin || ''))) return res.status(400).json({ error: 'PIN musí mít přesně 4 číslice.' });
    if (typeof target !== 'string' || !target) return res.status(400).json({ error: 'Chybí komu se PIN mění.' });
    const subject = target === 'owner' ? 'owner' : 'driver:' + target;

    try {
      const rows = await q(
        `INSERT INTO vnd_access (subject, pin_fp, ver, must_change) VALUES ($1, $2, 1, false)
         ON CONFLICT (subject) DO UPDATE SET pin_fp = EXCLUDED.pin_fp, ver = vnd_access.ver + 1, must_change = false, updated_at = now()
         RETURNING ver`, [subject, otisk(String(pin))]);
      const out = { ok: true };
      if (subject === rel.subject) {          // majitel si změnil vlastní PIN -> dostane novou relaci
        out.token = novyToken({ subject, role: 'owner', driverId: null, ver: rows[0].ver });
        nastavCookie(req, res, out.token);
      }
      return res.status(200).json(out);
    } catch (e) {
      if (e && (e.code === '23505' || /unique|duplicate/i.test(String(e.message)))) {
        return res.status(409).json({ error: 'Tento PIN už používá někdo jiný — zvol jiný.' });
      }
      throw e;
    }
  } catch (e) {
    console.error('pin:', e);
    return res.status(500).json({ error: 'Chyba serveru při změně PINu.' });
  }
};
