/* ===================== Utilitas ===================== */
const $ = s => document.querySelector(s), NS = 'http://www.w3.org/2000/svg';
const C = window.OrgCore;
const el = (t, a = {}, p) => {
  const e = document.createElementNS(NS, t);
  for (const k in a) if (a[k] !== null && a[k] !== undefined && a[k] !== false) e.setAttribute(k, a[k]);
  if (p) p.appendChild(e);
  return e;
};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (s, m) => s.length > m ? s.slice(0, m - 1) + '…' : s;
function toast(msg, kind = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3000);
}
function setStatus(text, kind = '') { const s = $('#sync'); s.textContent = text; s.className = 'sync ' + kind; }
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ===================== Keadaan ===================== */
const ta = $('#outline');
let sb = null, canW = false, me = '', ROOT = null, lastW = 1;
let col = new Set(store.get('col2', []));
let z = 1, q = '', selK = null, firstDraw = true;
let flowKeys = new Set();     // kunci diagram yang sudah tersimpan
let units = [], unitById = {}, cur = '';
const pendingSave = new Set(), saveTimers = {};
let KAP = { rows: [] };

/* ===================== Diagram struktur ===================== */
const NW = 200, NH = 52, GX = 58, GY = 12;

function layout(root) {
  const V = []; let cy = 12;
  const lay = (n, d) => {
    n.d = d; n.x = 12 + d * (NW + GX); V.push(n);
    n.kids = (col.has(n.k) && !q) ? [] : n.c;
    if (!n.kids.length) { n.y = cy; cy += NH + GY; }
    else { n.kids.forEach(c => lay(c, d + 1)); n.y = (n.kids[0].y + n.kids.at(-1).y) / 2; }
  };
  lay(root, 0);
  return { V, W: Math.max(...V.map(n => n.x)) + NW + 24, H: cy + 12 };
}

function drawOrg() {
  const svg = $('#orgsvg');
  svg.innerHTML = '';
  $('#stat').textContent = '';
  if (!ta.value.trim()) {
    ROOT = null;
    const t = el('text', { x: 20, y: 40, 'font-size': 14, fill: 'var(--mute)' }, svg);
    t.textContent = 'Daftar masih kosong. Tulis satuan di sebelah kiri atau impor dari spreadsheet.';
    svg.setAttribute('viewBox', '0 0 600 80'); svg.setAttribute('width', 600 * z); svg.setAttribute('height', 80 * z);
    return;
  }
  ROOT = C.parseOutline(ta.value);
  const { V, W, H } = layout(ROOT);
  lastW = W;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W * z); svg.setAttribute('height', H * z);
  const A = C.analyze(ROOT, flowKeys);
  // Angka "satuan kerja" tidak menghitung direktorat, sama seperti v1.
  $('#stat').textContent = `${A.units - A.directorates} satuan kerja · ${A.directorates} direktorat · ${A.levels} tingkat`;
  if (firstDraw) {
    // Saat pertama dibuka, arahkan layar ke akar organisasi, bukan ke tengah bagan yang tinggi.
    firstDraw = false;
    const ocv = $('#ocv');
    ocv.scrollLeft = 0;
    ocv.scrollTop = Math.max(0, (V[0].y + NH / 2) * z - ocv.clientHeight / 3);
  }

  const defs = el('defs', {}, svg);
  const gR = el('linearGradient', { id: 'gRoot', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
  el('stop', { offset: 0, 'stop-color': '#00736d' }, gR); el('stop', { offset: 1, 'stop-color': '#14b3a8' }, gR);
  const g1 = el('linearGradient', { id: 'gLvl1', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: 0, 'stop-color': '#eaf8f6' }, g1); el('stop', { offset: 1, 'stop-color': '#d6f0ea' }, g1);
  const f = el('filter', { id: 'sh', x: '-10%', y: '-10%', width: '125%', height: '140%' }, defs);
  el('feDropShadow', { dx: 0, dy: 2, stdDeviation: 2.5, 'flood-color': '#0f2a29', 'flood-opacity': 0.16 }, f);
  el('rect', { width: W, height: H, fill: 'var(--panel)' }, svg);

  const gl = el('g', {}, svg), gn = el('g', {}, svg);
  const ql = q.toLowerCase();
  for (const n of V) {
    for (const c of n.kids)
      el('path', { d: `M${n.x + NW} ${n.y + NH / 2}H${n.x + NW + GX / 2}V${c.y + NH / 2}H${c.x}`, fill: 'none', stroke: '#a9c2c0', 'stroke-width': 1.4 }, gl);

    const hit = ql && (n.t + ' ' + n.o + ' ' + (n.code || '')).toLowerCase().includes(ql);
    const sel = selK === n.k, dark = n.d === 0;
    const g = el('g', { class: 'nd', style: 'cursor:pointer', opacity: ql && !hit ? 0.3 : 1 }, gn);
    el('title', {}, g).textContent = n.t + (n.o ? ' — ' + n.o : '') + (n.code ? ' [' + n.code + ']' : '');
    el('rect', {
      x: n.x, y: n.y, width: NW, height: NH, rx: 11,
      fill: dark ? 'url(#gRoot)' : n.g ? 'none' : n.d === 1 ? 'url(#gLvl1)' : '#ffffff',
      stroke: hit ? '#d97706' : sel ? '#00867f' : dark ? 'none' : n.g ? '#7fb3ae' : '#cfe0de',
      'stroke-width': hit || sel ? 2.5 : 1.2,
      'stroke-dasharray': n.g ? '5 4' : null,
      filter: dark || sel ? 'url(#sh)' : null
    }, g);
    if (!dark && !n.g) el('rect', { x: n.x + 1, y: n.y + 9, width: 4, height: NH - 18, rx: 2, fill: n.d === 1 ? '#00867f' : '#7fcfc8' }, g);

    const hasBadge = n.c.length > 0;
    const cx = n.x + NW / 2 - (hasBadge ? 8 : 0) + (n.g ? 0 : 2);
    const textFill = dark ? '#ffffff' : n.g ? '#3e6b67' : 'var(--ink)';
    const nameY = n.y + (n.o ? 18 : NH / 2);
    const tn = el('text', { x: cx, y: nameY, 'font-size': 12.5, 'font-weight': n.g ? 500 : 600, fill: textFill, 'font-style': n.g ? 'italic' : 'normal' }, g);
    tn.textContent = short(n.g ? n.t + ' (' + n.c.length + ')' : n.t, 25);
    if (n.o) {
      const to = el('text', { x: cx, y: n.y + 36, 'font-size': 11, fill: dark ? 'rgba(255,255,255,.9)' : 'var(--mute)' }, g);
      to.textContent = short(n.o, 26);
    }
    if (!n.g && !n.o && !dark) el('circle', { cx: n.x + NW - 9, cy: n.y + 9, r: 4, fill: '#d97706' }, g);

    if (hasBadge) {
      const b = el('g', { style: 'cursor:pointer' }, g);
      el('circle', { cx: n.x + NW, cy: n.y + NH / 2, r: 11, fill: '#ffffff', stroke: '#cfe0de' }, b);
      const bt = el('text', { x: n.x + NW, y: n.y + NH / 2, 'font-size': 10.5, 'font-weight': 600, fill: 'var(--ink)', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, b);
      bt.textContent = n.kids.length ? '−' : String(n.c.length);
      b.onclick = ev => {
        ev.stopPropagation();
        col.has(n.k) ? col.delete(n.k) : col.add(n.k);
        store.set('col2', [...col]);
        drawOrg();
      };
    }
    g.onclick = () => { selK = n.k; drawOrg(); renderDetail(); };
    g.ondblclick = () => { if (!n.g) { selK = n.k; openFlow(n.id, n.legacy); } };
  }
}

function renderDetail() {
  const box = $('#detail');
  const n = selK && ROOT ? C.findByPath(ROOT, selK) : null;
  if (!n || n.g) {
    box.innerHTML = '<div class="dz"><b>Pilih satuan pada bagan</b> untuk melihat rinciannya. Klik dua kali untuk langsung membuka diagram alurnya.</div>';
    return;
  }
  const subs = C.directUnits(n).length;
  const trail = selK.split('/').slice(1, -1).join(' › ');
  const hasFlow = flowKeys.has(n.id) || flowKeys.has(n.legacy);
  box.innerHTML = `
    <div class="dhead">
      <div>
        <div class="dk">${n.code ? '{' + esc(n.code) + '}' : 'Belum ber-kode'}</div>
        <h3>${esc(n.t)}</h3>
        <div class="dpath">${esc(trail || 'Tingkat teratas')}</div>
      </div>
      <div class="dact">
        <button class="btn" data-act="line">Tampilkan di daftar</button>
        <button class="btn pri" data-act="flow">Buka diagram alur</button>
      </div>
    </div>
    <div class="dgrid">
      <div><span>Pejabat</span><b class="${n.o ? '' : 'miss'}">${n.o ? esc(n.o) : 'Belum diisi'}</b></div>
      <div><span>Bawahan langsung</span><b>${subs}</b></div>
      <div><span>Diagram alur</span><b class="${hasFlow ? 'ok' : 'miss'}">${hasFlow ? 'Sudah ada' : 'Belum ada'}</b></div>
    </div>`;
  box.querySelector('[data-act=line]').onclick = () => focusLine(n.line);
  box.querySelector('[data-act=flow]').onclick = () => openFlow(n.id, n.legacy);
}

function focusLine(line) {
  if (line === undefined || line < 0) return;
  const lines = ta.value.split('\n');
  let s = 0;
  for (let i = 0; i < line; i++) s += lines[i].length + 1;
  const e = s + (lines[line] || '').length;
  ta.focus();
  ta.setSelectionRange(s, e);
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 21;
  ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 3);
}

function setZ(v) { z = Math.max(0.35, Math.min(2, v)); drawOrg(); }

/* ===================== Tab ===================== */
function showTab(k) {
  if (k === 'flow') buildUnits();
  if (k === 'ana') renderAnalysis();
  if (k === 'kap') renderKap();
  for (const j of ['org', 'flow', 'ana', 'kap']) {
    $('#v-' + j).classList.toggle('on', j === k);
    $('#t-' + j).setAttribute('aria-selected', j === k);
  }
}
function openFlow(id, legacy) {
  showTab('flow');
  const u = units.find(x => x.id === id || x.legacy === legacy);
  if (u) { cur = u.id; $('#usel').value = u.id; loadFlow(); }
}

/* ===================== Analisis ===================== */
const tile = (l, v, s, cls = '') => `<div class="tile ${cls}"><span>${esc(l)}</span><b>${esc(v)}</b><small>${esc(s)}</small></div>`;

function renderAnalysis() {
  if (!ROOT) ROOT = C.parseOutline(ta.value);
  const A = C.analyze(ROOT, flowKeys);
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  $('#tiles').innerHTML = [
    tile('Satuan kerja', A.units - A.directorates, `${A.directorates} direktorat · ${A.groups} kelompok`),
    tile('Tingkat organisasi', A.levels, A.byLevel.map((n, i) => `T${i + 1}: ${n}`).join(' · ')),
    tile('Rentang kendali rata-rata', A.avgSpan, `maks ${A.maxSpan} bawahan · ${A.leaves} satuan tanpa bawahan`),
    tile('Pejabat belum diisi', A.noOfficer, `${pct(A.noOfficer, A.units)}% dari satuan`, A.noOfficer ? 'warn' : ''),
    tile('Belum ada diagram alur', A.noFlow, `${pct(A.noFlow, A.units)}% dari satuan`, A.noFlow ? 'info' : ''),
    tile('Belum ber-kode', A.noCode, 'Kode tetap menjaga diagram tetap tersambung', A.noCode ? 'info' : '')
  ].join('');

  const kinds = { 'dup-name': 'Nama ganda', 'dup-code': 'Kode ganda', 'wide-span': 'Rentang kendali lebar', 'single-sub': 'Hanya satu bawahan', 'no-officer': 'Pejabat belum diisi', 'no-code': 'Belum ber-kode', 'no-flow': 'Belum punya diagram alur' };
  const byKind = {};
  A.issues.forEach(i => (byKind[i.kind] = byKind[i.kind] || []).push(i));
  const order = Object.keys(kinds).filter(k => byKind[k]);
  $('#issues').innerHTML = order.length
    ? order.map(k => {
        const arr = byKind[k], sev = arr[0].sev;
        return `<details class="iss"${sev === 'error' ? ' open' : ''}>
          <summary><span class="pill ${sev}">${arr.length}</span>${esc(kinds[k])}</summary>
          ${arr.map(i => `<button class="irow" data-k="${esc(i.node.k)}"><span>${esc(i.node.t)}</span><small>${esc(i.text)}</small></button>`).join('')}
        </details>`;
      }).join('')
    : '<div class="ok-note">Tidak ada temuan. Struktur dan data dalam kondisi baik.</div>';
}

$('#issues').addEventListener('click', e => {
  const b = e.target.closest('.irow');
  if (!b) return;
  selK = b.dataset.k;
  const n = C.findByPath(ROOT, selK);
  showTab('org');
  drawOrg(); renderDetail();
  if (n) focusLine(n.line);
});

async function loadRiwayat() {
  const box = $('#riwayat');
  if (!sb || !canW) { box.innerHTML = '<p class="muted">Riwayat perubahan tersedia saat masuk dengan akun admin (mode cloud).</p>'; return; }
  const r = await sb.from('riwayat').select('waktu,jenis,ringkas,pengguna').order('waktu', { ascending: false }).limit(40);
  if (r.error) { box.innerHTML = `<p class="muted">Gagal memuat riwayat: ${esc(r.error.message)}</p>`; return; }
  box.innerHTML = r.data.length
    ? r.data.map(x => `<div class="hrow"><time>${new Date(x.waktu).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</time><div><b>${esc(x.jenis)}</b> ${esc(x.ringkas)}<div class="muted">${esc(x.pengguna || '')}</div></div></div>`).join('')
    : '<p class="muted">Belum ada perubahan tercatat.</p>';
}

$('#a-csv').onclick = () => {
  if (!ROOT) ROOT = C.parseOutline(ta.value);
  download('struktur-organisasi.csv', C.toCsv(ROOT), 'text/csv;charset=utf-8');
  toast('CSV diunduh. Buka dengan Excel.');
};

/* ===================== Penyimpanan ===================== */
// Setiap penyimpanan ke cloud juga dicatat ke tabel riwayat (tidak diringkas) agar semua perubahan tercatat.
function persist(kind, key, payload, jenis, ringkas) {
  if (!sb || !canW) return;
  const tk = kind + ':' + key;
  pendingSave.add(tk);
  clearTimeout(saveTimers[tk]);
  setStatus('Menyimpan…', 'busy');
  saveTimers[tk] = setTimeout(async () => {
    const t = new Date().toISOString();
    const r = kind === 'org'
      ? await sb.from('struktur').upsert({ id: 1, teks: payload.text, diubah: t })
      : kind === 'kap'
        ? await sb.from('kapasitas').upsert({ id: 1, isi: payload, diubah: t })
        : await sb.from('alur').upsert({ kunci: key, isi: payload, diubah: t });
    pendingSave.delete(tk);
    if (r.error) { setStatus('Gagal menyimpan', 'err'); toast('Gagal menyimpan: ' + r.error.message, 'err'); return; }
    setStatus('Tersimpan ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), 'ok');
    const log = await sb.from('riwayat').insert({ jenis, ringkas, pengguna: me });
    if (log.error) console.warn('Riwayat gagal dicatat:', log.error.message);
    else if ($('#v-ana').classList.contains('on')) loadRiwayat();
  }, 700);
}

ta.addEventListener('input', () => {
  store.set('org3', ta.value);
  const A = C.analyze(C.parseOutline(ta.value), flowKeys);
  persist('org', 'main', { text: ta.value }, 'Daftar satuan kerja', `${A.units} satuan, ${A.levels} tingkat`);
  drawOrg();
  renderDetail();
  if ($('#v-ana').classList.contains('on')) renderAnalysis();
});

ta.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input'));
  }
});

addEventListener('beforeunload', e => {
  if (pendingSave.size) { e.preventDefault(); e.returnValue = ''; }
});

/* ===================== Diagram alur ===================== */
const fs = $('#flowsvg'), lblEl = $('#lbl');
let F = { n: [], e: [] }, sel = null, conn = false, from = null;
const sizeOf = n => n.k === 'dec' ? [170, 90] : n.k === 'start' ? [130, 44] : [150, 50];

function wrapText(t, m = 20) {
  const w = t.split(' '), o = [''];
  for (const x of w) {
    if ((o.at(-1) + ' ' + x).trim().length > m && o.at(-1)) o.push(x);
    else o[o.length - 1] = (o.at(-1) + ' ' + x).trim();
  }
  return o.slice(0, 3);
}
function labelLines(g, t, x, y, lh = 15) {
  const L = wrapText(t);
  L.forEach((s, i) => { el('text', { x, y: y + (i - (L.length - 1) / 2) * lh }, g).textContent = s; });
}
function anchor(n, m) {
  const [w, h] = sizeOf(n), dx = m.x - n.x, dy = m.y - n.y;
  if (Math.abs(dx) > Math.abs(dy) * 1.3) return dx > 0 ? [n.x + w / 2, n.y + h / 2] : [n.x - w / 2, n.y + h / 2];
  return dy > 0 ? [n.x + w / 2, n.y + h] : [n.x + w / 2, n.y];
}

function drawFlow() {
  fs.innerHTML = '';
  const defs = el('defs', {}, fs);
  const mk = el('marker', { id: 'ar', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
  el('path', { d: 'M0 0L10 5L0 10z', fill: 'var(--mute)' }, mk);
  const gE = el('g', {}, fs), gN = el('g', {}, fs);
  const by = id => F.n.find(n => n.id === id);
  if (!F.n.length) {
    el('text', { x: 500, y: 300, 'text-anchor': 'middle', 'font-size': 14, fill: 'var(--mute)' }, fs).textContent =
      cur ? 'Belum ada diagram untuk satuan ini. Tambahkan kotak dari tombol di atas, atau isi dengan contoh.' : 'Pilih satuan kerja di kiri atas.';
  }
  F.e.forEach((e, i) => {
    const A = by(e.a), B = by(e.b);
    if (!A || !B) return;
    const [a1, a2] = anchor(A, B), [b1, b2] = anchor(B, A);
    const horiz = Math.abs(b1 - a1) > Math.abs(b2 - a2) * 1.3;
    const d = horiz
      ? `M${a1} ${a2}C${(a1 + b1) / 2} ${a2} ${(a1 + b1) / 2} ${b2} ${b1} ${b2}`
      : `M${a1} ${a2}C${a1} ${(a2 + b2) / 2} ${b1} ${(a2 + b2) / 2} ${b1} ${b2}`;
    const on = sel && sel.k === 'e' && sel.i === i;
    const g = el('g', { style: 'cursor:pointer' }, gE);
    el('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 14 }, g);
    el('path', { d, fill: 'none', stroke: on ? 'var(--acc)' : '#7d9694', 'stroke-width': on ? 3 : 1.8, 'marker-end': 'url(#ar)' }, g);
    if (e.l) {
      el('text', { x: (a1 + b1) / 2 + (horiz ? 0 : 10), y: (a2 + b2) / 2 - (horiz ? 8 : 0), 'font-size': 12, fill: 'var(--warn)', 'text-anchor': 'middle', 'font-weight': 600 }, g).textContent = e.l;
    }
    g.onpointerdown = ev => { ev.stopPropagation(); sel = { k: 'e', i }; setLbl(); drawFlow(); };
  });
  F.n.forEach(n => {
    const [w, h] = sizeOf(n);
    const g = el('g', { class: 'nd' + (sel && sel.k === 'n' && sel.id === n.id ? ' sel' : '') + (from === n.id ? ' sel' : '') }, gN);
    const f = n.k === 'dec' ? '#fdf0d9' : n.k === 'start' ? '#e3f3e1' : 'url(#gLvl1)';
    if (n.k === 'dec') el('polygon', { points: `${n.x},${n.y} ${n.x + w / 2},${n.y + h / 2} ${n.x},${n.y + h} ${n.x - w / 2},${n.y + h / 2}`, fill: f, stroke: '#cfe0de', 'stroke-width': 1.5 }, g);
    else el('rect', { x: n.x - w / 2, y: n.y, width: w, height: h, rx: n.k === 'start' ? h / 2 : 10, fill: f, stroke: sel && sel.k === 'n' && sel.id === n.id ? '#00867f' : '#cfe0de', 'stroke-width': sel && sel.k === 'n' && sel.id === n.id ? 2.5 : 1.5 }, g);
    labelLines(g, n.t, n.x, n.y + h / 2, 14);
    g.onpointerdown = ev => {
      ev.stopPropagation();
      if (conn) {
        if (from === null) { from = n.id; sel = null; }
        else {
          if (from !== n.id && !F.e.some(e => e.a === from && e.b === n.id)) {
            const srcN = by(from), c = F.e.filter(e => e.a === from).length;
            F.e.push({ a: from, b: n.id, l: srcN.k === 'dec' ? (c === 0 ? 'Ya' : c === 1 ? 'Tidak' : '') : '' });
            saveFlow();
          }
          from = null;
        }
        drawFlow(); return;
      }
      sel = { k: 'n', id: n.id }; setLbl(); drag(ev, n); drawFlow();
    };
  });
}

function pt(ev) { const p = fs.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(fs.getScreenCTM().inverse()); }
function drag(ev, n) {
  const s = pt(ev), ox = n.x - s.x, oy = n.y - s.y;
  fs.setPointerCapture?.(ev.pointerId);
  const mv = e => {
    const p = pt(e);
    n.x = Math.max(90, Math.min(910, Math.round((p.x + ox) / 10) * 10));
    n.y = Math.max(10, Math.min(540, Math.round((p.y + oy) / 10) * 10));
    drawFlow();
  };
  const up = () => { fs.removeEventListener('pointermove', mv); fs.removeEventListener('pointerup', up); saveFlow(); };
  fs.addEventListener('pointermove', mv);
  fs.addEventListener('pointerup', up);
}
function setLbl() {
  const n = sel && sel.k === 'n' && F.n.find(x => x.id === sel.id);
  lblEl.disabled = !(n || (sel && sel.k === 'e'));
  lblEl.value = n ? n.t : sel && sel.k === 'e' ? F.e[sel.i].l : '';
  lblEl.placeholder = sel && sel.k === 'e' ? 'Teks pada garis (boleh kosong)' : 'Pilih kotak untuk mengubah teks';
}
lblEl.oninput = () => {
  if (!sel) return;
  if (sel.k === 'n') F.n.find(n => n.id === sel.id).t = lblEl.value;
  else F.e[sel.i].l = lblEl.value;
  saveFlow(); drawFlow();
};
function saveFlow() {
  const id = cur, u = unitById[id];
  if (!id) return;
  store.set('flow_' + id, F);
  flowKeys.add(id);
  persist('flow', id, F, 'Diagram alur', `"${u ? u.t : id}": ${F.n.length} kotak, ${F.e.length} garis`);
  if ($('#v-org').classList.contains('on')) renderDetail();
}

fs.onpointerdown = () => { sel = null; from = null; setLbl(); drawFlow(); };
document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
  if (!cur) { toast('Pilih satuan kerja dahulu', 'warn'); return; }
  const id = Math.max(0, ...F.n.map(n => n.id)) + 1, k = b.dataset.add;
  F.n.push({ id, x: 130 + (id % 5) * 40, y: 60 + (id % 6) * 30, t: k === 'dec' ? 'Pertanyaan?' : k === 'start' ? 'Selesai' : 'Langkah baru', k });
  sel = { k: 'n', id }; setLbl(); saveFlow(); drawFlow(); lblEl.focus(); lblEl.select();
});
$('#b-conn').onclick = function () {
  conn = !conn; from = null;
  this.classList.toggle('act', conn);
  this.textContent = conn ? 'Hubungkan: aktif' : 'Hubungkan';
  $('#flowhint').textContent = conn
    ? 'Klik kotak asal, lalu klik kotak tujuan. Tekan tombol ini lagi untuk berhenti.'
    : 'Tarik kotak untuk memindahkan. Untuk menyambung, tekan Hubungkan, klik kotak asal, lalu kotak tujuan. Klik garis untuk memilihnya.';
  drawFlow();
};
function deleteSelected() {
  if (!sel) return;
  if (sel.k === 'n') { F.e = F.e.filter(e => e.a !== sel.id && e.b !== sel.id); F.n = F.n.filter(n => n.id !== sel.id); }
  else F.e.splice(sel.i, 1);
  sel = null; setLbl(); saveFlow(); drawFlow();
}
$('#b-del').onclick = deleteSelected;
$('#b-reset').onclick = () => {
  if (F.n.length && !confirm('Diagram satuan ini akan diganti dengan contoh. Lanjutkan?')) return;
  F = JSON.parse(JSON.stringify(C.EXAMPLE_FLOW)); sel = null; from = null; setLbl(); saveFlow(); drawFlow();
};
document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName;
  if (e.key === 'Delete' && tag !== 'INPUT' && tag !== 'TEXTAREA' && $('#v-flow').classList.contains('on')) deleteSelected();
  if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && $('#v-org').classList.contains('on')) { e.preventDefault(); $('#q').focus(); }
});

function buildUnits() {
  const old = cur;
  units = []; unitById = {};
  if (ROOT) C.eachUnit(ROOT, (n, info) => {
    const u = { id: n.id, legacy: n.legacy, t: n.t, code: n.code, depth: info.tier, k: n.k };
    units.push(u); unitById[u.id] = u;
  });
  const s = $('#usel');
  s.innerHTML = '';
  units.forEach(u => {
    const o = document.createElement('option');
    o.value = u.id;
    o.textContent = '\u00a0\u00a0'.repeat(u.depth) + u.t + (u.code ? '  {' + u.code + '}' : '');
    s.appendChild(o);
  });
  cur = unitById[old] ? old : (units[0] ? units[0].id : '');
  s.value = cur;
  if (cur !== old) loadFlow();
}

async function loadFlow() {
  sel = null; from = null;
  const id = cur, u = unitById[id];
  if (!u) { F = { n: [], e: [] }; setLbl(); drawFlow(); return; }
  let d = null;
  if (sb && canW) {
    const keys = [...new Set([u.id, u.legacy])];
    const r = await sb.from('alur').select('kunci,isi').in('kunci', keys);
    if (r.error) setStatus('Gagal memuat diagram', 'err');
    else { const row = keys.map(k => r.data.find(x => x.kunci === k)).find(Boolean); d = row ? row.isi : null; }
  } else {
    d = store.get('flow_' + u.id, null) ?? store.get('flow_' + u.legacy, null);
  }
  if (id !== cur) return;   // pengguna sudah memilih satuan lain
  F = d && Array.isArray(d.n) ? { n: d.n, e: d.e || [] } : { n: [], e: [] };
  setLbl(); drawFlow();
}
$('#usel').onchange = e => { cur = e.target.value; loadFlow(); };

/* ===================== Kontrol struktur ===================== */
$('#q').oninput = e => { q = e.target.value.trim(); drawOrg(); };
$('#z-in').onclick = () => setZ(z + 0.15);
$('#z-out').onclick = () => setZ(z - 0.15);
$('#z-fit').onclick = () => { setZ(Math.min(1.25, ($('#ocv').clientWidth - 24) / lastW)); };
$('#o-open').onclick = () => { col.clear(); store.set('col2', []); drawOrg(); };
$('#o-col').onclick = () => {
  col = new Set();
  (function w(n, d) { if (d >= 1 && n.c.length) col.add(n.k); n.c.forEach(c => w(c, d + 1)); })(C.parseOutline(ta.value), 0);
  store.set('col2', [...col]); drawOrg();
};
$('#o-print').onclick = () => window.print();
$('#o-svg').onclick = () => {
  const cs = getComputedStyle(document.documentElement);
  let x = new XMLSerializer().serializeToString($('#orgsvg'));
  x = x.replace(/var\(--(\w+)\)/g, (m, k) => cs.getPropertyValue('--' + k).trim() || m)
       .replace('<svg', '<svg font-family="Inter, Segoe UI, Arial, sans-serif"');
  download('struktur-organisasi.svg', x, 'image/svg+xml');
};
$('#b-imp').onclick = () => {
  try {
    const txt = C.importRows($('#imp').value);
    if (!txt) { toast('Tidak ada baris yang bisa diimpor', 'warn'); return; }
    if (ta.value.trim() && !confirm('Daftar satuan kerja yang sekarang akan diganti dengan hasil impor. Lanjutkan?')) return;
    ta.value = txt;
    ta.dispatchEvent(new Event('input'));
    const n = C.analyze(C.parseOutline(txt), flowKeys).units;
    $('#imp').value = '';
    toast(`Diimpor ${n} satuan`);
  } catch (err) { toast(err.message, 'err'); }
};

$('#t-org').onclick = () => showTab('org');
$('#t-flow').onclick = () => showTab('flow');
$('#t-ana').onclick = () => { showTab('ana'); loadRiwayat(); };
$('#t-kap').onclick = () => showTab('kap');

/* ===================== Kapasitas tempat tidur (v3) ===================== */
const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
$('#kap-tgl').value = todayIso();

function kapValidSet() {
  const s = new Set();
  if (ROOT) C.eachUnit(ROOT, n => { if (n.code) s.add(n.code); });
  return s;
}

function renderKapIssues(list) {
  const box = $('#kap-issues');
  box.innerHTML = list.length
    ? list.map(i => `<div class="${i.sev}">${esc(i.text)}</div>`).join('')
    : '<div class="muted">Tidak ada galat atau peringatan.</div>';
}

function renderKap() {
  const tgl = $('#kap-tgl').value || todayIso();
  const S = C.kapasitasAsOf(KAP.rows, tgl);
  const cek = C.cekTotal(S.total, $('#kap-sk').value);
  $('#kap-tiles').innerHTML = [
    tile('Total TT operasional', S.total, `berlaku pada ${tgl}`),
    tile('Ruangan', S.ruangan, `${S.perInstalasi.length} instalasi`),
    tile('Selisih terhadap SK', cek.selisih > 0 ? '+' + cek.selisih : cek.selisih,
      cek.ok ? 'Sesuai dengan SK' : 'Belum sesuai, periksa data', cek.ok ? '' : 'warn')
  ].join('');
  const valid = kapValidSet();
  $('#kap-tabel').innerHTML = S.perInstalasi.length
    ? `<table class="tbl"><thead><tr><th>Kode instalasi</th><th class="num">TT</th><th>Ada di daftar organisasi</th></tr></thead><tbody>${
        S.perInstalasi.map(x => `<tr><td>${esc(x.kode)}</td><td class="num">${x.tt}</td><td>${valid.has(x.kode) ? 'Ya' : '<span class="muted">Belum ada kode</span>'}</td></tr>`).join('')
      }</tbody></table>`
    : '<p class="muted">Belum ada data untuk tanggal ini. Impor data ruangan di sebelah kiri.</p>';
  return S;
}

function saveKap() {
  store.set('kap3', KAP);
  const S = C.kapasitasAsOf(KAP.rows, $('#kap-tgl').value || todayIso());
  persist('kap', 'main', { rows: KAP.rows }, 'Kapasitas tempat tidur', `${KAP.rows.length} baris, ${S.total} TT pada ${$('#kap-tgl').value || todayIso()}`);
}

$('#kap-imp').onclick = () => {
  const r = C.parseRuangan($('#kapin').value, kapValidSet());
  renderKapIssues(r.issues);
  if (!r.rows.length && !r.issues.length) { toast('Tidak ada baris yang bisa diimpor', 'warn'); return; }
  if (!r.ok) { toast('Impor ditolak: periksa galat di bawah', 'err'); return; }
  if (KAP.rows.length && !confirm('Data kapasitas yang sekarang akan diganti. Lanjutkan?')) return;
  store.set('kap3_sebelum', KAP);
  KAP = { rows: r.rows };
  saveKap();
  $('#kapin').value = '';
  renderKap();
  toast(`Diimpor ${r.rows.length} baris ruangan`);
};
$('#kap-tgl').oninput = renderKap;
$('#kap-tgl').onchange = renderKap;
$('#kap-sk').oninput = renderKap;
$('#kap-csv').onclick = () => {
  const S = C.kapasitasAsOf(KAP.rows, $('#kap-tgl').value || todayIso());
  download('kapasitas-ruangan.csv', C.kapasitasCsv(S.aktif), 'text/csv;charset=utf-8');
};
$('#kap-rek').onclick = () => {
  const S = C.kapasitasAsOf(KAP.rows, $('#kap-tgl').value || todayIso());
  download('kapasitas-ringkasan.csv', C.ringkasanCsv(S), 'text/csv;charset=utf-8');
};

/* ===================== Masuk dan inisialisasi ===================== */
async function enter() {
  canW = true;
  document.body.classList.add('in');
  $('#b-out').hidden = false;
  const r = await sb.from('struktur').select('teks').eq('id', 1).maybeSingle();
  if (r.error) setStatus('Gagal memuat data', 'err');
  else if (r.data && r.data.teks) ta.value = r.data.teks;
  else persist('org', 'main', { text: ta.value }, 'Daftar satuan kerja', 'data awal');
  drawOrg(); renderDetail();
  const kp = await sb.from('kapasitas').select('isi').eq('id', 1).maybeSingle();
  if (!kp.error && kp.data && kp.data.isi && Array.isArray(kp.data.isi.rows)) KAP = { rows: kp.data.isi.rows };
  renderKap();
  const fk = await sb.from('alur').select('kunci');
  if (!fk.error) flowKeys = new Set(fk.data.map(x => x.kunci));
  buildUnits();
  if (!r.error) setStatus('Terhubung', 'ok');
}

async function initCloud() {
  const CFG = window.APP_CONFIG || {};
  if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes('GANTI') || !window.supabase) {
    document.body.classList.add('in');
    $('#b-out').hidden = true;
    setStatus('Mode demo: data hanya di browser ini', 'warn');
    try { flowKeys = new Set(Object.keys(localStorage).filter(k => k.startsWith('flow_')).map(k => k.slice(5))); } catch (e) {}
    KAP = store.get('kap3', { rows: [] });
    drawOrg(); renderDetail(); buildUnits(); renderKap();
    return;
  }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    $('#lerr').textContent = '';
    const r = await sb.auth.signInWithPassword({ email: $('#em').value, password: $('#pw').value });
    if (r.error) $('#lerr').textContent = 'Email atau kata sandi salah.';
    else { me = r.data.user.email; enter(); }
  };
  $('#b-out').onclick = async () => { await sb.auth.signOut(); location.reload(); };
  const g = await sb.auth.getSession();
  if (g.data.session) { me = g.data.session.user.email; enter(); }
}

ta.value = store.get('org3', null) ?? store.get('org2', null) ?? C.DEFAULT_OUTLINE;
initCloud();

/* ===================== Cadangan dan pemulihan (v3.1) ===================== */
const readFileText = f => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result));
  fr.onerror = () => rej(new Error('Berkas tidak bisa dibaca'));
  fr.readAsText(f);
});
const chk = (r, what) => { if (r && r.error) throw new Error(what + ': ' + r.error.message); return r; };

async function kumpulCadangan() {
  let alur = {}, riwayat = [];
  if (sb && canW) {
    const a = chk(await sb.from('alur').select('kunci,isi'), 'Gagal membaca diagram');
    (a.data || []).forEach(x => { alur[x.kunci] = x.isi; });
    const r = await sb.from('riwayat').select('waktu,jenis,ringkas,pengguna').order('waktu', { ascending: false }).limit(1000);
    if (!r.error) riwayat = r.data || [];
  } else {
    flowKeys.forEach(k => { const d = store.get('flow_' + k, null); if (d) alur[k] = d; });
  }
  return C.buatCadangan({ teks: ta.value, alur, rows: KAP.rows, riwayat });
}

async function terapkanCadangan(o) {
  // Keadaan sekarang disimpan dulu sebagai cadangan lokal, sehingga pemulihan bisa dibalik secara manual.
  try { store.set('pra_pulih', await kumpulCadangan()); } catch (e) { /* tidak menghalangi pemulihan */ }
  const now = new Date().toISOString();
  ta.value = o.struktur.teks;
  store.set('org3', ta.value);
  KAP = { rows: o.kapasitas.rows };
  store.set('kap3', KAP);
  for (const [k, isi] of Object.entries(o.alur)) { store.set('flow_' + k, isi); flowKeys.add(k); }
  if (sb && canW) {
    chk(await sb.from('struktur').upsert({ id: 1, teks: ta.value, diubah: now }), 'Struktur');
    chk(await sb.from('kapasitas').upsert({ id: 1, isi: KAP, diubah: now }), 'Kapasitas');
    for (const [k, isi] of Object.entries(o.alur)) chk(await sb.from('alur').upsert({ kunci: k, isi, diubah: now }), 'Diagram ' + k);
    await sb.from('riwayat').insert({ jenis: 'Pemulihan cadangan', ringkas: 'dari cadangan ' + String(o.dibuat).slice(0, 10), pengguna: me });
  }
  drawOrg(); renderDetail(); buildUnits(); renderKap();
}

$('#a-cad').onclick = async () => {
  try {
    const c = await kumpulCadangan();
    download(`cadangan-struktur-${todayIso()}.json`, JSON.stringify(c, null, 2), 'application/json');
    toast('Cadangan diunduh');
  } catch (e) { toast(e.message, 'err'); }
};

$('#a-pulih').onclick = () => $('#a-berkas').click();
$('#a-berkas').onchange = async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  let o;
  try { o = JSON.parse(await readFileText(f)); }
  catch (err) { toast('Berkas bukan JSON yang valid', 'err'); return; }
  const v = C.validasiCadangan(o);
  if (!v.ok) { toast('Cadangan ditolak: ' + v.errors[0], 'err'); return; }
  if (!confirm(`Pulihkan cadangan tanggal ${String(o.dibuat).slice(0, 10)}? Daftar satuan, diagram, dan data kapasitas sekarang akan diganti.`)) return;
  try {
    await terapkanCadangan(o);
    toast('Cadangan dipulihkan');
  } catch (err) { toast('Pemulihan gagal: ' + err.message, 'err'); }
};

$('#kap-batal').onclick = () => {
  const prev = store.get('kap3_sebelum', null);
  if (!prev) { toast('Tidak ada impor yang bisa dibatalkan', 'warn'); return; }
  if (!confirm('Tukar data kapasitas dengan versi sebelum impor terakhir? Tekan lagi untuk kembali.')) return;
  const cur = KAP;
  KAP = prev;
  store.set('kap3_sebelum', cur);
  saveKap();
  renderKap();
  toast('Data kapasitas ditukar ke versi sebelumnya');
};
async function tanyaAI(prompt) {
  const res = await fetch('/.netlify/functions/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Gagal memanggil AI');
  return data;
}
