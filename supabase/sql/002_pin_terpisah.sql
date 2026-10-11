-- ============================================================
-- ToFarmer — 002: penanda "PIN dompet sudah dipisah dari hash publik"
-- Jalankan di Supabase → SQL Editor SEBELUM men-deploy fungsi tof-vault versi terbaru.
-- Aman dijalankan berulang.
-- ============================================================
alter table public.pin_secrets
  add column if not exists pin_terpisah boolean not null default false;
