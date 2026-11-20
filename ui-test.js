/* Uji antarmuka (jsdom): mode demo, mode cloud (Supabase tiruan), migrasi v1, alur utama.
   Jalankan: npm install && npm test   (atau: node tests/ui-test.js) */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
// jsdom dicari dari variabel lingkungan JSDOM_PATH bila diisi, jika tidak dari paket npm biasa.
const { JSDOM, ResourceLoader, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom');
const PAGE_ERRORS = [];   // galat yang terjadi di dalam halaman (exception di penangan peristiwa, dsb.)

const ROOT_DIR = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT_DIR, 'core.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT_DIR, 'app.js'), 'utf8');
const DEMO_CFG = fs.readFileSync(path.join(ROOT_DIR, 'config.js'), 'utf8');
const CLOUD_CFG = "window.APP_CONFIG={SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'anon'};";

let pass = 0, fail = 0;
const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));

// Pemuat sumber daya: berkas lokal dibaca dari disk, jaringan (CDN, Google Fonts) dikosongkan.
class Loader extends ResourceLoader {
  constructor(cfg) { super(); this.cfg = cfg; }
  fetch(url) {
    // Halaman dibuka dari http://localhost agar localStorage tersedia. Berkas lokal dipetakan ke folder v2.
    if (url.startsWith('http://localhost/')) {
      const name = decodeURIComponent(url.split('?')[0].replace('http://localhost/', ''));
      if (name === 'config.js') return Promise.resolve(Buffer.from(this.cfg));
      if (name === 'core.js') return Promise.resolve(Buffer.from(CORE));
      if (name === 'app.js') return Promise.resolve(Buffer.from(APP));
      if (name === 'index.html') return Promise.resolve(Buffer.from(HTML));
      return Promise.resolve(Buffer.from(''));
    }
    return Promise.resolve(Buffer.from(''));   // CDN dan Google Fonts: jaringan diblokir, dikosongkan
  }
}

// Supabase tiruan yang cukup untuk menguji alur cloud.
function fakeSupabase(db) {
  const client = {
    auth: {
      async signInWithPassword({ email, password }) {
        return password === 'rahasia' ? { data: { user: { email } }, error: null } : { data: null, error: { message: 'x' } };
      },
      async getSession() { return { data: { session: null } }; },
      async signOut() { return {}; }
    },
    from(table) {
      let filt = null;
      const run = () => {
        if (table === 'struktur') return { data: Object.values(db.struktur), error: null };
        if (table === 'alur') {
          let rows = Object.entries(db.alur).map(([kunci, v]) => ({ kunci, isi: v.isi }));
          if (filt && filt[0] === 'in') rows = rows.filter(r => filt[2].includes(r.kunci));
          return { data: rows, error: null };
        }
        if (table === 'riwayat') return { data: [...db.riwayat].reverse(), error: null };
        if (table === 'kapasitas') return { data: Object.values(db.kapasitas || {}), error: null };
        return { data: [], error: null };
      };
      const api = {
        select() { return api; },
        eq(c, v) { filt = ['eq', c, v]; return api; },
        in(c, v) { filt = ['in', c, v]; return api; },
        order() { return api; },
        limit() { return api; },
        async maybeSingle() { const r = run(); return { data: r.data[0] || null, error: null }; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
        async upsert(row) {
          if (table === 'struktur') db.struktur[row.id] = row;
          else if (table === 'kapasitas') { db.kapasitas = db.kapasitas || {}; db.kapasitas[row.id] = row; }
          else db.alur[row.kunci] = { isi: row.isi, diubah: row.diubah };
          return { error: null };
        },
        async insert(row) { db.riwayat.push({ ...row, waktu: new Date().toISOString() }); return { error: null }; }
      };
      return api;
    }
  };
  return client;
}

async function makePage({ cloud = false, localStore = {}, db = null } = {}) {
  const cfg = cloud ? CLOUD_CFG : DEMO_CFG;
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => PAGE_ERRORS.push(String(e && (e.detail || e.message) || e)));
  vc.on('error', (...a) => PAGE_ERRORS.push(a.map(String).join(' ')));
  const dom = new JSDOM(HTML, {
    url: 'http://localhost/index.html',
    virtualConsole: vc,
    runScripts: 'dangerously',
    resources: new Loader(cfg),
    pretendToBeVisual: true,
    beforeParse(win) {
      win.confirm = () => true;
      win.print = () => {};
      win.URL.createObjectURL = () => 'blob:test';
      win.URL.revokeObjectURL = () => {};
      win.HTMLAnchorElement.prototype.click = function () { win.__downloads = (win.__downloads || []).concat([this.download]); };
      if (cloud) win.supabase = { createClient: () => fakeSupabase(db) };
      for (const k in localStore) win.localStorage.setItem(k, JSON.stringify(localStore[k]));
    }
  });
  await wait(60);
  return dom;
}

const $ = (dom, s) => dom.window.document.querySelector(s);
const $$ = (dom, s) => [...dom.window.document.querySelectorAll(s)];
const setVal = (dom, s, v) => { const e = $(dom, s); e.value = v; e.dispatchEvent(new dom.window.Event('input')); };

async function t(name, fn) {
  try { await fn(); pass++; console.log('  OK   ' + name); }
  catch (e) { fail++; console.log('  GAGAL ' + name + '\n       ' + e.message); }
}

(async () => {
  console.log('\n[A] Mode demo (tanpa Supabase)');
  let dem = await makePage();
  await t('halaman langsung terbuka tanpa login dan menampilkan status demo', async () => {
    assert.ok(dem.window.document.body.classList.contains('in'));
    assert.match($(dem, '#sync').textContent, /Mode demo/);
    assert.strictEqual($(dem, '#b-out').hidden, true);
  });
  await t('bagan default tergambar: 60 satuan + 13 kelompok = 73 simpul', async () => {
    assert.strictEqual($$(dem, '#orgsvg g.nd').length, 73);
  });
  await t('statistik di bilah atas sesuai analisis', async () => {
    assert.match($(dem, '#stat').textContent, /55 satuan kerja · 5 direktorat · 3 tingkat/);
  });
  await t('klik satuan menampilkan rincian dan pejabat', async () => {
    const node = $$(dem, '#orgsvg g.nd').find(g => g.querySelector('title').textContent.startsWith('Instalasi Farmasi'));
    node.dispatchEvent(new dem.window.MouseEvent('click', { bubbles: true }));
    await wait();
    assert.match($(dem, '#detail').textContent, /Instalasi Farmasi/);
    assert.match($(dem, '#detail').textContent, /Belum diisi/);
  });
  await t('ketik di daftar langsung memperbarui bagan', async () => {
    setVal(dem, '#outline', 'Direktorat Uji | Dr. Uji\n  Unit Uji {UJ1}');
    await wait();
    assert.strictEqual($$(dem, '#orgsvg g.nd').length, 2);
    assert.match($(dem, '#stat').textContent, /1 satuan kerja · 1 direktorat/);
  });
  await t('pencarian menurunkan opasitas satuan yang tidak cocok', async () => {
    setVal(dem, '#outline', C_DEFAULT());
    await wait();
    setVal(dem, '#q', 'Farmasi');
    await wait();
    const faded = $$(dem, '#orgsvg g.nd').filter(g => g.getAttribute('opacity') === '0.3').length;
    assert.ok(faded > 0 && faded < 73);
  });
  await t('tab Analisis menampilkan 6 kartu dan temuan', async () => {
    setVal(dem, '#q', '');
    $(dem, '#t-ana').click();
    await wait();
    assert.strictEqual($$(dem, '#tiles .tile').length, 6);
    assert.ok($$(dem, '#issues .iss').length > 0);
  });
  await t('unduh CSV menghasilkan berkas bernama struktur-organisasi.csv', async () => {
    $(dem, '#a-csv').click();
    await wait();
    assert.ok(dem.window.__downloads.includes('struktur-organisasi.csv'));
  });
  await t('ekspor SVG berjalan dan memakai nama berkas yang benar', async () => {
    $(dem, '#t-org').click();
    await wait();
    $(dem, '#o-svg').click();
    assert.ok(dem.window.__downloads.includes('struktur-organisasi.svg'));
  });
  await t('impor spreadsheet mengganti daftar (dengan konfirmasi) dan memberi tahu jumlahnya', async () => {
    setVal(dem, '#imp', 'Satuan kerja\tInduk\tPejabat\tKelompok\tKode\nDirektorat A\t\tAni\t\tDA\nUnit B\tDirektorat A\t\tUnit\tUB');
    $(dem, '#b-imp').click();
    await wait();
    assert.match($(dem, '#outline').value, /Direktorat A \{DA\} \| Ani/);
    assert.match($(dem, '#outline').value, /# Unit/);
    assert.match(dem.window.document.querySelector('#toasts').textContent, /Diimpor 2 satuan/);
  });
  await t('impor yang kosong ditolak dengan peringatan, daftar tidak berubah', async () => {
    const before = $(dem, '#outline').value;
    setVal(dem, '#imp', '   ');
    $(dem, '#b-imp').click();
    await wait();
    assert.strictEqual($(dem, '#outline').value, before);
  });
  await t('impor lingkaran induk menampilkan galat, daftar tidak berubah', async () => {
    const before = $(dem, '#outline').value;
    setVal(dem, '#imp', 'A\tB\nB\tA');
    $(dem, '#b-imp').click();
    await wait();
    assert.strictEqual($(dem, '#outline').value, before);
    assert.match(dem.window.document.querySelector('#toasts').textContent, /lingkaran/);
  });

  setVal(dem, '#outline', C_DEFAULT()); await wait();   // kembalikan daftar default untuk uji berikut
  await t('"Tampilkan di daftar" menyorot baris satuan pada daftar', async () => {
    $(dem, '#t-org').click(); await wait();
    const node = $$(dem, '#orgsvg g.nd').find(g => g.querySelector('title').textContent.startsWith('Instalasi Gizi'));
    node.dispatchEvent(new dem.window.MouseEvent('click', { bubbles: true })); await wait();
    $(dem, '[data-act=line]').click(); await wait();
    const ta = $(dem, '#outline');
    const picked = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    assert.strictEqual(picked.trim(), 'Instalasi Gizi');
  });
  await t('"Buka diagram alur" berpindah ke tab Alur dan memilih satuan itu', async () => {
    $(dem, '[data-act=flow]').click(); await wait();
    assert.ok($(dem, '#v-flow').classList.contains('on'));
    const pilih = $(dem, '#usel');
    assert.match(pilih.options[pilih.selectedIndex].textContent, /Instalasi Gizi/);
    $(dem, '#t-org').click(); await wait();
  });
  await t('tombol Ciutkan menyembunyikan anak satuan; Buka semua mengembalikannya', async () => {
    $(dem, '#o-col').click(); await wait();
    const collapsed = $$(dem, '#orgsvg g.nd').length;
    assert.ok(collapsed < 73, 'jumlah simpul berkurang saat diciutkan: ' + collapsed);
    $(dem, '#o-open').click(); await wait();
    assert.strictEqual($$(dem, '#orgsvg g.nd').length, 73);
  });
  await t('klik temuan di tab Analisis membuka satuan di daftar', async () => {
    $(dem, '#t-ana').click(); await wait();
    const row = $$(dem, '#issues .irow').find(b => b.textContent.includes('Direktorat Medik'));
    assert.ok(row, 'ada temuan untuk Direktorat Medik');
    row.click(); await wait();
    assert.ok($(dem, '#v-org').classList.contains('on'));
    assert.match($(dem, '#detail').textContent, /Direktorat Medik dan Keperawatan/);
  });
  await t('kotak alur bisa ditambah dengan tombol Proses dan mencatat jumlah kotak', async () => {
    $(dem, '#t-flow').click(); await wait();
    const before = JSON.parse(dem.window.localStorage.getItem('flow_' + $(dem, '#usel').value) || '{"n":[]}').n.length;
    $(dem, '[data-add=proc]').click(); await wait();
    const after = JSON.parse(dem.window.localStorage.getItem('flow_' + $(dem, '#usel').value)).n.length;
    assert.strictEqual(after, before + 1);
  });

  console.log('\n[B] Alur kerja dan migrasi data v1');
  // Diagram v1 tersimpan dengan kunci hash lama; daftar v1 tersimpan di 'org2'.
  const v1Dom = await makePage({
    localStore: { org2: 'Direktorat Lama\n  Instalasi Lama', col2: [] }
  });
  await t('daftar draf v1 (org2) terbaca otomatis', async () => {
    assert.match($(v1Dom, '#outline').value, /Direktorat Lama/);
  });
  // Hitung kunci hash v1 untuk "Instalasi Lama" di bawah "Direktorat Lama"
  const legacyKey = (() => {
    const k = '/Direktorat Lama/Instalasi Lama';
    let h = 7; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return 'u' + h.toString(36);
  })();
  const migDom = await makePage({
    localStore: {
      org3: 'Direktorat Lama\n  Instalasi Lama',
      ['flow_' + legacyKey]: { n: [{ id: 1, x: 300, y: 40, t: 'Diagram lama', k: 'start' }], e: [] }
    }
  });
  await t('diagram v1 tetap terbaca pada satuan yang sama (kunci lama)', async () => {
    $(migDom, '#t-flow').click();
    await wait();
    const opts = $$(migDom, '#usel option');
    assert.ok(opts.length >= 2, 'ada pilihan satuan');
    const target = opts.find(o => o.textContent.includes('Instalasi Lama'));
    migDom.window.document.querySelector('#usel').value = target.value;
    migDom.window.document.querySelector('#usel').dispatchEvent(new migDom.window.Event('change'));
    await wait();
    assert.match(migDom.window.document.querySelector('#flowsvg').textContent, /Diagram lama/);
  });
  await t('menambah kode {KODE} tidak menghilangkan diagram lama', async () => {
    setVal(migDom, '#outline', 'Direktorat Lama\n  Instalasi Lama {IL1}');
    await wait();
    $(migDom, '#t-flow').click();
    await wait();
    const target = $$(migDom, '#usel option').find(o => o.textContent.includes('Instalasi Lama'));
    migDom.window.document.querySelector('#usel').value = target.value;
    migDom.window.document.querySelector('#usel').dispatchEvent(new migDom.window.Event('change'));
    await wait();
    assert.match(migDom.window.document.querySelector('#flowsvg').textContent, /Diagram lama/);
  });

  const flowDom = await makePage({ localStore: { org3: 'Direktorat U {DU}\n  Unit Satu {US1}' } });
  await t('tab Alur: tambah kotak Proses lalu tersimpan ke penyimpanan lokal', async () => {
    $(flowDom, '#t-flow').click();
    await wait();
    const pilih = $(flowDom, '#usel');
    pilih.value = pilih.options[pilih.options.length - 1].value;
    pilih.dispatchEvent(new flowDom.window.Event('change'));
    await wait();
    $(flowDom, '[data-add=proc]').click();
    await wait();
    const saved = JSON.parse(flowDom.window.localStorage.getItem('flow_c-US1'));
    assert.strictEqual(saved.n.length, 1);
    assert.strictEqual(saved.n[0].k, 'proc');
  });
  await t('tombol "Isi dengan contoh" memuat contoh 6 kotak dan 6 garis', async () => {
    $(flowDom, '#b-reset').click();
    await wait();
    const saved = JSON.parse(flowDom.window.localStorage.getItem('flow_c-US1'));
    assert.strictEqual(saved.n.length, 6);
    assert.strictEqual(saved.e.length, 6);
  });

  console.log('\n[C] Mode cloud (Supabase tiruan)');
  const db = { struktur: {}, alur: {}, riwayat: [] };
  db.alur['c-IL1'] = { isi: { n: [{ id: 1, x: 100, y: 40, t: 'Awal dari cloud', k: 'start' }], e: [] } };
  const cloud = await makePage({ cloud: true, db });
  await t('masuk menampilkan aplikasi; password salah menampilkan pesan', async () => {
    assert.ok(!cloud.window.document.body.classList.contains('in'));
    $(cloud, '#em').value = 'admin@x.id';
    $(cloud, '#pw').value = 'salah';
    $(cloud, '#lf').dispatchEvent(new cloud.window.Event('submit', { cancelable: true }));
    await wait(50);
    assert.match($(cloud, '#lerr').textContent, /salah/);
  });
  await t('masuk dengan benar memuat daftar dan menulis data awal ke cloud + riwayat', async () => {
    $(cloud, '#pw').value = 'rahasia';
    $(cloud, '#lf').dispatchEvent(new cloud.window.Event('submit', { cancelable: true }));
    await wait(900);
    assert.ok(cloud.window.document.body.classList.contains('in'));
    assert.ok(db.struktur[1], 'daftar awal tersimpan');
    assert.ok(db.riwayat.length >= 1, 'riwayat tercatat');
    assert.strictEqual($(cloud, '#sync').textContent.startsWith('Tersimpan') || $(cloud, '#sync').textContent === 'Terhubung', true);
  });
  await t('setiap perubahan daftar tercatat di riwayat (tidak diringkas)', async () => {
    const before = db.riwayat.length;
    setVal(cloud, '#outline', 'Direktorat Q {DQ}\n  Unit R {UR}');
    await wait(900);
    setVal(cloud, '#outline', 'Direktorat Q {DQ}\n  Unit R {UR}\n  Unit S {US}');
    await wait(900);
    assert.strictEqual(db.riwayat.length, before + 2);
    assert.strictEqual(db.riwayat.at(-1).jenis, 'Daftar satuan kerja');
    assert.strictEqual(db.riwayat.at(-1).pengguna, 'admin@x.id');
  });
  await t('riwayat tampil di tab Analisis', async () => {
    $(cloud, '#t-ana').click();
    await wait(60);
    assert.match($(cloud, '#riwayat').textContent, /Daftar satuan kerja/);
  });
  await t('diagram tersimpan di cloud dimuat ulang lewat kunci kode', async () => {
    setVal(cloud, '#outline', 'Direktorat Lama2 {X}\n  Instalasi Lama {IL1}');
    await wait(900);
    $(cloud, '#t-flow').click();
    await wait(60);
    const target = $$(cloud, '#usel option').find(o => o.textContent.includes('Instalasi Lama'));
    cloud.window.document.querySelector('#usel').value = target.value;
    cloud.window.document.querySelector('#usel').dispatchEvent(new cloud.window.Event('change'));
    await wait(80);
    assert.match(cloud.window.document.querySelector('#flowsvg').textContent, /Awal dari cloud/);
  });
  await t('tombol Keluar terlihat di mode cloud', async () => {
    assert.strictEqual($(cloud, '#b-out').hidden, false);
  });

  console.log('\n[D] Kapasitas tempat tidur (v3)');
  const kapDom = await makePage();
  const KAPTXT = [
    'Gedung\tKode\tNama\tInstalasi\tKelas\tTT\tBerlaku sejak\tNo. SK',
    'Gedung A\tR-01\tLt 2 Selatan\tIRI\t1\t500\t2026-01-01\tHK.02.03/3346/2026',
    'Gedung B\tR-02\tLt 3\tIBS\t2\t351\t2026-01-01\tHK.02.03/3346/2026'
  ].join('\n');
  await t('impor data kapasitas menampilkan total dan status sesuai SK (851)', async () => {
    $(kapDom, '#t-kap').click(); await wait();
    setVal(kapDom, '#kapin', KAPTXT);
    $(kapDom, '#kap-imp').click(); await wait();
    assert.match($(kapDom, '#kap-tiles').textContent, /851/);
    assert.match($(kapDom, '#kap-tiles').textContent, /Sesuai dengan SK/);
    assert.match($(kapDom, '#kap-tabel').textContent, /IRI/);
  });
  await t('kode instalasi yang belum ada di daftar tampil sebagai peringatan, impor tetap berhasil', async () => {
    assert.match($(kapDom, '#kap-issues').textContent, /belum ada di daftar organisasi/);
    assert.match($(kapDom, '#kap-tabel').textContent, /Belum ada kode/);
  });
  await t('angka SK diubah menjadi 850 memunculkan selisih dan status belum sesuai', async () => {
    setVal(kapDom, '#kap-sk', '850'); await wait();
    assert.match($(kapDom, '#kap-tiles').textContent, /Belum sesuai/);
  });
  await t('impor dengan TT tidak valid ditolak dan data sebelumnya tetap', async () => {
    const before = JSON.parse(kapDom.window.localStorage.getItem('kap3')).rows.length;
    setVal(kapDom, '#kapin', 'G\tR9\tn\tIRI\tx\tbanyak\t2026-01-01\tS');
    $(kapDom, '#kap-imp').click(); await wait();
    assert.match(kapDom.window.document.querySelector('#toasts').textContent, /ditolak/);
    assert.strictEqual(JSON.parse(kapDom.window.localStorage.getItem('kap3')).rows.length, before);
  });
  await t('tanggal sebelum berlaku menghasilkan total nol', async () => {
    setVal(kapDom, '#kap-tgl', '2025-01-01'); await wait();
    assert.match($(kapDom, '#kap-tiles').textContent, /^Total TT operasional0/);
  });
  await t('unduh ruangan dan ringkasan CSV berjalan', async () => {
    $(kapDom, '#kap-rek').click(); $(kapDom, '#kap-csv').click(); await wait();
    assert.ok(kapDom.window.__downloads.includes('kapasitas-ringkasan.csv'));
    assert.ok(kapDom.window.__downloads.includes('kapasitas-ruangan.csv'));
  });
  const kapCloudDb = { struktur: {}, alur: {}, riwayat: [], kapasitas: {} };
  const kapCloud = await makePage({ cloud: true, db: kapCloudDb });
  await t('mode cloud: data kapasitas disimpan ke tabel kapasitas dan tercatat di riwayat', async () => {
    $(kapCloud, '#em').value = 'admin@x.id';
    $(kapCloud, '#pw').value = 'rahasia';
    $(kapCloud, '#lf').dispatchEvent(new kapCloud.window.Event('submit', { cancelable: true }));
    await wait(120);
    $(kapCloud, '#t-kap').click(); await wait();
    setVal(kapCloud, '#kapin', KAPTXT);
    $(kapCloud, '#kap-imp').click();
    await wait(900);
    assert.ok(kapCloudDb.kapasitas[1], 'baris kapasitas tersimpan');
    assert.strictEqual(kapCloudDb.kapasitas[1].isi.rows.length, 2);
    assert.ok(kapCloudDb.riwayat.some(r => r.jenis === 'Kapasitas tempat tidur'));
  });

  console.log('\n[E] Cadangan, pemulihan, dan pembatalan (v3.1)');
  const bk = await makePage();
  const readFile = (dom, name, text) => new dom.window.File([text], name, { type: 'application/json' });
  const pick = (dom, file) => {
    const inp = $(dom, '#a-berkas');
    Object.defineProperty(inp, 'files', { value: [file], configurable: true });
    inp.dispatchEvent(new dom.window.Event('change'));
  };
  await t('unduh cadangan menghasilkan berkas JSON dengan nama bertanggal', async () => {
    setVal(bk, '#kapin', 'G\tR1\tn\tIRI\t1\t851\t2026-01-01\tS');
    $(bk, '#kap-imp').click(); await wait();
    $(bk, '#a-cad').click(); await wait(30);
    assert.ok(bk.window.__downloads.some(n => /^cadangan-struktur-\d{4}-\d{2}-\d{2}\.json$/.test(n)));
  });
  let backupText = null;
  await t('cadangan yang valid bisa dipulihkan setelah data diubah', async () => {
    backupText = JSON.stringify(require(path.join(__dirname, '..', 'core.js')).buatCadangan({
      teks: 'Direktorat Pulih\n  Unit Pulih', alur: {}, rows: [{ gedung: 'G', kode: 'R9', nama: 'n', kodeInst: 'IRI', kelas: '1', tt: 7, berlaku: '2026-01-01', sk: 'S' }]
    }));
    setVal(bk, '#outline', 'Direktorat Lain');
    await wait();
    pick(bk, readFile(bk, 'cadangan.json', backupText));
    await wait(80);
    assert.match($(bk, '#outline').value, /Direktorat Pulih/);
    assert.match(bk.window.document.querySelector('#toasts').textContent, /dipulihkan/);
  });
  await t('berkas yang bukan JSON ditolak dan data tidak berubah', async () => {
    const before = $(bk, '#outline').value;
    pick(bk, readFile(bk, 'rusak.json', '{ini bukan json'));
    await wait(80);
    assert.match(bk.window.document.querySelector('#toasts').textContent, /bukan JSON/);
    assert.strictEqual($(bk, '#outline').value, before);
  });
  await t('cadangan dari aplikasi lain atau struktur rusak ditolak', async () => {
    pick(bk, readFile(bk, 'lain.json', JSON.stringify({ aplikasi: 'lain', versi: '1' })));
    await wait(80);
    assert.match(bk.window.document.querySelector('#toasts').textContent, /ditolak/);
  });
  await t('pembatalan impor kapasitas mengembalikan total sebelumnya dan bisa dibalik lagi', async () => {
    setVal(bk, '#kapin', 'G\tR1\tn\tIRI\t1\t851\t2026-01-01\tS');
    $(bk, '#kap-imp').click(); await wait();
    setVal(bk, '#kapin', 'G\tR1\tn\tIRI\t1\t100\t2026-01-01\tS');
    $(bk, '#kap-imp').click(); await wait();
    assert.match($(bk, '#kap-tiles').textContent, /Total TT operasional100/);
    $(bk, '#kap-batal').click(); await wait();
    assert.match($(bk, '#kap-tiles').textContent, /Total TT operasional851/);
    $(bk, '#kap-batal').click(); await wait();
    assert.match($(bk, '#kap-tiles').textContent, /Total TT operasional100/);
  });

  const relevant = PAGE_ERRORS.filter(e => !/Could not load|net::|ERR_|fetch/i.test(e));
  await t('tidak ada galat JavaScript di dalam halaman selama uji', async () => {
    assert.deepStrictEqual(relevant, []);
  });
  console.log(`\nHasil UI: ${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Kesalahan tak terduga:', e); process.exit(1); });

function C_DEFAULT() {
  return require(path.join(__dirname, '..', 'core.js')).DEFAULT_OUTLINE;
}
