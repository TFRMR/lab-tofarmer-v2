// ===========================================================
// ToFarmer Foto Worker: perantara antara aplikasi, Cloudflare R2, dan Supabase.
//  - POST   /upload/<id-foto>   unggah foto baru (perlu sesi ToFarmer yang sah + kuota)
//  - GET    /f/<id>.<jpg|png|webp>  baca foto (publik, di-cache, CORS terbuka)
//  - DELETE /f/<id>.<ext>       hapus foto (hanya pemiliknya)
//  - cron   migrasi bertahap foto lama (base64 di Supabase) ke R2
//  - cron   backup bertahap ke penyimpanan kedua yang terpisah dari R2 (S3 API, mis. Backblaze B2)
// Rahasia (SUPABASE_SERVICE_KEY, BACKUP_KEY_ID, BACKUP_KEY_SECRET) hanya ada sebagai secret Worker.
// ===========================================================

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const RE_UUID = new RegExp('^' + UUID + '$', 'i');
const RE_BERKAS = new RegExp('^(' + UUID + ')\\.(jpg|png|webp)$', 'i');
const MAKS_BYTE = 3 * 1024 * 1024; // foto sudah dikecilkan aplikasi (sekitar 100-300 KB); batas ini hanya pengaman
const TIPE = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const CACHE = 'public, max-age=31536000, immutable';
const CRON_BACKUP = '*/10 * * * *'; // harus sama dengan wrangler.toml; cron lain = migrasi

// ---------- Utilitas umum ----------
function deteksiTipe(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}
function origins(env) { return String(env.ORIGIN_DIIZINKAN || 'https://tofarmer.xyz').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
function corsTulis(req, env) {
  const o = req.headers.get('Origin'), ok = o && (origins(env).indexOf(o) > -1 || origins(env).indexOf('*') > -1);
  return ok ? { 'Access-Control-Allow-Origin': o, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Tof-Id, X-Tof-Token', 'Access-Control-Max-Age': '86400' } : { 'Vary': 'Origin' };
}
function json(data, status, extra) { return new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {}) }); }
function basis(env, req) { return String(env.URL_PUBLIK || (req ? new URL(req.url).origin : '')).replace(/\/+$/, ''); }
function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
async function sha256hex(data) { return hex(await crypto.subtle.digest('SHA-256', data)); }

// ---------- Supabase (RPC) ----------
async function rpc(env, fn, body, kunci) {
  const r = await fetch(String(env.SUPABASE_URL).replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: kunci, Authorization: 'Bearer ' + kunci }, body: JSON.stringify(body || {}) });
  const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
  if (!r.ok) throw new Error('rpc ' + fn + ' ' + r.status + ': ' + (d && d.message ? d.message : String(t).slice(0, 200)));
  return d;
}
const srv = function (env, fn, body) { return rpc(env, fn, body, env.SUPABASE_SERVICE_KEY); };
const izin = function (env, id, token, jenis) { return rpc(env, 'foto_izin', { p_id: id, p_pin_hash: token, p_jenis: jenis }, env.SUPABASE_ANON_KEY); };

// ---------- Permintaan dari aplikasi ----------
async function layani(env, req, berkas) {
  const m = RE_BERKAS.exec(berkas); if (!m) return new Response('Tidak ditemukan', { status: 404 });
  const key = 'foto/' + m[1].toLowerCase() + '.' + m[2].toLowerCase();
  const h = { 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin', 'X-Content-Type-Options': 'nosniff' };
  const o = await env.BUCKET.get(key); if (!o) return new Response('Tidak ditemukan', { status: 404, headers: h });
  h['Content-Type'] = (o.httpMetadata && o.httpMetadata.contentType) || TIPE[m[2].toLowerCase()]; h['Cache-Control'] = CACHE; h['ETag'] = '"' + o.etag + '"';
  if (req.headers.get('If-None-Match') === h['ETag']) return new Response(null, { status: 304, headers: h });
  h['Content-Length'] = String(o.size);
  return new Response(req.method === 'HEAD' ? null : o.body, { status: 200, headers: h });
}
async function pemeriksa(env, req, jenis, cors) {
  const id = req.headers.get('X-Tof-Id'), tok = req.headers.get('X-Tof-Token');
  if (!id || !tok) return { err: json({ ok: false, galat: 'Sesi tidak ada' }, 401, cors) };
  let r; try { r = await izin(env, id, tok, jenis); } catch (e) { return { err: json({ ok: false, galat: 'Layanan sesi tidak tersedia' }, 503, cors) }; }
  if (!r || !r.ok) return { err: json({ ok: false, galat: r && r.alasan == 'kuota' ? 'Batas harian tercapai, coba lagi besok' : 'Sesi tidak sah' }, r && r.alasan == 'kuota' ? 429 : 401, cors) };
  return { id: id };
}
async function unggah(env, req, idFoto, cors) {
  if (!RE_UUID.test(idFoto)) return json({ ok: false, galat: 'ID foto tidak valid' }, 400, cors);
  const len = parseInt(req.headers.get('Content-Length') || '0', 10); if (len > MAKS_BYTE) return json({ ok: false, galat: 'Foto terlalu besar' }, 413, cors);
  const p = await pemeriksa(env, req, 'upload', cors); if (p.err) return p.err;
  const buf = await req.arrayBuffer(); if (!buf.byteLength) return json({ ok: false, galat: 'Berkas kosong' }, 400, cors); if (buf.byteLength > MAKS_BYTE) return json({ ok: false, galat: 'Foto terlalu besar' }, 413, cors);
  const bytes = new Uint8Array(buf), ext = deteksiTipe(bytes); if (!ext) return json({ ok: false, galat: 'Hanya JPEG, PNG, atau WebP' }, 415, cors);
  const dek = String(req.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase(); if (dek && dek !== TIPE[ext] && dek !== 'application/octet-stream') return json({ ok: false, galat: 'Tipe berkas tidak sesuai isinya' }, 415, cors);
  const nama = idFoto.toLowerCase() + '.' + ext, key = 'foto/' + nama, ada = await env.BUCKET.head(key);
  if (ada && ada.customMetadata && ada.customMetadata.owner && ada.customMetadata.owner !== p.id) return json({ ok: false, galat: 'ID foto sudah dipakai akun lain' }, 409, cors);
  await env.BUCKET.put(key, buf, { httpMetadata: { contentType: TIPE[ext], cacheControl: CACHE }, customMetadata: { owner: p.id, diunggah: new Date().toISOString() } });
  return json({ ok: true, url: basis(env, req) + '/f/' + nama, key: key, ukuran: buf.byteLength, tipe: TIPE[ext] }, 200, cors);
}
async function hapus(env, req, berkas, cors) {
  const m = RE_BERKAS.exec(berkas); if (!m) return json({ ok: false, galat: 'Nama berkas tidak valid' }, 400, cors);
  const p = await pemeriksa(env, req, 'hapus', cors); if (p.err) return p.err;
  const key = 'foto/' + m[1].toLowerCase() + '.' + m[2].toLowerCase(), o = await env.BUCKET.head(key); if (!o) return json({ ok: true, ada: false }, 200, cors);
  if (!o.customMetadata || o.customMetadata.owner !== p.id) return json({ ok: false, galat: 'Bukan milikmu' }, 403, cors);
  await env.BUCKET.delete(key); return json({ ok: true, ada: true }, 200, cors);
}

// ---------- Migrasi foto lama (base64 di Supabase) ke R2 ----------
function dataUrlKeByte(d) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(String(d || '')); if (!m) throw new Error('bukan data URL base64');
  const bin = atob(m[2]), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  const ext = deteksiTipe(b); if (!ext) throw new Error('isi bukan JPEG/PNG/WebP'); return { b: b, ext: ext };
}
async function migrasi(env) {
  if (!env.SUPABASE_SERVICE_KEY || !env.URL_PUBLIK) { console.warn('migrasi dilewati: SUPABASE_SERVICE_KEY atau URL_PUBLIK belum diatur'); return { dilewati: true }; }
  await srv(env, 'foto_migrasi_antre', {});
  const daftar = await srv(env, 'foto_migrasi_ambil', { p_n: parseInt(env.MIGRASI_BATCH || '3', 10) }) || [], hasil = { selesai: 0, gagal: 0 };
  for (const f of daftar) {
    try {
      const x = dataUrlKeByte(f.data), nama = String(f.foto_id).toLowerCase() + '.' + x.ext, key = 'foto/' + nama, url = basis(env) + '/f/' + nama;
      await env.BUCKET.put(key, x.b, { httpMetadata: { contentType: TIPE[x.ext], cacheControl: CACHE }, customMetadata: { owner: f.owner_id, diunggah: new Date().toISOString(), migrasi: '1' } });
      await srv(env, 'foto_migrasi_tandai', { p_foto_id: f.foto_id, p_status: 'uploaded', p_url: url });
      // verifikasi: ukuran, tipe, isi byte demi byte, dan akses lewat jalur publik yang sama dengan pembaca
      const h = await env.BUCKET.head(key); if (!h || h.size !== x.b.length || !h.httpMetadata || h.httpMetadata.contentType !== TIPE[x.ext]) throw new Error('verifikasi ukuran/tipe gagal');
      const resp = await layani(env, new Request(url), nama); if (resp.status !== 200) throw new Error('URL belum bisa diakses (' + resp.status + ')');
      const baca = new Uint8Array(await resp.arrayBuffer()); if (baca.length !== x.b.length) throw new Error('verifikasi isi gagal (ukuran)'); for (let i = 0; i < baca.length; i++) if (baca[i] !== x.b[i]) throw new Error('verifikasi isi gagal (byte berbeda)');
      await srv(env, 'foto_migrasi_tandai', { p_foto_id: f.foto_id, p_status: 'verified', p_url: url });
      await srv(env, 'foto_migrasi_selesai', { p_foto_id: f.foto_id, p_url: url }); hasil.selesai++;
    } catch (e) {
      hasil.gagal++; try { await srv(env, 'foto_migrasi_tandai', { p_foto_id: f.foto_id, p_status: 'pending', p_galat: String(e && e.message || e).slice(0, 300) }); } catch (x) {}
    }
  }
  return hasil;
}

// ---------- Backup ke penyimpanan kedua (S3 API, tanda tangan SigV4) ----------
async function hmac(kunci, data) { const k = await crypto.subtle.importKey('raw', kunci, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', k, typeof data === 'string' ? new TextEncoder().encode(data) : data)); }
async function firmaSigV4(o) {
  // o: { method, host, path, query, headers(huruf kecil, tanpa host), payloadHash, region, service, id, secret, amzDate }
  const tgl = o.amzDate.slice(0, 8), h = Object.assign({}, o.headers, { host: o.host, 'x-amz-date': o.amzDate }), nama = Object.keys(h).map(function (k) { return k.toLowerCase(); }).sort();
  const kanon = nama.map(function (k) { return k + ':' + String(h[k]).trim() + '\n'; }).join(''), tanda = nama.join(';');
  const req = [o.method, o.path, o.query || '', kanon, tanda, o.payloadHash].join('\n'), scope = tgl + '/' + o.region + '/' + o.service + '/aws4_request';
  const sts = ['AWS4-HMAC-SHA256', o.amzDate, scope, await sha256hex(new TextEncoder().encode(req))].join('\n');
  let k = await hmac(new TextEncoder().encode('AWS4' + o.secret), tgl); k = await hmac(k, o.region); k = await hmac(k, o.service); k = await hmac(k, 'aws4_request');
  const sig = hex(await hmac(k, sts));
  return { signature: sig, authorization: 'AWS4-HMAC-SHA256 Credential=' + o.id + '/' + scope + ', SignedHeaders=' + tanda + ', Signature=' + sig };
}
async function s3(env, method, key, body, tipe) {
  const ep = new URL(env.BACKUP_ENDPOINT), jalur = '/' + env.BACKUP_BUCKET + '/' + key.split('/').map(encodeURIComponent).join('/');
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''), payloadHash = body ? await sha256hex(body) : await sha256hex(new Uint8Array(0));
  const hd = { 'x-amz-content-sha256': payloadHash }; if (tipe) hd['content-type'] = tipe;
  const f = await firmaSigV4({ method: method, host: ep.host, path: jalur, query: '', headers: hd, payloadHash: payloadHash, region: env.BACKUP_REGION, service: 's3', id: env.BACKUP_KEY_ID, secret: env.BACKUP_KEY_SECRET, amzDate: amzDate });
  return fetch(ep.origin + jalur, { method: method, headers: Object.assign({}, hd, { 'x-amz-date': amzDate, Authorization: f.authorization }), body: body || undefined });
}
async function backup(env) {
  if (!env.SUPABASE_SERVICE_KEY || !env.BACKUP_ENDPOINT || !env.BACKUP_BUCKET || !env.BACKUP_REGION || !env.BACKUP_KEY_ID || !env.BACKUP_KEY_SECRET) { console.warn('backup dilewati: pengaturan penyimpanan kedua belum lengkap'); return { dilewati: true }; }
  const kursor = await srv(env, 'foto_backup_kursor', {}), dftr = await env.BUCKET.list({ prefix: 'foto/', cursor: kursor || undefined, limit: parseInt(env.BACKUP_BATCH || '8', 10) });
  const items = dftr.objects.map(function (o) { return { key: o.key, etag: o.etag, ukuran: o.size }; }), perlu = items.length ? await srv(env, 'foto_backup_cek', { p_items: items }) || [] : [];
  let disalin = 0, gagal = 0;
  for (const key of perlu) {
    const it = items.filter(function (x) { return x.key === key; })[0]; let ok = false;
    try {
      const o = await env.BUCKET.get(key); if (!o) continue; const buf = new Uint8Array(await o.arrayBuffer());
      const put = await s3(env, 'PUT', key, buf, (o.httpMetadata && o.httpMetadata.contentType) || 'application/octet-stream'); if (!put.ok) throw new Error('PUT ' + put.status);
      const head = await s3(env, 'HEAD', key); ok = head.ok && parseInt(head.headers.get('content-length') || '-1', 10) === buf.length;
    } catch (e) { ok = false; }
    try { await srv(env, 'foto_backup_catat', { p_key: key, p_ukuran: it.ukuran, p_etag: it.etag, p_ok: ok }); } catch (e) { ok = false; }
    if (ok) disalin++; else gagal++;
  }
  await srv(env, 'foto_backup_batch_selesai', { p_kursor: dftr.truncated ? dftr.cursor : '', p_diperiksa: items.length, p_disalin: disalin, p_gagal: gagal });
  return { diperiksa: items.length, disalin: disalin, gagal: gagal };
}

export { firmaSigV4, deteksiTipe, migrasi, backup };
export default {
  async fetch(req, env) {
    const u = new URL(req.url), cors = corsTulis(req, env);
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      let m;
      if ((m = /^\/f\/([^/]+)$/.exec(u.pathname))) {
        if (req.method === 'GET' || req.method === 'HEAD') return layani(env, req, m[1]);
        if (req.method === 'DELETE') return hapus(env, req, m[1], cors);
      }
      if ((m = /^\/upload\/([^/]+)$/.exec(u.pathname)) && req.method === 'POST') return unggah(env, req, m[1], cors);
      if (u.pathname === '/') return new Response('tof-foto ok', { headers: { 'Content-Type': 'text/plain' } });
      return new Response('Tidak ditemukan', { status: 404 });
    } catch (e) { console.error('galat', e && e.message); return json({ ok: false, galat: 'Galat server' }, 500, cors); }
  },
  async scheduled(event, env, ctx) {
    const tugas = event.cron === CRON_BACKUP ? backup(env) : migrasi(env);
    ctx.waitUntil(tugas.then(function (h) { console.log(event.cron === CRON_BACKUP ? 'backup' : 'migrasi', JSON.stringify(h)); }, function (e) { console.error('tugas gagal', e && e.message); }));
  }
};
