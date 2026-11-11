// Ukas mål: "hverdagsmål" (f.eks. kreatin, drikke vann) som legges inn som
// oppgaver i dagene dine automatisk, og "denne uka"-mål som krysses av én
// gang. Alt lagres i det samme per-profil JSON-objektet som resten
// (data.goals, data.goalBonuses) - ingen egen tabell trengs.

const crypto = require('crypto');
const { addDays, yesterday, weekStartStr, isoWeekNumber } = require('./dates');

const GOAL_TICK_XP = 2; // per avkrysset dag på et hverdagsmål
const GOAL_FULL_WEEK_BONUS = 10; // hverdagsmål nådd alle sju dagene i en uke
const WEEKLY_GOAL_XP = 10; // "denne uka"-mål krysset av
const MAX_GOALS = 20;

function getGoals(data) {
  if (!Array.isArray(data.goals)) data.goals = [];
  return data.goals;
}

function createGoal(data, { title, daily, today }) {
  const goal = {
    id: crypto.randomUUID(),
    title,
    daily: !!daily,
    createdAt: new Date().toISOString(),
  };
  if (goal.daily) goal.startDate = today;
  else {
    goal.weekStart = weekStartStr(today);
    goal.done = false;
  }
  getGoals(data).push(goal);
  return goal;
}

// Legger hverdagsmålene inn som oppgaver i i går og i dag (fra og med dagen
// målet ble laget). Oppgavene er merket med goalId, så de kan kobles til
// målet og ikke slettes som vanlige oppgaver. Returnerer true hvis noe ble
// lagt til (kalleren må da lagre).
function ensureGoalTasks(data, today) {
  const daily = getGoals(data).filter((g) => g.daily);
  let changed = false;
  for (const date of [yesterday(today), today]) {
    for (const g of daily) {
      if (date < g.startDate) continue;
      const day = data.days[date];
      if (day && day.tasks.some((t) => t.goalId === g.id)) continue;
      if (!data.days[date]) data.days[date] = { plannedDate: null, tasks: [], reflection: null };
      data.days[date].tasks.push({
        id: crypto.randomUUID(),
        title: g.title,
        done: false,
        goalId: g.id,
        createdAt: new Date().toISOString(),
      });
      changed = true;
    }
  }

  // Rydd bort gamle "denne uka"-mål og bonusmerker etter ca. 8 uker.
  const cutoff = addDays(weekStartStr(today), -56);
  const before = data.goals.length;
  data.goals = data.goals.filter((g) => g.daily || g.weekStart >= cutoff);
  if (data.goals.length !== before) changed = true;
  if (data.goalBonuses) {
    for (const ws of Object.keys(data.goalBonuses)) {
      if (ws < cutoff) {
        delete data.goalBonuses[ws];
        changed = true;
      }
    }
  }
  return changed;
}

function countDoneInWeek(data, goalId, weekStart) {
  let n = 0;
  for (let i = 0; i < 7; i += 1) {
    const day = data.days[addDays(weekStart, i)];
    if (day && day.tasks.some((t) => t.goalId === goalId && t.done)) n += 1;
  }
  return n;
}

// XP når en hverdagsmål-oppgave krysses av/på: +/-2 XP, og +/-10 XP i bonus
// når målet når (eller faller fra) 7 av 7 dager i uka. Returnerer endringen.
function applyGoalTickXp(data, goalId, date, nowDone, wasDone) {
  if (nowDone === wasDone) return 0;
  let delta = nowDone ? GOAL_TICK_XP : -GOAL_TICK_XP;
  const ws = weekStartStr(date);
  const count = countDoneInWeek(data, goalId, ws);
  if (!data.goalBonuses) data.goalBonuses = {};
  if (!data.goalBonuses[ws]) data.goalBonuses[ws] = {};
  const marks = data.goalBonuses[ws];
  if (count === 7 && !marks[goalId]) {
    marks[goalId] = true;
    delta += GOAL_FULL_WEEK_BONUS;
  } else if (count < 7 && marks[goalId]) {
    delete marks[goalId];
    delta -= GOAL_FULL_WEEK_BONUS;
  }
  data.profile.totalXp = Math.max(0, data.profile.totalXp + delta);
  return delta;
}

function toggleWeeklyGoal(data, goal) {
  goal.done = !goal.done;
  const delta = goal.done ? WEEKLY_GOAL_XP : -WEEKLY_GOAL_XP;
  data.profile.totalXp = Math.max(0, data.profile.totalXp + delta);
  return delta;
}

// Fjerner et mål. For hverdagsmål forsvinner oppgavene i i går og i dag
// (avkryssede trekkes fra igjen), mens eldre dager beholdes som historikk.
// Et avkrysset "denne uka"-mål trekker XP-en tilbake.
function removeGoal(data, goalId, today) {
  const goals = getGoals(data);
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) return false;
  if (goal.daily) {
    for (const date of [yesterday(today), today]) {
      const day = data.days[date];
      if (!day) continue;
      const task = day.tasks.find((t) => t.goalId === goalId);
      if (!task) continue;
      if (task.done) {
        task.done = false;
        applyGoalTickXp(data, goalId, date, false, true);
      }
      day.tasks = day.tasks.filter((t) => t.goalId !== goalId);
    }
    // Ikke-avkryssede rester på eldre dager er bare støy - fjern dem.
    for (const day of Object.values(data.days)) {
      day.tasks = day.tasks.filter((t) => t.goalId !== goalId || t.done);
    }
  } else if (goal.done) {
    toggleWeeklyGoal(data, goal);
  }
  data.goals = goals.filter((g) => g.id !== goalId);
  return true;
}

// Det klienten trenger for "Uka"-fanen.
function buildWeekGoals(data, today) {
  const weekStart = weekStartStr(today);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const y = yesterday(today);
  const marks = (data.goalBonuses || {})[weekStart] || {};
  const goals = getGoals(data);

  const daily = goals
    .filter((g) => g.daily)
    .map((g) => {
      let doneCount = 0;
      let possible = 0;
      const days = dates.map((date) => {
        const day = data.days[date];
        const task = day ? day.tasks.find((t) => t.goalId === g.id) : null;
        const editable = !!task && (date === today || date === y);
        let status;
        if (task && task.done) status = 'done';
        else if (date < g.startDate) status = 'before';
        else if (date > today) status = 'future';
        else if (editable) status = 'open';
        else status = 'missed';
        if (status === 'done') doneCount += 1;
        if (status !== 'before') possible += 1;
        return { date, status, taskId: task ? task.id : null, editable };
      });
      return { id: g.id, title: g.title, daily: true, days, doneCount, possible, fullWeek: !!marks[g.id] };
    });

  const weekly = goals
    .filter((g) => !g.daily && g.weekStart === weekStart)
    .map((g) => ({ id: g.id, title: g.title, daily: false, done: !!g.done }));

  return {
    weekStart,
    isoWeek: isoWeekNumber(weekStart).isoWeek,
    dates,
    today,
    daily,
    weekly,
  };
}

module.exports = {
  GOAL_TICK_XP,
  GOAL_FULL_WEEK_BONUS,
  WEEKLY_GOAL_XP,
  MAX_GOALS,
  getGoals,
  createGoal,
  ensureGoalTasks,
  applyGoalTickXp,
  toggleWeeklyGoal,
  removeGoal,
  buildWeekGoals,
};
