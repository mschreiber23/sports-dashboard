// NBA player props. The chance is expected minutes times per-minute production,
// with shooting pulled toward a normal rate so a hot or cold week does not
// take over. Role, opponent scoring, pace, the game total, the spread, site,
// and rest move that projection. The last-10 hit rate is a small piece. The
// result is then pulled toward this book's yes price.
//
// A primary defender, positional defense splits, other books' prices, and
// parlay correlation are not in this feed, so they are left off rather than
// filled in.

import { sameName } from '../api/nflInjuries.js';
import { applyLearned } from './propCalibration.js';
import {
  NBA_BARE_MARKET_WEIGHT,
  NBA_HIT_WEIGHT,
  NBA_MARKET_WEIGHT,
  NBA_VOLATILE_HIT_WEIGHT,
  NBA_VOLATILE_MARKET_WEIGHT,
  fairProbability,
} from './fairPrice.js';

const POINTS = 'basketball_player_points';
const REB = 'basketball_player_rebounds';
const AST = 'basketball_player_assists';
const THREES = 'basketball_player_threes';
const PRA = 'basketball_player_points_rebounds_assists';
const STEALS = 'basketball_player_steals';
const BLOCKS = 'basketball_player_blocks';

const MODELED = new Set([POINTS, REB, AST, THREES, PRA, STEALS, BLOCKS]);
const VOLATILE = new Set([THREES, STEALS, BLOCKS]);

const OPP_KEY = {
  [POINTS]: 'fga',
  [THREES]: 'tpa',
  [REB]: 'reb',
  [AST]: 'ast',
  [STEALS]: 'stl',
  [BLOCKS]: 'blk',
};

const OPP_LABEL = {
  fga: 'FGA',
  tpa: '3PA',
  reb: 'Rebounds',
  ast: 'Assists',
  stl: 'Steals',
  blk: 'Blocks',
};

const SCORE_TYPES = new Set([POINTS, THREES, AST, PRA]);

export function nbaModeled(type) {
  return MODELED.has(type);
}

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
  return { mean: mean(values), n: values.length, values };
}

function stdev(values) {
  if (!values || values.length < 4) return null;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function sameTeam(a, b) {
  const left = String(a || '').toLowerCase().trim();
  const right = String(b || '').toLowerCase().trim();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function normalAtLeast(avg, sigma, line) {
  const need = Math.ceil(Number(line));
  if (!Number.isFinite(need) || !(sigma > 0)) return null;
  const z = ((need - 0.5) - avg) / sigma;
  return clamp(1 - normalCdf(z), 0.02, 0.95);
}

function fallbackRate(type, line) {
  const n = Number(line);
  if (type === POINTS) {
    if (n <= 10) return 0.72;
    if (n <= 15) return 0.55;
    if (n <= 22) return 0.42;
    if (n <= 28) return 0.24;
    return 0.12;
  }
  if (type === REB) {
    if (n <= 4) return 0.7;
    if (n <= 7) return 0.48;
    if (n <= 10) return 0.28;
    return 0.12;
  }
  if (type === AST) {
    if (n <= 3) return 0.66;
    if (n <= 6) return 0.45;
    if (n <= 9) return 0.24;
    return 0.1;
  }
  if (type === THREES) {
    if (n <= 1) return 0.62;
    if (n <= 2) return 0.4;
    if (n <= 3) return 0.22;
    if (n <= 5) return 0.1;
    return 0.04;
  }
  if (type === PRA) {
    if (n <= 20) return 0.68;
    if (n <= 30) return 0.48;
    if (n <= 40) return 0.28;
    return 0.12;
  }
  if (n <= 1) return 0.42;
  if (n <= 2) return 0.14;
  return 0.05;
}

function projectedMinutes(priorContext, recentContext) {
  const older = seriesMean(priorContext, 'min');
  const last3 = seriesMean(recentContext, 'min', 3);
  const last5 = seriesMean(recentContext, 'min', 5);
  let minutes = null;
  if (last3.n >= 3 && older.n >= 5 && older.mean > 0) {
    const ratio = last3.mean / older.mean;
    if (ratio <= 0.72 || ratio >= 1.3) minutes = last3.mean;
  }
  if (minutes == null && last5.n >= 3 && older.n >= 5 && last5.mean != null && older.mean != null) {
    minutes = last5.mean * 0.65 + older.mean * 0.35;
  }
  if (minutes == null && last5.n >= 3 && last5.mean != null) minutes = last5.mean;
  if (minutes == null && older.n >= 5 && older.mean != null) minutes = older.mean;
  if (minutes == null) return null;
  return clamp(minutes, 0, 42);
}

function perMinute(rows, key) {
  let num = 0;
  let den = 0;
  let n = 0;
  for (const row of rows || []) {
    if (typeof row?.min !== 'number' || !(row.min > 0) || typeof row[key] !== 'number') continue;
    num += row[key];
    den += row.min;
    n += 1;
  }
  if (n < 3 || !(den > 0)) return null;
  return { per: num / den, n };
}

function blendedPer(priorContext, recentContext, key) {
  const recent = perMinute((recentContext || []).slice(-5), key);
  const older = perMinute(priorContext, key);
  if (recent && older && older.per > 0) {
    const ratio = recent.per / older.per;
    if (recent.n >= 3 && older.n >= 5 && (ratio <= 0.6 || ratio >= 1.65)) return recent.per;
    return recent.per * 0.65 + older.per * 0.35;
  }
  if (recent) return recent.per;
  if (older) return older.per;
  return null;
}

function shrunkRate(rows, madeKey, attKey, priorRate, priorN) {
  let made = 0;
  let attempts = 0;
  for (const row of rows || []) {
    if (typeof row?.[attKey] !== 'number' || !(row[attKey] > 0) || typeof row[madeKey] !== 'number') continue;
    made += row[madeKey];
    attempts += row[attKey];
  }
  if (attempts < 8) return null;
  return {
    rate: (made + priorRate * priorN) / (attempts + priorN),
    raw: made / attempts,
    attempts,
  };
}

function sigmaFor(type, avg) {
  if (type === POINTS) return Math.max(6.5, avg * 0.38);
  if (type === REB) return Math.max(2.6, avg * 0.48);
  if (type === AST) return Math.max(2.2, avg * 0.5);
  if (type === THREES) return Math.max(1.35, avg * 0.72);
  if (type === STEALS || type === BLOCKS) return Math.max(0.9, avg * 0.85);
  if (type === PRA) return Math.max(8, avg * 0.32);
  return Math.max(3, avg * 0.45);
}

function parseSpread(label) {
  const match = String(label || '').match(/^(.*)\s+([+-]\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const signed = Number(match[2]);
  if (!Number.isFinite(signed)) return null;
  return { team: match[1].trim(), signed };
}

function teamSpread(teamName, opponentName, spreadLabel) {
  const parsed = parseSpread(spreadLabel);
  if (!parsed) return null;
  if (sameTeam(teamName, parsed.team)) return parsed.signed;
  if (sameTeam(opponentName, parsed.team)) return -parsed.signed;
  return null;
}

function paceOf({ teamFor, teamAgainst, opponentFor, opponentGoalsAgainst }) {
  const parts = [teamFor, teamAgainst, opponentFor, opponentGoalsAgainst].filter((value) => (
    typeof value === 'number' && Number.isFinite(value)
  ));
  if (parts.length < 4) return null;
  return (teamFor + teamAgainst + opponentFor + opponentGoalsAgainst) / 2;
}

function restInfo(recentContext, lastPlayed, gameStart) {
  if (typeof gameStart !== 'number' || typeof lastPlayed !== 'number' || !Number.isFinite(lastPlayed)) {
    return { hours: null, b2b: false, dense: false };
  }
  const hours = (gameStart - lastPlayed) / 36e5;
  if (!(hours > 0) || hours > 240) return { hours: null, b2b: false, dense: false };
  const b2b = hours < 36;
  const times = (recentContext || [])
    .map((row) => Date.parse(row?.date))
    .filter((time) => Number.isFinite(time) && time < gameStart)
    .sort((a, b) => a - b);
  let dense = false;
  if (b2b && times.length >= 2) {
    const latest = times[times.length - 1];
    const previous = times[times.length - 2];
    const prev = (latest - previous) / 36e5;
    const sinceLatest = (gameStart - latest) / 36e5;
    dense = prev > 0 && prev < 40 && sinceLatest > 0 && sinceLatest < 40;
  }
  return { hours, b2b, dense };
}

function roleText(rows, type, last) {
  if (type === PRA) {
    const fga = seriesMean(rows, 'fga', last);
    const reb = seriesMean(rows, 'reb', last);
    const ast = seriesMean(rows, 'ast', last);
    const parts = [];
    if (fga.mean != null) parts.push(`${fga.mean.toFixed(1)} FGA`);
    if (reb.mean != null) parts.push(`${reb.mean.toFixed(1)} reb`);
    if (ast.mean != null) parts.push(`${ast.mean.toFixed(1)} ast`);
    return parts.join(' · ');
  }
  const key = OPP_KEY[type];
  if (!key) return '';
  const stat = seriesMean(rows, key, last);
  return stat.mean == null ? '' : stat.mean.toFixed(1);
}

function countLambda(type, minutes, recentContext, priorContext) {
  const rows = [...(priorContext || []), ...(recentContext || [])];
  if (!(minutes > 0)) return { lambda: null, eff: null };
  if (type === PRA) {
    const points = countLambda(POINTS, minutes, recentContext, priorContext);
    const rebounds = countLambda(REB, minutes, recentContext, priorContext);
    const assists = countLambda(AST, minutes, recentContext, priorContext);
    if (points.lambda == null || rebounds.lambda == null || assists.lambda == null) return { lambda: null, eff: points.eff };
    return { lambda: points.lambda + rebounds.lambda + assists.lambda, eff: points.eff };
  }
  if (type === POINTS) {
    const eff = shrunkRate(rows, 'pts', 'fga', 1.18, 120);
    const fga = blendedPer(priorContext, recentContext, 'fga');
    if (eff && fga != null) return { lambda: minutes * fga * eff.rate, eff };
    const pts = blendedPer(priorContext, recentContext, 'pts');
    if (pts != null) return { lambda: minutes * pts, eff };
  }
  if (type === THREES) {
    const eff = shrunkRate(rows, 'tpm', 'tpa', 0.36, 80);
    const tpa = blendedPer(priorContext, recentContext, 'tpa');
    if (eff && tpa != null) return { lambda: minutes * tpa * eff.rate, eff };
    const made = blendedPer(priorContext, recentContext, 'tpm');
    if (made != null) return { lambda: minutes * made, eff };
  }
  const key = OPP_KEY[type];
  const rate = key ? blendedPer(priorContext, recentContext, key) : null;
  if (rate == null) return { lambda: null, eff: null };
  return { lambda: minutes * rate, eff: null };
}

function applyShift(p, tags, shift, up, down) {
  if (shift >= 0.014 && up) tags.push(up);
  else if (shift <= -0.014 && down) tags.push(down);
  return p + shift;
}

function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

function lineupLines(playerName, absences) {
  const rows = absences || [];
  const self = rows.find((row) => sameName(row.name, playerName));
  const lines = [];
  if (self?.status === 'out') {
    lines.push({ id: 'lineup', label: 'Lineup', value: 'Listed out' });
    return lines;
  }
  if (self?.status === 'dtd') lines.push({ id: 'lineup', label: 'Lineup', value: 'Day to day' });
  const outs = rows.filter((row) => row.status === 'out' && !sameName(row.name, playerName));
  if (outs.length) {
    const names = outs.slice(0, 2).map((row) => shortName(row.name)).join(', ');
    const extra = outs.length > 2 ? ` +${outs.length - 2}` : '';
    lines.push({ id: 'lineup', label: 'Out', value: `${names}${extra}` });
  }
  const dtd = rows.filter((row) => row.status === 'dtd' && row !== self);
  if (dtd.length) lines.push({ id: 'lineup', label: 'Day to day', value: String(dtd.length) });
  return lines;
}

function analyze(args) {
  const {
    type, line, recent, prior, recentContext, priorContext, versus, opponentLabel,
    lastPlayed, gameStart, gameTotal, teamName, opponentName, spreadLabel,
    opponentGoalsAgainst, home, playerName, absences,
  } = args;
  if (!nbaModeled(type) || line == null) return { lines: [], ready: false };
  const lines = [];
  const tags = [];

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

  const recentMin = seriesMean(recentContext, 'min', 5);
  const priorMin = seriesMean(priorContext, 'min');
  let minutes = projectedMinutes(priorContext, recentContext);
  if (recentMin.mean != null) lines.push({ id: 'min', label: 'Minutes', value: recentMin.mean.toFixed(1) });
  if (priorMin.n >= 5 && priorMin.mean != null) lines.push({ id: 'min', label: 'Prior min', value: priorMin.mean.toFixed(1) });
  if (recentMin.n >= 3 && priorMin.n >= 5 && recentMin.mean != null && priorMin.mean != null) {
    const delta = recentMin.mean - priorMin.mean;
    if (delta >= 4) tags.push('minutes up');
    else if (delta <= -4) tags.push('minutes down');
  }

  const role = roleText(recentContext, type, 5);
  const priorRole = roleText(priorContext, type);
  const oppKey = OPP_KEY[type];
  if (role) lines.push({ id: 'usage', label: type === PRA ? 'Role' : (OPP_LABEL[oppKey] || 'Role'), value: role });
  if (priorRole && seriesMean(priorContext, oppKey || 'fga').n >= 5) {
    lines.push({ id: 'usage', label: type === PRA ? 'Prior role' : `Prior ${OPP_LABEL[oppKey] || 'role'}`, value: priorRole });
  }
  if (oppKey) {
    const recentOpp = seriesMean(recentContext, oppKey, 5);
    const priorOpp = seriesMean(priorContext, oppKey);
    if (recentOpp.n >= 3 && priorOpp.n >= 5 && recentOpp.mean != null && priorOpp.mean != null) {
      const min = oppKey === 'fga' ? 2.5 : oppKey === 'tpa' ? 1.2 : 1.2;
      const delta = recentOpp.mean - priorOpp.mean;
      if (delta >= min) tags.push('usage up');
      else if (delta <= -min) tags.push('usage down');
    }
  }

  const foul = seriesMean(recentContext, 'pf', 5);
  const minuteSd = stdev(seriesMean(recentContext, 'min', 8).values);
  let security = '';
  if (minuteSd != null && minuteSd >= 8) security = 'Volatile';
  else if (foul.n >= 3 && foul.mean >= 4) security = 'Foul risk';
  else if (minuteSd != null && minuteSd < 4.5 && recentMin.mean >= 28) security = 'Stable';
  else if (recentMin.mean != null) security = 'Normal';
  if (security) lines.push({ id: 'security', label: 'Security', value: security });

  const spread = teamSpread(teamName, opponentName, spreadLabel);
  if (minutes != null && spread != null && Math.abs(spread) >= 10 && minutes >= 28) {
    const cut = Math.abs(spread) >= 14 ? 0.88 : 0.93;
    minutes *= cut;
    tags.push('blowout');
  }
  if (minutes != null && foul.n >= 3 && foul.mean >= 4 && minutes >= 24) {
    minutes *= 0.95;
    tags.push('foul risk');
  }
  if (minuteSd != null && minuteSd >= 8) tags.push('volatile minutes');

  const counted = countLambda(type, minutes, recentContext, priorContext);
  let lambda = counted.lambda;
  if (counted.eff) {
    lines.push({ id: 'shoot', label: 'Shooting', value: type === THREES ? `${Math.round(counted.eff.rate * 100)}%` : counted.eff.rate.toFixed(2) });
    if (counted.eff.raw - counted.eff.rate >= 0.18) tags.push('hot shooting');
    else if (counted.eff.rate - counted.eff.raw >= 0.18) tags.push('cold shooting');
  }

  const env = environmentShift(args, type);
  tags.push(...env.tags);
  if (lambda != null) lambda *= env.mult;

  const rest = restInfo(recentContext, lastPlayed, gameStart);
  if (lambda != null && rest.b2b) {
    lambda *= rest.dense ? 0.94 : 0.96;
    tags.push(rest.dense ? '3 in 4' : 'back to back');
  }

  let sigma = lambda == null ? null : sigmaFor(type, lambda);
  if (sigma != null && security === 'Volatile') sigma *= 1.15;
  const volumeP = lambda == null ? null : normalAtLeast(lambda, sigma, line);
  if (lambda != null) lines.push({ id: 'proj', label: 'Proj', value: lambda.toFixed(1) });
  if (volumeP != null) lines.push({ id: 'volume', label: 'Volume', value: `${Math.round(volumeP * 100)}%` });

  lines.push(...lineupLines(playerName, absences));

  if (versus?.length) {
    const hits = versus.filter((value) => value >= line).length;
    lines.push({ id: 'opp', label: `vs ${opponentLabel || 'opponent'}`, value: `${hits}/${versus.length}` });
  }
  if (typeof opponentGoalsAgainst === 'number' && Number.isFinite(opponentGoalsAgainst)) {
    lines.push({ id: 'defense', label: 'Opp pts', value: `${opponentGoalsAgainst.toFixed(1)}/g` });
  }
  if (env.pace != null) lines.push({ id: 'pace', label: 'Pace', value: env.pace.toFixed(0) });
  if (spread != null) {
    const text = spread > 0 ? `+${spread}` : String(spread);
    lines.push({ id: 'spread', label: 'Spread', value: text });
  }
  if (typeof gameTotal === 'number' && Number.isFinite(gameTotal)) {
    lines.push({ id: 'total', label: 'Game total', value: String(gameTotal) });
  }
  if (home === true) lines.push({ id: 'site', label: 'Site', value: 'Home' });
  else if (home === false) lines.push({ id: 'site', label: 'Site', value: 'Road' });
  if (rest.hours != null) {
    let value = `${Math.max(1, Math.round(rest.hours / 24))} days`;
    if (rest.dense) value = '3 in 4';
    else if (rest.b2b) value = 'Back to back';
    lines.push({ id: 'rest', label: 'Rest', value });
  }

  const self = (absences || []).find((row) => sameName(row.name, playerName));
  return {
    lines,
    tags,
    lambda,
    volumeP,
    minutes,
    ready: Boolean(recent && recent.length >= 5),
    out: self?.status === 'out',
    dtd: self?.status === 'dtd',
  };
}

function environmentShift(args, type) {
  const tags = [];
  let mult = 1;
  const scoring = SCORE_TYPES.has(type);
  const boards = type === REB || type === PRA;
  if (typeof args.opponentGoalsAgainst === 'number' && Number.isFinite(args.opponentGoalsAgainst) && (scoring || boards)) {
    const tilt = clamp((args.opponentGoalsAgainst - 114.5) * (boards && !scoring ? 0.002 : 0.004), -0.05, 0.05);
    mult *= 1 + tilt;
    if (tilt >= 0.02) tags.push('soft defense');
    else if (tilt <= -0.02) tags.push('tough defense');
  }
  const pace = paceOf(args);
  if (pace != null) {
    const tilt = clamp((pace - 227) * 0.0025, -0.04, 0.04);
    const applied = scoring ? tilt : tilt * 0.65;
    mult *= 1 + applied;
    if (applied >= 0.015) tags.push('pace up');
    else if (applied <= -0.015) tags.push('pace down');
  }
  if (typeof args.gameTotal === 'number' && Number.isFinite(args.gameTotal)) {
    const tilt = clamp((args.gameTotal - 226) * 0.0025, -0.04, 0.04);
    const applied = scoring ? tilt : tilt * 0.5;
    mult *= 1 + applied;
    if (applied >= 0.015) tags.push('high total');
    else if (applied <= -0.015) tags.push('low total');
  }
  if (args.home === true) {
    mult *= scoring ? 1.015 : 1.008;
    tags.push('home');
  } else if (args.home === false) {
    mult *= scoring ? 0.99 : 0.995;
    tags.push('road');
  }
  return { mult: clamp(mult, 0.9, 1.1), tags, pace };
}

function validMarket(marketYes) {
  return typeof marketYes === 'number' && Number.isFinite(marketYes) && marketYes >= 0 && marketYes <= 1;
}

export function nbaFactorLines(args) {
  return analyze(args).lines;
}

export function nbaPropEdge(args) {
  if (!validMarket(args.marketYes)) return null;
  const read = analyze(args);
  if (!read.ready) return null;
  const hits = args.recent.filter((value) => value >= args.line).length;
  const n = args.recent.length;
  const priorHits = (args.prior || []).filter((value) => value >= args.line).length;
  const priorN = (args.prior || []).length;
  const strength = VOLATILE.has(args.type) ? 14 : 8;
  const anchor = priorN >= 8 ? priorHits / priorN : fallbackRate(args.type, args.line);
  let p = (hits + anchor * strength) / (n + strength);
  const tags = [...read.tags];

  if (read.volumeP != null) {
    const weight = VOLATILE.has(args.type) ? NBA_VOLATILE_HIT_WEIGHT : NBA_HIT_WEIGHT;
    const blended = weight * p + (1 - weight) * read.volumeP;
    p = applyShift(p, tags, blended - p, 'volume', 'low volume');
  }

  if (args.versus && args.versus.length >= 3) {
    const rate = args.versus.filter((value) => value >= args.line).length / args.versus.length;
    const shift = clamp((rate - p) * 0.22, -0.035, 0.035);
    p = applyShift(p, tags, shift, 'hot vs opponent', 'cold vs opponent');
  }

  const marketWeight = read.volumeP == null
    ? NBA_BARE_MARKET_WEIGHT
    : (VOLATILE.has(args.type) ? NBA_VOLATILE_MARKET_WEIGHT : NBA_MARKET_WEIGHT);
  p = fairProbability(clamp(p, 0.02, 0.95), args.marketYes, marketWeight);
  if (read.dtd) {
    p -= 0.025;
    if (!tags.includes('day to day')) tags.push('day to day');
  }
  if (read.out) {
    p = Math.min(p, 0.12);
    if (!tags.includes('out')) tags.push('out');
  }
  p = applyLearned(clamp(p, 0.02, 0.92), tags, args.calibration);
  return {
    p,
    edge: p - args.marketYes,
    hits,
    total: n,
    rate: Math.round((hits / n) * 100),
    tags,
    proj: read.lambda,
  };
}
