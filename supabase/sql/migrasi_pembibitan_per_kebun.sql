-- =====================================================================
-- MIGRASI: Pembibitan terikat ke kebun (Skenario B)
-- Jalankan SEKALI di Supabase -> SQL Editor, SEBELUM memakai desa-tof-isoteri.html versi baru.
--
-- Sifatnya MENAMBAH, bukan menimpa: fn_mulai_pembibitan lama TIDAK diubah,
-- fungsi baru hanya membungkusnya (cek petak + batas slot, lalu memanggil yang lama).
--
-- ATURAN YANG DIPASANG
--   1. Pembibitan baru wajib ditempatkan di petak MILIK SENDIRI (village_claims).
--   2. Maksimal 3 pembibitan aktif per petak  (ubah angka v_max_slot di bawah kalau mau).
--   3. Petak yang sedang ditanami / tandus tidak bisa jadi persemaian.
--   4. Petak yang punya pembibitan aktif tidak bisa ditanami (trigger di village_farms).
--   Baris pembibitan LAMA (plot_x/plot_y kosong) tidak dihitung ke slot dan tetap
--   bisa diproses sampai jadi bibit, jadi tidak ada data yang hilang atau terblokir.
-- =====================================================================

-- 1) Kolom lokasi pembibitan -------------------------------------------------
alter table public.village_pembibitan
    add column if not exists plot_x integer,
    add column if not exists plot_y integer;

create index if not exists idx_village_pembibitan_plot
    on public.village_pembibitan (owner_id, plot_x, plot_y);

-- 2) Fungsi baru: mulai pembibitan di petak tertentu ------------------------
create or replace function public.fn_mulai_pembibitan_di_petak(
    p_user     uuid,
    p_bibit_id text,
    p_x        integer,
    p_y        integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_max_slot constant integer := 3;     -- <<< batas pembibitan aktif per petak
    v_aktif    integer;
    v_state    text;
    v_before   text[];
    v_res      jsonb;
    v_new_id   text;
begin
    -- a. petak harus milik pemain
    if not exists (
        select 1 from village_claims
        where tile_x = p_x and tile_y = p_y and owner_id = p_user
    ) then
        return jsonb_build_object('success', false, 'message', 'Petak ini bukan milikmu.');
    end if;

    -- b. petak tidak boleh sedang ditanami / tandus
    select land_state into v_state
    from village_farms
    where tile_x = p_x and tile_y = p_y and owner_id = p_user;

    if v_state = 'planted' then
        return jsonb_build_object('success', false, 'message', 'Petak ini sedang ditanami. Pilih petak lain untuk persemaian.');
    elsif v_state = 'barren' then
        return jsonb_build_object('success', false, 'message', 'Petak ini tandus. Pupuk dulu, atau pilih petak lain.');
    end if;

    -- c. cegah dua permintaan bersamaan melewati batas slot
    perform pg_advisory_xact_lock(hashtext('persemaian:' || p_user::text || ':' || p_x || ',' || p_y));

    select count(*) into v_aktif
    from village_pembibitan
    where owner_id = p_user
      and plot_x = p_x and plot_y = p_y
      and status in ('punya_bahan', 'sudah_dipotong', 'ditancapkan');

    if v_aktif >= v_max_slot then
        return jsonb_build_object('success', false,
            'message', format('Persemaian di petak ini penuh (%s/%s slot). Selesaikan dulu atau pakai petak lain.', v_aktif, v_max_slot));
    end if;

    -- d. catat baris lama yang belum punya lokasi, supaya baris BARU bisa dikenali
    select coalesce(array_agg(id::text), '{}') into v_before
    from village_pembibitan
    where owner_id = p_user and plot_x is null and plot_y is null;

    -- e. jalankan logika lama (biaya XP, stok ubi mentah, edukasi) apa adanya
    v_res := public.fn_mulai_pembibitan(p_user, p_bibit_id);

    if coalesce((v_res->>'success')::boolean, false) is not true then
        return v_res;   -- gagal -> teruskan pesan aslinya, tidak ada yang diubah
    end if;

    -- f. tempelkan lokasi ke baris yang baru dibuat fungsi lama
    select id::text into v_new_id
    from village_pembibitan
    where owner_id = p_user
      and plot_x is null and plot_y is null
      and id::text <> all (v_before)
    order by mulai_at desc nulls last
    limit 1;

    if v_new_id is not null then
        update village_pembibitan
        set plot_x = p_x, plot_y = p_y
        where id::text = v_new_id;
    end if;

    return v_res || jsonb_build_object('plot_x', p_x, 'plot_y', p_y, 'slot_terpakai', v_aktif + 1, 'slot_maks', v_max_slot);
end;
$$;

-- ikuti pola fungsi fn_* lain milikmu (dipanggil dari browser lewat db.rpc)
grant execute on function public.fn_mulai_pembibitan_di_petak(uuid, text, integer, integer) to anon, authenticated;

-- 3) Trigger: petak persemaian tidak bisa ditanami ---------------------------
create or replace function public.trg_blokir_tanam_di_persemaian()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- hanya saat petak BERALIH jadi 'planted' (bukan saat siram/pupuk di tanaman yang sudah ada)
    if new.land_state = 'planted'
       and (tg_op = 'INSERT' or old.land_state is distinct from 'planted') then
        if exists (
            select 1 from village_pembibitan
            where owner_id = new.owner_id
              and plot_x = new.tile_x and plot_y = new.tile_y
              and status in ('punya_bahan', 'sudah_dipotong', 'ditancapkan')
        ) then
            raise exception 'Petak ini sedang dipakai persemaian. Selesaikan pembibitannya dulu atau tanam di petak lain.';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_blokir_tanam_di_persemaian on public.village_farms;
create trigger trg_blokir_tanam_di_persemaian
    before insert or update on public.village_farms
    for each row execute function public.trg_blokir_tanam_di_persemaian();

-- =====================================================================
-- CEK SETELAH DIJALANKAN (opsional)
--   select column_name from information_schema.columns
--    where table_name = 'village_pembibitan' and column_name in ('plot_x','plot_y');   -- harus 2 baris
--   select proname from pg_proc where proname = 'fn_mulai_pembibitan_di_petak';        -- harus 1 baris
--
-- BATAL / ROLLBACK (kalau perlu):
--   drop trigger if exists trg_blokir_tanam_di_persemaian on public.village_farms;
--   drop function if exists public.trg_blokir_tanam_di_persemaian();
--   drop function if exists public.fn_mulai_pembibitan_di_petak(uuid, text, integer, integer);
--   (kolom plot_x/plot_y boleh dibiarkan, tidak mengganggu)
-- =====================================================================
