-- ============================================================
-- ToFarmer — 011: Notifikasi push (layar HP) untuk anggota & pengurus
-- Jalankan di Supabase → SQL Editor. Aman diulang. Urutan pasang ada di PETUNJUK-PUSH.md.
--
-- Cara kerja:
--   1) Peristiwa dompet (nabung, tarik, pinjam, cicilan, dividen, toples) mengubah status di tabelnya.
--   2) Trigger di bawah menulis baris ke tabel `notifications` (jenis dompet_* untuk anggota,
--      pengurus_* untuk pengurus) -> otomatis tampil di lonceng profil.
--   3) Trigger di tabel `notifications` memanggil Edge Function `kirim-push` (lewat pg_net) HANYA untuk
--      jenis dompet_* dan pengurus_*, supaya notifikasi sosial massal (mention ke semua user) tidak membanjiri HP.
--   4) Fungsi mengirim Web Push ke semua perangkat milik user itu (tabel push_subscriptions).
-- Semua trigger dibungkus penangkap error: notifikasi TIDAK PERNAH boleh menggagalkan transaksi dompet.
-- Kode tof-vault TIDAK diubah sama sekali.
-- ============================================================

-- ---------- 1. Langganan push per perangkat ----------
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   text not null,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  dibuat       timestamptz not null default now(),
  terakhir_ok  timestamptz
);
create index if not exists push_subs_profil_idx on public.push_subscriptions (profile_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Daftar pengurus penerima notifikasi pengurus (mudah diubah lewat tabel ini)
create table if not exists public.push_pengurus (profile_id text primary key);
alter table public.push_pengurus enable row level security;
revoke all on public.push_pengurus from anon, authenticated;
insert into public.push_pengurus (profile_id)
select id from public.profiles where username in ('toples_ecosystem', 'admin_tofarmer')
on conflict do nothing;

-- Catatan pengingat yang sudah terkirim (supaya tidak dobel)
create table if not exists public.push_pengingat_log (
  kunci   text primary key,
  dibuat  timestamptz not null default now()
);
alter table public.push_pengingat_log enable row level security;
revoke all on public.push_pengingat_log from anon, authenticated;

-- ---------- 2. Pendaftaran perangkat dari browser (diperiksa token sesi, seperti fungsi RPC lain) ----------
create or replace function public.push_daftar(
  p_id text, p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text default null
) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.tof_sesi_valid(p_id, p_token) then return false; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then return false; end if;
  if coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then return false; end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (p_id, p_endpoint, p_p256dh, p_auth, left(p_ua, 200))
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
  return true;
end $$;

create or replace function public.push_batal(p_id text, p_token text, p_endpoint text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.tof_sesi_valid(p_id, p_token) then return false; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and profile_id = p_id;
  return true;
end $$;

revoke all on function public.push_daftar(text, text, text, text, text, text) from public;
revoke all on function public.push_batal(text, text, text) from public;
grant execute on function public.push_daftar(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.push_batal(text, text, text) to anon, authenticated;

-- ---------- 3. Alat bantu ----------
create or replace function public.tof_rp(p bigint) returns text language sql immutable as $$
  select 'Rp' || replace(to_char(coalesce(p, 0), 'FM999,999,999,999,999'), ',', '.')
$$;

create or replace function public.tof_tof(p bigint) returns text language sql immutable as $$
  select to_char(round(coalesce(p, 0) / 1000000.0, 2), 'FM999999990.00') || ' TOF'
$$;

create or replace function public.tof_username(p_id text) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select username from public.profiles where id = p_id), 'anggota')
$$;

-- Satu notifikasi untuk satu user. sender_id diisi (bukan null) supaya aman bila kolomnya NOT NULL.
create or replace function public.tof_notif(p_user text, p_sender text, p_type text, p_msg text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  -- ANTI-ULANG: pesan yang persis sama untuk user & jenis yang sama dalam 10 menit tidak dibuat lagi
  if exists (select 1 from public.notifications
             where user_id = p_user and type = p_type and message = p_msg
               and created_at > now() - interval '10 minutes') then
    return;
  end if;
  insert into public.notifications (user_id, sender_id, type, message, is_read)
  values (p_user, coalesce(p_sender, p_user), p_type, p_msg, false);
exception when others then
  raise warning 'tof_notif gagal: %', sqlerrm;
end $$;

-- Notifikasi ke semua pengurus (kecuali pelakunya sendiri)
create or replace function public.tof_notif_pengurus(p_sender text, p_type text, p_msg text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select profile_id from public.push_pengurus where profile_id is distinct from p_sender loop
    perform public.tof_notif(r.profile_id, p_sender, p_type, p_msg);
  end loop;
exception when others then
  raise warning 'tof_notif_pengurus gagal: %', sqlerrm;
end $$;

-- KUNCI: fungsi pembuat notifikasi hanya boleh dipanggil dari dalam database (trigger / SQL Editor),
-- bukan dari browser lewat API. Tanpa ini siapa pun bisa mengirim notifikasi palsu ke anggota atau pengurus.
revoke all on function public.tof_notif(text, text, text, text) from public, anon, authenticated;
revoke all on function public.tof_notif_pengurus(text, text, text) from public, anon, authenticated;
revoke all on function public.tof_username(text) from public, anon, authenticated;
revoke all on function public.tof_rp(bigint) from public, anon, authenticated;
revoke all on function public.tof_tof(bigint) from public, anon, authenticated;

-- ---------- 4. Dari tabel notifications -> Edge Function kirim-push ----------
-- Butuh dua baris di tof_secret (lihat PETUNJUK-PUSH.md): push_url dan push_kunci.
create extension if not exists pg_net with schema extensions;

create or replace function public.trg_notif_kirim_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_kunci text;
begin
  select value into v_url   from public.tof_secret where name = 'push_url';
  select value into v_kunci from public.tof_secret where name = 'push_kunci';
  if v_url is null or v_kunci is null then return new; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-kunci', v_kunci),
    body    := jsonb_build_object('user_id', new.user_id, 'tipe', new.type, 'isi', new.message, 'id', new.id::text)
  );
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists notif_kirim_push on public.notifications;
create trigger notif_kirim_push after insert on public.notifications
  for each row when (new.type like 'dompet\_%' or new.type like 'pengurus\_%')
  execute function public.trg_notif_kirim_push();

-- ---------- 5. Pemicu peristiwa dompet ----------

-- 5a. Nabung (topup_requests)
create or replace function public.trg_notif_topup() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_u text := public.tof_username(new.profile_id);
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status = 'dibayar' then
    perform public.tof_notif_pengurus(new.profile_id, 'pengurus_nabung',
      '@' || v_u || ' melaporkan sudah bayar nabung ' || public.tof_rp(new.nominal_rp) || ' — menunggu konfirmasi 🌾');
  elsif new.status = 'ditampung' then
    perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_nabung',
      'Setoran nabung ' || public.tof_rp(new.nominal_rp) || ' sudah tercatat di toples bersama. TOF dibagikan saat toples terkumpul 🌱');
  elsif new.status = 'selesai' then
    perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_nabung',
      'Nabung ' || public.tof_rp(new.nominal_rp) || ' selesai ✅ ' || public.tof_tof(new.tof_units) || ' masuk dompet Anda.');
  elsif new.status = 'ditolak' then
    perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_nabung',
      'Nabung ' || public.tof_rp(new.nominal_rp) || ' ditolak pengurus. Buka dompet untuk melihat alasannya.');
  end if;
  return new;
exception when others then return new;
end $$;

-- 5b. Tarik dana (tarik_requests)
create or replace function public.trg_notif_tarik() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_u text := public.tof_username(new.profile_id);
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status = 'tof_diterima' then
    perform public.tof_notif_pengurus(new.profile_id, 'pengurus_tarik',
      '@' || v_u || ' tarik dana ' || public.tof_rp(new.jumlah_rp) || ' ke ' || new.tujuan_jenis || ' — TOF sudah diterima, tinggal kirim uangnya 💸');
    perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_tarik',
      'TOF penarikan ' || public.tof_rp(new.jumlah_rp) || ' sudah diterima pengurus. Uang segera dikirim.');
  elsif new.status = 'dibayar' then
    perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_tarik',
      'Penarikan ' || public.tof_rp(new.jumlah_rp) || ' sudah dikirim ke ' || new.tujuan_jenis || ' ✅');
  elsif new.status = 'ditolak' then
    perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_tarik',
      'Penarikan ' || public.tof_rp(new.jumlah_rp) || ' ditolak pengurus. Buka dompet untuk melihat alasannya.');
  end if;
  return new;
exception when others then return new;
end $$;

-- 5c. Pinjaman (pinjaman)
create or replace function public.trg_notif_pinjaman() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_u text := public.tof_username(new.profile_id);
begin
  if tg_op = 'INSERT' then
    if new.status = 'diajukan' then
      perform public.tof_notif_pengurus(new.profile_id, 'pengurus_pinjam',
        '@' || v_u || ' mengajukan pinjaman ' || public.tof_rp(new.pokok_rp) || ' — menunggu dicairkan 🙏');
    end if;
    return new;
  end if;
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'aktif' then
    perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_pinjam',
      'Pinjaman ' || public.tof_rp(new.pokok_rp) || ' disetujui dan dicairkan. Jatuh tempo '
      || to_char(new.jatuh_tempo at time zone 'Asia/Jakarta', 'DD-MM-YYYY') || '.');
  elsif new.status = 'dibayar' then
    perform public.tof_notif_pengurus(new.profile_id, 'pengurus_pinjam',
      '@' || v_u || ' menekan Lunasi pinjaman — cocokkan mutasi pembayarannya 🔎');
  elsif new.status = 'lunas' then
    perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_pinjam',
      'Pinjaman Anda lunas ✅ Terima kasih. Tombol Nabung kembali dibuka.');
  elsif new.status = 'ditolak' then
    perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_pinjam',
      'Pengajuan pinjaman ' || public.tof_rp(new.pokok_rp) || ' ditolak. Buka dompet untuk melihat alasannya.');
  elsif new.status = 'dipotong' then
    perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_pinjam',
      'Pinjaman melewati masa tenggang: TOF jaminan dipotong sesuai ketentuan yang Anda setujui.');
  end if;
  return new;
exception when others then return new;
end $$;

-- 5d. Cicilan pinjaman (pinjaman_cicilan)
create or replace function public.trg_notif_cicilan() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_u text := public.tof_username(new.profile_id);
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status = 'dibayar' then
    perform public.tof_notif_pengurus(new.profile_id, 'pengurus_cicilan',
      '@' || v_u || ' melaporkan bayar cicilan ' || public.tof_rp(new.nominal_rp) || ' — cocokkan mutasinya 🔎');
  elsif new.status = 'diterima' then
    perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_cicilan',
      'Cicilan ' || public.tof_rp(new.nominal_rp) || ' sudah dicocokkan pengurus ✅');
  end if;
  return new;
exception when others then return new;
end $$;

-- 5e. Dividen per peserta (dividen_item)
create or replace function public.trg_notif_dividen_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_label text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  select label into v_label from public.dividen_periode where id = new.periode_id;
  if new.status = 'selesai' and new.jumlah_units > 0 then
    if new.arah = 'bagi' then
      perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_dividen',
        'Dividen ' || coalesce(v_label, '') || ': ' || public.tof_tof(new.jumlah_units) || ' sudah masuk dompet Anda 🌾');
    else
      perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_dividen',
        'Koreksi dividen minus ' || coalesce(v_label, '') || ': ' || public.tof_tof(new.jumlah_units) || ' diambil dari dompet Anda (investasi bulan itu minus).');
    end if;
  elsif new.status = 'dilewati' then
    perform public.tof_notif(new.profile_id, new.profile_id, 'dompet_dividen',
      'Dividen ' || coalesce(v_label, '') || ' tidak dibagikan ke Anda: ' || coalesce(new.alasan, 'syarat belum terpenuhi') || '. Cek tugas di profil.');
  end if;
  return new;
exception when others then return new;
end $$;

-- 5f. Periode dividen untuk pengurus (dividen_periode)
create or replace function public.trg_notif_dividen_periode() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pratinjau' then
    perform public.tof_notif_pengurus(new.dibuat_oleh, 'pengurus_dividen',
      'Pratinjau dividen ' || new.label || ' (' || (new.persen_bp / 100.0)::text || '%) dibuat — menunggu persetujuan pengurus lain 🗳️');
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.status = 'selesai' then
    perform public.tof_notif_pengurus(null, 'pengurus_dividen',
      'Dividen ' || new.label || ' selesai dibagikan — kartu "Laporan dividen untuk grup" siap disalin 📋');
  end if;
  return new;
exception when others then return new;
end $$;

-- 5g. Toples (topup_batch) siap dibagikan
create or replace function public.trg_notif_batch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status = 'siap_dibagikan' then
    perform public.tof_notif_pengurus(null, 'pengurus_batch', 'Toples sudah terkumpul — siap dibagikan ke dompet anggota 🫙');
  end if;
  return new;
exception when others then return new;
end $$;

-- Pasang trigger hanya bila tabelnya ada (aman bila salah satu fitur belum dipasang)
do $$
begin
  if to_regclass('public.topup_requests') is not null then
    drop trigger if exists notif_topup on public.topup_requests;
    create trigger notif_topup after insert or update of status on public.topup_requests
      for each row execute function public.trg_notif_topup();
  end if;
  if to_regclass('public.tarik_requests') is not null then
    drop trigger if exists notif_tarik on public.tarik_requests;
    create trigger notif_tarik after insert or update of status on public.tarik_requests
      for each row execute function public.trg_notif_tarik();
  end if;
  if to_regclass('public.pinjaman') is not null then
    drop trigger if exists notif_pinjaman on public.pinjaman;
    create trigger notif_pinjaman after insert or update of status on public.pinjaman
      for each row execute function public.trg_notif_pinjaman();
  end if;
  if to_regclass('public.pinjaman_cicilan') is not null then
    drop trigger if exists notif_cicilan on public.pinjaman_cicilan;
    create trigger notif_cicilan after insert or update of status on public.pinjaman_cicilan
      for each row execute function public.trg_notif_cicilan();
  end if;
  if to_regclass('public.dividen_item') is not null then
    drop trigger if exists notif_dividen_item on public.dividen_item;
    create trigger notif_dividen_item after update of status on public.dividen_item
      for each row execute function public.trg_notif_dividen_item();
  end if;
  if to_regclass('public.dividen_periode') is not null then
    drop trigger if exists notif_dividen_periode on public.dividen_periode;
    create trigger notif_dividen_periode after insert or update of status on public.dividen_periode
      for each row execute function public.trg_notif_dividen_periode();
  end if;
  if to_regclass('public.topup_batch') is not null then
    drop trigger if exists notif_batch on public.topup_batch;
    create trigger notif_batch after update of status on public.topup_batch
      for each row execute function public.trg_notif_batch();
  end if;
end $$;

-- ---------- 6. Pengingat harian (dijadwalkan lewat pg_cron, lihat bagian bawah) ----------
create or replace function public.push_pengingat() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record; v_hari int; v_kunci text; v_sisa bigint; v_n int := 0; v_msg text; v_baru int;
  v_hariini text := to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD');
  v_cnt int; v_total int := 0; v_n_cicil int := 0;
begin
  -- Anggota: tagihan pinjaman H-3, H-1, hari H, dan 1 hari lewat
  for r in select id, profile_id, jatuh_tempo, total_rp, to_jsonb(p) as j from public.pinjaman p
           where status = 'aktif' and jatuh_tempo is not null loop
    v_hari := (r.jatuh_tempo at time zone 'Asia/Jakarta')::date - (now() at time zone 'Asia/Jakarta')::date;
    if v_hari in (3, 1, 0, -1) then
      v_kunci := 'tempo:' || r.id::text || ':' || v_hari::text;
      insert into public.push_pengingat_log (kunci) values (v_kunci) on conflict do nothing;
      get diagnostics v_baru = row_count;
      if v_baru > 0 then
        v_sisa := greatest(0, r.total_rp - coalesce((r.j ->> 'dibayar_rp')::bigint, 0));
        v_msg := case
          when v_hari = 3 then 'Pengingat: tagihan pinjaman ' || public.tof_rp(v_sisa) || ' jatuh tempo 3 hari lagi.'
          when v_hari = 1 then 'Pengingat: tagihan pinjaman ' || public.tof_rp(v_sisa) || ' jatuh tempo besok.'
          when v_hari = 0 then 'Hari ini jatuh tempo tagihan pinjaman ' || public.tof_rp(v_sisa) || '.'
          else 'Tagihan pinjaman ' || public.tof_rp(v_sisa) || ' sudah lewat jatuh tempo. Buka dompet untuk mencicil.' end;
        perform public.tof_notif(r.profile_id, r.profile_id, 'dompet_tagihan', v_msg);
        v_n := v_n + 1;
      end if;
    end if;
  end loop;

  -- Pengurus: ringkasan harian pekerjaan yang masih menunggu
  select count(*) into v_cnt from public.topup_requests where status = 'dibayar';           v_total := v_total + v_cnt;
  select count(*) into v_cnt from public.tarik_requests where status = 'tof_diterima';     v_total := v_total + v_cnt;
  select count(*) into v_cnt from public.pinjaman       where status in ('diajukan', 'dibayar'); v_total := v_total + v_cnt;
  if to_regclass('public.pinjaman_cicilan') is not null then
    execute 'select count(*) from public.pinjaman_cicilan where status = ''dibayar''' into v_n_cicil;
    v_total := v_total + v_n_cicil;
  end if;
  if v_total > 0 then
    v_kunci := 'ringkas:' || v_hariini;
    insert into public.push_pengingat_log (kunci) values (v_kunci) on conflict do nothing;
    get diagnostics v_baru = row_count;
    if v_baru > 0 then
      perform public.tof_notif_pengurus(null, 'pengurus_ringkas', v_total::text || ' pekerjaan menunggu pengurus hari ini (nabung, tarik, pinjam, cicilan). Buka halaman pengurus.');
    end if;
  end if;
  return v_n;
end $$;
revoke all on function public.push_pengingat() from public, anon, authenticated;


-- ---------- 7. Pesan pribadi, tugas baru, kegiatan: push langsung (tanpa menulis ke lonceng) ----------
-- Pesan punya badge & inbox sendiri, tugas punya pop-up sendiri, jadi cukup push (tidak menggandakan lonceng).

-- Pembatas frekuensi: true hanya bila kunci ini belum pernah / sudah lewat p_menit menit sejak terakhir lolos
create table if not exists public.push_throttle (
  kunci     text primary key,
  terakhir  timestamptz not null default now()
);
alter table public.push_throttle enable row level security;
revoke all on public.push_throttle from anon, authenticated;

create or replace function public.push_boleh(p_kunci text, p_menit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into public.push_throttle (kunci, terakhir) values (p_kunci, now())
  on conflict (kunci) do update set terakhir = now()
    where public.push_throttle.terakhir < now() - make_interval(mins => p_menit);
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- Hanya sekali seumur hidup untuk kunci ini (mis. satu tugas hanya diumumkan sekali)
create or replace function public.push_sekali(p_kunci text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  insert into public.push_pengingat_log (kunci) values (p_kunci) on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- Kirim push langsung ke satu user (tanpa baris notifications). tag sama = menimpa notifikasi lama, bukan menumpuk.
create or replace function public.tof_push(p_user text, p_tipe text, p_isi text, p_url text, p_tag text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_kunci text;
begin
  if p_user is null then return; end if;
  select value into v_url   from public.tof_secret where name = 'push_url';
  select value into v_kunci from public.tof_secret where name = 'push_kunci';
  if v_url is null or v_kunci is null then return; end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-kunci', v_kunci),
    body    := jsonb_build_object('user_id', p_user, 'tipe', p_tipe, 'isi', p_isi, 'url', p_url, 'tag', p_tag)
  );
exception when others then
  raise warning 'tof_push gagal: %', sqlerrm;
end $$;
revoke all on function public.tof_push(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.push_boleh(text, int) from public, anon, authenticated;
revoke all on function public.push_sekali(text) from public, anon, authenticated;

-- 7a. Pesan pribadi (pesan_warga). Isi pesan TIDAK ditampilkan di layar kunci (privasi).
--     Satu pengirim -> satu penerima: maksimal 1 push per 10 menit; pesan berikutnya dalam rentang itu
--     tidak mengirim push lagi (badge inbox tetap bertambah). Push berikutnya menyebut jumlah yang belum dibaca.
create or replace function public.trg_push_pesan() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pengirim text; v_penerima text; v_belum int; v_isi text;
begin
  if new.penerima_id is null or new.pengirim_id is null or new.penerima_id = new.pengirim_id then return new; end if;
  if coalesce(new.is_read, false) then return new; end if;
  if not public.push_boleh('pesan:' || new.penerima_id || ':' || new.pengirim_id, 10) then return new; end if;
  v_pengirim := public.tof_username(new.pengirim_id);
  v_penerima := public.tof_username(new.penerima_id);
  select count(*) into v_belum from public.pesan_warga
   where penerima_id = new.penerima_id and pengirim_id = new.pengirim_id and coalesce(is_read, false) = false;
  v_isi := case when v_belum > 1 then v_belum::text || ' pesan baru dari @' || v_pengirim
                else '@' || v_pengirim || ' mengirim pesan pribadi untuk Anda' end;
  perform public.tof_push(new.penerima_id, 'pesan_pribadi', v_isi,
                          '/profile.html?u=' || v_penerima, 'pesan:' || new.pengirim_id);
  return new;
exception when others then return new;
end $$;

-- 7b. Tugas baru (tugas_definisi): hanya saat tugas menjadi AKTIF + WAJIB (halaman yang terdaftar otomatis berstatus
--     'baru' dan tidak wajib, jadi tidak pernah memicu notifikasi). Tiap tugas diumumkan SEKALI; tiap anggota
--     paling banyak 1 push tugas per 30 menit (bila pengurus membuat banyak tugas sekaligus, cukup satu pengingat).
create or replace function public.trg_push_tugas() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v_isi text;
begin
  if not (new.status = 'aktif' and coalesce(new.wajib, false)) then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'aktif' and coalesce(old.wajib, false) then return new; end if;
  if not public.push_sekali('tugas_baru:' || new.id::text) then return new; end if;
  v_isi := 'Tugas baru dari pengurus: ' || left(coalesce(new.judul, 'tugas'), 60) || '. Buka profil untuk mengerjakannya 🌱';
  for r in select distinct profile_id from public.push_subscriptions limit 500 loop
    if public.push_boleh('tugas:' || r.profile_id, 30) then
      perform public.tof_push(r.profile_id, 'tugas_baru', v_isi,
                              '/profile.html?u=' || public.tof_username(r.profile_id), 'tugas_baru');
    end if;
  end loop;
  return new;
exception when others then return new;
end $$;

-- 7c. Kegiatan hadir (tugas_kegiatan): diumumkan sekali saat dibuat dan aktif
create or replace function public.trg_push_kegiatan() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v_isi text;
begin
  if not coalesce(new.aktif, false) then return new; end if;
  if not public.push_sekali('kegiatan:' || new.id::text) then return new; end if;
  v_isi := 'Kegiatan baru: ' || left(coalesce(new.judul, 'kegiatan'), 60) || ' — mulai '
           || to_char(new.mulai at time zone 'Asia/Jakarta', 'DD-MM HH24:MI') || ' WIB. Masukkan kode hadir saat berlangsung.';
  for r in select distinct profile_id from public.push_subscriptions limit 500 loop
    perform public.tof_push(r.profile_id, 'kegiatan_baru', v_isi,
                            '/profile.html?u=' || public.tof_username(r.profile_id), 'kegiatan:' || new.id::text);
  end loop;
  return new;
exception when others then return new;
end $$;

do $$
begin
  if to_regclass('public.pesan_warga') is not null then
    drop trigger if exists push_pesan on public.pesan_warga;
    create trigger push_pesan after insert on public.pesan_warga
      for each row execute function public.trg_push_pesan();
  end if;
  if to_regclass('public.tugas_definisi') is not null then
    drop trigger if exists push_tugas on public.tugas_definisi;
    create trigger push_tugas after insert or update of status, wajib on public.tugas_definisi
      for each row execute function public.trg_push_tugas();
  end if;
  if to_regclass('public.tugas_kegiatan') is not null then
    drop trigger if exists push_kegiatan on public.tugas_kegiatan;
    create trigger push_kegiatan after insert on public.tugas_kegiatan
      for each row execute function public.trg_push_kegiatan();
  end if;
end $$;

-- Rapikan catatan lama (dipanggil dari push_pengingat): throttle dan log pengingat lebih dari 60 hari dibuang
create or replace function public.push_bersihkan() returns void
language sql security definer set search_path = public as $$
  delete from public.push_throttle where terakhir < now() - interval '60 days';
  delete from public.push_pengingat_log where dibuat < now() - interval '400 days' and kunci not like 'tugas_baru:%' and kunci not like 'kegiatan:%';
$$;
revoke all on function public.push_bersihkan() from public, anon, authenticated;

-- Jadwal harian pukul 08.00 WIB (= 01:00 UTC). Jalankan SEKALI, setelah mengaktifkan ekstensi pg_cron
-- (Dashboard → Database → Extensions → pg_cron). Biarkan dikomentari bila belum mau memakai:
-- select cron.schedule('tof-push-pengingat', '0 1 * * *', $$ select public.push_pengingat(); select public.push_bersihkan(); $$);
