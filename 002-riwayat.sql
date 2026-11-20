-- MIGRASI 002: tambah tabel riwayat (catatan perubahan) untuk instalasi v1.
-- Aman dijalankan berulang (idempoten). Tidak mengubah atau menghapus data v1.
-- Jalankan di Supabase: SQL Editor > New query > Run
-- GANTI semua tulisan GANTI-EMAIL-ADMIN dengan email admin (gunakan Find and Replace di editor).

create table if not exists riwayat (
  id bigint generated always as identity primary key,
  waktu timestamptz not null default now(),
  jenis text not null,
  ringkas text not null default '',
  pengguna text not null default ''
);

create index if not exists riwayat_waktu_idx on riwayat (waktu desc);

alter table riwayat enable row level security;

drop policy if exists "admin riwayat" on riwayat;
create policy "admin riwayat" on riwayat for all to authenticated
  using ((auth.jwt() ->> 'email') = 'GANTI-EMAIL-ADMIN')
  with check ((auth.jwt() ->> 'email') = 'GANTI-EMAIL-ADMIN');

-- Verifikasi (opsional): hasilnya harus 3 baris dengan nama tabel di bawah.
-- select table_name from information_schema.tables
--  where table_schema = 'public' and table_name in ('struktur','alur','riwayat');

-- ROLLBACK (hanya bila ingin kembali ke v1; menghapus seluruh riwayat yang sudah tercatat):
-- drop policy if exists "admin riwayat" on riwayat;
-- drop table if exists riwayat;
