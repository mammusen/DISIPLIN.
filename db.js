const fs = require('fs');
const path = require('path');
const { DEFAULT_THEME } = require('./themes');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

// De faste profilene på velgeren (som Netflix), i alfabetisk rekkefølge.
// Legg til/fjern navn her hvis familien endrer seg - PROFILE_SLOTS følger
// automatisk med listens lengde.
const PROFILE_NAMES = ['Amalie', 'Jo Kristian', 'Marius', 'Per Jørgen', 'Pål Andre', 'Torill Anita'];
const PROFILE_SLOTS = PROFILE_NAMES.length;

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
    },
    days: {},
  };
}

function defaultProfileRow(slot) {
  return { slot, name: PROFILE_NAMES[slot - 1] || null, pinHash: null, theme: DEFAULT_THEME };
}

// --- Oppsett -------------------------------------------------------------

// Sjekker om en tabell finnes med en kolonne som IKKE matcher forventet
// skjema - dvs. den ble laget av en tidligere versjon av appen (f.eks. den
// gamle brukernavn+passord-løsningen, som brukte "user_id" i stedet for
// "slot"). "CREATE TABLE IF NOT EXISTS" rører aldri en tabell som allerede
// finnes, så uten denne sjekken ville gamle tabeller blitt stående med feil
// kolonner og alle spørringer ville feile med "column ... does not exist".
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
    // datamodellen (før den faste 6-profils "slot"-strukturen) med et rent
    // oppsett. Rører ikke tabeller som allerede har riktig "slot"-kolonne.
    if (await hasIncompatibleSchema('states', 'slot')) {
      await pool.query('DROP TABLE IF EXISTS states');
    }
    if (await hasIncompatibleSchema('profiles', 'slot')) {
      await pool.query('DROP TABLE IF EXISTS profiles CASCADE');
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        slot INTEGER PRIMARY KEY,
        name TEXT,
        pin_hash TEXT,
        theme TEXT NOT NULL DEFAULT '${DEFAULT_THEME}'
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS states (
        slot INTEGER PRIMARY KEY REFERENCES profiles(slot) ON DELETE CASCADE,
        data JSONB NOT NULL
      )
    `);
    for (let s = 1; s <= PROFILE_SLOTS; s += 1) {
      // Sett/oppdater navnet fra PROFILE_NAMES, men rør aldri en profil som
      // allerede har fått satt en kode (pin_hash) - den tilhører noen.
      await pool.query(
        `INSERT INTO profiles (slot, name) VALUES ($1, $2)
         ON CONFLICT (slot) DO UPDATE SET name = EXCLUDED.name
         WHERE profiles.pin_hash IS NULL`,
        [s, PROFILE_NAMES[s - 1]]
      );
      await pool.query(
        'INSERT INTO states (slot, data) VALUES ($1, $2) ON CONFLICT (slot) DO NOTHING',
        [s, defaultState()]
      );
    }
    return;
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const profiles = [];
    const states = {};
    for (let s = 1; s <= PROFILE_SLOTS; s += 1) {
      profiles.push(defaultProfileRow(s));
      states[s] = defaultState();
    }
    fs.writeFileSync(DB_PATH, JSON.stringify({ profiles, states }, null, 2));
  }
}

// --- Fil-modus: last/lagre hele rot-objektet ------------------------------

function loadRoot() {
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.profiles) parsed.profiles = [];
    if (!parsed.states) parsed.states = {};
    // Sørg for at alle plasser finnes, og at navn matcher PROFILE_NAMES for
    // enhver plass som ikke er tatt i bruk enda (rør aldri en som har fått kode).
    for (let s = 1; s <= PROFILE_SLOTS; s += 1) {
      let p = parsed.profiles.find((x) => x.slot === s);
      if (!p) {
        parsed.profiles.push(defaultProfileRow(s));
      } else if (!p.pinHash && p.name !== PROFILE_NAMES[s - 1]) {
        p.name = PROFILE_NAMES[s - 1];
      }
      if (!parsed.states[s]) parsed.states[s] = defaultState();
    }
    return parsed;
  } catch (e) {
    fs.copyFileSync(DB_PATH, DB_PATH + '.broken.' + Date.now());
    const profiles = [];
    const states = {};
    for (let s = 1; s <= PROFILE_SLOTS; s += 1) {
      profiles.push(defaultProfileRow(s));
      states[s] = defaultState();
    }
    const fresh = { profiles, states };
    fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

function saveRoot(root) {
  fs.writeFileSync(DB_PATH, JSON.stringify(root, null, 2));
}

// --- Profiler --------------------------------------------------------------

// Offentlig liste (ingen kode/hash eksponert) - vises på velger-skjermen.
async function listProfiles() {
  if (pool) {
    const { rows } = await pool.query('SELECT slot, name, theme, pin_hash FROM profiles ORDER BY slot');
    return rows.map((r) => ({ slot: r.slot, name: r.name, theme: r.theme, claimed: !!r.pin_hash }));
  }
  await ensureReady();
  const root = loadRoot();
  return root.profiles
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((p) => ({ slot: p.slot, name: p.name, theme: p.theme, claimed: !!p.pinHash }));
}

async function getProfileInternal(slot) {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM profiles WHERE slot = $1', [slot]);
    if (!rows[0]) return null;
    return { slot: rows[0].slot, name: rows[0].name, pinHash: rows[0].pin_hash, theme: rows[0].theme };
  }
  await ensureReady();
  const root = loadRoot();
  return root.profiles.find((p) => p.slot === slot) || null;
}

// Brukes av spill-logikken - samme "shape" som før (id/username/theme) slik
// at resten av server.js knapt trenger å endres.
async function findUserById(slot) {
  const p = await getProfileInternal(slot);
  if (!p || !p.pinHash) return null; // ikke krevd/gyldig profil
  return { id: p.slot, username: p.name, theme: p.theme };
}

async function claimProfile(slot, { pinHash }) {
  const existing = await getProfileInternal(slot);
  if (!existing) throw Object.assign(new Error('Ugyldig profil'), { code: 'INVALID_SLOT' });
  if (existing.pinHash) throw Object.assign(new Error('Profilen er allerede tatt'), { code: 'ALREADY_CLAIMED' });

  if (pool) {
    await pool.query('UPDATE profiles SET pin_hash = $1 WHERE slot = $2', [pinHash, slot]);
    return;
  }
  await ensureReady();
  const root = loadRoot();
  const p = root.profiles.find((x) => x.slot === slot);
  p.pinHash = pinHash;
  saveRoot(root);
}

async function verifyProfilePin(slot, pin, verifyFn) {
  const p = await getProfileInternal(slot);
  if (!p || !p.pinHash) return false;
  return verifyFn(pin, p.pinHash);
}

async function setUserTheme(slot, theme) {
  if (pool) {
    await pool.query('UPDATE profiles SET theme = $1 WHERE slot = $2', [theme, slot]);
    return;
  }
  await ensureReady();
  const root = loadRoot();
  const p = root.profiles.find((x) => x.slot === slot);
  if (p) {
    p.theme = theme;
    saveRoot(root);
  }
}

// --- Per-profil dagsplan-tilstand -----------------------------------------

async function loadState(slot) {
  if (pool) {
    const { rows } = await pool.query('SELECT data FROM states WHERE slot = $1', [slot]);
    return rows[0] ? rows[0].data : defaultState();
  }
  await ensureReady();
  const root = loadRoot();
  return root.states[slot] || defaultState();
}

async function saveState(slot, data) {
  if (pool) {
    await pool.query(
      `INSERT INTO states (slot, data) VALUES ($1, $2)
       ON CONFLICT (slot) DO UPDATE SET data = EXCLUDED.data`,
      [slot, data]
    );
    return;
  }
  await ensureReady();
  const root = loadRoot();
  root.states[slot] = data;
  saveRoot(root);
}

// --- Alle brukte profiler (for leaderboard) --------------------------------

async function listUsersWithStates() {
  if (pool) {
    const { rows } = await pool.query(`
      SELECT p.slot, p.name, s.data
      FROM profiles p
      LEFT JOIN states s ON s.slot = p.slot
      WHERE p.pin_hash IS NOT NULL
    `);
    return rows.map((r) => ({ id: r.slot, username: r.name, state: r.data || defaultState() }));
  }
  await ensureReady();
  const root = loadRoot();
  return root.profiles
    .filter((p) => p.pinHash)
    .map((p) => ({ id: p.slot, username: p.name, state: root.states[p.slot] || defaultState() }));
}

function getDay(data, date) {
  if (!data.days[date]) {
    data.days[date] = { plannedDate: null, tasks: [], reflection: null };
  }
  return data.days[date];
}

module.exports = {
  ensureReady,
  PROFILE_SLOTS,
  listProfiles,
  claimProfile,
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
