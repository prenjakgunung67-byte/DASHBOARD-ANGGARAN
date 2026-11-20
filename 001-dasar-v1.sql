-- MIGRASI 001: skema dasar v1 (tabel struktur dan alur, RLS, kebijakan admin).
-- Untuk instalasi yang sudah memakai v1 (atau v2) tidak perlu dijalankan lagi: aman dijalankan ulang (idempoten)
-- dan tidak mengubah data. Jalankan hanya jika tabel struktur atau alur belum ada, misalnya instalasi yang dimulai dari v2 tanpa v1.
-- Urutan lengkap: 001 (ini), lalu 002-riwayat.sql, lalu 003-kapasitas.sql.
-- Jalankan di Supabase: SQL Editor > New query > Run
-- GANTI semua tulisan GANTI-EMAIL-ADMIN dengan email admin (gunakan Find and Replace di editor).

create table if not exists struktur (
  id int primary key default 1 check (id = 1),
  teks text not null default '',
  diubah timestamptz not null default now()
);

create table if not exists alur (
  kunci text primary key,
  isi jsonb not null,
  diubah timestamptz not null default now()
);

alter table struktur enable row level security;
alter table alur enable row level security;

-- Hanya akun dengan email admin yang boleh membaca dan menulis.
drop policy if exists "admin struktur" on struktur;
create policy "admin struktur" on struktur for all to authenticated
  using ((auth.jwt() ->> 'email') = 'GANTI-EMAIL-ADMIN')
  with check ((auth.jwt() ->> 'email') = 'GANTI-EMAIL-ADMIN');

drop policy if exists "admin alur" on alur;
create policy "admin alur" on alur for all to authenticated
  using ((auth.jwt() ->> 'email') = 'GANTI-EMAIL-ADMIN')
  with check ((auth.jwt() ->> 'email') = 'GANTI-EMAIL-ADMIN');
