/**
 * "Today" for scores stays on the previous slate until noon Eastern.
 * At 12:00am ET on Sep 30 the today view still shows Sep 29.
 * At 12:00pm ET it rolls forward to Sep 30.
 * America/New_York follows daylight saving, so noon is local Eastern time.
 */

const EASTERN = 'America/New_York';

export function easternParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
  };
}

/** Local-noon Date for the slate that should be labeled Today. */
export function sportsDayDate(now = new Date()) {
  const { year, month, day, hour } = easternParts(now);
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (hour < 12) d.setDate(d.getDate() - 1);
  return d;
}

export function toDateStr(date) {
  return date.getFullYear().toString()
    + String(date.getMonth() + 1).padStart(2, '0')
    + String(date.getDate()).padStart(2, '0');
}

export function toIsoDate(date) {
  return date.getFullYear().toString()
    + '-' + String(date.getMonth() + 1).padStart(2, '0')
    + '-' + String(date.getDate()).padStart(2, '0');
}

export function sportsDayStr(now = new Date()) {
  return toDateStr(sportsDayDate(now));
}

export function sameDay(a, b) {
  return toDateStr(a) === toDateStr(b);
}

/** UTC instant of noon Eastern on the given Eastern calendar day. */
function easternNoonUtc(year, month, day) {
  // 16:00 UTC is noon during EDT. Shift if that instant isn't noon Eastern (EST).
  const guess = new Date(Date.UTC(year, month - 1, day, 16, 0, 0));
  const hour = easternParts(guess).hour;
  return new Date(guess.getTime() + (12 - hour) * 3600000);
}

/** Milliseconds until just after the next noon Eastern rollover. */
export function msUntilNextSportsRollover(now = new Date()) {
  const { year, month, day, hour } = easternParts(now);
  let y = year;
  let m = month;
  let d = day;
  if (hour >= 12) {
    const next = new Date(year, month - 1, day + 1);
    y = next.getFullYear();
    m = next.getMonth() + 1;
    d = next.getDate();
  }
  const target = easternNoonUtc(y, m, d).getTime();
  return Math.max(1000, target - now.getTime() + 500);
}

export function formatSportsDateLabel(date, sportsToday, { weekday = false } = {}) {
  const a = new Date(date);
  a.setHours(0, 0, 0, 0);
  const b = new Date(sportsToday);
  b.setHours(0, 0, 0, 0);
  const diff = Math.round((a - b) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return a.toLocaleDateString('en-US', weekday
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric' });
}
