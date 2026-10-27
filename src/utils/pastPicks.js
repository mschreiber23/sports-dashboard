const SPORT_ORDER = ['nhl', 'nfl', 'nba', 'mlb', 'wnba', 'cbb', 'cfb'];

export function pastPickSports(rows) {
  const present = new Set();
  for (const row of rows || []) {
    if (row?.result && row.league) present.add(row.league);
  }
  const known = SPORT_ORDER.filter((league) => present.has(league));
  const extra = [...present].filter((league) => !SPORT_ORDER.includes(league)).sort();
  return [...known, ...extra];
}

export function picksForSport(rows, sport) {
  const list = rows || [];
  if (!sport || sport === 'all') return list;
  return list.filter((row) => row.league === sport);
}
