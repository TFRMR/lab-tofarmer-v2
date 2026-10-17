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
--
-- CEK DULU (hanya membaca; jalankan satu per satu SEBELUM skrip di bawah):
--
--   -- (a) berapa akun yang PIN-nya hanya ada di profiles.pin_hash dan akan diselamatkan langkah 1
--   select count(*) from public.profiles p
--   where p.pin_hash is not null and p.pin_hash <> ''
--     and not exists (select 1 from public.pin_secrets s where s.profile_id = p.id);
--
--   -- (b) akun yang PIN di pin_secrets BERBEDA dari pin_hash (langkah 4 akan membuang pin_hash-nya;
--   --     yang berlaku tetap yang di pin_secrets). Idealnya kosong.
--   select p.id, p.username from public.profiles p
--   join public.pin_secrets s on s.profile_id = p.id
--   where p.pin_hash is not null and s.algo = 'sha256' and s.pin_hash <> p.pin_hash;
--
--   -- (c) akun yang tidak punya PIN sama sekali (tidak bisa login sebelum maupun sesudah; harus buat PIN dari beranda)
--   select count(*) from public.profiles p
--   where not exists (select 1 from public.pin_secrets s where s.profile_id = p.id)
--     and (p.pin_hash is null or p.pin_hash = '');
--
-- PIN TIDAK HILANG: PIN yang berlaku untuk login selalu yang di pin_secrets (tabel tertutup). Skrip ini hanya
-- (1) menyalin PIN yang tertinggal di profiles ke sana, (2) berhenti menerima hash SHA-256 sebagai kunci RPC,
-- (3) membuang salinan publiknya. Pengguna tetap masuk dengan PIN yang sama.
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
