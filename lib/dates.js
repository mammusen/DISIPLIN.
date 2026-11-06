// Enkle dato-hjelpere. Vi jobber utelukkende med kalenderdatoer som strenger
// i formatet YYYY-MM-DD, i tidssonen Europe/Oslo. Selve "klokkeslett"-vippingen
// (DST osv.) er irrelevant for oss siden vi bare regner med hele dager.

const TZ = 'Europe/Oslo';

// "Appdagen" bytter kl. 04:00 (Oslo-tid), ikke ved midnatt - legger du deg
// kl. 01, er det fortsatt samme dag i appen, så du kan krysse av og avslutte
// dagen før du sovner.
const DAY_START_HOUR = 4;

const DAY_HOUR_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

function todayStr(now = new Date()) {
  const parts = {};
  for (const p of DAY_HOUR_FMT.formatToParts(now)) parts[p.type] = p.value;
  const calendarDate = `${parts.year}-${parts.month}-${parts.day}`;
  return Number(parts.hour) < DAY_START_HOUR ? addDays(calendarDate, -1) : calendarDate;
}

// Samme som todayStr, men for et vilkårlig tidspunkt (f.eks. en
// ISO-tidsstempel-streng fra en ekstern API som Hevy). Brukes i stedet for
// å bare kutte UTC-delen av strengen, siden en økt logget sent på kvelden
// eller like etter midnatt i Oslo ellers kan havne på feil kalenderdag
// (og dermed feil uke).
function dateStrAt(instant) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(instant));
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function yesterday(dateStr) {
  return addDays(dateStr, -1);
}

function tomorrow(dateStr) {
  return addDays(dateStr, 1);
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86400000);
}

// Mandagen i uken datoen tilhører - brukes som gruppe-nøkkel for uke-oversikten.
function weekStartStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7; // mandag = 0 ... søndag = 6
  date.setUTCDate(date.getUTCDate() - dayNum);
  return date.toISOString().slice(0, 10);
}

// Faktisk ISO 8601-ukenummer (og "ISO-året", som kan avvike fra kalenderåret
// rundt nyttår) for en dato - standarden Norge bruker for ukenummer.
function isoWeekNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // torsdag i samme uke
  const isoYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const isoWeek = 1 + Math.round((date - firstThursday) / (7 * 86400000));
  return { isoYear, isoWeek };
}

module.exports = { todayStr, dateStrAt, addDays, yesterday, tomorrow, daysBetween, weekStartStr, isoWeekNumber, TZ, DAY_START_HOUR };
