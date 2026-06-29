/* ================================================
   DASHBOARD PEMANTAUAN ANGGARAN BLU – app.js
   Tahap 2 & 3: Google Sheets + Charts + Export
   ================================================ */

// ─── CONFIG ──────────────────────────────────────
const SHEET_ID = '1NJk35mHBdus15lzhnsCzL3EZ5UfOQnnaKqhvOpwwkxo';
// Sheet names – sesuaikan dengan nama tab di Google Sheets Anda
const SHEETS = {
  kpi:         'KPI',
  trend:       'Trend',
  komposisi:   'Komposisi',
  unitKerja:   'UnitKerja',
  arusKas:     'ArusKas',
  rincian:     'Rincian',
  peringatan:  'Peringatan',
};

// ─── GLOBAL STATE ────────────────────────────────
let rawData = {};         // holds data per sheet name
let charts = {};          // Chart.js instances

// ─── HELPERS ─────────────────────────────────────
const fmt  = v => v == null ? '–' : Number(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtM = v => fmt(v) + ' M';
const pct  = (real, pagu) => pagu ? ((real / pagu) * 100).toFixed(2) : '0.00';

function statusBadge(pctVal) {
  if (pctVal >= 90) return ['HIJAU',  'badge-green'];
  if (pctVal >= 75) return ['KUNING', 'badge-yellow'];
  return              ['MERAH',  'badge-red'];
}
function statusDot(pctVal) {
  if (pctVal >= 90) return 'dot-ok';
  if (pctVal >= 75) return 'dot-warn';
  return 'dot-bad';
}

// ─── GOOGLE SHEETS API ───────────────────────────
async function fetchSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} – sheet: ${sheetName}`);
  const text = await resp.text();
  // Google wraps JSON in  google.visualization.Query.setResponse(…);
  const json = JSON.parse(text.substring(47, text.length - 2));
  return parseGviz(json);
}

function parseGviz(json) {
  const cols = json.table.cols.map(c => c.label || c.id);
  const rows = (json.table.rows || []).map(r =>
    Object.fromEntries(
      r.c.map((cell, i) => [cols[i], cell ? cell.v : null])
    )
  );
  return rows;
}

// ─── LOAD ALL DATA ───────────────────────────────
async function loadAllData() {
  showLoading(true);
  try {
    const results = await Promise.allSettled(
      Object.entries(SHEETS).map(async ([key, name]) => {
        const data = await fetchSheet(name);
        return { key, data };
      })
    );

    let anySuccess = false;
    results.forEach(r => {
      if (r.status === 'fulfilled') {
        rawData[r.value.key] = r.value.data;
        anySuccess = true;
      } else {
        console.warn('Sheet load failed:', r.reason);
      }
    });

    if (!anySuccess) {
      // Fallback to demo data if Sheets not accessible
      useDemoData();
    }

    renderAll();
    setLastUpdated();
  } catch (err) {
    console.error('Load failed, using demo data:', err);
    useDemoData();
    renderAll();
    setLastUpdated();
  }
  showLoading(false);
}

// ─── DEMO DATA (fallback) ────────────────────────
function useDemoData() {
  rawData.kpi = [{
    pendapatan: 2450, pendapatan_target: 2750,
    belanja_op: 1980, belanja_op_pagu: 2200,
    belanja_modal: 250, belanja_modal_pagu: 400,
    total_belanja: 2230, total_belanja_pagu: 2600,
    surplus: 220, surplus_proj: 280,
    saldo_kas: 870, saldo_hari: 76,
    kas_awal: 650, kas_masuk: 2650, kas_keluar: 2430,
  }];

  const bulan = ['Jan','Feb','Mar','Apr','Mei'];
  rawData.trend = bulan.map((b, i) => ({
    bulan: b,
    pendapatan:  [450,900,1350,1900,2450][i],
    belanja_op:  [320,680,1050,1540,1980][i],
    total_belanja:[380,800,1230,1750,2230][i],
  }));

  rawData.komposisi = [
    { jenis: 'Belanja Pegawai',   nilai: 880,  pct: 44.4 },
    { jenis: 'Belanja Barang',    nilai: 520,  pct: 26.3 },
    { jenis: 'Belanja Jasa',      nilai: 320,  pct: 16.2 },
    { jenis: 'Belanja Obat & BMHP', nilai: 160, pct: 8.1 },
    { jenis: 'Belanja Pemeliharaan', nilai: 100, pct: 5.0 },
  ];

  rawData.unitKerja = [
    { nama: '1. Instalasi Gawat Darurat', pagu: 250,  realisasi: 230,  pct: 92.00 },
    { nama: '2. Rawat Jalan',             pagu: 480,  realisasi: 435,  pct: 90.63 },
    { nama: '3. Rawat Inap',              pagu: 850,  realisasi: 760,  pct: 89.41 },
    { nama: '4. Instalasi Bedah Sentral', pagu: 210,  realisasi: 170,  pct: 80.95 },
    { nama: '5. Laboratorium',            pagu: 150,  realisasi: 115,  pct: 76.67 },
    { nama: '6. Radiologi',               pagu: 160,  realisasi: 120,  pct: 75.00 },
    { nama: '7. Farmasi',                 pagu: 300,  realisasi: 250,  pct: 83.33 },
    { nama: '8. Unit Lainnya',            pagu: 200,  realisasi: 150,  pct: 75.00 },
  ];

  rawData.rincian = [
    { jenis: 'A. PENDAPATAN',          pagu: 2750, realisasi: 2450, pct: 89.09, is_cat: true },
    { jenis: '1. Jasa Layanan',         pagu: 1200, realisasi: 1080, pct: 90.00, is_sub: true },
    { jenis: '2. Pendapatan BPJS',      pagu: 1200, realisasi: 1050, pct: 87.50, is_sub: true },
    { jenis: '3. Kerja Sama & Lainnya', pagu: 350,  realisasi: 320,  pct: 91.43, is_sub: true },
    { jenis: 'B. BELANJA OPERASIONAL',  pagu: 2200, realisasi: 1980, pct: 90.00, is_cat: true },
    { jenis: '1. Belanja Pegawai',      pagu: 950,  realisasi: 880,  pct: 92.63, is_sub: true },
    { jenis: '2. Belanja Barang',       pagu: 600,  realisasi: 520,  pct: 86.67, is_sub: true },
    { jenis: '3. Belanja Jasa',         pagu: 400,  realisasi: 320,  pct: 80.00, is_sub: true },
    { jenis: '4. Belanja Obat & BMHP',  pagu: 150,  realisasi: 160,  pct: 106.67, is_sub: true },
    { jenis: '5. Belanja Pemeliharaan', pagu: 100,  realisasi: 100,  pct: 100.00, is_sub: true },
    { jenis: 'C. BELANJA MODAL',        pagu: 400,  realisasi: 250,  pct: 62.50, is_cat: true },
    { jenis: 'TOTAL BELANJA (B+C)',     pagu: 2600, realisasi: 2230, pct: 85.77, is_cat: true },
  ];

  rawData.peringatan = [
    { tipe: 'warn', pesan: 'Realisasi Belanja Modal baru 62,50% dari pagu. Perlu percepatan realisasi.' },
    { tipe: 'warn', pesan: 'Unit Radiologi realisasi di bawah 80%. Perlu perhatian.' },
    { tipe: 'ok',   pesan: 'Saldo kas cukup untuk 76 hari operasional. Kondisi aman.' },
    { tipe: 'warn', pesan: 'Realisasi Pendapatan belum mencapai 90% target. Tingkatkan kinerja layanan.' },
    { tipe: 'info', pesan: 'Data diperbarui setiap akhir hari. Sumber data dari Google Sheets.' },
  ];

  rawData.arusKas = rawData.kpi; // same source
}

// ─── RENDER ALL ──────────────────────────────────
function renderAll() {
  renderKPI();
  renderTrendChart();
  renderDonutChart();
  renderRealisasiChart();
  renderUnitKerjaTable();
  renderKasChart();
  renderRincianTable();
  renderAlerts();
  populateUnitFilter();
}

// ─── KPI CARDS ───────────────────────────────────
function renderKPI() {
  const d = (rawData.kpi || [])[0];
  if (!d) return;

  const setCard = (id, val, ref, prefix, barId, badgeId, pctId, subId, subTxt) => {
    const p = parseFloat(pct(val, ref));
    const [badgeLabel, badgeClass] = statusBadge(p);
    document.getElementById(id).textContent = fmtM(val);
    if (subId) document.getElementById(subId).textContent = subTxt;
    document.getElementById(barId).style.width = Math.min(p, 100) + '%';
    document.getElementById(pctId).textContent = p.toFixed(2).replace('.', ',') + '%';
    const badgeEl = document.getElementById(badgeId);
    badgeEl.textContent = badgeLabel;
    badgeEl.className = 'badge ' + badgeClass;
  };

  setCard('kpi-pendapatan',    d.pendapatan,    d.pendapatan_target, 'Target', 'bar-pendapatan',    'badge-pendapatan',    'pct-pendapatan',    'kpi-pendapatan-target', 'Target: ' + fmtM(d.pendapatan_target));
  setCard('kpi-belanja-op',    d.belanja_op,    d.belanja_op_pagu,   'Pagu',   'bar-belanja-op',    'badge-belanja-op',    'pct-belanja-op',    'kpi-belanja-op-pagu',   'Pagu: ' + fmtM(d.belanja_op_pagu));
  setCard('kpi-belanja-modal', d.belanja_modal, d.belanja_modal_pagu,'Pagu',   'bar-belanja-modal', 'badge-belanja-modal', 'pct-belanja-modal', 'kpi-belanja-modal-pagu','Pagu: ' + fmtM(d.belanja_modal_pagu));
  setCard('kpi-total-belanja', d.total_belanja, d.total_belanja_pagu,'Pagu',   'bar-total-belanja', 'badge-total-belanja', 'pct-total-belanja', 'kpi-total-belanja-pagu','Pagu: ' + fmtM(d.total_belanja_pagu));
  setCard('kpi-surplus',       d.surplus,       d.surplus_proj,      'Proyeksi','bar-surplus',      'badge-surplus',       'pct-surplus',       'kpi-surplus-proj',      'Proyeksi Akhir Tahun: ' + fmtM(d.surplus_proj));

  // Saldo Kas
  document.getElementById('kpi-saldo').textContent = fmtM(d.saldo_kas);

  // Kas summary
  document.getElementById('kas-awal').textContent   = fmtM(d.kas_awal   ?? d.kas_awal);
  document.getElementById('kas-masuk').textContent  = fmtM(d.kas_masuk  ?? d.kas_masuk);
  document.getElementById('kas-keluar').textContent = fmtM(d.kas_keluar ?? d.kas_keluar);
  document.getElementById('kas-akhir').textContent  = fmtM(d.saldo_kas);
}

// ─── TREND CHART ─────────────────────────────────
function renderTrendChart() {
  const data = rawData.trend || [];
  const labels = data.map(r => r.bulan);
  const ctx = document.getElementById('chart-trend').getContext('2d');
  if (charts.trend) charts.trend.destroy();
  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Pendapatan',        data: data.map(r => r.pendapatan),   borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.08)', tension: .35, pointRadius: 4, fill: true },
        { label: 'Belanja Operasional', data: data.map(r => r.belanja_op), borderColor: '#16a34a', backgroundColor: 'transparent',          tension: .35, pointRadius: 4 },
        { label: 'Total Belanja',     data: data.map(r => r.total_belanja), borderColor: '#ea580c', backgroundColor: 'transparent',          tension: .35, pointRadius: 4 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString('id-ID') }, grid: { color: '#f0f2f5' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ─── DONUT CHART ─────────────────────────────────
const DONUT_COLORS = ['#2563eb','#16a34a','#ea580c','#7c3aed','#0d9488'];

function renderDonutChart() {
  const data = rawData.komposisi || [];
  const ctx = document.getElementById('chart-donut').getContext('2d');
  if (charts.donut) charts.donut.destroy();
  charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(r => r.jenis),
      datasets: [{ data: data.map(r => r.nilai), backgroundColor: DONUT_COLORS, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)} M (${data[ctx.dataIndex].pct}%)` } }
      }
    }
  });

  // Custom legend
  const legendEl = document.getElementById('donut-legend');
  legendEl.innerHTML = data.map((r, i) =>
    `<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${DONUT_COLORS[i]};margin-right:4px"></span>${r.jenis} (${r.pct}%)</span>`
  ).join('');
}

// ─── REALISASI BAR+LINE CHART ─────────────────────
function renderRealisasiChart() {
  const ctx = document.getElementById('chart-realisasi').getContext('2d');
  if (charts.real) charts.real.destroy();

  const labels  = ['Pendapatan', 'Belanja\nOperasional', 'Belanja Modal', 'Total Belanja'];
  const pagu    = [2750, 2200, 400, 2600];
  const real    = [2450, 1980, 250, 2230];
  const pctData = real.map((v, i) => parseFloat(pct(v, pagu[i])));

  charts.real = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        { type: 'bar',  label: 'Pagu/Target', data: pagu, backgroundColor: '#bfdbfe', borderRadius: 4, yAxisID: 'y' },
        { type: 'bar',  label: 'Realisasi',   data: real, backgroundColor: '#1e3a5f', borderRadius: 4, yAxisID: 'y' },
        { type: 'line', label: '% Realisasi', data: pctData, borderColor: '#10b981', backgroundColor: 'transparent', pointRadius: 5, tension: .3, yAxisID: 'y2' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y:  { beginAtZero: true, ticks: { callback: v => v.toLocaleString('id-ID') }, grid: { color: '#f0f2f5' } },
        y2: { position: 'right', min: 0, max: 110, ticks: { callback: v => v + '%' }, grid: { display: false } },
        x:  { grid: { display: false } }
      }
    }
  });
}

// ─── UNIT KERJA TABLE ────────────────────────────
function renderUnitKerjaTable() {
  const data = rawData.unitKerja || [];
  const tbody = document.getElementById('tbody-unit');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="4" class="table-empty">Tidak ada data</td></tr>'; return; }

  let totalPagu = 0, totalReal = 0;
  tbody.innerHTML = data.map(r => {
    totalPagu += (r.pagu || 0);
    totalReal += (r.realisasi || 0);
    const p = parseFloat(r.pct || pct(r.realisasi, r.pagu));
    return `<tr>
      <td>${r.nama}</td>
      <td>${fmt(r.pagu)}</td>
      <td>${fmt(r.realisasi)}</td>
      <td>${p.toFixed(2).replace('.', ',')}% <span class="status-dot ${statusDot(p)}"></span></td>
    </tr>`;
  }).join('');

  const totalPct = parseFloat(pct(totalReal, totalPagu));
  tbody.innerHTML += `<tr style="font-weight:700;background:#f0f4ff">
    <td>TOTAL</td>
    <td>${fmt(totalPagu)}</td>
    <td>${fmt(totalReal)}</td>
    <td>${totalPct.toFixed(2).replace('.', ',')}% <span class="status-dot ${statusDot(totalPct)}"></span></td>
  </tr>`;
}

// ─── ARUS KAS CHART ──────────────────────────────
function renderKasChart() {
  const d = (rawData.kpi || [])[0] || {};
  const ctx = document.getElementById('chart-kas').getContext('2d');
  if (charts.kas) charts.kas.destroy();

  charts.kas = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Saldo Awal', 'Penerimaan', 'Pengeluaran', 'Saldo Akhir'],
      datasets: [{
        data: [d.kas_awal, d.kas_masuk, -(d.kas_keluar || 0), d.saldo_kas],
        backgroundColor: ['#3b82f6','#22c55e','#ef4444','#1e3a5f'],
        borderRadius: 5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(Math.abs(c.raw)) + ' M' } } },
      scales: {
        y: { ticks: { callback: v => fmt(Math.abs(v)) }, grid: { color: '#f0f2f5' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ─── RINCIAN TABLE ───────────────────────────────
function renderRincianTable() {
  const data = rawData.rincian || [];
  const tbody = document.getElementById('tbody-rincian');
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="4" class="table-empty">Tidak ada data</td></tr>'; return; }

  tbody.innerHTML = data.map(r => {
    const p = parseFloat(r.pct || 0);
    const isCat = r.is_cat;
    const isSub = r.is_sub;
    const rowClass = isCat ? 'cat-row' : (isSub ? 'sub-row' : '');
    let nameCell = r.jenis;
    if (isSub) nameCell = `&nbsp;&nbsp;&nbsp;${r.jenis}`;
    return `<tr class="${rowClass}">
      <td>${nameCell}</td>
      <td>${fmt(r.pagu)}</td>
      <td>${fmt(r.realisasi)}</td>
      <td>${p.toFixed(2).replace('.', ',')}%</td>
    </tr>`;
  }).join('');
}

// ─── ALERTS ──────────────────────────────────────
function renderAlerts() {
  const data = rawData.peringatan || [];
  const container = document.getElementById('alerts-row');
  const icons = { warn: '⚠️', ok: '✅', info: 'ℹ️' };

  container.innerHTML = data.map(a =>
    `<div class="alert-item ${a.tipe}">
      <span class="alert-icon">${icons[a.tipe] || '📌'}</span>
      <span class="alert-text">${a.pesan}</span>
    </div>`
  ).join('');
}

// ─── UNIT FILTER ─────────────────────────────────
function populateUnitFilter() {
  const data = rawData.unitKerja || [];
  const sel = document.getElementById('filter-unit');
  const existing = Array.from(sel.options).map(o => o.value);
  data.forEach(r => {
    if (!existing.includes(r.nama)) {
      const opt = document.createElement('option');
      opt.value = r.nama;
      opt.textContent = r.nama;
      sel.appendChild(opt);
    }
  });
}

// ─── EXPORT EXCEL ────────────────────────────────
document.getElementById('btn-export-excel').addEventListener('click', () => {
  const wb = XLSX.utils.book_new();

  // KPI sheet
  const kpi = rawData.kpi || [];
  const wsKPI = XLSX.utils.json_to_sheet(kpi);
  XLSX.utils.book_append_sheet(wb, wsKPI, 'KPI');

  // Unit Kerja
  const wsUnit = XLSX.utils.json_to_sheet(rawData.unitKerja || []);
  XLSX.utils.book_append_sheet(wb, wsUnit, 'Per Unit Kerja');

  // Rincian
  const wsRincian = XLSX.utils.json_to_sheet((rawData.rincian || []).map(r => ({
    Jenis: r.jenis, 'Pagu/Target (M)': r.pagu, 'Realisasi (M)': r.realisasi, '%': r.pct
  })));
  XLSX.utils.book_append_sheet(wb, wsRincian, 'Rincian Realisasi');

  XLSX.writeFile(wb, `Dashboard_BLU_RSUP_Fatmawati.xlsx`);
});

// ─── EXPORT PDF ──────────────────────────────────
document.getElementById('btn-export-pdf').addEventListener('click', () => {
  window.print();
});

// ─── SIDEBAR NAV ─────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
  });
});

// ─── REFRESH ─────────────────────────────────────
document.getElementById('btn-refresh').addEventListener('click', () => {
  const btn = document.getElementById('btn-refresh');
  btn.classList.add('spinning');
  loadAllData().finally(() => btn.classList.remove('spinning'));
});

// ─── UTILS ───────────────────────────────────────
function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('active', show);
}

function setLastUpdated() {
  const now = new Date();
  const s = now.toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' })
    + ' ' + now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
  document.getElementById('last-updated').textContent = s;
}

// ─── FILTER CHANGE ───────────────────────────────
['filter-tahun','filter-bulan','filter-unit'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    // In full implementation this would re-fetch with filter params
    // For now just re-render current data
    renderAll();
  });
});

// ─── INIT ────────────────────────────────────────
loadAllData();
