// A cold streak is the games at the end of the season with zero points.
// The season rate is points divided by games played, regular season only.

export const COLD_MIN_STREAK = 2;
export const COLD_MIN_PER_GAME = 0.65;

export function seasonScoring(games) {
  const played = (games || []).filter((game) => typeof game?.points === 'number' && Number.isFinite(game.time));
  const ordered = played.slice().sort((a, b) => b.time - a.time);
  let streak = 0;
  for (const game of ordered) {
    if (game.points > 0) break;
    streak += 1;
  }
  const points = played.reduce((sum, game) => sum + game.points, 0);
  return {
    games: played.length,
    points,
    perGame: played.length ? points / played.length : 0,
    streak,
  };
}

export function coldScorers(rows) {
  return (rows || [])
    .map((row) => ({ ...row, ...seasonScoring(row.games) }))
    .filter((row) => row.streak >= COLD_MIN_STREAK && row.perGame >= COLD_MIN_PER_GAME)
    .sort((a, b) => b.streak - a.streak || b.perGame - a.perGame || a.name.localeCompare(b.name));
}
