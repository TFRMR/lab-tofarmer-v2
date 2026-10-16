-- ============================================================
-- 010_matikan_pin_lama.sql   *** JALANKAN HANYA SETELAH ***
--   (a) 009 sudah jalan, (b) tof-vault versi baru sudah di-deploy,
--   (c) Scan, Scanmania, Jurnal, Tracker versi baru sudah live dan dites login + simpan data.
--
-- Efek: hash SHA-256 PIN tidak lagi diterima oleh fungsi RPC, dan kolom profiles.pin_hash
-- dikosongkan. Menutup dua lubang sekaligus:
--   1) PIN tidak bisa lagi ditebak lewat Data API (tinggal token 256-bit),
--   2) tidak ada lagi hash PIN yang terbaca publik.
-- ============================================================

-- 1. Selamatkan PIN akun yang dibuat halaman lama setelah 001 dijalankan (belum punya baris di pin_secrets)
insert into public.pin_secrets (profile_id, algo, pin_hash)
select id, 'sha256', pin_hash from public.profiles
where pin_hash is not null and pin_hash <> ''
on conflict (profile_id) do nothing;

update public.profiles set has_pin = true where pin_hash is not null and pin_hash <> '';

-- 2. RPC hanya menerima token sesi
create or replace function public.tof_check_pin(p_id text, p_pin_hash text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_id is null or p_pin_hash is null then return false; end if;
  if p_pin_hash like 'v1.%' then
    return public.tof_sesi_valid(p_id, p_pin_hash);
  end if;
  return false;
end;
$$;
revoke all on function public.tof_check_pin(text, text) from public, anon, authenticated;

-- 3. Login Tracker lama (username + hash) tidak dipakai lagi
revoke all on function public.tracker_login(text, text) from public, anon, authenticated;

-- 4. Hapus hash publik. (Trigger 007 mengizinkan ini karena dijalankan dari SQL Editor/postgres.)
update public.profiles set pin_hash = null where pin_hash is not null;

-- ============================================================
-- ROLLBACK: jalankan ulang bagian "create or replace function tof_check_pin" dari 009.
-- (pin_hash yang sudah dikosongkan tidak bisa dikembalikan dari sini; salinannya ada di pin_secrets.)
-- ============================================================
