// POST /api/logout — smaže cookie s relací (fotky účtenek po odhlášení nejdou načíst)
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', 'vnd=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0');
  return res.status(200).json({ ok: true });
};
