/** Chance the favored side of a prop is the one that hits. */

const POISSON_TYPES = new Set([
  'anytime_touchdowns', 'first_touchdowns', 'two_plus_touchdowns',
  'receptions', 'passing_touchdowns',
  'hits', 'home_runs', 'rbis',
  'baseball_player_hits', 'baseball_player_home_runs', 'baseball_player_rbis',
  'baseball_player_stolen_bases',
  'soccer_player_goals', 'soccer_player_assists', 'soccer_anytime_goalscorer',
  'soccer_player_goals_plus_assists', 'soccer_player_shots', 'soccer_player_shots_on_target',
  'threes', 'double_doubles',
]);

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function poissonAtLeast(k, lambda) {
  if (k <= 0) return 1;
  if (!(lambda > 0)) return 0;
  let term = Math.exp(-lambda);
  let sum = term;
  for (let i = 1; i < k; i++) {
    term *= lambda / i;
    sum += term;
    if (sum >= 1) return 0;
  }
  return clamp01(1 - sum);
}

/** P(stat clears the line), where the line is a half-point (27.5 → more than 27.5). */
export function probOverLine(avg, line, type) {
  if (!(avg >= 0) || line == null || Number.isNaN(line)) return null;
  if (POISSON_TYPES.has(type)) {
    const need = Math.floor(line) + 1;
    return poissonAtLeast(need, avg);
  }
  const sigma = Math.max(avg * 0.45, 0.75);
  const z = (line - avg) / sigma;
  return clamp01(1 - normalCdf(z));
}

function bookQuality(liquidity, spread) {
  const spr = Number.isFinite(spread) ? Math.max(0, spread) : 1;
  const spreadQ = clamp01(1 - spr / 0.4);
  if (liquidity == null) return 0.45 + 0.55 * spreadQ;
  const liq = Math.max(0, liquidity || 0);
  const liqQ = Math.min(1, Math.log10(1 + liq) / Math.log10(1 + 8000));
  return liqQ * (0.4 + 0.6 * spreadQ);
}

/**
 * Over/unders use the favored side, pulled toward 50% when the book is thin.
 * Yes/no props (anytime TD, 2+ goals) use the chance that prop happens.
 * A thin book discounts that price instead of pushing it toward 50%.
 */
export function scoreProp({ yes, no, liquidity, spread, ou }) {
  if (!(yes >= 0) || !(no >= 0)) return null;
  const quality = bookQuality(liquidity, spread);
  if (!ou) {
    const hit = yes * (0.45 + 0.55 * quality);
    return { side: 'Yes', marketP: yes, quality, adjusted: hit, hit, lock: yes >= 0.9 };
  }
  const marketP = Math.max(yes, no);
  const side = yes >= no ? 'Over' : 'Under';
  const adjusted = 0.5 + (marketP - 0.5) * (0.22 + 0.78 * quality);
  return { side, marketP, quality, adjusted, hit: adjusted, lock: marketP >= 0.9 };
}

/** Blend a season per-game average into the hit chance. */
export function applySeasonAverage(scored, avg, line, type) {
  const pOver = probOverLine(avg, line, type);
  if (pOver == null) return scored;
  const positive = scored.side === 'Over' || scored.side === 'Yes';
  const statP = positive ? pOver : 1 - pOver;
  const hit = 0.62 * scored.adjusted + 0.38 * statP;
  return { ...scored, statP, hit };
}

export function bookLabel(quality) {
  if (quality >= 0.62) return 'Solid book';
  if (quality >= 0.38) return 'Thin book';
  return 'Wide spread';
}
