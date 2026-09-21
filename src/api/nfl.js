/* ── NFL week/season utilities ─────────────────────── */

/**
 * Returns the NFL week info for a given date.
 * Regular season: Week 1 = 9/9/2026, each week is 7 days.
 * Playoffs follow after Week 18 (ends 1/12/2027).
 */
export function getNflWeekInfo(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  // Playoffs (seasontype=3)
  const PLAYOFFS = [
    { week: 1, start: new Date('2027-01-13'), end: new Date('2027-01-19') }, // Wild Card
    { week: 2, start: new Date('2027-01-20'), end: new Date('2027-01-26') }, // Divisional
    { week: 3, start: new Date('2027-01-27'), end: new Date('2027-02-02') }, // Conference
    { week: 5, start: new Date('2027-02-10'), end: new Date('2027-02-15') }, // Super Bowl
  ];
  for (const p of PLAYOFFS) {
    if (d >= p.start && d <= p.end)
      return { week: p.week, seasontype: 3 };
  }

  // Regular season: starts 9/9/2026, 18 weeks × 7 days
  const SEASON_START = new Date('2026-09-09');
  const diffDays = Math.floor((d - SEASON_START) / 86400000);
  if (diffDays >= 0 && diffDays < 18 * 7) {
    const week = Math.floor(diffDays / 7) + 1;
    return { week, seasontype: 2 };
  }

  return null; // Off-season
}

/** Human-readable label for the current week ("Week 1", "Wild Card", etc.) */
export function getNflWeekLabel(weekInfo) {
  if (!weekInfo) return null;
  if (weekInfo.seasontype === 3) {
    const names = { 1: 'Wild Card', 2: 'Divisional', 3: 'Conference', 5: 'Super Bowl' };
    return names[weekInfo.week] || `Playoffs`;
  }
  return `Week ${weekInfo.week}`;
}

/** Fetch all NFL games for the week containing `date`. */
export async function getNflWeekGames(date = new Date()) {
  const info = getNflWeekInfo(date);
  if (!info) return [];
  try {
    const r = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` +
      `?week=${info.week}&seasontype=${info.seasontype}&limit=100`
    );
    const d = await r.json();
    return d.events || [];
  } catch { return []; }
}
