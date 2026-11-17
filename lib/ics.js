// Kalender-feed (iCalendar/.ics) som Apple Kalender, Google Kalender o.l.
// kan abonnere på. Én samlet heldagshendelse per dag med oppgaver, med hele
// sjekklisten i notatfeltet - ryddigere enn én hendelse per oppgave.

const crypto = require('crypto');
const { addDays } = require('./dates');

const FEED_DAYS_BACK = 60;

function newFeedToken() {
  return crypto.randomBytes(24).toString('base64url');
}

// Sammenligner tokenet fra lenken med det lagrede uten å lekke noe via tid.
function tokenMatches(stored, given) {
  if (typeof stored !== 'string' || typeof given !== 'string') return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function escapeText(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Linjer over 75 byte skal brytes (RFC 5545), uten å dele et UTF-8-tegn.
function foldLine(line) {
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const len = Buffer.byteLength(ch);
    const limit = parts.length === 0 ? 75 : 74; // fortsettelseslinjer starter med et mellomrom
    if (bytes + len > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += len;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function compactDate(date) {
  return date.replace(/-/g, '');
}

function utcStamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function daySummary(tasks) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  let text;
  if (done === total) text = total === 1 ? `✓ ${tasks[0].title}` : `✓ ${total}/${total} gjort`;
  else if (done > 0) text = `${done}/${total} gjort`;
  else text = total === 1 ? tasks[0].title : `${total} oppgaver`;
  return `DISIPLIN. · ${text}`;
}

function dayDescription(tasks, reflection) {
  const lines = tasks.map((t) => `${t.done ? '✓' : '○'} ${t.title}`);
  if (reflection) {
    lines.push('');
    lines.push(`Dagen avsluttet: ${reflection.rating}/10 ★`);
  }
  return lines.join('\n');
}

function buildFeed(data, userId, today) {
  const from = addDays(today, -FEED_DAYS_BACK);
  const stamp = utcStamp();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DISIPLIN.//Kalender//NO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:DISIPLIN.',
    'X-WR-CALDESC:Oppgavene dine fra DISIPLIN.',
    'X-WR-TIMEZONE:Europe/Oslo',
    'X-APPLE-CALENDAR-COLOR:#D1382F',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ];

  const dates = Object.keys(data.days || {}).filter((d) => d >= from).sort();
  for (const date of dates) {
    const day = data.days[date];
    // Hverdagsmål gjentas hver dag og ville bare gitt støy i kalenderen.
    const tasks = (day.tasks || []).filter((t) => !t.goalId);
    if (tasks.length === 0) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${date}-${userId}@disiplin`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(date, 1))}`,
      `SUMMARY:${escapeText(daySummary(tasks))}`,
      `DESCRIPTION:${escapeText(dayDescription(tasks, day.reflection))}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

module.exports = { newFeedToken, tokenMatches, buildFeed, daySummary };
