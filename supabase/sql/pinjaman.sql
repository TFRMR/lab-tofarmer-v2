-- Tabel pinjaman (Pinjam ke Diri Sendiri) — jalankan di Supabase SQL Editor.
-- RLS DIAKTIFKAN tanpa policy: tabel hanya bisa dibaca/ditulis oleh Edge Function tof-vault (service role), TIDAK dari browser.
create table if not exists public.pinjaman (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         text not null,                       -- alamat dompet anggota
  username           text,
  pokok_rp           bigint not null check (pokok_rp > 0),
  bunga_persen       numeric(5,2) not null default 5,
  bunga_rp           bigint not null,
  total_rp           bigint not null,                     -- pokok + bunga
  kurs_rp_per_tof    bigint not null,                     -- kurs saat pinjaman dibuat
  jaminan_tof_units  bigint not null,                     -- TOF yang dikunci (6 desimal), dibulatkan ke atas
  bunga_tof_units    bigint not null,                     -- bunga yang dikirim balik sebagai TOF saat lunas
  tenor_hari         int not null,
  tujuan_jenis       text, tujuan_nomor text, tujuan_nama text,
  status             text not null default 'diajukan'
                     check (status in ('diajukan','aktif','dibayar','lunas','ditolak','dibatalkan')),
  dibuat             timestamptz not null default now(),
  dicairkan_pada     timestamptz,
  dicairkan_oleh     text,
  jatuh_tempo        timestamptz,                         -- diisi saat pengurus mencairkan: dicairkan_pada + tenor
  ditagih_admin      boolean not null default false,
  ditagih_pada       timestamptz,
  kode_unik          int,
  total_bayar_rp     bigint,                              -- total_rp + kode unik, dibuat saat anggota menekan Lunasi
  ref_cair           text, ref_user text, catatan_admin text,
  dibayar_pada       timestamptz,
  dilunasi_pada      timestamptz,
  dilunasi_oleh      text,
  bunga_status       text not null default 'belum' check (bunga_status in ('belum','mengirim','terkirim')),
  bunga_catatan      text,
  bunga_txid         text,
  bunga_kirim_pada   timestamptz
);
create index if not exists pinjaman_profil_idx on public.pinjaman (profile_id, status);
create index if not exists pinjaman_status_tempo_idx on public.pinjaman (status, jatuh_tempo);
create index if not exists pinjaman_bunga_idx on public.pinjaman (bunga_status, bunga_kirim_pada);
-- Satu pinjaman berjalan per anggota:
create unique index if not exists pinjaman_satu_berjalan
  on public.pinjaman (profile_id) where status in ('diajukan','aktif','dibayar');
alter table public.pinjaman enable row level security;
-- (tanpa policy = hanya service role / Edge Function yang bisa mengakses)
