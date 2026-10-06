// The score is the props where the price is a real market and the prop is
// something a player might actually do. Goal props stay out. So do penny
// quotes and empty-book asks: a 2¢ price and a 94¢ ask with no bid are not
// the chance the player scores.

export const GOAL_PROP = 'hockey_player_goals';
export const POINTS_PROP = 'hockey_player_points';
export const SCORE_PRICE_MIN = 0.15;
export const SCORE_PRICE_MAX = 0.85;

export function countsInScore(row) {
  if (!row) return false;
  const type = row.propType || row.type;
  if (type === GOAL_PROP) return false;
  // 2+ and 3+ points are easy Nos for players who were never likely to score once.
  if (type === POINTS_PROP && Number(row.line) !== 1) return false;
  const price = Number(row.price ?? row.yes);
  if (!Number.isFinite(price) || price < SCORE_PRICE_MIN || price > SCORE_PRICE_MAX) return false;
  return true;
}
