// Ren Node.js HTTP-server - ingen eksterne avhengigheter utover "pg" (kun i skyen).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('./lib/db');
const auth = require('./lib/auth');
const { todayStr, tomorrow, yesterday, daysBetween, addDays, weekStartStr, isoWeekNumber } = require('./lib/dates');
const { levelInfo, petStage, petMood, computeDayClose, applyInactivityPenalty } = require('./lib/gamification');
const { THEME_KEYS } = require('./lib/themes');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const PIN_RE = /^\d{4}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

// --- Autentisering -------------------------------------------------------

function getUserIdFromRequest(req) {
  const cookies = auth.parseCookies(req);
  return auth.verifySessionToken(cookies.session);
}

// --- Spilltilstand ---------------------------------------------------

function historySlice(data, days = 14) {
  const today = todayStr();
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    const day = data.days[date];
    if (day && (day.tasks.length > 0 || day.reflection)) {
      const completed = day.tasks.filter((t) => t.done).length;
      const total = day.tasks.length;
      out.push({
        date,
        total,
        completed,
        closed: !!day.reflection,
        rating: day.reflection ? day.reflection.rating : null,
        completionRate: total > 0 ? completed / total : day.reflection ? 1 : 0,
      });
    } else {
      out.push({ date, total: 0, completed: 0, closed: false, rating: null, completionRate: 0 });
    }
  }
  return out;
}

// Sidekolonnen: hver dag som har oppgaver og/eller er avsluttet, gruppert
// som uke-"faner". Nyeste dag/uke først. Sjekklisten (oppgaver) og
// stjernevurderingen for dagen tas med, samt et snitt av stjernene for uken:
// (sum av alle dagers vurdering) / (antall vurderte dager).
function weeklyOverview(data) {
  const days = Object.entries(data.days)
    .filter(([, day]) => day.tasks.length > 0 || day.reflection)
    .map(([date, day]) => ({
      date,
      tasks: day.tasks.map((t) => ({ title: t.title, done: t.done })),
      rating: day.reflection ? day.reflection.rating : null,
      notes: day.reflection ? day.reflection.notes : '',
      closed: !!day.reflection,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const byWeek = new Map();
  for (const d of days) {
    const ws = weekStartStr(d.date);
    if (!byWeek.has(ws)) byWeek.set(ws, []);
    byWeek.get(ws).push(d);
  }

  const weeks = Array.from(byWeek.entries())
    .map(([weekStart, weekDays]) => {
      const { isoYear, isoWeek } = isoWeekNumber(weekStart);
      const rated = weekDays.filter((d) => d.rating != null);
      const sum = rated.reduce((s, d) => s + d.rating, 0);
      return {
        weekStart,
        isoYear,
        isoWeek,
        days: weekDays,
        ratedDayCount: rated.length,
        avgRating: rated.length > 0 ? Math.round((sum / rated.length) * 10) / 10 : null,
      };
    })
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))
    .slice(0, 12);

  return { weeks };
}

// Kalender: dager lenger fram enn i morgen som har fått lagt inn oppgaver
// på forhånd. Sortert med nærmeste dag først. Disse dukker automatisk opp
// i "I dag"-lista den dagen det gjelder, siden de lagres på samme måte.
function upcomingList(data, today) {
  const tmrw = tomorrow(today);
  return Object.entries(data.days)
    .filter(([date, day]) => date > tmrw && day.tasks.length > 0)
    .map(([date, day]) => ({
      date,
      tasks: day.tasks.map((t) => ({ id: t.id, title: t.title, done: t.done })),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function publicState(userId, username, theme) {
  const data = await db.loadState(userId);
  const today = todayStr();
  const tmrw = tomorrow(today);

  // Trekk fra XP for eventuelle hele dager siden sist som ikke ble avsluttet
  // med en kveldsrefleksjon. Lat evaluering - kjøres her fordi publicState()
  // er siste steg for absolutt alle endepunkter som returnerer tilstand.
  const penalty = applyInactivityPenalty(data, today);
  if (penalty) {
    await db.saveState(userId, data);
  }

  const li = levelInfo(data.profile.totalXp);
  const stage = petStage(li.level);

  const daysSinceActivity = data.profile.lastClosedDate
    ? daysBetween(data.profile.lastClosedDate, today)
    : 999;
  const mood = petMood({ streak: data.profile.streak, daysSinceActivity });

  const todayDay = data.days[today] || { plannedDate: null, tasks: [], reflection: null };
  const tomorrowDay = data.days[tmrw] || { plannedDate: null, tasks: [], reflection: null };

  return {
    date: today,
    user: { username, theme },
    profile: {
      ...data.profile,
      level: li.level,
      xpIntoLevel: li.xpIntoLevel,
      xpForNextLevel: li.xpForNextLevel,
      pet: { ...stage, mood },
    },
    today: { date: today, tasks: todayDay.tasks, reflection: todayDay.reflection },
    tomorrow: { date: tmrw, tasks: tomorrowDay.tasks },
    history: historySlice(data),
    weekly: weeklyOverview(data),
    upcoming: upcomingList(data, today),
    penalty,
  };
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (c) => {
      chunks += c;
      if (chunks.length > 1e6) req.destroy(); // 1MB safety cap
    });
    req.on('end', () => {
      if (!chunks) return resolve({});
      try {
        resolve(JSON.parse(chunks));
      } catch (e) {
        reject(new Error('Ugyldig JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(PUBLIC_DIR, filePath);
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Fant ikke siden');
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// --- Profil-handlers (Netflix-stil velger, åpen registrering: navn + personlig kode) ---

async function handleListProfiles(req, res) {
  const profiles = await db.listProfiles();
  sendJson(res, 200, { profiles });
}

async function handleCreateProfile(req, res) {
  const body = await readJsonBody(req);
  const name = (body.name || '').trim();
  const pin = body.pin || '';

  if (name.length < 1 || name.length > 20) {
    return sendJson(res, 400, { error: 'Navnet må være 1-20 tegn' });
  }
  if (!PIN_RE.test(pin)) {
    return sendJson(res, 400, { error: 'Koden må være nøyaktig 4 siffer' });
  }

  let profile;
  try {
    profile = await db.createProfile({ name, pinHash: auth.hashPassword(pin) });
  } catch (e) {
    if (e.code === 'NAME_TAKEN') return sendJson(res, 409, { error: 'Navnet er allerede i bruk' });
    throw e;
  }

  const token = auth.createSessionToken(profile.id);
  auth.setSessionCookie(res, token);
  sendJson(res, 200, { username: profile.name, theme: profile.theme });
}

async function handleUnlockProfile(req, res, id) {
  const body = await readJsonBody(req);
  const pin = body.pin || '';
  if (!PIN_RE.test(pin)) {
    return sendJson(res, 400, { error: 'Koden må være 4 siffer' });
  }

  const ok = await db.verifyProfilePin(id, pin, auth.verifyPassword);
  if (!ok) {
    return sendJson(res, 401, { error: 'Feil kode' });
  }

  const token = auth.createSessionToken(id);
  auth.setSessionCookie(res, token);
  const user = await db.findUserById(id);
  sendJson(res, 200, { username: user.username, theme: user.theme });
}

function handleLogout(req, res) {
  auth.clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}

async function handleMe(req, res) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return sendJson(res, 401, { error: 'Ikke innlogget' });
  const user = await db.findUserById(userId);
  if (!user) return sendJson(res, 401, { error: 'Ikke innlogget' });
  sendJson(res, 200, { username: user.username, theme: user.theme });
}

async function handleSetTheme(req, res) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return sendJson(res, 401, { error: 'Ikke innlogget' });
  const body = await readJsonBody(req);
  if (!THEME_KEYS.includes(body.theme)) {
    return sendJson(res, 400, { error: 'Ukjent tema' });
  }
  await db.setUserTheme(userId, body.theme);
  sendJson(res, 200, { theme: body.theme });
}

// --- Spill-handlers (krever innlogging) -----------------------------------

async function handleGetState(req, res, user) {
  sendJson(res, 200, await publicState(user.id, user.username, user.theme));
}

async function handleLeaderboard(req, res, user) {
  const entries = await db.listUsersWithStates();
  const rows = entries.map((entry) => {
    const li = levelInfo(entry.state.profile.totalXp);
    const stage = petStage(li.level);
    return {
      username: entry.username,
      isYou: entry.id === user.id,
      level: li.level,
      totalXp: entry.state.profile.totalXp,
      streak: entry.state.profile.streak,
      longestStreak: entry.state.profile.longestStreak,
      petEmoji: stage.emoji,
    };
  });
  rows.sort((a, b) => b.totalXp - a.totalXp || b.streak - a.streak);
  sendJson(res, 200, { leaderboard: rows });
}

async function handlePostTask(req, res, user) {
  const body = await readJsonBody(req);
  const { date, title } = body || {};
  if (!date || !title || !title.trim()) {
    return sendJson(res, 400, { error: 'date og title er påkrevd' });
  }
  const data = await db.loadState(user.id);
  const day = db.getDay(data, date);
  if (day.reflection) {
    return sendJson(res, 400, { error: 'Denne dagen er allerede avsluttet' });
  }
  if (!day.plannedDate) {
    day.plannedDate = todayStr();
  }
  day.tasks.push({
    id: crypto.randomUUID(),
    title: title.trim(),
    done: false,
    createdAt: new Date().toISOString(),
  });
  await db.saveState(user.id, data);
  sendJson(res, 200, await publicState(user.id, user.username, user.theme));
}

async function handlePatchTask(req, res, user, date, taskId) {
  const body = await readJsonBody(req);
  const data = await db.loadState(user.id);
  const day = data.days[date];
  if (!day) return sendJson(res, 404, { error: 'Fant ikke dagen' });
  const task = day.tasks.find((t) => t.id === taskId);
  if (!task) return sendJson(res, 404, { error: 'Fant ikke oppgaven' });
  task.done = !!body.done;
  await db.saveState(user.id, data);
  sendJson(res, 200, await publicState(user.id, user.username, user.theme));
}

async function handleDeleteTask(req, res, user, date, taskId) {
  const data = await db.loadState(user.id);
  const day = data.days[date];
  if (!day) return sendJson(res, 404, { error: 'Fant ikke dagen' });
  if (day.reflection) return sendJson(res, 400, { error: 'Dagen er avsluttet' });
  day.tasks = day.tasks.filter((t) => t.id !== taskId);
  await db.saveState(user.id, data);
  sendJson(res, 200, await publicState(user.id, user.username, user.theme));
}

async function handleMoveTask(req, res, user, date, taskId) {
  const body = await readJsonBody(req);
  const direction = body && body.direction;
  if (direction !== 'up' && direction !== 'down') {
    return sendJson(res, 400, { error: 'direction må være "up" eller "down"' });
  }
  const data = await db.loadState(user.id);
  const day = data.days[date];
  if (!day) return sendJson(res, 404, { error: 'Fant ikke dagen' });
  if (day.reflection) return sendJson(res, 400, { error: 'Dagen er avsluttet' });
  const idx = day.tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return sendJson(res, 404, { error: 'Fant ikke oppgaven' });
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx >= 0 && targetIdx < day.tasks.length) {
    [day.tasks[idx], day.tasks[targetIdx]] = [day.tasks[targetIdx], day.tasks[idx]];
    await db.saveState(user.id, data);
  }
  sendJson(res, 200, await publicState(user.id, user.username, user.theme));
}

async function handleReflection(req, res, user) {
  const body = await readJsonBody(req);
  const r = Number(body.rating);
  if (!r || r < 1 || r > 10) {
    return sendJson(res, 400, { error: 'rating må være 1-10' });
  }
  const data = await db.loadState(user.id);
  const today = todayStr();
  const day = db.getDay(data, today);
  if (day.reflection) {
    return sendJson(res, 400, { error: 'Dagen er allerede avsluttet' });
  }

  const plannedOnTime = day.plannedDate === yesterday(today);
  const streakBefore = data.profile.streak;
  const streakContinues = data.profile.lastClosedDate === yesterday(today);
  const result = computeDayClose({
    tasks: day.tasks,
    rating: r,
    plannedOnTime,
    streakBefore,
  });

  day.reflection = {
    rating: r,
    notes: (body.notes || '').trim(),
    closedAt: new Date().toISOString(),
    xpAwarded: result.xp,
    plannedOnTime,
    breakdown: result.breakdown,
  };

  const beforeLevel = levelInfo(data.profile.totalXp).level;
  data.profile.totalXp += result.xp;
  const afterLevel = levelInfo(data.profile.totalXp).level;

  data.profile.streak = streakContinues ? streakBefore + 1 : 1;
  data.profile.longestStreak = Math.max(data.profile.longestStreak, data.profile.streak);
  data.profile.lastClosedDate = today;

  await db.saveState(user.id, data);

  sendJson(res, 200, {
    ...(await publicState(user.id, user.username, user.theme)),
    lastReflection: {
      xpAwarded: result.xp,
      breakdown: result.breakdown,
      leveledUp: afterLevel > beforeLevel,
      newLevel: afterLevel,
      streak: data.profile.streak,
      plannedOnTime,
    },
  });
}

// --- Router -------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);

    // Offentlige profil-endepunkter (ingen innlogging krevd - dette ER selve innloggingen)
    if (pathname === '/api/profiles' && req.method === 'GET') {
      return await handleListProfiles(req, res);
    }
    if (pathname === '/api/profiles' && req.method === 'POST') {
      return await handleCreateProfile(req, res);
    }
    let pm = pathname.match(/^\/api\/profiles\/([^/]+)\/unlock$/);
    if (pm && req.method === 'POST') {
      return await handleUnlockProfile(req, res, decodeURIComponent(pm[1]));
    }
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      return handleLogout(req, res);
    }
    if (pathname === '/api/auth/me' && req.method === 'GET') {
      return await handleMe(req, res);
    }

    // Alt annet under /api/ krever innlogging
    if (pathname.startsWith('/api/')) {
      const userId = getUserIdFromRequest(req);
      if (!userId) return sendJson(res, 401, { error: 'Ikke innlogget' });
      const dbUser = await db.findUserById(userId);
      if (!dbUser) return sendJson(res, 401, { error: 'Ikke innlogget' });
      const user = { id: dbUser.id, username: dbUser.username, theme: dbUser.theme };

      if (pathname === '/api/theme' && req.method === 'PATCH') {
        return await handleSetTheme(req, res);
      }
      if (pathname === '/api/state' && req.method === 'GET') {
        return await handleGetState(req, res, user);
      }
      if (pathname === '/api/leaderboard' && req.method === 'GET') {
        return await handleLeaderboard(req, res, user);
      }
      if (pathname === '/api/tasks' && req.method === 'POST') {
        return await handlePostTask(req, res, user);
      }
      let m = pathname.match(/^\/api\/tasks\/([^/]+)\/([^/]+)$/);
      if (m && req.method === 'PATCH') {
        return await handlePatchTask(req, res, user, decodeURIComponent(m[1]), decodeURIComponent(m[2]));
      }
      if (m && req.method === 'DELETE') {
        return await handleDeleteTask(req, res, user, decodeURIComponent(m[1]), decodeURIComponent(m[2]));
      }
      let mm = pathname.match(/^\/api\/tasks\/([^/]+)\/([^/]+)\/move$/);
      if (mm && req.method === 'POST') {
        return await handleMoveTask(req, res, user, decodeURIComponent(mm[1]), decodeURIComponent(mm[2]));
      }
      if (pathname === '/api/reflection' && req.method === 'POST') {
        return await handleReflection(req, res, user);
      }
      return sendJson(res, 404, { error: 'Ukjent endepunkt' });
    }

    return serveStatic(req, res, pathname);
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Serverfeil' });
  }
});

db.ensureReady()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`DISIPLIN. kjører på http://localhost:${PORT}`);
      console.log(`Lagring: ${db.usingPostgres ? 'Postgres (DATABASE_URL)' : 'lokal fil (data/db.json)'}`);
      if (!process.env.SESSION_SECRET) {
        console.log('Tips: sett SESSION_SECRET i miljøvariabler for at innlogging skal overleve omstart av serveren.');
      }
    });
  })
  .catch((err) => {
    console.error('Klarte ikke å klargjøre lagring:', err);
    process.exit(1);
  });
