/* =====================================================================
   kebun-scene.js  --  Pemandangan "Kebun Saya" (Canvas 2D, tanpa dependensi)

   PRINSIP RINGAN
   - Semua gambar dibuat/diambil SEKALI jadi sprite (kanvas kecil), lalu hanya
     ditempel (drawImage). Tidak ada filter, bayangan, atau gradasi per frame.
   - Langit + bukit dan tanah/rumput adalah 2 lapisan statis; per frame hanya
     menempel 2 lapisan itu + puluhan sprite dinamis.
   - Animasi ambien 30 fps (15 fps di Mode Hemat), berhenti otomatis saat
     tab tidak terlihat atau layar kebun ditutup.

   GAMBAR SEMENTARA vs KARYA SENIMAN
   - Semua sprite punya NAMA (lihat daftar DEF di bawah). Bila folder aset
     berisi manifest.json yang memuat nama itu, gambar karya seniman dipakai;
     kalau tidak, gambar sementara buatan kode dipakai. Jadi seni bisa
     ditambahkan satu per satu sambil game tetap jalan.
   - Format manifest.json: lihat panduan-aset-kebun.md.

   API
     var scene = KebunScene.create({
        container,            // elemen pembungkus (position:relative/absolute)
        eventEl,              // elemen penerima klik (opsional)
        getFieldRect,         // () => {x,y,w,h} area kebun dalam px container
        coinTarget,           // () => {x,y} tujuan koin (bar XP), px container
        assetBase,            // mis. 'aset/kebun/' (opsional)
        onSelect(key), onBeringin(), onCoin(),
        debug, hemat, hourOverride
     });
     scene.setPlots([{key,number,state,growth,ready,badge,nursery}])
     scene.setSelected(key);  scene.setBeringinHealth(pct)
     scene.fx(key, 'water'|'fert'|'plant'|'claim'|'harvest', {text})
     scene.resize(); scene.start(); scene.stop(); scene.destroy()
   ===================================================================== */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rngOf(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hex(c) {
    var n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(c1, c2, t) {
    var a = hex(c1), b = hex(c2);
    return 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ')';
  }

  /* ------------------------------------------------------------------
     GAMBAR SEMENTARA (vektor, dirender sekali jadi sprite)
     Koordinat gambar: lebar = 100 satuan; tinggi = 100 * aspek.
     ------------------------------------------------------------------ */
  function poly(g, pts, fill, stroke, lw) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
  }
  function ell(g, cx, cy, rx, ry, fill, rot) {
    g.beginPath(); g.ellipse(cx, cy, rx, ry, rot || 0, 0, TAU); g.fillStyle = fill; g.fill();
  }
  function lin(g, x0, y0, x1, y1, stops) {
    var gr = g.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
    return gr;
  }
  function leaf(g, x, y, s, rot, c1, c2) {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(-s * 0.95, -s * 0.15, -s * 0.9, -s * 1.25, 0, -s * 0.95);
    g.bezierCurveTo(s * 0.9, -s * 1.25, s * 0.95, -s * 0.15, 0, 0);
    g.fillStyle = lin(g, 0, 0, 0, -s, [0, c1, 1, c2]); g.fill();
    g.strokeStyle = 'rgba(20,70,25,0.45)'; g.lineWidth = Math.max(0.5, s * 0.07);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -s * 0.8); g.stroke();
    g.restore();
  }

  function drawGrass(g, v) {
    var r = rngOf(100 + v * 17);
    var base = lin(g, 0, 0, 0, 50, [0, v ? '#74b87c' : '#6cb078', 1, v ? '#4b9762' : '#448e5b']);
    poly(g, [[50, -0.6], [100.6, 25], [50, 50.6], [-0.6, 25]], base);
    var i, x, y;
    for (i = 0; i < 7; i++) {
      x = 14 + r() * 72; y = 8 + r() * 34;
      if (Math.abs(x - 50) / 50 + Math.abs(y - 25) / 25 > 0.8) continue;
      ell(g, x, y, 6 + r() * 6, 2.5 + r() * 2, r() > 0.5 ? 'rgba(220,255,225,0.07)' : 'rgba(8,60,50,0.11)');
    }
    g.lineCap = 'round';
    for (i = 0; i < 16; i++) {
      x = 10 + r() * 80; y = 6 + r() * 38;
      if (Math.abs(x - 50) / 50 + Math.abs(y - 25) / 25 > 0.86) continue;
      g.strokeStyle = r() > 0.5 ? 'rgba(14,78,58,0.55)' : 'rgba(200,245,212,0.24)'; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 2.5); g.stroke();
    }
    if (v) {
      var cols = ['#ffffff', '#ffe066', '#ffb3c7'];
      for (i = 0; i < 4; i++) {
        x = 22 + r() * 56; y = 14 + r() * 22;
        if (Math.abs(x - 50) / 50 + Math.abs(y - 25) / 25 > 0.7) continue;
        ell(g, x, y, 1.5, 1.2, cols[i % 3]);
      }
    }
  }

  function drawBed(g, barren) {
    var t = 7;
    poly(g, [[4, 25], [50, 48], [50, 48 + t], [4, 25 + t]], lin(g, 0, 25, 0, 55, [0, barren ? '#8f806a' : '#835530', 1, barren ? '#6f604c' : '#63401f']));
    poly(g, [[96, 25], [50, 48], [50, 48 + t], [96, 25 + t]], lin(g, 0, 25, 0, 55, [0, barren ? '#74664f' : '#62401f', 1, barren ? '#54483a' : '#46290f']));
    poly(g, [[50, 2], [96, 25], [50, 48], [4, 25]], lin(g, 0, 2, 0, 48, [0, barren ? '#b6a58a' : '#ad693c', 1, barren ? '#988769' : '#88502c']), barren ? '#c9b99c' : '#c0804d', 1.2);
    var i, t0;
    g.lineCap = 'round';
    for (i = 1; i <= 4; i++) {
      t0 = i / 5;
      var ax = lerp(50, 4, t0), ay = lerp(2, 25, t0), bx = lerp(96, 50, t0), by = lerp(25, 48, t0);
      g.strokeStyle = barren ? 'rgba(80,66,46,0.45)' : 'rgba(58,33,12,0.5)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.strokeStyle = barren ? 'rgba(255,255,255,0.18)' : 'rgba(255,214,150,0.22)'; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(ax, ay + 1.7); g.lineTo(bx, by + 1.7); g.stroke();
    }
    if (barren) {
      g.strokeStyle = 'rgba(70,56,40,0.6)'; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(40, 18); g.lineTo(48, 24); g.lineTo(44, 31); g.moveTo(48, 24); g.lineTo(58, 22);
      g.moveTo(62, 31); g.lineTo(70, 27); g.stroke();
    }
  }

  var STAGE_H = [0, 6, 12, 17, 19], STAGE_L = [3, 3.6, 5, 6.2, 6.8], STAGE_N = [2, 4, 6, 8, 9];
  function drawPlant(g, x, y, stage, r) {
    ell(g, x, y + 0.5, 7, 2.6, 'rgba(50,28,10,0.55)');
    ell(g, x, y, 5.5, 2.2, '#6a4423');
    if (stage === 4) {
      g.save(); g.translate(x - 5.5, y + 0.8); g.rotate(0.35);
      ell(g, 0, 0, 4.6, 2.4, '#9b4577'); ell(g, -1, -0.8, 2, 0.9, 'rgba(255,255,255,0.28)'); g.restore();
      g.save(); g.translate(x + 5.8, y + 1); g.rotate(-0.3);
      ell(g, 0, 0, 4.4, 2.3, '#e69a45'); ell(g, -1, -0.8, 2, 0.9, 'rgba(255,255,255,0.3)'); g.restore();
    }
    var h = STAGE_H[stage], n = STAGE_N[stage], s = STAGE_L[stage];
    if (h > 0) {
      g.strokeStyle = '#4c8a2b'; g.lineWidth = 1.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (r() - 0.5) * 3, y - h * 0.6, x, y - h); g.stroke();
    }
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU + r() * 0.5;
      var fr = stage === 0 ? 0.9 : 0.35 + 0.65 * ((i % 3) / 2);
      var lx = x + Math.cos(a) * (s * 0.7), ly = y - h * fr + Math.sin(a) * s * 0.18 - (stage === 0 ? 2 : 0);
      var rot = Math.cos(a) * 1.15 + (r() - 0.5) * 0.3;
      leaf(g, lx, ly, s, rot, i % 2 ? '#7ccc55' : '#62bb4a', i % 2 ? '#3b9a3a' : '#2f8a38');
    }
    if (stage >= 3) {
      var fx = x + 3, fy = y - h - 1;
      ell(g, fx, fy, 2.4, 1.8, '#b690e0'); ell(g, fx, fy + 0.3, 1.1, 0.8, '#ffffff');
    }
  }
  function drawCrop(g, stage) {
    var r = rngOf(7 + stage * 31);
    drawPlant(g, 30, 62, stage, r);
    drawPlant(g, 70, 62, stage, r);
    drawPlant(g, 50, 71, stage, r);
  }

  function drawKelapa(g) {
    var i;
    ell(g, 50, 227, 24, 4, 'rgba(0,0,0,0.2)');
    g.lineCap = 'round';
    g.strokeStyle = '#6e4a28'; g.lineWidth = 10;
    g.beginPath(); g.moveTo(50, 226); g.bezierCurveTo(56, 180, 40, 120, 50, 56); g.stroke();
    g.strokeStyle = '#9a6d3f'; g.lineWidth = 6.5;
    g.beginPath(); g.moveTo(49, 226); g.bezierCurveTo(55, 180, 39, 120, 49, 56); g.stroke();
    g.strokeStyle = 'rgba(60,35,15,0.55)'; g.lineWidth = 1.2;
    for (i = 0; i < 14; i++) {
      var ty = 220 - i * 12, tx = 50 + Math.sin(i * 0.55) * 4;
      g.beginPath(); g.moveTo(tx - 4.5, ty); g.lineTo(tx + 3.5, ty - 2); g.stroke();
    }
    var cx = 50, cy = 54;
    for (i = 0; i < 9; i++) {
      var th = -Math.PI + 0.25 + i * ((Math.PI - 0.5) / 8);
      var len = 40 + (i % 2) * 6;
      var dx = Math.cos(th) * len, dy = Math.sin(th) * len * 0.45 + len * 0.42;
      g.beginPath(); g.moveTo(cx, cy);
      g.quadraticCurveTo(cx + dx * 0.55, cy + dy * 0.45 - 16, cx + dx, cy + dy);
      g.quadraticCurveTo(cx + dx * 0.55, cy + dy * 0.45 - 6, cx, cy + 3);
      g.fillStyle = i % 2 ? '#2a7d50' : '#3c9a5a'; g.fill();
      g.strokeStyle = 'rgba(200,255,170,0.45)'; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(cx + dx * 0.55, cy + dy * 0.45 - 11, cx + dx, cy + dy); g.stroke();
    }
    ell(g, 46, 59, 4.5, 4.5, '#6a4a2a'); ell(g, 55, 61, 4.5, 4.5, '#5d4024'); ell(g, 50, 64, 4.2, 4.2, '#745230');
    ell(g, 44.5, 57.5, 1.4, 1.1, 'rgba(255,255,255,0.35)');
  }

  function drawBamboo(g) {
    var xs = [28, 40, 50, 61, 72], hs = [150, 185, 168, 192, 140], i, j;
    ell(g, 50, 196, 32, 5, 'rgba(0,0,0,0.18)');
    for (i = 0; i < xs.length; i++) {
      var x = xs[i], top = 196 - hs[i];
      poly(g, [[x - 2.8, 196], [x + 2.8, 196], [x + 2.4, top], [x - 2.4, top]], lin(g, x - 3, 0, x + 3, 0, [0, '#9ed15a', 0.5, '#6aad3b', 1, '#4a8a2c']));
      g.strokeStyle = 'rgba(40,80,20,0.7)'; g.lineWidth = 1.2;
      for (j = 196 - 26; j > top; j -= 26) { g.beginPath(); g.moveTo(x - 3, j); g.lineTo(x + 3, j); g.stroke(); }
      for (j = 0; j < 3; j++) {
        var ly = top + 6 + j * 9, side = (j + i) % 2 ? 1 : -1;
        g.save(); g.translate(x, ly); g.rotate(side * 1.0);
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(7, -3, 17, 0); g.quadraticCurveTo(7, 3, 0, 0);
        g.fillStyle = j % 2 ? '#7cbf45' : '#5fa83a'; g.fill(); g.restore();
      }
    }
  }

  function drawHouse(g) {
    poly(g, [[50, 80], [100, 100], [50, 120], [0, 100]], '#c6bfae', '#9a9484', 1);
    poly(g, [[0, 100], [50, 120], [50, 124], [0, 104]], '#8f897b');
    poly(g, [[100, 100], [50, 120], [50, 124], [100, 104]], '#74705f');
    poly(g, [[14, 98], [50, 114], [50, 90], [14, 74]], lin(g, 14, 0, 50, 0, [0, '#b97f46', 1, '#a06a35']));
    poly(g, [[86, 98], [50, 114], [50, 90], [86, 74]], lin(g, 50, 0, 86, 0, [0, '#80532b', 1, '#6c441f']));
    g.strokeStyle = 'rgba(60,35,12,0.35)'; g.lineWidth = 0.8;
    var i;
    for (i = 1; i < 6; i++) {
      var tx = lerp(14, 50, i / 6), ty1 = lerp(98, 114, i / 6), ty2 = lerp(74, 90, i / 6);
      g.beginPath(); g.moveTo(tx, ty1); g.lineTo(tx, ty2); g.stroke();
    }
    poly(g, [[26, 99], [36, 103.5], [36, 88], [26, 83.5]], '#3d2410');
    poly(g, [[62, 102], [74, 96.5], [74, 86], [62, 91.5]], '#ffe9a8', '#5b3a1a', 1);
    poly(g, [[4, 76], [50, 100], [50, 58], [26, 46]], lin(g, 4, 0, 50, 0, [0, '#d0693c', 1, '#b9552d']));
    poly(g, [[96, 76], [50, 100], [50, 58], [74, 46]], lin(g, 50, 0, 96, 0, [0, '#a24c2a', 1, '#8c3f22']));
    poly(g, [[26, 46], [50, 58], [50, 8], [50, 8]], lin(g, 26, 0, 50, 0, [0, '#c25f35', 1, '#a84c28']));
    poly(g, [[74, 46], [50, 58], [50, 8]], lin(g, 50, 0, 74, 0, [0, '#92402a', 1, '#7c3320']));
    g.strokeStyle = 'rgba(70,25,10,0.4)'; g.lineWidth = 0.9;
    for (i = 1; i < 5; i++) {
      var k = i / 5;
      g.beginPath(); g.moveTo(lerp(4, 26, k), lerp(76, 46, k)); g.lineTo(lerp(50, 50, k), lerp(100, 58, k)); g.stroke();
      g.beginPath(); g.moveTo(lerp(96, 74, k), lerp(76, 46, k)); g.lineTo(50, lerp(100, 58, k)); g.stroke();
    }
    ell(g, 50, 7, 2.2, 2.6, '#e8c260');
  }

  function drawBeringin(g, level) {
    var A, B, C;
    if (level === 0) { A = '#7a6a3f'; B = '#6b5a35'; C = '#8f7d4a'; }
    else if (level === 1) { A = '#6f9a58'; B = '#5f8a4f'; C = '#86aa68'; }
    else { A = '#236a4c'; B = '#2f8559'; C = '#4aa874'; }
    ell(g, 50, 126, 38, 5, 'rgba(0,0,0,0.2)');
    var i;
    g.lineCap = 'round';
    for (i = 0; i < 7; i++) {
      var rx = 20 + i * 10;
      g.strokeStyle = i % 2 ? '#5a4230' : '#4a3324'; g.lineWidth = 1.6 + (i % 3) * 0.5;
      g.beginPath(); g.moveTo(rx, 56); g.quadraticCurveTo(rx + (i - 3) * 1.5, 92, rx + (i - 3) * 2.2, 124); g.stroke();
    }
    poly(g, [[36, 126], [42, 100], [44, 64], [56, 64], [58, 100], [64, 126]], lin(g, 36, 0, 64, 0, [0, '#4a3324', 0.5, '#6a4c36', 1, '#3d2a1c']));
    g.strokeStyle = 'rgba(30,18,8,0.55)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(48, 70); g.quadraticCurveTo(46, 98, 44, 122); g.moveTo(54, 72); g.quadraticCurveTo(56, 98, 58, 122); g.stroke();
    var blobs = [[50, 40, 30], [28, 46, 22], [72, 46, 22], [38, 28, 20], [62, 28, 20], [50, 20, 18], [18, 56, 14], [82, 56, 14]];
    for (i = 0; i < blobs.length; i++) ell(g, blobs[i][0], blobs[i][1], blobs[i][2], blobs[i][2] * 0.86, i % 3 === 0 ? A : i % 3 === 1 ? B : C);
    for (i = 0; i < blobs.length; i++) ell(g, blobs[i][0] - 5, blobs[i][1] - 7, blobs[i][2] * 0.5, blobs[i][2] * 0.38, 'rgba(255,255,255,0.1)');
  }

  function drawChicken(g, f) {
    var off = [0, 6, 0, -6][f], bob = (f % 2) ? -1.6 : 0;
    g.lineCap = 'round';
    g.strokeStyle = '#e0922f'; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(42, 72 + bob); g.lineTo(42 + off, 90); g.moveTo(54, 72 + bob); g.lineTo(54 - off, 90); g.stroke();
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(42 + off, 90); g.lineTo(47 + off, 91); g.moveTo(54 - off, 90); g.lineTo(59 - off, 91); g.stroke();
    ell(g, 26, 48 + bob, 7, 4, '#c9b99a', -0.7); ell(g, 22, 54 + bob, 6, 3.4, '#b6a583', -0.4);
    ell(g, 46, 58 + bob, 24, 18, lin(g, 0, 40, 0, 76, [0, '#ffffff', 1, '#e4ddd0']));
    ell(g, 42, 61 + bob, 13, 8.5, '#eadfc6', 0.15);
    g.strokeStyle = 'rgba(160,140,100,0.5)'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(34, 62 + bob); g.quadraticCurveTo(42, 67 + bob, 50, 61 + bob); g.stroke();
    ell(g, 66, 44 + bob, 8.5, 12, '#ffffff', 0.15);
    ell(g, 70, 36 + bob, 9.5, 9, '#ffffff');
    ell(g, 66, 28 + bob, 3, 3.6, '#e23b3b'); ell(g, 71, 26.5 + bob, 3, 3.8, '#d62f2f'); ell(g, 76, 29 + bob, 2.6, 3.2, '#e23b3b');
    poly(g, [[77, 36 + bob], [87, 39 + bob], [77, 43 + bob]], '#f2a33a');
    ell(g, 75, 46 + bob, 2, 3, '#d62f2f');
    ell(g, 73, 34.5 + bob, 1.9, 1.9, '#1b1b1b'); ell(g, 73.6, 33.9 + bob, 0.6, 0.6, '#ffffff');
  }

  function drawCloud(g, v) {
    var sets = [
      [[24, 32, 18, 14], [46, 24, 22, 18], [68, 30, 18, 14], [50, 38, 40, 10]],
      [[30, 30, 16, 12], [52, 22, 20, 16], [72, 32, 14, 11], [52, 38, 38, 9]],
      [[18, 34, 14, 11], [36, 24, 18, 15], [58, 20, 20, 17], [78, 30, 16, 12], [50, 40, 44, 9]]
    ][v], i;
    for (i = 0; i < sets.length; i++) ell(g, sets[i][0], sets[i][1] + 2, sets[i][2], sets[i][3], 'rgba(150,175,205,0.35)');
    for (i = 0; i < sets.length; i++) ell(g, sets[i][0], sets[i][1], sets[i][2], sets[i][3], lin(g, 0, 8, 0, 46, [0, '#ffffff', 1, '#e6eef8']));
  }

  function bubble(g, col) {
    poly(g, [[38, 74], [62, 74], [50, 94]], col);
    ell(g, 50, 42, 37, 37, '#ffffff'); ell(g, 50, 42, 32, 32, col);
    ell(g, 41, 31, 10, 6, 'rgba(255,255,255,0.28)', -0.5);
  }
  function drawBadge(g, kind) {
    if (kind === 'ready') {
      bubble(g, '#2fbf55');
      g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(34, 44); g.lineTo(46, 55); g.lineTo(68, 31); g.stroke();
    } else if (kind === 'add') {
      bubble(g, '#e0a63a');
      g.strokeStyle = '#fff'; g.lineWidth = 8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(50, 26); g.lineTo(50, 58); g.moveTo(34, 42); g.lineTo(66, 42); g.stroke();
    } else if (kind === 'care') {
      bubble(g, '#3b9bf0');
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(50, 22); g.bezierCurveTo(66, 42, 68, 56, 50, 62); g.bezierCurveTo(32, 56, 34, 42, 50, 22); g.fill();
      ell(g, 44, 50, 3, 5, 'rgba(59,155,240,0.45)', 0.4);
    } else {
      bubble(g, '#b9772f');
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(50, 62); g.lineTo(50, 40); g.stroke();
      leaf(g, 50, 46, 14, -0.9, '#ffffff', '#e8ffe0'); leaf(g, 50, 44, 14, 0.9, '#ffffff', '#e8ffe0');
    }
  }

  function drawPot(g) {
    poly(g, [[22, 46], [78, 46], [68, 94], [32, 94]], lin(g, 0, 46, 0, 94, [0, '#d9794a', 1, '#b45a31']));
    poly(g, [[18, 38], [82, 38], [82, 50], [18, 50]], '#e38a5a');
    ell(g, 50, 40, 31, 5, '#5d3a1d');
    g.strokeStyle = '#4c8a2b'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(50, 40); g.lineTo(50, 18); g.stroke();
    leaf(g, 50, 24, 20, -0.9, '#7ccc55', '#3b9a3a'); leaf(g, 50, 22, 20, 0.9, '#62bb4a', '#2f8a38');
  }
  function drawCoin(g) {
    ell(g, 50, 50, 44, 44, '#b8861b'); ell(g, 50, 50, 39, 39, lin(g, 0, 10, 0, 90, [0, '#ffe27a', 1, '#f0b429']));
    ell(g, 50, 50, 27, 27, '#e8a91f'); ell(g, 50, 50, 23, 23, lin(g, 0, 20, 0, 80, [0, '#fff0a3', 1, '#f6c443']));
    g.fillStyle = '#c28912'; g.fillRect(46, 32, 8, 36);
    ell(g, 36, 34, 9, 5, 'rgba(255,255,255,0.5)', -0.6);
  }
  function drawSpark(g) {
    g.beginPath(); g.moveTo(50, 0); g.quadraticCurveTo(54, 46, 100, 50); g.quadraticCurveTo(54, 54, 50, 100);
    g.quadraticCurveTo(46, 54, 0, 50); g.quadraticCurveTo(46, 46, 50, 0);
    g.fillStyle = '#fff7b0'; g.fill();
    ell(g, 50, 50, 10, 10, '#ffffff');
  }
  function drawDrop(g) {
    g.beginPath(); g.moveTo(50, 4); g.bezierCurveTo(80, 44, 84, 66, 50, 94); g.bezierCurveTo(16, 66, 20, 44, 50, 4);
    g.fillStyle = lin(g, 0, 4, 0, 94, [0, '#8ed0ff', 1, '#2f8fe6']); g.fill();
    ell(g, 40, 56, 6, 12, 'rgba(255,255,255,0.45)', 0.3);
  }
  function drawLeafSpr(g) { leaf(g, 50, 90, 80, 0.5, '#7ccc55', '#2f8a38'); }

  function drawLumbung(g) {
    var i, k;
    poly(g, [[50, 62], [98, 82], [50, 102], [2, 82]], '#b9b09a', '#9a927e', 1);
    poly(g, [[2, 82], [50, 102], [50, 106], [2, 86]], '#8c846f');
    poly(g, [[98, 82], [50, 102], [50, 106], [98, 86]], '#6f6a58');
    poly(g, [[14, 82], [50, 98], [50, 74], [14, 58]], lin(g, 14, 0, 50, 0, [0, '#d5ae68', 1, '#b98f4c']));
    poly(g, [[86, 82], [50, 98], [50, 74], [86, 58]], lin(g, 50, 0, 86, 0, [0, '#a98340', 1, '#8a6a33']));
    g.strokeStyle = 'rgba(70,45,10,0.3)'; g.lineWidth = 0.7;
    for (i = 1; i < 8; i++) {
      k = i / 8;
      g.beginPath(); g.moveTo(lerp(14, 50, k), lerp(82, 98, k)); g.lineTo(lerp(14, 50, k), lerp(58, 74, k)); g.stroke();
      g.beginPath(); g.moveTo(lerp(86, 50, k), lerp(82, 98, k)); g.lineTo(lerp(86, 50, k), lerp(58, 74, k)); g.stroke();
    }
    for (i = 1; i < 4; i++) {
      g.beginPath(); g.moveTo(14, 82 - i * 6); g.lineTo(50, 98 - i * 6); g.moveTo(86, 82 - i * 6); g.lineTo(50, 98 - i * 6); g.stroke();
    }
    poly(g, [[24, 88.5], [36, 94], [36, 79], [24, 73.5]], '#3a2810');
    poly(g, [[4, 62], [50, 86], [50, 8]], lin(g, 4, 0, 50, 0, [0, '#cfa04a', 1, '#ac7c30']));
    poly(g, [[96, 62], [50, 86], [50, 8]], lin(g, 50, 0, 96, 0, [0, '#9c7432', 1, '#7d5a22']));
    g.strokeStyle = 'rgba(70,45,10,0.32)'; g.lineWidth = 0.9;
    for (i = 1; i < 7; i++) {
      k = i / 7;
      g.beginPath(); g.moveTo(50, 8); g.lineTo(lerp(4, 50, k), lerp(62, 86, k)); g.stroke();
      g.beginPath(); g.moveTo(50, 8); g.lineTo(lerp(96, 50, k), lerp(62, 86, k)); g.stroke();
    }
    ell(g, 82, 96, 5, 4.2, '#e6d7ae'); ell(g, 90, 92, 5, 4.2, '#dccb9c'); ell(g, 82, 93, 1.6, 1, '#b79a5a');
  }

  function drawDapur(g) {
    var i, k;
    poly(g, [[50, 70], [94, 88], [50, 106], [6, 88]], '#aaa28c', '#8f8872', 1);
    poly(g, [[6, 88], [50, 106], [50, 110], [6, 92]], '#857e6a');
    poly(g, [[94, 88], [50, 106], [50, 110], [94, 92]], '#69644f');
    poly(g, [[18, 88], [50, 102], [50, 80], [18, 66]], lin(g, 18, 0, 50, 0, [0, '#b27a4d', 1, '#9b6640']));
    poly(g, [[82, 88], [50, 102], [50, 80], [82, 66]], lin(g, 50, 0, 82, 0, [0, '#84552f', 1, '#6c4425']));
    g.strokeStyle = 'rgba(50,28,10,0.35)'; g.lineWidth = 0.8;
    for (i = 1; i < 6; i++) { k = i / 6; g.beginPath(); g.moveTo(lerp(18, 50, k), lerp(88, 102, k)); g.lineTo(lerp(18, 50, k), lerp(66, 80, k)); g.stroke(); }
    poly(g, [[58, 95], [72, 88.5], [72, 76], [58, 82.5]], '#ffb347', '#4a2e14', 1.2);
    var gl = g.createRadialGradient(65, 86, 0, 65, 86, 11);
    gl.addColorStop(0, 'rgba(255,232,150,0.9)'); gl.addColorStop(1, 'rgba(255,150,40,0)');
    g.fillStyle = gl; g.fillRect(50, 72, 30, 28);
    poly(g, [[28, 93], [40, 98.5], [40, 84], [28, 78.5]], '#33200d');
    poly(g, [[64, 30], [76, 35], [76, 60], [64, 55]], '#8b8577');
    poly(g, [[64, 30], [70, 27], [82, 32], [76, 35]], '#6f6a5c');
    poly(g, [[10, 72], [50, 94], [50, 32]], lin(g, 10, 0, 50, 0, [0, '#9a553b', 1, '#7d412c']));
    poly(g, [[90, 72], [50, 94], [50, 32]], lin(g, 50, 0, 90, 0, [0, '#733827', 1, '#5f2d1f']));
    g.strokeStyle = 'rgba(40,15,8,0.4)'; g.lineWidth = 0.9;
    for (i = 1; i < 6; i++) {
      k = i / 6;
      g.beginPath(); g.moveTo(50, 32); g.lineTo(lerp(10, 50, k), lerp(72, 94, k)); g.stroke();
      g.beginPath(); g.moveTo(50, 32); g.lineTo(lerp(90, 50, k), lerp(72, 94, k)); g.stroke();
    }
  }

  function drawKompos(g) {
    var i;
    ell(g, 50, 72, 46, 8, 'rgba(0,0,0,0.2)');
    poly(g, [[8, 40], [50, 60], [50, 80], [8, 60]], lin(g, 8, 0, 50, 0, [0, '#93724a', 1, '#7d5f3b']));
    poly(g, [[92, 40], [50, 60], [50, 80], [92, 60]], lin(g, 50, 0, 92, 0, [0, '#6e5232', 1, '#5a4128']));
    g.strokeStyle = 'rgba(40,24,8,0.4)'; g.lineWidth = 0.9;
    for (i = 1; i < 3; i++) {
      g.beginPath(); g.moveTo(8, 40 + i * 6.6); g.lineTo(50, 60 + i * 6.6); g.moveTo(92, 40 + i * 6.6); g.lineTo(50, 60 + i * 6.6); g.stroke();
    }
    poly(g, [[8, 40], [50, 20], [50, 26], [16, 40]], '#6b4f30');
    poly(g, [[92, 40], [50, 20], [50, 26], [84, 40]], '#5a4128');
    poly(g, [[50, 26], [84, 40], [50, 54], [16, 40]], '#3b2a1b');
    ell(g, 50, 40, 26, 8.5, '#4a3523'); ell(g, 44, 37, 12, 4.5, '#5b432c'); ell(g, 58, 41, 11, 4, '#523b25');
    ell(g, 34, 42, 3.4, 1.6, '#6fbf5a', 0.4); ell(g, 62, 36, 3.2, 1.5, '#f0a04b', -0.3); ell(g, 48, 45, 3, 1.4, '#8fd070', 0.2);
    ell(g, 70, 42, 2.6, 1.3, '#e8c43a', 0.5); ell(g, 40, 36, 2.6, 1.2, '#f0a04b', -0.5);
    poly(g, [[8, 40], [50, 60], [50, 64], [8, 44]], '#a07b4f');
    poly(g, [[92, 40], [50, 60], [50, 64], [92, 44]], '#7d6038');
    g.strokeStyle = '#4c8a2b'; g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(52, 38); g.lineTo(52, 28); g.stroke();
    leaf(g, 52, 31, 8, -0.9, '#7ccc55', '#3b9a3a'); leaf(g, 52, 29, 8, 0.9, '#62bb4a', '#2f8a38');
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(36, 30); g.quadraticCurveTo(32, 22, 37, 15); g.moveTo(66, 30); g.quadraticCurveTo(70, 22, 65, 14); g.stroke();
  }

  function drawLapak(g) {
    var i, t;
    ell(g, 50, 92, 46, 7, 'rgba(0,0,0,0.2)');
    poly(g, [[10, 70], [50, 88], [50, 68], [10, 50]], '#a9724a');
    poly(g, [[90, 70], [50, 88], [50, 68], [90, 50]], '#7b4e30');
    poly(g, [[50, 32], [90, 50], [50, 68], [10, 50]], '#c58a55', '#8f5f35', 1);
    ell(g, 36, 52, 9, 5, '#8a5a30'); ell(g, 34, 50, 3.5, 2.3, '#9b4577'); ell(g, 39, 51, 3.5, 2.3, '#e69a45'); ell(g, 36, 48.5, 3.5, 2.2, '#9b4577');
    ell(g, 64, 52, 9, 5, '#8a5a30'); ell(g, 62, 50, 3.2, 3.2, '#e8c43a'); ell(g, 67, 51, 3.2, 3.2, '#d9a62a'); ell(g, 64, 48.6, 3, 3, '#e8c43a');
    ell(g, 50, 60, 8, 4.5, '#8a5a30'); ell(g, 48, 58.5, 3, 3, '#7bbf5a'); ell(g, 53, 59, 3, 3, '#5aa04a');
    g.strokeStyle = '#6b4a2a'; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(12, 52); g.lineTo(12, 26); g.moveTo(88, 52); g.lineTo(88, 26); g.moveTo(50, 70); g.lineTo(50, 44); g.stroke();
    var N = [50, 4], E = [98, 24], S2 = [50, 44], W = [2, 24];
    function lp(a, b, k) { return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]; }
    poly(g, [N, E, S2, W], '#f3e3c3');
    for (i = 0; i < 6; i += 2) {
      var a0 = lp(W, S2, i / 6), a1 = lp(W, S2, (i + 1) / 6), b1 = lp(N, E, (i + 1) / 6), b0 = lp(N, E, i / 6);
      poly(g, [a0, a1, b1, b0], '#c8553d');
    }
    for (i = 0; i < 6; i++) {
      t = (i + 0.5) / 6; var pa = lp(W, S2, t), pb = lp(S2, E, t);
      ell(g, pa[0], pa[1] + 2.6, 4.2, 3.2, i % 2 ? '#f3e3c3' : '#c8553d');
      ell(g, pb[0], pb[1] + 2.6, 4.2, 3.2, i % 2 ? '#c8553d' : '#f3e3c3');
    }
    poly(g, [N, E, S2, W], null, 'rgba(90,40,20,0.5)', 1);
  }


  function drawGubuk(g) {
    var i, k;
    poly(g, [[50, 66], [96, 85], [50, 104], [4, 85]], '#b3ab93', '#938b77', 1);
    poly(g, [[4, 85], [50, 104], [50, 108], [4, 89]], '#857d68');
    poly(g, [[96, 85], [50, 104], [50, 108], [96, 89]], '#6a654f');
    poly(g, [[16, 84], [50, 99], [50, 74], [16, 59]], lin(g, 16, 0, 50, 0, [0, '#d9d98a', 1, '#bcc26a']));
    poly(g, [[84, 84], [50, 99], [50, 74], [84, 59]], lin(g, 50, 0, 84, 0, [0, '#a9ad58', 1, '#8f9444']));
    g.strokeStyle = 'rgba(100,105,40,0.55)'; g.lineWidth = 0.8;
    for (i = 1; i < 9; i++) {
      k = i / 9;
      g.beginPath(); g.moveTo(lerp(16, 50, k), lerp(84, 99, k)); g.lineTo(lerp(16, 50, k), lerp(59, 74, k)); g.stroke();
      g.beginPath(); g.moveTo(lerp(84, 50, k), lerp(84, 99, k)); g.lineTo(lerp(84, 50, k), lerp(59, 74, k)); g.stroke();
    }
    poly(g, [[26, 90], [38, 95.5], [38, 81], [26, 75.5]], '#4a3a1a');
    poly(g, [[60, 92], [72, 86.5], [72, 78], [60, 83.5]], '#ffe9a8', '#5b4a22', 1);
    poly(g, [[6, 64], [50, 88], [50, 14]], lin(g, 6, 0, 50, 0, [0, '#c8a24a', 1, '#a77f2f']));
    poly(g, [[94, 64], [50, 88], [50, 14]], lin(g, 50, 0, 94, 0, [0, '#957028', 1, '#765520']));
    g.strokeStyle = 'rgba(70,45,10,0.32)'; g.lineWidth = 0.9;
    for (i = 1; i < 7; i++) {
      k = i / 7;
      g.beginPath(); g.moveTo(50, 14); g.lineTo(lerp(6, 50, k), lerp(64, 88, k)); g.stroke();
      g.beginPath(); g.moveTo(50, 14); g.lineTo(lerp(94, 50, k), lerp(64, 88, k)); g.stroke();
    }
    poly(g, [[36, 100], [46, 104.5], [46, 107], [36, 102.5]], '#8a6a3f');
  }

  function drawKayu(g) {
    var i, k;
    poly(g, [[50, 70], [98, 91], [50, 112], [2, 91]], '#b3ab93', '#938b77', 1);
    poly(g, [[2, 91], [50, 112], [50, 116], [2, 95]], '#857d68');
    poly(g, [[98, 91], [50, 112], [50, 116], [98, 95]], '#6a654f');
    poly(g, [[12, 90], [50, 107], [50, 80], [12, 63]], lin(g, 12, 0, 50, 0, [0, '#b9814f', 1, '#9c6a42']));
    poly(g, [[88, 90], [50, 107], [50, 80], [88, 63]], lin(g, 50, 0, 88, 0, [0, '#85552f', 1, '#6c4425']));
    g.strokeStyle = 'rgba(50,28,10,0.35)'; g.lineWidth = 0.8;
    for (i = 1; i < 8; i++) {
      k = i / 8;
      g.beginPath(); g.moveTo(lerp(12, 50, k), lerp(90, 107, k)); g.lineTo(lerp(12, 50, k), lerp(63, 80, k)); g.stroke();
    }
    poly(g, [[34, 98.5], [44, 103], [44, 85], [34, 80.5]], '#3d2610');
    poly(g, [[18, 87], [28, 91.5], [28, 81], [18, 76.5]], '#ffe9a8', '#4a2e14', 1.1);
    poly(g, [[60, 98], [78, 90], [78, 77], [60, 85]], '#ffe9a8', '#4a2e14', 1.1);
    g.strokeStyle = '#4a2e14'; g.lineWidth = 1; g.beginPath(); g.moveTo(69, 94); g.lineTo(69, 81); g.stroke();
    poly(g, [[2, 68], [50, 94], [50, 22]], lin(g, 2, 0, 50, 0, [0, '#c8623b', 1, '#a9482a']));
    poly(g, [[98, 68], [50, 94], [50, 22]], lin(g, 50, 0, 98, 0, [0, '#9c4429', 1, '#82361f']));
    g.strokeStyle = 'rgba(60,20,8,0.38)'; g.lineWidth = 0.9;
    for (i = 1; i < 7; i++) {
      k = i / 7;
      g.beginPath(); g.moveTo(50, 22); g.lineTo(lerp(2, 50, k), lerp(68, 94, k)); g.stroke();
      g.beginPath(); g.moveTo(50, 22); g.lineTo(lerp(98, 50, k), lerp(68, 94, k)); g.stroke();
    }
    ell(g, 50, 21, 2.4, 2.8, '#e8c260');
  }


  function drawTileRoad(g) {
    poly(g, [[50, -0.6], [100.6, 25], [50, 50.6], [-0.6, 25]], lin(g, 0, 0, 0, 50, [0, '#cfc4aa', 1, '#b3a88e']));
    var r = rngOf(55), i;
    for (i = 0; i < 12; i++) {
      var x = 16 + r() * 68, y = 8 + r() * 34;
      if (Math.abs(x - 50) / 50 + Math.abs(y - 25) / 25 > 0.82) continue;
      ell(g, x, y, 4 + r() * 3, 2 + r() * 1.2, r() > 0.5 ? 'rgba(120,108,86,0.35)' : 'rgba(255,248,230,0.3)');
    }
    g.strokeStyle = 'rgba(110,98,76,0.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(50, 1); g.lineTo(100, 25); g.moveTo(0, 25); g.lineTo(50, 49); g.stroke();
  }
  function drawTileWater(g) {
    poly(g, [[50, -0.6], [100.6, 25], [50, 50.6], [-0.6, 25]], lin(g, 0, 0, 0, 50, [0, '#62bccb', 1, '#2f8fa6']));
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(26, 22); g.quadraticCurveTo(34, 18, 42, 22); g.moveTo(52, 30); g.quadraticCurveTo(62, 25, 72, 30); g.moveTo(40, 38); g.quadraticCurveTo(48, 34, 56, 38); g.stroke();
    g.strokeStyle = 'rgba(10,70,90,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(50, 1); g.lineTo(100, 25); g.moveTo(0, 25); g.lineTo(50, 49); g.stroke();
  }
  function drawTileSoil(g) {
    poly(g, [[50, -0.6], [100.6, 25], [50, 50.6], [-0.6, 25]], lin(g, 0, 0, 0, 50, [0, '#85583a', 1, '#6c4528']));
    g.lineCap = 'round';
    for (var i = 1; i <= 4; i++) {
      var t0 = i / 5;
      g.strokeStyle = 'rgba(50,28,10,0.45)'; g.lineWidth = 1.4; g.beginPath();
      g.moveTo(lerp(50, 0, t0), lerp(0, 25, t0)); g.lineTo(lerp(100, 50, t0), lerp(25, 50, t0)); g.stroke();
    }
  }
  function drawGunung(g) {
    var i;
    ell(g, 50, 92, 46, 5, 'rgba(0,0,0,0.2)');
    poly(g, [[0, 92], [30, 40], [48, 62], [70, 14], [100, 92]], lin(g, 0, 14, 0, 92, [0, '#9fb3b0', 0.3, '#5f8f86', 1, '#1f6a52']));
    poly(g, [[58, 92], [80, 38], [100, 92]], lin(g, 0, 38, 0, 92, [0, '#6c9a90', 1, '#17563f']));
    poly(g, [[70, 14], [60, 42], [78, 30]], 'rgba(255,255,255,0.18)');
    poly(g, [[30, 40], [22, 58], [36, 52]], 'rgba(255,255,255,0.14)');
    var r = rngOf(9);
    for (i = 0; i < 26; i++) {
      var x = 6 + r() * 88, y = 52 + r() * 38;
      if (y < 44 + Math.abs(x - 50) * 0.3) continue;
      ell(g, x, y, 3.2 + r() * 2.6, 2.6 + r() * 2, r() > 0.5 ? '#1d6a4c' : '#2c8059');
    }
    ell(g, 50, 52, 38, 5, 'rgba(236,250,246,0.35)');
  }
  function drawTreeHutan(g) {
    ell(g, 50, 96, 26, 4, 'rgba(0,0,0,0.22)');
    poly(g, [[46, 60], [54, 60], [55, 96], [45, 96]], '#6a4a2a');
    ell(g, 50, 40, 32, 28, '#2c7e55'); ell(g, 34, 52, 22, 20, '#2f8559'); ell(g, 66, 52, 22, 20, '#256f4b');
    ell(g, 50, 30, 24, 20, '#3c9a6a'); ell(g, 42, 24, 11, 8, 'rgba(255,255,255,0.12)');
  }
  function drawToko(g) {
    var i, k;
    poly(g, [[50, 62], [98, 82], [50, 102], [2, 82]], '#b9b09a', '#9a927e', 1);
    poly(g, [[2, 82], [50, 102], [50, 106], [2, 86]], '#8c846f');
    poly(g, [[98, 82], [50, 102], [50, 106], [98, 86]], '#6f6a58');
    poly(g, [[14, 82], [50, 98], [50, 72], [14, 56]], lin(g, 14, 0, 50, 0, [0, '#eadfc4', 1, '#d2c5a4']));
    poly(g, [[86, 82], [50, 98], [50, 72], [86, 56]], lin(g, 50, 0, 86, 0, [0, '#c9bb99', 1, '#b3a583']));
    poly(g, [[56, 94], [80, 83], [80, 68], [56, 79]], '#2a1c10');
    poly(g, [[58, 91.5], [78, 82], [78, 72], [58, 81.5]], '#ffe9a8');
    poly(g, [[18, 76], [46, 89], [46, 80], [18, 67]], '#1f5a45', '#e0b24a', 1.2);
    g.save(); g.transform(1, 0.463, 0, 1, 0, 0); g.fillStyle = '#ffe9a8'; g.font = '800 6.2px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('KOPERASI', 32, 79 - 32 * 0.463 + 0.2); g.restore();
    poly(g, [[4, 62], [50, 86], [50, 22]], lin(g, 4, 0, 50, 0, [0, '#c8623b', 1, '#a9482a']));
    poly(g, [[96, 62], [50, 86], [50, 22]], lin(g, 50, 0, 96, 0, [0, '#9c4429', 1, '#82361f']));
    g.strokeStyle = 'rgba(60,20,8,0.38)'; g.lineWidth = 0.9;
    for (i = 1; i < 6; i++) {
      k = i / 6;
      g.beginPath(); g.moveTo(50, 22); g.lineTo(lerp(4, 50, k), lerp(62, 86, k)); g.stroke();
      g.beginPath(); g.moveTo(50, 22); g.lineTo(lerp(96, 50, k), lerp(62, 86, k)); g.stroke();
    }
  }

  function drawMist(g) {
    g.save(); g.translate(50, 14); g.scale(1, 0.28);
    var gr = g.createRadialGradient(0, 0, 0, 0, 0, 50);
    gr.addColorStop(0, 'rgba(236,250,246,0.75)'); gr.addColorStop(0.55, 'rgba(236,250,246,0.3)'); gr.addColorStop(1, 'rgba(236,250,246,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.fill(); g.restore();
  }
  function drawGlow(g) {
    var gr = g.createRadialGradient(50, 50, 0, 50, 50, 50);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 100, 100);
  }
  function drawGlowYellow(g) {
    var gr = g.createRadialGradient(50, 50, 0, 50, 50, 50);
    gr.addColorStop(0, 'rgba(255,255,170,1)'); gr.addColorStop(0.3, 'rgba(220,255,120,0.5)'); gr.addColorStop(1, 'rgba(200,255,100,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 100, 100);
  }

  /* nama sprite -> {w: lebar dalam satuan petak, a: tinggi/lebar, ax/ay: titik jangkar (pecahan), draw} */
  var DEF = {
    tile_grass_0: { w: 1.02, a: 0.5, ax: 0.5, ay: 0.5, draw: function (g) { drawGrass(g, 0); } },
    tile_grass_1: { w: 1.02, a: 0.5, ax: 0.5, ay: 0.5, draw: function (g) { drawGrass(g, 1); } },
    bed_fertile: { w: 0.94, a: 0.55, ax: 0.5, ay: 0.4545, draw: function (g) { drawBed(g, false); } },
    bed_barren: { w: 0.94, a: 0.55, ax: 0.5, ay: 0.4545, draw: function (g) { drawBed(g, true); } },
    tree_kelapa: { w: 1.0, a: 2.3, ax: 0.5, ay: 0.975, draw: drawKelapa },
    bamboo: { w: 0.8, a: 2.0, ax: 0.5, ay: 0.98, draw: drawBamboo },
    house_joglo: { w: 1.9, a: 1.26, ax: 0.5, ay: 0.82, draw: drawHouse },
    tree_beringin_0: { w: 2.0, a: 1.32, ax: 0.5, ay: 0.95, draw: function (g) { drawBeringin(g, 0); } },
    tree_beringin_1: { w: 2.0, a: 1.32, ax: 0.5, ay: 0.95, draw: function (g) { drawBeringin(g, 1); } },
    tree_beringin_2: { w: 2.0, a: 1.32, ax: 0.5, ay: 0.95, draw: function (g) { drawBeringin(g, 2); } },
    cloud_0: { w: 1.7, a: 0.5, ax: 0.5, ay: 0.5, draw: function (g) { drawCloud(g, 0); } },
    cloud_1: { w: 1.4, a: 0.5, ax: 0.5, ay: 0.5, draw: function (g) { drawCloud(g, 1); } },
    cloud_2: { w: 2.0, a: 0.5, ax: 0.5, ay: 0.5, draw: function (g) { drawCloud(g, 2); } },
    badge_ready: { w: 0.3, a: 1.0, ax: 0.5, ay: 0.96, draw: function (g) { drawBadge(g, 'ready'); } },
    badge_add: { w: 0.3, a: 1.0, ax: 0.5, ay: 0.96, draw: function (g) { drawBadge(g, 'add'); } },
    badge_care: { w: 0.3, a: 1.0, ax: 0.5, ay: 0.96, draw: function (g) { drawBadge(g, 'care'); } },
    badge_nursery: { w: 0.3, a: 1.0, ax: 0.5, ay: 0.96, draw: function (g) { drawBadge(g, 'nursery'); } },
    pot: { w: 0.2, a: 1.0, ax: 0.5, ay: 0.95, draw: drawPot },
    coin: { w: 0.13, a: 1.0, ax: 0.5, ay: 0.5, draw: drawCoin },
    spark: { w: 0.12, a: 1.0, ax: 0.5, ay: 0.5, draw: drawSpark },
    drop: { w: 0.06, a: 1.0, ax: 0.5, ay: 0.5, draw: drawDrop },
    leaf: { w: 0.09, a: 1.0, ax: 0.5, ay: 0.9, draw: drawLeafSpr },
    house_gubuk: { w: 1.5, a: 1.09, ax: 0.5, ay: 0.86, draw: drawGubuk },
    house_kayu: { w: 1.7, a: 1.18, ax: 0.5, ay: 0.87, draw: drawKayu },
    tile_road: { w: 1.02, a: 0.5, ax: 0.5, ay: 0.5, draw: drawTileRoad },
    tile_water: { w: 1.02, a: 0.5, ax: 0.5, ay: 0.5, draw: drawTileWater },
    tile_soil: { w: 1.02, a: 0.5, ax: 0.5, ay: 0.5, draw: drawTileSoil },
    gunung: { w: 2.4, a: 0.95, ax: 0.5, ay: 0.92, draw: drawGunung },
    tree_hutan: { w: 0.7, a: 1.15, ax: 0.5, ay: 0.96, draw: drawTreeHutan },
    toko: { w: 1.3, a: 1.08, ax: 0.5, ay: 0.86, draw: drawToko },
    lumbung: { w: 1.25, a: 1.08, ax: 0.5, ay: 0.86, draw: drawLumbung },
    dapur: { w: 1.1, a: 1.1, ax: 0.5, ay: 0.88, chim: [0.7, 0.26], draw: drawDapur },
    kompos: { w: 0.85, a: 0.85, ax: 0.5, ay: 0.8, draw: drawKompos },
    lapak: { w: 1.25, a: 1.0, ax: 0.5, ay: 0.9, draw: drawLapak },
    mist: { w: 4.0, a: 0.28, ax: 0.5, ay: 0.5, draw: drawMist },
    glow: { w: 0.3, a: 1.0, ax: 0.5, ay: 0.5, draw: drawGlow },
    glow_y: { w: 0.3, a: 1.0, ax: 0.5, ay: 0.5, draw: drawGlowYellow }
  };
  (function () {
    var i;
    for (i = 0; i < 5; i++) (function (s) {
      DEF['crop_ubijalar_' + s] = { w: 0.78, a: 0.8, ax: 0.5, ay: 0.93, draw: function (g) { drawCrop(g, s); } };
    })(i);
    for (i = 0; i < 4; i++) (function (f) {
      DEF['chicken_' + f] = { w: 0.26, a: 1.0, ax: 0.5, ay: 0.92, draw: function (g) { drawChicken(g, f); } };
    })(i);
  })();

  /* ------------------------------------------------------------------
     WAKTU & LANGIT
     ------------------------------------------------------------------ */
  /* Twilight Menoreh: malam teal-navy (bukan biru murni), senja ungu-jingga, siang biru kehijauan berkabut */
  var TOD = [
    [0, '#06182a', '#143a4a', [8, 30, 60, 0.34], 1],
    [5, '#0a2036', '#1f4a58', [8, 30, 60, 0.3], 0.9],
    [6.5, '#5f7fb0', '#ffc197', [255, 170, 120, 0.1], 0.2],
    [8, '#4a9fd6', '#c9ece6', [255, 255, 255, 0], 0],
    [12, '#3f9bd8', '#bfe8e4', [255, 255, 255, 0], 0],
    [16.5, '#4d9fd2', '#d4eee6', [255, 235, 200, 0.03], 0],
    [18, '#4a4c92', '#ff9a62', [255, 120, 60, 0.12], 0.25],
    [19.5, '#0f2440', '#2c4a62', [8, 30, 60, 0.3], 0.9],
    [24, '#06182a', '#143a4a', [8, 30, 60, 0.34], 1]
  ];
  function todAt(h) {
    var i = 0;
    while (i < TOD.length - 2 && h >= TOD[i + 1][0]) i++;
    var a = TOD[i], b = TOD[i + 1], t = clamp((h - a[0]) / (b[0] - a[0]), 0, 1);
    return {
      top: mix(a[1], b[1], t), bot: mix(a[2], b[2], t), topHex: t < 0.5 ? a[1] : b[1], botHex: t < 0.5 ? a[2] : b[2],
      tint: [lerp(a[3][0], b[3][0], t), lerp(a[3][1], b[3][1], t), lerp(a[3][2], b[3][2], t), lerp(a[3][3], b[3][3], t)],
      night: lerp(a[4], b[4], t)
    };
  }


  /* ------------------------------------------------------------------
     ASET SENIMAN (dipakai bersama oleh pemandangan kebun dan banner popup)
     ------------------------------------------------------------------ */
  var ASSETS = {}, assetJobs = {};
  function loadAssets(base) {
    if (!base || !global.fetch) return Promise.resolve();
    if (assetJobs[base]) return assetJobs[base];
    assetJobs[base] = global.fetch(base + 'manifest.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
      if (!m) return;
      var jobs = [];
      function def(name, e) {
        var d = DEF[name] || {};
        return { w: e.wTiles || d.w || 1, ax: e.ax != null ? e.ax : (d.ax != null ? d.ax : 0.5), ay: e.ay != null ? e.ay : (d.ay != null ? d.ay : 1) };
      }
      function img(src) {
        return new Promise(function (res) { var im = new global.Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = base + src; });
      }
      var sp = m.sprites || {};
      Object.keys(sp).forEach(function (name) {
        var e = typeof sp[name] === 'string' ? { file: sp[name] } : sp[name], p = def(name, e);
        jobs.push(img(e.file).then(function (im) { if (im) ASSETS[name] = { img: im, sx: 0, sy: 0, sw: im.naturalWidth, sh: im.naturalHeight, w: p.w, ax: p.ax, ay: p.ay }; }));
      });
      var pages = (m.atlases || []).concat(m.atlas ? [m.atlas] : []);   // satu atau beberapa atlas
      pages.forEach(function (pg) {
        if (!pg || !pg.image) return;
        jobs.push(img(pg.image).then(function (im) {
          if (!im) return;
          var fr = pg.frames || {};
          Object.keys(fr).forEach(function (name) {
            var f = fr[name], p = def(name, f);
            ASSETS[name] = { img: im, sx: f.x, sy: f.y, sw: f.w, sh: f.h, w: p.w, ax: p.ax, ay: p.ay };
          });
        }));
      });
      return Promise.all(jobs);
    }).catch(function () { });
    return assetJobs[base];
  }
  function assetCount() { return Object.keys(ASSETS).length; }

  /* ------------------------------------------------------------------
     SCENE
     ------------------------------------------------------------------ */
  function create(opts) {
    var container = opts.container;
    var doc = global.document;
    var canvas = opts.canvas;
    if (!canvas) {
      canvas = doc.createElement('canvas');
      canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none;';
      container.insertBefore ? container.insertBefore(canvas, container.firstChild) : container.appendChild(canvas);
    }
    var ctx = canvas.getContext('2d', { alpha: false });
    function mk(w, h) { var c = opts.makeCanvas ? opts.makeCanvas(w, h) : doc.createElement('canvas'); c.width = w; c.height = h; return c; }

    var S = {
      w: 0, h: 0, dpr: 1, tw: 40, ox: 0, oy: 0, cols: 1, rows: 1, horizon: 0, field: null,
      mode: opts.mode || 'kebun', rumah: null, plots: [], byKey: {}, selected: null, health: 100, hemat: !!opts.hemat, t: 0, hour: 12, skyKey: -1,
      sky: null, ground: null, running: false, last: 0, drawN: 0, dtAvg: 0, fpsAvg: 30, frames: 0, assets: 0
    };
    var cache = {}, override = ASSETS, labels = {}, pills = {}, emojiCache = {}, signSprite = null, rafId = 0, fx = [], chickens = [], clouds = [], mists = [], flies = [], fireflies = [];
    var rnd = rngOf(4242), debug = !!opts.debug, tod = todAt(12), resizeTimer = 0, disposed = false, ro = null;

    function dprNow() { return Math.min(global.devicePixelRatio || 1, S.hemat ? 1 : 1.75); }
    function getHour() {
      if (typeof opts.hourOverride === 'number') return opts.hourOverride;
      var d = new Date(); return d.getHours() + d.getMinutes() / 60;
    }

    /* ---- sprite ---- */
    function spr(name) {
      var o = override[name]; if (o) return o;
      var c = cache[name]; if (c) return c;
      var d = DEF[name]; if (!d) return null;
      var dw = Math.max(2, Math.round(d.w * S.tw * S.dpr));
      var dh = Math.max(2, Math.round(dw * d.a));
      var cv = mk(dw, dh), g = cv.getContext('2d');
      g.scale(dw / 100, dw / 100);
      d.draw(g);
      c = cache[name] = { img: cv, sx: 0, sy: 0, sw: dw, sh: dh, w: d.w, ax: d.ax, ay: d.ay };
      return c;
    }
    function blit(c, x, y, sc, alpha) {
      if (!c) return;
      var dw = c.w * S.tw * (sc || 1), dh = dw * (c.sh / c.sw);
      if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
      ctx.drawImage(c.img, c.sx, c.sy, c.sw, c.sh, x - c.ax * dw, y - c.ay * dh, dw, dh);
      if (alpha != null && alpha < 1) ctx.globalAlpha = 1;
      S.drawN++;
    }
    function blitRot(c, x, y, sc, rot, alpha) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); blit(c, 0, 0, sc, alpha); ctx.restore();
    }

    /* ---- tata letak ---- */
    function P(gx, gy) { return { x: S.ox + (gx - gy) * S.tw / 2, y: S.oy + (gx + gy) * S.tw / 4 }; }

    // tinggi puncak bangunan paling atas (untuk memastikan tidak tertutup bar XP di atas area kebun)
    function decorTop() {
      var top = 1e9;
      for (var i = 0; i < decor.length; i++) {
        var d = decor[i], q = P(d.gx, d.gy), sp = spr(d.name); if (!sp) continue;
        var dw = sp.w * S.tw * (d.sc || 1), dh = dw * (sp.sh / sp.sw);
        top = Math.min(top, q.y - dh * sp.ay);
      }
      return top;
    }

    function layoutRumah() {
      S.field = { x: 0, y: 0, w: S.w, h: S.h };
      S.cols = 3; S.rows = 3; S.narrow = false;
      S.tw = clamp(Math.min(S.w / 4.9, S.h / 3.3), 36, 130);
      S.ox = S.w / 2; S.oy = S.h * 0.74 - 0.5 * S.tw;      // rumah berdiri di tengah, sedikit di bawah pertengahan
      S.horizon = clamp(P(-1, -1).y - S.tw * 0.2, S.h * 0.18, S.h * 0.5);
      buildDecor();
    }

    function layout() {
      if (S.mode === 'rumah') { layoutRumah(); return; }
      var fr = (opts.getFieldRect && opts.getFieldRect()) || { x: 0, y: S.h * 0.25, w: S.w, h: S.h * 0.6 };
      S.field = fr;
      var n = Math.max(1, S.plots.length);
      var cols = n === 1 ? 1 : Math.ceil(Math.sqrt(n * 1.35)), rows = Math.ceil(n / cols);
      S.cols = cols; S.rows = rows;
      // ukuran dihitung dari kumpulan LAHAN saja (petak rumput di tepi boleh terpotong layar)
      var uwP = (cols + rows) / 2 + 0.35;               // lebar kumpulan lahan (satuan petak)
      var uhP = (cols + rows - 2) / 4 + 1.0;            // jarak antar pusat petak + tanaman menjulang + bedeng
      var uhN = (cols + rows - 2) / 4 + 2.0;            // idem + barisan bangunan di belakang (layar sempit)
      var twW = clamp(Math.min(fr.w * 1.04 / uwP, (fr.h - 4) / uhP), 36, 124);
      // layar sempit: lahan memenuhi lebar, ATAU barisan bangunan (±8,6 petak) tidak muat di samping
      S.narrow = (S.w < 8.6 * twW) || (S.w / 2 - (cols + rows) / 4 * twW < 0.5 * twW);
      S.tw = S.narrow ? clamp(Math.min(fr.w * 1.04 / uwP, (fr.h - 6) / uhN), 36, 124) : twW;   // batas atas: dekorasi tidak raksasa saat lahan sedikit
      var gcx = (cols - 1) / 2, gcy = (rows - 1) / 2;
      for (var pass = 0; pass < 2; pass++) {
        S.ox = fr.x + fr.w / 2 - (gcx - gcy) * S.tw / 2;
        S.oy = fr.y + fr.h / 2 - ((cols + rows - 2) * S.tw / 4 - 0.4 * S.tw) / 2;
        buildDecor();
        if (!S.narrow) break;
        // layar sempit: seluruh susunan (bangunan + lahan) harus muat di dalam area kebun, di bawah bar XP
        var top = decorTop(), bottom = P(cols - 1, rows - 1).y + 0.3 * S.tw, avail = fr.h - 6, need = bottom - top;
        if (need <= avail) { S.oy += (fr.y + 3 + (avail - need) / 2) - top; break; }
        S.tw = clamp(S.tw * avail / need * 0.97, 36, 124);
      }
      S.horizon = Math.max(S.h * 0.16, P(-1.5, -1.5).y - S.tw * 0.35);
      for (var i = 0; i < S.plots.length; i++) {
        var p = S.plots[i], c = i % cols, r = Math.floor(i / cols);
        p.gx = c; p.gy = r; var q = P(c, r); p.x = q.x; p.y = q.y;
      }
    }

    /* ---- lapisan statis ---- */
    function buildSky() {
      var w = Math.round(S.w * S.dpr), h = Math.round(S.h * S.dpr);
      var cv = S.sky && S.sky.width === w && S.sky.height === h ? S.sky : mk(w, h), g = cv.getContext('2d');
      g.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      var hz = S.horizon, i, x;
      g.fillStyle = lin(g, 0, 0, 0, hz + 2, [0, tod.top, 1, tod.bot]); g.fillRect(0, 0, S.w, hz + 2);
      var rr = rngOf(99);
      if (tod.night > 0.35) {
        g.fillStyle = 'rgba(255,255,255,' + (0.9 * tod.night).toFixed(2) + ')';
        for (i = 0; i < 46; i++) { var sx = rr() * S.w, sy = rr() * hz * 0.8, sz = 0.6 + rr() * 1.1; g.fillRect(sx, sy, sz, sz); }
      }
      var hr = S.hour, sunUp = hr > 6 && hr < 18;
      var sp = sunUp ? (hr - 6) / 12 : (hr >= 18 ? (hr - 18) / 12 : (hr + 6) / 12);
      var bx = lerp(0.12, 0.88, sp) * S.w, by = hz - Math.sin(sp * Math.PI) * hz * 0.72 - 6;
      var rad = Math.max(14, S.tw * 0.32), gl = g.createRadialGradient(bx, by, 0, bx, by, rad * 3.2);
      if (sunUp) { gl.addColorStop(0, 'rgba(255,250,200,0.95)'); gl.addColorStop(0.25, 'rgba(255,230,140,0.45)'); gl.addColorStop(1, 'rgba(255,220,120,0)'); }
      else { gl.addColorStop(0, 'rgba(240,245,255,0.9)'); gl.addColorStop(0.3, 'rgba(200,215,255,0.3)'); gl.addColorStop(1, 'rgba(190,205,255,0)'); }
      g.fillStyle = gl; g.fillRect(bx - rad * 3.2, by - rad * 3.2, rad * 6.4, rad * 6.4);
      g.beginPath(); g.arc(bx, by, rad * 0.62, 0, TAU); g.fillStyle = sunUp ? '#fff6c8' : '#f4f6ff'; g.fill();
      var layers = [[0.5, 0.0035, 0.42, 5], [0.34, 0.0052, 0.55, 11], [0.22, 0.0075, 0.7, 23]];
      var HILL = ['#7fb0b8', '#3f8a7a', '#1f6a52'], CANOPY = ['', '#2f7a6a', '#16573f'];
      for (var L = 0; L < 3; L++) {
        var amp = Math.max(hz, S.h * 0.22) * layers[L][0] * 0.5, fq = layers[L][1], ph = layers[L][3];
        var ridge = function (xx) { return hz - amp * (0.55 + 0.3 * Math.sin(xx * fq + ph) + 0.15 * Math.sin(xx * fq * 2.7 + ph * 2)); };
        g.beginPath(); g.moveTo(0, hz + 2);
        for (x = 0; x <= S.w + 6; x += 6) g.lineTo(x, ridge(x));
        g.lineTo(S.w + 6, hz + 2); g.closePath();
        g.fillStyle = mix(tod.botHex, HILL[L], layers[L][2]); g.fill();
        if (L > 0) {   // tajuk hutan di punggung bukit
          g.fillStyle = mix(tod.botHex, CANOPY[L], Math.min(0.85, layers[L][2] + 0.1));
          for (x = 0; x <= S.w + 6; x += 8) { g.beginPath(); g.arc(x + (rr() * 4 - 2), ridge(x) + 1.5, 3 + rr() * (L === 2 ? 5 : 3.5), 0, TAU); g.fill(); }
        }
      }
      S.sky = cv; S.skyKey = Math.floor(S.hour * 6);
    }

    function buildGround() {
      var w = Math.round(S.w * S.dpr), h = Math.round(S.h * S.dpr);
      var cv = S.ground && S.ground.width === w && S.ground.height === h ? S.ground : mk(w, h), g = cv.getContext('2d');
      g.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      g.clearRect(0, 0, S.w, S.h);
      var hz = S.horizon;
      g.fillStyle = lin(g, 0, hz, 0, S.h, [0, '#62ab78', 0.35, '#3f8a5c', 1, '#1f5a45']); g.fillRect(0, hz, S.w, S.h - hz);
      var rr = rngOf(5), i;
      g.lineCap = 'round';
      for (i = 0; i < 520; i++) {
        var x = rr() * S.w, y = hz + rr() * (S.h - hz), k = (y - hz) / (S.h - hz);
        g.strokeStyle = rr() > 0.5 ? 'rgba(8,66,52,' + (0.2 + k * 0.25).toFixed(2) + ')' : 'rgba(190,245,205,0.16)';
        g.lineWidth = 0.8 + k * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rr() - 0.5) * 3, y - 2 - k * 4); g.stroke();
      }
      var cols = S.cols, rows = S.rows, tiles = [], gx, gy;
      for (gy = -2; gy <= rows + 1; gy++) for (gx = -2; gx <= cols + 1; gx++) tiles.push([gx, gy]);
      tiles.sort(function (a, b) { return (a[0] + a[1]) - (b[0] + b[1]); });
      var dw = S.tw * 1.02;
      for (i = 0; i < tiles.length; i++) {
        var t = tiles[i], q = P(t[0], t[1]), sp = spr('tile_grass_' + (((t[0] * 7 + t[1] * 13) & 3) === 0 ? 1 : 0));
        g.drawImage(sp.img, sp.sx, sp.sy, sp.sw, sp.sh, q.x - dw / 2, q.y - dw * (sp.sh / sp.sw) / 2, dw, dw * (sp.sh / sp.sw));
      }
      S.ground = cv;
    }

    function labelSpr(num) {
      var key = num + '@' + Math.round(S.tw), c = labels[key]; if (c) return c;
      var fs = Math.max(9, Math.round(S.tw * 0.13)), w = Math.round(fs * 2.6 * S.dpr), h = Math.round(fs * 1.5 * S.dpr);
      var cv = mk(w, h), g = cv.getContext('2d'); g.scale(S.dpr, S.dpr);
      g.font = '800 ' + fs + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 3; g.strokeStyle = 'rgba(30,15,5,0.85)'; g.strokeText('#' + num, w / S.dpr / 2, h / S.dpr / 2);
      g.fillStyle = '#fff3c4'; g.fillText('#' + num, w / S.dpr / 2, h / S.dpr / 2);
      c = labels[key] = { img: cv, sx: 0, sy: 0, sw: w, sh: h, cw: w / S.dpr, ch: h / S.dpr };
      return c;
    }

    /* ---- Rumah: pernak-pernik (emoji dirender sekali) dan papan nama berfoto profil ---- */
    function emojiSpr(ch, px) {
      var key = ch + '@' + px, c = emojiCache[key]; if (c) return c;
      var size = Math.max(8, Math.round(px * S.dpr * 1.25)), cv = mk(size, size), g = cv.getContext('2d');
      g.font = Math.round(px * S.dpr) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(ch, size / 2, size * 0.82);
      c = emojiCache[key] = { img: cv, w: size / S.dpr, h: size / S.dpr };
      return c;
    }
    function signSpr() {
      if (signSprite) return signSprite;
      var R = S.rumah || {}, wPx = Math.round(S.tw * 1.3), hPx = Math.round(wPx * 0.95);
      var cv = mk(Math.max(8, Math.round(wPx * S.dpr)), Math.max(8, Math.round(hPx * S.dpr))), g = cv.getContext('2d');
      g.scale(cv.width / 100, cv.width / 100);
      ell(g, 50, 92, 36, 4, 'rgba(0,0,0,0.22)');
      poly(g, [[24, 58], [31, 58], [31, 94], [24, 94]], '#6b4a2a');
      poly(g, [[69, 58], [76, 58], [76, 94], [69, 94]], '#6b4a2a');
      g.beginPath(); g.moveTo(8, 4); g.lineTo(92, 4); g.quadraticCurveTo(98, 4, 98, 10); g.lineTo(98, 56); g.quadraticCurveTo(98, 64, 92, 64); g.lineTo(8, 64); g.quadraticCurveTo(2, 64, 2, 56); g.lineTo(2, 10); g.quadraticCurveTo(2, 4, 8, 4);
      g.fillStyle = lin(g, 0, 4, 0, 64, [0, '#c08a52', 1, '#8a5a30']); g.fill(); g.strokeStyle = '#5a3a1a'; g.lineWidth = 2; g.stroke();
      var cx = 27, cy = 34, r = 20;
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
      var im = R.avatarImg;
      if (im && im.width) {
        var sw0 = Math.min(im.width, im.height);
        g.drawImage(im, (im.width - sw0) / 2, (im.height - sw0) / 2, sw0, sw0, cx - r, cy - r, r * 2, r * 2);
      } else {
        g.fillStyle = '#4f8a68'; g.fillRect(cx - r, cy - r, r * 2, r * 2);
        g.fillStyle = '#e9ffe0'; g.font = '800 22px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(((R.username || '?').replace('@', '').charAt(0) || '?').toUpperCase(), cx, cy + 1);
      }
      g.restore();
      g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.strokeStyle = '#fff3c4'; g.lineWidth = 2.6; g.stroke();
      g.textAlign = 'left'; g.textBaseline = 'middle';
      var nm = '@' + String(R.username || '').replace('@', ''), fs = 11;
      g.font = '800 ' + fs + 'px system-ui, sans-serif';
      while (g.measureText(nm).width > 44 && fs > 7.5) { fs -= 0.5; g.font = '800 ' + fs + 'px system-ui, sans-serif'; }
      while (g.measureText(nm).width > 44 && nm.length > 4) nm = nm.slice(0, -2) + '…';
      g.fillStyle = '#fff3c4'; g.fillText(nm, 52, 28);
      g.font = '600 7.5px system-ui, sans-serif'; g.fillStyle = '#f1d9a8';
      var sub = String(R.sub || ''); while (g.measureText(sub).width > 44 && sub.length > 3) sub = sub.slice(0, -2);
      g.fillText(sub, 52, 42);
      signSprite = { img: cv, w: wPx, h: hPx };
      return signSprite;
    }

    function pillSpr(text) {
      var key = text + '@' + Math.round(S.tw), c = pills[key]; if (c) return c;
      var fs = Math.max(10, Math.round(S.tw * 0.115)), pad = fs * 0.6;
      var m = mk(4, 4).getContext('2d'); m.font = '800 ' + fs + 'px system-ui, sans-serif';
      var w = Math.ceil(m.measureText(text).width + pad * 2), h = Math.ceil(fs * 1.55);
      var cv = mk(Math.ceil(w * S.dpr), Math.ceil(h * S.dpr)), g = cv.getContext('2d'); g.scale(S.dpr, S.dpr);
      var r = h / 2;
      g.beginPath(); g.moveTo(r, 0.5); g.lineTo(w - r, 0.5); g.arc(w - r, h / 2, r - 0.5, -Math.PI / 2, Math.PI / 2); g.lineTo(r, h - 0.5); g.arc(r, h / 2, r - 0.5, Math.PI / 2, Math.PI * 1.5); g.closePath();
      g.fillStyle = 'rgba(8,38,40,0.86)'; g.fill(); g.strokeStyle = 'rgba(255,214,150,0.75)'; g.lineWidth = 1.2; g.stroke();
      g.font = '800 ' + fs + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff3c4';
      g.fillText(text, w / 2, h / 2 + 0.5);
      c = pills[key] = { img: cv, w: w, h: h };
      return c;
    }

    function rebuild() {
      S.dpr = dprNow();
      canvas.width = Math.max(1, Math.round(S.w * S.dpr)); canvas.height = Math.max(1, Math.round(S.h * S.dpr));
      cache = {}; labels = {}; pills = {}; emojiCache = {}; signSprite = null;
      S.hour = getHour(); tod = todAt(S.hour);
      layout(); buildSky(); buildGround(); initAmbient();
    }

    function initAmbient() {
      var i;
      var keep = chickens.length ? chickens : null;
      chickens = keep || [];
      while (chickens.length < 3) chickens.push({ gx: -0.4 + chickens.length * 1.3, gy: S.rows + 0.45, tx: 0, ty: 0, wait: rnd() * 2, f: 0, ft: 0, dir: 1, walking: false, hop: 0, say: 0 });
      clouds = [];
      for (i = 0; i < 4; i++) clouds.push({ x: rnd() * S.w, y: S.horizon * (0.12 + rnd() * 0.5), v: 5 + rnd() * 8, n: i % 3, s: 0.8 + rnd() * 0.6 });
      mists = [
        { x: rnd() * S.w, y: S.horizon + 2, v: 3.5, s: 1.9, a: 0.42 },
        { x: rnd() * S.w, y: S.horizon + S.tw * 0.45, v: 5, s: 1.5, a: 0.26 },
        { x: rnd() * S.w, y: (S.field ? S.field.y + S.field.h * 0.5 : S.horizon + S.tw), v: -4, s: 1.7, a: 0.12 }
      ];
      flies = [{ ph: 0, sp: 0.7 }, { ph: 2.4, sp: 0.55 }];
      fireflies = [];
      for (i = 0; i < 12; i++) fireflies.push({ x: rnd(), y: rnd(), ph: rnd() * TAU, sp: 0.4 + rnd() * 0.6 });
    }

    /* ---- plots ---- */
    function stageOf(p) {
      if (p.state !== 'planted') return -1;
      if (p.ready) return 4;
      var g = p.growth || 0;
      return g < 0.18 ? 0 : g < 0.45 ? 1 : g < 0.75 ? 2 : 3;
    }
    function setPlots(list, extra) {
      if (extra && extra.claim) list = list.concat([{ key: '__claim', number: 0, state: 'claim' }]);   // petak kosong untuk klaim lahan baru
      var prev = S.byKey, next = {}, arr = [];
      for (var i = 0; i < list.length; i++) {
        var it = list[i], p = prev[it.key] || { key: it.key, phase: rnd() * TAU, pop: 0, wet: 0, shake: 0, stage: -2 };
        p.number = it.number; p.state = it.state || 'empty'; p.growth = it.growth || 0; p.ready = !!it.ready; p.badge = it.badge || null; p.nursery = it.nursery | 0;
        if (it.key === '__claim') p.badge = 'add';
        var st = stageOf(p);
        if (p.stage !== st && p.stage !== -2) p.pop = 1;
        p.stage = st;
        next[it.key] = p; arr.push(p);
      }
      var changed = arr.length !== S.plots.length;
      S.plots = arr; S.byKey = next;
      if (changed || !S.field) { layout(); buildGround(); } else layout();
    }

    /* ---- fx ---- */
    function addFx(o) { if (fx.length < 90) fx.push(o); }
    function burstFx(key, type, extra) {
      var p = S.byKey[key]; if (!p) return;
      var tw = S.tw, i, x = p.x, y = p.y;
      if (type === 'water') {
        p.wet = 1;
        for (i = 0; i < 12; i++) addFx({ t: 'drop', x: x + (rnd() - 0.5) * tw * 0.55, y: y - tw * (0.45 + rnd() * 0.3), vx: 0, vy: 180 + rnd() * 120, life: 0.55, max: 0.55, gy: y + (rnd() - 0.5) * tw * 0.12, s: 0.8 + rnd() * 0.6 });
      } else if (type === 'fert') {
        for (i = 0; i < 9; i++) addFx({ t: 'spark', x: x + (rnd() - 0.5) * tw * 0.5, y: y - tw * 0.05, vx: (rnd() - 0.5) * 30, vy: -40 - rnd() * 50, life: 0.9, max: 0.9, s: 0.8 + rnd() * 0.9, rot: rnd() * TAU });
        for (i = 0; i < 4; i++) addFx({ t: 'leaf', x: x + (rnd() - 0.5) * tw * 0.4, y: y - tw * 0.1, vx: (rnd() - 0.5) * 60, vy: -70 - rnd() * 40, life: 0.8, max: 0.8, s: 1, rot: rnd() * TAU });
      } else if (type === 'plant') {
        p.pop = 1;
        for (i = 0; i < 8; i++) addFx({ t: 'dirt', x: x + (rnd() - 0.5) * tw * 0.3, y: y, vx: (rnd() - 0.5) * 90, vy: -90 - rnd() * 70, life: 0.5, max: 0.5, s: 1 + rnd() });
        for (i = 0; i < 5; i++) addFx({ t: 'leaf', x: x, y: y - tw * 0.1, vx: (rnd() - 0.5) * 80, vy: -90 - rnd() * 50, life: 0.7, max: 0.7, s: 1, rot: rnd() * TAU });
      } else if (type === 'claim') {
        addFx({ t: 'ring', x: x, y: y, life: 0.8, max: 0.8 });
        for (i = 0; i < 10; i++) addFx({ t: 'spark', x: x + (rnd() - 0.5) * tw * 0.7, y: y - rnd() * tw * 0.3, vx: (rnd() - 0.5) * 40, vy: -50 - rnd() * 40, life: 0.9, max: 0.9, s: 1, rot: rnd() * TAU });
      } else if (type === 'harvest') {
        p.shake = 1;
        var tg = (opts.coinTarget && opts.coinTarget()) || { x: S.w - 40, y: 60 };
        for (i = 0; i < 9; i++) addFx({ t: 'coin', x: x + (rnd() - 0.5) * tw * 0.3, y: y - tw * 0.25, vx: (rnd() - 0.5) * 220, vy: -190 - rnd() * 110, life: 1.6, max: 1.6, age: 0, tx: tg.x, ty: tg.y, delay: i * 0.04 });
        for (i = 0; i < 8; i++) addFx({ t: 'spark', x: x + (rnd() - 0.5) * tw * 0.6, y: y - tw * 0.3, vx: (rnd() - 0.5) * 100, vy: -80 - rnd() * 70, life: 0.8, max: 0.8, s: 1, rot: rnd() * TAU });
        if (extra && extra.text) addFx({ t: 'text', x: x, y: y - tw * 0.5, vx: 0, vy: -34, life: 1.4, max: 1.4, text: extra.text });
      }
    }

    /* ---- pembaruan ---- */
    function update(dt) {
      S.t += dt;
      var i, c, p;
      for (i = 0; i < clouds.length; i++) { c = clouds[i]; c.x += c.v * dt; if (c.x - S.tw * 1.4 > S.w) c.x = -S.tw * 1.6; }
      for (i = 0; i < decor.length; i++) {   // asap cerobong dapur
        var dd = decor[i]; if (!dd.smoke) continue;
        dd.smokeT = (dd.smokeT || 0) + dt;
        if (dd.smokeT > 0.6) {
          dd.smokeT = 0;
          var sp0 = spr(dd.name), q0 = P(dd.gx, dd.gy), dw0 = sp0.w * S.tw * (dd.sc || 1), dh0 = dw0 * (sp0.sh / sp0.sw), ch = (DEF[dd.name] && DEF[dd.name].chim) || [0.7, 0.26];
          addFx({ t: 'smoke', x: q0.x + (ch[0] - sp0.ax) * dw0, y: q0.y + (ch[1] - sp0.ay) * dh0, vx: 7 + rnd() * 5, vy: -15 - rnd() * 8, life: 2.4, max: 2.4 });
        }
      }
      for (i = 0; i < mists.length; i++) {
        var mm = mists[i], half = S.tw * 4 * mm.s / 2; mm.x += mm.v * dt;
        if (mm.v > 0 && mm.x - half > S.w) mm.x = -half; else if (mm.v < 0 && mm.x + half < 0) mm.x = S.w + half;
      }
      for (i = 0; i < S.plots.length; i++) { p = S.plots[i]; p.pop = Math.max(0, p.pop - dt * 2.2); p.wet = Math.max(0, p.wet - dt / 7); p.shake = Math.max(0, p.shake - dt * 2.5); }
      for (i = 0; i < chickens.length; i++) {
        c = chickens[i];
        c.hop = Math.max(0, c.hop - dt * 3); c.say = Math.max(0, c.say - dt);
        if (c.walking) {
          var dx = c.tx - c.gx, dy = c.ty - c.gy, d = Math.sqrt(dx * dx + dy * dy), sp = 0.32 * dt;
          if (d < sp) { c.gx = c.tx; c.gy = c.ty; c.walking = false; c.wait = 1 + rnd() * 3.5; c.f = 0; }
          else { c.gx += dx / d * sp; c.gy += dy / d * sp; c.dir = (dx - dy) >= 0 ? 1 : -1; c.ft += dt; if (c.ft > 0.16) { c.ft = 0; c.f = (c.f + 1) & 3; } }
        } else {
          c.wait -= dt;
          if (c.wait <= 0) {
            var zone = rnd();
            if (zone < 0.6) { c.tx = -0.9 + rnd() * (S.cols + 0.9); c.ty = S.rows + 0.1 + rnd() * 1.0; }
            else if (zone < 0.8) { c.tx = -1.4 + rnd() * 0.8; c.ty = rnd() * (S.rows + 0.5); }
            else { c.tx = S.cols - 0.4 + rnd() * 0.9; c.ty = 0.4 + rnd() * (S.rows - 0.2); }
            c.walking = true;
          }
        }
      }
      for (i = fx.length - 1; i >= 0; i--) {
        var f = fx[i];
        if (f.t === 'coin') {
          if (f.delay > 0) { f.delay -= dt; continue; }
          f.age += dt;
          if (f.age < 0.38) { f.vy += 520 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= (1 - 2 * dt); }
          else {
            var ddx = f.tx - f.x, ddy = f.ty - f.y, dist = Math.sqrt(ddx * ddx + ddy * ddy), spd = 380 + (f.age - 0.38) * 900;
            if (dist < 14 || f.age > 2.4) { if (opts.onCoin) opts.onCoin(); addFx({ t: 'spark', x: f.tx, y: f.ty, vx: 0, vy: 0, life: 0.3, max: 0.3, s: 1.2, rot: 0 }); fx.splice(i, 1); continue; }
            f.x += ddx / dist * spd * dt; f.y += ddy / dist * spd * dt;
          }
          continue;
        }
        f.life -= dt;
        if (f.life <= 0) {
          if (f.t === 'drop') addFx({ t: 'ripple', x: f.x, y: f.gy, life: 0.4, max: 0.4 });
          fx.splice(i, 1); continue;
        }
        if (f.t === 'drop') { f.y += f.vy * dt; if (f.y >= f.gy) f.life = 0; }
        else if (f.t !== 'ring' && f.t !== 'ripple') { f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt; if (f.t === 'dirt' || f.t === 'leaf') f.vy += 300 * dt; if (f.rot != null) f.rot += dt * 4; }
      }
    }

    /* ---- gambar ---- */
    var items = [];
    function addItem(y, fn, a, b) { items.push({ y: y, fn: fn, a: a, b: b }); }

    function drawPlotBed(p) {
      if (p.state === 'claim') {   // petak kosong: ketuk untuk klaim lahan baru
        var pu = 0.5 + 0.5 * Math.sin(S.t * 2.4), cw = S.tw * 0.47, ch = cw / 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - ch); ctx.lineTo(p.x + cw, p.y); ctx.lineTo(p.x, p.y + ch); ctx.lineTo(p.x - cw, p.y); ctx.closePath();
        ctx.fillStyle = 'rgba(255,233,168,' + (0.13 + 0.1 * pu).toFixed(2) + ')'; ctx.fill();
        ctx.setLineDash([7, 5]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,233,168,0.85)'; ctx.stroke(); ctx.setLineDash([]);
        var pl = pillSpr('Klaim lahan');
        ctx.drawImage(pl.img, 0, 0, pl.img.width, pl.img.height, p.x - pl.w / 2, p.y + S.tw * 0.2, pl.w, pl.h); S.drawN += 2;
        return;
      }
      var barren = p.state === 'barren';
      var sx = p.shake > 0 ? Math.sin(S.t * 60) * 2 * p.shake : 0;
      blit(spr(barren ? 'bed_barren' : 'bed_fertile'), p.x + sx, p.y);
      if (p.wet > 0.02) {
        var tw = S.tw; ctx.globalAlpha = 0.3 * p.wet; ctx.fillStyle = '#2a1405';
        ctx.beginPath(); ctx.moveTo(p.x, p.y - tw * 0.23); ctx.lineTo(p.x + tw * 0.45, p.y); ctx.lineTo(p.x, p.y + tw * 0.23); ctx.lineTo(p.x - tw * 0.45, p.y); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      }
      if (p.key === S.selected) {
        var pulse = 0.5 + 0.5 * Math.sin(S.t * 4), w = S.tw * (0.5 + 0.015 * pulse), hh = w / 2;
        ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,230,120,' + (0.7 + 0.3 * pulse).toFixed(2) + ')';
        ctx.beginPath(); ctx.moveTo(p.x, p.y - hh); ctx.lineTo(p.x + w, p.y); ctx.lineTo(p.x, p.y + hh); ctx.lineTo(p.x - w, p.y); ctx.closePath(); ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke();
        S.drawN += 2;
      }
      if (p.key === S.selected) {
        var lb = labelSpr(p.number);
        ctx.drawImage(lb.img, lb.sx, lb.sy, lb.sw, lb.sh, p.x - lb.cw / 2, p.y + S.tw * 0.17, lb.cw, lb.ch); S.drawN++;
      }
    }
    function drawPlotCrop(p) {
      var sc = 1 + 0.08 * Math.sin(p.pop * Math.PI) * 1.6;
      if (p.ready) sc *= 1 + 0.025 * Math.sin(S.t * 4.2 + p.phase);
      var sway = Math.sin(S.t * 1.7 + p.phase) * (0.012 + 0.022 * Math.min(1, (p.growth || 0) + (p.ready ? 0.4 : 0)));
      var c = spr('crop_ubijalar_' + p.stage);
      blitRot(c, p.x, p.y + S.tw * 0.03, sc, sway);
      if (p.ready) {
        var gl = spr('glow_y'), a = 0.35 + 0.25 * Math.sin(S.t * 3 + p.phase);
        blit(gl, p.x, p.y - S.tw * 0.12, 1.8, a);
      }
    }
    function drawNursery(p) {
      var pot = spr('pot'), n = Math.min(3, p.nursery), tw = S.tw, i;
      var offs = [[-0.2, -0.06], [0.2, -0.06], [0, 0.07]];
      for (i = 0; i < n; i++) blit(pot, p.x + offs[i][0] * tw, p.y + offs[i][1] * tw + tw * 0.04, 1.1);
    }
    function drawBadge(p) {
      var kind = p.badge; if (!kind) return;
      var top = p.stage >= 0 ? -S.tw * (0.18 + 0.11 * Math.min(4, p.stage)) : -S.tw * 0.12;
      var bob = Math.sin(S.t * 3.2 + p.phase) * 3;
      blit(spr('badge_' + kind), p.x, p.y + top - 6 + bob, 1.25);
      if (p.key === S.selected) {
        ctx.fillStyle = '#ffd84d'; var ay = p.y + top - S.tw * 0.46 + Math.sin(S.t * 5) * 3;
        ctx.beginPath(); ctx.moveTo(p.x - 7, ay); ctx.lineTo(p.x + 7, ay); ctx.lineTo(p.x, ay + 10); ctx.closePath(); ctx.fill();
      }
    }
    function drawDecor(d) {
      if (d.emoji) {
        var qe = P(d.gx, d.gy);
        ctx.globalAlpha = 0.25; ctx.fillStyle = '#10300f'; ctx.beginPath(); ctx.ellipse(qe.x, qe.y + 1, d.bw * 0.4, d.bw * 0.13, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        var e = emojiSpr(d.emoji, Math.round(d.bw)); ctx.drawImage(e.img, 0, 0, e.img.width, e.img.height, qe.x - e.w / 2, qe.y - e.h * 0.82, e.w, e.h); S.drawN++;
        return;
      }
      if (d.sign) { var qs = P(d.gx, d.gy), sg = signSpr(); ctx.drawImage(sg.img, 0, 0, sg.img.width, sg.img.height, qs.x - sg.w / 2, qs.y - sg.h * 0.95, sg.w, sg.h); S.drawN++; return; }
      var q = P(d.gx, d.gy), sway = d.sway ? Math.sin(S.t * 1.1 + d.ph) * d.sway : 0, c = spr(d.name);
      if (sway) blitRot(c, q.x, q.y, d.sc || 1, sway); else blit(c, q.x, q.y, d.sc || 1);
      if (d.label) {   // bangunan yang bisa diketuk diberi nama
        var p = pillSpr(d.label);
        ctx.drawImage(p.img, 0, 0, p.img.width, p.img.height, q.x - p.w / 2, q.y + S.tw * 0.04, p.w, p.h); S.drawN++;
      }
    }

    var decor = [];
    /* Bangunan yang bisa diketuk (Rumah, Gudang, Olahan, Kompos, Beringin; Pasar di layar lebar).
       Layar sempit : satu barisan di belakang lahan, lebar tiap bangunan dibatasi sehingga TIDAK saling menumpuk.
       Layar lebar  : berjajar di kedua sisi kebun. Dalam kedua mode semuanya tetap di dalam area kebun (di bawah bar XP). */
    var YARD = [[0.0, 2.3], [2.0, 2.5], [-0.7, 1.3], [2.9, 1.1], [0.7, 3.1], [1.9, 3.3], [-1.1, 2.6], [3.0, 2.9], [1.0, -0.9], [2.4, -0.6], [-0.4, 3.4], [-1.2, 0.2]];
    function buildRumahDecor() {
      if (!S.w || !S.tw) return;
      var R = S.rumah || {}, tier = R.tier || 1, tw = S.tw, i;
      var hs = tier >= 3 ? ['house_joglo', 1.0] : tier === 2 ? ['house_kayu', 1.1] : ['house_gubuk', 1.25];
      var out = [{ name: hs[0], gx: 1, gy: 1, sc: hs[1] }];
      out.push({ name: 'tree_kelapa', gx: -1.7, gy: 0.2, sc: 0.95, sway: 0.016, ph: 0.4 });
      out.push({ name: 'tree_kelapa', gx: 3.9, gy: 2.4, sc: 0.8, sway: 0.016, ph: 2.1 });
      out.push({ name: 'bamboo', gx: 4.2, gy: 0.1, sc: 0.8, sway: 0.01, ph: 3.3 });
      var list = R.decor || [];
      for (i = 0; i < list.length && i < YARD.length; i++) {      // pernak-pernik milik penghuni, ditata di halaman
        var it = list[i], nm = 'decor_' + it.id, slot = YARD[i];
        if (ASSETS[nm]) out.push({ name: nm, gx: slot[0], gy: slot[1], sc: 1, id: 'decor:' + it.id, dname: it.name });
        else out.push({ emoji: it.icon || '🎋', gx: slot[0], gy: slot[1], bw: tw * 0.5, bh: tw * 0.5, id: 'decor:' + it.id, dname: it.name });
      }
      out.push({ sign: true, gx: 4.3, gy: 1.0, bw: tw * 1.3, bh: tw * 1.3 * 0.95, id: 'sign' });
      decor = out;
    }

    function buildDecor() {
      if (S.mode === 'rumah') { buildRumahDecor(); return; }
      if (!S.w || !S.tw) return;
      var lvl = S.health < 30 ? 0 : S.health < 70 ? 1 : 2, R = S.rows, C = S.cols, tw = S.tw;
      var cx = S.ox + ((C - 1) / 2 - (R - 1) / 2) * tw / 2;
      function put(name, dx, sum, o) {      // dx = geseran mendatar dari tengah kebun (px), sum = kedalaman gx+gy
        var diff = (cx + dx - S.ox) / (tw / 2), d = { name: name, gx: (sum + diff) / 2, gy: (sum - diff) / 2 };
        for (var k in o) d[k] = o[k];
        return d;
      }
      function opt(id, label, sc) {
        var o = { sc: sc, id: id, label: label };
        if (id === 'olahan') o.smoke = true;
        if (id === 'beringin') { o.ber = true; o.sway = 0.004; o.ph = 1.3; }
        return o;
      }
      var i, it, sp;
      decor = [];
      if (S.narrow) {
        var items = [['house_joglo', 0.165, 'rumah', 'Rumah'], ['lumbung', 0.165, 'gudang', 'Gudang'], ['dapur', 0.145, 'olahan', 'Olahan'], ['kompos', 0.15, 'kompos', 'Kompos'], ['tree_beringin_' + lvl, 0.19, 'beringin', 'Beringin']];
        var gap = 0.02 * S.w, total = gap * (items.length - 1);
        for (i = 0; i < items.length; i++) total += items[i][1] * S.w;
        var x = (S.w - total) / 2;
        for (i = 0; i < items.length; i++) {
          it = items[i]; sp = spr(it[0]);
          var w = it[1] * S.w, sc = sp ? Math.min(0.95, w / (sp.w * tw)) : 0.6;
          decor.push(put(it[0], x + w / 2 - cx, -4.2, opt(it[2], it[3], sc)));   // cukup jauh di belakang agar penanda lahan tidak menutupi label
          x += w + gap;
        }
      } else {
        var clusterHalf = (C + R) / 4 * tw, mid = (C + R - 2) / 2;
        var sides = [
          [-1, [['lumbung', 'gudang', 'Gudang', 0.8, 0.9], ['house_joglo', 'rumah', 'Rumah', 0.78, -0.1], ['tree_beringin_' + lvl, 'beringin', 'Beringin', 0.64, -1.0]]],
          [1, [['kompos', 'kompos', 'Kompos', 0.85, 0.9], ['dapur', 'olahan', 'Olahan', 0.8, -0.1], ['lapak', 'pasar', 'Pasar', 0.8, -1.0]]]
        ];
        sides.forEach(function (side) {
          var off = clusterHalf + 0.35 * tw;
          side[1].forEach(function (b2) {
            var sp2 = spr(b2[0]), w2 = sp2 ? sp2.w * tw * b2[3] : 0, dx = side[0] * (off + w2 / 2);
            if (Math.abs(dx) + w2 / 2 > S.w / 2 - 4) return;   // tidak muat -> dilewati
            decor.push(put(b2[0], dx, mid + b2[4], opt(b2[1], b2[2], b2[3])));
            off += w2 + 0.25 * tw;
          });
          if (off + 0.6 * tw < S.w / 2 - 6) decor.push(put(side[0] < 0 ? 'bamboo' : 'tree_kelapa', side[0] * (off + 0.3 * tw), mid + 1.4, { sc: 0.75, sway: 0.012, ph: side[0] + 3 }));
        });
      }
    }

    function draw() {
      if (!S.w || !S.h || !S.sky || !S.ground) return; // belum ada ukuran (layar kebun tertutup) -> jangan menggambar
      var t0 = global.performance ? global.performance.now() : 0, i, j;
      S.drawN = 0;
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      var skyKey = Math.floor((S.hour = getHour()) * 6);
      if (skyKey !== S.skyKey) { tod = todAt(S.hour); buildSky(); }
      ctx.drawImage(S.sky, 0, 0, S.w, S.h); S.drawN++;
      for (i = 0; i < clouds.length; i++) { var cl = clouds[i]; blit(spr('cloud_' + cl.n), cl.x, cl.y, cl.s, 0.95 * (1 - 0.5 * tod.night)); }
      ctx.drawImage(S.ground, 0, 0, S.w, S.h); S.drawN++;
      for (i = 0; i < mists.length; i++) { var mi = mists[i]; blit(spr('mist'), mi.x, mi.y, mi.s, mi.a * (1 - 0.55 * tod.night)); }

      items.length = 0;
      for (i = 0; i < S.plots.length; i++) {
        var p = S.plots[i];
        addItem(p.y, drawPlotBed, p);
        if (p.stage >= 0) addItem(p.y + 0.5, drawPlotCrop, p);
        else if (p.nursery > 0) addItem(p.y + 0.5, drawNursery, p);
      }
      for (i = 0; i < decor.length; i++) addItem(P(decor[i].gx, decor[i].gy).y, drawDecor, decor[i]);
      for (i = 0; i < chickens.length; i++) {
        (function (c) {
          var q = P(c.gx, c.gy), hopY = Math.sin(c.hop * Math.PI) * S.tw * 0.18;
          addItem(q.y, function () {
            var sp = spr('chicken_' + (c.walking ? c.f : 0)), dw = sp.w * S.tw * 1.25, dh = dw * (sp.sh / sp.sw);
            ctx.globalAlpha = 0.22; ctx.fillStyle = '#10300f'; ctx.beginPath(); ctx.ellipse(q.x, q.y + 1, dw * 0.28, dw * 0.09, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
            ctx.save(); ctx.translate(q.x, q.y - hopY); if (c.dir < 0) ctx.scale(-1, 1);
            ctx.drawImage(sp.img, sp.sx, sp.sy, sp.sw, sp.sh, -sp.ax * dw, -sp.ay * dh, dw, dh); ctx.restore(); S.drawN++;
            if (c.say > 0) {
              ctx.font = '800 ' + Math.round(S.tw * 0.16) + 'px system-ui, sans-serif'; ctx.textAlign = 'center';
              ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText('bok!', q.x, q.y - dh - 4 - (1 - c.say) * 6);
              ctx.fillStyle = '#fff'; ctx.fillText('bok!', q.x, q.y - dh - 4 - (1 - c.say) * 6);
            }
          });
        })(chickens[i]);
      }
      items.sort(function (a, b) { return a.y - b.y; });
      for (i = 0; i < items.length; i++) items[i].fn(items[i].a, items[i].b);
      for (i = 0; i < S.plots.length; i++) drawBadge(S.plots[i]);

      if (tod.night < 0.3) {
        for (i = 0; i < flies.length; i++) {
          var fl = flies[i], bx = S.field.x + S.field.w * (0.5 + 0.38 * Math.sin(S.t * 0.35 * fl.sp + fl.ph)), by = S.field.y + S.field.h * (0.3 + 0.18 * Math.sin(S.t * 0.8 * fl.sp + fl.ph * 2));
          var fw = Math.abs(Math.sin(S.t * 14 + i)) * S.tw * 0.07 + 1.5;
          ctx.fillStyle = i ? '#ffb24d' : '#ff8fb8';
          ctx.beginPath(); ctx.ellipse(bx - fw * 0.5, by, fw, S.tw * 0.045, -0.5, 0, TAU); ctx.ellipse(bx + fw * 0.5, by, fw, S.tw * 0.045, 0.5, 0, TAU); ctx.fill();
        }
      } else if (tod.night > 0.5) {
        var gy = spr('glow_y');
        for (i = 0; i < fireflies.length; i++) {
          var ff = fireflies[i], a = 0.25 + 0.75 * Math.max(0, Math.sin(S.t * ff.sp * 2 + ff.ph));
          blit(gy, S.field.x + S.field.w * (0.08 + 0.84 * ((ff.x + Math.sin(S.t * 0.2 * ff.sp + ff.ph) * 0.05 + 1) % 1)), S.field.y + S.field.h * (0.15 + 0.7 * ff.y) + Math.sin(S.t * 0.6 + ff.ph) * 6, 0.55, a * tod.night);
        }
      }

      for (i = 0; i < fx.length; i++) {
        var f = fx[i], k = f.max ? f.life / f.max : 1;
        if (f.t === 'coin') { if (f.delay > 0) continue; blit(spr('coin'), f.x, f.y, 1.1 + 0.1 * Math.sin(f.age * 18)); }
        else if (f.t === 'spark') blitRot(spr('spark'), f.x, f.y, (f.s || 1) * (0.5 + k), f.rot || 0, Math.min(1, k * 1.6));
        else if (f.t === 'drop') blit(spr('drop'), f.x, f.y, f.s || 1, 0.9);
        else if (f.t === 'leaf') blitRot(spr('leaf'), f.x, f.y, f.s || 1, f.rot || 0, Math.min(1, k * 1.6));
        else if (f.t === 'dirt') { ctx.globalAlpha = Math.min(1, k * 1.5); ctx.fillStyle = '#6a4423'; ctx.beginPath(); ctx.arc(f.x, f.y, 1.6 * (f.s || 1), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
        else if (f.t === 'smoke') {
          ctx.globalAlpha = 0.34 * k; ctx.fillStyle = '#e8eef0'; ctx.beginPath(); ctx.arc(f.x, f.y, S.tw * (0.03 + 0.055 * (1 - k)), 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        } else if (f.t === 'ring' || f.t === 'ripple') {
          var rr = (1 - k) * S.tw * (f.t === 'ring' ? 0.7 : 0.18); ctx.globalAlpha = k; ctx.lineWidth = f.t === 'ring' ? 3 : 1.5;
          ctx.strokeStyle = f.t === 'ring' ? '#ffe066' : '#bfe4ff'; ctx.beginPath(); ctx.ellipse(f.x, f.y, rr, rr / 2, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        } else if (f.t === 'text') {
          ctx.globalAlpha = Math.min(1, k * 2); ctx.font = '900 ' + Math.round(S.tw * 0.2) + 'px system-ui, sans-serif'; ctx.textAlign = 'center';
          ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(60,35,0,0.85)'; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = '#ffe066'; ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1;
        }
      }

      if (tod.tint[3] > 0.005) {
        ctx.fillStyle = 'rgba(' + (tod.tint[0] | 0) + ',' + (tod.tint[1] | 0) + ',' + (tod.tint[2] | 0) + ',' + tod.tint[3].toFixed(3) + ')';
        ctx.fillRect(0, 0, S.w, S.h);
      }

      var t1 = global.performance ? global.performance.now() : 0;
      S.dtAvg = S.dtAvg * 0.92 + (t1 - t0) * 0.08;
      if (debug) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(6, S.h - 62, 188, 54);
        ctx.fillStyle = '#9dff9d'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
        ctx.fillText('FPS ' + S.fpsAvg.toFixed(0) + '  draw ' + S.dtAvg.toFixed(2) + ' ms', 12, S.h - 46);
        ctx.fillText('drawImage/frame ' + S.drawN + '  dpr ' + S.dpr, 12, S.h - 32);
        ctx.fillText('aset seniman ' + assetCount() + (S.hemat ? '  [HEMAT]' : ''), 12, S.h - 18);
      }
    }

    /* ---- loop ---- */
    function visible() {
      if (global.document && global.document.hidden) return false;
      if (container.offsetWidth === 0 && container.offsetHeight === 0 && container.clientWidth !== undefined && opts.checkVisible !== false) return false;
      return true;
    }
    function tick(now) {
      if (!S.running || disposed) return;
      rafId = global.requestAnimationFrame(tick);
      var step = 1000 / (S.hemat ? 15 : 30);
      if (now - S.last < step - 2) return;
      if (!visible()) { S.last = now; return; }
      if (!S.sky) { resize(); if (!S.sky) { S.last = now; return; } }
      var dt = Math.min(0.1, (now - S.last) / 1000);
      if (dt > 0) S.fpsAvg = S.fpsAvg * 0.9 + (1 / dt) * 0.1;
      S.last = now;
      update(dt); draw();
    }
    function measure() {
      var w = container.clientWidth || 0, h = container.clientHeight || 0;
      if (w === S.w && h === S.h && S.sky) return false;
      S.w = w; S.h = h; return true;
    }
    function resize() {
      if (disposed) return;
      var w = container.clientWidth || 0, h = container.clientHeight || 0;
      if (!w || !h) return;
      S.w = w; S.h = h; rebuild(); buildDecor();
    }
    function scheduleResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); }

    /* ---- hit test ---- */
    function hit(clientX, clientY) {
      var r = canvas.getBoundingClientRect(), x = clientX - r.left, y = clientY - r.top, i, best = null, by = -1e9;
      var bestD = null, bestDy = -1e9;   // bangunan yang bisa diketuk: bila beberapa tumpang tindih, yang paling DEPAN (dasar paling bawah di layar) menang
      for (i = 0; i < decor.length; i++) {
        var d = decor[i]; if (!d.id) continue;
        var dq = P(d.gx, d.gy), dw, dh, ay;
        if (d.emoji || d.sign) { dw = d.bw; dh = d.bh; ay = d.sign ? 0.95 : 0.82; }
        else { var sp = spr(d.name); dw = sp.w * S.tw * (d.sc || 1); dh = dw * (sp.sh / sp.sw); ay = sp.ay; }
        if (x > dq.x - dw * 0.45 && x < dq.x + dw * 0.45 && y > dq.y - dh * ay && y < dq.y + dh * (1 - ay) + S.tw * 0.28 && dq.y > bestDy) { bestD = d; bestDy = dq.y; }
      }
      if (bestD) return bestD.id === 'beringin' ? { type: 'beringin' } : { type: 'landmark', id: bestD.id };
      /* urutan: petak (belah ketupat) > ayam > tanaman yang menjulang. Lahan lebih penting daripada ayam yang kebetulan lewat. */
      for (i = 0; i < S.plots.length; i++) {
        var p = S.plots[i], dx = Math.abs(x - p.x) / (S.tw * 0.5), dy = Math.abs(y - p.y) / (S.tw * 0.25);
        if (dx + dy <= 1.0 && p.y > by) { best = p; by = p.y; }
      }
      if (!best) {
        for (i = 0; i < chickens.length; i++) {
          var c = chickens[i], cq = P(c.gx, c.gy);
          if (Math.abs(x - cq.x) < S.tw * 0.2 && y > cq.y - S.tw * 0.3 && y < cq.y + S.tw * 0.06) return { type: 'chicken', c: c };
        }
        for (i = 0; i < S.plots.length; i++) {
          var q = S.plots[i];
          if (q.stage >= 0 && Math.abs(x - q.x) < S.tw * 0.3 && y < q.y && y > q.y - S.tw * 0.62 && q.y > by) { best = q; by = q.y; }
        }
      }
      return best ? (best.key === '__claim' ? { type: 'claim' } : { type: 'plot', key: best.key }) : null;
    }

    function onClick(e) {
      var h = hit(e.clientX, e.clientY); if (!h) return;
      if (h.type === 'plot') { if (opts.onSelect) opts.onSelect(h.key); }
      else if (h.type === 'beringin') { if (opts.onBeringin) opts.onBeringin(); }
      else if (h.type === 'landmark') { if (opts.onLandmark) opts.onLandmark(h.id); }
      else if (h.type === 'claim') { if (opts.onClaim) opts.onClaim(); }
      else if (h.type === 'chicken') { h.c.hop = 1; h.c.say = 1; }
    }
    if (opts.eventEl) opts.eventEl.addEventListener('click', onClick);

    if (global.ResizeObserver) { ro = new global.ResizeObserver(scheduleResize); ro.observe(container); if (opts.eventEl) ro.observe(opts.eventEl); }

    var api = {
      setPlots: function (l, e) { setPlots(l, e); },
      setSelected: function (k) { S.selected = k; },
      setBeringinHealth: function (pct) {
        var o = S.health < 30 ? 0 : S.health < 70 ? 1 : 2; S.health = pct;
        var n = pct < 30 ? 0 : pct < 70 ? 1 : 2; if (o !== n) buildDecor();
      },
      fx: burstFx,
      resize: resize, relayout: function () { if (S.w) { layout(); buildGround(); } },
      start: function () {
        if (S.running || disposed) return; S.running = true; S.last = 0;
        if (!S.sky) resize();
        rafId = global.requestAnimationFrame(tick);
      },
      stop: function () { S.running = false; if (rafId) global.cancelAnimationFrame(rafId); },
      setHemat: function (v) { S.hemat = !!v; resize(); },
      setHour: function (h) { opts.hourOverride = h; S.skyKey = -1; },
      destroy: function () {
        disposed = true; api.stop(); if (ro) ro.disconnect(); if (opts.eventEl) opts.eventEl.removeEventListener('click', onClick);
        if (canvas.parentNode && !opts.canvas) canvas.parentNode.removeChild(canvas);
      },
      hit: hit,
      setRumah: function (data) {   // {tier, decor:[{id,icon,name}], avatarUrl, username, sub}
        S.rumah = data || {}; signSprite = null; emojiCache = {};
        var url = S.rumah.avatarUrl, cur = S.rumah;
        if (url && global.Image) {
          var im = new global.Image();
          im.onload = function () { if (S.rumah === cur) { cur.avatarImg = im; signSprite = null; } };
          im.onerror = function () { };
          im.src = url;
        }
        if (S.mode === 'rumah' && S.w) buildDecor();
      },
      landmarks: function () { return decor.filter(function (d) { return d.id; }).map(function (d) { var q = P(d.gx, d.gy); return { id: d.id, x: q.x, y: q.y }; }); },
      renderOnce: function (dt) { if (!S.sky) resize(); update(dt || 0.033); draw(); },
      stats: function () { return { fps: S.fpsAvg, drawMs: S.dtAvg, drawImage: S.drawN, plots: S.plots.length, tw: S.tw, assets: assetCount(), dpr: S.dpr }; },
      _S: S
    };
    loadAssets(opts.assetBase).then(function () { if (!disposed && S.w && assetCount()) resize(); });   // aset tiba -> gambar ulang dengan karya seniman
    return api;
  }


  /* ------------------------------------------------------------------
     BANNER: gambar latar untuk popup (Gudang, Olahan, Kompos, Pasar, Lahan, Rumah, Beringin).
     Dirender SEKALI ke kanvas kecil dari sprite yang sama dengan kebun. Karya seniman (aset) belum dipakai di sini.
     ------------------------------------------------------------------ */
  var bSprites = {};
  function bSprite(name, pxW, dpr) {
    var as = ASSETS[name];
    if (as) return { asset: as, dw: pxW, dh: pxW * (as.sh / as.sw), ax: as.ax, ay: as.ay };
    var key = name + '@' + pxW + '@' + dpr, c0 = bSprites[key]; if (c0) return c0;
    var d = DEF[name]; if (!d) return null;
    var dw = Math.max(2, Math.round(pxW * dpr)), dh = Math.max(2, Math.round(dw * d.a));
    var cv = global.document.createElement('canvas'); cv.width = dw; cv.height = dh;
    var g = cv.getContext('2d'); g.scale(dw / 100, dw / 100); d.draw(g);
    return (bSprites[key] = { img: cv, dw: pxW, dh: pxW * d.a, ax: d.ax, ay: d.ay });
  }
  function banner(canvas, kind, o) {
    o = o || {};
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var W = o.w || canvas.clientWidth || 340, H = o.h || canvas.clientHeight || 112;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    var g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var hr = typeof o.hour === 'number' ? o.hour : (new Date().getHours() + new Date().getMinutes() / 60), t = todAt(hr);
    var hz = H * 0.5, i, x;
    g.fillStyle = lin(g, 0, 0, 0, hz + 1, [0, t.top, 1, t.bot]); g.fillRect(0, 0, W, hz + 1);
    var rr = rngOf(31);
    if (t.night > 0.35) { g.fillStyle = 'rgba(255,255,255,' + (0.9 * t.night).toFixed(2) + ')'; for (i = 0; i < 26; i++) g.fillRect(rr() * W, rr() * hz * 0.8, 1.2, 1.2); }
    var sunUp = hr > 6 && hr < 18, sp = sunUp ? (hr - 6) / 12 : (hr >= 18 ? (hr - 18) / 12 : (hr + 6) / 12);
    var bx = lerp(0.15, 0.85, sp) * W, by = hz - Math.sin(sp * Math.PI) * hz * 0.7 - 4, rad = H * 0.12;
    var gl = g.createRadialGradient(bx, by, 0, bx, by, rad * 3); gl.addColorStop(0, sunUp ? 'rgba(255,250,200,0.9)' : 'rgba(235,242,255,0.85)'); gl.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = gl; g.fillRect(bx - rad * 3, by - rad * 3, rad * 6, rad * 6);
    g.beginPath(); g.arc(bx, by, rad * 0.6, 0, TAU); g.fillStyle = sunUp ? '#fff6c8' : '#f4f6ff'; g.fill();
    var HILL = ['#7fb0b8', '#3f8a7a', '#1f6a52'], K = [0.42, 0.55, 0.7], AM = [0.34, 0.24, 0.15], FQ = [0.012, 0.018, 0.026];
    for (var L = 0; L < 3; L++) {
      g.beginPath(); g.moveTo(0, hz + 2);
      for (x = 0; x <= W + 6; x += 6) g.lineTo(x, hz - H * AM[L] * (0.55 + 0.3 * Math.sin(x * FQ[L] + L * 5) + 0.15 * Math.sin(x * FQ[L] * 2.7 + L)));
      g.lineTo(W + 6, hz + 2); g.closePath(); g.fillStyle = mix(t.botHex, HILL[L], K[L]); g.fill();
    }
    g.fillStyle = lin(g, 0, hz, 0, H, [0, '#62ab78', 0.4, '#3f8a5c', 1, '#1f5a45']); g.fillRect(0, hz, W, H - hz);
    g.lineCap = 'round';
    for (i = 0; i < 90; i++) { x = rr() * W; var y = hz + rr() * (H - hz); g.strokeStyle = rr() > 0.5 ? 'rgba(8,66,52,0.35)' : 'rgba(190,245,205,0.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rr() - 0.5) * 3, y - 3); g.stroke(); }
    function put(name, xf, base, w) {
      var c = bSprite(name, w, dpr); if (!c) return;
      if (c.asset) g.drawImage(c.asset.img, c.asset.sx, c.asset.sy, c.asset.sw, c.asset.sh, xf * W - c.ax * c.dw, base - c.ay * c.dh, c.dw, c.dh);
      else g.drawImage(c.img, xf * W - c.ax * c.dw, base - c.ay * c.dh, c.dw, c.dh);
    }
    var b0 = H * 0.9;
    if (kind === 'gudang') { put('tree_kelapa', 0.14, b0, H * 0.4); put('lumbung', 0.5, b0, H * 0.8); put('chicken_0', 0.78, b0 + 2, H * 0.26); put('bamboo', 0.92, b0, H * 0.38); }
    else if (kind === 'olahan') {
      put('bamboo', 0.13, b0, H * 0.38); put('dapur', 0.5, b0, H * 0.78); put('pot', 0.8, b0, H * 0.2); put('chicken_1', 0.72, b0 + 4, H * 0.25);
      var dd = DEF.dapur, cdw = H * 0.78, cdh = cdw * dd.a, chx = W * 0.5 + (dd.chim[0] - dd.ax) * cdw, chy = b0 - dd.ay * cdh + dd.chim[1] * cdh;
      for (i = 0; i < 4; i++) { g.globalAlpha = 0.4 - i * 0.08; g.fillStyle = '#e8eef0'; g.beginPath(); g.arc(chx + i * 4, chy - 4 - i * 8, 3.5 + i * 2, 0, TAU); g.fill(); } g.globalAlpha = 1;
    }
    else if (kind === 'kompos') { put('tree_kelapa', 0.86, b0, H * 0.4); put('kompos', 0.5, b0, H * 0.98); put('crop_ubijalar_3', 0.17, b0 - 2, H * 0.56); put('crop_ubijalar_2', 0.29, b0 + 3, H * 0.5); }
    else if (kind === 'pasar') { put('tree_kelapa', 0.12, b0, H * 0.4); put('lapak', 0.5, b0, H * 0.86); put('chicken_2', 0.8, b0 + 3, H * 0.26); put('lumbung', 0.92, b0 - 6, H * 0.5); }
    else if (kind === 'lahan') {
      put('tree_kelapa', 0.1, b0, H * 0.4); put('bed_fertile', 0.32, b0 - 14, H * 0.74); put('bed_fertile', 0.68, b0 - 14, H * 0.74); put('bed_fertile', 0.5, b0 + 1, H * 0.74);
      put('crop_ubijalar_2', 0.32, b0 - 16, H * 0.5); put('crop_ubijalar_4', 0.68, b0 - 16, H * 0.5); put('crop_ubijalar_3', 0.5, b0 - 1, H * 0.5);
    }
    else if (kind === 'rumah') { put('tree_kelapa', 0.15, b0, H * 0.4); put('house_joglo', 0.5, b0, H * 0.72); put('chicken_0', 0.8, b0 + 3, H * 0.26); }
    else if (kind === 'beringin') { put('tree_beringin_2', 0.5, b0 + 2, H * 0.72); put('chicken_3', 0.2, b0 + 4, H * 0.26); }
    else { put('house_joglo', 0.5, b0, H * 0.72); }
    var mg = g.createRadialGradient(W * 0.5, hz + 6, 0, W * 0.5, hz + 6, W * 0.6);
    mg.addColorStop(0, 'rgba(236,250,246,' + (0.3 * (1 - 0.55 * t.night)).toFixed(2) + ')'); mg.addColorStop(1, 'rgba(236,250,246,0)');
    g.save(); g.translate(0, hz + 6); g.scale(1, 0.18); g.translate(0, -(hz + 6)); g.fillStyle = mg; g.fillRect(0, hz - 400, W, 800); g.restore();
    if (t.tint[3] > 0.005) { g.fillStyle = 'rgba(' + (t.tint[0] | 0) + ',' + (t.tint[1] | 0) + ',' + (t.tint[2] | 0) + ',' + t.tint[3].toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
    var fade = g.createLinearGradient(0, H * 0.62, 0, H);   // menyatu dengan warna panel di bawahnya
    fade.addColorStop(0, 'rgba(27,21,15,0)'); fade.addColorStop(1, 'rgba(27,21,15,0.96)'); g.fillStyle = fade; g.fillRect(0, H * 0.62, W, H * 0.38);
    return true;
  }

  /* dipakai peta desa (desa-map.js): sprite berukuran sesuai lebar petak, dan keadaan langit menurut jam */
  function spriteFor(name, tilePx, dpr) {
    var as = ASSETS[name], d = DEF[name], wt = as ? as.w : (d && d.w);
    if (!wt) return null;
    var sp = bSprite(name, wt * tilePx, dpr);
    if (sp) sp.wTiles = wt;
    return sp;
  }
  global.KebunScene = { create: create, banner: banner, loadAssets: loadAssets, spriteFor: spriteFor, todAt: todAt, mix: mix, rngOf: rngOf, DEF: DEF, version: '1.4' };
})(typeof window !== 'undefined' ? window : globalThis);
