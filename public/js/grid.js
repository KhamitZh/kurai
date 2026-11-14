// Жалпы рейтинг кестесі: Excel сияқты енгізу, тірі есептеу, автоматты сұрыптау
import { h, fmt, fmtPct, parseNum, icon, confirmBox } from './util.js';
import { evaluate, weekMax, autoMax, rowTotal, zoneOf } from './calc.js';

const MEDAL = ['🥇', '🥈', '🥉'];
const LS_KEY = 'nnn-autosort';

function autoSortOn() { try { return localStorage.getItem(LS_KEY) !== '0'; } catch (_) { return true; } }
function setAutoSort(v) { try { localStorage.setItem(LS_KEY, v ? '1' : '0'); } catch (_) {} }

export function ratingGrid(ctx) {
  const { group, week, settings, save } = ctx;
  const th = settings.thresholds.rating;
  const cols = week.columns;
  const root = h('div', {});
  const rowsById = new Map(); // sid -> {tr, inputs, totalTd, pctTd}

  // ---- Статистика жолағы ----
  const statN = h('b'), statAvg = h('b'), statG = h('b'), statB = h('b'), statR = h('b');
  const maxInput = h('input', { type: 'text', inputmode: 'numeric', 'aria-label': 'Жалпы мүмкін балл' });
  const autoBtn = h('button', { class: 'auto', type: 'button' }, 'авто');
  const maxHint = h('span', {}, 'Жалпы балл');
  const statline = h('div', { class: 'statline' },
    h('div', { class: 'stat' }, h('span', {}, 'Оқушы саны'), statN),
    h('div', { class: 'stat' }, h('span', {}, 'Орташа пайыз'), statAvg),
    h('div', { class: 'stat zone-g' }, h('span', {}, 'Жасыл', h('span', { class: 'thr' }, ` · ${th.green}%+`)), statG),
    h('div', { class: 'stat zone-b' }, h('span', {}, 'Көк', h('span', { class: 'thr' }, ` · ${th.blue}–${th.green}%`)), statB),
    h('div', { class: 'stat zone-r' }, h('span', {}, 'Қызыл', h('span', { class: 'thr' }, ` · ${th.blue}%-дан төмен`)), statR),
    h('div', { class: 'stat max' }, h('div', {}, maxHint, h('br'), autoBtn), maxInput),
  );
  maxInput.addEventListener('change', () => {
    const v = parseNum(maxInput.value);
    week.maxOverride = v && v > 0 ? v : null;
    save(); refreshAll(); resort();
  });
  autoBtn.addEventListener('click', () => { week.maxOverride = null; save(); refreshAll(); resort(); });

  // ---- Кесте ----
  const thead = h('thead', {}, h('tr', {},
    h('th', { class: 'sticky-l c-rank' }, '№'),
    h('th', { class: 'sticky-l c-sur' }, 'Тегі'),
    h('th', { class: 'sticky-l c-name' }, 'Аты'),
    cols.map((c) => h('th', { class: c.kind === 'test' ? 'test-col' : '' }, c.label,
      h('small', {}, c.kind === 'bonus' ? 'максқа кірмейді' : `макс ${c.max}`))),
    h('th', {}, 'Жалпы'),
    h('th', {}, 'Пайыз'),
    h('th', {}, 'Ескерту'),
    h('th', {}, h('span', { class: 'sr-only' }, 'Әрекет')),
  ));
  const tbody = h('tbody');
  const footCells = cols.map(() => h('td'));
  const footTotal = h('td'), footPct = h('td');
  const tfoot = h('tfoot', {}, h('tr', {},
    h('td', { class: 'sticky-l c-rank' }, ''),
    h('td', { class: 'sticky-l c-sur', style: { textAlign: 'left', paddingLeft: '12px' } }, 'Орта балл'),
    h('td', { class: 'sticky-l c-name' }, ''),
    footCells, footTotal, footPct, h('td'), h('td'),
  ));
  const table = h('table', { class: 'sheet' }, thead, tbody, tfoot);
  const wrap = h('div', { class: 'sheet-wrap' }, table);

  function buildRow(e) {
    const inputs = cols.map((c) => {
      const v = e.row.scores[c.id];
      const inp = h('input', {
        class: 'cell', type: 'text', inputmode: 'decimal', autocomplete: 'off',
        'aria-label': `${e.st.surname} ${e.st.name}, ${c.label}`,
        value: v == null ? '' : String(v).replace('.', ','),
      });
      inp.dataset.col = c.id;
      inp.addEventListener('input', () => onInput(e.row, c, inp));
      inp.addEventListener('change', () => resort());
      inp.addEventListener('keydown', (ev) => onKey(ev, e.row.sid, c.id, inp));
      inp.addEventListener('focus', () => inp.select());
      markCell(inp, v, c);
      return inp;
    });
    const note = h('input', { class: 'cell note', type: 'text', value: e.row.note || '', placeholder: 'себебі…', 'aria-label': 'Ескерту' });
    note.addEventListener('input', () => { e.row.note = note.value; save(); });
    const totalTd = h('td', { class: 'total' });
    const bar = h('i'); const pctB = h('b');
    const pctTd = h('td', { class: 'pct' }, h('div', { class: 'meter' },
      h('div', { class: 'bar' }, bar, h('span', { class: 'tick', style: { left: th.blue + '%' } }), h('span', { class: 'tick', style: { left: th.green + '%' } })),
      pctB));
    const rankTd = h('td', { class: 'sticky-l c-rank' });
    const del = h('button', {
      class: 'btn icon ghost row-tools', title: 'Осы аптадан алып тастау', 'aria-label': 'Осы аптадан алып тастау',
      onclick: async () => {
        if (!(await confirmBox('Оқушыны аптадан алып тастау', `${e.st.surname} ${e.st.name} осы аптаның рейтингінен алынады. Баллдары өшіріледі.`, 'Алып тастау', true))) return;
        week.rows = week.rows.filter((r) => r.sid !== e.row.sid);
        save(); ctx.rerender();
      },
    }, icon('trash', 16));
    const tr = h('tr', {},
      rankTd,
      h('td', { class: 'sticky-l c-sur' }, e.st.surname),
      h('td', { class: 'sticky-l c-name' }, e.st.name),
      inputs.map((i) => h('td', {}, i)),
      totalTd, pctTd, h('td', {}, note), h('td', {}, del),
    );
    tr.dataset.sid = e.row.sid;
    rowsById.set(e.row.sid, { tr, inputs, totalTd, bar, pctB, rankTd, row: e.row });
    return tr;
  }

  function markCell(inp, v, c) {
    inp.classList.toggle('over', typeof v === 'number' ? (c.kind !== 'bonus' && v > c.max) : false);
    inp.classList.toggle('zero', v === 0 && c.kind !== 'bonus');
  }

  function onInput(row, c, inp) {
    const v = parseNum(inp.value);
    if (Number.isNaN(v) || (v != null && v < 0)) { inp.classList.add('over'); return; }
    if (v == null) delete row.scores[c.id]; else row.scores[c.id] = v;
    markCell(inp, v, c);
    refreshRow(row.sid);
    refreshTotals();
    save();
  }

  function refreshRow(sid) {
    const R = rowsById.get(sid);
    if (!R) return;
    const max = weekMax(week);
    const total = rowTotal(R.row, week);
    const pct = max > 0 ? (total / max) * 100 : null;
    const z = zoneOf(pct, th);
    R.tr.className = 'z-' + z;
    R.totalTd.textContent = fmt(total, 1);
    R.bar.style.width = Math.max(0, Math.min(100, pct || 0)) + '%';
    R.pctB.textContent = fmtPct(pct);
  }

  function refreshTotals() {
    const ev = evaluate(group, week, settings);
    const n = ev.list.length;
    const c = { green: 0, blue: 0, red: 0 };
    ev.list.forEach((e) => { if (c[e.zone] != null) c[e.zone]++; });
    statN.textContent = n;
    const avgTotal = n ? ev.list.reduce((s, e) => s + e.total, 0) / n : 0;
    statAvg.textContent = fmtPct(ev.max ? (avgTotal / ev.max) * 100 : null);
    statG.textContent = c.green; statB.textContent = c.blue; statR.textContent = c.red;
    if (document.activeElement !== maxInput) maxInput.value = String(weekMax(week));
    autoBtn.style.visibility = week.maxOverride ? 'visible' : 'hidden';
    maxHint.textContent = week.maxOverride ? `Жалпы балл (авто: ${autoMax(week)})` : 'Жалпы балл';
    cols.forEach((col, i) => {
      footCells[i].textContent = n ? fmt(ev.list.reduce((s, e) => s + (e.row.scores[col.id] ?? 0), 0) / n, 1) : '—';
    });
    footTotal.textContent = fmt(avgTotal, 1);
    footPct.textContent = fmtPct(ev.max ? (avgTotal / ev.max) * 100 : null);
  }

  function refreshAll() { for (const sid of rowsById.keys()) refreshRow(sid); refreshTotals(); }

  function updateRanks(order) {
    order.forEach((e, i) => {
      const R = rowsById.get(e.row.sid);
      R.rankTd.textContent = '';
      R.rankTd.append(i < 3 && e.total > 0 ? h('span', { class: 'medal', title: `${i + 1}-орын` }, MEDAL[i]) : String(i + 1));
    });
  }

  // Сұрыптау + FLIP анимациясы
  function resort(force = false) {
    const order = evaluate(group, week, settings).byRating;
    if (!autoSortOn() && !force) { updateRanks(currentOrder()); return; }
    const before = new Map();
    for (const [sid, R] of rowsById) before.set(sid, R.tr.getBoundingClientRect().top);
    const ae = document.activeElement;
    const selStart = ae && ae.selectionStart, selEnd = ae && ae.selectionEnd;
    order.forEach((e) => tbody.appendChild(rowsById.get(e.row.sid).tr));
    if (ae && document.activeElement !== ae && document.contains(ae)) {
      ae.focus({ preventScroll: true });
      try { ae.setSelectionRange(selStart, selEnd); } catch (_) {}
    }
    updateRanks(order);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const [sid, R] of rowsById) {
      const dy = before.get(sid) - R.tr.getBoundingClientRect().top;
      if (!dy) continue;
      R.tr.style.transition = 'none';
      R.tr.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        R.tr.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1), background-color .35s ease';
        R.tr.style.transform = '';
      });
    }
  }

  function currentOrder() {
    const ev = evaluate(group, week, settings);
    const map = new Map(ev.byRating.map((e) => [e.row.sid, e]));
    const ordered = [...tbody.children].map((tr) => map.get(tr.dataset.sid)).filter(Boolean);
    return ordered;
  }

  // Пернетақта: Enter/↓ — төмен, ↑ — жоғары, ←/→ — көрші баған
  function onKey(ev, sid, colId, inp) {
    const trs = [...tbody.children];
    const idx = trs.findIndex((t) => t.dataset.sid === sid);
    const go = (targetSid, cid) => {
      resort();
      const R = rowsById.get(targetSid);
      const t = R && R.inputs.find((i) => i.dataset.col === cid);
      if (t) { t.focus(); t.scrollIntoView({ block: 'nearest' }); }
    };
    if (ev.key === 'Enter' || ev.key === 'ArrowDown') {
      ev.preventDefault();
      const next = trs[ev.shiftKey && ev.key === 'Enter' ? idx - 1 : idx + 1];
      if (next) go(next.dataset.sid, colId); else resort();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      const prev = trs[idx - 1];
      if (prev) go(prev.dataset.sid, colId);
    } else if (ev.key === 'ArrowRight' && inp.selectionStart === inp.value.length && inp.selectionEnd === inp.value.length) {
      const R = rowsById.get(sid); const j = R.inputs.indexOf(inp);
      if (R.inputs[j + 1]) { ev.preventDefault(); R.inputs[j + 1].focus(); }
    } else if (ev.key === 'ArrowLeft' && inp.selectionStart === 0 && inp.selectionEnd === 0) {
      const R = rowsById.get(sid); const j = R.inputs.indexOf(inp);
      if (R.inputs[j - 1]) { ev.preventDefault(); R.inputs[j - 1].focus(); }
    }
  }

  // ---- Алғашқы салу ----
  const ev0 = evaluate(group, week, settings);
  const initial = autoSortOn() ? ev0.byRating : ev0.list;
  initial.forEach((e) => tbody.appendChild(buildRow(e)));
  refreshAll();
  updateRanks(initial);

  const sortToggle = h('label', { class: 'check' }, h('input', {
    type: 'checkbox', checked: autoSortOn(),
    onchange: (e) => { setAutoSort(e.target.checked); if (e.target.checked) resort(true); },
  }), 'Балл енгізгенде автоматты сұрыптау');

  const legend = h('div', { class: 'legend' },
    h('span', {}, h('i', { style: { background: 'var(--z-green)' } }), `Жасыл — ${th.green}–100%`),
    h('span', {}, h('i', { style: { background: 'var(--z-blue)' } }), `Көк — ${th.blue}–${th.green}%`),
    h('span', {}, h('i', { style: { background: 'var(--z-red)' } }), `Қызыл — 0–${th.blue}%`),
    h('span', { class: 'hint' }, 'Enter — келесі оқушы, ↑↓←→ — жылжу. Бос ұяшық = орындамаған (0).'),
    h('span', { style: { marginLeft: 'auto' } }, sortToggle),
  );

  root.append(statline, wrap, legend);
  return root;
}
