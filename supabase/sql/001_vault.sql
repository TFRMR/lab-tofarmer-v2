-- ============================================================
-- ToFarmer — Brankas frasa + PIN di server
-- Jalankan di Supabase → SQL Editor, BAGIAN 1 dulu.
-- ============================================================

-- ---------- BAGIAN 1 : tabel baru (aman dijalankan kapan saja) ----------

-- PIN disimpan di tabel TERTUTUP (tidak bisa dibaca kunci publik/anon)
create table if not exists public.pin_secrets (
  profile_id   text primary key,
  algo         text not null default 'sha256',  -- 'sha256' = warisan, 'pbkdf2' = baru
  salt         text,
  pin_hash     text not null,
  fails        int  not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

-- Brankas frasa: ciphertext AES-256-GCM, kunci hanya ada di secret Edge Function
create table if not exists public.wallet_vault (
  profile_id    text primary key,
  ciphertext    text not null,
  iv            text not null,
  ver           int  not null default 1,
  reset_pending boolean not null default false,  -- true hanya jika admin mereset PIN
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Jejak akses (daftar/titip/lihat frasa) — isi frasa TIDAK pernah dicatat
create table if not exists public.vault_log (
  id         bigint generated always as identity primary key,
  profile_id text not null,
  action     text not null,
  ok         boolean not null,
  at         timestamptz not null default now()
);

-- RLS aktif TANPA policy + cabut hak = hanya service role (Edge Function) yang bisa akses
alter table public.pin_secrets  enable row level security;
alter table public.wallet_vault enable row level security;
alter table public.vault_log    enable row level security;
revoke all on public.pin_secrets  from anon, authenticated;
revoke all on public.wallet_vault from anon, authenticated;
revoke all on public.vault_log    from anon, authenticated;

-- Penanda "sudah punya PIN" yang boleh dibaca publik (hanya informasi UI, server tidak percaya ini)
alter table public.profiles add column if not exists has_pin boolean not null default false;

-- Salin PIN lama (SHA-256) ke tabel tertutup; akan otomatis dinaikkan ke PBKDF2 saat user login berikutnya
insert into public.pin_secrets (profile_id, algo, pin_hash)
select id, 'sha256', pin_hash from public.profiles
where pin_hash is not null and pin_hash <> ''
on conflict (profile_id) do nothing;

update public.profiles set has_pin = true where pin_hash is not null and pin_hash <> '';

-- Fungsi admin: reset PIN (dipakai saat user lupa PIN). Tidak bisa dipanggil dari browser.
create or replace function public.admin_reset_pin(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_id text;
begin
  select id into v_id from public.profiles where lower(username) = lower(p_username) limit 1;
  if v_id is null then return 'username tidak ditemukan'; end if;
  delete from public.pin_secrets where profile_id = v_id;
  update public.profiles set has_pin = false, pin_hash = null where id = v_id;
  update public.wallet_vault set reset_pending = true where profile_id = v_id;
  return 'PIN direset untuk ' || v_id;
end $$;
revoke all on function public.admin_reset_pin(text) from public, anon, authenticated;
-- Cara pakai (SQL Editor):  select public.admin_reset_pin('namauser');

-- ---------- BAGIAN 2 : JALANKAN SETELAH Edge Function + app.js/login.js/profile.js baru sudah online ----------
-- Hapus hash PIN lama dari tabel profiles supaya tidak bisa dibaca/ditebak publik:
--   update public.profiles set pin_hash = null;
-- (opsional, setelah yakin semuanya jalan)  alter table public.profiles drop column pin_hash;
