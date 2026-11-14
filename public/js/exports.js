// Excel, сурет (PNG) және PowerPoint экспорттары
import { evaluate, weekStats, prevWeek, prevSameTest } from './calc.js';
import { fmt, fmtPct, fmtSigned, parseNum, arrayBufferToBase64 } from './util.js';
import { saveFile } from './store.js';

export const XL = { header: 'FFFF00', green: '00B050', blue: '00B0F0', red: 'FF0000', none: 'FFFFFF', foot: 'D9D9D9' };

export const fileNames = (meta, week) => {
  const base = `${week.number}_АПТА_${meta.code}`;
  return {
    xlsx: `РТ_${base}.xlsx`,
    png: `РТ_${base}.png`,
    testPng: `${week.testType}_${base}.png`,
    pptx: `отчет_${base}.pptx`,
  };
};

const round2 = (n) => Math.round(n * 100) / 100;

// ================= Сурет (canvas) =================
// Excel скриншоты сияқты: сары тақырып, түсті жолдар, қара сызықтар
export function drawTable({ head, rows, foot, title, aligns = [] }) {
  const scale = 2;
  const font = 'bold 15px Calibri, "Segoe UI", Arial, sans-serif';
  const pad = 10, rowH = 26, titleH = title ? 44 : 0;
  const m = document.createElement('canvas').getContext('2d');
  m.font = font;
  const all = [head, ...rows.map((r) => r.cells), ...(foot ? [foot.cells] : [])];
  const widths = head.map((_, i) => Math.max(...all.map((r) => m.measureText(String(r[i] ?? '')).width)) + pad * 2);
  const W = Math.ceil(widths.reduce((a, b) => a + b, 0)) + 1;
  const H = titleH + rowH * (1 + rows.length + (foot ? 1 : 0)) + 1;
  const c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
  if (title) {
    g.fillStyle = '#1D2E28'; g.fillRect(0, 0, W, titleH);
    g.fillStyle = '#FFFFFF'; g.font = 'bold 17px Calibri, "Segoe UI", Arial, sans-serif';
    g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText(title, W / 2, titleH / 2);
  }
  const drawRow = (cells, y, fill, color = '#000000') => {
    let x = 0;
    g.font = font; g.textBaseline = 'middle';
    cells.forEach((v, i) => {
      g.fillStyle = fill; g.fillRect(x, y, widths[i], rowH);
      g.strokeStyle = '#000000'; g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, widths[i], rowH);
      g.fillStyle = color;
      const a = aligns[i] || 'center';
      g.textAlign = a;
      const tx = a === 'left' ? x + pad : a === 'right' ? x + widths[i] - pad : x + widths[i] / 2;
      g.fillText(String(v ?? ''), tx, y + rowH / 2 + 1);
      x += widths[i];
    });
  };
  let y = titleH;
  drawRow(head, y, '#' + XL.header); y += rowH;
  rows.forEach((r) => { drawRow(r.cells, y, '#' + (XL[r.zone] || XL.none), r.color); y += rowH; });
  if (foot) drawRow(foot.cells, y, '#' + (foot.fill || XL.header));
  return c;
}

export function ratingCanvas(group, week, settings, title) {
  const { byRating, list } = evaluate(group, week, settings);
  const head = ['ТЕГІ', 'АТЫ', ...week.columns.map((c) => c.label), 'ЖАЛПЫ'];
  const rows = byRating.map((e) => ({
    zone: e.zone,
    cells: [e.st.surname, e.st.name, ...week.columns.map((c) => e.row.scores[c.id] ?? 0), e.total],
  }));
  const n = list.length || 1;
  const avg = (fn) => fmt(list.reduce((s, e) => s + fn(e), 0) / n, 2);
  const foot = { cells: ['ОРТА', 'БАЛЛ', ...week.columns.map((c) => avg((e) => e.row.scores[c.id] ?? 0)), avg((e) => e.total)] };
  return drawTable({ head, rows, foot, title });
}

export function testCanvas(group, week, settings, title) {
  const { list } = evaluate(group, week, settings);
  const present = list.filter((e) => !e.absent).sort((a, b) => b.test - a.test);
  const absent = list.filter((e) => e.absent);
  const head = ['АТЫ-ЖӨНІ', week.testType];
  const rows = [
    ...present.map((e) => ({ zone: e.testZone, cells: [`${e.st.surname} ${e.st.name}`, e.test] })),
    ...absent.map((e) => ({ zone: 'none', color: '#666666', cells: [`${e.st.surname} ${e.st.name}`, 'келмеді'] })),
  ];
  const avg = present.length ? present.reduce((s, e) => s + e.test, 0) / present.length : 0;
  return drawTable({
    head, rows, title, aligns: ['left', 'right'],
    foot: { fill: XL.foot, cells: ['ОРТАҚ БАЛЛ', fmt(avg, 2)] },
  });
}

const canvasB64 = (c) => c.toDataURL('image/png').split(',')[1];

// ================= Excel =================
function styleCell(cell, fill, { bold = false, align = 'center' } = {}) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + fill } };
  cell.font = { name: 'Calibri', size: 11, bold };
  cell.alignment = { horizontal: align, vertical: 'middle' };
  const b = { style: 'thin', color: { argb: 'FF000000' } };
  cell.border = { top: b, left: b, bottom: b, right: b };
}
const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export async function buildXlsx(group, week, settings) {
  if (!window.ExcelJS) throw new Error('Excel кітапханасы жүктелмеді');
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'NNN Куратор';
  const { byRating, list } = evaluate(group, week, settings);
  const n = list.length;

  // ---- 1-бет: жалпы рейтинг ----
  const ws = wb.addWorksheet(`№${week.number} РТ`);
  const head = ['ТЕГІ', 'АТЫ', ...week.columns.map((c) => c.label), 'ЖАЛПЫ'];
  ws.addRow(head).eachCell((c) => styleCell(c, XL.header, { bold: true }));
  const firstNum = 3, lastNum = 2 + week.columns.length, totalCol = lastNum + 1;
  byRating.forEach((e, i) => {
    const r = i + 2;
    const vals = [e.st.surname, e.st.name, ...week.columns.map((c) => e.row.scores[c.id] ?? 0)];
    const row = ws.addRow(vals);
    row.getCell(totalCol).value = { formula: `SUM(${colLetter(firstNum)}${r}:${colLetter(lastNum)}${r})`, result: e.total };
    for (let k = 1; k <= totalCol; k++) styleCell(row.getCell(k), XL[e.zone] || XL.none);
    if (e.row.note) row.getCell(totalCol + 1).value = e.row.note;
  });
  const fr = n + 2;
  const foot = ws.getRow(fr);
  foot.getCell(1).value = 'ОРТА'; foot.getCell(2).value = 'БАЛЛ';
  for (let k = firstNum; k <= totalCol; k++) {
    const L = colLetter(k);
    const sum = k === totalCol ? list.reduce((s, e) => s + e.total, 0)
      : list.reduce((s, e) => s + (e.row.scores[week.columns[k - firstNum].id] ?? 0), 0);
    foot.getCell(k).value = { formula: `SUM(${L}2:${L}${n + 1})/${n || 1}`, result: n ? sum / n : 0 };
  }
  for (let k = 1; k <= totalCol; k++) styleCell(foot.getCell(k), XL.header, { bold: k <= 2 });
  ws.getColumn(1).width = 16; ws.getColumn(2).width = 13;
  for (let k = firstNum; k <= totalCol; k++) ws.getColumn(k).width = Math.max(9, String(head[k - 1]).length + 3);
  ws.getColumn(totalCol + 1).width = 40;
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

  // ---- 2-бет: АБС / АТ ----
  const ts = wb.addWorksheet(`№${week.number} ${week.testType}`);
  const tcol = week.columns.find((c) => c.kind === 'test');
  ts.addRow(['ТЕГІ', 'АТЫ', tcol ? tcol.label : week.testType]).eachCell((c) => styleCell(c, XL.header, { bold: true }));
  const present = list.filter((e) => !e.absent).sort((a, b) => b.test - a.test);
  const absent = list.filter((e) => e.absent);
  present.forEach((e) => {
    const row = ts.addRow([e.st.surname, e.st.name, e.test]);
    for (let k = 1; k <= 3; k++) styleCell(row.getCell(k), XL[e.testZone]);
    if (e.row.testNote) row.getCell(4).value = e.row.testNote;
  });
  const pr = present.length;
  const tf = ts.addRow(['ОРТА', 'БАЛЛ', { formula: `SUM(C2:C${pr + 1})/${pr || 1}`, result: pr ? present.reduce((s, e) => s + e.test, 0) / pr : 0 }]);
  tf.eachCell((c) => styleCell(c, XL.header, { bold: true }));
  if (absent.length) {
    ts.addRow([]);
    absent.forEach((e) => {
      const row = ts.addRow([e.st.surname, e.st.name, '', e.row.testNote || 'келмеді']);
      row.getCell(4).font = { italic: true, color: { argb: 'FF666666' } };
    });
  }
  ts.getColumn(1).width = 16; ts.getColumn(2).width = 13; ts.getColumn(3).width = 10; ts.getColumn(4).width = 42;

  // ---- 3-бет: ПП (пересдача) ----
  const ps = wb.addWorksheet(`№${week.number} ПП`);
  ps.addRow(['ТЕГІ', 'АТЫ', tcol ? tcol.label : week.testType, 'ПП']).eachCell((c) => styleCell(c, XL.header, { bold: true }));
  const ppList = list.filter((e) => e.testZone === 'red' || e.absent)
    .sort((a, b) => (b.pp ?? -1) - (a.pp ?? -1) || (b.test ?? -1) - (a.test ?? -1));
  ppList.forEach((e) => {
    const row = ps.addRow([e.st.surname, e.st.name, e.absent ? 'келмеді' : e.test, e.pp ?? '']);
    const z = e.pp != null ? e.ppZone : 'red';
    for (let k = 1; k <= 4; k++) styleCell(row.getCell(k), XL[z]);
    if (e.row.ppNote) row.getCell(5).value = e.row.ppNote;
  });
  ps.getColumn(1).width = 16; ps.getColumn(2).width = 13; ps.getColumn(3).width = 10; ps.getColumn(4).width = 8; ps.getColumn(5).width = 40;

  const buf = await wb.xlsx.writeBuffer();
  return arrayBufferToBase64(buf);
}

// ================= Отчет мәндері =================
export function reportDefaults(group, week, meta, settings) {
  const cur = weekStats(group, week, settings);
  const pw = prevWeek(group, week);
  const pt = prevSameTest(group, week);
  const prev = pw ? weekStats(group, pw, settings) : null;
  const prevT = pt ? weekStats(group, pt, settings) : null;
  const prevRep = (pw && pw.report) || {};
  return {
    att_total: String(cur.n),
    att_present: String(cur.attended),
    att_pp: String(cur.ppDone),
    reasons: 'Себепті: ',
    att_prev: prev ? fmtPct(prev.attendPct, 0) : '',
    att_plan: prevRep.att_plan || '100%',
    att_fact: fmtPct(cur.attendPct, 0),
    test_prev: prevT && prevT.testAvg != null ? fmt(prevT.testAvg, 1) : '',
    test_plan: (pt && pt.report && pt.report.test_plan) || '',
    test_fact: cur.testAvg != null ? fmt(cur.testAvg, 1) : '',
    tot_prev: prev ? fmtPct(prev.avgPct, 1) : '',
    tot_plan: prevRep.tot_plan || '',
    tot_fact: fmtPct(cur.avgPct, 1),
  };
}

export function conv(prevStr, factStr, isPct) {
  const a = parseNum(prevStr), b = parseNum(factStr);
  if (a == null || b == null || isNaN(a) || isNaN(b)) return '';
  return fmtSigned(b - a, isPct ? 1 : 1, isPct ? '%' : '');
}

export function resolveReport(group, week, meta, settings) {
  const d = reportDefaults(group, week, meta, settings);
  const r = { ...d, ...(week.report || {}) };
  r.att_conv = (week.report && week.report.att_conv) || conv(r.att_prev, r.att_fact, true);
  r.test_conv = (week.report && week.report.test_conv) || conv(r.test_prev, r.test_fact, false);
  r.tot_conv = (week.report && week.report.tot_conv) || conv(r.tot_prev, r.tot_fact, true);
  return r;
}

// ================= PowerPoint =================
const SKY = '87CEEB', BOX = '0F1F2E', WHITE = 'FFFFFF';
const E = (emu) => emu / 914400; // EMU → дюйм

async function urlToDataUrl(url) {
  const blob = await (await fetch(url)).blob();
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
}

export async function buildPptx(group, week, meta, settings) {
  if (!window.PptxGenJS) throw new Error('PowerPoint кітапханасы жүктелмеді');
  const rep = resolveReport(group, week, meta, settings);
  const pptx = new window.PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = settings.curatorName;
  pptx.title = `${meta.name} ${week.number}-АПТА`;
  const bgTitle = await urlToDataUrl('/assets/bg-title.png');
  const bg = await urlToDataUrl('/assets/bg-slide.png');
  const brand = settings.brand || 'NNN ONLINE';
  const isAT = week.testType === 'АТ';

  const base = (s) => {
    s.addText(brand, { x: E(457200), y: E(274320), w: E(3657600), h: E(365760), fontFace: 'Bold Mono', fontSize: 14, bold: true, color: SKY, margin: 0 });
  };
  const title = (s, text, y = 640080) => {
    s.addText(text, { x: E(548640), y: E(y), w: E(11091672), h: E(731520), fontFace: 'Elevon', fontSize: 38, bold: true, color: WHITE, margin: 0 });
  };
  const accent = (s, y = 1325880) => {
    s.addShape(pptx.ShapeType.roundRect, { x: E(5638800), y: E(y), w: E(914400), h: E(45720), fill: { color: SKY }, line: { color: SKY, width: 0 }, rectRadius: 0.01 });
  };
  const label = (s, text, x, y, w) => {
    s.addText(text, { x: E(x), y: E(y), w: E(w), h: E(365760), fontFace: 'Bold Mono', fontSize: 16, bold: true, color: SKY, margin: 0 });
  };
  const box = (s, x, y, w, h) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x: E(x), y: E(y), w: E(w), h: E(h), fill: { color: BOX },
      line: { color: SKY, width: 1, transparency: 25 }, rectRadius: 0.2 * Math.min(E(w), E(h)),
    });
  };
  const metric = (s, x, y, w, h, lab, val, size) => {
    box(s, x, y, w, h);
    s.addText(lab, { x: E(x + 91440), y: E(y + 109728), w: E(w - 182880), h: E(438912), fontFace: 'Touche', fontSize: 12, color: WHITE, align: 'center', valign: 'middle', margin: 0 });
    s.addText(String(val || ''), { x: E(x + 45720), y: E(y + 576072), w: E(w - 91440), h: E(685800), fontFace: 'Bold Mono', fontSize: size, bold: true, color: SKY, align: 'center', valign: 'middle', margin: 0, fit: 'shrink' });
  };
  const frameImage = (s, canvas, x, y, w, h, caption) => {
    box(s, x, y, w, h);
    s.addText(caption, { x: E(x), y: E(y - 420000), w: E(w), h: E(365760), fontFace: 'Bold Mono', fontSize: 14, bold: true, color: SKY, align: 'center', margin: 0 });
    if (!canvas) {
      s.addText('Дерек жоқ', { x: E(x), y: E(y), w: E(w), h: E(h), fontFace: 'Touche', fontSize: 14, color: '6F8FA3', align: 'center', valign: 'middle' });
      return;
    }
    const pad = 76200;
    const bw = w - pad * 2, bh = h - pad * 2;
    const ar = canvas.width / canvas.height;
    let iw = bw, ih = bw / ar;
    if (ih > bh) { ih = bh; iw = bh * ar; }
    s.addImage({ data: canvas.toDataURL('image/png'), x: E(x + (w - iw) / 2), y: E(y + (h - ih) / 2), w: E(iw), h: E(ih) });
  };

  // 1 — Титул
  let s = pptx.addSlide(); s.background = { data: bgTitle };
  base(s);
  s.addText((settings.curatorName || '').toLocaleUpperCase('kk'), { x: E(548640), y: E(2194560), w: E(11091672), h: E(1280160), fontFace: 'Elevon', fontSize: 60, bold: true, color: WHITE, margin: 0, fit: 'shrink' });
  s.addText(`${meta.name} ${week.number}-АПТА`, { x: E(548640), y: E(3611880), w: E(11091672), h: E(548640), fontFace: 'Bold Mono', fontSize: 28, bold: true, color: SKY, margin: 0 });
  s.addText(`${week.dateFrom} — ${week.dateTo}`, { x: E(548640), y: E(4206240), w: E(11091672), h: E(457200), fontFace: 'Touche', fontSize: 22, color: WHITE, margin: 0 });

  // 2 — Қатысым
  s = pptx.addSlide(); s.background = { data: bg };
  base(s); title(s, `${week.testType} ҚАТЫСЫМ`); accent(s);
  label(s, 'ҚАТЫСЫМ', 548640, 1371600, 5486400);
  metric(s, 548640, 1783080, 1737360, 1371600, 'Оқушы саны', rep.att_total, 44);
  metric(s, 2423160, 1783080, 1737360, 1371600, 'Қатысты', rep.att_present, 44);
  metric(s, 4297680, 1783080, 1737360, 1371600, 'Пересдача', rep.att_pp, 44);
  label(s, 'КӨРСЕТКІШТЕР', 6400800, 1371600, 5212080);
  metric(s, 6400800, 1783080, 1243584, 1371600, 'Өткен аптада', rep.att_prev, 26);
  metric(s, 7735824, 1783080, 1243584, 1371600, 'План', rep.att_plan, 26);
  metric(s, 9070848, 1783080, 1243584, 1371600, 'Факт', rep.att_fact, 26);
  metric(s, 10405872, 1783080, 1243584, 1371600, 'Конверсия', rep.att_conv, 26);
  box(s, 3444243, 3429000, 5486400, 2834640);
  s.addText(rep.reasons || 'Себепті: ', { x: E(3672843), y: E(3566160), w: E(5029200), h: E(2560320), fontFace: 'Bold Mono', fontSize: 18, bold: true, color: SKY, valign: 'middle', align: 'center', margin: 0, fit: 'shrink' });

  // 3 — АБС/АТ ортақ балл
  s = pptx.addSlide(); s.background = { data: bg };
  base(s); title(s, 'ОРТАҚ БАЛЛДАР'); accent(s);
  label(s, `${week.testType} ОРТАҚ БАЛЛ`, 548640, 1371600, 4023360);
  metric(s, 548640, 1783080, 1938528, 1325880, isAT ? 'Өткен ай' : 'Өткен апта', rep.test_prev, 28);
  metric(s, 2633472, 1783080, 1938528, 1325880, 'План', rep.test_plan, 28);
  metric(s, 548640, 3246120, 1938528, 1325880, 'Факт', rep.test_fact, 28);
  metric(s, 2633472, 3246120, 1938528, 1325880, 'Конверсия', rep.test_conv, 28);
  const pt = prevSameTest(group, week);
  frameImage(s, pt ? testCanvas(group, pt, settings) : null, 4892040, 1783080, 3200400, 4103914, isAT ? 'ӨТКЕН АЙ' : 'ӨТКЕН АПТА');
  frameImage(s, testCanvas(group, week, settings), 8366760, 1783080, 3200400, 4103914, isAT ? 'ОСЫ АЙ' : 'ОСЫ АПТА');

  // 4 — Жалпы ортақ балл
  s = pptx.addSlide(); s.background = { data: bg };
  base(s); title(s, 'ОРТАҚ БАЛЛДАР'); accent(s);
  label(s, 'ЖАЛПЫ ОРТАҚ БАЛЛ', 548640, 1325880 + 45720, 5486400);
  metric(s, 548640, 1783080, 1463040, 1371600, 'Өткен апта', rep.tot_prev, 26);
  metric(s, 2121408, 1783080, 1463040, 1371600, 'План', rep.tot_plan, 26);
  metric(s, 3694176, 1783080, 1463040, 1371600, 'Факт', rep.tot_fact, 26);
  metric(s, 5266944, 1783080, 1463040, 1371600, 'Конверсия', rep.tot_conv, 26);
  const pw = prevWeek(group, week);
  frameImage(s, pw ? ratingCanvas(group, pw, settings) : null, 548640, 3474720 + 300000, 5394960, 2944368 - 300000, '· ӨТКЕН АПТА');
  frameImage(s, ratingCanvas(group, week, settings), 6245352, 3474720 + 300000, 5394960, 2944368 - 300000, '· ОСЫ АПТА');

  // 5 — Жетістік (өзіңіз толтырасыз)
  s = pptx.addSlide(); s.background = { data: bg };
  base(s); title(s, 'ЖЕТІСТІК'); accent(s);
  s.addText('1)', { x: E(548640), y: E(1737360), w: E(5394960), h: E(1188720), fontFace: 'Bold Mono', fontSize: 80, bold: true, color: SKY, margin: 0 });
  box(s, 548640, 3108960, 5394960, 3017520);
  s.addText('', { x: E(777240), y: E(3246120), w: E(4937760), h: E(2743200), fontFace: 'Touche', fontSize: 26, color: WHITE, valign: 'middle', margin: 0 });
  box(s, 6505303, 2429690, 5050972, 2891247);

  // 6 — Келесі аптаға жоспар (өзіңіз толтырасыз)
  s = pptx.addSlide(); s.background = { data: bg };
  base(s); title(s, 'КЕЛЕСІ АПТАҒА ЖОСПАР'); accent(s);
  [[548640, 1737360], [6153912, 1737360], [548640, 4023360], [6153912, 4023360]].forEach(([x, y], i) => {
    box(s, x, y, 5486400, 2103120);
    s.addText(`${i + 1}.`, { x: E(x + 274320), y: E(y + 182880), w: E(1188720), h: E(1737360), fontFace: 'Bold Mono', fontSize: 54, bold: true, color: SKY, valign: 'middle', margin: 0 });
    s.addText('', { x: E(x + 1554480), y: E(y + 182880), w: E(3703320), h: E(1737360), fontFace: 'Elevon', fontSize: 20, bold: true, color: WHITE, valign: 'middle', margin: 0 });
  });

  return pptx.write({ outputType: 'base64' });
}

// ================= Бәрін бірден =================
export async function exportAll(group, week, meta, settings, which = ['xlsx', 'png', 'testPng', 'pptx']) {
  const names = fileNames(meta, week);
  const out = [];
  const titleTxt = `${meta.name} — ${week.number}-апта рейтингі (${week.dateFrom}–${week.dateTo})`;
  for (const k of which) {
    let b64;
    if (k === 'xlsx') b64 = await buildXlsx(group, week, settings);
    if (k === 'png') b64 = canvasB64(ratingCanvas(group, week, settings, titleTxt));
    if (k === 'testPng') b64 = canvasB64(testCanvas(group, week, settings, `${meta.name} — №${week.testNo} ${week.testType} (${week.number}-апта)`));
    if (k === 'pptx') b64 = await buildPptx(group, week, meta, settings);
    const r = await saveFile(meta.id, names[k], b64);
    out.push({ kind: k, name: names[k], path: r.path });
  }
  return out;
}

export { canvasB64, round2 };
