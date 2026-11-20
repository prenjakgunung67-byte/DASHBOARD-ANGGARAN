-- MIGRASI 003: tabel kapasitas (ruangan dan tempat tidur per periode berlaku) untuk v3.
-- Prasyarat: migrasi/002-riwayat.sql sudah dijalankan.
-- Aman dijalankan berulang (idempoten). Tidak mengubah data v1 atau v2.
-- Jalankan di Supabase: SQL Editor > New query > Run
-- GANTI semua tulisan GANTI-EMAIL-ADMIN dengan email admin (gunakan Find and Replace di editor).

create table if not exists kapasitas (
  id int primary key default 1 check (id = 1),
  isi jsonb not null default '{"rows": []}'::jsonb,
  diubah timestamptz not null default now()
);

alter table kapasitas enable row level security;

drop policy if exists "admin kapasitas" on kapasitas;
create policy "admin kapasitas" on kapasitas for all to authenticated
  using ((auth.jwt() ->> 'email') = 'GANTI-EMAIL-ADMIN')
  with check ((auth.jwt() ->> 'email') = 'GANTI-EMAIL-ADMIN');

-- Verifikasi (opsional): harus menampilkan satu baris 'kapasitas'.
-- select table_name from information_schema.tables where table_schema = 'public' and table_name = 'kapasitas';

-- ROLLBACK (menghapus seluruh data kapasitas yang sudah diimpor):
-- drop policy if exists "admin kapasitas" on kapasitas;
-- drop table if exists kapasitas;
