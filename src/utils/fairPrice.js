// A prop probability is a volume projection, then a pull toward the price.
// The last-10 hit rate is a small piece of that projection. The market already
// prices the total, the spread, and the news, so the projection is pulled
// toward the yes price after those nudges. Only a large disagreement is left
// as edge. When there is no volume projection, about two thirds of the answer
// is the price, which keeps a 7-of-10 streak from clearing a 4-point edge.

export const NHL_HIT_WEIGHT = 0.25;
export const NHL_MARKET_WEIGHT = 0.42;
export const NHL_BARE_MARKET_WEIGHT = 0.65;

export const NFL_STABLE_HIT_WEIGHT = 0.2;
export const NFL_VOLATILE_HIT_WEIGHT = 0.35;
export const NFL_STABLE_MARKET_WEIGHT = 0.38;
export const NFL_VOLATILE_MARKET_WEIGHT = 0.5;
export const NFL_BARE_MARKET_WEIGHT = 0.65;

export function fairProbability(projection, market, marketWeight) {
  const weight = Math.min(1, Math.max(0, marketWeight));
  return weight * market + (1 - weight) * projection;
}
