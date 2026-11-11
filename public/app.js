let state = null;
let selectedRating = 0;
let reflectionFormOpen = false;

const THEMES = [
  { key: 'dark', label: 'Samurai' },
  { key: 'ocean', label: 'Hav' },
  { key: 'forest', label: 'Skog' },
  { key: 'sunset', label: 'Solnedgang' },
];

async function api(url, opts) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
  } catch (networkErr) {
    // Ingen kontakt med serveren i det hele tatt - f.eks. et nettverksglipp
    // idet tjenesten våkner fra hvilemodus. Ikke en feil PIN-kode.
    throw new Error('Fikk ikke kontakt med serveren. Prøv igjen om et lite øyeblikk.');
  }

  let body;
  try {
    body = await res.json();
  } catch (parseErr) {
    // Svaret var ikke gyldig JSON - typisk en midlertidig "laster"-side fra
    // hosting-tjenesten mens den våkner. Vis en tydelig, ikke-teknisk melding
    // i stedet for den kryptiske parse-feilen.
    const err = new Error('Serveren svarte uventet. Prøv igjen om et lite øyeblikk.');
    err.status = res.status;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(body.error || 'Noe gikk galt');
    err.status = res.status;
    throw err;
  }
  return body;
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('no-NO', { weekday: 'short', day: 'numeric', month: 'short' });
}

function showToast(msg, ms = 4200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, ms);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || 'dark';
}

// --- Auth / skjermbytte (Netflix-stil profilvelger) -----------------------

const AVATAR_COLORS = ['#d9475a', '#3f7fd4', '#d98a2e', '#3f9d5e', '#8a52c9', '#c9a52e'];

let profiles = [];
let activeProfile = null; // { id, name } for opplåsing, eller { name, isNew: true } for opprettelse
let pinMode = null; // 'unlock' | 'create-set' | 'create-confirm'
let pinBuffer = '';
let firstPin = '';

function showAuthScreen() {
  document.getElementById('auth-screen').hidden = false;
  document.getElementById('app').hidden = true;
}

function showApp() {
  document.getElementById('auth-screen').hidden = true;
  document.getElementById('app').hidden = false;
}

function setAuthError(msg) {
  const el = document.getElementById('profiles-error');
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
  } else {
    el.hidden = false;
    el.textContent = msg;
  }
}

function setPinError(msg) {
  const el = document.getElementById('pin-error');
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
  } else {
    el.hidden = false;
    el.textContent = msg;
  }
}

function setNameError(msg) {
  const el = document.getElementById('name-error');
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
  } else {
    el.hidden = false;
    el.textContent = msg;
  }
}

function populateThemeSelect(current) {
  const sel = document.getElementById('theme-select');
  sel.innerHTML = '';
  for (const t of THEMES) {
    const opt = document.createElement('option');
    opt.value = t.key;
    opt.textContent = t.label;
    if (t.key === current) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function boot() {
  try {
    const me = await api('/api/auth/me');
    applyTheme(me.theme);
    document.getElementById('username-pill').textContent = me.username;
    populateThemeSelect(me.theme);
    showApp();
    await refresh();
  } catch (err) {
    applyTheme('dark');
    showAuthScreen();
    await loadProfiles();
  }
}

async function loadProfiles() {
  setAuthError(null);
  try {
    const res = await api('/api/profiles');
    profiles = res.profiles;
    renderProfileGrid();
    showProfilePicker();
  } catch (err) {
    setAuthError('Klarte ikke å hente profiler. Prøv å laste siden på nytt.');
  }
}

function renderProfileGrid() {
  const grid = document.getElementById('profile-grid');
  grid.innerHTML = '';
  profiles.forEach((p, i) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'profile-tile';
    const avatar = document.createElement('div');
    avatar.className = 'profile-avatar';
    avatar.style.background = AVATAR_COLORS[i % AVATAR_COLORS.length];
    avatar.textContent = (p.name || '?').charAt(0).toUpperCase();
    const label = document.createElement('span');
    label.className = 'profile-label';
    label.textContent = p.name;
    tile.append(avatar, label);
    tile.addEventListener('click', () => openPinView({ id: p.id, name: p.name }));
    grid.appendChild(tile);
  });

  // "Legg til ny bruker"-flisen - alltid til slutt i rutenettet.
  const addTile = document.createElement('button');
  addTile.type = 'button';
  addTile.className = 'profile-tile add-tile';
  const addAvatar = document.createElement('div');
  addAvatar.className = 'profile-avatar add-avatar';
  addAvatar.textContent = '+';
  const addLabel = document.createElement('span');
  addLabel.className = 'profile-label';
  addLabel.textContent = 'Ny bruker';
  addTile.append(addAvatar, addLabel);
  addTile.addEventListener('click', openNameView);
  grid.appendChild(addTile);
}

function showProfilePicker() {
  document.getElementById('profile-picker-view').hidden = false;
  document.getElementById('name-view').hidden = true;
  document.getElementById('pin-view').hidden = true;
}

function openNameView() {
  setNameError(null);
  document.getElementById('new-profile-name').value = '';
  document.getElementById('profile-picker-view').hidden = true;
  document.getElementById('pin-view').hidden = true;
  document.getElementById('name-view').hidden = false;
  document.getElementById('new-profile-name').focus();
}

document.getElementById('name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('new-profile-name').value.trim();
  if (name.length < 1 || name.length > 20) {
    setNameError('Navnet må være 1-20 tegn.');
    return;
  }
  openPinView({ name, isNew: true });
});

document.getElementById('name-back').addEventListener('click', () => {
  setNameError(null);
  showProfilePicker();
});

function openPinView(profile) {
  activeProfile = profile;
  pinBuffer = '';
  firstPin = '';
  pinMode = profile.isNew ? 'create-set' : 'unlock';
  setPinError(null);
  document.getElementById('pin-name').textContent = profile.name;
  document.getElementById('pin-subtitle').textContent = profile.isNew
    ? 'Lag en kode på 4 siffer'
    : 'Skriv inn koden din';
  const i = profiles.findIndex((p) => p.id === profile.id);
  const avatar = document.getElementById('pin-avatar');
  avatar.style.background = AVATAR_COLORS[(i >= 0 ? i : profiles.length) % AVATAR_COLORS.length];
  avatar.textContent = (profile.name || '?').charAt(0).toUpperCase();
  updatePinDots();
  document.getElementById('profile-picker-view').hidden = true;
  document.getElementById('name-view').hidden = true;
  document.getElementById('pin-view').hidden = false;
}

function updatePinDots() {
  const dots = document.querySelectorAll('#pin-dots .pin-dot');
  dots.forEach((d, i) => d.classList.toggle('filled', i < pinBuffer.length));
}

async function handlePinComplete() {
  const pin = pinBuffer;
  if (pinMode === 'unlock') {
    try {
      const user = await api(`/api/profiles/${activeProfile.id}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      await enterApp(user);
    } catch (err) {
      setPinError(err.message);
      pinBuffer = '';
      updatePinDots();
    }
    return;
  }
  if (pinMode === 'create-set') {
    firstPin = pin;
    pinBuffer = '';
    pinMode = 'create-confirm';
    document.getElementById('pin-subtitle').textContent = 'Bekreft koden';
    updatePinDots();
    return;
  }
  if (pinMode === 'create-confirm') {
    if (pin !== firstPin) {
      setPinError('Kodene var ikke like. Prøv igjen.');
      pinBuffer = '';
      firstPin = '';
      pinMode = 'create-set';
      document.getElementById('pin-subtitle').textContent = 'Lag en kode på 4 siffer';
      updatePinDots();
      return;
    }
    try {
      const user = await api('/api/profiles', {
        method: 'POST',
        body: JSON.stringify({ name: activeProfile.name, pin }),
      });
      await enterApp(user);
    } catch (err) {
      if (err.status === 409) {
        // Navnet ble tatt av noen andre i mellomtiden - tilbake til navn-steget.
        pinBuffer = '';
        firstPin = '';
        document.getElementById('name-view').hidden = false;
        document.getElementById('pin-view').hidden = true;
        setNameError(err.message);
        return;
      }
      setPinError(err.message);
      pinBuffer = '';
      firstPin = '';
      pinMode = 'create-set';
      document.getElementById('pin-subtitle').textContent = 'Lag en kode på 4 siffer';
      updatePinDots();
    }
  }
}

async function enterApp(user) {
  applyTheme(user.theme);
  document.getElementById('username-pill').textContent = user.username;
  populateThemeSelect(user.theme);
  showApp();
  await refresh();
}

document.getElementById('pin-keypad').addEventListener('click', (e) => {
  const btn = e.target.closest('.pin-key');
  if (!btn || btn.disabled) return;
  setPinError(null);
  if (btn.id === 'pin-del') {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots();
    return;
  }
  if (pinBuffer.length >= 4) return;
  pinBuffer += btn.dataset.key;
  updatePinDots();
  if (pinBuffer.length === 4) {
    handlePinComplete();
  }
});

document.getElementById('pin-back').addEventListener('click', () => {
  const wasCreating = pinMode === 'create-set' || pinMode === 'create-confirm';
  activeProfile = null;
  pinBuffer = '';
  firstPin = '';
  setPinError(null);
  if (wasCreating) {
    document.getElementById('pin-view').hidden = true;
    document.getElementById('name-view').hidden = false;
  } else {
    showProfilePicker();
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    // ignorer - vi viser profilvelgeren uansett
  }
  state = null;
  showAuthScreen();
  await loadProfiles();
});

document.getElementById('theme-select').addEventListener('change', async (e) => {
  const theme = e.target.value;
  applyTheme(theme); // umiddelbar visuell endring
  try {
    await api('/api/theme', { method: 'PATCH', body: JSON.stringify({ theme }) });
  } catch (err) {
    showToast(err.message);
  }
});

// --- Rendring av selve appen ------------------------------------------

function render() {
  if (!state) return;

  // Pet / profile
  document.getElementById('pet-emoji').textContent = state.profile.pet.emoji;
  document.getElementById('pet-name').textContent = state.profile.pet.name;
  document.getElementById('pet-mood').textContent =
    `${state.profile.pet.mood.emoji} ${state.profile.pet.mood.label}`;
  document.getElementById('level-label').textContent = `Nivå ${state.profile.level}`;
  document.getElementById('xp-label').textContent =
    `${state.profile.xpIntoLevel} / ${state.profile.xpForNextLevel} XP`;
  const pct = Math.min(100, Math.round((state.profile.xpIntoLevel / state.profile.xpForNextLevel) * 100));
  document.getElementById('xp-fill').style.width = pct + '%';
  document.getElementById('streak').textContent = `🔥 ${state.profile.streak} dager`;
  document.getElementById('longest-streak').textContent =
    state.profile.longestStreak > 0 ? `(rekord: ${state.profile.longestStreak})` : '';

  // Yesterday (sen avslutning / avkrysning etter midnatt)
  renderYesterday();

  // Today - avsluttet dag kan fortsatt krysses av (XP justeres), men ikke
  // endres på ellers.
  document.getElementById('today-date').textContent = fmtDate(state.today.date);
  renderTaskList('today-tasks', state.today.tasks, state.today.date, false, !!state.today.reflection);
  document.getElementById('today-empty').hidden = state.today.tasks.length !== 0;
  document.getElementById('add-today-task-form').hidden = !!state.today.reflection;

  const closedBox = document.getElementById('reflection-closed');
  const formBox = document.getElementById('reflection-form');
  const openBtn = document.getElementById('open-reflection-btn');

  if (state.today.reflection) {
    const r = state.today.reflection;
    reflectionFormOpen = false;
    closedBox.hidden = false;
    formBox.hidden = true;
    openBtn.hidden = true;
    closedBox.innerHTML = `Dagen er avsluttet <span class="rating-num">${r.rating}/10</span> ${'★'.repeat(r.rating)}${'☆'.repeat(10 - r.rating)}<br>
      Du fikk <span class="xp-gain">+${r.xpAwarded} XP</span>${r.plannedOnTime ? ' · planlagt i tide 🎯' : ''}
      ${r.notes ? `<br><em>"${escapeHtml(r.notes)}"</em>` : ''}`;
  } else {
    closedBox.hidden = true;
    formBox.hidden = !reflectionFormOpen;
    openBtn.hidden = reflectionFormOpen;
  }

  // Tomorrow
  document.getElementById('tomorrow-date').textContent = fmtDate(state.tomorrow.date);
  renderTaskList('tomorrow-tasks', state.tomorrow.tasks, state.tomorrow.date, false);
  document.getElementById('tomorrow-empty').hidden = state.tomorrow.tasks.length !== 0;

  // Kalender / kommende planer
  const calDate = document.getElementById('new-calendar-task-date');
  if (!calDate.value) calDate.value = addDaysClient(state.tomorrow.date, 1);
  calDate.min = addDaysClient(state.tomorrow.date, 1);
  renderUpcoming();

  // Ukas mål
  renderGoals();

  // History
  renderHistory();
  renderWeekList();

  // Hevy
  renderHevy();
}

function addDaysClient(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function renderUpcoming() {
  const container = document.getElementById('upcoming-list');
  const empty = document.getElementById('upcoming-empty');
  const days = (state.upcoming) || [];
  container.innerHTML = '';
  if (days.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const day of days) {
    const box = document.createElement('div');
    box.className = 'upcoming-day';

    const head = document.createElement('div');
    head.className = 'upcoming-day-head';
    head.textContent = fmtDate(day.date);
    box.appendChild(head);

    const ul = document.createElement('ul');
    ul.className = 'task-list';
    populateTaskList(ul, day.tasks, day.date, false);
    box.appendChild(ul);

    container.appendChild(box);
  }
}

let yesterdayRating = 0;

function renderYesterday() {
  const card = document.getElementById('yesterday-card');
  const y = state.yesterday;
  if (!y) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  document.getElementById('yesterday-date').textContent = fmtDate(y.date);
  renderTaskList('yesterday-tasks', y.tasks, y.date, false, true);

  const hint = document.getElementById('yesterday-hint');
  const closedBox = document.getElementById('yesterday-closed');
  const form = document.getElementById('yesterday-form');
  if (y.reflection) {
    hint.textContent = 'Dagen er avsluttet, men du kan fortsatt krysse av det du fikk gjort – XP-en justeres.';
    closedBox.hidden = false;
    closedBox.innerHTML = `Avsluttet <span class="rating-num">${y.reflection.rating}/10</span> · <span class="xp-gain">+${y.reflection.xpAwarded} XP</span>`;
    form.hidden = true;
  } else {
    hint.textContent = 'Ble ikke avsluttet. Kryss av det du fikk gjort og avslutt dagen – du får full XP og streak, og trekket for dagen gis tilbake.';
    closedBox.hidden = true;
    form.hidden = false;
  }
}

document.getElementById('yesterday-stars').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  yesterdayRating = Number(btn.dataset.value);
  document.querySelectorAll('#yesterday-stars button').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.value) <= yesterdayRating);
  });
});

document.getElementById('submit-yesterday').addEventListener('click', async () => {
  if (!state.yesterday) return;
  if (!yesterdayRating) {
    showToast('Velg en vurdering fra 1-10 stjerner først.');
    return;
  }
  const notes = document.getElementById('yesterday-notes').value;
  try {
    const res = await api('/api/reflection', {
      method: 'POST',
      body: JSON.stringify({ rating: yesterdayRating, notes, date: state.yesterday.date }),
    });
    setState(res);
    yesterdayRating = 0;
    document.getElementById('yesterday-notes').value = '';
    document.querySelectorAll('#yesterday-stars button').forEach((b) => b.classList.remove('active'));
    render();
    const lr = res.lastReflection;
    let msg = `+${lr.xpAwarded} XP for i går! Streak: ${lr.streak} 🔥`;
    if (lr.penaltyRefunded) msg += ` (+${lr.penaltyRefunded} XP tilbake)`;
    if (lr.leveledUp) msg = `🎉 Nivå opp! Nå nivå ${lr.newLevel}. ` + msg;
    showToast(msg, 6000);
  } catch (err) {
    showToast(err.message);
  }
});

function renderTaskList(elId, tasks, date, locked, checkOnly = false) {
  populateTaskList(document.getElementById(elId), tasks, date, locked, checkOnly);
}

// locked: helt låst (ingen avkrysning). checkOnly: kan krysses av, men ikke
// flyttes eller slettes (brukes for avsluttede dager og "I går").
function populateTaskList(ul, tasks, date, locked, checkOnly = false) {
  ul.innerHTML = '';
  tasks.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = 'task-item' + (t.done ? ' done' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = t.done;
    cb.disabled = locked;
    cb.addEventListener('change', () => toggleTask(date, t.id, cb.checked));
    const span = document.createElement('span');
    span.className = 'title';
    span.textContent = t.title;
    li.appendChild(cb);
    li.appendChild(span);
    if (t.goalId) {
      // Hverdagsmål fra "Uka" - kan krysses av, men fjernes derfra.
      li.classList.add('goal-task');
      const tag = document.createElement('span');
      tag.className = 'goal-tag';
      tag.textContent = 'Ukemål';
      tag.title = 'Hverdagsmål fra «Uka» – endres der';
      li.appendChild(tag);
    }
    if (!locked && !checkOnly) {
      const moveBox = document.createElement('span');
      moveBox.className = 'move-buttons';

      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'move-btn';
      up.textContent = '▲';
      up.title = 'Flytt opp';
      up.disabled = i === 0;
      up.addEventListener('click', () => moveTask(date, t.id, 'up'));

      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'move-btn';
      down.textContent = '▼';
      down.title = 'Flytt ned';
      down.disabled = i === tasks.length - 1;
      down.addEventListener('click', () => moveTask(date, t.id, 'down'));

      moveBox.append(up, down);
      li.appendChild(moveBox);

      if (!t.goalId) {
        const rm = document.createElement('button');
        rm.className = 'remove';
        rm.textContent = '✕';
        rm.title = 'Fjern';
        rm.addEventListener('click', () => removeTask(date, t.id));
        li.appendChild(rm);
      }
    }
    ul.appendChild(li);
  });
}

function renderHistory() {
  const grid = document.getElementById('history-grid');
  grid.innerHTML = '';
  for (const day of state.history) {
    const cell = document.createElement('div');
    cell.className = 'history-cell';
    if (day.closed) {
      cell.classList.add('closed');
      cell.style.opacity = (0.35 + day.completionRate * 0.65).toFixed(2);
    } else if (day.total > 0) {
      cell.classList.add('open');
      cell.style.opacity = '0.5';
    }
    const pct = day.total > 0 ? Math.round(day.completionRate * 100) : null;
    cell.title = `${day.date}${day.closed ? ` · ${pct}% fullført · ${day.rating}★` : day.total ? ' · ikke avsluttet' : ' · ingen data'}`;
    grid.appendChild(cell);
  }
}

// --- Faner ------------------------------------------------------------

const TAB_KEY = 'disiplin.tab';
const TABS = ['today', 'week', 'later', 'progress'];

function showTab(name) {
  if (!TABS.includes(name)) name = 'today';
  document.querySelectorAll('#tabbar .tab').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.hidden = p.dataset.panel !== name;
  });
  try {
    localStorage.setItem(TAB_KEY, name);
  } catch (e) {
    // privat modus o.l. - fanevalget huskes bare ikke
  }
}

document.getElementById('tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (btn) showTab(btn.dataset.tab);
});

(function restoreTab() {
  let saved = null;
  try {
    saved = localStorage.getItem(TAB_KEY);
  } catch (e) {
    saved = null;
  }
  showTab(saved || 'today');
})();

// --- Ukas mål ---------------------------------------------------------

let newGoalDaily = true;
const WEEKDAY_SHORT = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'];
const GOAL_KIND_HINT = {
  daily: 'Legges automatisk inn i «I dag» hver dag og fortsetter uke etter uke.',
  weekly: 'Krysses av én gang når det er gjort. Gjelder bare denne uka.',
};
const HABIT_STATUS_LABEL = {
  done: 'gjort',
  open: 'ikke gjort enda – trykk for å krysse av',
  missed: 'ikke gjort',
  future: 'kommer',
  before: 'før målet ble laget',
};

function fmtShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('no-NO', { day: 'numeric', month: 'short' });
}

function renderGoals() {
  const wg = state.weekGoals;
  if (!wg) return;
  document.getElementById('goals-week-label').textContent =
    `Uke ${wg.isoWeek} · ${fmtShortDate(wg.dates[0])} – ${fmtShortDate(wg.dates[6])}`;

  const hasDaily = wg.daily.length > 0;
  const hasWeekly = wg.weekly.length > 0;
  document.getElementById('goals-daily-section').hidden = !hasDaily;
  document.getElementById('goals-weekly-section').hidden = !hasWeekly;
  document.getElementById('goals-empty').hidden = hasDaily || hasWeekly;

  const done = wg.daily.reduce((s, g) => s + g.doneCount, 0) + wg.weekly.filter((g) => g.done).length;
  const possible = wg.daily.reduce((s, g) => s + g.possible, 0) + wg.weekly.length;
  const pct = possible ? Math.round((done / possible) * 100) : 0;
  document.getElementById('goals-progress').hidden = possible === 0;
  document.getElementById('goals-progress-fill').style.width = pct + '%';
  document.getElementById('goals-progress-label').textContent = `${done} av ${possible} · ${pct}%`;

  renderHabitGrid(wg);
  renderWeeklyGoals(wg);

  // Merke på "Uka"-fanen: hvor mange hverdagsmål som gjenstår i dag.
  const openToday = wg.daily.filter((g) => g.days.some((d) => d.date === wg.today && d.status === 'open')).length;
  const tab = document.querySelector('#tabbar .tab[data-tab="week"]');
  let badge = tab.querySelector('.tab-badge');
  if (openToday > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tab-badge';
      tab.appendChild(badge);
    }
    badge.textContent = openToday;
    badge.title = `${openToday} hverdagsmål igjen i dag`;
  } else if (badge) {
    badge.remove();
  }
}

function renderHabitGrid(wg) {
  const grid = document.getElementById('habit-grid');
  grid.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'habit-row habit-head';
  head.appendChild(document.createElement('span'));
  wg.dates.forEach((date, i) => {
    const c = document.createElement('span');
    c.className = 'habit-day' + (date === wg.today ? ' is-today' : '');
    c.textContent = WEEKDAY_SHORT[i];
    head.appendChild(c);
  });
  head.appendChild(document.createElement('span'));
  head.appendChild(document.createElement('span'));
  grid.appendChild(head);

  for (const g of wg.daily) {
    const row = document.createElement('div');
    row.className = 'habit-row' + (g.fullWeek ? ' full-week' : '');

    const name = document.createElement('span');
    name.className = 'habit-name';
    name.textContent = g.title;
    name.title = g.title;
    row.appendChild(name);

    for (const d of g.days) {
      const box = document.createElement('button');
      box.type = 'button';
      box.className = `habit-box ${d.status}` + (d.date === wg.today ? ' is-today' : '');
      box.disabled = !d.editable;
      const label = `${fmtDate(d.date)}: ${HABIT_STATUS_LABEL[d.status]}`;
      box.title = label;
      box.setAttribute('aria-label', `${g.title}, ${label}`);
      if (d.status === 'done') box.textContent = '✓';
      if (d.editable) box.addEventListener('click', () => toggleHabit(g, d));
      row.appendChild(box);
    }

    const count = document.createElement('span');
    count.className = 'habit-count';
    count.textContent = g.fullWeek ? '7/7 🔥' : `${g.doneCount}/${g.possible}`;
    row.appendChild(count);

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'goal-remove';
    rm.textContent = '✕';
    rm.title = 'Fjern målet';
    rm.addEventListener('click', () => deleteGoal(g));
    row.appendChild(rm);

    grid.appendChild(row);
  }
}

function renderWeeklyGoals(wg) {
  const ul = document.getElementById('weekly-goal-list');
  ul.innerHTML = '';
  for (const g of wg.weekly) {
    const li = document.createElement('li');
    li.className = 'task-item weekly-goal' + (g.done ? ' done' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = g.done;
    cb.addEventListener('change', () => toggleWeeklyGoal(g));
    const span = document.createElement('span');
    span.className = 'title';
    span.textContent = g.title;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'remove';
    rm.textContent = '✕';
    rm.title = 'Fjern målet';
    rm.addEventListener('click', () => deleteGoal(g));
    li.append(cb, span, rm);
    ul.appendChild(li);
  }
}

async function toggleHabit(goal, day) {
  const wasFull = goal.fullWeek;
  try {
    setState(await api(`/api/tasks/${day.date}/${day.taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: day.status !== 'done' }),
    }));
    render();
    const g = state.weekGoals.daily.find((x) => x.id === goal.id);
    if (g && g.fullWeek && !wasFull) showToast(`🔥 ${g.title}: 7 av 7 dager! +10 XP bonus`);
  } catch (err) {
    showToast(err.message);
  }
}

async function toggleWeeklyGoal(goal) {
  try {
    setState(await api(`/api/goals/${goal.id}/toggle`, { method: 'POST' }));
    render();
    if (!goal.done) showToast(`🎯 ${goal.title} – +10 XP`);
  } catch (err) {
    showToast(err.message);
    render();
  }
}

async function deleteGoal(goal) {
  if (!confirm(`Fjerne målet «${goal.title}»?`)) return;
  try {
    setState(await api(`/api/goals/${goal.id}`, { method: 'DELETE' }));
    render();
  } catch (err) {
    showToast(err.message);
  }
}

document.getElementById('goal-kind').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  newGoalDaily = btn.dataset.daily === '1';
  document.querySelectorAll('#goal-kind .seg-btn').forEach((b) => {
    const on = b === btn;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  document.getElementById('goal-kind-hint').textContent = newGoalDaily ? GOAL_KIND_HINT.daily : GOAL_KIND_HINT.weekly;
});

document.getElementById('add-goal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('new-goal-title');
  const title = input.value.trim();
  if (!title) return;
  try {
    setState(await api('/api/goals', {
      method: 'POST',
      body: JSON.stringify({ title, daily: newGoalDaily }),
    }));
    input.value = '';
    render();
  } catch (err) {
    showToast(err.message);
  }
});

// --- Uke-oversikt (sidekolonne): uker som faner, dager m/ sjekkliste og vurdering ---

let openWeeks = new Set();

// Legger `n` dager til en YYYY-MM-DD-streng, kalenderdato-trygt (ingen
// tidssone-glidning siden vi kun regner med datokomponentene).
function addDaysLocal(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Terskel-klasse for vurdering (gjenbrukes på både ukesnittet og
// enkeltdager) - samme fargespråk som "siste 14 dager"-rutenettet.
function ratingTierClass(rating) {
  if (rating == null) return '';
  if (rating >= 7) return 'tier-high';
  if (rating >= 4) return 'tier-mid';
  return 'tier-low';
}

function renderWeekList() {
  const container = document.getElementById('week-list');
  const empty = document.getElementById('week-list-empty');
  const weeks = (state.weekly && state.weekly.weeks) || [];
  container.innerHTML = '';

  if (weeks.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  weeks.forEach((week, idx) => {
    // Nyeste uke er åpen som standard ved første visning.
    if (idx === 0 && !container.dataset.initialized) {
      openWeeks.add(week.weekStart);
    }
    const isOpen = openWeeks.has(week.weekStart);

    const tab = document.createElement('div');
    tab.className = 'week-tab' + (isOpen ? ' open' : '');

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'week-header';

    const chevron = document.createElement('span');
    chevron.className = 'week-chevron';
    chevron.textContent = '▸';

    const title = document.createElement('span');
    title.className = 'week-title';
    title.textContent = `Uke ${week.isoWeek}`;

    const avg = document.createElement('span');
    avg.className = 'week-avg ' + ratingTierClass(week.avgRating);
    const dayWord = week.days.length === 1 ? 'dag' : 'dager';
    avg.textContent = week.avgRating != null
      ? `⭐ ${week.avgRating}/10 · ${week.days.length} ${dayWord}`
      : `${week.days.length} ${dayWord}`;

    header.append(chevron, title, avg);
    header.addEventListener('click', () => {
      if (openWeeks.has(week.weekStart)) openWeeks.delete(week.weekStart);
      else openWeeks.add(week.weekStart);
      renderWeekList();
    });

    // Mini ukeglimt - 7 prikker (man-søn), alltid synlig selv når fanen er
    // lukket, så man ser formen på uken uten å måtte åpne den.
    const preview = document.createElement('div');
    preview.className = 'week-preview';
    for (let i = 0; i < 7; i += 1) {
      const dotDate = addDaysLocal(week.weekStart, i);
      const match = week.days.find((d) => d.date === dotDate);
      const dot = document.createElement('span');
      dot.className = 'week-dot';
      if (match && match.rating != null) {
        dot.classList.add('closed', ratingTierClass(match.rating));
        dot.style.opacity = (0.4 + (match.rating / 10) * 0.6).toFixed(2);
        dot.title = `${fmtDate(dotDate)} · ${match.rating}/10 ★`;
      } else if (match && match.tasks.length > 0) {
        dot.classList.add('open');
        dot.title = `${fmtDate(dotDate)} · ikke avsluttet`;
      } else {
        dot.title = fmtDate(dotDate);
      }
      preview.appendChild(dot);
    }

    const daysBox = document.createElement('div');
    daysBox.className = 'week-days';

    for (const day of week.days) {
      const entry = document.createElement('div');
      entry.className = 'day-entry';

      const head = document.createElement('div');
      head.className = 'day-entry-head';
      const dateSpan = document.createElement('span');
      dateSpan.className = 'day-date';
      dateSpan.textContent = fmtDate(day.date);
      head.appendChild(dateSpan);
      if (day.rating != null) {
        const ratingSpan = document.createElement('span');
        ratingSpan.className = 'day-rating ' + ratingTierClass(day.rating);
        ratingSpan.textContent = `${day.rating}/10 ★`;
        head.appendChild(ratingSpan);
      }
      entry.appendChild(head);

      if (day.tasks.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'day-checklist';
        for (const t of day.tasks) {
          const li = document.createElement('li');
          li.className = t.done ? 'done' : '';
          li.textContent = t.title;
          ul.appendChild(li);
        }
        entry.appendChild(ul);
      }

      if (day.notes) {
        const p = document.createElement('p');
        p.className = 'day-notes';
        p.textContent = `"${day.notes}"`;
        entry.appendChild(p);
      }

      daysBox.appendChild(entry);
    }

    tab.append(header, preview, daysBox);
    container.appendChild(tab);
  });

  container.dataset.initialized = '1';
}

// --- Hevy-integrasjon -------------------------------------------------

function prettyMuscleGroup(key) {
  if (!key) return 'Annet';
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function renderHevy() {
  const h = state.hevy || { connected: false };
  const disc = document.getElementById('hevy-disconnected');
  const conn = document.getElementById('hevy-connected');
  const weekLabel = document.getElementById('hevy-week-label');
  const calRow = document.getElementById('calendar-hevy-row');

  if (!h.connected) {
    disc.hidden = false;
    conn.hidden = true;
    weekLabel.textContent = 'Ikke koblet til';
    calRow.hidden = true;
    return;
  }

  disc.hidden = true;
  conn.hidden = false;
  calRow.hidden = false;

  const week = h.week || { totalVolume: 0, muscleGroups: {} };
  weekLabel.textContent = `${week.totalVolume.toLocaleString('no-NO')} kg denne uken`;

  const statusEl = document.getElementById('hevy-sync-status');
  if (h.lastSyncError) {
    statusEl.textContent = `⚠️ ${h.lastSyncError}`;
  } else if (h.lastSyncAt) {
    const d = new Date(h.lastSyncAt);
    statusEl.textContent = `Sist synkronisert: ${d.toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })} kl. ${d.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    statusEl.textContent = 'Ikke synkronisert enda.';
  }

  renderHevyChart(week.muscleGroups || {});
}

function fmtSets(n) {
  // Sekundære muskelgrupper teller med 0.5 sett, så tallet kan ha én
  // desimal - vis det bare når det faktisk trengs (12 i stedet for 12.0).
  const rounded = Math.round(n * 10) / 10;
  const str = Number.isInteger(rounded) ? String(rounded) : rounded.toLocaleString('no-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${str} sett`;
}

function renderHevyChart(muscleGroups) {
  const chart = document.getElementById('hevy-chart');
  const empty = document.getElementById('hevy-empty');
  chart.innerHTML = '';
  const entries = Object.entries(muscleGroups).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  const max = Math.max(...entries.map(([, sets]) => sets), 1);
  for (const [group, sets] of entries) {
    const row = document.createElement('div');
    row.className = 'hevy-bar-row';

    const label = document.createElement('span');
    label.className = 'hevy-bar-label';
    label.textContent = prettyMuscleGroup(group);

    const track = document.createElement('div');
    track.className = 'hevy-bar-track';
    const fill = document.createElement('div');
    fill.className = 'hevy-bar-fill';
    fill.style.width = Math.max(4, Math.round((sets / max) * 100)) + '%';
    track.appendChild(fill);

    const value = document.createElement('span');
    value.className = 'hevy-bar-value';
    value.textContent = fmtSets(sets);

    row.append(label, track, value);
    chart.appendChild(row);
  }
}

document.getElementById('hevy-connect-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('hevy-api-key-input');
  const apiKey = input.value.trim();
  if (!apiKey) return;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Kobler til…';
  try {
    setState(await api('/api/hevy/key', { method: 'POST', body: JSON.stringify({ apiKey }) }));
    input.value = '';
    render();
    showToast('Koblet til Hevy! 💪');
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Koble til';
  }
});

document.getElementById('hevy-sync-btn').addEventListener('click', async () => {
  const btn = document.getElementById('hevy-sync-btn');
  btn.disabled = true;
  btn.textContent = 'Synkroniserer…';
  try {
    setState(await api('/api/hevy/sync', { method: 'POST' }));
    render();
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Synkroniser ↻';
  }
});

document.getElementById('hevy-disconnect-btn').addEventListener('click', async () => {
  if (!confirm('Koble fra Hevy? Du kan koble til igjen når som helst.')) return;
  try {
    setState(await api('/api/hevy/key', { method: 'DELETE' }));
    render();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('hevy-routine-refresh').addEventListener('click', async () => {
  const sel = document.getElementById('hevy-routine-select');
  try {
    const res = await api('/api/hevy/routines');
    sel.innerHTML = '<option value="">Velg en Hevy-rutine…</option>';
    for (const r of res.routines) {
      const opt = document.createElement('option');
      opt.value = r.title;
      opt.textContent = r.title;
      sel.appendChild(opt);
    }
    showToast(`Hentet ${res.routines.length} rutiner fra Hevy.`);
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('hevy-routine-select').addEventListener('change', (e) => {
  const val = e.target.value;
  if (val) document.getElementById('new-calendar-task-title').value = val;
});

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// Setter ny tilstand, og viser en varsling hvis serveren nettopp har trukket
// fra XP for inaktive dager (se applyInactivityPenalty i lib/gamification.js).
function setState(newState) {
  state = newState;
  if (state && state.penalty) {
    const dayWord = state.penalty.days === 1 ? 'dag' : 'dager';
    showToast(`😴 -${state.penalty.xp} XP for ${state.penalty.days} ${dayWord} uten kveldsrefleksjon`, 6000);
  }
}

async function refresh() {
  try {
    setState(await api('/api/state'));
    render();
    loadLeaderboard();
  } catch (err) {
    if (err.status === 401) {
      showAuthScreen();
      await loadProfiles();
      return;
    }
    showToast(err.message);
  }
}

async function loadLeaderboard() {
  try {
    const res = await api('/api/leaderboard');
    renderLeaderboard(res.leaderboard);
  } catch (err) {
    // Leaderboardet er ikke kritisk - feiler den, lar vi resten av appen stå.
  }
}

function renderLeaderboard(rows) {
  const list = document.getElementById('leaderboard-list');
  const empty = document.getElementById('leaderboard-empty');
  list.innerHTML = '';
  if (rows.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  rows.forEach((row, i) => {
    const li = document.createElement('li');
    li.className = 'leaderboard-row' + (row.isYou ? ' you' : '');

    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;

    const pet = document.createElement('span');
    pet.className = 'leaderboard-pet';
    pet.textContent = row.petEmoji;

    const name = document.createElement('span');
    name.className = 'leaderboard-name';
    name.textContent = row.username + (row.isYou ? ' (deg)' : '');

    const stats = document.createElement('span');
    stats.className = 'leaderboard-stats';
    stats.innerHTML = `<span class="lvl">Nivå ${row.level}</span><span>${row.totalXp} XP</span><span class="streak">🔥 ${row.streak}</span>`;

    li.append(rank, pet, name, stats);
    list.appendChild(li);
  });
}

async function toggleTask(date, id, done) {
  setState(await api(`/api/tasks/${date}/${id}`, { method: 'PATCH', body: JSON.stringify({ done }) }));
  render();
}

async function removeTask(date, id) {
  setState(await api(`/api/tasks/${date}/${id}`, { method: 'DELETE' }));
  render();
}

async function moveTask(date, id, direction) {
  setState(await api(`/api/tasks/${date}/${id}/move`, {
    method: 'POST',
    body: JSON.stringify({ direction }),
  }));
  render();
}

document.getElementById('add-task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('new-task-title');
  const title = input.value.trim();
  if (!title) return;
  try {
    setState(await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ date: state.tomorrow.date, title }),
    }));
    input.value = '';
    render();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('add-calendar-task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dateInput = document.getElementById('new-calendar-task-date');
  const titleInput = document.getElementById('new-calendar-task-title');
  const date = dateInput.value;
  const title = titleInput.value.trim();
  if (!date) {
    showToast('Velg en dato først.');
    return;
  }
  if (!title) return;
  try {
    setState(await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ date, title }),
    }));
    titleInput.value = '';
    render();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('add-today-task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('new-today-task-title');
  const title = input.value.trim();
  if (!title) return;
  try {
    setState(await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ date: state.today.date, title }),
    }));
    input.value = '';
    render();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('open-reflection-btn').addEventListener('click', () => {
  reflectionFormOpen = true;
  render();
});

document.getElementById('rating-stars').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  selectedRating = Number(btn.dataset.value);
  document.querySelectorAll('#rating-stars button').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.value) <= selectedRating);
  });
});

document.getElementById('submit-reflection').addEventListener('click', async () => {
  if (!selectedRating) {
    showToast('Velg en vurdering fra 1-10 stjerner først.');
    return;
  }
  const notes = document.getElementById('reflection-notes').value;
  try {
    const res = await api('/api/reflection', {
      method: 'POST',
      body: JSON.stringify({ rating: selectedRating, notes }),
    });
    state = res;
    selectedRating = 0;
    document.getElementById('reflection-notes').value = '';
    render();
    const lr = res.lastReflection;
    let msg = `+${lr.xpAwarded} XP! Streak: ${lr.streak} 🔥`;
    if (lr.leveledUp) msg = `🎉 Nivå opp! Nå nivå ${lr.newLevel}. ` + msg;
    if (!lr.plannedOnTime) msg += ' (Planlegg kvelden før for +5 XP bonus!)';
    if (res.penalty) msg += ` (😴 -${res.penalty.xp} XP for ${res.penalty.days} ${res.penalty.days === 1 ? 'dag' : 'dager'} uten refleksjon)`;
    showToast(msg, 6000);
  } catch (err) {
    showToast(err.message);
  }
});

boot();
