// Рейтинг есептеулері
import { uid, toDM, parseDM, addDays } from './util.js';

export const ZONE_LABEL = { green: 'Жасыл', blue: 'Көк', red: 'Қызыл', none: '—' };

// 4, 8, 12... апталар — АТ, қалғаны — АБС
export function testTypeFor(weekNo) { return weekNo % 4 === 0 ? 'АТ' : 'АБС'; }
export function testNoFor(weekNo) {
  return weekNo % 4 === 0 ? weekNo / 4 : weekNo - Math.floor(weekNo / 4);
}

export function sortedWeeks(group) { return [...group.weeks].sort((a, b) => a.number - b.number); }
export function latestWeek(group) { const w = sortedWeeks(group); return w[w.length - 1] || null; }
export function prevWeek(group, week) {
  return sortedWeeks(group).filter((w) => w.number < week.number).pop() || null;
}
export function prevSameTest(group, week) {
  return sortedWeeks(group).filter((w) => w.number < week.number && w.testType === week.testType).pop() || null;
}

// Жаңа аптаның ұсынылатын параметрлері
export function suggestWeek(group) {
  const last = latestWeek(group);
  const number = last ? last.number + 1 : 1;
  const per = group.template.lessonsPerWeek || 2;
  let lessons;
  if (last && last.lessons && last.lessons.length) {
    const top = Math.max(...last.lessons);
    lessons = Array.from({ length: per }, (_, i) => top + 1 + i);
  } else {
    lessons = Array.from({ length: per }, (_, i) => (number - 1) * per + 1 + i);
  }
  let from;
  if (last && last.dateTo) from = parseDM(last.dateTo) || new Date();
  else from = new Date();
  const to = addDays(from, 7);
  const testType = testTypeFor(number);
  // Нөмірленетін қосымша бағандар (ФД, ФС): алдыңғы нөмір + 1
  const extraNos = {};
  for (const ex of group.template.extras) {
    if (!ex.numbered) continue;
    const prev = last && last.columns.find((c) => c.code === ex.code && c.kind === 'extra');
    extraNos[ex.id] = prev && prev.no ? prev.no + 1 : 1;
  }
  return {
    number, lessons, dateFrom: toDM(from), dateTo: toDM(to), testType, testNo: testNoFor(number),
    testMax: testType === 'АТ' ? group.template.atMax : group.template.absMax, extraNos,
  };
}

export function buildColumns(group, p) {
  const cols = [];
  for (const l of p.lessons) {
    for (const t of group.template.lessonTasks) {
      cols.push({ id: uid(), kind: 'task', code: t.code, lesson: l, label: `№${l} ${t.code}`, max: Number(t.max) || 0 });
    }
  }
  for (const ex of group.template.extras) {
    if (!p.extrasOn[ex.id]) continue;
    const no = ex.numbered ? p.extraNos[ex.id] : null;
    cols.push({ id: uid(), kind: 'extra', code: ex.code, no, label: no ? `№${no} ${ex.code}` : ex.code, max: Number(ex.max) || 0 });
  }
  cols.push({ id: uid(), kind: 'test', code: p.testType, no: p.testNo, label: `№${p.testNo} ${p.testType}`, max: Number(p.testMax) || 0 });
  cols.push({ id: uid(), kind: 'bonus', code: 'БОНУС', label: 'БОНУС', max: 0 });
  return cols;
}

export function createWeek(group, p) {
  const columns = buildColumns(group, p);
  const active = group.students.filter((s) => s.active !== false);
  return {
    id: uid(),
    number: p.number,
    dateFrom: p.dateFrom,
    dateTo: p.dateTo,
    lessons: p.lessons,
    testType: p.testType,
    testNo: p.testNo,
    columns,
    maxOverride: null,
    rows: active.map((s) => ({ sid: s.id, scores: {}, note: '', testNote: '', pp: null, ppNote: '', sent: false })),
    report: {},
    createdAt: new Date().toISOString(),
  };
}

export const testCol = (week) => week.columns.find((c) => c.kind === 'test');
export const autoMax = (week) => week.columns.reduce((s, c) => s + (c.kind === 'bonus' ? 0 : Number(c.max) || 0), 0);
export const weekMax = (week) => (week.maxOverride != null && week.maxOverride > 0 ? week.maxOverride : autoMax(week));

export function rowTotal(row, week) {
  let t = 0;
  for (const c of week.columns) { const v = row.scores[c.id]; if (typeof v === 'number') t += v; }
  return t;
}

export function zoneOf(pct, th) {
  if (pct == null || !isFinite(pct)) return 'none';
  if (pct >= th.green) return 'green';
  if (pct >= th.blue) return 'blue';
  return 'red';
}

export function studentName(group, sid) {
  const s = group.students.find((x) => x.id === sid);
  return s || { id: sid, surname: '?', name: '?', gender: 'm' };
}

// Әр оқушының толық есебі
export function evaluate(group, week, settings) {
  const max = weekMax(week);
  const tc = testCol(week);
  const tmax = tc ? Number(tc.max) || 0 : 0;
  const th = settings.thresholds;
  const list = week.rows.map((row) => {
    const st = studentName(group, row.sid);
    const total = rowTotal(row, week);
    const pct = max > 0 ? (total / max) * 100 : null;
    const test = tc ? row.scores[tc.id] : null;
    const hasTest = typeof test === 'number';
    const testPct = hasTest && tmax > 0 ? (test / tmax) * 100 : null;
    const pp = typeof row.pp === 'number' ? row.pp : null;
    const ppPct = pp != null && tmax > 0 ? (pp / tmax) * 100 : null;
    return {
      row, st, total, pct,
      zone: zoneOf(pct, th.rating),
      test: hasTest ? test : null,
      testPct,
      testZone: hasTest ? zoneOf(testPct, th.test) : 'none',
      absent: !hasTest,
      pp, ppPct, ppZone: pp != null ? zoneOf(ppPct, th.test) : 'none',
    };
  });
  const byRating = [...list].sort((a, b) =>
    b.total - a.total || (b.test ?? -1) - (a.test ?? -1) || a.st.surname.localeCompare(b.st.surname, 'kk'));
  byRating.forEach((e, i) => { e.rank = i + 1; });
  return { list, byRating, max, tc, tmax };
}

export function weekStats(group, week, settings) {
  const ev = evaluate(group, week, settings);
  const n = ev.list.length;
  const count = { green: 0, blue: 0, red: 0 };
  ev.list.forEach((e) => { if (count[e.zone] != null) count[e.zone]++; });
  const avgTotal = n ? ev.list.reduce((s, e) => s + e.total, 0) / n : null;
  const avgPct = n && ev.max ? (avgTotal / ev.max) * 100 : null;
  const attended = ev.list.filter((e) => !e.absent);
  const testAvg = attended.length ? attended.reduce((s, e) => s + e.test, 0) / attended.length : null;
  const attendPct = n ? (attended.length / n) * 100 : null;
  const tcount = { green: 0, blue: 0, red: 0 };
  attended.forEach((e) => { tcount[e.testZone]++; });
  const ppList = ev.list.filter((e) => e.testZone === 'red' || e.absent);
  const ppDone = ev.list.filter((e) => e.pp != null).length;
  return { ev, n, count, avgTotal, avgPct, attended: attended.length, attendPct, testAvg, tcount, ppList, ppDone };
}

// Тапсырманың ата-анаға түсінікті атауы
export function taskTitle(col, settings) {
  const names = settings.taskNames || {};
  const full = names[col.code] || col.code;
  if (col.kind === 'task') return `№${col.lesson} ${full}`;
  if (col.no) return `№${col.no} ${full}`;
  return full;
}

// Орындалмаған тапсырмалар (0 не бос)
export function missingTasks(row, week) {
  return week.columns.filter((c) => c.kind !== 'bonus' && (row.scores[c.id] == null || row.scores[c.id] === 0));
}
