// Деректерді серверден алу және сақтау
import { debounce, uid } from './util.js';

export const DEFAULT_TASK_NAMES = {
  'КН': 'конспект',
  'ҮЖ': 'үй жұмысы',
  'ҚЖ': 'қатемен жұмыс',
  'ДКЕ': 'деңгей көтеру есептері',
  'ПС': 'практикалық сабақ',
  'ПС КН': 'практикалық сабақтың конспектісі',
  'ФД': 'формула диктант',
  'ФС': 'формула сұрақ',
  'ҚОСЫМША ПС': 'қосымша практикалық сабақ',
  'АБС': 'апталық білім сынағы',
  'АТ': 'айлық тест',
};

export const DEFAULT_MESSAGES = {
  green: 'Қайырлы күн, құрметті ата-ана! {Балаңыз} {аты} {пәннен} осы аптада жоғары нәтиже көрсетіп, рейтингте жасыл түсті (үздік) деңгейде тұр. Сабаққа белсене қатысып, тапсырмаларды уақытылы әрі сапалы орындауда. {Балаңыздың} бұл жетістігі – сіздердің дұрыс бағыт-бағдар бере білгендеріңіздің нәтижесі. Сеніміңіз бен қолдауларыңызға рақмет! ✨🫶🏻',
  blue: 'Қайырлы күн, құрметті ата-ана! {Балаңыз} {аты} {пәннен} оқу үлгерімі бойынша рейтингте көк түсті (жақсы) деңгейде тұр. Тәртібі мен сабаққа қатысуы өте жақсы, бірақ тапсырмаларды толық орындамай, кешіктіріп жүр. {себеп} Егер келесі аптада барлық тапсырмаларды орындаса, білімін одан әрі жетілдіріп, үздіктер қатарына (жасыл зонаға) өтуге толық мүмкіндігі бар. {Балаңызға} бірге қолдау көрсетіп, ынталандырып отырайық. Ынтымақтастығыңызға рақмет! ✨🫶🏻',
  red: 'Қайырлы күн, құрметті ата-ана! {Балаңыз} {аты} {пәннен} осы кезеңдегі оқу үлгерімі бойынша рейтингте қызыл түсті деңгейде тұр. Өкінішке орай, тапсырмалардың орындалмауы немесе сабақ үлгерімінің төмендеуі байқалады. {себеп} Курсты оқып жатқандықтан тапсырмаларды толық немесе кем дегенде жартысын орындауын өтінемін. Бұл тақырыптар ҰБТ-да жиі кездесетін тақырыптар. Сол үшін оқушымыздың сабаққа зейін қойып, тапсырмаларды толық орындағанын қалаймын. Оқушымыздың үлгерімін жақсарту үшін сіз тараптан үй тапсырмаларын күнделікті бақылауға алуды өтінемін. Биік нәтижеге бірге жету үшін қолдау көрсетіп, көмектесейік. Сұрақтарыңыз болса, хабарласуыңызға болады. ✨🫶🏻',
  blueReason: '{тапсырмалар} – осы тапсырмаларды орындамағандықтан көк зонада тұр.',
  blueAllDone: 'Тапсырмалардың барлығы орындалғанымен, кейбірі толық баллға жетпегендіктен көк зонада тұр.',
  redReason: '{Балаңыз} {тапсырмалар} – осы тапсырмаларды орындамағандықтан қызыл зонада тұр.',
  redNone: 'Ешқандай тапсырманы орындамағаны үшін қызыл зонада тұр.',
  redAllDone: 'Тапсырмалар орындалғанымен, жинаған баллы төмен болғандықтан қызыл зонада тұр.',
};

export function defaultSettings() {
  return {
    version: 1,
    curatorName: '',
    brand: 'NNN ONLINE',
    thresholds: { rating: { green: 75, blue: 50 }, test: { green: 85, blue: 65 } },
    taskNames: { ...DEFAULT_TASK_NAMES },
    messages: { ...DEFAULT_MESSAGES },
    groups: [],
  };
}

// Пәнге қарай әдепкі апталық шаблон
export function defaultTemplate(subject) {
  if (subject === 'info') {
    return {
      lessonsPerWeek: 2,
      lessonTasks: [
        { code: 'КН', max: 20 }, { code: 'ҮЖ', max: 20 }, { code: 'ҚЖ', max: 10 },
        { code: 'ПС', max: 30 }, { code: 'ПС КН', max: 30 },
      ],
      extras: [
        { id: uid(), code: 'ҚОСЫМША ПС', max: 20, numbered: false, on: true },
      ],
      absMax: 20,
      atMax: 30,
    };
  }
  return {
    lessonsPerWeek: 2,
    lessonTasks: [
      { code: 'КН', max: 20 }, { code: 'ҮЖ', max: 30 }, { code: 'ҚЖ', max: 10 },
      { code: 'ДКЕ', max: 20 }, { code: 'ПС', max: 30 },
    ],
    extras: [
      { id: uid(), code: 'ҚОСЫМША ПС', max: 20, numbered: false, on: true },
      { id: uid(), code: 'ФД', max: 20, numbered: true, on: true },
      { id: uid(), code: 'ФС', max: 20, numbered: true, on: true },
    ],
    absMax: 20,
    atMax: 30,
  };
}

export function emptyGroupData(subject) {
  return { version: 1, students: [], template: defaultTemplate(subject), weeks: [] };
}

// ---- Күй ----
export const store = {
  settings: null,
  dataRoot: '',
  groups: {},       // id -> group data
  saveState: 'ok',  // ok | saving | error
  listeners: new Set(),
};

function setSaveState(s) {
  store.saveState = s;
  store.listeners.forEach((fn) => fn(s));
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(json.error || `Сервер қатесі (${res.status})`);
  return json;
}

export async function loadSettings() {
  const r = await api('GET', '/api/settings');
  store.dataRoot = r.dataRoot;
  store.app = r.app || {};
  store.configured = !!r.settings;
  const s = r.settings || defaultSettings();
  // Жаңа өрістерді толықтыру
  const d = defaultSettings();
  s.thresholds = s.thresholds || d.thresholds;
  s.taskNames = { ...d.taskNames, ...(s.taskNames || {}) };
  s.messages = { ...d.messages, ...(s.messages || {}) };
  s.groups = s.groups || [];
  store.settings = s;
  return s;
}

export async function loadGroup(id) {
  if (store.groups[id]) return store.groups[id];
  const g = store.settings.groups.find((x) => x.id === id);
  const r = await api('GET', `/api/group/${id}`);
  const data = r.data || emptyGroupData(g ? g.subject : 'math');
  data.students = data.students || [];
  data.weeks = data.weeks || [];
  data.template = data.template || defaultTemplate(g ? g.subject : 'math');
  store.groups[id] = data;
  return data;
}

const pending = new Map();
let settingsPending = false;

const flush = debounce(async () => {
  const jobs = [...pending.keys()];
  pending.clear();
  const doSettings = settingsPending;
  settingsPending = false;
  setSaveState('saving');
  try {
    if (doSettings) await api('PUT', '/api/settings', store.settings);
    for (const id of jobs) await api('PUT', `/api/group/${id}`, store.groups[id]);
    setSaveState('ok');
  } catch (e) {
    console.error(e);
    setSaveState('error');
    jobs.forEach((id) => pending.set(id, true));
    if (doSettings) settingsPending = true;
    import('./util.js').then(({ toast }) => toast('Сақталмады: ' + e.message + '. Сайт серверінің терезесі ашық па?', 'err'));
  }
}, 500);

export function saveGroup(id) { pending.set(id, true); setSaveState('saving'); flush(); }
export async function saveSettingsNow() {
  setSaveState('saving');
  await api('PUT', '/api/settings', store.settings);
  setSaveState('ok');
}
export function saveSettings() { settingsPending = true; setSaveState('saving'); flush(); }

export async function saveFile(groupId, name, base64) {
  return api('POST', `/api/group/${groupId}/file`, { name, base64 });
}
export async function openFolder(groupId) {
  return api('POST', `/api/group/${groupId}/open`);
}

window.addEventListener('beforeunload', (e) => {
  if (store.saveState === 'saving') { e.preventDefault(); e.returnValue = ''; }
});

// Компьютер баптаулары: деректер папкасы және телефон PIN-коды (тек компьютерден)
export async function saveAppSettings({ dataRoot, pin }) {
  const r = await api('POST', '/api/app', { dataRoot, pin });
  store.dataRoot = r.dataRoot;
  store.app = { ...(store.app || {}), hasPin: r.hasPin, dataRootChosen: true };
  store.groups = {};
  return r;
}
