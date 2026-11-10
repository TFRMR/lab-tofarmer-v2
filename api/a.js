// Vercel Serverless Function — kartu pratinjau (judul + kutipan + gambar) saat tautan artikel dibagikan ke WhatsApp/medsos.
// Pembaca bot membaca tag og:*; pengunjung manusia langsung dialihkan ke halaman artikel.
// Dipanggil lewat rewrite di vercel.json:  /a/:slug  ->  /api/a?slug=:slug
const SUPABASE_URL = 'https://afpzddwuikvwsedzgsee.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmcHpkZHd1aWt2d3NlZHpnc2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNTExNjEsImV4cCI6MjA5NDcyNzE2MX0.O_IezV8HpBjuZndnXosifts-jS7NnV4VtidyIX1KMHY';
const HALAMAN_ARTIKEL = '/html/artikel.html';       // lokasi artikel.html di situsmu
const GAMBAR_CADANGAN = '/aset/apple-touch-icon.png'; // dipakai bila artikel tak punya gambar sampul
const NAMA_SITUS = 'Warta Menoreh — ToFarmer';

const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = async (req, res) => {
  const slug = String((req.query && req.query.slug) || '');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 120) { res.redirect(302, HALAMAN_ARTIKEL); return; }

  let a = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/artikel?select=judul,ringkasan,gambar,isi&slug=eq.${slug}&terbit=eq.true&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } });
    const j = await r.json();
    a = Array.isArray(j) && j[0] ? j[0] : null;
  } catch (e) { /* jatuh ke pengalihan biasa */ }
  if (!a) { res.redirect(302, HALAMAN_ARTIKEL); return; }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = 'https://' + host;
  const polos = (a.ringkasan || String(a.isi || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  const kutipan = polos.length > 160 ? polos.slice(0, 160).replace(/\s+\S*$/, '') + '…' : polos;
  const gambar = /^https:\/\//i.test(a.gambar || '') ? a.gambar : origin + GAMBAR_CADANGAN;
  const tujuan = `${HALAMAN_ARTIKEL}?a=${encodeURIComponent(slug)}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(200).send(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<title>${esc(a.judul)} — ${esc(NAMA_SITUS)}</title>
<meta name="description" content="${esc(kutipan)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="${esc(NAMA_SITUS)}">
<meta property="og:title" content="${esc(a.judul)}"><meta property="og:description" content="${esc(kutipan)}">
<meta property="og:image" content="${esc(gambar)}"><meta property="og:url" content="${esc(origin + '/a/' + slug)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(a.judul)}">
<meta name="twitter:description" content="${esc(kutipan)}"><meta name="twitter:image" content="${esc(gambar)}">
<meta http-equiv="refresh" content="0;url=${esc(tujuan)}">
<script>location.replace(${JSON.stringify(tujuan)});</script></head>
<body><p><a href="${esc(tujuan)}">Buka artikel: ${esc(a.judul)}</a></p></body></html>`);
};
