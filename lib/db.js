const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DEFAULT_THEME } = require('./themes');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

// Åpen registrering (Netflix-stil velger, men uten faste plasser): hvem som
// helst kan opprette en ny profil med et navn og en personlig 4-sifret kode.
// Profiler identifiseres med en tilfeldig id, ikke et fast nummer.

// To lagringsmoduser:
//  - Lokalt (ingen DATABASE_URL satt): enkel JSON-fil, null oppsett.
//  - I skyen (DATABASE_URL satt, f.eks. en gratis Neon-database): Postgres,
//    slik at data overlever at gratis-hosting "sovner" og mister filsystemet.
const DATABASE_URL = process.env.DATABASE_URL;
let pool = null;

if (DATABASE_URL) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

function defaultState() {
  return {
    profile: {
      totalXp: 0,
      streak: 0,
      longestStreak: 0,
      lastClosedDate: null,
      lastPenaltyDate: null,
    },
    days: {},
  };
}

// --- Oppsett -------------------------------------------------------------

// Sjekker om en tabell finnes med en kolonne som IKKE matcher forventet
// skjema - dvs. den ble laget av en tidligere versjon av appen (f.eks. den
// aller første brukernavn+passord-løsningen, eller den midlertidige
// faste-6-profiler-løsningen med "slot" i stedet for "id"). "CREATE TABLE
// IF NOT EXISTS" rører aldri en tabell som allerede finnes, så uten denne
// sjekken ville gamle tabeller blitt stående med feil kolonner og alle
// spørringer ville feile med "column ... does not exist".
async function hasIncompatibleSchema(tableName, expectedColumn) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [tableName, expectedColumn]
  );
  const { rows: exists } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
    [tableName]
  );
  return exists.length > 0 && rows.length === 0;
}

async function ensureReady() {
  if (pool) {
    // Migrering: bytt ut tabeller fra en eldre, uforenlig versjon av
    // datamodellen (før åpen registrering med "id") med et rent oppsett.
    // Rører ikke tabeller som allerede har riktig "id"-kolonne.
    if (await hasIncompatibleSchema('states', 'id')) {
      await pool.query('DROP TABLE IF EXISTS states');
    }
    if (await hasIncompatibleSchema('profiles', 'id')) {
      await pool.query('DROP TABLE IF EXISTS profiles CASCADE');
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pin_hash TEXT NOT NULL,
        theme TEXT NOT NULL DEFAULT '${DEFAULT_THEME}'
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS states (
        id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
        data JSONB NOT NULL
      )
    `);
    return;
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify({ profiles: [], states: {} }, null, 2));
    return;
  }

  // Migrering (fil-modus): en gammel fil fra faste-plasser-versjonen har
  // profiler med "slot", ikke "id" - start på nytt i så fall.
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const isOldFormat = Array.isArray(parsed.profiles) && parsed.profiles.some((p) => p && p.slot !== undefined);
    if (isOldFormat) {
      fs.copyFileSync(DB_PATH, DB_PATH + '.pre-open-registration.' + Date.now());
      fs.writeFileSync(DB_PATH, JSON.stringify({ profiles: [], states: {} }, null, 2));
    }
  } catch (e) {
    fs.copyFileSync(DB_PATH, DB_PATH + '.broken.' + Date.now());
    fs.writeFileSync(DB_PATH, JSON.stringify({ profiles: [], states: {} }, null, 2));
  }
}

// --- Fil-modus: last/lagre hele rot-objektet ------------------------------

function loadRoot() {
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.profiles)) parsed.profiles = [];
    if (!parsed.states || typeof parsed.states !== 'object') parsed.states = {};
    return parsed;
  } catch (e) {
    fs.copyFileSync(DB_PATH, DB_PATH + '.broken.' + Date.now());
    const fresh = { profiles: [], states: {} };
    fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

function saveRoot(root) {
  fs.writeFileSync(DB_PATH, JSON.stringify(root, null, 2));
}

// --- Profiler --------------------------------------------------------------

// Offentlig liste (ingen kode/hash eksponert) - vises på velger-skjermen,
// sortert alfabetisk på navn.
async function listProfiles() {
  if (pool) {
    const { rows } = await pool.query('SELECT id, name, theme FROM profiles');
    return rows
      .map((r) => ({ id: r.id, name: r.name, theme: r.theme }))
      .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  }
  await ensureReady();
  const root = loadRoot();
  return root.profiles
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'))
    .map((p) => ({ id: p.id, name: p.name, theme: p.theme }));
}

async function getProfileInternal(id) {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM profiles WHERE id = $1', [id]);
    if (!rows[0]) return null;
    return { id: rows[0].id, name: rows[0].name, pinHash: rows[0].pin_hash, theme: rows[0].theme };
  }
  await ensureReady();
  const root = loadRoot();
  return root.profiles.find((p) => p.id === id) || null;
}

// Brukes av spill-logikken - samme "shape" som før (id/username/theme) slik
// at resten av server.js knapt trenger å endres.
async function findUserById(id) {
  const p = await getProfileInternal(id);
  if (!p) return null;
  return { id: p.id, username: p.name, theme: p.theme };
}

// Oppretter en helt ny profil med et selvvalgt navn og en personlig kode.
async function createProfile({ name, pinHash }) {
  const id = crypto.randomUUID();

  if (pool) {
    const { rows: existing } = await pool.query('SELECT 1 FROM profiles WHERE lower(name) = lower($1)', [name]);
    if (existing.length > 0) {
      throw Object.assign(new Error('Navnet er allerede i bruk'), { code: 'NAME_TAKEN' });
    }
    await pool.query('INSERT INTO profiles (id, name, pin_hash, theme) VALUES ($1, $2, $3, $4)', [
      id,
      name,
      pinHash,
      DEFAULT_THEME,
    ]);
    await pool.query('INSERT INTO states (id, data) VALUES ($1, $2)', [id, defaultState()]);
    return { id, name, theme: DEFAULT_THEME };
  }

  await ensureReady();
  const root = loadRoot();
  if (root.profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw Object.assign(new Error('Navnet er allerede i bruk'), { code: 'NAME_TAKEN' });
  }
  root.profiles.push({ id, name, pinHash, theme: DEFAULT_THEME });
  root.states[id] = defaultState();
  saveRoot(root);
  return { id, name, theme: DEFAULT_THEME };
}

async function verifyProfilePin(id, pin, verifyFn) {
  const p = await getProfileInternal(id);
  if (!p) return false;
  return verifyFn(pin, p.pinHash);
}

async function setUserTheme(id, theme) {
  if (pool) {
    await pool.query('UPDATE profiles SET theme = $1 WHERE id = $2', [theme, id]);
    return;
  }
  await ensureReady();
  const root = loadRoot();
  const p = root.profiles.find((x) => x.id === id);
  if (p) {
    p.theme = theme;
    saveRoot(root);
  }
}

// --- Per-profil dagsplan-tilstand -----------------------------------------

async function loadState(id) {
  if (pool) {
    const { rows } = await pool.query('SELECT data FROM states WHERE id = $1', [id]);
    return rows[0] ? rows[0].data : defaultState();
  }
  await ensureReady();
  const root = loadRoot();
  return root.states[id] || defaultState();
}

async function saveState(id, data) {
  if (pool) {
    await pool.query(
      `INSERT INTO states (id, data) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [id, data]
    );
    return;
  }
  await ensureReady();
  const root = loadRoot();
  root.states[id] = data;
  saveRoot(root);
}

// --- Alle profiler (for leaderboard) ---------------------------------------

async function listUsersWithStates() {
  if (pool) {
    const { rows } = await pool.query(`
      SELECT p.id, p.name, s.data
      FROM profiles p
      LEFT JOIN states s ON s.id = p.id
    `);
    return rows.map((r) => ({ id: r.id, username: r.name, state: r.data || defaultState() }));
  }
  await ensureReady();
  const root = loadRoot();
  return root.profiles.map((p) => ({ id: p.id, username: p.name, state: root.states[p.id] || defaultState() }));
}

function getDay(data, date) {
  if (!data.days[date]) {
    data.days[date] = { plannedDate: null, tasks: [], reflection: null };
  }
  return data.days[date];
}

module.exports = {
  ensureReady,
  listProfiles,
  createProfile,
  verifyProfilePin,
  findUserById,
  setUserTheme,
  loadState,
  saveState,
  listUsersWithStates,
  getDay,
  usingPostgres: !!pool,
  DB_PATH,
};
