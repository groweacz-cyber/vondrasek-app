// POST /api/asistentka  { messages: [{role, content}], novinky?: [text] }  (jen majitel)  ->  { reply }
// AI asistentka radí majiteli se systémem. Model běží přes Groq (stejný klíč GROQ_API_KEY jako chat na growea.eu).
const { db } = require('./_lib/db');
const { vyzadujRelaci } = require('./_lib/auth');
const { ZNALOSTI } = require('./_lib/znalosti');

const MODEL = 'openai/gpt-oss-120b';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metoda není povolená.' });
  try {
    const q = await db();
    const rel = await vyzadujRelaci(req, res, q);
    if (!rel) return;
    if (rel.role !== 'owner') return res.status(403).json({ error: 'Asistentka je jen pro majitele.' });
    if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Asistentka ještě není zapnutá — ve Vercelu chybí proměnná GROQ_API_KEY.' });

    const body = req.body || {};
    const zpravy = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-10).map(m => ({ role: m.role, content: m.content.slice(0, 1500) }));
    if (!zpravy.length || zpravy[zpravy.length - 1].role !== 'user') return res.status(400).json({ error: 'Chybí dotaz.' });

    const novinky = (Array.isArray(body.novinky) ? body.novinky : []).filter(x => typeof x === 'string').slice(0, 30).map(x => '- ' + x.slice(0, 300));
    const system = ZNALOSTI + (novinky.length ? '\n== POSLEDNÍ ZMĚNY V SYSTÉMU (od nejnovější) ==\n' + novinky.join('\n') + '\n' : '');

    const odp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_completion_tokens: 1500, reasoning_effort: 'low', temperature: 0.3, messages: [{ role: 'system', content: system }, ...zpravy] })
    });
    const data = await odp.json().catch(() => ({}));
    if (!odp.ok) {
      console.error('asistentka groq:', odp.status, JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: odp.status === 429 ? 'Asistentka má teď moc dotazů, zkus to za minutu.' : 'Asistentka se teď nemůže ozvat, zkus to znovu.' });
    }
    const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!reply) return res.status(502).json({ error: 'Asistentka neodpověděla, zkus to znovu.' });
    return res.status(200).json({ reply });
  } catch (e) {
    console.error('asistentka:', e);
    return res.status(500).json({ error: 'Chyba serveru u asistentky.' });
  }
};
