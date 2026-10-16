-- ============================================================
-- 007_lindungi_kolom_profiles.sql
-- Membekukan kolom sensitif tabel profiles dari browser.
--
-- LATAR BELAKANG
--   profiles: RLS nonaktif, tanpa policy -> siapa pun yang punya anon key
--   bisa mengubah role, username, has_pin, pin_hash milik akun mana pun
--   (mis. set pin_hash = sha256('000000') lalu masuk ke Jurnal/Scan/Tracker
--   sebagai korban, atau menjadikan diri sendiri role 'admin').
--
-- KENAPA BUKAN LANGSUNG "ENABLE ROW LEVEL SECURITY"
--   1) Login ToFarmer memakai Edge Function + localStorage, bukan Supabase
--      Auth, jadi auth.uid() kosong: policy tidak bisa tahu "siapa" pemanggilnya.
--   2) Mengaktifkan RLS tanpa policy akan memutus SEMUA halaman yang membaca
--      profiles. Itu fase 3, setelah semua halaman pindah ke tof-vault.
--
-- YANG DILAKUKAN SKRIP INI (aman, tidak memutus alur yang ada)
--   Trigger yang berlaku HANYA untuk role anon/authenticated (browser):
--     INSERT : role dipaksa 'user', has_pin dipaksa false
--     UPDATE : id, username, role, has_pin, pin_hash, created_at tidak boleh berubah
--   Lolos otomatis: Edge Function (service_role), SQL Editor (postgres), dan
--   fungsi SECURITY DEFINER (berjalan sebagai pemiliknya).
--   Tidak ada kode di tofarmer-web yang mengubah kolom-kolom itu dari browser
--   selain jalur lama app.js (setup PIN, sudah ditandai tidak dipakai).
--
-- ROLLBACK (jika ada yang tidak beres):
--   drop trigger if exists profiles_lindungi_kolom_trg on public.profiles;
--   drop function if exists public.profiles_lindungi_kolom();
-- ============================================================

create or replace function public.profiles_lindungi_kolom()
returns trigger
language plpgsql
as $$
begin
  -- Hanya batasi permintaan dari browser (PostgREST memakai role anon/authenticated).
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'user';
    new.has_pin := false;
    return new;
  end if;

  -- UPDATE
  if new.id is distinct from old.id then
    raise exception 'profiles.id tidak boleh diubah dari browser' using errcode = '42501';
  end if;
  if new.username is distinct from old.username then
    raise exception 'username hanya bisa diubah lewat Pengaturan Profil (tof-vault)' using errcode = '42501';
  end if;
  if new.role is distinct from old.role then
    raise exception 'profiles.role tidak boleh diubah dari browser' using errcode = '42501';
  end if;
  if new.has_pin is distinct from old.has_pin then
    raise exception 'profiles.has_pin tidak boleh diubah dari browser' using errcode = '42501';
  end if;
  if new.pin_hash is distinct from old.pin_hash then
    raise exception 'profiles.pin_hash tidak boleh diubah dari browser' using errcode = '42501';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'profiles.created_at tidak boleh diubah dari browser' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_lindungi_kolom_trg on public.profiles;
create trigger profiles_lindungi_kolom_trg
  before insert or update on public.profiles
  for each row execute function public.profiles_lindungi_kolom();


-- ============================================================
-- UJI (jalankan SETELAH skrip di atas; semuanya dibatalkan dengan rollback)
-- Jalankan satu blok per eksekusi.
-- ============================================================

-- Uji 1: harus GAGAL dengan "profiles.role tidak boleh diubah dari browser"
-- begin;
--   set local role anon;
--   update public.profiles set role = 'admin' where id = (select id from public.profiles limit 1);
-- rollback;

-- Uji 2: harus GAGAL (pin_hash)
-- begin;
--   set local role anon;
--   update public.profiles set pin_hash = 'x' where id = (select id from public.profiles limit 1);
-- rollback;

-- Uji 3: harus BERHASIL (kolom lain tetap bisa diubah seperti biasa)
-- begin;
--   set local role anon;
--   update public.profiles set xp = xp where id = (select id from public.profiles limit 1);
-- rollback;

-- Uji 4: harus BERHASIL tetapi role dipaksa 'user' (lihat hasil select)
-- begin;
--   set local role anon;
--   insert into public.profiles (id, username, role) values ('UJI_TRIGGER_TEMP', 'uji_trigger_temp', 'admin');
--   reset role;
--   select id, role, has_pin from public.profiles where id = 'UJI_TRIGGER_TEMP';
-- rollback;
