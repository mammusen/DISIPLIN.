// All spillogikk samlet på ett sted, så den er lett å justere.

const { addDays } = require('./dates');

const INACTIVITY_PENALTY_XP = 15;

function levelInfo(totalXp) {
  let level = 1;
  let remaining = totalXp;
  let req = 100; // xp som trengs for å gå fra nivå 1 til 2
  while (remaining >= req) {
    remaining -= req;
    level += 1;
    req = Math.round(req * 1.25);
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: req };
}

const PET_STAGES = [
  { minLevel: 1, emoji: '🥚', name: 'Egg' },
  { minLevel: 2, emoji: '🐣', name: 'Kylling' },
  { minLevel: 4, emoji: '🐥', name: 'Unge' },
  { minLevel: 7, emoji: '🐦', name: 'Fugl' },
  { minLevel: 11, emoji: '🦅', name: 'Ørn' },
  { minLevel: 16, emoji: '🐉', name: 'Drage' },
];

function petStage(level) {
  let stage = PET_STAGES[0];
  for (const s of PET_STAGES) {
    if (level >= s.minLevel) stage = s;
  }
  return stage;
}

function petMood({ streak, daysSinceActivity }) {
  if (daysSinceActivity >= 3) return { emoji: '😢', label: 'Savner deg' };
  if (daysSinceActivity >= 2) return { emoji: '😐', label: 'Litt lei seg' };
  if (streak >= 7) return { emoji: '🤩', label: 'I ekstase' };
  if (streak >= 3) return { emoji: '😄', label: 'Blomstrer' };
  if (streak >= 1) return { emoji: '🙂', label: 'Fornøyd' };
  return { emoji: '😐', label: 'Nøytral' };
}

// Oppgave-delen av XP-en for en dag: 10 XP per fullført oppgave + inntil 20
// XP for fullføringsgrad. Skilt ut slik at den kan regnes på nytt når en
// oppgave krysses av etter at dagen allerede er avsluttet. Ukemål-oppgaver
// (goalId) telles ikke her - de gir sin egen XP direkte ved avkrysning.
function taskXpParts(allTasks) {
  const tasks = allTasks.filter((t) => !t.goalId);
  const total = tasks.length;
  const completed = tasks.filter((t) => t.done).length;
  const completionRate = total > 0 ? completed / total : 0;
  const taskXp = completed * 10;
  const completionBonus = Math.round(completionRate * 20);
  const breakdown = [];
  if (taskXp > 0) breakdown.push({ label: `${completed} fullførte oppgaver`, xp: taskXp });
  if (completionBonus > 0) breakdown.push({ label: 'Fullføringsgrad', xp: completionBonus });
  return { total, completed, completionRate, xp: taskXp + completionBonus, breakdown };
}

function isTaskBreakdownEntry(entry) {
  return entry.label === 'Fullføringsgrad' || / fullførte oppgaver$/.test(entry.label);
}

// Kalles når en oppgave krysses av/på etter at dagen er avsluttet. Justerer
// totalen og dagens registrerte XP med differansen. Returnerer differansen.
function adjustClosedDayTaskXp(data, day, tasksBefore) {
  const before = taskXpParts(tasksBefore);
  const after = taskXpParts(day.tasks);
  const delta = after.xp - before.xp;
  if (delta === 0) return 0;
  data.profile.totalXp = Math.max(0, data.profile.totalXp + delta);
  day.reflection.xpAwarded += delta;
  const rest = (day.reflection.breakdown || []).filter((e) => !isTaskBreakdownEntry(e));
  day.reflection.breakdown = after.breakdown.concat(rest);
  return delta;
}

// Antall avsluttede dager på rad som ender på `date`.
function streakEndingAt(data, date) {
  let n = 0;
  let d = date;
  while (data.days[d] && data.days[d].reflection) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

// Beregner XP for en dag som lukkes, samt om den talte som "planlagt i tide".
function computeDayClose({ tasks, rating, plannedOnTime, streakBefore }) {
  const parts = taskXpParts(tasks);
  const { total, completed, completionRate } = parts;

  let xp = parts.xp;
  const breakdown = parts.breakdown.slice();

  const ratingXp = rating * 2; // vurdering er nå 1-10, så maks bidrag holdes likt som før (20 XP)
  xp += ratingXp;
  breakdown.push({ label: 'Kveldsrefleksjon', xp: ratingXp });

  xp += 10;
  breakdown.push({ label: 'Gjennomførte refleksjonen', xp: 10 });

  if (plannedOnTime) {
    xp += 5;
    breakdown.push({ label: 'Planla kvelden før', xp: 5 });
  }

  const streakBonus = Math.min(streakBefore, 10) * 2;
  if (streakBonus > 0) {
    xp += streakBonus;
    breakdown.push({ label: `Streak-bonus (${streakBefore} dager)`, xp: streakBonus });
  }

  return { xp, breakdown, completed, total, completionRate };
}

// Trekker fra XP for hver hele dag som har passert uten at den ble avsluttet
// med en kveldsrefleksjon - "bruker du ikke appen, synker XP-en din", slik
// at fremgangen blir flytende i begge retninger og ikke bare vokser.
//
// Kjøres "lat": første gang noen faktisk åpner appen igjen (ikke via en
// bakgrunnsjobb/cron), og går da gjennom alle dagene som har samlet seg opp
// siden forrige sjekk i én omgang. Det gjør at det fungerer helt fint selv
// om den frie hosting-tjenesten har sovet i mellomtiden. Muterer `data`
// direkte (kalleren må lagre den etterpå hvis noe endret seg).
//
// Returnerer { days, xp } hvis noe ble trukket fra, ellers null.
function applyInactivityPenalty(data, today) {
  if (!data.profile.lastPenaltyDate) {
    // Første gang denne kjører for profilen (ny bruker, eller en eksisterende
    // profil rett etter at denne funksjonen ble innført) - ikke straff for
    // dager før dette tidspunktet, bare sett startpunktet for fremtidige sjekker.
    data.profile.lastPenaltyDate = addDays(today, -1);
    return null;
  }

  let missedDays = 0;
  let deducted = 0;
  let d = addDays(data.profile.lastPenaltyDate, 1);
  while (d < today) {
    const day = data.days[d];
    const wasClosed = !!(day && day.reflection);
    if (!wasClosed) {
      const before = data.profile.totalXp;
      data.profile.totalXp = Math.max(0, data.profile.totalXp - INACTIVITY_PENALTY_XP);
      const taken = before - data.profile.totalXp;
      deducted += taken;
      missedDays += 1;
      // Husk trekket per dato, så det kan tilbakeføres hvis dagen avsluttes
      // i etterkant (se refundInactivityPenalty).
      if (!data.profile.penalties) data.profile.penalties = {};
      data.profile.penalties[d] = taken;
    }
    data.profile.lastPenaltyDate = d;
    d = addDays(d, 1);
  }

  // Hold oversikten liten - bare de siste par ukene kan bli aktuelle for
  // tilbakeføring.
  if (data.profile.penalties) {
    const cutoff = addDays(today, -14);
    for (const key of Object.keys(data.profile.penalties)) {
      if (key < cutoff) delete data.profile.penalties[key];
    }
  }

  if (missedDays === 0) return null;
  return { days: missedDays, xp: deducted };
}

// Gir tilbake inaktivitetstrekket for en dag som blir avsluttet i etterkant.
// Trekk gjort før datoene ble lagret (eldre data) gjenkjennes ved at
// lastPenaltyDate allerede har passert dagen. Returnerer XP gitt tilbake.
function refundInactivityPenalty(data, date) {
  const recorded = data.profile.penalties || {};
  let amount = 0;
  if (Object.prototype.hasOwnProperty.call(recorded, date)) {
    amount = recorded[date];
    delete recorded[date];
  } else if (!data.profile.penalties && data.profile.lastPenaltyDate && data.profile.lastPenaltyDate >= date) {
    amount = INACTIVITY_PENALTY_XP;
  }
  data.profile.totalXp += amount;
  return amount;
}

module.exports = {
  levelInfo,
  petStage,
  petMood,
  computeDayClose,
  applyInactivityPenalty,
  refundInactivityPenalty,
  adjustClosedDayTaskXp,
  streakEndingAt,
  INACTIVITY_PENALTY_XP,
};
