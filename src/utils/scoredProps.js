// The score is a bet the model would actually make. Goal props, 2+ point
// lines, penny quotes, and empty-book asks stay out. So does a side priced
// over 60 cents: laying 70 cents to win one unit is a lot of cash, and a
// small edge does not cover the taker fee.

export const GOAL_PROP = 'hockey_player_goals';
export const POINTS_PROP = 'hockey_player_points';
export const SCORE_PRICE_MIN = 0.15;
export const SCORE_PRICE_MAX = 0.85;
export const BET_PRICE_MIN = 0.38;
export const BET_PRICE_MAX = 0.60;
export const BET_EDGE_MIN = 0.04;
const BET_P_MIN = 0.45;

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function keptRead(row) {
  if (!row) return false;
  const type = row.propType || row.type;
  if (type === GOAL_PROP) return false;
  if (type === POINTS_PROP && Number(row.line) !== 1) return false;
  const price = number(row.price ?? row.yes);
  if (price == null || price < SCORE_PRICE_MIN || price > SCORE_PRICE_MAX) return false;
  return true;
}

// The side with at least a 4-point edge, priced from 38% to 60%.
export function betSide(row) {
  const modelP = number(row?.modelP);
  const price = number(row?.price ?? row?.yes);
  if (modelP == null || price == null) return null;
  const yesEdge = number(row.edge) ?? (modelP - price);
  const noEdge = -yesEdge;
  const noPrice = 1 - price;
  const noP = 1 - modelP;
  if (yesEdge >= BET_EDGE_MIN && price >= BET_PRICE_MIN && price <= BET_PRICE_MAX && modelP >= BET_P_MIN) return 'yes';
  if (noEdge >= BET_EDGE_MIN && noPrice >= BET_PRICE_MIN && noPrice <= BET_PRICE_MAX && noP >= BET_P_MIN) return 'no';
  return null;
}

export function countsInScore(row) {
  if (!keptRead(row)) return false;
  if (number(row.modelP) == null) return true;
  return betSide(row) != null;
}
