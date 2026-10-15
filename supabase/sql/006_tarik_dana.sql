-- ============================================================
-- ToFarmer — 006: Tarik dana (withdraw): anggota mengirim TOF ke dompet pengurus, pengurus mengirim uang
-- Jalankan di Supabase → SQL Editor SEBELUM men-deploy fungsi terbaru. Aman diulang.
-- ============================================================
create table if not exists public.tarik_requests (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         text   not null,
  jumlah_tof_units   bigint not null check (jumlah_tof_units > 0),   -- TOF yang ditarik (6 desimal)
  kurs_rp_per_tof    bigint not null,
  jumlah_rp          bigint not null,                                -- uang yang harus dikirim pengurus
  tujuan_jenis       text   not null,                                -- DANA / GoPay / OVO / ShopeePay / LinkAja / Bank <nama>
  tujuan_nomor       text   not null,
  tujuan_nama        text   not null,
  alamat_tarik       text   not null,                                -- dompet pengurus penerima TOF (saat permintaan dibuat)
  status             text   not null default 'menunggu_tof'
                     check (status in ('menunggu_tof','tof_dikirim','tof_diterima','dibayar','ditolak','dibatalkan','kedaluwarsa')),
  tof_txid           text,
  catatan_sistem     text,                                           -- hasil verifikasi otomatis (mis. 'tidak cocok: ...')
  catatan_admin      text,
  ref_bayar          text,                                           -- referensi pembayaran uang oleh pengurus
  dibuat             timestamptz not null default now(),
  kedaluwarsa_pada   timestamptz not null,
  tof_diterima_pada  timestamptz,
  dibayar_oleh       text,
  dibayar_pada       timestamptz
);
-- satu ID transaksi TOF hanya boleh dipakai untuk satu penarikan
create unique index if not exists tarik_txid_unik on public.tarik_requests (tof_txid) where tof_txid is not null;
create index if not exists tarik_profil_waktu on public.tarik_requests (profile_id, dibuat desc);
create index if not exists tarik_status on public.tarik_requests (status, dibuat desc);

alter table public.tarik_requests enable row level security;
revoke all on public.tarik_requests from anon, authenticated;
