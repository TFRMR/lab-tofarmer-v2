-- ============================================================
-- 008_dump_audit.sql  (HANYA MEMBACA, tidak mengubah apa pun)
-- Jalankan satu per satu di Supabase SQL Editor lalu tempel hasilnya ke chat.
-- Tujuannya: melihat apa yang ada di database tetapi tidak ada di repo
-- (RLS tiap tabel, policy, fungsi RPC, hak akses) agar fase berikutnya
-- tidak menebak-nebak.
-- ============================================================

-- A. Status RLS semua tabel di schema public
select c.relname as tabel, c.relrowsecurity as rls_aktif,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as jumlah_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;

-- B. Semua policy (ringkas)
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd;

-- C. Fungsi RPC yang dipanggil dari browser (isi lengkap + SECURITY DEFINER atau bukan)
select p.proname as fungsi, p.prosecdef as security_definer,
       pg_get_function_arguments(p.oid) as argumen,
       pg_get_functiondef(p.oid) as definisi
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proname like 'fn\_%' or p.proname like 'qr\_%' or p.proname like 'tracker\_%'
       or p.proname like 'match\_%' or p.proname like 'admin\_%')
order by p.proname;

-- D. Hak akses kolom profiles untuk anon / authenticated
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles' and grantee in ('anon', 'authenticated')
order by grantee, privilege_type, column_name;

-- E. Trigger yang sudah ada di profiles
select tgname, pg_get_triggerdef(oid) as definisi
from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal;

-- F. Bucket penyimpanan dan policy-nya (foto profil / gambar post)
select id, name, public from storage.buckets;
select policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'storage' and tablename = 'objects';
