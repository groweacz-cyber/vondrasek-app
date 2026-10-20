// POST /api/login  { role: 'owner' | 'driver', pin: '1234' }  ->  { token, role, driverId, driverName, mustChangePin }
const { db } = require('./_lib/db');
const { novyToken, otisk, nastavCookie, ipKlienta, zkontrolujZamek, zapisSelhani, smazSelhani } = require('./_lib/auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metoda není povolená.' });
  try {
    const { role, pin } = req.body || {};
    if ((role !== 'owner' && role !== 'driver') || !/^\d{4}$/.test(String(pin || ''))) {
      return res.status(400).json({ error: 'Zadej čtyřmístný PIN.' });
    }
    const q = await db();
    const klic = 'ip:' + ipKlienta(req);
    const zbyva = await zkontrolujZamek(q, klic);
    if (zbyva > 0) {
      res.setHeader('Retry-After', String(zbyva));
      return res.status(429).json({ error: `Příliš mnoho pokusů — zkus to znovu za ${Math.ceil(zbyva / 60)} min.` });
    }

    const rows = await q('SELECT subject, ver, must_change FROM vnd_access WHERE pin_fp = $1', [otisk(String(pin))]);
    let uzivatel = rows[0] || null;
    if (uzivatel) {
      const jeMajitel = uzivatel.subject === 'owner';
      if ((role === 'owner') !== jeMajitel) uzivatel = null; // PIN řidiče nesmí otevřít majitele a naopak
    }
    let ridic = null;
    if (uzivatel && role === 'driver') {
      const id = uzivatel.subject.slice('driver:'.length);
      const zaznam = await q(`SELECT data FROM vnd_records WHERE coll = 'ridici' AND id = $1 AND deleted = false`, [id]);
      if (zaznam.length) ridic = { id, jmeno: zaznam[0].data.jmeno }; else uzivatel = null; // řidič už neexistuje
    }
    if (!uzivatel) {
      await zapisSelhani(q, klic);
      return res.status(401).json({ error: 'PIN nebyl rozpoznán.' });
    }

    await smazSelhani(q, klic);
    const token = novyToken({ subject: uzivatel.subject, role, driverId: ridic ? ridic.id : null, ver: uzivatel.ver });
    nastavCookie(req, res, token);
    return res.status(200).json({
      token, role,
      driverId: ridic ? (isNaN(+ridic.id) ? ridic.id : +ridic.id) : null,
      driverName: ridic ? ridic.jmeno : null,
      mustChangePin: !!uzivatel.must_change
    });
  } catch (e) {
    console.error('login:', e);
    return res.status(500).json({ error: 'Chyba serveru při přihlášení.' });
  }
};
