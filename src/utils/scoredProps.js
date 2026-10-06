// Goal props stay out of the model score. A player scoring is rare, so a Yes
// on 1+ goals misses most nights and pulls the hit rate down. Points stay.

export const GOAL_PROP = 'hockey_player_goals';

export function countsInScore(row) {
  if (!row) return false;
  return row.propType !== GOAL_PROP && row.type !== GOAL_PROP;
}
