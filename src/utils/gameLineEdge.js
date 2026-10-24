// Who wins, and the full-game total. Recent scoring is shrunk toward a
// league average, so a short sample cannot run away from a normal game.
// A game's weight lets this season count more than last season.

const LEAGUE = {
  nhl: { avg: 3.05, prior: 8, homeBump: 0.18, kind: 'goals' },
  nfl: { avg: 22.5, prior: 6, homeBump: 2.4, totalSigma: 13, marginSigma: 13.5, teamSigma: 10, kind: 'points' },
  nba: { avg: 114.5, prior: 8, homeBump: 2.7, totalSigma: 18, marginSigma: 12.5, teamSigma: 12, kind: 'points', floor: 96, cap: 138 },
};

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function shrunkMean(games, key, avg, prior) {
  if (!games.length) return avg;
  let sum = 0;
  let weight = 0;
  for (const game of games) {
    const sample = game.weight > 0 ? game.weight : 1;
    sum += game[key] * sample;
    weight += sample;
  }
  return (sum + avg * prior) / (weight + prior);
}

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function poissonTerms(lambda, max) {
  const terms = [Math.exp(-lambda)];
  for (let i = 1; i <= max; i += 1) terms.push(terms[i - 1] * lambda / i);
  return terms;
}

function nhlHomeWin(homeEG, awayEG) {
  const max = 14;
  const home = poissonTerms(homeEG, max);
  const away = poissonTerms(awayEG, max);
  let homeWins = 0;
  let awayWins = 0;
  let ties = 0;
  for (let i = 0; i <= max; i += 1) {
    for (let j = 0; j <= max; j += 1) {
      const p = home[i] * away[j];
      if (i > j) homeWins += p;
      else if (j > i) awayWins += p;
      else ties += p;
    }
  }
  const mass = homeWins + awayWins + ties || 1;
  return clamp((homeWins + ties * 0.52) / mass, 0.08, 0.92);
}

function poissonAtMost(k, lambda) {
  if (k < 0) return 0;
  let term = Math.exp(-lambda);
  let sum = term;
  for (let i = 1; i <= k; i += 1) {
    term *= lambda / i;
    sum += term;
  }
  return Math.min(1, sum);
}

function rates(homeGames, awayGames, cfg) {
  const homeOff = shrunkMean(homeGames, 'gf', cfg.avg, cfg.prior);
  const homeDef = shrunkMean(homeGames, 'ga', cfg.avg, cfg.prior);
  const awayOff = shrunkMean(awayGames, 'gf', cfg.avg, cfg.prior);
  const awayDef = shrunkMean(awayGames, 'ga', cfg.avg, cfg.prior);
  const floor = cfg.floor ?? (cfg.kind === 'goals' ? 1.6 : 10);
  const cap = cfg.cap ?? (cfg.kind === 'goals' ? 5.2 : 38);
  return {
    homeEG: clamp((homeOff + awayDef) / 2 + cfg.homeBump, floor, cap),
    awayEG: clamp((awayOff + homeDef) / 2, floor, cap),
    games: Math.min(homeGames.length, awayGames.length),
  };
}

export function gameLineRead({
  league,
  homeGames,
  awayGames,
  homeName,
  awayName,
  homePrice,
  awayPrice,
  totalLine,
  overPrice,
}) {
  const cfg = LEAGUE[league];
  if (!cfg || !homeGames?.length || !awayGames?.length) return null;
  if (typeof homePrice !== 'number' || typeof awayPrice !== 'number') return null;
  const { homeEG, awayEG, games } = rates(homeGames, awayGames, cfg);
  let homeP;
  let overP = null;
  if (cfg.kind === 'goals') {
    homeP = nhlHomeWin(homeEG, awayEG);
    if (typeof totalLine === 'number' && Number.isFinite(totalLine)) {
      overP = clamp(1 - poissonAtMost(Math.floor(totalLine), homeEG + awayEG), 0.08, 0.92);
    }
  } else {
    const margin = homeEG - awayEG;
    homeP = clamp(normalCdf(margin / cfg.marginSigma), 0.08, 0.92);
    if (typeof totalLine === 'number' && Number.isFinite(totalLine)) {
      overP = clamp(1 - normalCdf((totalLine - (homeEG + awayEG)) / cfg.totalSigma), 0.08, 0.92);
    }
  }
  const winner = homeP >= 0.5
    ? { name: homeName, modelP: homeP, price: homePrice, where: 'home' }
    : { name: awayName, modelP: 1 - homeP, price: awayPrice, where: 'road' };
  winner.edge = winner.modelP - winner.price;
  winner.tags = [`${games} games`, winner.where];
  let total = null;
  if (overP != null && typeof overPrice === 'number') {
    const over = overP >= 0.5;
    const modelP = over ? overP : 1 - overP;
    const price = over ? overPrice : 1 - overPrice;
    total = {
      label: `${over ? 'Over' : 'Under'} ${totalLine}`,
      modelP,
      price,
      edge: modelP - price,
      tags: [`${games} games`],
    };
  }
  return { winner, total };
}

function sameTeam(a, b) {
  const left = String(a || '').toLowerCase().trim();
  const right = String(b || '').toLowerCase().trim();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function restText(rows, gameStart) {
  if (!rows || typeof gameStart !== 'number') return null;
  let last = null;
  for (const row of rows) {
    if (!row.done || !(row.date < gameStart)) continue;
    if (last == null || row.date > last) last = row.date;
  }
  if (last == null) return null;
  const hours = (gameStart - last) / 36e5;
  if (!(hours > 0) || hours > 200) return null;
  if (hours < 36) return 'Back to back';
  const days = Math.max(1, Math.round(hours / 24));
  return days === 1 ? '1 day' : `${days} days`;
}

function edgeText(edge) {
  const pts = Math.round(edge * 100);
  return pts > 0 ? `+${pts}` : String(pts);
}

function overProbability(env, line) {
  const mean = env.homeEG + env.awayEG;
  if (env.cfg.kind === 'goals') return clamp(1 - poissonAtMost(Math.floor(line), mean), 0.08, 0.92);
  return clamp(1 - normalCdf((line - mean) / env.cfg.totalSigma), 0.08, 0.92);
}

function homeWin(env) {
  if (env.cfg.kind === 'goals') return nhlHomeWin(env.homeEG, env.awayEG);
  return clamp(normalCdf((env.homeEG - env.awayEG) / env.cfg.marginSigma), 0.08, 0.92);
}

export function gameEnvironment({
  league,
  homeGames,
  awayGames,
  homeName,
  awayName,
  homeAbbr,
  awayAbbr,
  homeRows,
  awayRows,
  gameStart,
}) {
  const cfg = LEAGUE[league];
  if (!cfg || !homeGames?.length || !awayGames?.length) return null;
  const { homeEG, awayEG, games } = rates(homeGames, awayGames, cfg);
  const unit = cfg.kind === 'goals' ? 'goals' : 'pts';
  const factors = [
    { id: 'base', label: homeAbbr || homeName || 'Home', value: `${homeEG.toFixed(1)} ${unit}` },
    { id: 'base', label: awayAbbr || awayName || 'Road', value: `${awayEG.toFixed(1)} ${unit}` },
    { id: 'pace', label: 'Pace', value: (homeEG + awayEG).toFixed(1) },
  ];
  const homeRest = restText(homeRows, gameStart);
  const awayRest = restText(awayRows, gameStart);
  if (homeRest) factors.push({ id: 'rest', label: `${homeAbbr || 'Home'} rest`, value: homeRest });
  if (awayRest) factors.push({ id: 'rest', label: `${awayAbbr || 'Road'} rest`, value: awayRest });
  factors.push({ id: 'base', label: 'Sample', value: `${games} games` });
  return {
    cfg,
    homeEG,
    awayEG,
    games,
    homeName,
    awayName,
    homeAbbr,
    awayAbbr,
    homeP: homeWin({ cfg, homeEG, awayEG }),
    factors,
  };
}

function modelChips(modelP, price, modelLabel, proj) {
  const edge = modelP - price;
  const chips = [];
  if (proj != null && Number.isFinite(proj)) chips.push({ id: 'proj', label: 'Proj', value: proj.toFixed(1) });
  chips.push({ id: 'model', label: 'Model', value: modelLabel, on: true });
  chips.push({ id: 'edge', label: 'Edge', value: edgeText(edge), on: Math.abs(edge) >= 0.04 });
  return chips;
}

function parseSpread(label) {
  const match = String(label || '').match(/^(.*)\s+([+-]\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const signed = Number(match[2]);
  if (!Number.isFinite(signed)) return null;
  return { team: match[1].trim(), signed };
}

function teamTotalName(row) {
  if (row.teamName) return row.teamName;
  const match = String(row.player || '').match(/^(.+?)\s+over\b/i);
  return match ? match[1].trim() : '';
}

export function lineCardModel(row, env) {
  if (!env || !row) return null;
  const price = typeof row.marketP === 'number' ? row.marketP : null;
  if (row.sideText === 'moneyline' && price != null) {
    const home = sameTeam(row.player, env.homeName);
    const away = sameTeam(row.player, env.awayName);
    if (!home && !away) return null;
    const modelP = home ? env.homeP : 1 - env.homeP;
    return modelChips(modelP, price, `Win ${Math.round(modelP * 100)}%`, null);
  }
  if (row.sideText === 'total' && price != null && typeof row.line === 'number' && !String(row.type || '').includes('points_')) {
    const overP = overProbability(env, row.line);
    const under = /^under\b/i.test(row.player || '');
    const modelP = under ? 1 - overP : overP;
    const label = under ? `Under ${Math.round(modelP * 100)}%` : `Over ${Math.round(modelP * 100)}%`;
    return modelChips(modelP, price, label, env.homeEG + env.awayEG);
  }
  if (row.sideText === 'spread' && price != null && env.cfg.kind === 'points') {
    const parsed = parseSpread(row.player);
    if (!parsed) return null;
    const home = sameTeam(parsed.team, env.homeName);
    const away = sameTeam(parsed.team, env.awayName);
    if (!home && !away) return null;
    const mean = home ? env.homeEG - env.awayEG : env.awayEG - env.homeEG;
    const modelP = clamp(normalCdf((mean + parsed.signed) / env.cfg.marginSigma), 0.05, 0.95);
    return modelChips(modelP, price, `Cover ${Math.round(modelP * 100)}%`, mean);
  }
  if (row.type === 'basketball_team_total_points' && env.cfg.teamSigma && typeof row.line === 'number' && typeof row.yes === 'number') {
    const name = teamTotalName(row);
    const home = sameTeam(name, env.homeName);
    const away = sameTeam(name, env.awayName);
    if (!home && !away) return null;
    const mean = home ? env.homeEG : env.awayEG;
    const overP = clamp(1 - normalCdf((row.line - mean) / env.cfg.teamSigma), 0.05, 0.95);
    return modelChips(overP, row.yes, `Over ${Math.round(overP * 100)}%`, mean);
  }
  return null;
}
