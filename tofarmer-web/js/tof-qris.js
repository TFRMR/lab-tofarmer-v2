// ===========================================================
// tof-qris.js: mengubah QRIS statis menjadi QRIS dinamis (nominal sudah tertanam di kode QR).
// Standar EMV QR / QRIS: tag 01 "11" (statis) menjadi "12" (dinamis), tag 54 berisi nominal,
// dan CRC16 (tag 63) dihitung ulang. Tidak memakai pustaka luar. Dipakai di browser dan di Node.
//
// Pemakaian:
//   var kode = TofQris.dinamis(QRIS_STATIS, 50000);                 // teks yang dijadikan gambar QR
//   var kode = TofQris.dinamis(QRIS_STATIS, 50000, { referensi: 'NBG123' });   // + label referensi (opsional)
//   TofQris.info(QRIS_STATIS)   -> { valid, statis, nama, kota, nominal }
//   TofQris.valid(teks)         -> true/false (struktur dan CRC)
//   TofQris.bernominal(srcGambarQris, 50000) -> Promise<{ kode, gambar(PNG data URL), info }>   (browser: baca QR dari gambar lalu buat QR bernominal)
//   TofQris.periksaGambar(src)  -> Promise<info>   (browser: untuk halaman admin)
// ===========================================================
(function (root) {
  'use strict';

  // CRC-16/CCITT-FALSE (poli 0x1021, awal 0xFFFF), seperti yang dipakai QRIS
  function crc16(s) {
    var crc = 0xFFFF;
    for (var i = 0; i < s.length; i++) {
      crc ^= (s.charCodeAt(i) & 0xFF) << 8;
      for (var b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return ('0000' + crc.toString(16).toUpperCase()).slice(-4);
  }

  function parse(p) {
    var out = [], i = 0; p = String(p);
    while (i < p.length) {
      var tag = p.substr(i, 2), pj = p.substr(i + 2, 2);
      if (i + 4 > p.length || !/^\d{2}$/.test(tag) || !/^\d{2}$/.test(pj)) throw new Error('Format QRIS tidak sah');
      var len = parseInt(pj, 10), val = p.substr(i + 4, len);
      if (val.length !== len) throw new Error('Panjang data QRIS tidak cocok');
      out.push({ tag: tag, val: val }); i += 4 + len;
    }
    return out;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function build(l) { return l.map(function (x) { if (x.val.length > 99) throw new Error('Isi tag ' + x.tag + ' terlalu panjang'); return x.tag + pad2(x.val.length) + x.val; }).join(''); }
  function posisi(l, tag) { var t = parseInt(tag, 10); for (var i = 0; i < l.length; i++) if (parseInt(l[i].tag, 10) > t) return i; return l.length; }

  function valid(p) {
    try {
      p = String(p).trim(); var l = parse(p), z = l[l.length - 1];
      return !!z && z.tag === '63' && z.val.length === 4 && z.val.toUpperCase() === crc16(p.slice(0, -4)) && l.some(function (x) { return x.tag === '00'; });
    } catch (e) { return false; }
  }

  function info(p) {
    p = String(p || '').trim(); var r = { valid: valid(p), statis: null, nama: '', kota: '', nominal: null };
    if (!r.valid) return r;
    parse(p).forEach(function (x) { if (x.tag === '01') r.statis = x.val === '11'; if (x.tag === '59') r.nama = x.val; if (x.tag === '60') r.kota = x.val; if (x.tag === '54') r.nominal = parseInt(x.val, 10); });
    return r;
  }

  // QRIS (statis atau dinamis) -> QRIS dinamis dengan nominal tertentu (rupiah bulat)
  function dinamis(p, nominal, o) {
    o = o || {}; p = String(p || '').trim();
    if (!valid(p)) throw new Error('QRIS sumber tidak sah (struktur atau CRC tidak cocok)');
    var n = Math.round(Number(nominal));
    if (!isFinite(n) || n < 1 || n > 999999999999) throw new Error('Nominal tidak valid');
    var l = parse(p).filter(function (x) { return x.tag !== '63' && x.tag !== '54'; }), ada01 = false;
    l.forEach(function (x) { if (x.tag === '01') { x.val = '12'; ada01 = true; } });
    if (!ada01) throw new Error('QRIS sumber tidak punya tag 01');
    l.splice(posisi(l, '54'), 0, { tag: '54', val: String(n) });
    var ref = o.referensi ? String(o.referensi).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) : '';
    if (ref) {
      var t62 = l.filter(function (x) { return x.tag === '62'; })[0], subs = t62 ? parse(t62.val).filter(function (s) { return s.tag !== '05'; }) : [];
      subs.push({ tag: '05', val: ref }); subs.sort(function (a, b) { return a.tag < b.tag ? -1 : 1; });
      if (t62) t62.val = build(subs); else l.splice(posisi(l, '62'), 0, { tag: '62', val: build(subs) });
    }
    var tanpaCrc = build(l) + '6304';
    return tanpaCrc + crc16(tanpaCrc);
  }

  // ---------- Bagian browser: membaca QRIS dari gambar dan menggambar QR bernominal ----------
  // Pustaka pembaca QR (jsQR) dan pembuat QR (qrcode-generator) dimuat sekali dari CDN saat dibutuhkan.
  var CDN_JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
  var CDN_QR = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  function muat(src, ada) {
    return new Promise(function (res, rej) {
      if (ada()) return res();
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Gagal memuat ' + src)); }; document.head.appendChild(s);
    });
  }
  var siap = null;
  function siapkan() {
    if (!siap) siap = Promise.all([muat(CDN_JSQR, function () { return typeof root.jsQR === 'function'; }), muat(CDN_QR, function () { return typeof root.qrcode === 'function'; })]).then(function () {}, function (e) { siap = null; throw e; });
    return siap;
  }
  var cachePayload = {};
  function payloadDariGambar(src) {
    src = String(src); var k = src.length + ':' + src.slice(-40);
    if (cachePayload[k]) return Promise.resolve(cachePayload[k]);
    return siapkan().then(function () {
      return new Promise(function (res, rej) {
        var im = new Image();
        im.onload = function () {
          try {
            var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
            var g = c.getContext('2d'); g.drawImage(im, 0, 0);
            var d = g.getImageData(0, 0, c.width, c.height), r = root.jsQR(d.data, d.width, d.height);
            if (!r) return rej(new Error('QR tidak terbaca di gambar'));
            if (!valid(r.data)) return rej(new Error('QR terbaca, tetapi bukan QRIS yang sah'));
            cachePayload[k] = r.data; res(r.data);
          } catch (e) { rej(e); }
        };
        im.onerror = function () { rej(new Error('Gambar QRIS tidak bisa dibuka')); };
        im.src = src;
      });
    });
  }
  function gambarQr(teks, sel) {
    var q = root.qrcode(0, 'M'); q.addData(teks); q.make();
    var n = q.getModuleCount(), cell = sel || 10, margin = 4, size = (n + margin * 2) * cell, c = document.createElement('canvas');
    c.width = c.height = size; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var col = 0; col < n; col++) if (q.isDark(r, col)) g.fillRect((col + margin) * cell, (r + margin) * cell, cell, cell);
    return c.toDataURL('image/png');
  }
  // Gambar QRIS statis -> { kode, gambar, info } QRIS bernominal. Gagal apa pun = galat; pemanggil kembali memakai gambar statis.
  function bernominal(srcGambar, nominal, o) {
    return payloadDariGambar(srcGambar).then(function (p) {
      var inf = info(p); if (!inf.statis) throw new Error('QRIS sumber bukan QRIS statis, tidak diubah');
      var kode = dinamis(p, nominal, o); return { kode: kode, gambar: gambarQr(kode), info: inf };
    });
  }
  // Untuk halaman admin: periksa sebuah gambar QRIS (apakah terbaca dan bisa dijadikan bernominal)
  function periksaGambar(src) {
    return payloadDariGambar(src).then(function (p) { var i = info(p); i.bisaBernominal = !!i.statis; return i; });
  }

  var api = { crc16: crc16, parse: parse, build: build, valid: valid, info: info, dinamis: dinamis, siapkan: siapkan, payloadDariGambar: payloadDariGambar, gambarQr: gambarQr, bernominal: bernominal, periksaGambar: periksaGambar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TofQris = api;
})(typeof window !== 'undefined' ? window : this);
