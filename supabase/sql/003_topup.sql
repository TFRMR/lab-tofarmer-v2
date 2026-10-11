-- ============================================================
-- ToFarmer — 003: Nabung TOF (top-up rupiah via QRIS, dikonfirmasi manual oleh pengurus)
-- Jalankan di Supabase → SQL Editor SEBELUM men-deploy fungsi tof-vault terbaru. Aman diulang.
-- ============================================================

-- Pengaturan (kurs, batas, QRIS, aturan). Hanya bisa dibaca/diubah lewat Edge Function.
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Permintaan nabung (buku besar)
create table if not exists public.topup_requests (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         text   not null,
  nominal_rp         bigint not null check (nominal_rp > 0),
  kode_unik          int    not null check (kode_unik between 1 and 99),
  total_rp           bigint not null,          -- nominal + kode unik = jumlah yang harus dibayar PERSIS
  kurs_rp_per_tof    bigint not null,          -- kurs saat tagihan dibuat (1 TOF = berapa rupiah)
  tof_units          bigint not null,          -- TOF yang akan diterima, dalam unit terkecil (6 desimal)
  status             text   not null default 'menunggu'
                     check (status in ('menunggu','dibayar','dikonfirmasi','selesai','ditolak','dibatalkan','kedaluwarsa')),
  ref_user           text,                     -- catatan anggota (mis. nama pengirim di DANA)
  catatan_admin      text,
  dibuat             timestamptz not null default now(),
  kedaluwarsa_pada   timestamptz not null,
  dikonfirmasi_oleh  text,
  dikonfirmasi_pada  timestamptz,
  tof_txid           text,                     -- ID transaksi on-chain pengiriman TOF
  selesai_pada       timestamptz,
  selesai_oleh       text
);
-- Dua tagihan aktif tidak boleh punya total yang sama (supaya pembayaran tidak ambigu)
create unique index if not exists topup_total_aktif on public.topup_requests (total_rp) where status in ('menunggu','dibayar');
create unique index if not exists topup_txid_unik   on public.topup_requests (tof_txid) where tof_txid is not null;
create index if not exists topup_profil_waktu       on public.topup_requests (profile_id, dibuat desc);
create index if not exists topup_status             on public.topup_requests (status, dibuat desc);

-- Jejak audit: hanya bisa ditambah, tidak bisa diubah atau dihapus
create table if not exists public.topup_log (
  id         bigint generated always as identity primary key,
  request_id uuid,
  profile_id text,
  aksi       text not null,
  oleh       text,
  detail     jsonb,
  at         timestamptz not null default now()
);
create or replace function public.topup_log_tolak_ubah() returns trigger language plpgsql as $$
begin raise exception 'topup_log hanya bisa ditambah'; end $$;
drop trigger if exists topup_log_kunci on public.topup_log;
create trigger topup_log_kunci before update or delete on public.topup_log
  for each row execute function public.topup_log_tolak_ubah();

-- Tertutup untuk kunci publik: hanya Edge Function (service role) yang bisa akses
alter table public.app_settings    enable row level security;
alter table public.topup_requests  enable row level security;
alter table public.topup_log       enable row level security;
revoke all on public.app_settings   from anon, authenticated;
revoke all on public.topup_requests from anon, authenticated;
revoke all on public.topup_log      from anon, authenticated;

-- Selanjutnya: set secret ADMIN_IDS = alamat dompet para pengurus, dipisah koma
--   (Dashboard → Edge Functions → Secrets  ·  atau: supabase secrets set ADMIN_IDS="ALAMAT1,ALAMAT2")
