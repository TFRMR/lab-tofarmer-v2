#!/usr/bin/env python3
"""
bangun_atlas.py -- kemas banyak PNG (satu berkas per sprite) menjadi SATU atlas WebP
+ manifest.json yang dibaca kebun-scene.js.

Pakai:
    pip install pillow
    python bangun_atlas.py kerangka/ -o aset/kebun/

Hasil di aset/kebun/:
    kebun-atlas.webp   (satu gambar berisi semua sprite)
    manifest.json      (posisi tiap sprite di atlas + titik jangkar)

Aturan:
  * Nama berkas = nama sprite (mis. crop_ubijalar_3.png). Nama yang tidak dikenal game
    tetap dikemas, hanya tidak dipakai.
  * Boleh mengemas SEBAGIAN saja. Sprite yang tidak ada di atlas tetap memakai gambar
    sementara buatan kode, jadi seni bisa ditambah bertahap.
  * Jangkar dan lebar (dalam satuan petak) diambil dari anchors.json di folder sumber bila ada
    (paket kerangka sudah menyertakannya). Bisa ditimpa lewat --meta meta.json:
        {"tree_kelapa": {"wTiles": 1.1, "ax": 0.5, "ay": 0.97}}
  * Anggaran berat: atlas <= 2048x2048 px; usahakan berkas .webp < 500 KB.
"""
import argparse
import json
import math
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('Butuh Pillow: pip install pillow')


def load_json(path):
    if path and os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    return {}


def pack(images, max_size, pad):
    """Penataan rak (shelf) ke satu atau BEBERAPA halaman atlas, masing-masing <= max_size x max_size.
    Mengembalikan daftar halaman: [(posisi{nama:(x,y)}, lebar, tinggi), ...]."""
    order = sorted(images, key=lambda n: (-images[n].height, -images[n].width, n))
    for n in order:
        if images[n].width + pad > max_size or images[n].height + pad > max_size:
            sys.exit(f'Sprite {n} ({images[n].width}x{images[n].height}) lebih besar dari atlas {max_size}px. Kecilkan atau naikkan --maks.')
    total_area = sum((im.width + pad) * (im.height + pad) for im in images.values())
    widest = max(im.width for im in images.values()) + pad
    width = min(max_size, max(widest, int(math.ceil(math.sqrt(total_area) * 1.1 / 16.0)) * 16))
    pages, pos, x, y, row_h = [], {}, 0, 0, 0
    for n in order:
        im = images[n]
        w, h = im.width + pad, im.height + pad
        if x + w > width:
            x, y, row_h = 0, y + row_h, 0
        if y + h > max_size:                       # halaman penuh -> mulai halaman baru
            pages.append((pos, width, y + row_h))
            pos, x, y, row_h = {}, 0, 0, 0
        pos[n] = (x, y)
        x += w
        row_h = max(row_h, h)
    pages.append((pos, width, y + row_h))
    return pages


def main():
    ap = argparse.ArgumentParser(description='Kemas PNG menjadi atlas WebP + manifest.json')
    ap.add_argument('sumber', help='folder berisi PNG (nama berkas = nama sprite)')
    ap.add_argument('-o', '--keluar', default='aset/kebun', help='folder hasil (default aset/kebun)')
    ap.add_argument('--nama', default='kebun-atlas.webp', help='nama berkas atlas')
    ap.add_argument('--kualitas', type=int, default=82, help='kualitas WebP 1-100 (default 82)')
    ap.add_argument('--lossless', action='store_true', help='WebP tanpa kehilangan (lebih besar)')
    ap.add_argument('--maks', type=int, default=2048, help='ukuran sisi atlas maksimum px (default 2048)')
    ap.add_argument('--jarak', type=int, default=2, help='jarak antar sprite px (default 2)')
    ap.add_argument('--meta', help='meta.json untuk menimpa wTiles/ax/ay per sprite')
    a = ap.parse_args()

    meta = load_json(os.path.join(a.sumber, 'anchors.json'))
    meta.update(load_json(a.meta))

    images = {}
    for fn in sorted(os.listdir(a.sumber)):
        if fn.lower().endswith('.png'):
            images[os.path.splitext(fn)[0]] = Image.open(os.path.join(a.sumber, fn)).convert('RGBA')
    if not images:
        sys.exit('Tidak ada berkas .png di ' + a.sumber)

    pages = pack(images, a.maks, a.jarak)
    os.makedirs(a.keluar, exist_ok=True)
    stem, ext = os.path.splitext(a.nama)
    manifest_pages, total_kb = [], 0
    for idx, (pos, W, H) in enumerate(pages):
        H = min(int(math.ceil(H / 4.0)) * 4, a.maks)
        atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        frames = {}
        for n, (x, y) in pos.items():
            atlas.paste(images[n], (x, y))
            fr = {'x': x, 'y': y, 'w': images[n].width, 'h': images[n].height}
            m = meta.get(n)
            if m:
                for k in ('wTiles', 'ax', 'ay'):
                    if k in m:
                        fr[k] = m[k]
            frames[n] = fr
        name = a.nama if len(pages) == 1 else f'{stem}-{idx + 1}{ext}'
        out_img = os.path.join(a.keluar, name)
        if a.lossless:
            atlas.save(out_img, 'WEBP', lossless=True, quality=100, method=6)
        else:
            atlas.save(out_img, 'WEBP', quality=a.kualitas, method=6, alpha_quality=100)
        kb = os.path.getsize(out_img) / 1024
        total_kb += kb
        manifest_pages.append({'image': name, 'frames': frames})
        print(f'  halaman {idx + 1}: {name}  {W}x{H}px  {len(frames)} sprite  {kb:.0f} KB')
    with open(os.path.join(a.keluar, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump({'version': 1, 'atlases': manifest_pages}, f, indent=1)
    print(f'{len(images)} sprite -> {len(pages)} atlas, total {total_kb:.0f} KB')
    if total_kb > 600:
        print('Catatan: di atas 600 KB. Turunkan --kualitas atau kecilkan sprite besar (beringin, gunung, rumah).')
    mem = sum(p[1] * min(int(math.ceil(p[2] / 4.0)) * 4, a.maks) * 4 for p in pages) / 1048576
    if mem > 24:
        print(f'Catatan: memori GPU atlas ± {mem:.0f} MB. Pertimbangkan resolusi kerja lebih kecil (mis. 160 px per petak).')


if __name__ == '__main__':
    main()
