// NHL goals and points. Shrink the last-10 hit rate toward a longer sample, blend
// in shot volume (and assists for points). Shot rate follows the recent games,
// and a sharp drop or jump in the last three becomes the rate. Then nudge for
// ice time, power-play points, the opponent, the game total, the favorite, and
// a back-to-back. Edge is that probability minus the yes price.

import { applyLearned } from './propCalibration.js';

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

function nudge(delta, per) {
  if (delta == null || !Number.isFinite(delta)) return 0;
  return clamp(delta * per, -0.06, 0.06);
}

function sameTeam(a, b) {
  const left = String(a || '').toLowerCase().trim();
  const right = String(b || '').toLowerCase().trim();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function poissonAtLeast(lambda, line) {
  const need = Math.ceil(Number(line));
  if (!Number.isFinite(need) || need <= 0) return 1;
  if (!(lambda > 0)) return 0;
  let term = Math.exp(-lambda);
  let below = term;
  for (let k = 1; k < need; k += 1) {
    term *= lambda / k;
    below += term;
  }
  return clamp(1 - below, 0, 0.95);
}

function volumeParts(type, line, recentContext, priorContext) {
  const rows = [...(priorContext || []), ...(recentContext || [])];
  let shots = 0;
  let goals = 0;
  let shotGames = 0;
  let assists = 0;
  let assistGames = 0;
  for (const row of rows) {
    if (typeof row?.shots === 'number' && typeof row?.goals === 'number') {
      shots += row.shots;
      goals += row.goals;
      shotGames += 1;
    }
    if (typeof row?.assists === 'number') {
      assists += row.assists;
      assistGames += 1;
    }
  }
  const shooting = shotGames >= 8 && shots > 0 ? (goals + 0.105 * 80) / (shots + 80) : null;
  const assistRate = assistGames >= 8 ? (assists + 0.35 * 15) / (assistGames + 15) : null;
  const shotsPer = expectedShots(priorContext, recentContext);
  let p = null;
  if (shooting != null && shotsPer != null) {
    if (type === GOALS) p = poissonAtLeast(shotsPer * shooting, line);
    else if (assistRate != null) p = poissonAtLeast(shotsPer * shooting + assistRate, line);
  }
  return { shooting, assists: assistRate, p };
}

function expectedShots(priorContext, recentContext) {
  const older = seriesMean(priorContext, 'shots');
  const last3 = seriesMean(recentContext, 'shots', 3);
  const last5 = seriesMean(recentContext, 'shots', 5);
  if (last3.n >= 3 && older.n >= 5 && older.mean > 0) {
    const ratio = last3.mean / older.mean;
    if (ratio <= 0.55 || ratio >= 1.75) return last3.mean;
  }
  if (last5.n >= 3 && older.n >= 5 && last5.mean != null && older.mean != null) {
    return last5.mean * 0.65 + older.mean * 0.35;
  }
  if (older.n >= 5 && older.mean != null) return older.mean;
  if (last5.n >= 5 && last5.mean != null) return last5.mean;
  return null;
}

function volumeProbability(type, line, recentContext, priorContext) {
  return volumeParts(type, line, recentContext, priorContext).p;
}

function formatToi(minutes) {
  const whole = Math.floor(minutes);
  const seconds = Math.round((minutes - whole) * 60);
  if (seconds === 60) return `${whole + 1}:00`;
  return `${whole}:${String(seconds).padStart(2, '0')}`;
}

export function nhlFactorLines({
  type,
  line,
  recent,
  prior,
  recentContext,
  priorContext,
  versus,
  lastPlayed,
  gameStart,
  gameTotal,
  teamName,
  opponentName,
  favoriteName,
  favoriteYes,
  opponentLabel,
}) {
  if (type !== GOALS && type !== POINTS || line == null) return [];
  const lines = [];
  const goals = type === GOALS;

  if (recent?.length) {
    const hits = recent.filter((value) => value >= line).length;
    lines.push({ id: 'l10', label: 'Last 10', value: `${hits}/${recent.length}` });
  }
  if ((prior || []).length >= 8) {
    const hits = prior.filter((value) => value >= line).length;
    lines.push({ id: 'prior', label: 'Long sample', value: `${hits}/${prior.length}` });
  } else {
    lines.push({ id: 'prior', label: 'Long sample', value: `${Math.round(fallbackRate(type, line) * 100)}% typical` });
  }

  const recentToi = seriesMean(recentContext, 'toi', 5);
  const priorToi = seriesMean(priorContext, 'toi');
  if (recentToi.mean != null) lines.push({ id: 'toi', label: 'TOI', value: formatToi(recentToi.mean) });
  if (priorToi.n >= 5 && priorToi.mean != null) lines.push({ id: 'toi', label: 'Prior TOI', value: formatToi(priorToi.mean) });

  const recentShots = seriesMean(recentContext, 'shots', 5);
  const priorShots = seriesMean(priorContext, 'shots');
  if (recentShots.mean != null) lines.push({ id: 'shots', label: 'Shots', value: recentShots.mean.toFixed(1) });
  if (priorShots.n >= 5 && priorShots.mean != null) lines.push({ id: 'shots', label: 'Prior shots', value: priorShots.mean.toFixed(1) });

  const volume = volumeParts(type, line, recentContext, priorContext);
  if (volume.shooting != null) lines.push({ id: 'volume', label: 'Shooting', value: `${Math.round(volume.shooting * 100)}%` });
  if (!goals && volume.assists != null) lines.push({ id: 'volume', label: 'Assists', value: volume.assists.toFixed(2) });
  if (volume.p != null) lines.push({ id: 'volume', label: 'Volume', value: `${Math.round(volume.p * 100)}%` });

  const pp = seriesMean(recentContext, 'pp');
  if (pp.n >= 5 && pp.mean != null) lines.push({ id: 'pp', label: 'Power play', value: `${pp.mean.toFixed(2)}/g` });

  if (versus?.length) {
    const hits = versus.filter((value) => value >= line).length;
    lines.push({ id: 'opp', label: `vs ${opponentLabel || 'opponent'}`, value: `${hits}/${versus.length}` });
  }

  if (typeof gameTotal === 'number' && Number.isFinite(gameTotal)) {
    lines.push({ id: 'total', label: 'Game total', value: String(gameTotal) });
  }

  if (typeof favoriteYes === 'number' && Number.isFinite(favoriteYes)) {
    const favP = Math.max(favoriteYes, 1 - favoriteYes);
    if (sameTeam(teamName, favoriteName)) lines.push({ id: 'side', label: 'Side', value: `Favored ${Math.round(favP * 100)}%` });
    else if (sameTeam(opponentName, favoriteName)) lines.push({ id: 'side', label: 'Side', value: `Underdog ${Math.round((1 - favP) * 100)}%` });
  }

  if (typeof gameStart === 'number' && typeof lastPlayed === 'number' && Number.isFinite(lastPlayed)) {
    const hours = (gameStart - lastPlayed) / 36e5;
    if (hours > 0 && hours < 36) lines.push({ id: 'rest', label: 'Rest', value: 'Back to back' });
    else if (hours >= 36) lines.push({ id: 'rest', label: 'Rest', value: `${Math.round(hours / 24)} days` });
  }

  return lines;
}

function applyShift(p, tags, shift, up, down) {
  if (shift >= 0.014 && up) tags.push(up);
  else if (shift <= -0.014 && down) tags.push(down);
  return p + shift;
}

export function nhlPropEdge({
  type,
  line,
  recent,
  prior,
  recentContext,
  priorContext,
  versus,
  marketYes,
  lastPlayed,
  gameStart,
  gameTotal,
  teamName,
  opponentName,
  favoriteName,
  favoriteYes,
  calibration,
}) {
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

  const volumeP = volumeProbability(type, line, recentContext, priorContext);
  if (volumeP != null) {
    const blended = goals ? (0.6 * p + 0.4 * volumeP) : (0.65 * p + 0.35 * volumeP);
    p = applyShift(p, tags, blended - p, goals ? 'shot volume' : 'chances', 'low volume');
  }

  const recentToi = seriesMean(recentContext, 'toi', 5);
  const priorToi = seriesMean(priorContext, 'toi');
  if (recentToi.n >= 3 && priorToi.n >= 5 && recentToi.mean != null && priorToi.mean != null) {
    const shift = nudge(recentToi.mean - priorToi.mean, goals ? 0.008 : 0.012);
    p = applyShift(p, tags, shift, 'ice time up', 'ice time down');
  }

  const recentShots = seriesMean(recentContext, 'shots', 5);
  const priorShots = seriesMean(priorContext, 'shots');
  if (recentShots.n >= 3 && priorShots.n >= 5 && recentShots.mean != null && priorShots.mean != null) {
    const delta = recentShots.mean - priorShots.mean;
    if (delta >= 1) tags.push('shots up');
    else if (delta <= -1) tags.push('shots down');
  }

  const recentPp = seriesMean(recentContext, 'pp');
  if (recentPp.n >= 5 && recentPp.mean != null && recentPp.mean >= 0.25) {
    p += goals ? 0.02 : 0.03;
    tags.push('power play');
  }

  if (versus && versus.length >= 3) {
    const rate = versus.filter((value) => value >= line).length / versus.length;
    const shift = clamp((rate - p) * 0.25, -0.04, 0.04);
    p = applyShift(p, tags, shift, 'hot vs opponent', 'cold vs opponent');
  }

  if (typeof gameTotal === 'number' && Number.isFinite(gameTotal)) {
    const shift = clamp((gameTotal - 6) * (goals ? 0.032 : 0.03), -0.04, 0.04);
    p = applyShift(p, tags, shift, 'high total', 'low total');
  }

  if (typeof favoriteYes === 'number' && Number.isFinite(favoriteYes)) {
    const favP = Math.max(favoriteYes, 1 - favoriteYes);
    let lean = null;
    if (sameTeam(teamName, favoriteName)) lean = favP - 0.5;
    else if (sameTeam(opponentName, favoriteName)) lean = 0.5 - favP;
    if (lean != null) {
      const shift = clamp(lean * 0.08, -0.03, 0.03);
      p = applyShift(p, tags, shift, 'favorite', 'underdog');
    }
  }

  if (typeof gameStart === 'number' && typeof lastPlayed === 'number' && Number.isFinite(lastPlayed)) {
    const hours = (gameStart - lastPlayed) / 36e5;
    if (hours > 0 && hours < 36) {
      p -= goals ? 0.03 : 0.02;
      tags.push('back to back');
    }
  }

  p = applyLearned(clamp(p, 0.02, 0.92), tags, calibration);
  return {
    p,
    edge: p - marketYes,
    hits,
    total: n,
    rate: Math.round((hits / n) * 100),
    tags,
  };
}
