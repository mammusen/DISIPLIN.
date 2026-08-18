let state = null;
let selectedRating = 0;
let reflectionFormOpen = false;

const THEMES = [
  { key: 'dark', label: 'Mørk' },
  { key: 'girly', label: 'Girly' },
  { key: 'ocean', label: 'Hav' },
  { key: 'forest', label: 'Skog' },
  { key: 'sunset', label: 'Solnedgang' },
];

async function api(url, opts) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const body = await res.json();
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

const AVATAR_COLORS = ['#e8a0a8', '#a0c4e8', '#e8c8a0', '#b0d8a8', '#c8a8e0', '#e8d0a0'];

let profiles = [];
let activeProfile = null; // { slot, name, claimed }
let pinMode = null; // 'unlock' | 'claim-set' | 'claim-confirm'
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
    tile.className = 'profile-tile' + (p.claimed ? '' : ' unclaimed');
    const avatar = document.createElement('div');
    avatar.className = 'profile-avatar';
    avatar.style.background = AVATAR_COLORS[i % AVATAR_COLORS.length];
    avatar.textContent = (p.name || '?').charAt(0).toUpperCase();
    if (!p.claimed) {
      const plus = document.createElement('span');
      plus.className = 'profile-add-badge';
      plus.textContent = '+';
      avatar.appendChild(plus);
    }
    const label = document.createElement('span');
    label.className = 'profile-label';
    label.textContent = p.name;
    tile.append(avatar, label);
    tile.addEventListener('click', () => openPinView(p));
    grid.appendChild(tile);
  });
}

function showProfilePicker() {
  document.getElementById('profile-picker-view').hidden = false;
  document.getElementById('pin-view').hidden = true;
}

function openPinView(profile) {
  activeProfile = profile;
  pinBuffer = '';
  firstPin = '';
  pinMode = profile.claimed ? 'unlock' : 'claim-set';
  setPinError(null);
  document.getElementById('pin-name').textContent = profile.name;
  document.getElementById('pin-subtitle').textContent = profile.claimed
    ? 'Skriv inn koden din'
    : 'Lag en kode på 4 siffer';
  const i = profiles.indexOf(profile);
  const avatar = document.getElementById('pin-avatar');
  avatar.style.background = AVATAR_COLORS[(i >= 0 ? i : 0) % AVATAR_COLORS.length];
  avatar.textContent = (profile.name || '?').charAt(0).toUpperCase();
  updatePinDots();
  document.getElementById('profile-picker-view').hidden = true;
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
      const user = await api(`/api/profiles/${activeProfile.slot}/unlock`, {
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
  if (pinMode === 'claim-set') {
    firstPin = pin;
    pinBuffer = '';
    pinMode = 'claim-confirm';
    document.getElementById('pin-subtitle').textContent = 'Bekreft koden';
    updatePinDots();
    return;
  }
  if (pinMode === 'claim-confirm') {
    if (pin !== firstPin) {
      setPinError('Kodene var ikke like. Prøv igjen.');
      pinBuffer = '';
      firstPin = '';
      pinMode = 'claim-set';
      document.getElementById('pin-subtitle').textContent = 'Lag en kode på 4 siffer';
      updatePinDots();
      return;
    }
    try {
      const user = await api(`/api/profiles/${activeProfile.slot}/claim`, {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      await enterApp(user);
    } catch (err) {
      setPinError(err.message);
      pinBuffer = '';
      firstPin = '';
      pinMode = 'claim-set';
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
  activeProfile = null;
  pinBuffer = '';
  firstPin = '';
  setPinError(null);
  showProfilePicker();
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

  // Today
  document.getElementById('today-date').textContent = fmtDate(state.today.date);
  renderTaskList('today-tasks', state.today.tasks, state.today.date, !!state.today.reflection);
  document.getElementById('today-empty').hidden = state.today.tasks.length !== 0;

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

  // History
  renderHistory();
  renderWeekList();
}

function renderTaskList(elId, tasks, date, locked) {
  const ul = document.getElementById(elId);
  ul.innerHTML = '';
  for (const t of tasks) {
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
    if (!locked) {
      const rm = document.createElement('button');
      rm.className = 'remove';
      rm.textContent = '✕';
      rm.title = 'Fjern';
      rm.addEventListener('click', () => removeTask(date, t.id));
      li.appendChild(rm);
    }
    ul.appendChild(li);
  }
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

// --- Uke-oversikt (sidekolonne): uker som faner, dager m/ sjekkliste og vurdering ---

let openWeeks = new Set();

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
    avg.className = 'week-avg';
    const dayWord = week.days.length === 1 ? 'dag' : 'dager';
    avg.textContent = week.avgRating != null
      ? `⭐ ${week.avgRating}/10 snitt · ${week.days.length} ${dayWord}`
      : `${week.days.length} ${dayWord}`;

    header.append(chevron, title, avg);
    header.addEventListener('click', () => {
      if (openWeeks.has(week.weekStart)) openWeeks.delete(week.weekStart);
      else openWeeks.add(week.weekStart);
      renderWeekList();
    });

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
        ratingSpan.className = 'day-rating';
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

    tab.append(header, daysBox);
    container.appendChild(tab);
  });

  container.dataset.initialized = '1';
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

async function refresh() {
  try {
    state = await api('/api/state');
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
  state = await api(`/api/tasks/${date}/${id}`, { method: 'PATCH', body: JSON.stringify({ done }) });
  render();
}

async function removeTask(date, id) {
  state = await api(`/api/tasks/${date}/${id}`, { method: 'DELETE' });
  render();
}

document.getElementById('add-task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('new-task-title');
  const title = input.value.trim();
  if (!title) return;
  try {
    state = await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ date: state.tomorrow.date, title }),
    });
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
    showToast('Velg en vurdering fra 1-5 stjerner først.');
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
    if (!lr.plannedOnTime) msg += ' (Planlegg kvelden før for streak-bonus!)';
    showToast(msg, 6000);
  } catch (err) {
    showToast(err.message);
  }
});

boot();
