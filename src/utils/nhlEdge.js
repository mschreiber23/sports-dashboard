// NHL goals and points only. Shrink the last-10 hit rate at the line toward a
// longer sample, then nudge for recent ice time and shots versus that prior
// window, plus a small bump when power-play points show up. Edge is that
// probability minus the contract's yes price.

const GOALS = 'hockey_player_goals';
const POINTS = 'hockey_player_points';

export const NHL_EDGE_MIN = 0.04;
export const NHL_P_MIN = 0.35;

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function seriesMean(rows, key, last) {
  const slice = last ? (rows || []).slice(-last) : (rows || []);
  const values = [];
  for (const row of slice) {
    const value = row?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
  }
  return { mean: mean(values), n: values.length };
}

function fallbackRate(type, line) {
  if (type === GOALS) {
    if (line <= 1) return 0.25;
    if (line <= 2) return 0.06;
    return 0.02;
  }
  if (line <= 1) return 0.48;
  if (line <= 2) return 0.22;
  if (line <= 3) return 0.08;
  return 0.03;
}

function nudge(delta, perMinute) {
  if (delta == null || !Number.isFinite(delta)) return 0;
  return clamp(delta * perMinute, -0.06, 0.06);
}

export function nhlPropEdge({ type, line, recent, prior, recentContext, priorContext, marketYes }) {
  if (type !== GOALS && type !== POINTS) return null;
  if (!recent || recent.length < 5 || line == null) return null;
  if (typeof marketYes !== 'number' || !Number.isFinite(marketYes) || marketYes < 0 || marketYes > 1) return null;

  const hits = recent.filter((value) => value >= line).length;
  const n = recent.length;
  const priorHits = (prior || []).filter((value) => value >= line).length;
  const priorN = (prior || []).length;
  const goals = type === GOALS;
  const strength = goals ? 14 : 8;
  const anchor = priorN >= 8 ? priorHits / priorN : fallbackRate(type, line);
  let p = (hits + anchor * strength) / (n + strength);

  const tags = [];
  const recentToi = seriesMean(recentContext, 'toi', 5);
  const priorToi = seriesMean(priorContext, 'toi');
  if (recentToi.n >= 3 && priorToi.n >= 5 && recentToi.mean != null && priorToi.mean != null) {
    const shift = nudge(recentToi.mean - priorToi.mean, goals ? 0.008 : 0.012);
    if (Math.abs(shift) >= 0.015) tags.push(shift > 0 ? 'ice time up' : 'ice time down');
    p += shift;
  }

  const recentShots = seriesMean(recentContext, 'shots', 5);
  const priorShots = seriesMean(priorContext, 'shots');
  if (recentShots.n >= 3 && priorShots.n >= 5 && recentShots.mean != null && priorShots.mean != null) {
    const shift = nudge(recentShots.mean - priorShots.mean, goals ? 0.012 : 0.018);
    if (Math.abs(shift) >= 0.015) tags.push(shift > 0 ? 'shots up' : 'shots down');
    p += shift;
  }

  const recentPp = seriesMean(recentContext, 'pp');
  if (recentPp.n >= 5 && recentPp.mean != null && recentPp.mean >= 0.25) {
    p += goals ? 0.02 : 0.03;
    tags.push('power play');
  }

  p = clamp(p, 0.02, 0.92);
  return {
    p,
    edge: p - marketYes,
    hits,
    total: n,
    rate: Math.round((hits / n) * 100),
    tags,
  };
}
