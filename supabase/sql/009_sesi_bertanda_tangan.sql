-- ============================================================
-- 009_sesi_bertanda_tangan.sql
-- Login sekali -> semua halaman. Menggantikan "hash PIN di browser" untuk fungsi RPC.
--
-- MASALAH SEKARANG
--   Fungsi RPC (qr_*, olahrasa_*, tracker_*) memeriksa p_pin_hash = SHA-256 dari PIN, dicocokkan ke
--   profiles.pin_hash (kolom yang terbaca publik). Akibatnya:
--     1) akun yang dibuat lewat vault (pin_hash kosong) tidak dikenali di halaman-halaman itu,
--     2) fungsi-fungsi itu bisa dipakai menebak PIN 6 digit tanpa batas percobaan lewat Data API.
--
-- CARA KERJA BARU (tanpa mengubah satu pun fungsi RPC / nama parameter)
--   Edge Function tof-vault, setelah PIN terbukti benar di server, mengembalikan token sesi
--       v1.<kedaluwarsa>.<HMAC-SHA256(kunci, id.kedaluwarsa.salt-PIN)>
--   Halaman mengirim token itu pada parameter p_pin_hash yang sama. tof_check_pin() sekarang
--   memeriksa tanda tangan token. Hash SHA-256 lama MASIH diterima sampai 010 dijalankan,
--   jadi urutan pasang tidak memutus halaman mana pun.
--
-- AMAN DIJALANKAN BERULANG. ROLLBACK ada di bagian paling bawah.
-- ============================================================

-- pgcrypto menyediakan hmac(); di Supabase biasanya sudah terpasang di schema "extensions"
do $$
begin
  create extension if not exists pgcrypto with schema extensions;
exception when others then
  raise notice 'pgcrypto: % (lanjut; uji hmac di bagian bawah akan memastikan)', sqlerrm;
end $$;

-- Kunci tanda tangan: tabel tertutup (hanya service role/Edge Function dan fungsi SECURITY DEFINER)
create table if not exists public.tof_secret (
  name  text primary key,
  value text not null
);
alter table public.tof_secret enable row level security;
revoke all on public.tof_secret from anon, authenticated;

insert into public.tof_secret (name, value)
values ('sesi_kunci', encode(gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

-- Pemeriksa token. Salt PIN ikut ditandatangani: ganti PIN / reset admin => semua sesi lama gugur.
create or replace function public.tof_sesi_valid(p_id text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_part  text[];
  v_exp   bigint;
  v_kunci text;
  v_salt  text;
  v_ok    text;
begin
  if p_id is null or p_token is null then return false; end if;

  v_part := string_to_array(p_token, '.');
  if array_length(v_part, 1) is distinct from 3 or v_part[1] <> 'v1' then return false; end if;
  if v_part[2] !~ '^[0-9]{1,12}$' or v_part[3] !~ '^[0-9a-f]{64}$' then return false; end if;

  v_exp := v_part[2]::bigint;
  if v_exp < extract(epoch from now())::bigint then return false; end if;

  select value into v_kunci from public.tof_secret where name = 'sesi_kunci';
  if v_kunci is null then return false; end if;

  select coalesce(salt, '') into v_salt from public.pin_secrets where profile_id = p_id;
  if not found then return false; end if;

  v_ok := encode(hmac(p_id || '.' || v_part[2] || '.' || v_salt, v_kunci, 'sha256'), 'hex');

  -- bandingkan lewat HMAC kedua supaya waktu eksekusi tidak membocorkan awalan yang cocok
  return hmac(v_ok, v_kunci, 'sha256') = hmac(v_part[3], v_kunci, 'sha256');
end;
$$;

-- Pintu masuk semua RPC: token sesi (v1.*) ATAU hash SHA-256 lama (sementara)
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

  -- JALUR LAMA (dimatikan oleh 010_matikan_pin_lama.sql)
  return exists (
    select 1 from public.profiles
    where id = p_id and pin_hash is not null and pin_hash = p_pin_hash
  );
end;
$$;

-- Tracker memakai pemeriksa sendiri; arahkan ke yang sama (tracker_load/save/clear tidak perlu diubah)
create or replace function public.tracker_check(p_user_id text, p_pin_hash text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select public.tof_check_pin(p_user_id, p_pin_hash);
$$;

-- Pemeriksa tidak boleh dipanggil langsung dari browser (itu "mesin penebak PIN" gratis).
-- Fungsi RPC lain tetap bisa memanggilnya karena berjalan sebagai pemiliknya (SECURITY DEFINER).
revoke all on function public.tof_sesi_valid(text, text) from public, anon, authenticated;
revoke all on function public.tof_check_pin(text, text)  from public, anon, authenticated;
revoke all on function public.tracker_check(text, text)  from public, anon, authenticated;

-- Uji cepat: harus mengembalikan 64 karakter hex (jika error "function hmac does not exist",
-- pgcrypto belum terpasang: Dashboard -> Database -> Extensions -> pgcrypto)
select encode(hmac('uji', 'kunci', 'sha256'), 'hex') as hmac_ok;

-- ============================================================
-- ROLLBACK (mengembalikan perilaku lama persis):
--   create or replace function public.tof_check_pin(p_id text, p_pin_hash text) returns boolean
--     language sql security definer set search_path to 'public' as $f$
--       select exists (select 1 from public.profiles where id = p_id and pin_hash is not null and pin_hash = p_pin_hash);
--     $f$;
--   create or replace function public.tracker_check(p_user_id text, p_pin_hash text) returns boolean
--     language sql security definer set search_path to 'public' as $f$
--       select exists (select 1 from public.profiles p where p.id = p_user_id and p.pin_hash is not null and p.pin_hash = p_pin_hash);
--     $f$;
--   (tabel tof_secret dan fungsi tof_sesi_valid boleh dibiarkan)
-- ============================================================
