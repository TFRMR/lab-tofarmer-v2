-- Dividen (positif & negatif) — jalankan di Supabase SQL Editor SETELAH pinjaman.sql (tidak bergantung padanya, urutan bebas).
-- RLS DIAKTIFKAN tanpa policy: hanya Edge Function tof-vault (service role) yang bisa membaca/menulis.

-- Persetujuan anggota (wajib untuk ikut dividen). batas_minus_bp = batas koreksi minus yang disetujui, dalam basis poin (1000 = 10%).
create table if not exists public.dividen_persetujuan (
  profile_id      text primary key,
  batas_minus_bp  int not null check (batas_minus_bp between 100 and 5000),
  versi           int not null default 1,
  disetujui_pada  timestamptz not null default now()
);

-- Periode dividen: persen_bp positif = bagi, negatif = koreksi minus (tarik otomatis dari dompet peserta).
create table if not exists public.dividen_periode (
  id              uuid primary key default gen_random_uuid(),
  label           text not null,
  persen_bp       int not null check (persen_bp <> 0 and abs(persen_bp) <= 10000),
  status          text not null default 'pratinjau'
                  check (status in ('pratinjau','disetujui','berjalan','selesai','dibatalkan')),
  dibuat          timestamptz not null default now(),
  dibuat_oleh     text,
  disetujui_oleh  text,
  disetujui_pada  timestamptz,
  selesai_pada    timestamptz,
  catatan         text
);
-- Satu nama periode hanya sekali (periode yang dibatalkan boleh memakai nama itu lagi)
create unique index if not exists dividen_periode_label_uniq on public.dividen_periode (label) where status <> 'dibatalkan';
-- Hanya satu periode terbuka pada satu waktu
create unique index if not exists dividen_periode_satu_terbuka on public.dividen_periode ((true)) where status in ('pratinjau','disetujui','berjalan');

-- Foto saldo dan hasil per peserta
create table if not exists public.dividen_item (
  id              uuid primary key default gen_random_uuid(),
  periode_id      uuid not null references public.dividen_periode(id) on delete cascade,
  profile_id      text not null,
  username        text,
  saldo_units     bigint not null default 0,      -- saldo TOF on-chain saat pratinjau (6 desimal)
  terkunci_units  bigint not null default 0,      -- TOF yang saat itu menjadi jaminan pinjaman
  arah            text not null check (arah in ('bagi','potong')),
  jumlah_units    bigint not null default 0,
  kurang_units    bigint not null default 0,      -- bagian potongan yang tidak diambil karena TOF-nya jaminan pinjaman
  ikut            boolean not null default true,
  status          text not null default 'menunggu'
                  check (status in ('menunggu','mengirim','selesai','gagal','dilewati')),
  alasan          text,
  txid            text,
  kirim_pada      timestamptz,
  unique (periode_id, profile_id)
);
create index if not exists dividen_item_periode_status_idx on public.dividen_item (periode_id, status);

alter table public.dividen_persetujuan enable row level security;
alter table public.dividen_periode     enable row level security;
alter table public.dividen_item        enable row level security;
-- (tanpa policy = hanya service role / Edge Function yang bisa mengakses)
