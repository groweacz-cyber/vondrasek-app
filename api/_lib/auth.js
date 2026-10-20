// Přihlašování: PIN se na serveru ukládá jen jako HMAC otisk (s tajným "pepřem"), relace je podepsaný token.
const crypto = require('crypto');

const TTL_MS = 30 * 24 * 3600 * 1000; // relace platí 30 dní (řidiči se přihlašují jednou na telefonu)

function tajemstvi() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 24) throw new Error('SESSION_SECRET není nastavený (min. 24 znaků).');
  return s;
}
const b64u = (buf) => Buffer.from(buf).toString('base64url');

function podepis(payload) {
  const telo = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', tajemstvi()).update(telo).digest('base64url');
  return telo + '.' + sig;
}

function overToken(token) {
  if (typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [telo, sig] = token.split('.');
  const ocekavany = crypto.createHmac('sha256', tajemstvi()).update(telo).digest();
  let dodany;
  try { dodany = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (dodany.length !== ocekavany.length || !crypto.timingSafeEqual(dodany, ocekavany)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(telo, 'base64url').toString('utf8')); } catch { return null; }
  if (!p || typeof p.e !== 'number' || p.e < Date.now()) return null;
  return p;
}

// Otisk PINu pro vyhledání (PIN je jedinečný napříč uživateli) — bez znalosti pepře ho z databáze nelze obnovit.
function otisk(pin) {
  const pepper = process.env.PIN_PEPPER || tajemstvi();
  return crypto.createHmac('sha256', pepper).update('pin:' + pin).digest('hex');
}

function novyToken({ subject, role, driverId, ver }) {
  return podepis({ s: subject, r: role, d: driverId || null, v: ver, e: Date.now() + TTL_MS });
}

function cookie(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

function nastavCookie(req, res, token) {
  const host = String(req.headers.host || '');
  const lokalne = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const maxAge = Math.floor(TTL_MS / 1000);
  res.setHeader('Set-Cookie', `vnd=${encodeURIComponent(token)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${lokalne ? '' : '; Secure'}`);
}

function ipKlienta(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || (req.socket && req.socket.remoteAddress) || 'neznama';
}

// Vrátí relaci {subject, role, driverId, ver, mustChange} nebo odpoví 401 a vrátí null.
// Cookie s relací se přijímá jen tam, kde to výslovně povolíme (načítání fotek účtenek přes <img>) — ostatní volání jdou přes hlavičku Authorization (ochrana proti CSRF).
async function vyzadujRelaci(req, res, q, { povolCookie = false } = {}) {
  const hlavicka = String(req.headers.authorization || '');
  const token = hlavicka.startsWith('Bearer ') ? hlavicka.slice(7) : (povolCookie ? cookie(req).vnd : undefined);
  const p = overToken(token);
  if (!p) { res.status(401).json({ error: 'Přihlášení vypršelo — přihlas se znovu.' }); return null; }
  const rows = await q('SELECT ver, must_change FROM vnd_access WHERE subject = $1', [p.s]);
  if (!rows.length || rows[0].ver !== p.v) { res.status(401).json({ error: 'Přihlášení už neplatí — přihlas se znovu.' }); return null; }
  return { subject: p.s, role: p.r, driverId: p.d, ver: p.v, mustChange: !!rows[0].must_change };
}

// ---------- Ochrana PINu proti hádání ----------
const LIMIT_SELHANI = 5;
async function zkontrolujZamek(q, klic) {
  const rows = await q('SELECT fails, locked_until FROM vnd_attempts WHERE key = $1', [klic]);
  if (rows.length && rows[0].locked_until && new Date(rows[0].locked_until) > new Date()) {
    return Math.ceil((new Date(rows[0].locked_until) - new Date()) / 1000);
  }
  return 0;
}
async function zapisSelhani(q, klic) {
  // 5. selhání = zámek 5 min, dál se prodlužuje (10 min, 20 min … max 60 min)
  await q(`INSERT INTO vnd_attempts (key, fails, locked_until, updated_at) VALUES ($1, 1, NULL, now())
           ON CONFLICT (key) DO UPDATE SET
             fails = CASE WHEN vnd_attempts.updated_at < now() - interval '1 hour' AND (vnd_attempts.locked_until IS NULL OR vnd_attempts.locked_until < now()) THEN 1 ELSE vnd_attempts.fails + 1 END,
             updated_at = now()`, [klic]);
  const rows = await q('SELECT fails FROM vnd_attempts WHERE key = $1', [klic]);
  const fails = rows[0].fails;
  if (fails >= LIMIT_SELHANI && fails % LIMIT_SELHANI === 0) {
    const minut = Math.min(60, 5 * Math.pow(2, Math.floor(fails / LIMIT_SELHANI) - 1));
    await q(`UPDATE vnd_attempts SET locked_until = now() + ($2 || ' minutes')::interval WHERE key = $1`, [klic, String(minut)]);
  }
}
async function smazSelhani(q, klic) { await q('DELETE FROM vnd_attempts WHERE key = $1', [klic]); }

module.exports = { novyToken, overToken, otisk, vyzadujRelaci, nastavCookie, ipKlienta, zkontrolujZamek, zapisSelhani, smazSelhani, cookie };
