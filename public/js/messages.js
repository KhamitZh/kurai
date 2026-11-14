// Ата-аналарға жіберілетін мәтін
import { missingTasks, taskTitle } from './calc.js';

const SUBJECT_ABL = { math: 'математикадан', info: 'информатикадан' };

function forms(gender) {
  return gender === 'f'
    ? { 'Балаңыз': 'Қызыңыз', 'Балаңыздың': 'Қызыңыздың', 'Балаңызға': 'Қызыңызға' }
    : { 'Балаңыз': 'Балаңыз', 'Балаңыздың': 'Балаңыздың', 'Балаңызға': 'Балаңызға' };
}

function fill(tpl, vars) {
  return String(tpl || '').replace(/\{([^{}]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export function buildMessage(entry, week, groupMeta, settings) {
  const M = settings.messages;
  const missing = missingTasks(entry.row, week);
  const scored = week.columns.filter((c) => c.kind !== 'bonus');
  const list = missing.map((c) => taskTitle(c, settings)).join(', ');
  const base = {
    ...forms(entry.st.gender),
    'аты': entry.st.name,
    'тегі': entry.st.surname,
    'пәннен': SUBJECT_ABL[groupMeta.subject] || 'пәннен',
    'тапсырмалар': list,
  };
  let reason = '';
  if (entry.zone === 'blue') {
    reason = missing.length ? fill(M.blueReason, base) : fill(M.blueAllDone, base);
  } else if (entry.zone === 'red') {
    if (missing.length && missing.length >= scored.length) reason = fill(M.redNone, base);
    else if (missing.length) reason = fill(M.redReason, base);
    else reason = fill(M.redAllDone, base);
  }
  const tpl = entry.zone === 'green' ? M.green : entry.zone === 'blue' ? M.blue : M.red;
  return fill(tpl, { ...base, 'себеп': reason }).replace(/\s{2,}/g, ' ').trim();
}

export function missingTitles(entry, week, settings) {
  return missingTasks(entry.row, week).map((c) => taskTitle(c, settings));
}
