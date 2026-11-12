// POST /api/hlas  { text }  (jen majitel)  ->  audio/mpeg
// Čtení odpovědí asistentky ženským českým hlasem (Microsoft neuronový hlas Vlasta), funguje v každém prohlížeči.
const { db } = require('./_lib/db');
const { vyzadujRelaci } = require('./_lib/auth');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const HLAS = 'cs-CZ-VlastaNeural';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metoda není povolená.' });
  try {
    const q = await db();
    const rel = await vyzadujRelaci(req, res, q);
    if (!rel) return;
    if (rel.role !== 'owner') return res.status(403).json({ error: 'Hlas je jen pro majitele.' });
    const text = String((req.body && req.body.text) || '').replace(/\s+/g, ' ').trim().slice(0, 1100);
    if (!text) return res.status(400).json({ error: 'Chybí text.' });

    const tts = new MsEdgeTTS();
    await tts.setMetadata(HLAS, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(text);
    const kousky = [];
    await new Promise((ok, chyba) => {
      const casovac = setTimeout(() => chyba(new Error('timeout')), 15000);
      audioStream.on('data', c => kousky.push(c));
      audioStream.on('end', () => { clearTimeout(casovac); ok(); });
      audioStream.on('error', e => { clearTimeout(casovac); chyba(e); });
    });
    const audio = Buffer.concat(kousky);
    if (!audio.length) return res.status(502).json({ error: 'Hlas se nepodařilo vytvořit.' });
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(audio);
  } catch (e) {
    console.error('hlas:', e && e.message);
    return res.status(502).json({ error: 'Hlas se teď nepodařilo vytvořit.' });
  }
};
