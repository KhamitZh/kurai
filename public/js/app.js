// NNN Куратор — негізгі қосымша
import { h, icon, uid, fmt, fmtPct, parseNum, toast, modal, confirmBox, copyText } from './util.js';
import {
  store, loadSettings, loadGroup, saveGroup, saveSettings, saveSettingsNow, openFolder, saveAppSettings, pickFolder,
  defaultTemplate, DEFAULT_MESSAGES, DEFAULT_TASK_NAMES,
} from './store.js';
import {
  sortedWeeks, suggestWeek, createWeek, buildColumns, weekStats, evaluate, testCol, ZONE_LABEL,
} from './calc.js';
import { ratingGrid } from './grid.js';
import { buildMessage, missingTitles } from './messages.js';
import { exportAll, fileNames, resolveReport, reportDefaults, conv, ratingCanvas } from './exports.js';

const side = document.getElementById('side');
const main = document.getElementById('main');
const SUBJECT = { math: 'Математика', info: 'Информатика' };

const metaOf = (id) => store.settings.groups.find((g) => g.id === id);
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

// ======================= Бүйір панель =======================
function renderSide(activeGroup) {
  side.innerHTML = '';
  const saveEl = h('div', { class: 'save-state' }, h('i'), h('span', {}, 'Сақталды'));
  const upd = (s) => {
    saveEl.className = 'save-state ' + (s === 'ok' ? '' : s);
    saveEl.lastChild.textContent = s === 'saving' ? 'Сақталуда…' : s === 'error' ? 'Сақталмады' : 'Барлығы сақталды';
  };
  store.listeners.clear(); store.listeners.add(upd); upd(store.saveState);

  const mobileDot = h('i', { class: 'm-dot ' + (store.saveState === 'ok' ? '' : store.saveState), title: 'Сақталу күйі' });
  store.listeners.add((s) => { mobileDot.className = 'm-dot ' + (s === 'ok' ? '' : s); });
  side.append(...[
    h('div', { class: 'brand-row' },
      h('a', { class: 'brand', href: '#/' },
        h('div', { class: 'brand-mark' }, h('img', { src: '/assets/logo-mark-blue.png', width: 30, height: 26, alt: 'NN Online' })),
        h('div', {}, h('div', { class: 'brand-name' }, 'NNN Куратор'), h('div', { class: 'brand-sub' }, 'Апталық рейтинг'))),
      h('div', { class: 'side-mobile-tools' }, mobileDot,
        h('a', { class: 'btn icon ghost', href: '#/settings', 'aria-label': 'Баптаулар' }, icon('settings', 20)))),
    h('div', { class: 'side-title' }, 'Топтар'),
    h('nav', { class: 'side-groups', 'aria-label': 'Топтар' },
      store.settings.groups.map((g) => h('a', {
        class: 'side-link' + (g.id === activeGroup ? ' active' : ''), href: `#/g/${g.id}`,
      }, h('span', { class: 'dot' + (g.subject === 'info' ? ' info' : '') }), g.name)),
      h('button', { class: 'side-link add', onclick: newGroupDialog }, icon('plus', 16), 'Жаңа топ')),
    h('div', { class: 'side-foot' },
      h('a', { class: 'side-link', href: '#/settings' }, icon('settings', 17), 'Баптаулар'),
      saveEl),
  ].flat());
}

// ======================= Маршруттау =======================
async function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  try {
    if (!store.configured) return setupView();
    document.body.classList.remove('setup');
    if (parts[0] === 'g' && parts[1]) {
      const meta = metaOf(parts[1]);
      if (!meta) return go('#/');
      const group = await loadGroup(meta.id);
      renderSide(meta.id);
      if (parts[2] === 'w' && parts[3]) {
        const week = group.weeks.find((w) => w.id === parts[3]);
        if (!week) return go(`#/g/${meta.id}`);
        return weekView(meta, group, week, parts[4] || 'rating');
      }
      return groupView(meta, group, parts[2] || 'weeks');
    }
    renderSide(null);
    if (parts[0] === 'settings') return settingsView();
    return homeView();
  } catch (e) {
    console.error(e);
    main.innerHTML = '';
    main.append(h('div', { class: 'empty' }, h('h3', {}, 'Деректер жүктелмеді'), h('p', {}, e.message),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Қайта жүктеу')));
  }
}
window.addEventListener('hashchange', render);

// ======================= Басты бет =======================
async function homeView() {
  main.innerHTML = '';
  const groups = store.settings.groups;
  main.append(h('div', { class: 'page-head' },
    h('div', {}, h('h1', { class: 'title' }, 'Сәлем, куратор!'),
      h('div', { class: 'meta' }, 'Топты таңдап, апталық рейтингті толтырыңыз.')),
    h('div', { class: 'head-actions' }, h('button', { class: 'btn primary', onclick: newGroupDialog }, icon('plus'), 'Жаңа топ ашу'))));

  if (!groups.length) {
    main.append(h('div', { class: 'empty' },
      h('h3', {}, 'Әзірге топ жоқ'),
      h('p', {}, 'Алдымен топ ашыңыз (мысалы, МАТ 4-ЛЕК), сосын оған оқушыларды енгізесіз.'),
      h('button', { class: 'btn primary lg', onclick: newGroupDialog }, icon('plus'), 'Бірінші топты ашу')));
    return;
  }
  const grid = h('div', { class: 'groups' });
  main.append(grid);
  for (const g of groups) {
    const data = await loadGroup(g.id).catch(() => null);
    const weeks = data ? sortedWeeks(data) : [];
    const last = weeks[weeks.length - 1];
    const st = last ? weekStats(data, last, store.settings) : null;
    grid.append(h('a', { class: 'gcard', href: `#/g/${g.id}` },
      h('div', { class: 'subject' }, SUBJECT[g.subject]),
      h('div', { class: 'gname' }, g.name),
      h('div', { class: 'gstats' },
        h('div', {}, h('b', {}, data ? data.students.filter((s) => s.active !== false).length : '—'), h('span', {}, 'оқушы')),
        h('div', {}, h('b', {}, last ? `${last.number}` : '—'), h('span', {}, 'соңғы апта')),
        h('div', {}, h('b', {}, st ? fmtPct(st.avgPct, 1) : '—'), h('span', {}, 'орташа')))));
  }
}

// ======================= Папка өрісі =======================
// Өрісті не «Таңдау» батырмасын басқанда Windows Проводник ашылады,
// таңдалған папка бірден өрісте көрінеді. Қажет болса жолды қолмен де жазуға болады.
const cleanPath = (v) => String(v || '').trim().replace(/^["'«“]+|["'»”]+$/g, '').trim();
function folderField({ value = '', onPick } = {}) {
  const local = store.app.isLocal !== false;
  const input = h('input', {
    class: 'input folder-input', value, readonly: true, spellcheck: false, title: value,
    placeholder: local ? 'Басып, папканы таңдаңыз' : 'Папканы компьютерден таңдаңыз',
    'aria-label': 'Папка',
  });
  const btnLabel = h('span', {}, 'Таңдау');
  const btn = h('button', { type: 'button', class: 'btn' }, icon('folder'), btnLabel);
  const manual = h('button', { type: 'button', class: 'link-btn' }, 'Жолды қолмен жазу');
  let busy = false;
  const showEnd = () => requestAnimationFrame(() => { input.scrollLeft = input.scrollWidth; });
  const set = (v) => { input.value = v; input.title = v; showEnd(); };
  setTimeout(showEnd, 60);
  const pick = async () => {
    if (!local || busy || !input.readOnly) return;
    busy = true; btn.disabled = true; btnLabel.textContent = 'Терезе ашық…';
    try {
      const p = await pickFolder(cleanPath(input.value));
      if (p) {
        set(p);
        input.classList.remove('picked'); void input.offsetWidth; input.classList.add('picked');
        onPick && onPick(p);
      }
    } catch (e) { toast(e.message, 'err'); } finally {
      busy = false; btn.disabled = false; btnLabel.textContent = 'Таңдау';
    }
  };
  input.addEventListener('click', pick);
  input.addEventListener('keydown', (e) => { if (input.readOnly && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(); } });
  btn.addEventListener('click', pick);
  manual.addEventListener('click', () => {
    input.readOnly = false; input.placeholder = 'Мысалы: D:\\NNN'; input.focus(); input.select(); manual.remove();
  });
  input.addEventListener('change', () => { set(cleanPath(input.value)); onPick && onPick(input.value); });
  const el = h('div', { class: 'folder-field' }, h('div', { class: 'inline-field' }, input, local ? btn : null), local ? manual : null);
  return { el, input, get value() { return cleanPath(input.value); }, set value(v) { set(v); } };
}

// ======================= Жаңа топ =======================
function newGroupDialog() {
  let subject = 'math';
  const name = h('input', { class: 'input', placeholder: 'Мысалы: ИНФО 2-ЛЕК' });
  const code = h('input', { class: 'input', placeholder: 'ИНФО-2' });
  let codeTouched = false, folderTouched = false, subjectTouched = false;
  const folder = folderField({ onPick: () => { folderTouched = true; } });
  const suggest = () => {
    if (!subjectTouched) {
      const guess = /инфо/i.test(name.value) ? 'info' : /мат/i.test(name.value) ? 'math' : null;
      if (guess && guess !== subject) { subject = guess; segBtns.forEach((b) => b.classList.toggle('on', b.textContent === SUBJECT[guess])); }
    }
    const num =(name.value.match(/\d+/) || [''])[0];
    const short = subject === 'info' ? 'ИНФО' : 'МАТ';
    const c = num ? `${short}-${num}` : short;
    if (!codeTouched) code.value = c;
    if (!folderTouched) folder.value = `${store.dataRoot}\\РТ-${subject === 'math' ? 'МАТ' : c}`;
  };
  name.addEventListener('input', suggest);
  code.addEventListener('input', () => { codeTouched = true; });
  const seg = h('div', { class: 'seg' });
  const segBtns = Object.entries(SUBJECT).map(([k, v]) => h('button', {
    type: 'button', class: k === subject ? 'on' : '',
    onclick: () => { subject = k; subjectTouched = true; segBtns.forEach((b) => b.classList.toggle('on', b.textContent === v)); suggest(); },
  }, v));
  seg.append(...segBtns);
  suggest();
  const m = modal({
    title: 'Жаңа топ ашу',
    body: [
      h('label', { class: 'field' }, h('span', {}, 'Топтың аты'), name),
      h('div', { class: 'field' }, h('span', {}, 'Пәні'), seg, h('small', {}, 'Ата-ана мәтінінде «математикадан» не «информатикадан» деп жазылады.')),
      h('label', { class: 'field' }, h('span', {}, 'Файл коды'), code, h('small', {}, 'Файл аты: РТ_8_АПТА_<код>.xlsx')),
      h('div', { class: 'field' }, h('span', {}, 'Сақталатын папка'), folder.el, h('small', {}, 'Excel, сурет, отчет пен деректер осында сақталады. Папка жоқ болса, өзі ашылады.')),
    ],
    foot: [
      h('button', { class: 'btn', onclick: () => m.close() }, 'Бас тарту'),
      h('button', {
        class: 'btn primary', onclick: async () => {
          if (!name.value.trim()) { name.focus(); return toast('Топтың атын жазыңыз', 'err'); }
          if (!folder.value) { folder.input.focus(); return toast('Папканы таңдаңыз', 'err'); }
          const g = { id: uid(), name: name.value.trim(), subject, code: (code.value.trim() || name.value.trim()).replace(/\s+/g, '-'), folder: folder.value };
          store.settings.groups.push(g);
          try {
            await saveSettingsNow();
            const data = await loadGroup(g.id);
            if (!data.students.length && !data.weeks.length) data.template = defaultTemplate(subject);
            saveGroup(g.id);
            m.close();
            toast(`«${g.name}» тобы ашылды. Енді оқушыларды енгізіңіз.`, 'ok');
            go(`#/g/${g.id}/students`);
          } catch (e) {
            store.settings.groups = store.settings.groups.filter((x) => x.id !== g.id);
            toast('Топ ашылмады: ' + e.message, 'err');
          }
        },
      }, 'Топты ашу'),
    ],
  });
}

// ======================= Топ беті =======================
function groupHeader(meta, group, tab) {
  const tabs = [['weeks', 'Апталар', group.weeks.length], ['students', 'Оқушылар', group.students.filter((s) => s.active !== false).length], ['setup', 'Шаблон және баптау']];
  return [
    h('div', { class: 'page-head' },
      h('div', {},
        h('div', { class: 'crumbs' }, h('a', { href: '#/' }, 'Топтар'), ' / ', SUBJECT[meta.subject]),
        h('h1', { class: 'title' }, meta.name)),
      h('div', { class: 'head-actions' },
        h('button', { class: 'btn', onclick: () => openFolder(meta.id).catch((e) => toast(e.message, 'err')) }, icon('folder'), 'Папканы ашу'),
        h('button', { class: 'btn primary', onclick: () => newWeekDialog(meta, group) }, icon('plus'), 'Жаңа апта ашу'))),
    h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, label, count]) =>
      h('button', { class: 'tab' + (k === tab ? ' on' : ''), role: 'tab', 'aria-selected': k === tab, onclick: () => go(`#/g/${meta.id}${k === 'weeks' ? '' : '/' + k}`) },
        label, count != null ? h('span', { class: 'count' }, count) : null))),
  ];
}

function groupView(meta, group, tab) {
  main.innerHTML = '';
  main.append(...groupHeader(meta, group, tab));
  if (tab === 'students') return main.append(studentsPanel(meta, group));
  if (tab === 'setup') return main.append(setupPanel(meta, group));

  const weeks = sortedWeeks(group).reverse();
  if (!weeks.length) {
    main.append(h('div', { class: 'empty' },
      h('h3', {}, 'Апта әлі ашылмаған'),
      group.students.length
        ? h('p', {}, 'Жаңа апта ашсаңыз, оқушылар тізімі мен тапсырма бағандары дайын тұрады — тек баллдарды енгізесіз.')
        : h('p', {}, 'Алдымен «Оқушылар» бетінде топтың тізімін енгізіңіз, сосын апта ашыңыз.'),
      group.students.length
        ? h('button', { class: 'btn primary lg', onclick: () => newWeekDialog(meta, group) }, icon('plus'), 'Бірінші аптаны ашу')
        : h('button', { class: 'btn primary lg', onclick: () => go(`#/g/${meta.id}/students`) }, icon('users'), 'Оқушыларды енгізу')));
    return;
  }
  const grid = h('div', { class: 'weeks' });
  for (const w of weeks) {
    const st = weekStats(group, w, store.settings);
    const n = st.n || 1;
    grid.append(h('button', { class: 'wcard', onclick: () => go(`#/g/${meta.id}/w/${w.id}`) },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } },
        h('span', { class: 'wnum' }, `${w.number}-апта`),
        h('span', { class: 'badge ' + (w.testType === 'АТ' ? 'at' : 'abs') }, `№${w.testNo} ${w.testType}`)),
      h('div', { class: 'wdate' }, `${w.dateFrom} — ${w.dateTo} · сабақтар №${w.lessons.join(', №')}`),
      h('div', { class: 'distbar', title: `Жасыл ${st.count.green}, көк ${st.count.blue}, қызыл ${st.count.red}` },
        h('i', { class: 'g', style: { width: (st.count.green / n) * 100 + '%' } }),
        h('i', { class: 'b', style: { width: (st.count.blue / n) * 100 + '%' } }),
        h('i', { class: 'r', style: { width: (st.count.red / n) * 100 + '%' } })),
      h('div', { class: 'wavg' }, 'Орташа: ', h('b', {}, fmtPct(st.avgPct)), ` · ${st.count.green} / ${st.count.blue} / ${st.count.red}`)));
  }
  main.append(grid);
}

// ---------------- Оқушылар ----------------
function studentsPanel(meta, group) {
  const wrap = h('div', {});
  const save = () => saveGroup(meta.id);
  const latest = sortedWeeks(group).pop();

  const addToLatest = (s) => {
    if (latest && !latest.rows.some((r) => r.sid === s.id)) {
      latest.rows.push({ sid: s.id, scores: {}, note: '', testNote: '', pp: null, ppNote: '', sent: false });
      return true;
    }
    return false;
  };

  const sur = h('input', { class: 'input', placeholder: 'Тегі' });
  const nm = h('input', { class: 'input', placeholder: 'Аты' });
  const gender = h('select', { class: 'input', 'aria-label': 'Жынысы' }, h('option', { value: 'm' }, 'Ұл (Балаңыз)'), h('option', { value: 'f' }, 'Қыз (Қызыңыз)'));
  const add = () => {
    if (!sur.value.trim() || !nm.value.trim()) { (sur.value.trim() ? nm : sur).focus(); return; }
    const s = { id: uid(), surname: sur.value.trim(), name: nm.value.trim(), gender: gender.value, active: true };
    group.students.push(s);
    const added = addToLatest(s);
    save();
    toast(`${s.surname} ${s.name} қосылды${added ? ` (${latest.number}-аптаға да)` : ''}`, 'ok');
    sur.value = ''; nm.value = '';
    redraw(); sur.focus();
  };
  [sur, nm].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); }));

  const addPanel = h('div', { class: 'panel' },
    h('h2', { class: 'sub' }, 'Оқушы қосу'),
    h('div', { class: 'row', style: { alignItems: 'stretch' } },
      h('div', { style: { flex: '1 1 180px' } }, sur),
      h('div', { style: { flex: '1 1 160px' } }, nm),
      h('div', { style: { flex: '0 1 180px' } }, gender),
      h('button', { class: 'btn primary', onclick: add }, icon('plus'), 'Қосу'),
      h('button', { class: 'btn', onclick: bulk }, 'Тізіммен қосу (Excel-ден)')),
    h('p', { class: 'hint', style: { margin: '10px 0 0' } }, 'Жынысы ата-ана мәтіні үшін керек: ұлға «Балаңыз», қызға «Қызыңыз» деп жазылады.'));

  const listBox = h('div', { class: 'panel' });
  function redraw() {
    listBox.innerHTML = '';
    const cnt = document.querySelectorAll('.tabs .tab .count')[1];
    if (cnt) cnt.textContent = group.students.filter((s) => s.active !== false).length;
    const list = [...group.students].sort((a, b) => (b.active !== false) - (a.active !== false) || a.surname.localeCompare(b.surname, 'kk'));
    listBox.append(h('h2', { class: 'sub' }, `Тізім — ${list.filter((s) => s.active !== false).length} оқушы`));
    if (!list.length) { listBox.append(h('p', { class: 'hint' }, 'Тізім бос. Жоғарыда оқушы қосыңыз.')); return; }
    const tbody = h('tbody');
    list.forEach((s, i) => {
      const used = group.weeks.some((w) => w.rows.some((r) => r.sid === s.id));
      const inp = (key) => {
        const el = h('input', { class: 'input', value: s[key] });
        el.addEventListener('change', () => { s[key] = el.value.trim(); save(); });
        return el;
      };
      const g = h('select', { class: 'input' }, h('option', { value: 'm', selected: s.gender !== 'f' }, 'Ұл'), h('option', { value: 'f', selected: s.gender === 'f' }, 'Қыз'));
      g.addEventListener('change', () => { s.gender = g.value; save(); });
      const act = h('input', { type: 'checkbox', checked: s.active !== false });
      act.addEventListener('change', () => { s.active = act.checked; save(); redraw(); });
      tbody.append(h('tr', { class: s.active === false ? 'inactive' : '' },
        h('td', { style: { width: '44px', color: 'var(--ink-3)' } }, i + 1),
        h('td', {}, inp('surname')), h('td', {}, inp('name')), h('td', { style: { width: '110px' } }, g),
        h('td', { style: { width: '120px' } }, h('label', { class: 'check' }, act, 'Оқиды')),
        h('td', { style: { width: '52px' } }, h('button', {
          class: 'btn icon ghost', title: used ? 'Рейтингте бар — «Оқиды» белгісін алып тастаңыз' : 'Өшіру', 'aria-label': 'Өшіру', disabled: used,
          onclick: async () => {
            if (!(await confirmBox('Оқушыны өшіру', `${s.surname} ${s.name} тізімнен өшіріледі.`, 'Өшіру', true))) return;
            group.students = group.students.filter((x) => x.id !== s.id); save(); redraw();
          },
        }, icon('trash', 16)))));
    });
    listBox.append(h('table', { class: 'students' },
      h('thead', {}, h('tr', {}, h('th', {}, '№'), h('th', {}, 'Тегі'), h('th', {}, 'Аты'), h('th', {}, 'Жынысы'), h('th', {}, 'Күйі'), h('th'))),
      tbody),
      h('p', { class: 'hint', style: { marginBottom: 0 } }, 'Курстан шыққан оқушының «Оқиды» белгісін алып тастаңыз — ол жаңа апталарға кірмейді, бірақ ескі рейтингте қалады.'));
  }

  function bulk() {
    const ta = h('textarea', { class: 'input', rows: 12, placeholder: 'Қоңыратбай\tКәусар\nТолеу\tСания\n…' });
    const def = h('select', { class: 'input' }, h('option', { value: 'm' }, 'Ұл'), h('option', { value: 'f' }, 'Қыз'));
    const m = modal({
      title: 'Тізіммен қосу',
      body: [
        h('p', { class: 'hint', style: { margin: 0 } }, 'Excel-ден ТЕГІ мен АТЫ бағандарын көшіріп, осында қойыңыз. Әр жолда бір оқушы. Үшінші бағанға «қ» не «қыз» деп жазсаңыз — қыз болып белгіленеді.'),
        ta,
        h('label', { class: 'field' }, h('span', {}, 'Жынысы көрсетілмесе'), def),
      ],
      foot: [
        h('button', { class: 'btn', onclick: () => m.close() }, 'Бас тарту'),
        h('button', {
          class: 'btn primary', onclick: () => {
            let n = 0, toWeek = 0;
            ta.value.split(/\r?\n/).forEach((line) => {
              const p = line.split(/\t|;|,/).map((x) => x.trim()).filter(Boolean);
              const parts = p.length >= 2 ? p : line.trim().split(/\s+/);
              if (parts.length < 2) return;
              const [surname, name, g] = parts;
              const gender = g ? (/^қ/i.test(g) ? 'f' : 'm') : def.value;
              if (group.students.some((s) => s.surname === surname && s.name === name)) return;
              const s = { id: uid(), surname, name, gender, active: true };
              group.students.push(s); n++;
              if (addToLatest(s)) toWeek++;
            });
            save(); m.close(); redraw();
            toast(`${n} оқушы қосылды${toWeek ? ` (${toWeek} — соңғы аптаға да)` : ''}. Қыздарды тізімнен белгілеп шығыңыз.`, 'ok');
          },
        }, 'Қосу'),
      ],
    });
  }

  redraw();
  wrap.append(addPanel, listBox);
  return wrap;
}

// ---------------- Шаблон және баптау ----------------
function setupPanel(meta, group) {
  const t = group.template;
  const save = () => saveGroup(meta.id);
  const wrap = h('div', {});

  const field = (label, value, onchange, hint, attrs = {}) => {
    const i = h('input', { class: 'input', value, ...attrs });
    i.addEventListener('change', () => onchange(i.value));
    return h('label', { class: 'field' }, h('span', {}, label), i, hint ? h('small', {}, hint) : null);
  };

  wrap.append(h('div', { class: 'panel' },
    h('h2', { class: 'sub' }, 'Топ'),
    h('div', { class: 'grid-3' },
      field('Топтың аты', meta.name, (v) => { meta.name = v.trim() || meta.name; saveSettings(); renderSide(meta.id); }, 'Отчетта «МАТ 4-ЛЕК 8-АПТА» болып шығады'),
      field('Файл коды', meta.code, (v) => { meta.code = v.trim() || meta.code; saveSettings(); }, `Мысалы: РТ_8_АПТА_${meta.code}.xlsx`),
      h('div', { class: 'field' }, h('span', {}, 'Сақталатын папка'),
        folderField({ value: meta.folder, onPick: (v) => { if (v) { meta.folder = v; saveSettings(); toast('Топ папкасы өзгертілді', 'ok'); } } }).el,
        h('small', {}, 'Деректер файлы да осында тұрады'))),
  ));

  // Сабақ тапсырмалары
  const tasksBody = h('tbody');
  const drawTasks = () => {
    tasksBody.innerHTML = '';
    t.lessonTasks.forEach((task, i) => {
      const code = h('input', { class: 'input', value: task.code });
      code.addEventListener('change', () => { task.code = code.value.trim(); save(); });
      const max = h('input', { class: 'input', value: task.max, inputmode: 'numeric', style: { width: '90px' } });
      max.addEventListener('change', () => { task.max = parseNum(max.value) || 0; save(); });
      tasksBody.append(h('tr', {},
        h('td', {}, code),
        h('td', { class: 'hint' }, store.settings.taskNames[task.code] || '— Баптауларда толық атауын жазыңыз'),
        h('td', {}, max),
        h('td', {}, h('button', { class: 'btn icon ghost', 'aria-label': 'Өшіру', onclick: () => { t.lessonTasks.splice(i, 1); save(); drawTasks(); } }, icon('trash', 16)))));
    });
  };
  drawTasks();

  const exBody = h('tbody');
  const drawExtras = () => {
    exBody.innerHTML = '';
    t.extras.forEach((ex, i) => {
      const code = h('input', { class: 'input', value: ex.code });
      code.addEventListener('change', () => { ex.code = code.value.trim(); save(); });
      const max = h('input', { class: 'input', value: ex.max, inputmode: 'numeric', style: { width: '90px' } });
      max.addEventListener('change', () => { ex.max = parseNum(max.value) || 0; save(); });
      const num = h('input', { type: 'checkbox', checked: !!ex.numbered });
      num.addEventListener('change', () => { ex.numbered = num.checked; save(); });
      const on = h('input', { type: 'checkbox', checked: ex.on !== false });
      on.addEventListener('change', () => { ex.on = on.checked; save(); });
      exBody.append(h('tr', {},
        h('td', {}, code), h('td', {}, max),
        h('td', {}, h('label', { class: 'check' }, num, '№ қойылады')),
        h('td', {}, h('label', { class: 'check' }, on, 'Әдепкі бойынша бар')),
        h('td', {}, h('button', { class: 'btn icon ghost', 'aria-label': 'Өшіру', onclick: () => { t.extras.splice(i, 1); save(); drawExtras(); } }, icon('trash', 16)))));
    });
  };
  drawExtras();

  wrap.append(h('div', { class: 'panel' },
    h('h2', { class: 'sub' }, 'Апталық шаблон'),
    h('p', { class: 'hint', style: { marginTop: 0 } }, 'Жаңа апта ашқанда бағандар осы шаблоннан жасалады. Бұрынғы апталар өзгермейді.'),
    h('div', { class: 'grid-3' },
      field('Аптадағы сабақ саны', t.lessonsPerWeek, (v) => { t.lessonsPerWeek = Math.max(1, parseNum(v) || 2); save(); }, 'Мысалы 2: №15 және №16', { inputmode: 'numeric' }),
      field('АБС максимал балы', t.absMax, (v) => { t.absMax = parseNum(v) || 0; save(); }, 'Әр апталық тест', { inputmode: 'numeric' }),
      field('АТ максимал балы', t.atMax, (v) => { t.atMax = parseNum(v) || 0; save(); }, '4, 8, 12-апталардағы айлық тест', { inputmode: 'numeric' })),
    h('h3', { style: { margin: '22px 0 8px', fontSize: '15px' } }, 'Әр сабақтың тапсырмалары'),
    h('table', { class: 'cols-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Қысқартуы'), h('th', {}, 'Ата-анаға жазылатын атауы'), h('th', {}, 'Макс'), h('th'))), tasksBody),
    h('button', { class: 'btn sm', style: { marginTop: '10px' }, onclick: () => { t.lessonTasks.push({ code: 'ЖАҢА', max: 10 }); save(); drawTasks(); } }, icon('plus', 16), 'Тапсырма қосу'),
    h('h3', { style: { margin: '22px 0 8px', fontSize: '15px' } }, 'Аптаға бір рет болатын бағандар'),
    h('table', { class: 'cols-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Атауы'), h('th', {}, 'Макс'), h('th'), h('th'), h('th'))), exBody),
    h('button', { class: 'btn sm', style: { marginTop: '10px' }, onclick: () => { t.extras.push({ id: uid(), code: 'ЖАҢА', max: 10, numbered: false, on: true }); save(); drawExtras(); } }, icon('plus', 16), 'Баған қосу'),
  ));

  wrap.append(h('div', { class: 'panel' },
    h('h2', { class: 'sub' }, 'Топты жою'),
    h('p', { class: 'hint', style: { marginTop: 0 } }, 'Топ сайттан алынады. Папкадағы файлдар (Excel, отчеттар, деректер) өшпейді.'),
    h('button', {
      class: 'btn danger', onclick: async () => {
        if (!(await confirmBox('Топты сайттан алу', `«${meta.name}» тобы тізімнен алынады. Файлдар ${meta.folder} папкасында қалады.`, 'Алып тастау', true))) return;
        store.settings.groups = store.settings.groups.filter((g) => g.id !== meta.id);
        delete store.groups[meta.id];
        await saveSettingsNow(); go('#/');
      },
    }, icon('trash'), 'Топты сайттан алу')));
  return wrap;
}

// ======================= Жаңа апта =======================
function newWeekDialog(meta, group) {
  if (!group.students.filter((s) => s.active !== false).length) {
    toast('Алдымен оқушыларды енгізіңіз', 'err');
    return go(`#/g/${meta.id}/students`);
  }
  const p = suggestWeek(group);
  const num = h('input', { class: 'input', value: p.number, inputmode: 'numeric' });
  const from = h('input', { class: 'input', value: p.dateFrom });
  const to = h('input', { class: 'input', value: p.dateTo });
  const lessons = h('input', { class: 'input', value: p.lessons.join(', ') });
  let testType = p.testType;
  const testNo = h('input', { class: 'input', value: p.testNo, inputmode: 'numeric' });
  const testMax = h('input', { class: 'input', value: p.testMax, inputmode: 'numeric' });
  const seg = h('div', { class: 'seg' });
  const segBtns = ['АБС', 'АТ'].map((k) => h('button', {
    type: 'button', class: k === testType ? 'on' : '',
    onclick: () => { testType = k; segBtns.forEach((b) => b.classList.toggle('on', b.textContent === k)); testMax.value = k === 'АТ' ? group.template.atMax : group.template.absMax; preview(); },
  }, k));
  seg.append(...segBtns);
  num.addEventListener('change', () => {
    const n = parseNum(num.value);
    if (!n) return;
    const tt = n % 4 === 0 ? 'АТ' : 'АБС';
    testType = tt; segBtns.forEach((b) => b.classList.toggle('on', b.textContent === tt));
    testNo.value = n % 4 === 0 ? n / 4 : n - Math.floor(n / 4);
    testMax.value = tt === 'АТ' ? group.template.atMax : group.template.absMax;
    preview();
  });

  const extrasOn = {}, extraNoInputs = {};
  const exList = group.template.extras.map((ex) => {
    extrasOn[ex.id] = ex.on !== false;
    const cb = h('input', { type: 'checkbox', checked: extrasOn[ex.id] });
    cb.addEventListener('change', () => { extrasOn[ex.id] = cb.checked; preview(); });
    let noInp = null;
    if (ex.numbered) {
      noInp = h('input', { class: 'input', value: p.extraNos[ex.id], inputmode: 'numeric', style: { width: '70px', minHeight: '34px', padding: '4px 8px' }, 'aria-label': `${ex.code} нөмірі` });
      noInp.addEventListener('input', preview);
      extraNoInputs[ex.id] = noInp;
    }
    return h('div', { class: 'row' }, h('label', { class: 'check' }, cb, ex.code), noInp ? h('span', { class: 'row', style: { gap: '6px' } }, '№', noInp) : null, h('span', { class: 'hint' }, `макс ${ex.max}`));
  });

  const prev = h('div', { class: 'hint' });
  const params = () => {
    const extraNos = {};
    for (const id in extraNoInputs) extraNos[id] = parseNum(extraNoInputs[id].value) || 1;
    return {
      number: parseNum(num.value), dateFrom: from.value.trim(), dateTo: to.value.trim(),
      lessons: lessons.value.split(/[,\s]+/).map(Number).filter((x) => x > 0),
      testType, testNo: parseNum(testNo.value) || 1, testMax: parseNum(testMax.value) || 0, extrasOn, extraNos,
    };
  };
  function preview() {
    const cols = buildColumns(group, params());
    const max = cols.reduce((s, c) => s + (c.kind === 'bonus' ? 0 : c.max), 0);
    prev.textContent = `${cols.length} баған: ${cols.map((c) => c.label).join(', ')}. Жалпы балл: ${max}.`;
  }
  lessons.addEventListener('input', preview); testNo.addEventListener('input', preview); testMax.addEventListener('input', preview);
  preview();

  const m = modal({
    title: 'Жаңа апта ашу', wide: true,
    body: [
      h('div', { class: 'grid-3' },
        h('label', { class: 'field' }, h('span', {}, 'Апта нөмірі'), num),
        h('label', { class: 'field' }, h('span', {}, 'Басталуы'), from),
        h('label', { class: 'field' }, h('span', {}, 'Аяқталуы'), to)),
      h('div', { class: 'grid-3' },
        h('label', { class: 'field' }, h('span', {}, 'Сабақ нөмірлері'), lessons, h('small', {}, 'Үтірмен: 15, 16')),
        h('div', { class: 'field' }, h('span', {}, 'Тест түрі'), seg, h('small', {}, 'Әр 4-апта — АТ, қалғаны — АБС')),
        h('div', { class: 'grid-2' },
          h('label', { class: 'field' }, h('span', {}, 'Тест №'), testNo),
          h('label', { class: 'field' }, h('span', {}, 'Тест макс'), testMax))),
      h('div', { class: 'field' }, h('span', {}, 'Қосымша бағандар'), h('div', { class: 'row', style: { gap: '22px' } }, exList)),
      prev,
    ],
    foot: [
      h('button', { class: 'btn', onclick: () => m.close() }, 'Бас тарту'),
      h('button', {
        class: 'btn primary', onclick: () => {
          const pp = params();
          if (!pp.number) return toast('Апта нөмірін жазыңыз', 'err');
          if (group.weeks.some((w) => w.number === pp.number)) return toast(`${pp.number}-апта бұрыннан бар`, 'err');
          if (!pp.lessons.length) return toast('Сабақ нөмірлерін жазыңыз', 'err');
          const w = createWeek(group, pp);
          group.weeks.push(w);
          saveGroup(meta.id);
          m.close();
          go(`#/g/${meta.id}/w/${w.id}`);
        },
      }, 'Аптаны ашу'),
    ],
  });
}

// ======================= Апта беті =======================
function weekView(meta, group, week, tab) {
  main.innerHTML = '';
  const st = weekStats(group, week, store.settings);
  const counts = (s) => ({ test: s.attended < s.n ? `${s.attended}/${s.n}` : null, pp: s.ppList.length || null });
  const c0 = counts(st);
  const tabs = [
    ['rating', 'Жалпы рейтинг'],
    ['test', week.testType, c0.test],
    ['pp', 'ПП', c0.pp, 'red'],
    ['parents', 'Ата-аналарға'],
    ['report', 'Отчет және файлдар'],
  ];
  const refreshTabs = () => {
    const c = counts(weekStats(group, week, store.settings));
    for (const k of ['test', 'pp']) {
      const tabEl = main.querySelector(`.tab[data-tab="${k}"]`);
      if (!tabEl) continue;
      let span = tabEl.querySelector('.count');
      if (!c[k]) { if (span) span.remove(); continue; }
      if (!span) { span = h('span', { class: 'count' + (k === 'pp' ? ' red' : '') }); tabEl.append(span); }
      span.textContent = c[k];
    }
  };
  main.append(
    h('div', { class: 'page-head' },
      h('div', {},
        h('div', { class: 'crumbs' }, h('a', { href: '#/' }, 'Топтар'), ' / ', h('a', { href: `#/g/${meta.id}` }, meta.name)),
        h('h1', { class: 'title' }, `${week.number}-апта `, h('span', { class: 'muted' }, meta.name)),
        h('div', { class: 'meta' },
          h('span', { class: 'badge' }, `${week.dateFrom} — ${week.dateTo}`),
          h('span', { class: 'badge' }, `Сабақтар №${week.lessons.join(', №')}`),
          h('span', { class: 'badge ' + (week.testType === 'АТ' ? 'at' : 'abs') }, `№${week.testNo} ${week.testType}`))),
      h('div', { class: 'head-actions' },
        h('button', { class: 'btn', onclick: () => columnsDialog(meta, group, week) }, icon('columns'), 'Бағандар'),
        h('button', { class: 'btn', onclick: () => addStudentToWeek(meta, group, week) }, icon('users'), 'Оқушы қосу'),
        h('button', { class: 'btn primary', onclick: () => finishWeek(meta, group, week) }, icon('check'), 'Аптаны аяқтау'))),
    h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, label, count, kind]) =>
      h('button', { class: 'tab' + (k === tab ? ' on' : ''), 'data-tab': k, role: 'tab', 'aria-selected': k === tab, onclick: () => go(`#/g/${meta.id}/w/${week.id}/${k}`) },
        label, count ? h('span', { class: 'count ' + (kind || '') }, count) : null))),
  );
  const save = () => { saveGroup(meta.id); refreshTabs(); };
  const ctx = { group, week, settings: store.settings, save, rerender: () => weekView(meta, group, week, tab) };
  if (tab === 'rating') main.append(ratingGrid(ctx));
  else if (tab === 'test') main.append(testPanel(ctx));
  else if (tab === 'pp') main.append(ppPanel(ctx));
  else if (tab === 'parents') main.append(parentsPanel(meta, ctx));
  else if (tab === 'report') main.append(reportPanel(meta, ctx));
}

function addStudentToWeek(meta, group, week) {
  const missing = group.students.filter((s) => !week.rows.some((r) => r.sid === s.id));
  if (!missing.length) {
    toast('Тізімдегі барлық оқушы осы аптада бар. Жаңа оқушыны «Оқушылар» бетінде қосыңыз.');
    return;
  }
  const sel = h('select', { class: 'input' }, missing.map((s) => h('option', { value: s.id }, `${s.surname} ${s.name}${s.active === false ? ' (оқымайды)' : ''}`)));
  const m = modal({
    title: 'Аптаға оқушы қосу',
    body: [h('label', { class: 'field' }, h('span', {}, 'Оқушы'), sel)],
    foot: [
      h('button', { class: 'btn', onclick: () => m.close() }, 'Бас тарту'),
      h('button', {
        class: 'btn primary', onclick: () => {
          week.rows.push({ sid: sel.value, scores: {}, note: '', testNote: '', pp: null, ppNote: '', sent: false });
          saveGroup(meta.id); m.close(); render();
        },
      }, 'Қосу'),
    ],
  });
}

function columnsDialog(meta, group, week) {
  const body = h('tbody');
  const draw = () => {
    body.innerHTML = '';
    week.columns.forEach((c, i) => {
      const label = h('input', { class: 'input', value: c.label });
      label.addEventListener('change', () => { c.label = label.value.trim() || c.label; });
      const max = h('input', { class: 'input', value: c.max, inputmode: 'numeric', style: { width: '80px' }, disabled: c.kind === 'bonus' });
      max.addEventListener('change', () => { c.max = parseNum(max.value) || 0; });
      const kind = { task: 'Сабақ', extra: 'Қосымша', test: 'Тест', bonus: 'Бонус' }[c.kind];
      body.append(h('tr', {},
        h('td', {}, label), h('td', {}, max), h('td', { class: 'hint' }, kind),
        h('td', { style: { whiteSpace: 'nowrap' } },
          h('button', { class: 'btn icon ghost', 'aria-label': 'Солға', disabled: i === 0, onclick: () => { [week.columns[i - 1], week.columns[i]] = [week.columns[i], week.columns[i - 1]]; draw(); } }, '↑'),
          h('button', { class: 'btn icon ghost', 'aria-label': 'Оңға', disabled: i === week.columns.length - 1, onclick: () => { [week.columns[i + 1], week.columns[i]] = [week.columns[i], week.columns[i + 1]]; draw(); } }, '↓'),
          h('button', {
            class: 'btn icon ghost', 'aria-label': 'Өшіру', disabled: c.kind === 'test',
            onclick: async () => {
              const has = week.rows.some((r) => r.scores[c.id] != null);
              if (has && !(await confirmBox('Бағанды өшіру', `«${c.label}» бағанындағы баллдар да өшеді.`, 'Өшіру', true))) return;
              week.columns.splice(i, 1); week.rows.forEach((r) => delete r.scores[c.id]); draw();
            },
          }, icon('trash', 16)))));
    });
  };
  draw();
  const newLabel = h('input', { class: 'input', placeholder: 'Мысалы: №17 КН' });
  const newMax = h('input', { class: 'input', placeholder: 'Макс', inputmode: 'numeric', style: { width: '90px' } });
  const m = modal({
    title: `${week.number}-апта бағандары`, wide: true,
    body: [
      h('table', { class: 'cols-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Атауы'), h('th', {}, 'Макс'), h('th', {}, 'Түрі'), h('th'))), body),
      h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, newLabel), newMax,
        h('button', {
          class: 'btn', onclick: () => {
            if (!newLabel.value.trim()) return newLabel.focus();
            const lm = newLabel.value.trim().match(/^№\s*(\d+)\s+(.+)$/);
            const col = lm && week.lessons.includes(Number(lm[1]))
              ? { id: uid(), kind: 'task', code: lm[2].trim(), lesson: Number(lm[1]), label: newLabel.value.trim(), max: parseNum(newMax.value) || 0 }
              : { id: uid(), kind: 'extra', code: lm ? lm[2].trim() : newLabel.value.trim(), no: lm ? Number(lm[1]) : null, label: newLabel.value.trim(), max: parseNum(newMax.value) || 0 };
            const bi = week.columns.findIndex((c) => c.kind === 'test');
            week.columns.splice(bi < 0 ? week.columns.length : bi, 0, col);
            newLabel.value = ''; newMax.value = ''; draw();
          },
        }, icon('plus', 16), 'Баған қосу')),
      h('p', { class: 'hint', style: { margin: 0 } }, 'Ата-ана мәтінінде баған атауындағы қысқарту толық жазылады (мысалы, «№17 КН» → «№17 конспект»).'),
    ],
    foot: [h('button', { class: 'btn primary', onclick: () => m.close() }, 'Дайын')],
    onClose: () => { saveGroup(meta.id); render(); },
  });
}

// ---------------- АБС / АТ ----------------
function scoreInput(value, onValue, label) {
  const inp = h('input', { class: 'cell', type: 'text', inputmode: 'decimal', value: value == null ? '' : String(value).replace('.', ','), 'aria-label': label });
  inp.addEventListener('focus', () => inp.select());
  inp.addEventListener('input', () => {
    const v = parseNum(inp.value);
    if (Number.isNaN(v) || (v != null && v < 0)) { inp.classList.add('over'); return; }
    inp.classList.remove('over'); onValue(v);
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const all = [...document.querySelectorAll('.sheet input.cell:not(.note)')];
      const n = all[all.indexOf(inp) + (e.key === 'ArrowUp' ? -1 : 1)];
      if (n) n.focus();
    }
  });
  return inp;
}

function testPanel(ctx) {
  const { group, week, settings, save } = ctx;
  const tc = testCol(week);
  const th = settings.thresholds.test;
  const wrap = h('div', {});
  const ev = evaluate(group, week, settings);
  const present = ev.list.filter((e) => !e.absent).sort((a, b) => b.test - a.test);
  const absent = ev.list.filter((e) => e.absent);
  const st = weekStats(group, week, settings);
  wrap.append(h('div', { class: 'statline' },
    h('div', { class: 'stat' }, h('span', {}, 'Қатысты'), h('b', {}, `${st.attended} / ${st.n}`)),
    h('div', { class: 'stat' }, h('span', {}, 'Орташа балл'), h('b', {}, st.testAvg != null ? fmt(st.testAvg, 1) : '—')),
    h('div', { class: 'stat zone-g' }, h('span', {}, 'Жасыл', h('span', { class: 'thr' }, ` · ${th.green}%+`)), h('b', {}, st.tcount.green)),
    h('div', { class: 'stat zone-b' }, h('span', {}, 'Көк', h('span', { class: 'thr' }, ` · ${th.blue}–${th.green}%`)), h('b', {}, st.tcount.blue)),
    h('div', { class: 'stat zone-r' }, h('span', {}, 'Қызыл', h('span', { class: 'thr' }, ` · ПП-ға`)), h('b', {}, st.tcount.red)),
    h('div', { class: 'stat' }, h('span', {}, 'Тест макс'), h('b', {}, tc ? tc.max : '—'))));

  const tbody = h('tbody');
  const row = (e, i) => {
    const pctB = h('b'), bar = h('i');
    const tr = h('tr', { class: 'z-' + (e.absent ? 'none' : e.testZone) });
    const update = (v) => {
      if (v == null) delete e.row.scores[tc.id]; else e.row.scores[tc.id] = v;
      const pct = v != null && tc.max ? (v / tc.max) * 100 : null;
      const z = v == null ? 'none' : (pct >= th.green ? 'green' : pct >= th.blue ? 'blue' : 'red');
      tr.className = 'z-' + z;
      pctB.textContent = v == null ? 'келмеді' : fmtPct(pct);
      bar.style.width = Math.min(100, pct || 0) + '%';
      save();
    };
    const note = h('input', { class: 'cell note', value: e.row.testNote || '', placeholder: 'себебі / ескерту…', 'aria-label': 'Ескерту' });
    note.addEventListener('input', () => { e.row.testNote = note.value; save(); });
    tr.append(
      h('td', { class: 'sticky-l c-rank' }, e.absent ? '—' : i + 1),
      h('td', { class: 'sticky-l c-sur' }, e.st.surname),
      h('td', { class: 'sticky-l c-name' }, e.st.name),
      h('td', {}, scoreInput(e.test, update, `${e.st.surname} ${e.st.name}, ${tc.label}`)),
      h('td', { class: 'pct' }, h('div', { class: 'meter' }, h('div', { class: 'bar' }, bar, h('span', { class: 'tick', style: { left: th.blue + '%' } }), h('span', { class: 'tick', style: { left: th.green + '%' } })), pctB)),
      h('td', {}, note));
    pctB.textContent = e.absent ? 'келмеді' : fmtPct(e.testPct);
    bar.style.width = Math.min(100, e.testPct || 0) + '%';
    return tr;
  };
  present.forEach((e, i) => tbody.append(row(e, i)));
  absent.forEach((e) => tbody.append(row(e)));
  wrap.append(h('div', { class: 'sheet-wrap' }, h('table', { class: 'sheet' },
    h('thead', {}, h('tr', {}, h('th', { class: 'sticky-l c-rank' }, '№'), h('th', { class: 'sticky-l c-sur' }, 'Тегі'), h('th', { class: 'sticky-l c-name' }, 'Аты'),
      h('th', { class: 'test-col' }, tc ? tc.label : week.testType, h('small', {}, `макс ${tc ? tc.max : ''}`)), h('th', {}, 'Пайыз'), h('th', {}, 'Ескерту'))),
    tbody)));
  wrap.append(h('div', { class: 'legend' },
    h('span', {}, h('i', { style: { background: 'var(--z-green)' } }), `Жасыл — ${th.green}–100%`),
    h('span', {}, h('i', { style: { background: 'var(--z-blue)' } }), `Көк — ${th.blue}–${th.green}%`),
    h('span', {}, h('i', { style: { background: 'var(--z-red)' } }), `Қызыл — 0–${th.blue}% (ПП тапсырады)`),
    h('span', { class: 'hint' }, 'Балл жалпы рейтингтегі тест бағанымен ортақ — бір жерде өзгертсеңіз, екіншісінде де өзгереді. Бос = келмеді.')));
  return wrap;
}

// ---------------- ПП ----------------
function ppPanel(ctx) {
  const { group, week, settings, save } = ctx;
  const tc = testCol(week);
  const th = settings.thresholds.test;
  const ev = evaluate(group, week, settings);
  const list = ev.list.filter((e) => e.testZone === 'red' || e.absent);
  const wrap = h('div', {});
  if (!list.length) {
    wrap.append(h('div', { class: 'empty' }, h('h3', {}, 'Қайта тапсыратын оқушы жоқ'),
      h('p', {}, `${week.testType} нәтижесі бойынша қызыл зонада ешкім жоқ. Тест баллдарын енгізгенде ${th.blue}%-дан төмен алғандар осында автоматты шығады.`)));
    return wrap;
  }
  const tbody = h('tbody');
  list.forEach((e, i) => {
    const pctB = h('b'), bar = h('i');
    const tr = h('tr', { class: 'z-' + (e.pp != null ? e.ppZone : 'none') });
    const update = (v) => {
      e.row.pp = v;
      const pct = v != null && tc.max ? (v / tc.max) * 100 : null;
      tr.className = 'z-' + (v == null ? 'none' : pct >= th.green ? 'green' : pct >= th.blue ? 'blue' : 'red');
      pctB.textContent = fmtPct(pct); bar.style.width = Math.min(100, pct || 0) + '%';
      save();
    };
    const note = h('input', { class: 'cell note', value: e.row.ppNote || '', placeholder: 'ескерту…', 'aria-label': 'Ескерту' });
    note.addEventListener('input', () => { e.row.ppNote = note.value; save(); });
    tr.append(
      h('td', { class: 'sticky-l c-rank' }, i + 1),
      h('td', { class: 'sticky-l c-sur' }, e.st.surname),
      h('td', { class: 'sticky-l c-name' }, e.st.name),
      h('td', { class: 'status', style: { color: 'var(--z-red)' } }, e.absent ? 'келмеді' : `${fmt(e.test, 1)} (${fmtPct(e.testPct, 0)})`),
      h('td', {}, scoreInput(e.pp, update, `${e.st.surname} ${e.st.name}, ПП балы`)),
      h('td', { class: 'pct' }, h('div', { class: 'meter' }, h('div', { class: 'bar' }, bar, h('span', { class: 'tick', style: { left: th.blue + '%' } }), h('span', { class: 'tick', style: { left: th.green + '%' } })), pctB)),
      h('td', {}, note));
    pctB.textContent = fmtPct(e.ppPct); bar.style.width = Math.min(100, e.ppPct || 0) + '%';
    tbody.append(tr);
  });
  wrap.append(
    h('p', { class: 'hint', style: { marginTop: 0 } }, `${week.testType}-дан ${th.blue}%-дан төмен алғандар мен келмегендер. ПП балы ${week.testType} сияқты боялады, бірақ жалпы рейтингке кірмейді.`),
    h('div', { class: 'sheet-wrap' }, h('table', { class: 'sheet' },
      h('thead', {}, h('tr', {}, h('th', { class: 'sticky-l c-rank' }, '№'), h('th', { class: 'sticky-l c-sur' }, 'Тегі'), h('th', { class: 'sticky-l c-name' }, 'Аты'),
        h('th', {}, `${week.testType} нәтижесі`), h('th', { class: 'test-col' }, 'ПП балы', h('small', {}, `макс ${tc.max}`)), h('th', {}, 'Пайыз'), h('th', {}, 'Ескерту'))),
      tbody)));
  return wrap;
}

// ---------------- Ата-аналарға ----------------
function parentsPanel(meta, ctx) {
  const { group, week, settings, save } = ctx;
  const ev = evaluate(group, week, settings);
  const order = ev.byRating;
  if (!order.length) return h('div', { class: 'empty' }, h('h3', {}, 'Аптада оқушы жоқ'));
  let current = order[0].row.sid;
  const list = h('div', { class: 'msg-list', role: 'listbox', 'aria-label': 'Оқушылар' });
  const view = h('div', { class: 'panel msg-view' });

  const drawList = () => {
    list.innerHTML = '';
    order.forEach((e) => list.append(h('button', {
      class: 'msg-item' + (e.row.sid === current ? ' on' : ''), role: 'option', 'aria-selected': e.row.sid === current,
      onclick: () => {
        current = e.row.sid; drawList(); drawView();
        if (window.matchMedia('(max-width: 1100px)').matches) view.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }, h('span', { class: 'zdot ' + e.zone }), `${e.rank}. ${e.st.surname} ${e.st.name}`, e.row.sent ? h('span', { class: 'sent' }, '✓ жіберілді') : null)));
  };
  const drawView = () => {
    const e = order.find((x) => x.row.sid === current);
    const text = buildMessage(e, week, meta, settings);
    const ta = h('textarea', { class: 'input', 'aria-label': 'Ата-анаға мәтін' });
    ta.value = text;
    const miss = missingTitles(e, week, settings);
    const sent = h('input', { type: 'checkbox', checked: !!e.row.sent });
    sent.addEventListener('change', () => { e.row.sent = sent.checked; save(); drawList(); });
    view.innerHTML = '';
    view.append(...[
      h('div', { class: 'msg-head' },
        h('div', {}, h('h3', {}, `${e.st.surname} ${e.st.name}`),
          h('div', { class: 'meta' }, h('span', { class: 'zdot ' + e.zone, style: { width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block' } }),
            `${ZONE_LABEL[e.zone]} зона · ${fmt(e.total, 1)} / ${fmt(ev.max, 0)} балл · ${fmtPct(e.pct)} · ${e.st.gender === 'f' ? 'Қызыңыз' : 'Балаңыз'}`)),
        h('div', { class: 'row' },
          h('label', { class: 'check' }, sent, 'Жіберілді'),
          h('button', {
            class: 'btn primary', onclick: async () => {
              await copyText(ta.value);
              if (!e.row.sent) { e.row.sent = true; sent.checked = true; save(); drawList(); }
              toast('Мәтін көшірілді — WhatsApp-қа қойыңыз', 'ok');
            },
          }, icon('copy'), 'Көшіру'),
          h('button', {
            class: 'btn', title: 'WhatsApp-та ашу', onclick: () => {
              if (!e.row.sent) { e.row.sent = true; sent.checked = true; save(); drawList(); }
              window.open('https://wa.me/?text=' + encodeURIComponent(ta.value), '_blank', 'noopener');
            },
          }, icon('message'), 'WhatsApp'))),
      miss.length ? h('div', {}, h('div', { class: 'hint' }, 'Орындалмаған тапсырмалар:'), h('div', { class: 'chips' }, miss.map((m) => h('span', { class: 'chip' }, m)))) : null,
      ta,
      h('p', { class: 'hint', style: { marginBottom: 0 } }, 'Мәтінді осында өзгертуге болады — көшіргенде өзгерткеніңіз алынады. Үлгілерді «Баптаулар» бетінде түзетесіз.'),
    ].filter(Boolean));
  };
  drawList(); drawView();
  return h('div', { class: 'msg-layout' }, list, view);
}

// ---------------- Отчет және файлдар ----------------
function reportPanel(meta, ctx) {
  const { group, week, settings, save } = ctx;
  week.report = week.report || {};
  const names = fileNames(meta, week);
  const wrap = h('div', {});
  const isAT = week.testType === 'АТ';

  wrap.append(h('div', { class: 'export-hero' },
    h('div', {}, h('h3', {}, 'Барлық файлды бір батырмамен жасау'),
      h('p', {}, `Excel рейтинг (3 бет: РТ, ${week.testType}, ПП), рейтинг суреті, ${week.testType} суреті және басшыға арналған PowerPoint отчет ${meta.folder} папкасына сақталады.`)),
    h('button', { class: 'btn primary lg', onclick: () => finishWeek(meta, group, week) }, icon('check'), 'Аптаны аяқтау')));

  const single = (kind, ic, label) => h('button', {
    class: 'btn', onclick: async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        const [r] = await exportAll(group, week, meta, settings, [kind]);
        toast(`Сақталды: ${r.name}`, 'ok');
      } catch (e) { toast(e.message, 'err'); } finally { b.disabled = false; }
    },
  }, icon(ic), label);
  wrap.append(h('div', { class: 'panel' },
    h('h2', { class: 'sub' }, 'Жеке файлдар'),
    h('div', { class: 'row' },
      single('xlsx', 'sheet', names.xlsx), single('png', 'image', names.png),
      single('testPng', 'image', names.testPng), single('pptx', 'slides', names.pptx),
      h('button', { class: 'btn ghost', onclick: () => openFolder(meta.id).catch((e) => toast(e.message, 'err')) }, icon('folder'), 'Папканы ашу'))));

  // Отчет көрсеткіштері
  const defs = reportDefaults(group, week, meta, settings);
  const fields = {};
  const mk = (key, label, autoConv) => {
    const inp = h('input', { class: 'input', value: resolveReport(group, week, meta, settings)[key] });
    inp.addEventListener('input', () => {
      if (inp.value === (defs[key] ?? '')) delete week.report[key]; else week.report[key] = inp.value;
      if (!autoConv) recalcConv();
      save();
    });
    fields[key] = inp;
    return h('label', { class: 'field' }, h('span', {}, label), inp);
  };
  const recalcConv = () => {
    for (const [k, p, f, pct] of [['att_conv', 'att_prev', 'att_fact', true], ['test_conv', 'test_prev', 'test_fact', false], ['tot_conv', 'tot_prev', 'tot_fact', true]]) {
      if (week.report[k]) continue;
      fields[k].value = conv(fields[p].value, fields[f].value, pct);
    }
  };
  const block = (title, hint, rows) => h('div', { class: 'panel' }, h('h2', { class: 'sub' }, title), hint ? h('p', { class: 'hint', style: { marginTop: 0 } }, hint) : null, rows);
  const reasons = h('textarea', { class: 'input', rows: 3 });
  reasons.value = resolveReport(group, week, meta, settings).reasons;
  reasons.addEventListener('input', () => { week.report.reasons = reasons.value; save(); });

  wrap.append(h('div', { class: 'report-grid' },
    block(`${week.testType} қатысым`, '2-слайд. Сандар рейтингтен автоматты алынды — қажет болса түзетіңіз.', [
      h('div', { class: 'grid-3' }, mk('att_total', 'Оқушы саны'), mk('att_present', 'Қатысты'), mk('att_pp', 'Пересдача')),
      h('div', { class: 'metric-row', style: { marginTop: '12px' } }, mk('att_prev', 'Өткен аптада'), mk('att_plan', 'План'), mk('att_fact', 'Факт'), mk('att_conv', 'Конверсия', true)),
      h('label', { class: 'field', style: { marginTop: '12px' } }, h('span', {}, 'Себептілер'), reasons)]),
    block(`${week.testType} ортақ балл`, `3-слайд. ${isAT ? 'Өткен АТ-мен (өткен ай)' : 'Өткен АБС-пен'} салыстырылады.`, [
      h('div', { class: 'metric-row' }, mk('test_prev', isAT ? 'Өткен ай' : 'Өткен апта'), mk('test_plan', 'План'), mk('test_fact', 'Факт'), mk('test_conv', 'Конверсия', true))]),
    block('Жалпы ортақ балл', '4-слайд. Орташа пайыз — жалпы рейтингтен.', [
      h('div', { class: 'metric-row' }, mk('tot_prev', 'Өткен апта'), mk('tot_plan', 'План'), mk('tot_fact', 'Факт'), mk('tot_conv', 'Конверсия', true))]),
  ));
  wrap.append(h('p', { class: 'hint' }, '«Жетістік» және «Келесі аптаға жоспар» слайдтары бос жақтаулармен жасалады — оларды PowerPoint-те өзіңіз толтырасыз.'));

  // Рейтинг суретінің алдын ала көрінісі
  const img = h('img', { class: 'preview-img', alt: 'Жалпы рейтинг суреті' });
  try { img.src = ratingCanvas(group, week, settings, `${meta.name} — ${week.number}-апта рейтингі (${week.dateFrom}–${week.dateTo})`).toDataURL('image/png'); } catch (_) {}
  wrap.append(h('div', { class: 'panel' }, h('h2', { class: 'sub' }, 'Жалпы рейтинг суреті'), h('p', { class: 'hint', style: { marginTop: 0 } }, 'Ортақ топқа жариялауға арналған. Excel скриншоты сияқты.'), img));
  return wrap;
}

async function finishWeek(meta, group, week) {
  const names = fileNames(meta, week);
  const items = [['xlsx', 'Excel рейтинг', names.xlsx], ['png', 'Жалпы рейтинг суреті', names.png], ['testPng', `${week.testType} суреті`, names.testPng], ['pptx', 'Басшыға отчет', names.pptx]];
  const lis = items.map(([k, label, name]) => {
    const st = h('span', { class: 'hint' }, 'күтуде…');
    return { k, li: h('li', {}, st, h('div', {}, h('code', {}, name), h('div', { class: 'hint' }, label))), st };
  });
  const ev = evaluate(group, week, store.settings);
  const top = ev.byRating.slice(0, 3);
  const m = modal({
    title: `${week.number}-апта аяқталуда`,
    body: [
      h('ul', { class: 'files' }, lis.map((x) => x.li)),
      top.length ? h('div', { class: 'panel', style: { padding: '14px 16px' } },
        h('div', { class: 'hint' }, 'Апталық сертификат — топ-3:'),
        h('div', { style: { fontWeight: 600, marginTop: '4px' } }, top.map((e, i) => `${['🥇', '🥈', '🥉'][i]} ${e.st.surname} ${e.st.name} (${fmt(e.total, 0)})`).join('   '))) : null,
    ],
    foot: [
      h('button', { class: 'btn', onclick: () => openFolder(meta.id).catch((e) => toast(e.message, 'err')) }, icon('folder'), 'Папканы ашу'),
      h('button', { class: 'btn primary', onclick: () => { m.close(); go(`#/g/${meta.id}/w/${week.id}/parents`); } }, icon('message'), 'Ата-аналарға мәтін'),
    ],
  });
  for (const x of lis) {
    x.st.textContent = 'жасалуда…';
    try {
      await exportAll(group, week, meta, store.settings, [x.k]);
      x.st.className = 'ok'; x.st.textContent = '✓';
    } catch (e) {
      x.st.className = ''; x.st.style.color = 'var(--z-red)'; x.st.textContent = '✕';
      x.li.append(h('div', { class: 'hint', style: { color: 'var(--z-red)', marginLeft: 'auto' } }, e.message));
    }
  }
  week.finishedAt = new Date().toISOString();
  saveGroup(meta.id);
}

// ======================= Бастапқы баптау (жаңа куратор) =======================
function setupView() {
  document.body.classList.add('setup');
  side.innerHTML = '';
  main.innerHTML = '';
  if (!store.app.isLocal) {
    main.append(h('div', { class: 'setup-card' },
      h('img', { class: 'setup-logo', src: '/assets/logo-full-blue.png', alt: 'NN Online' }),
      h('h1', { class: 'title' }, 'Сайт әлі бапталмаған'),
      h('p', { class: 'hint' }, 'Алдымен сайтты компьютердің өзінде ашып, бастапқы баптауды толтырыңыз.')));
    return;
  }
  const name = h('input', { class: 'input', placeholder: 'Мысалы: Сейітқали Айгерім', autocomplete: 'name' });
  const folder = folderField({ value: store.app.dataRootChosen ? store.dataRoot : store.app.defaultDataRoot || store.dataRoot });
  const pin = h('input', { class: 'input', inputmode: 'numeric', maxlength: 6, placeholder: '6 сан', autocomplete: 'new-password', type: 'password' });
  const pinRow = store.app.hasPin
    ? h('p', { class: 'hint', style: { margin: 0 } }, 'Телефон PIN-коды бұрыннан орнатылған. Оны кейін «Баптаулар» бетінде өзгертуге болады.')
    : h('label', { class: 'field' }, h('span', {}, 'Телефон PIN-коды (міндетті емес)'), pin,
      h('small', {}, 'Сайтты телефоннан ашқанда сұралады. Бос қалдырсаңыз, телефон режимін бірінші қосқанда өзі жасалады.'));
  const err = h('p', { class: 'setup-err', role: 'alert' });
  const btn = h('button', { class: 'btn primary lg', type: 'submit' }, 'Бастау');
  const form = h('form', { class: 'setup-card', novalidate: true },
    h('img', { class: 'setup-logo', src: '/assets/logo-full-blue.png', alt: 'NN Online' }),
    h('h1', { class: 'title' }, 'Қош келдіңіз!'),
    h('p', { class: 'hint', style: { marginTop: '-4px' } }, 'Сайтты қолданбас бұрын өзіңіз туралы үш нәрсені толтырыңыз. Мұның бәрін кейін «Баптаулар» бетінде өзгертуге болады.'),
    h('label', { class: 'field' }, h('span', {}, 'Аты-жөніңіз'), name, h('small', {}, 'Басшыға арналған отчеттың бірінші слайдында шығады.')),
    h('div', { class: 'field' }, h('span', {}, 'Деректер сақталатын папка'), folder.el,
      h('small', {}, 'Топтар, баллдар, Excel және отчеттар осы папкада сақталады. Мысалы: D:\\NNN')),
    pinRow, err, btn);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.textContent = '';
    if (!name.value.trim()) { err.textContent = 'Аты-жөніңізді жазыңыз.'; return name.focus(); }
    if (!folder.value) { err.textContent = 'Папканы таңдаңыз.'; return folder.input.focus(); }
    if (pin.value && !/^\d{6}$/.test(pin.value.trim())) { err.textContent = 'PIN-код дәл 6 саннан тұруы керек.'; return pin.focus(); }
    btn.disabled = true;
    try {
      await saveAppSettings({ dataRoot: folder.value, pin: pin.value.trim() || undefined });
      // Таңдалған папкада бұрынғы деректер болса, соларды қолданамыз
      await loadSettings();
      const existed = store.configured;
      if (!existed || !store.settings.curatorName) store.settings.curatorName = name.value.trim();
      await saveSettingsNow();
      store.configured = true;
      toast(existed ? 'Папкадағы бұрынғы деректер табылды және қосылды.' : 'Дайын! Енді бірінші топты ашыңыз.', 'ok');
      go('#/');
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  });
  main.append(form);
  setTimeout(() => name.focus(), 50);
}

// ---------------- Компьютер баптаулары (папка, PIN) ----------------
function computerPanel() {
  if (!store.app.isLocal) {
    return h('div', { class: 'panel' }, h('h2', { class: 'sub' }, 'Компьютер'),
      h('p', { class: 'hint', style: { margin: 0 } }, 'Папка мен PIN-кодты тек компьютердің өзінен өзгертуге болады.'));
  }
  const folder = folderField({ value: store.dataRoot });
  const saveFolder = h('button', {
    class: 'btn', onclick: async () => {
      const v = folder.value;
      if (v === store.dataRoot) return toast('Папка өзгермеді');
      if (!(await confirmBox('Деректер папкасын ауыстыру', `Сайт енді ${v} папкасындағы деректерді қолданады. Қазіргі деректер ${store.dataRoot} папкасында қалады — оларды қолмен көшіруге болады.`, 'Ауыстыру'))) return;
      try {
        const r = await saveAppSettings({ dataRoot: v });
        if (!r.settings) {
          const s = store.settings;
          store.settings = { ...s, groups: [] };
          await saveSettingsNow();
        }
        await loadSettings();
        toast('Деректер папкасы ауыстырылды', 'ok');
        render();
      } catch (e) { toast(e.message, 'err'); }
    },
  }, 'Папканы сақтау');
  const pin = h('input', { class: 'input', inputmode: 'numeric', maxlength: 6, type: 'password', placeholder: '6 сан', autocomplete: 'new-password' });
  const savePin = h('button', {
    class: 'btn', onclick: async () => {
      if (!/^\d{6}$/.test(pin.value.trim())) return toast('PIN-код дәл 6 саннан тұруы керек', 'err');
      try {
        await saveAppSettings({ pin: pin.value.trim() });
        pin.value = '';
        toast('PIN-код өзгертілді. Телефондар қайта кіруі керек.', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    },
  }, 'PIN-кодты өзгерту');
  return h('div', { class: 'panel' },
    h('h2', { class: 'sub' }, 'Компьютер'),
    h('div', { class: 'grid-2' },
      h('div', { class: 'field' }, h('span', {}, 'Деректер папкасы'), folder.el, saveFolder,
        h('small', {}, 'Топтар, баллдар, Excel және отчеттар осында сақталады.')),
      h('div', { class: 'field' }, h('span', {}, 'Телефон PIN-коды'), h('div', { class: 'inline-field' }, pin, savePin),
        h('small', {}, store.app.hasPin ? 'PIN-код орнатылған. Жаңасын жазып, өзгертуге болады.' : 'PIN-код әлі орнатылмаған.'))));
}

// ======================= Жалпы баптаулар =======================
function settingsView() {
  const s = store.settings;
  main.innerHTML = '';
  main.append(h('div', { class: 'page-head' }, h('div', {}, h('h1', { class: 'title' }, 'Баптаулар'),
    h('div', { class: 'meta' }, `Деректер папкасы: ${store.dataRoot}`))));
  main.append(computerPanel());

  const inp = (value, on, attrs = {}) => { const i = h('input', { class: 'input', value, ...attrs }); i.addEventListener('change', () => { on(i.value); saveSettings(); }); return i; };

  main.append(h('div', { class: 'panel' },
    h('h2', { class: 'sub' }, 'Отчет'),
    h('div', { class: 'grid-2' },
      h('label', { class: 'field' }, h('span', {}, 'Куратордың аты-жөні'), inp(s.curatorName, (v) => { s.curatorName = v.trim(); }), h('small', {}, 'Отчеттың 1-слайдында шығады')),
      h('label', { class: 'field' }, h('span', {}, 'Бренд'), inp(s.brand, (v) => { s.brand = v.trim(); }), h('small', {}, 'Слайдтың жоғарғы бұрышында')))));

  const thr = (obj, key) => inp(obj[key], (v) => { obj[key] = parseNum(v) || obj[key]; }, { inputmode: 'numeric' });
  main.append(h('div', { class: 'panel' },
    h('h2', { class: 'sub' }, 'Түстер шегі (%)'),
    h('div', { class: 'grid-2' },
      h('div', {}, h('h3', { style: { fontSize: '15px', margin: '0 0 10px' } }, 'Жалпы рейтинг'),
        h('div', { class: 'grid-2' },
          h('label', { class: 'field' }, h('span', {}, 'Жасыл — осыдан бастап'), thr(s.thresholds.rating, 'green')),
          h('label', { class: 'field' }, h('span', {}, 'Көк — осыдан бастап'), thr(s.thresholds.rating, 'blue')))),
      h('div', {}, h('h3', { style: { fontSize: '15px', margin: '0 0 10px' } }, 'АБС / АТ / ПП'),
        h('div', { class: 'grid-2' },
          h('label', { class: 'field' }, h('span', {}, 'Жасыл — осыдан бастап'), thr(s.thresholds.test, 'green')),
          h('label', { class: 'field' }, h('span', {}, 'Көк — осыдан бастап'), thr(s.thresholds.test, 'blue'))))),
    h('p', { class: 'hint', style: { marginBottom: 0 } }, 'Осы шектен төмені — қызыл.')));

  const tn = h('tbody');
  const drawTN = () => {
    tn.innerHTML = '';
    Object.entries(s.taskNames).forEach(([k, v]) => {
      tn.append(h('tr', {}, h('td', { style: { width: '160px', fontWeight: 600 } }, k),
        h('td', {}, inp(v, (nv) => { s.taskNames[k] = nv.trim(); })),
        h('td', { style: { width: '52px' } }, h('button', { class: 'btn icon ghost', 'aria-label': 'Өшіру', onclick: () => { delete s.taskNames[k]; saveSettings(); drawTN(); } }, icon('trash', 16)))));
    });
  };
  drawTN();
  const newK = h('input', { class: 'input', placeholder: 'Қысқартуы' }), newV = h('input', { class: 'input', placeholder: 'Толық атауы' });
  main.append(h('div', { class: 'panel' },
    h('h2', { class: 'sub' }, 'Тапсырма атаулары'),
    h('p', { class: 'hint', style: { marginTop: 0 } }, 'Ата-ана мәтінінде қысқартудың орнына толық атауы жазылады: «№15 КН» → «№15 конспект».'),
    h('table', { class: 'cols-table' }, tn),
    h('div', { class: 'row', style: { marginTop: '10px' } }, h('div', { style: { width: '160px' } }, newK), h('div', { style: { flex: 1 } }, newV),
      h('button', { class: 'btn', onclick: () => { if (!newK.value.trim()) return; s.taskNames[newK.value.trim()] = newV.value.trim(); saveSettings(); newK.value = ''; newV.value = ''; drawTN(); } }, icon('plus', 16), 'Қосу'),
      h('button', { class: 'btn ghost', onclick: () => { s.taskNames = { ...DEFAULT_TASK_NAMES, ...s.taskNames }; saveSettings(); drawTN(); } }, 'Әдепкілерді қайтару'))));

  const tpl = (key, label, rows = 6) => {
    const ta = h('textarea', { class: 'input', rows });
    ta.value = s.messages[key];
    ta.addEventListener('change', () => { s.messages[key] = ta.value; saveSettings(); });
    const reset = h('button', { class: 'btn sm ghost', onclick: () => { ta.value = DEFAULT_MESSAGES[key]; s.messages[key] = ta.value; saveSettings(); } }, 'Әдепкі');
    return h('div', { class: 'field' }, h('span', { class: 'row', style: { justifyContent: 'space-between' } }, label, reset), ta);
  };
  main.append(h('div', { class: 'panel' },
    h('h2', { class: 'sub' }, 'Ата-ана мәтінінің үлгілері'),
    h('p', { class: 'hint', style: { marginTop: 0 } },
      'Орнына қойылатын сөздер: {Балаңыз} {Балаңыздың} {Балаңызға} — қызға «Қызыңыз…» болып ауысады; {аты}, {тегі}; {пәннен} — «математикадан» не «информатикадан»; {себеп} — төмендегі сөйлемдердің бірі; {тапсырмалар} — орындалмаған тапсырмалар тізімі.'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      tpl('green', 'Жасыл зона'), tpl('blue', 'Көк зона'), tpl('red', 'Қызыл зона', 8),
      h('div', { class: 'grid-2' },
        tpl('blueReason', 'Көк: орындалмағандар бар', 3), tpl('blueAllDone', 'Көк: бәрі орындалған, бірақ балл аз', 3),
        tpl('redReason', 'Қызыл: орындалмағандар бар', 3), tpl('redNone', 'Қызыл: ештеңе орындамаған', 3),
        tpl('redAllDone', 'Қызыл: бәрі орындалған, бірақ балл аз', 3)))));
}

// ======================= Іске қосу =======================
(async function boot() {
  try {
    await loadSettings();
    render();
  } catch (e) {
    main.innerHTML = '';
    main.append(h('div', { class: 'empty' }, h('h3', {}, 'Сервер жауап бермеді'),
      h('p', {}, 'Сайтты «NNN Куратор.bat» файлы арқылы ашыңыз — қара терезе ашық тұруы керек.'),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Қайта көру')));
  }
})();
