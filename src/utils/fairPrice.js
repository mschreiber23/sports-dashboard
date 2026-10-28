// A prop probability is a volume projection, then a pull toward the price.
// The last-10 hit rate is a small piece of that projection. The market already
// prices the total, the spread, and the news. When the recent hit rate and the
// volume projection sit on opposite sides of the price, a streak that runs
// away from the price is dropped and the pull gets heavier, so that streak
// cannot clear a 4-point edge. A volume gap that is still large after the
// heavier pull can. With no volume projection, about three quarters of the
// answer is the price.

export const NHL_HIT_WEIGHT = 0.25;
export const NHL_MARKET_WEIGHT = 0.5;
export const NHL_BARE_MARKET_WEIGHT = 0.72;

export const NFL_STABLE_HIT_WEIGHT = 0.2;
export const NFL_VOLATILE_HIT_WEIGHT = 0.35;
export const NFL_STABLE_MARKET_WEIGHT = 0.46;
export const NFL_VOLATILE_MARKET_WEIGHT = 0.56;
export const NFL_BARE_MARKET_WEIGHT = 0.72;

export const NBA_HIT_WEIGHT = 0.22;
export const NBA_VOLATILE_HIT_WEIGHT = 0.34;
export const NBA_MARKET_WEIGHT = 0.5;
export const NBA_VOLATILE_MARKET_WEIGHT = 0.56;
export const NBA_BARE_MARKET_WEIGHT = 0.72;

const DISAGREE_BUMP = 0.12;
const DISAGREE_CAP = 0.74;
const DISAGREE_GAP = 0.015;

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function fairProbability(projection, market, marketWeight) {
  const weight = Math.min(1, Math.max(0, marketWeight));
  return weight * market + (1 - weight) * projection;
}

// The number the model keeps. Same blend as fairProbability when the recent
// hits and the volume projection agree. When they disagree, trust the price
// more, and ignore a streak that is the piece running away from that price.
export function settledProbability(projection, market, marketWeight, parts = {}) {
  const { hitP, volumeP, hitWeight } = parts;
  let weight = Math.min(1, Math.max(0, marketWeight));
  let anchor = projection;
  if (finite(hitP) && finite(volumeP) && finite(market) && finite(hitWeight)) {
    const hitGap = hitP - market;
    const volGap = volumeP - market;
    const opposed = Math.abs(hitGap) >= DISAGREE_GAP
      && Math.abs(volGap) >= DISAGREE_GAP
      && hitGap * volGap < 0;
    if (opposed) {
      weight = Math.min(DISAGREE_CAP, weight + DISAGREE_BUMP);
      const volumeAnchored = projection - hitWeight * (hitP - volumeP);
      if (Math.abs(volumeAnchored - market) < Math.abs(projection - market)) anchor = volumeAnchored;
    }
  }
  return fairProbability(anchor, market, weight);
}
