-- =====================================================================
-- ToFarmer Pemetaan Wilayah (Regional Mapping Framework v1)
-- Tempel seluruhnya di Supabase > SQL Editor > Run. Aman dijalankan ulang.
-- Pola sama dengan tumbuhan: halaman memanggil fungsi RPC dengan
-- p_id (id akun) + p_pin_hash (token sesi dari tof-vault).
-- Tabel TIDAK bisa diakses langsung dari browser (RLS aktif tanpa policy);
-- semua lewat fungsi security definer di bawah.
-- =====================================================================

-- 1. Tabel rekaman (satu tabel umum, isian formulir di kolom jsonb "d")
create table if not exists public.regional_records (
  uid         uuid primary key,
  kode        text unique not null,                 -- TOF-PER-0001 dst., diberikan server
  jenis       text not null check (jenis in ('wilayah','orang','sumberdaya','inovasi','lahan','eksperimen','ekonomi','kearifan','komunitas','masalah','peluang')),
  judul       text not null,
  area_id     text,
  pilar       int[]  not null default '{}',
  asal        text[] not null default '{}',         -- INT / OBS / DOC / TEST
  status      text not null default 'D0 Raw Record' check (status ~ '^D[0-5]'),
  akses       text not null default 'Community' check (akses in ('Public','Community','Restricted','Private')),
  kontributor text,
  d           jsonb not null default '{}'::jsonb,
  rev         jsonb not null default '[]'::jsonb,   -- riwayat revisi
  pemilik_id  text not null,                        -- id akun ToFarmer pemilik rekaman
  dibuat      timestamptz not null default now(),
  diubah      timestamptz not null default now()
);
create index if not exists regional_records_pemilik_idx on public.regional_records (pemilik_id);
create index if not exists regional_records_jenis_idx   on public.regional_records (jenis);
create index if not exists regional_records_area_idx    on public.regional_records (area_id);

-- 2. Penghitung kode per jenis (supaya kode unik lintas kontributor)
create table if not exists public.regional_counter (
  jenis text primary key,
  n     int not null default 0
);

-- 3. Kunci pintu: tidak ada akses langsung dari browser
alter table public.regional_records enable row level security;
alter table public.regional_counter enable row level security;
revoke all on public.regional_records from anon, authenticated;
revoke all on public.regional_counter from anon, authenticated;

-- 4. PEMERIKSA SESI
-- Sama persis dengan yang dipakai tumbuhan_save: public.tof_check_pin(p_id, token).
create or replace function public.regional_cek_sesi(p_id text, p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.tof_check_pin(p_id, p_token) then
    raise exception 'PIN salah atau akun tidak valid';
  end if;
end $$;

-- 5. Simpan / perbarui rekaman milik sendiri (kode resmi dibuat saat pertama simpan)
create or replace function public.regional_save(p_id text, p_pin_hash text, p_rec jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid; v_jenis text; v_pref text; v_judul text; v_akses text; v_status text;
  v_kode text; v_pemilik text; v_n int; v_pilar int[]; v_asal text[];
begin
  perform public.regional_cek_sesi(p_id, p_pin_hash);
  if p_rec is null or length(p_rec::text) > 200000 then raise exception 'Rekaman terlalu besar'; end if;

  v_uid   := (p_rec->>'uid')::uuid;
  v_jenis := p_rec->>'jenis';
  v_pref  := case v_jenis
    when 'wilayah' then 'AREA' when 'orang' then 'PER' when 'sumberdaya' then 'RES'
    when 'inovasi' then 'INV'  when 'lahan' then 'LAND' when 'eksperimen' then 'EXP'
    when 'ekonomi' then 'ECO'  when 'kearifan' then 'KNW' when 'komunitas' then 'COM'
    when 'masalah' then 'PRB'  when 'peluang' then 'OPP' else null end;
  if v_pref is null then raise exception 'Jenis rekaman tidak dikenal'; end if;

  v_judul := left(btrim(coalesce(p_rec->>'judul', '')), 300);
  if v_judul = '' then raise exception 'Judul wajib diisi'; end if;

  v_akses := coalesce(p_rec->>'akses', 'Community');
  if v_akses not in ('Public','Community','Restricted','Private') then raise exception 'Tingkat akses tidak valid'; end if;

  v_status := coalesce(p_rec->>'status', 'D0 Raw Record');
  if v_status !~ '^D[0-5]' then raise exception 'Status data tidak valid'; end if;

  v_pilar := array(select t.x::int from jsonb_array_elements_text(coalesce(p_rec->'pilar', '[]'::jsonb)) as t(x) where t.x ~ '^[1-5]$');
  v_asal  := array(select t.x from jsonb_array_elements_text(coalesce(p_rec->'asal', '[]'::jsonb)) as t(x) where t.x in ('INT','OBS','DOC','TEST'));

  select pemilik_id, kode into v_pemilik, v_kode from public.regional_records where uid = v_uid;
  if found and v_pemilik <> p_id then raise exception 'Rekaman ini milik kontributor lain'; end if;

  if not found then
    select count(*) into v_n from public.regional_records where pemilik_id = p_id;
    if v_n >= 20000 then raise exception 'Batas rekaman tercapai'; end if;
    insert into public.regional_counter as c (jenis, n) values (v_jenis, 1)
      on conflict (jenis) do update set n = c.n + 1
      returning c.n into v_n;
    v_kode := 'TOF-' || v_pref || '-' || lpad(v_n::text, 4, '0');
  end if;

  insert into public.regional_records as r
    (uid, kode, jenis, judul, area_id, pilar, asal, status, akses, kontributor, d, rev, pemilik_id, dibuat, diubah)
  values
    (v_uid, v_kode, v_jenis, v_judul, nullif(left(p_rec->>'area_id', 200), ''), v_pilar, v_asal, v_status, v_akses,
     nullif(left(p_rec->>'kontributor', 100), ''),
     coalesce(p_rec->'d', '{}'::jsonb), coalesce(p_rec->'rev', '[]'::jsonb), p_id,
     coalesce((p_rec->>'dibuat')::timestamptz, now()), now())
  on conflict (uid) do update set
    judul = excluded.judul, area_id = excluded.area_id, pilar = excluded.pilar, asal = excluded.asal,
    status = excluded.status, akses = excluded.akses, kontributor = excluded.kontributor,
    d = excluded.d, rev = excluded.rev, diubah = now()
  where r.pemilik_id = p_id;

  return jsonb_build_object('kode', v_kode);
end $$;

-- 6. Daftar rekaman yang boleh dilihat: milik sendiri + Public/Community milik orang lain.
--    Restricted dan Private hanya terlihat pemiliknya.
create or replace function public.regional_list(p_id text, p_pin_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.regional_cek_sesi(p_id, p_pin_hash);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'uid', r.uid, 'kode', r.kode, 'jenis', r.jenis, 'judul', r.judul, 'area_id', r.area_id,
      'pilar', to_jsonb(r.pilar), 'asal', to_jsonb(r.asal), 'status', r.status, 'akses', r.akses,
      'kontributor', r.kontributor, 'd', r.d, 'rev', r.rev,
      'dibuat', r.dibuat, 'diubah', r.diubah,
      'milik', (r.pemilik_id = p_id), 'pemilik_nama', r.kontributor
    ) order by r.kode)
    from public.regional_records r
    where r.pemilik_id = p_id or r.akses in ('Public', 'Community')
  ), '[]'::jsonb);
end $$;

-- 7. Hapus rekaman milik sendiri
create or replace function public.regional_delete(p_id text, p_pin_hash text, p_uid text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.regional_cek_sesi(p_id, p_pin_hash);
  delete from public.regional_records where uid = p_uid::uuid and pemilik_id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- 8. Izinkan halaman (kunci anon) memanggil fungsi; tabel tetap tertutup
revoke all on function public.regional_cek_sesi(text, text) from public, anon, authenticated;
grant execute on function public.regional_save(text, text, jsonb)  to anon, authenticated;
grant execute on function public.regional_list(text, text)         to anon, authenticated;
grant execute on function public.regional_delete(text, text, text) to anon, authenticated;
