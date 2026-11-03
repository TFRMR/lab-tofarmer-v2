-- ============================================================
-- ToFarmer — 012: Antrean & pengingat lambat respon untuk PENGURUS
-- Jalankan SETELAH 011_push.sql. Aman diulang. tof-vault TIDAK diubah.
--
-- Isi:
--   1) Tabel push_menunggu = daftar pekerjaan yang sedang menunggu pengurus (otomatis diisi/dibersihkan trigger).
--   2) Pengingat berjenjang: bila ada pekerjaan menunggu melebihi batas waktunya, pengurus dapat 1 push
--      ringkasan (maks 1 per 2 jam, hanya pukul 07.00-21.59 WIB) — jadi tidak spam dan tidak tengah malam.
--   3) Notifikasi langsung saat ada klaim tugas baru.
--   4) Fungsi push_antrean untuk penghitung di halaman pengurus.
-- ============================================================

-- ---------- 1. Antrean pekerjaan menunggu pengurus ----------
create table if not exists public.push_menunggu (
  kunci   text primary key,                 -- 'topup:<id>', 'tarik:<id>', dst.
  jenis   text not null,                    -- topup | tarik | pinjaman | cicilan | klaim
  status  text not null,
  sejak   timestamptz not null default now()
);
alter table public.push_menunggu enable row level security;
revoke all on public.push_menunggu from anon, authenticated;

-- Trigger umum. Argumen: (1) nama jenis, (2) daftar status yang berarti "menunggu pengurus" dipisah koma.
create or replace function public.trg_antrean() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kunci text := tg_argv[0] || ':' || new.id::text;
begin
  if new.status = any (string_to_array(tg_argv[1], ',')) then
    insert into public.push_menunggu (kunci, jenis, status, sejak)
    values (v_kunci, tg_argv[0], new.status, now())
    on conflict (kunci) do update
      set status = excluded.status,
          sejak  = case when public.push_menunggu.status = excluded.status then public.push_menunggu.sejak else now() end;
  else
    delete from public.push_menunggu where kunci = v_kunci;
  end if;
  return new;
exception when others then return new;
end $$;

do $$
begin
  if to_regclass('public.topup_requests') is not null then
    drop trigger if exists antrean_topup on public.topup_requests;
    create trigger antrean_topup after insert or update of status on public.topup_requests
      for each row execute function public.trg_antrean('topup', 'dibayar,mengirim');
  end if;
  if to_regclass('public.tarik_requests') is not null then
    drop trigger if exists antrean_tarik on public.tarik_requests;
    create trigger antrean_tarik after insert or update of status on public.tarik_requests
      for each row execute function public.trg_antrean('tarik', 'tof_dikirim,tof_diterima');
  end if;
  if to_regclass('public.pinjaman') is not null then
    drop trigger if exists antrean_pinjaman on public.pinjaman;
    create trigger antrean_pinjaman after insert or update of status on public.pinjaman
      for each row execute function public.trg_antrean('pinjaman', 'diajukan,dibayar');
  end if;
  if to_regclass('public.pinjaman_cicilan') is not null then
    drop trigger if exists antrean_cicilan on public.pinjaman_cicilan;
    create trigger antrean_cicilan after insert or update of status on public.pinjaman_cicilan
      for each row execute function public.trg_antrean('cicilan', 'dibayar');
  end if;
  if to_regclass('public.tugas_klaim') is not null then
    drop trigger if exists antrean_klaim on public.tugas_klaim;
    create trigger antrean_klaim after insert or update of status on public.tugas_klaim
      for each row execute function public.trg_antrean('klaim', 'menunggu');
  end if;
end $$;

-- Isi awal dari pekerjaan yang SEKARANG sedang menunggu (waktu mulai dihitung dari sekarang, bukan dari masa lalu,
-- supaya pemasangan ini tidak langsung membanjiri pengurus dengan pengingat "sudah berhari-hari").
do $$
begin
  if to_regclass('public.topup_requests') is not null then
    insert into public.push_menunggu (kunci, jenis, status) select 'topup:' || id::text, 'topup', status
      from public.topup_requests where status in ('dibayar', 'mengirim') on conflict do nothing;
  end if;
  if to_regclass('public.tarik_requests') is not null then
    insert into public.push_menunggu (kunci, jenis, status) select 'tarik:' || id::text, 'tarik', status
      from public.tarik_requests where status in ('tof_dikirim', 'tof_diterima') on conflict do nothing;
  end if;
  if to_regclass('public.pinjaman') is not null then
    insert into public.push_menunggu (kunci, jenis, status) select 'pinjaman:' || id::text, 'pinjaman', status
      from public.pinjaman where status in ('diajukan', 'dibayar') on conflict do nothing;
  end if;
  if to_regclass('public.pinjaman_cicilan') is not null then
    insert into public.push_menunggu (kunci, jenis, status) select 'cicilan:' || id::text, 'cicilan', status
      from public.pinjaman_cicilan where status = 'dibayar' on conflict do nothing;
  end if;
  if to_regclass('public.tugas_klaim') is not null then
    insert into public.push_menunggu (kunci, jenis, status) select 'klaim:' || id::text, 'klaim', status
      from public.tugas_klaim where status = 'menunggu' on conflict do nothing;
  end if;
end $$;

-- ---------- 2. Pengingat lambat respon ----------
-- Batas waktu (menit) sebelum sebuah pekerjaan dianggap terlambat
create or replace function public.push_batas_menit(p_jenis text, p_status text) returns int
language sql immutable as $$
  select case p_jenis || ':' || p_status
    when 'topup:dibayar'      then 60    -- nabung sudah dibayar, belum dikonfirmasi
    when 'topup:mengirim'     then 15    -- TOF macet saat dikirim otomatis
    when 'tarik:tof_dikirim'  then 30    -- TOF tarik dilaporkan, belum terverifikasi
    when 'tarik:tof_diterima' then 60    -- TOF sudah diterima, uang belum dikirim
    when 'pinjaman:diajukan'  then 120   -- pengajuan pinjaman belum dicairkan
    when 'pinjaman:dibayar'   then 60    -- pelunasan belum dicocokkan
    when 'cicilan:dibayar'    then 60    -- cicilan belum dicocokkan
    when 'klaim:menunggu'     then 720   -- klaim tugas belum diproses
    else 180 end
$$;

create or replace function public.push_label(p_jenis text, p_status text) returns text
language sql immutable as $$
  select case p_jenis || ':' || p_status
    when 'topup:dibayar'      then 'nabung belum dikonfirmasi'
    when 'topup:mengirim'     then 'TOF nabung perlu dicek'
    when 'tarik:tof_dikirim'  then 'tarik dana perlu verifikasi TOF'
    when 'tarik:tof_diterima' then 'tarik dana belum dikirim uangnya'
    when 'pinjaman:diajukan'  then 'pinjaman belum dicairkan'
    when 'pinjaman:dibayar'   then 'pelunasan belum dicocokkan'
    when 'cicilan:dibayar'    then 'cicilan belum dicocokkan'
    when 'klaim:menunggu'     then 'klaim tugas belum diproses'
    else p_jenis || ' ' || p_status end
$$;

create or replace function public.push_sla_pengurus() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_jam int := extract(hour from (now() at time zone 'Asia/Jakarta'))::int;
  v_total int; v_tertua int; v_rinci text; v_msg text;
begin
  -- Hanya jam wajar (07.00-21.59 WIB)
  if v_jam < 7 or v_jam >= 22 then return 0; end if;

  with terlambat as (
    select jenis, status, extract(epoch from (now() - sejak)) / 60 as menit
      from public.push_menunggu
     where extract(epoch from (now() - sejak)) / 60 >= public.push_batas_menit(jenis, status)
  )
  select count(*), coalesce(max(menit), 0)::int,
         (select string_agg(n::text || ' ' || public.push_label(j, s), ', ' order by n desc)
            from (select jenis as j, status as s, count(*) as n from terlambat group by jenis, status) x)
    into v_total, v_tertua, v_rinci
    from terlambat;

  if coalesce(v_total, 0) = 0 then return 0; end if;

  -- Maks 1 pengingat per 2 jam
  if not public.push_boleh('sla:pengurus', 120) then return 0; end if;

  v_msg := '⏰ ' || v_total::text || ' pekerjaan menunggu pengurus (tertua '
           || case when v_tertua >= 120 then (v_tertua / 60)::text || ' jam' else v_tertua::text || ' menit' end
           || '): ' || left(v_rinci, 110) || '. Buka halaman pengurus.';
  perform public.tof_notif_pengurus(null, 'pengurus_sla', v_msg);
  return v_total;
end $$;

-- ---------- 3. Klaim tugas baru -> pengurus ----------
create or replace function public.trg_notif_klaim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'menunggu' then
    perform public.tof_notif_pengurus(new.profile_id, 'pengurus_tugas',
      '@' || public.tof_username(new.profile_id) || ' mengajukan klaim tugas (' || coalesce(left(new.kode, 40), '-') || ') — menunggu persetujuan 📝');
  end if;
  return new;
exception when others then return new;
end $$;

do $$
begin
  if to_regclass('public.tugas_klaim') is not null then
    drop trigger if exists notif_klaim on public.tugas_klaim;
    create trigger notif_klaim after insert on public.tugas_klaim
      for each row execute function public.trg_notif_klaim();
  end if;
end $$;

-- ---------- 4. Penghitung antrean untuk halaman pengurus (hanya untuk pengurus yang sedang login) ----------
create or replace function public.push_antrean(p_id text, p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v jsonb;
begin
  if not public.tof_sesi_valid(p_id, p_token) then return null; end if;
  if not exists (select 1 from public.push_pengurus where profile_id = p_id) then return null; end if;
  select jsonb_build_object(
           'total', count(*),
           'terlambat', count(*) filter (where extract(epoch from (now() - sejak)) / 60 >= public.push_batas_menit(jenis, status)),
           'tertua_menit', coalesce(max(extract(epoch from (now() - sejak)) / 60), 0)::int)
    into v from public.push_menunggu;
  return v;
end $$;

-- ---------- 5. Penguncian (tidak boleh dipanggil dari browser, kecuali push_antrean yang diperiksa token+pengurus) ----------
revoke all on function public.trg_antrean() from public, anon, authenticated;
revoke all on function public.push_batas_menit(text, text) from public, anon, authenticated;
revoke all on function public.push_label(text, text) from public, anon, authenticated;
revoke all on function public.push_sla_pengurus() from public, anon, authenticated;
revoke all on function public.trg_notif_klaim() from public, anon, authenticated;
revoke all on function public.push_antrean(text, text) from public;
grant execute on function public.push_antrean(text, text) to anon, authenticated;

-- ---------- 6. Jadwal: tiap 30 menit (pg_cron). Jalankan SEKALI: ----------
-- select cron.schedule('tof-push-sla-pengurus', '*/30 * * * *', $$ select public.push_sla_pengurus(); $$);
