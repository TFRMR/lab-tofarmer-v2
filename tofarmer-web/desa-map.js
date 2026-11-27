/* =====================================================================
   desa-map.js  --  Peta Desa Menoreh (Canvas 2D). Memerlukan kebun-scene.js (sprite & langit).

   - Dunia isometrik: petak 30x30 milik game + bingkai luar (pegunungan di utara/barat, sungai
     dan hutan di selatan/timur). Kamera bisa digeser (seret), dizoom (cubit / roda tetikus),
     dengan gerak lanjut (inersia).
   - Menggambar hanya yang terlihat (culling). Saat diam, hanya digambar ulang ±8x/detik untuk
     kabut; saat bergerak sampai 40 fps. Berhenti saat layar tertutup / tab tidak terlihat.
   - Ketukan dihitung dengan rumus (bukan elemen HTML): rumah warga, lahan, Pasar, Koperasi, Beringin.

   API
     var map = DesaMap.create({ container, onHouse(userId), onFarm(key, owner), onLandmark(id), onTile(key, owner),
                                 getFieldRect?, hemat, hourOverride, debug });
     map.setData({ N, terrain:[{x_pos,y_pos,type}], claims:{key:{ownerId,ownerUsername}}, farmVis:{key:{state,growth,ready,badge}},
                   users:[{id,username}], housePos:{userId:{x,y}}, tierOf(userId), me:{id,username}, beringinHealth });
     map.focus(gx, gy, zoom?, animate?)   map.focusMe()   map.zoomBy(factor)
     map.start() / stop() / resize() / destroy()   map.stats()
   ===================================================================== */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2, BASE = 64;   // lebar satu petak (px) pada zoom 1
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function create(opts) {
    var KS = global.KebunScene, doc = global.document, container = opts.container;
    var canvas = opts.canvas;
    if (!canvas) {
      canvas = doc.createElement('canvas');
      canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;';
      container.appendChild(canvas);
    }
    var ctx = canvas.getContext('2d', { alpha: false });

    var W = 0, H = 0, dpr = 1;
    var cam = { x: 0, y: 0, z: 0.9 }, goal = null, vel = { x: 0, y: 0 }, trail = [];
    var ptrs = {}, nPtr = 0, pinch = null, down = null;
    var running = false, raf = 0, dirty = true, lastT = 0, ambT = 0, t = 0, disposed = false, ro = null;
    var D = null, N = 30, M = 7, ground = [], objs = [], houses = [], landmarks = [], bounds = { x0: 0, x1: 0, y0: 0, y1: 0 };
    var groundCache = null, gcs = 0.5, gcX = 0, gcY = 0, landPos = null;
    var lastTap = null, pulse = null;
    var hour = 12, tod = null, mists = [], st = { fps: 30, tiles: 0, objs: 0, ms: 0 }, drawMs = 0;

    function proj(gx, gy) { return { x: (gx - gy) * BASE / 2, y: (gx + gy) * BASE / 4 }; }
    function toWorld(sx, sy) { return { x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y }; }
    function toScreen(wx, wy) { return { x: (wx - cam.x) * cam.z + W / 2, y: (wy - cam.y) * cam.z + H / 2 }; }
    function tileAt(wx, wy) { return { i: Math.round(wy / (BASE / 2) + wx / BASE), j: Math.round(wy / (BASE / 2) - wx / BASE) }; }
    function lodOf() { return cam.z < 0.75 ? 0.6 : (cam.z < 1.35 ? 1 : 1.8); }

    /* ------------------------------------------------------------ data */
    function groundName(i, j, terr) {
      var inside = i >= 0 && j >= 0 && i < N && j < N;
      if (inside) {
        var tt = terr[i + ',' + j];
        if (tt === 'paved_road') return 'tile_road';
        if (tt === 'soil_farm') return 'tile_soil';
      } else {
        var east = i >= N, south = j >= N, nw = i < 0 || j < 0;
        if (!nw && (east || south) && Math.max(i >= N ? i - N + 1 : 0, j >= N ? j - N + 1 : 0) <= 2) return 'tile_water';   // sungai di selatan & timur
      }
      return ((i * 7 + j * 13) & 3) === 0 ? 'tile_grass_1' : 'tile_grass_0';
    }

    function prepare(d) {
      D = d; N = d.N || 30;
      var terr = {}, i, j, rr;
      (d.terrain || []).forEach(function (r) { terr[r.x_pos + ',' + r.y_pos] = r.type; });
      ground = [];
      for (j = -M; j < N + M; j++) for (i = -M; i < N + M; i++) ground.push({ i: i, j: j, n: groundName(i, j, terr) });
      objs = []; houses = []; landmarks = [];
      function add(o) { var p = proj(o.gx, o.gy); o.wx = p.x; o.wy = p.y; objs.push(o); return o; }
      // medan di dalam peta
      Object.keys(terr).forEach(function (k) {
        var xy = k.split(','), gx = +xy[0], gy = +xy[1];
        if (terr[k] === 'mountain') add({ name: 'gunung', gx: gx, gy: gy, sc: 0.6 });
        else if (terr[k] === 'tree') add({ name: 'tree_hutan', gx: gx, gy: gy, sc: 0.85 + (((gx * 5 + gy * 3) % 4) * 0.05) });
      });
      // bingkai luar: pegunungan (utara/barat) dan hutan (selatan/timur)
      for (j = -M; j < N + M; j++) for (i = -M; i < N + M; i++) {
        if (i >= 0 && j >= 0 && i < N && j < N) continue;
        var nw = i < 0 || j < 0, dist = Math.max(i < 0 ? -i : (i >= N ? i - N + 1 : 0), j < 0 ? -j : (j >= N ? j - N + 1 : 0));
        rr = KS.rngOf((i + 50) * 131 + (j + 50) * 17)();
        if (nw) {
          if (((i + 9) * 5 + (j + 9) * 3) % 7 === 0 && dist >= 1) add({ name: 'gunung', gx: i, gy: j, sc: 1.0 + (dist > 3 ? 0.25 : 0) });
          else if (rr < 0.32) add({ name: 'tree_hutan', gx: i, gy: j, sc: 0.8 + rr });
        } else if (dist > 2 && rr < 0.5) add({ name: 'tree_hutan', gx: i, gy: j, sc: 0.75 + rr * 0.5 });
      }
      // bangunan desa: dipilih di petak bebas (hanya berdasarkan medan) dekat tengah, tetap di tempat yang sama
      var taken = {};   // petak yang sudah dipakai rumah/lahan warga
      Object.keys(d.claims || {}).forEach(function (k) { taken[k] = 1; });
      Object.keys(d.housePos || {}).forEach(function (u) { var q = d.housePos[u]; if (q) taken[q.x + ',' + q.y] = 1; });
      function free(x, y) {
        if (!(x >= 1 && y >= 1 && x < N - 1 && y < N - 1) || taken[x + ',' + y]) return false;
        for (var ax = -1; ax <= 1; ax++) for (var ay = -1; ay <= 1; ay++) { var tt = terr[(x + ax) + ',' + (y + ay)]; if (tt === 'mountain' || tt === 'tree' || (tt && !ax && !ay)) return false; }   // tidak tertutup gunung/pohon di sekitarnya
        return true;
      }
      function nearest(cx, cy, skip) {
        for (var r = 0; r < 14; r++) for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          var x = cx + dx, y = cy + dy;
          if (free(x, y) && !(skip || []).some(function (s) { return Math.abs(s[0] - x) < 2 && Math.abs(s[1] - y) < 2; })) return [x, y];
        }
        return [cx, cy];
      }
      var c = Math.floor(N / 2), pasar, kop, ber;
      if (landPos && free(landPos.p[0], landPos.p[1]) && free(landPos.k[0], landPos.k[1]) && free(landPos.b[0], landPos.b[1])) { pasar = landPos.p; kop = landPos.k; ber = landPos.b; }   // tetap di tempat selama masih kosong
      else { pasar = nearest(c, c); kop = nearest(c + 2, c - 1, [pasar]); ber = nearest(2, 2, [pasar, kop]); landPos = { p: pasar, k: kop, b: ber }; }
      var lvl = (d.beringinHealth == null ? 100 : d.beringinHealth) < 30 ? 0 : (d.beringinHealth < 70 ? 1 : 2);
      landmarks = [
        add({ name: 'lapak', gx: pasar[0], gy: pasar[1], sc: 1.15, id: 'pasar', label: 'Pasar Desa', kind: 'landmark' }),
        add({ name: 'toko', gx: kop[0], gy: kop[1], sc: 1.0, id: 'koperasi', label: 'Koperasi', kind: 'landmark' }),
        add({ name: 'tree_beringin_' + lvl, gx: ber[0], gy: ber[1], sc: 0.95, id: 'beringin', label: 'Beringin', kind: 'landmark' })
      ];
      // lahan (bedeng + tanaman) milik warga
      var claims = d.claims || {}, fv = d.farmVis || {};
      Object.keys(claims).forEach(function (k) {
        var xy = k.split(','), gx = +xy[0], gy = +xy[1], f = fv[k] || { state: 'empty' }, mine = !!(d.me && claims[k].ownerId === d.me.id);
        var o = add({ name: f.state === 'barren' ? 'bed_barren' : 'bed_fertile', gx: gx, gy: gy, sc: 1.0, kind: 'farm', key: k, mine: mine });
        if (f.state === 'planted') {
          var stage = f.ready ? 4 : (f.growth < 0.18 ? 0 : f.growth < 0.45 ? 1 : f.growth < 0.75 ? 2 : 3);
          add({ name: 'crop_ubijalar_' + stage, gx: gx, gy: gy, sc: 0.9, yBias: 0.5, kind: 'crop', key: k, mine: mine });
        }
        if (mine && f.badge) add({ name: 'badge_' + f.badge, gx: gx, gy: gy, sc: 0.9, yBias: 60, kind: 'badge', key: k });
      });
      // rumah warga
      (d.users || []).forEach(function (u) {
        var p = d.housePos && d.housePos[u.id]; if (!p) return;
        var tier = d.tierOf ? d.tierOf(u.id) : 1, mine = !!(d.me && u.id === d.me.id);
        var nm = tier >= 3 ? 'house_joglo' : tier === 2 ? 'house_kayu' : 'house_gubuk', sc = tier >= 3 ? 0.62 : tier === 2 ? 0.7 : 0.8;
        var o = add({ name: nm, gx: p.x, gy: p.y, sc: sc, id: u.id, label: '@' + u.username, kind: 'house', mine: mine, yBias: 1 });
        houses.push(o);
      });
      groundCache = null;   // dibangun ulang saat dibutuhkan
      objs.sort(function (a, b) { return (a.wy + (a.yBias || 0)) - (b.wy + (b.yBias || 0)); });
      var c1 = proj(-M, N + M - 1), c2 = proj(N + M - 1, -M), c3 = proj(-M, -M), c4 = proj(N + M - 1, N + M - 1);
      bounds = { x0: c1.x, x1: c2.x, y0: c3.y, y1: c4.y };
      dirty = true;
    }

    /* ------------------------------------------------------------ kamera */
    function clampCam() {
      cam.z = clamp(cam.z, 0.4, 2.4);
      cam.x = clamp(cam.x, bounds.x0 * 0.9, bounds.x1 * 0.9);
      cam.y = clamp(cam.y, bounds.y0 * 0.9, bounds.y1 * 0.9);
    }
    function zoomAt(sx, sy, f) {
      var b = toWorld(sx, sy); cam.z = clamp(cam.z * f, 0.4, 2.4); var a = toWorld(sx, sy);
      cam.x += b.x - a.x; cam.y += b.y - a.y; clampCam(); dirty = true;
    }
    function focus(gx, gy, z, animate) {
      var p = proj(gx, gy);
      if (animate === false) { cam.x = p.x; cam.y = p.y; if (z) cam.z = z; clampCam(); dirty = true; return; }
      goal = { x: p.x, y: p.y, z: z || cam.z };
    }

    /* ------------------------------------------------------------ gambar */
    function sprite(name) { return KS.spriteFor(name, BASE * lodOf(), dpr); }
    function drawSpr(name, wx, wy, sc) {
      var s = sprite(name); if (!s) return null;
      var k = cam.z / lodOf(), w = s.dw * k * sc, h = s.dh * k * sc, p = toScreen(wx, wy);
      if (p.x + w / 2 < 0 || p.x - w / 2 > W || p.y - h * s.ay > H || p.y + h * (1 - s.ay) < 0) return null;
      var x = p.x - s.ax * w, y = p.y - s.ay * h;
      if (s.asset) ctx.drawImage(s.asset.img, s.asset.sx, s.asset.sy, s.asset.sw, s.asset.sh, x, y, w, h);
      else ctx.drawImage(s.img, x, y, w, h);
      return { x: x, y: y, w: w, h: h, px: p.x, py: p.y };
    }
    function pill(text, x, y, mine) {
      ctx.font = '800 ' + (mine ? 12 : 11) + 'px system-ui, sans-serif';
      var w = ctx.measureText(text).width + 14, h = 18, r = 9;
      ctx.beginPath(); ctx.moveTo(x - w / 2 + r, y); ctx.lineTo(x + w / 2 - r, y); ctx.arc(x + w / 2 - r, y + h / 2, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x - w / 2 + r, y + h); ctx.arc(x - w / 2 + r, y + h / 2, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
      ctx.fillStyle = mine ? 'rgba(90,60,10,0.9)' : 'rgba(8,38,40,0.86)'; ctx.fill();
      ctx.strokeStyle = mine ? 'rgba(255,225,120,0.95)' : 'rgba(255,214,150,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#fff3c4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + h / 2 + 0.5);
    }

    // seluruh tanah digambar SEKALI ke satu kanvas (resolusi rendah), dipakai saat zoom jauh: satu drawImage menggantikan ribuan petak
    function buildGroundCache() {
      gcX = bounds.x0 - BASE; gcY = bounds.y0 - BASE / 2;
      var cw = Math.ceil((bounds.x1 + BASE - gcX) * gcs), ch = Math.ceil((bounds.y1 + BASE / 2 - gcY) * gcs);
      var cv = doc.createElement('canvas'); cv.width = cw; cv.height = ch;
      var g = cv.getContext('2d'), twc = BASE * gcs * 1.03, i;
      g.fillStyle = '#143a2f'; g.fillRect(0, 0, cw, ch);
      for (i = 0; i < ground.length; i++) {
        var gd = ground[i], s = KS.spriteFor(gd.n, BASE * gcs, 1); if (!s) continue;
        var p = proj(gd.i, gd.j), x = (p.x - gcX) * gcs, y = (p.y - gcY) * gcs;
        g.drawImage(s.img || s.asset.img, x - twc / 2, y - twc / 4, twc, twc / 2);
      }
      groundCache = cv;
    }

    function render() {
      if (!W || !H || !D) return;
      var t0 = global.performance ? global.performance.now() : 0, i;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#143a2f'; ctx.fillRect(0, 0, W, H);
      // petak yang terlihat
      var a = toWorld(0, 0), b = toWorld(W, 0), c = toWorld(0, H), e = toWorld(W, H), xs = [a, b, c, e];
      var gxMin = 1e9, gxMax = -1e9, gyMin = 1e9, gyMax = -1e9;
      xs.forEach(function (q) { var gx = q.y / (BASE / 2) + q.x / BASE, gy = q.y / (BASE / 2) - q.x / BASE; gxMin = Math.min(gxMin, gx); gxMax = Math.max(gxMax, gx); gyMin = Math.min(gyMin, gy); gyMax = Math.max(gyMax, gy); });
      var i0 = Math.floor(gxMin) - 2, i1 = Math.ceil(gxMax) + 2, j0 = Math.floor(gyMin) - 2, j1 = Math.ceil(gyMax) + 2, nT = 0;
      var tw = BASE * cam.z * 1.03;
      var estTiles = (W * H) / ((BASE * cam.z) * (BASE * cam.z) / 2);
      if (estTiles > 500) {   // zoom jauh / layar lebar: tempel lapisan tanah yang sudah jadi
        if (!groundCache) buildGroundCache();
        var wa = toWorld(0, 0), wb = toWorld(W, H);
        var sx0 = (wa.x - gcX) * gcs, sy0 = (wa.y - gcY) * gcs, sw0 = (wb.x - wa.x) * gcs, sh0 = (wb.y - wa.y) * gcs;
        var cx0 = Math.max(0, sx0), cy0 = Math.max(0, sy0), cx1 = Math.min(groundCache.width, sx0 + sw0), cy1 = Math.min(groundCache.height, sy0 + sh0);
        if (cx1 > cx0 && cy1 > cy0) ctx.drawImage(groundCache, cx0, cy0, cx1 - cx0, cy1 - cy0, (cx0 - sx0) / sw0 * W, (cy0 - sy0) / sh0 * H, (cx1 - cx0) / sw0 * W, (cy1 - cy0) / sh0 * H);
        nT = 1;
      } else
      for (i = 0; i < ground.length; i++) {
        var g = ground[i];
        if (g.i < i0 || g.i > i1 || g.j < j0 || g.j > j1) continue;
        var s = sprite(g.n); if (!s) continue;
        var pr = proj(g.i, g.j), sp = toScreen(pr.x, pr.y);
        if (sp.x < -tw || sp.x > W + tw || sp.y < -tw / 2 || sp.y > H + tw / 2) continue;
        ctx.drawImage(s.img || s.asset.img, sp.x - tw / 2, sp.y - tw / 4, tw, tw / 2); nT++;
      }
      // benda (diurutkan dari belakang ke depan)
      var nO = 0;
      for (i = 0; i < objs.length; i++) {
        var o = objs[i];
        if (o.kind === 'farm' && o.mine && cam.z >= 0.5) {   // cincin emas di bawah lahan sendiri
          var q = toScreen(o.wx, o.wy);
          if (q.x > -80 && q.x < W + 80 && q.y > -40 && q.y < H + 40) {
            ctx.strokeStyle = 'rgba(255,225,120,0.85)'; ctx.lineWidth = Math.max(1.2, 2 * cam.z);
            var rw = BASE * cam.z * 0.47; ctx.beginPath(); ctx.moveTo(q.x, q.y - rw / 2); ctx.lineTo(q.x + rw, q.y); ctx.lineTo(q.x, q.y + rw / 2); ctx.lineTo(q.x - rw, q.y); ctx.closePath(); ctx.stroke();
          }
        }
        var wy = o.wy + (o.kind === 'badge' ? -BASE * 0.6 : 0);
        if (drawSpr(o.name, o.wx, wy + (o.yBias && o.kind !== 'badge' ? 0 : 0), o.sc)) nO++;
      }
      // label nama
      for (i = 0; i < landmarks.length; i++) { var lm = landmarks[i], lp = toScreen(lm.wx, lm.wy); if (lp.x > -60 && lp.x < W + 60 && lp.y > -20 && lp.y < H + 20) pill(lm.label, lp.x, lp.y + 4 * cam.z, false); }
      for (i = 0; i < houses.length; i++) {
        var h = houses[i];
        if (cam.z < 0.8 && !h.mine) continue;
        var hp = toScreen(h.wx, h.wy); if (hp.x > -60 && hp.x < W + 60 && hp.y > -20 && hp.y < H + 20) pill(h.label, hp.x, hp.y + 4 * cam.z, h.mine);
      }
      // kabut + waktu
      for (i = 0; i < mists.length; i++) {
        var m = mists[i], ms = sprite('mist'); if (!ms) continue;
        var mw = ms.dw * (cam.z / lodOf()) * 1.2 * m.s, mh = ms.dh * (cam.z / lodOf()) * 1.2 * m.s;
        ctx.globalAlpha = m.a * (1 - 0.5 * (tod ? tod.night : 0)); ctx.drawImage(ms.img || ms.asset.img, ((m.x % (W + mw)) + (W + mw)) % (W + mw) - mw, m.y * H - mh / 2, mw, mh); ctx.globalAlpha = 1;
      }
      if (tod && tod.tint[3] > 0.005) { ctx.fillStyle = 'rgba(' + (tod.tint[0] | 0) + ',' + (tod.tint[1] | 0) + ',' + (tod.tint[2] | 0) + ',' + tod.tint[3].toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
      if (pulse) {
        var age = (Date.now() - pulse.t) / 320;
        if (age < 1) { ctx.strokeStyle = 'rgba(255,240,170,' + (1 - age).toFixed(2) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pulse.x, pulse.y, 8 + age * 26, 0, TAU); ctx.stroke(); dirty = true; } else pulse = null;
      }
      drawMs = drawMs * 0.9 + ((global.performance ? global.performance.now() : 0) - t0) * 0.1;
      st.tiles = nT; st.objs = nO; st.ms = drawMs;
      if (opts.debug) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(6, H - 52, 210, 44); ctx.fillStyle = '#9dff9d'; ctx.font = '11px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('FPS ' + st.fps.toFixed(0) + '  gambar ' + drawMs.toFixed(2) + ' ms', 12, H - 36);
        ctx.fillText('petak ' + nT + '  benda ' + nO + '  zoom ' + cam.z.toFixed(2), 12, H - 22);
        if (lastTap && Date.now() - lastTap.t < 3000) {
          ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(lastTap.x, lastTap.y, 6, 0, TAU); ctx.stroke();
          ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(lastTap.x + 10, lastTap.y - 22, ctx.measureText('ketuk: ' + lastTap.text).width + 10, 18); ctx.fillStyle = '#ffd7d7'; ctx.fillText('ketuk: ' + lastTap.text, lastTap.x + 15, lastTap.y - 9);
        }
      }
    }

    /* ------------------------------------------------------------ ketukan */
    function hitTest(sx, sy) {
      if (!D) return null;
      var w = toWorld(sx, sy), z = cam.z, i;
      // loose=false: tubuh bangunan yang tepat. loose=true: toleransi jari (minimal ±26 px layar) dan label nama di bawah bangunan.
      function pick(kind, loose) {
        var best = null, by = -1e9;
        for (i = 0; i < objs.length; i++) {
          var o = objs[i]; if (o.kind !== kind) continue;
          var s = KS.spriteFor(o.name, BASE, 1); if (!s) continue;
          var bw = s.dw * o.sc, bh = s.dh * o.sc;
          var half = loose ? Math.max(bw * 0.5, 26 / z) : bw * 0.45, top = loose ? Math.max(bh * s.ay, 26 / z) : bh * s.ay, bottom = loose ? 30 / z + BASE * 0.1 : BASE * 0.25;
          if (w.x > o.wx - half && w.x < o.wx + half && w.y > o.wy - top && w.y < o.wy + bottom && o.wy > by) { best = o; by = o.wy; }
        }
        return best;
      }
      function asHit(o) { return o.kind === 'house' ? { type: 'house', userId: o.id, username: o.label } : { type: 'landmark', id: o.id }; }
      var o1 = pick('landmark', false) || pick('house', false);      // 1) tubuh bangunan / rumah yang tepat
      if (o1) return asHit(o1);
      var t2 = tileAt(w.x, w.y), key = t2.i + ',' + t2.j, cl = (D.claims || {})[key];   // 2) lahan (petak)
      if (cl) {
        var pc = proj(t2.i, t2.j), dx = Math.abs(w.x - pc.x) / (BASE * 0.5), dy = Math.abs(w.y - pc.y) / (BASE * 0.25);
        if (dx + dy <= 1.15) return { type: (D.farmVis || {})[key] ? 'farm' : 'tile', key: key, owner: cl.ownerUsername, mine: !!(D.me && cl.ownerId === D.me.id) };
      }
      var o2 = pick('landmark', true) || pick('house', true);        // 3) bila tidak kena apa pun: area longgar untuk jari dan label nama
      return o2 ? asHit(o2) : null;
    }
    function tap(cx, cy) {
      var r = canvas.getBoundingClientRect(), h = hitTest(cx - r.left, cy - r.top);
      lastTap = { x: cx - r.left, y: cy - r.top, text: h ? (h.type + (h.id ? ' ' + h.id : '')) : 'kosong', t: Date.now() };
      if (h) pulse = { x: cx - r.left, y: cy - r.top, t: Date.now() };   // cincin kecil: tanda ketukan terbaca
      dirty = true;
      if (!h) return;
      if (h.type === 'house') { if (opts.onHouse) opts.onHouse(h.userId, h.username); }
      else if (h.type === 'landmark') { if (opts.onLandmark) opts.onLandmark(h.id); }
      else if (h.type === 'farm') { if (opts.onFarm) opts.onFarm(h.key, h.owner, h.mine); }
      else if (h.type === 'tile') { if (opts.onTile) opts.onTile(h.key, h.owner, h.mine); }
    }

    function onDown(e) {
      try { canvas.setPointerCapture(e.pointerId); } catch (x) { }
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; nPtr = Object.keys(ptrs).length;
      vel.x = vel.y = 0; goal = null; trail = [];
      if (nPtr === 1) down = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false };
      else if (nPtr === 2) { down = null; pinch = null; }
    }
    function onMove(e) {
      var p = ptrs[e.pointerId]; if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (nPtr === 1) {
        cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam();
        if (down && (Math.abs(e.clientX - down.x) > 10 || Math.abs(e.clientY - down.y) > 10)) down.moved = true;
        trail.push({ t: Date.now(), x: cam.x, y: cam.y }); if (trail.length > 6) trail.shift();
        dirty = true;
      } else if (nPtr === 2) {
        var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var r = canvas.getBoundingClientRect();
        if (pinch) {
          if (pinch.d > 0) zoomAt(mx - r.left, my - r.top, d / pinch.d);
          cam.x -= (mx - pinch.mx) / cam.z; cam.y -= (my - pinch.my) / cam.z; clampCam(); dirty = true;
        }
        pinch = { d: d, mx: mx, my: my };
      }
    }
    function onUp(e) {
      var wasOne = nPtr === 1;
      delete ptrs[e.pointerId]; nPtr = Object.keys(ptrs).length;
      if (nPtr < 2) pinch = null;
      if (wasOne && nPtr === 0) {
        if (down && !down.moved && Date.now() - down.t < 500) tap(e.clientX, e.clientY);
        else if (trail.length > 1) {   // gerak lanjut
          var f = trail[0], l = trail[trail.length - 1], dt = Math.max(16, l.t - f.t) / 1000;
          vel.x = (l.x - f.x) / dt; vel.y = (l.y - f.y) / dt;
          var sp = Math.hypot(vel.x, vel.y); if (sp > 1500) { vel.x *= 1500 / sp; vel.y *= 1500 / sp; }
        }
        down = null;
      }
    }
    function onWheel(e) {
      e.preventDefault();
      var r = canvas.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    }
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', function (e) {   // dibatalkan sistem (mis. gestur): lepaskan jari tanpa menghitungnya sebagai ketukan
      delete ptrs[e.pointerId]; nPtr = Object.keys(ptrs).length; pinch = null; down = null;
    });
    canvas.addEventListener('wheel', onWheel, { passive: false });

    /* ------------------------------------------------------------ loop */
    function update(dt) {
      t += dt;
      if (goal) {
        var k = 1 - Math.pow(0.002, dt);
        cam.x += (goal.x - cam.x) * k; cam.y += (goal.y - cam.y) * k; cam.z += (goal.z - cam.z) * k; clampCam(); dirty = true;
        if (Math.hypot(goal.x - cam.x, goal.y - cam.y) < 0.6 && Math.abs(goal.z - cam.z) < 0.004) goal = null;
      }
      if (nPtr === 0 && (Math.abs(vel.x) > 2 || Math.abs(vel.y) > 2)) {
        cam.x += vel.x * dt; cam.y += vel.y * dt; var dec = Math.pow(0.04, dt); vel.x *= dec; vel.y *= dec; clampCam(); dirty = true;
      }
      for (var i = 0; i < mists.length; i++) mists[i].x += mists[i].v * dt;
    }
    function visible() { return !(global.document && global.document.hidden) && container.offsetWidth !== 0 && container.offsetHeight !== 0; }
    function tick(now) {
      if (!running || disposed) return;
      raf = global.requestAnimationFrame(tick);
      if (!visible()) { lastT = now; return; }
      var moving = dirty || nPtr > 0 || goal || Math.abs(vel.x) > 2 || Math.abs(vel.y) > 2;
      var step = moving ? (opts.hemat ? 1000 / 30 : 1000 / 40) : 125;   // diam: hanya kabut, ±8 gambar/detik
      if (now - lastT < step - 2) return;
      var dt = Math.min(0.1, (now - lastT) / 1000); if (dt > 0) st.fps = st.fps * 0.9 + (1 / dt) * 0.1;
      lastT = now;
      update(dt);
      if (!W) resize();
      hour = typeof opts.hourOverride === 'number' ? opts.hourOverride : (new Date().getHours() + new Date().getMinutes() / 60);
      tod = KS.todAt(hour);
      render(); dirty = false;
    }
    function resize() {
      if (disposed) return;
      var w = container.clientWidth || 0, h = container.clientHeight || 0; if (!w || !h) return;
      dpr = Math.min(global.devicePixelRatio || 1, opts.hemat ? 1 : 1.75);
      W = w; H = h; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      if (!mists.length) mists = [{ x: 0.1 * W, y: 0.2, v: 4, s: 1.6, a: 0.16 }, { x: 0.7 * W, y: 0.55, v: -3, s: 2.0, a: 0.12 }, { x: 0.4 * W, y: 0.85, v: 5, s: 1.8, a: 0.14 }];
      dirty = true;
    }
    if (global.ResizeObserver) { ro = new global.ResizeObserver(function () { resize(); }); ro.observe(container); }

    var api = {
      setData: function (d) { prepare(d); me = d.me || null; },
      focus: focus,
      focusMe: function () {
        if (!D || !D.me) return;
        var h = houses.filter(function (x) { return x.mine; })[0];
        if (h) focus(h.gx, h.gy, 1.15); else focus(Math.floor(N / 2), Math.floor(N / 2), 0.9);
      },
      zoomBy: function (f) { zoomAt(W / 2, H / 2, f); },
      start: function () { if (running || disposed) return; running = true; lastT = 0; if (!W) resize(); raf = global.requestAnimationFrame(tick); },
      stop: function () { running = false; if (raf) global.cancelAnimationFrame(raf); },
      resize: resize,
      destroy: function () { disposed = true; api.stop(); if (ro) ro.disconnect(); if (canvas.parentNode) canvas.parentNode.removeChild(canvas); },
      renderOnce: function (dt) { if (!W) resize(); hour = typeof opts.hourOverride === 'number' ? opts.hourOverride : 12; tod = KS.todAt(hour); update(dt || 0.05); render(); },
      hit: hitTest, tap: tap,
      stats: function () { return { fps: st.fps, drawMs: st.ms, tiles: st.tiles, objs: st.objs, zoom: cam.z, houses: houses.length, W: W, H: H }; },
      _cam: cam
    };
    var me = null;
    return api;
  }

  global.DesaMap = { create: create, version: '1.0' };
})(typeof window !== 'undefined' ? window : globalThis);
