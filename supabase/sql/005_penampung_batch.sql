-- ============================================================
-- ToFarmer — 005: TOF ditampung dulu, dibagikan per batch (minimal 500 TOF)
-- Jalankan di Supabase → SQL Editor SETELAH 004, SEBELUM men-deploy fungsi terbaru. Aman diulang.
-- ============================================================
alter table public.topup_requests
  add column if not exists jalur            text,         -- 'tampung' | 'langsung' (jalur pengiriman tahap 1)
  add column if not exists ditampung_pada   timestamptz,  -- kapan TOF masuk dompet penampung
  add column if not exists batch_id         uuid,         -- batch pembagian yang memuat setoran ini
  add column if not exists txid_distribusi  text,         -- ID transaksi pembagian ke dompet anggota
  add column if not exists distribusi_pada  timestamptz;

alter table public.topup_requests drop constraint if exists topup_requests_status_check;
alter table public.topup_requests add constraint topup_requests_status_check
  check (status in ('menunggu','dibayar','dikonfirmasi','mengirim','ditampung','selesai','ditolak','dibatalkan','kedaluwarsa'));

create unique index if not exists topup_txid_distribusi_unik on public.topup_requests (txid_distribusi) where txid_distribusi is not null;
create index if not exists topup_batch on public.topup_requests (batch_id) where batch_id is not null;

-- Batch pembagian
create table if not exists public.topup_batch (
  id                uuid primary key default gen_random_uuid(),
  nomor             int generated always as identity,
  status            text not null default 'disiapkan' check (status in ('disiapkan','siap_dibagikan','selesai','dibatalkan')),
  total_tof_units   bigint not null default 0,
  jumlah_item       int not null default 0,
  dibuat            timestamptz not null default now(),
  dibuat_oleh       text,
  investasi_oleh    text,          -- pengurus yang menyatakan sudah menopup akun investasi
  investasi_pada    timestamptz,
  investasi_catatan text,
  selesai_pada      timestamptz
);
-- Hanya boleh ada SATU batch terbuka pada satu waktu
create unique index if not exists topup_batch_satu_terbuka on public.topup_batch ((true)) where status in ('disiapkan','siap_dibagikan');

alter table public.topup_batch enable row level security;
revoke all on public.topup_batch from anon, authenticated;
