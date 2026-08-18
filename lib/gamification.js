// All spillogikk samlet på ett sted, så den er lett å justere.

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

// Beregner XP for en dag som lukkes, samt om den talte som "planlagt i tide".
function computeDayClose({ tasks, rating, plannedOnTime, streakBefore }) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.done).length;
  const completionRate = total > 0 ? completed / total : 0;

  let xp = 0;
  const breakdown = [];

  const taskXp = completed * 10;
  if (taskXp > 0) {
    xp += taskXp;
    breakdown.push({ label: `${completed} fullførte oppgaver`, xp: taskXp });
  }

  const completionBonus = Math.round(completionRate * 20);
  if (completionBonus > 0) {
    xp += completionBonus;
    breakdown.push({ label: 'Fullføringsgrad', xp: completionBonus });
  }

  const ratingXp = rating * 2; // vurdering er nå 1-10, så maks bidrag holdes likt som før (20 XP)
  xp += ratingXp;
  breakdown.push({ label: 'Kveldsrefleksjon', xp: ratingXp });

  xp += 10;
  breakdown.push({ label: 'Gjennomførte refleksjonen', xp: 10 });

  if (plannedOnTime) {
    xp += 15;
    breakdown.push({ label: 'Planla kvelden før', xp: 15 });
  }

  const streakBonus = Math.min(streakBefore, 10) * 2;
  if (streakBonus > 0) {
    xp += streakBonus;
    breakdown.push({ label: `Streak-bonus (${streakBefore} dager)`, xp: streakBonus });
  }

  return { xp, breakdown, completed, total, completionRate };
}

module.exports = { levelInfo, petStage, petMood, computeDayClose };
