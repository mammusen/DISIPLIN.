// Hevy API-klient. Ingen ekstra avhengighet - bruker Node sin innebygde
// https-modul. Dokumentasjon: https://api.hevyapp.com/docs/
//
// Autentisering skjer med en "api-key"-header (krever Hevy Pro for å lage
// en nøkkel i Hevy-appen under Innstillinger → Developer).
const https = require('https');

const HOST = 'api.hevyapp.com';

function request(apiKey, pathWithQuery) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      path: pathWithQuery,
      method: 'GET',
      headers: { 'api-key': apiKey, Accept: 'application/json' },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => {
        data += c;
      });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          return reject(Object.assign(new Error('Ugyldig Hevy API-nøkkel'), { code: 'HEVY_UNAUTHORIZED' }));
        }
        if (res.statusCode >= 400) {
          return reject(new Error(`Hevy svarte med en feil (${res.statusCode})`));
        }
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(new Error('Klarte ikke å tolke svaret fra Hevy'));
        }
      });
    });
    req.on('error', () => reject(new Error('Fikk ikke kontakt med Hevy')));
    req.setTimeout(15000, () => req.destroy(new Error('Tidsavbrudd mot Hevy')));
    req.end();
  });
}

// Hevy sin respons-wrapper har én nøkkel som matcher ressursnavnet
// ("workouts", "routines", "exercise_templates"). Denne er litt defensiv
// rundt det, i tilfelle den skulle avvike noe fra det som er dokumentert.
function extractList(json, listKey) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json[listKey])) return json[listKey];
  const firstArray = Object.values(json || {}).find((v) => Array.isArray(v));
  return firstArray || [];
}

async function testApiKey(apiKey) {
  await request(apiKey, '/v1/workouts?page=1&pageSize=1');
  return true;
}

// Henter økter (nyeste først, ifølge Hevy) side for side til vi passerer
// `sinceDateStr` (YYYY-MM-DD), eller går tom for sider. pageSize er maks 10
// for dette endepunktet.
async function fetchWorkoutsSince(apiKey, sinceDateStr) {
  const since = new Date(sinceDateStr + 'T00:00:00Z').getTime();
  const pageSize = 10;
  const all = [];
  for (let page = 1; page <= 60; page += 1) {
    const json = await request(apiKey, `/v1/workouts?page=${page}&pageSize=${pageSize}`);
    const batch = extractList(json, 'workouts');
    if (batch.length === 0) break;
    all.push(...batch);
    const oldest = batch[batch.length - 1];
    const oldestTime = oldest && oldest.start_time ? new Date(oldest.start_time).getTime() : null;
    if (oldestTime != null && oldestTime < since) break;
    if (batch.length < pageSize) break;
  }
  return all.filter((w) => w.start_time && new Date(w.start_time).getTime() >= since);
}

// Henter hele øvelsesbiblioteket (inkl. ev. egendefinerte øvelser) - brukes
// til å slå opp muskelgruppe per øvelse. pageSize maks 100.
async function fetchAllExerciseTemplates(apiKey) {
  const pageSize = 100;
  const all = [];
  for (let page = 1; page <= 30; page += 1) {
    const json = await request(apiKey, `/v1/exercise_templates?page=${page}&pageSize=${pageSize}`);
    const batch = extractList(json, 'exercise_templates');
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

// Henter brukerens lagrede rutiner (maler uten dato - Hevys API har ingen
// "planlagt dato" for en rutine). Brukes til en enkel "velg fra Hevy"-liste
// i kalenderen, maks 50 stk.
async function fetchRoutines(apiKey) {
  const pageSize = 10;
  const all = [];
  for (let page = 1; page <= 5; page += 1) {
    const json = await request(apiKey, `/v1/routines?page=${page}&pageSize=${pageSize}`);
    const batch = extractList(json, 'routines');
    if (batch.length === 0) break;
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

function prettyMuscleGroup(key) {
  if (!key) return 'Annet';
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Totalt løftet volum (kg × reps, summert per sett) per muskelgruppe per
// uke. Primær muskelgruppe telles fullt, hver sekundær muskelgruppe telles
// med halv vekt - en vanlig tilnærming for å unngå at én økt teller fullt
// på alle involverte muskler samtidig.
function computeWeeklyLoad(workouts, templatesById, weekStartFn) {
  const weeks = {};
  for (const w of workouts) {
    if (!w.start_time) continue;
    const dateStr = new Date(w.start_time).toISOString().slice(0, 10);
    const weekStart = weekStartFn(dateStr);
    if (!weeks[weekStart]) weeks[weekStart] = {};
    for (const ex of w.exercises || []) {
      const tmpl = templatesById[ex.exercise_template_id];
      if (!tmpl) continue;
      const groups = [{ key: tmpl.primary_muscle_group, factor: 1 }].concat(
        (tmpl.secondary_muscle_groups || []).map((g) => ({ key: g, factor: 0.5 }))
      );
      for (const set of ex.sets || []) {
        const vol = (set.weight_kg || 0) * (set.reps || 0);
        if (vol <= 0) continue;
        for (const g of groups) {
          if (!g.key) continue;
          weeks[weekStart][g.key] = (weeks[weekStart][g.key] || 0) + vol * g.factor;
        }
      }
    }
  }
  for (const wk of Object.values(weeks)) {
    for (const k of Object.keys(wk)) wk[k] = Math.round(wk[k]);
  }
  return weeks;
}

module.exports = {
  testApiKey,
  fetchWorkoutsSince,
  fetchAllExerciseTemplates,
  fetchRoutines,
  computeWeeklyLoad,
  prettyMuscleGroup,
};
