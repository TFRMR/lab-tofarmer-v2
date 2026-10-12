-- ============================================================
-- ToFarmer — 004: pengiriman TOF otomatis setelah pengurus mengonfirmasi
-- Jalankan di Supabase → SQL Editor SETELAH 003_topup.sql dan SEBELUM men-deploy fungsi terbaru. Aman diulang.
-- ============================================================
alter table public.topup_requests
  add column if not exists auto_kirim_pada timestamptz,   -- kapan pengiriman otomatis dimulai (untuk batas harian)
  add column if not exists kirim_catatan   text;          -- alasan pengiriman tertunda / catatan sistem

-- status baru 'mengirim' = TOF sedang dikirim otomatis (mencegah pengiriman ganda)
alter table public.topup_requests drop constraint if exists topup_requests_status_check;
alter table public.topup_requests add constraint topup_requests_status_check
  check (status in ('menunggu','dibayar','dikonfirmasi','mengirim','selesai','ditolak','dibatalkan','kedaluwarsa'));

create index if not exists topup_auto_waktu on public.topup_requests (auto_kirim_pada) where auto_kirim_pada is not null;

-- Secret yang perlu ditambahkan di Edge Functions → Secrets:
--   PAYOUT_MNEMONIC = 25 kata dompet PEMBAYAR khusus (dompet baru, BUKAN dompet kas utama)
--   (opsional) TOF_ASSET_ID, ALGOD_URL
