/* Uji unit untuk core.js dan uji regresi terhadap logika v1.
   Jalankan: node tests/test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../core.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  OK   ' + name); }
  catch (e) { fail++; console.log('  GAGAL ' + name + '\n       ' + e.message); }
}

console.log('\n[1] Penguraian daftar');
t('satu akar, struktur default terurai', () => {
  const r = C.parseOutline(C.DEFAULT_OUTLINE);
  assert.strictEqual(r.t, 'Direktorat Utama');
  assert.strictEqual(r.virtual, undefined);
});
t('banyak akar memakai akar virtual "Organisasi"', () => {
  const r = C.parseOutline('A\nB');
  assert.strictEqual(r.virtual, true);
  assert.strictEqual(r.t, 'Organisasi');
  assert.strictEqual(r.c.length, 2);
});
t('pejabat diambil dari kolom setelah "|"', () => {
  const r = C.parseOutline('Direktorat X | dr. Ani\n  Instalasi Y | Budi | catatan');
  assert.strictEqual(r.o, 'dr. Ani');
  assert.strictEqual(r.c[0].o, 'Budi | catatan');
});
t('kode {KODE} diambil dan tidak ikut ke nama', () => {
  const r = C.parseOutline('Direktorat X {DIR1} | Ani\n  Instalasi Farmasi {IFA}');
  assert.strictEqual(r.t, 'Direktorat X');
  assert.strictEqual(r.code, 'DIR1');
  assert.strictEqual(r.c[0].t, 'Instalasi Farmasi');
  assert.strictEqual(r.c[0].code, 'IFA');
});
t('kelompok (# ...) tidak dianggap satuan', () => {
  const r = C.parseOutline('Direktorat X\n  # Instalasi\n    Instalasi Y');
  assert.strictEqual(r.c[0].g, true);
  assert.strictEqual(r.c[0].t, 'Instalasi');
  const units = []; C.eachUnit(r, n => units.push(n.t));
  assert.deepStrictEqual(units, ['Direktorat X', 'Instalasi Y']);
});
t('nomor baris disimpan untuk fitur "Lihat di daftar"', () => {
  const r = C.parseOutline('\nA\n\n  B');
  assert.strictEqual(r.line, 1);
  assert.strictEqual(r.c[0].line, 3);
});
t('teks kosong menghasilkan akar virtual tanpa anak', () => {
  const r = C.parseOutline('   \n');
  assert.strictEqual(r.virtual, true);
  assert.strictEqual(r.c.length, 0);
});

console.log('\n[2] Kompatibilitas dengan v1');
const v1html = fs.readFileSync(path.join(__dirname, 'fixtures', 'v1-index.html'), 'utf8');
// Ambil fungsi parse() dan hid() v1 langsung dari berkas asli, agar uji ini membandingkan dengan kode yang benar-benar dirilis.
const v1parse = v1html.slice(v1html.indexOf('function parse(txt)'), v1html.indexOf('const count='));
const v1hid = v1html.match(/const hid=(k=>[^;]*);/)[1];
const v1 = new Function('const CNT=0;' + v1parse + ';return {parse, hidFn: ' + v1hid + '};')();
t('hash id v1 sama dengan hid() v2 untuk semua satuan default', () => {
  const r2 = C.parseOutline(C.DEFAULT_OUTLINE);
  const r1 = v1.parse(C.DEFAULT_OUTLINE);
  const ids1 = new Map(); (function w(n) { if (!n.g) ids1.set(n.k, v1.hidFn(n.k)); n.c.forEach(w); })(r1);
  C.eachUnit(r2, (n) => {
    assert.strictEqual(n.legacy, ids1.get(n.k), 'id tidak cocok untuk ' + n.k);
  });
});
t('jumlah satuan default sama dengan v1', () => {
  const r1 = v1.parse(C.DEFAULT_OUTLINE);
  let c1 = 0; (function w(n) { if (!n.g) c1++; n.c.forEach(w); })(r1);
  const a = C.analyze(C.parseOutline(C.DEFAULT_OUTLINE), new Set());
  assert.strictEqual(a.units, c1);
});
t('diagram v1 (kunci hash) tetap terbaca sebagai kunci lama', () => {
  const r = C.parseOutline('Instalasi Farmasi');
  const u = []; C.eachUnit(r, n => u.push(n));
  const keys = new Set([u[0].legacy]);
  assert.strictEqual(C.flowKeyFor(u[0], keys), u[0].legacy);
});
t('setelah diberi kode, kunci baru dipakai, tetapi diagram lama tetap dibaca', () => {
  const r = C.parseOutline('Instalasi Farmasi {IFA}');
  const u = []; C.eachUnit(r, n => u.push(n));
  assert.strictEqual(C.flowKeyFor(u[0], new Set([u[0].legacy])), u[0].legacy);
  assert.strictEqual(C.flowKeyFor(u[0], new Set([u[0].id])), u[0].id);
  assert.strictEqual(C.flowKeyFor(u[0], new Set()), u[0].id);
});

console.log('\n[3] Analisis struktur');
t('deteksi nama ganda sebagai galat', () => {
  const a = C.analyze(C.parseOutline('Direktorat X\n  Unit A\n  Unit A'), new Set());
  assert.ok(a.issues.some(i => i.kind === 'dup-name' && i.sev === 'error'));
});
t('deteksi kode ganda sebagai galat', () => {
  const a = C.analyze(C.parseOutline('Direktorat X {K1}\n  Unit A {K1}'), new Set());
  assert.ok(a.issues.some(i => i.kind === 'dup-code'));
});
t('rentang kendali lebar diberi peringatan', () => {
  const lines = ['Direktorat X'];
  for (let i = 0; i < C.SPAN_WARN + 1; i++) lines.push('  Unit ' + i);
  const a = C.analyze(C.parseOutline(lines.join('\n')), new Set());
  assert.ok(a.issues.some(i => i.kind === 'wide-span' && i.sev === 'warn'));
});
t('pejabat kosong terdeteksi', () => {
  const a = C.analyze(C.parseOutline('Direktorat X | Ani\n  Unit A'), new Set());
  assert.strictEqual(a.noOfficer, 1);
});
t('satuan tanpa diagram dihitung', () => {
  const r = C.parseOutline('Direktorat X {D1}\n  Unit A {U1}');
  const a = C.analyze(r, new Set(['c-D1']));
  assert.strictEqual(a.noFlow, 1);
});
t('rata-rata dan maksimum rentang kendali benar', () => {
  const a = C.analyze(C.parseOutline('A\n  B\n  C\n    D'), new Set());
  // A punya 2 bawahan, B 0, C 1: rata-rata 1.5 (hanya induk yang punya bawahan: A=2, C=1)
  assert.strictEqual(a.avgSpan, 1.5);
  assert.strictEqual(a.maxSpan, 2);
  assert.strictEqual(a.leaves, 2);
});
t('jumlah tingkat dan per-tingkat benar', () => {
  const a = C.analyze(C.parseOutline('A\n  B\n    C'), new Set());
  assert.strictEqual(a.levels, 3);
  assert.deepStrictEqual(a.byLevel, [1, 1, 1]);
});
t('kelompok tidak menambah tingkat organisasi (hanya kolom tampilan)', () => {
  const a = C.analyze(C.parseOutline('A\n  # Tim\n    B\n      # Sub\n        C'), new Set());
  assert.strictEqual(a.levels, 3);
  assert.deepStrictEqual(a.byLevel, [1, 1, 1]);
});
t('CSV mencantumkan tingkat organisasi tanpa terpengaruh kelompok', () => {
  const csv = C.toCsv(C.parseOutline('A\n  # G\n    B'));
  const rows = csv.slice(1).split('\r\n');
  assert.ok(rows[2].includes(';"2";'), 'B harus tingkat 2: ' + rows[2]);
});
t('kelompok tidak menambah jumlah satuan', () => {
  const a = C.analyze(C.parseOutline('A\n  # Tim\n    B\n    C'), new Set());
  assert.strictEqual(a.units, 3);
  assert.strictEqual(a.groups, 1);
});

console.log('\n[4] Impor spreadsheet');
t('impor dengan header dan kelompok', () => {
  const txt = [
    'Satuan kerja\tInduk\tPejabat\tKelompok\tKode',
    'Direktorat A\t\tAni\t\tDA',
    'Instalasi B\tDirektorat A\tBudi\tInstalasi\tIB',
    'Unit C\tDirektorat A\t\tUnit\t'
  ].join('\n');
  const out = C.importRows(txt);
  assert.ok(out.includes('Direktorat A {DA} | Ani'));
  assert.ok(out.includes('  # Instalasi'));
  assert.ok(out.includes('    Instalasi B {IB} | Budi'));
  const r = C.parseOutline(out);
  const a = C.analyze(r, new Set());
  assert.strictEqual(a.units, 3);
});
t('impor dengan pemisah titik koma (format Excel Indonesia)', () => {
  const out = C.importRows('A;;Ani\nB;A;');
  const r = C.parseOutline(out);
  assert.strictEqual(r.c[0].t, 'B');
});
t('impor kosong menghasilkan teks kosong', () => {
  assert.strictEqual(C.importRows('   \n'), '');
});
t('hasil impor memuat semua satuan dan induknya benar', () => {
  const once = C.importRows('B\tA\nA\t\nC\t');
  const names = []; C.eachUnit(C.parseOutline(once), (n, i) => names.push(n.t + '@' + i.depth));
  assert.deepStrictEqual(names.sort(), ['A@0', 'B@1', 'C@0'].sort());
});
t('lingkaran induk ditolak dengan pesan yang menyebut nama satuan', () => {
  assert.throws(() => C.importRows('A\tB\nB\tA\nC\t'), /lingkaran.*A/);
});

console.log('\n[5] Ekspor CSV');
t('CSV memakai BOM, pemisah ";" dan tanda kutip ganda', () => {
  const csv = C.toCsv(C.parseOutline('Direktorat "X" {DX} | Ani\n  Unit A'));
  assert.strictEqual(csv.charCodeAt(0), 0xfeff);
  const lines = csv.slice(1).split('\r\n');
  assert.strictEqual(lines.length, 3);
  assert.ok(lines[1].startsWith('"DX";"Direktorat ""X""";'));
  assert.ok(lines[2].includes('"Direktorat ""X"""'), 'induk harus tertulis');
});
t('CSV mencantumkan tingkat dan bawahan langsung', () => {
  const csv = C.toCsv(C.parseOutline('A\n  B\n  C'));
  const rows = csv.slice(1).split('\r\n');
  assert.ok(rows[1].endsWith('"1";"2"'));
});

console.log('\n[6] Keamanan isi');
t('nama dengan karakter HTML tidak mengubah struktur pohon', () => {
  const r = C.parseOutline('<img src=x onerror=alert(1)> | <b>x</b>');
  assert.strictEqual(r.t, '<img src=x onerror=alert(1)>');
});

console.log('\n[7] Pohon dan pencarian jalur');
t('findByPath menemukan satuan lewat jalurnya', () => {
  const r = C.parseOutline('A\n  # G\n    B');
  assert.strictEqual(C.findByPath(r, '/A/G/B').t, 'B');
  assert.strictEqual(C.findByPath(r, '/tidak-ada'), null);
});

console.log('\n[8] Kapasitas tempat tidur (v3)');
const KAPTXT = [
  'Gedung\tKode\tNama\tInstalasi\tKelas\tTT\tBerlaku sejak\tNo. SK',
  'Gedung A\tR-01\tLt 2 Selatan\tIRI\t1\t24\t2026-01-01\tSK1',
  'Gedung A\tR-02\tLt 2 Utara\tIRI\t2\t30\t2026-01-01\tSK1',
  'Gedung B\tR-03\tLt 3\tIBS\t3\t0\t2026-01-01\tSK1',
  'Gedung B\tR-03\tLt 3\tIBS\t3\t12\t2026-06-01\tSK2'
].join('\n');
t('impor dengan judul kolom menghasilkan baris tanpa galat', () => {
  const r = C.parseRuangan(KAPTXT, null);
  assert.strictEqual(r.rows.length, 4);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.rows[0].tt, 24);
});
t('TT bukan bilangan dan tanggal salah menjadi galat dan menolak impor', () => {
  const r = C.parseRuangan('A\tR1\tn\tIRI\t1\tdua puluh\t2026-01-01\tS\nA\tR2\tn\tIRI\t1\t5\t01/01/2026\tS', null);
  assert.strictEqual(r.ok, false);
  assert.ok(r.issues.some(i => /bukan bilangan/.test(i.text)));
  assert.ok(r.issues.some(i => /YYYY-MM-DD/.test(i.text)));
});
t('kode ruangan dan tanggal berlaku yang sama dua kali menjadi galat', () => {
  const r = C.parseRuangan('A\tR1\tn\tIRI\t1\t5\t2026-01-01\tS\nA\tR1\tn\tIRI\t1\t6\t2026-01-01\tS', null);
  assert.ok(r.issues.some(i => /dua kali/.test(i.text)));
  assert.strictEqual(r.ok, false);
});
t('kode instalasi yang tidak ada di organisasi menjadi peringatan, bukan galat', () => {
  const r = C.parseRuangan('A\tR1\tn\tXYZ\t1\t5\t2026-01-01\tS', new Set(['IRI']));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.issues[0].sev, 'warn');
});
t('tanggal berlaku: versi terbaru yang sudah berlaku dipakai, versi masa depan diabaikan', () => {
  const r = C.parseRuangan(KAPTXT, null);
  const jan = C.kapasitasAsOf(r.rows, '2026-03-01');
  assert.strictEqual(jan.total, 24 + 30 + 0);
  const jun = C.kapasitasAsOf(r.rows, '2026-06-15');
  assert.strictEqual(jun.total, 24 + 30 + 12);
  const sebelum = C.kapasitasAsOf(r.rows, '2025-12-31');
  assert.strictEqual(sebelum.total, 0);
});
t('ruangan ditutup (TT 0) tetap dihitung sebagai ruangan, tidak menambah TT', () => {
  const r = C.parseRuangan(KAPTXT, null);
  const jan = C.kapasitasAsOf(r.rows, '2026-03-01');
  assert.strictEqual(jan.ruangan, 3);
});
t('rincian per instalasi diurutkan dari TT terbanyak dan jumlahnya benar', () => {
  const r = C.parseRuangan(KAPTXT, null);
  const jun = C.kapasitasAsOf(r.rows, '2026-06-15');
  assert.deepStrictEqual(jun.perInstalasi, [{ kode: 'IRI', tt: 54 }, { kode: 'IBS', tt: 12 }]);
});
t('cekTotal menandai selisih terhadap angka SK', () => {
  assert.deepStrictEqual(C.cekTotal(851, 851), { ok: true, selisih: 0 });
  assert.deepStrictEqual(C.cekTotal(850, '851'), { ok: false, selisih: -1 });
});
t('CSV ruangan memakai BOM dan pemisah titik koma', () => {
  const r = C.parseRuangan(KAPTXT, null);
  const csv = C.kapasitasCsv(r.rows);
  assert.strictEqual(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.split('\r\n')[1].startsWith('"Gedung A";"R-01"'));
});
t('ringkasan CSV berisi baris TOTAL', () => {
  const r = C.parseRuangan(KAPTXT, null);
  const csv = C.ringkasanCsv(C.kapasitasAsOf(r.rows, '2026-06-15'));
  assert.ok(csv.includes('"TOTAL";"66"'));
});

console.log('\n[9] Cadangan (v3.1)');
t('cadangan yang dibuat lalu divalidasi lolos', () => {
  const o = JSON.parse(JSON.stringify(C.buatCadangan({ teks: 'A', alur: { 'c-X': { n: [], e: [] } }, rows: [{ kode: 'R1', tt: 5, berlaku: '2026-01-01' }] })));
  assert.deepStrictEqual(C.validasiCadangan(o), { ok: true, errors: [] });
});
t('validasi menolak aplikasi lain, alur rusak, TT negatif, dan tanggal salah', () => {
  const base = C.buatCadangan({ teks: 'A', alur: {}, rows: [] });
  assert.strictEqual(C.validasiCadangan({ ...base, aplikasi: 'lain' }).ok, false);
  assert.strictEqual(C.validasiCadangan({ ...base, alur: { 'c-X': { n: 'bukan daftar', e: [] } } }).ok, false);
  assert.strictEqual(C.validasiCadangan({ ...base, alur: { 'kunci tidak valid!': { n: [], e: [] } } }).ok, false);
  assert.strictEqual(C.validasiCadangan({ ...base, kapasitas: { rows: [{ kode: 'R', tt: -1, berlaku: '2026-01-01' }] } }).ok, false);
  assert.strictEqual(C.validasiCadangan({ ...base, kapasitas: { rows: [{ kode: 'R', tt: 1, berlaku: '01/01/2026' }] } }).ok, false);
  assert.strictEqual(C.validasiCadangan(null).ok, false);
});

console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
