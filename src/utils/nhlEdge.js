// NHL goals and points. The chance is mostly shots per minute times the ice
// time the player is getting, times a shrunk shooting rate, plus assists on a
// points prop. The last-10 hit rate is a small piece of that projection. A
// sharp drop or jump in the last three games becomes the rate. Power-play
// points add a little for shot quality. The opponent's recent goals allowed
// and home ice move it a little more, then the game total, the favorite, and
// a back-to-back. The result is pulled toward the yes price.

import { applyLearned } from './propCalibration.js';
import { NHL_BARE_MARKET_WEIGHT, NHL_HIT_WEIGHT, NHL_MARKET_WEIGHT, fairProbability } from './fairPrice.js';

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

function shotRate(rows) {
  let shots = 0;
  let minutes = 0;
  let rateN = 0;
  let shotSum = 0;
  let shotN = 0;
  for (const row of rows || []) {
    if (typeof row?.shots !== 'number' || !Number.isFinite(row.shots)) continue;
    shotSum += row.shots;
    shotN += 1;
    if (typeof row?.toi === 'number' && row.toi > 0) {
      shots += row.shots;
      minutes += row.toi;
      rateN += 1;
    }
  }
  return {
    perGame: shotN ? shotSum / shotN : null,
    n: shotN,
    perMin: rateN >= 3 && minutes > 0 ? shots / minutes : null,
    rateN,
  };
}

function projectedMinutes(priorContext, recentContext) {
  const older = seriesMean(priorContext, 'toi');
  const last3 = seriesMean(recentContext, 'toi', 3);
  const last5 = seriesMean(recentContext, 'toi', 5);
  if (last3.n >= 3 && older.n >= 5 && older.mean > 0) {
    const ratio = last3.mean / older.mean;
    if (ratio <= 0.75 || ratio >= 1.3) return last3.mean;
  }
  if (last5.n >= 3 && older.n >= 5 && last5.mean != null && older.mean != null) {
    return last5.mean * 0.65 + older.mean * 0.35;
  }
  if (last5.n >= 3 && last5.mean != null) return last5.mean;
  if (older.n >= 5 && older.mean != null) return older.mean;
  return null;
}

function rawShots(priorContext, recentContext) {
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

// Shots per minute, times the minutes the player is getting now. A jump in
// ice time raises the shot projection even when the last few shot totals
// have not caught up. Without ice time, this falls back to shots per game.
function expectedShots(priorContext, recentContext) {
  const minutes = projectedMinutes(priorContext, recentContext);
  const recentRate = shotRate((recentContext || []).slice(-5));
  const olderRate = shotRate(priorContext);
  let perMin = null;
  if (recentRate.perMin != null && olderRate.perMin != null && recentRate.perGame != null && olderRate.perGame > 0) {
    const ratio = recentRate.perGame / olderRate.perGame;
    perMin = (recentRate.n >= 3 && olderRate.n >= 5 && (ratio <= 0.55 || ratio >= 1.75))
      ? recentRate.perMin
      : recentRate.perMin * 0.65 + olderRate.perMin * 0.35;
  } else if (recentRate.perMin != null && recentRate.rateN >= 5) {
    perMin = recentRate.perMin;
  } else if (olderRate.perMin != null && olderRate.rateN >= 5) {
    perMin = olderRate.perMin;
  }
  if (perMin != null && minutes != null) return perMin * minutes;
  return rawShots(priorContext, recentContext);
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
  opponentGoalsAgainst,
  home,
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

  if (typeof opponentGoalsAgainst === 'number' && Number.isFinite(opponentGoalsAgainst)) {
    lines.push({ id: 'defense', label: 'Opp goals', value: `${opponentGoalsAgainst.toFixed(1)}/g` });
  }
  if (home === true) lines.push({ id: 'site', label: 'Site', value: 'Home' });
  else if (home === false) lines.push({ id: 'site', label: 'Site', value: 'Road' });

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

function validMarket(marketYes) {
  return typeof marketYes === 'number' && Number.isFinite(marketYes) && marketYes >= 0 && marketYes <= 1;
}

function projectNhl({
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
  opponentGoalsAgainst,
  home,
}) {
  if (type !== GOALS && type !== POINTS) return null;
  if (!recent || recent.length < 5 || line == null) return null;

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
    const blended = NHL_HIT_WEIGHT * p + (1 - NHL_HIT_WEIGHT) * volumeP;
    p = applyShift(p, tags, blended - p, goals ? 'shot volume' : 'chances', 'low volume');
  }

  const recentToi = seriesMean(recentContext, 'toi', 5);
  const priorToi = seriesMean(priorContext, 'toi');
  if (recentToi.n >= 3 && priorToi.n >= 5 && recentToi.mean != null && priorToi.mean != null) {
    const shift = nudge(recentToi.mean - priorToi.mean, goals ? 0.008 : 0.012);
    // Shot volume already uses shots per minute times projected ice time.
    if (volumeP == null) p = applyShift(p, tags, shift, 'ice time up', 'ice time down');
    else if (shift >= 0.014) tags.push('ice time up');
    else if (shift <= -0.014) tags.push('ice time down');
  }

  const recentShots = seriesMean(recentContext, 'shots', 5);
  const priorShots = seriesMean(priorContext, 'shots');
  if (recentShots.n >= 3 && priorShots.n >= 5 && recentShots.mean != null && priorShots.mean != null) {
    const delta = recentShots.mean - priorShots.mean;
    if (delta >= 1) tags.push('shots up');
    else if (delta <= -1) tags.push('shots down');
  }

  const recentPp = seriesMean(recentContext, 'pp');
  if (recentPp.n >= 5 && recentPp.mean != null && recentPp.mean >= 0.2) {
    // Power-play shots convert higher than even-strength shots. The shot
    // total already includes them, so this is only the quality difference.
    p += clamp((recentPp.mean - 0.15) * (goals ? 0.05 : 0.07), 0, 0.035);
    tags.push('power play');
  }

  if (typeof opponentGoalsAgainst === 'number' && Number.isFinite(opponentGoalsAgainst)) {
    const shift = clamp((opponentGoalsAgainst - 3.05) * (goals ? 0.025 : 0.03), -0.03, 0.03);
    p = applyShift(p, tags, shift, 'soft defense', 'tough defense');
  }

  if (home === true) {
    p += goals ? 0.01 : 0.015;
    tags.push('home');
  } else if (home === false) {
    p -= goals ? 0.008 : 0.01;
    tags.push('road');
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

  return {
    p,
    tags,
    hits,
    total: n,
    rate: Math.round((hits / n) * 100),
    volumeP,
  };
}

function finishRead(read, marketYes, calibration) {
  const priced = validMarket(marketYes);
  let p = read.p;
  if (priced) p = fairProbability(p, marketYes, read.volumeP != null ? NHL_MARKET_WEIGHT : NHL_BARE_MARKET_WEIGHT);
  p = applyLearned(clamp(p, 0.02, 0.92), read.tags, calibration);
  return {
    p,
    edge: priced ? p - marketYes : null,
    hits: read.hits,
    total: read.total,
    rate: read.rate,
    tags: read.tags,
    priced,
  };
}

export function nhlPropEdge(args) {
  if (!validMarket(args.marketYes)) return null;
  const read = projectNhl(args);
  if (!read) return null;
  const done = finishRead(read, args.marketYes, args.calibration);
  return {
    p: done.p,
    edge: done.edge,
    hits: done.hits,
    total: done.total,
    rate: done.rate,
    tags: done.tags,
  };
}

/** Chance of a point tonight. Same projection as the prop model. A 1+ price, when one exists, pulls it the same way. */
export function nhlPointChance(args) {
  const read = projectNhl({ ...args, type: POINTS, line: 1 });
  if (!read) return null;
  return finishRead(read, args.marketYes, args.calibration);
}

export function explainNhlPoint(lines, { priced = false, marketYes = null } = {}) {
  const value = (label) => lines.find((line) => line.label === label)?.value || '';
  const parts = [];
  const last = value('Last 10');
  if (last.includes('/')) {
    const [hits, games] = last.split('/');
    parts.push(`He has a point in ${hits} of his last ${games} games.`);
  }
  const longer = value('Long sample');
  if (longer.includes('/')) parts.push(`The longer sample is ${longer}.`);
  else if (longer) parts.push('There is not a long sample yet, so the model starts from a typical point rate.');

  const toi = value('TOI');
  const shots = value('Shots');
  const assists = value('Assists');
  const volume = value('Volume');
  const usage = [toi && `${toi} a night`, shots && `${shots} shots`, assists && `${assists} assists a game`].filter(Boolean);
  if (usage.length) {
    let sentence = `Lately that is ${usage.join(', ')}.`;
    if (volume) sentence += ` Shots and assists project to ${volume} before the matchup.`;
    parts.push(sentence);
  }
  const powerPlay = value('Power play');
  if (powerPlay) parts.push(`Power-play points are ${powerPlay}.`);
  const goalsAgainst = value('Opp goals');
  if (goalsAgainst) parts.push(`The opponent has allowed ${goalsAgainst}.`);
  const site = value('Site');
  if (site === 'Home') parts.push('This game is at home.');
  else if (site === 'Road') parts.push('This game is on the road.');
  const versus = lines.find((line) => line.id === 'opp');
  if (versus) parts.push(`Against this opponent lately, ${versus.value} cleared a point.`);
  const total = value('Game total');
  if (total) parts.push(`The game total is ${total}.`);
  const side = lines.find((line) => line.id === 'side')?.value || '';
  if (side.startsWith('Fav')) parts.push('His team is favored.');
  else if (side.startsWith('Under')) parts.push('His team is the underdog.');
  const rest = value('Rest');
  if (rest === 'Back to back') parts.push('It is the second game in two nights.');
  else if (rest) parts.push(`He last played ${rest} ago.`);
  if (priced && validMarket(marketYes)) {
    parts.push(`The read is then pulled toward the 1+ points price of ${Math.round(marketYes * 100)}%.`);
  }
  return parts.join(' ');
}
