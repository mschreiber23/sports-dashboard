// Who wins, and the full-game total. Recent scoring is shrunk toward a
// league average, so a short sample cannot run away from a normal game.

const LEAGUE = {
  nhl: { avg: 3.05, prior: 8, homeBump: 0.18, kind: 'goals' },
  nfl: { avg: 22.5, prior: 6, homeBump: 2.4, totalSigma: 13, marginSigma: 13.5, kind: 'points' },
};

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function shrunkMean(values, avg, prior) {
  if (!values.length) return avg;
  const sum = values.reduce((total, value) => total + value, 0);
  return (sum + avg * prior) / (values.length + prior);
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
  const homeOff = shrunkMean(homeGames.map((game) => game.gf), cfg.avg, cfg.prior);
  const homeDef = shrunkMean(homeGames.map((game) => game.ga), cfg.avg, cfg.prior);
  const awayOff = shrunkMean(awayGames.map((game) => game.gf), cfg.avg, cfg.prior);
  const awayDef = shrunkMean(awayGames.map((game) => game.ga), cfg.avg, cfg.prior);
  const floor = cfg.kind === 'goals' ? 1.6 : 10;
  const cap = cfg.kind === 'goals' ? 5.2 : 38;
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
