// NFL player props. Shrink the last-10 hit rate toward a longer sample, blend in
// usage (attempts, carries, or targets) times a shrunk efficiency rate, then
// nudge for a recent usage change, the games against this opponent, the game
// total, which side is favored, and a short week or extra rest. Edge is that
// probability minus the yes price.

const PASS_YDS = 'football_player_passing_yards';
const RUSH_YDS = 'football_player_rushing_yards';
const REC_YDS = 'football_player_receiving_yards';
const RECS = 'football_player_receptions';
const TD = 'football_player_touchdowns';
const PASS_TD = 'football_player_passing_touchdowns';
const COMP = 'football_player_passing_completions';
const PASS_ATT = 'football_player_passing_attempts';
const RUSH_ATT = 'football_player_rushing_attempts';
const INT = 'football_player_interceptions_thrown';
const SCRIM = 'football_player_scrimmage_yards';
const LONG = 'football_player_longest_reception';

const VOLATILE = new Set([TD, PASS_TD, INT, LONG]);

export function nflModeled(type) {
  return type === PASS_YDS || type === RUSH_YDS || type === REC_YDS || type === RECS
    || type === TD || type === PASS_TD || type === COMP || type === PASS_ATT
    || type === RUSH_ATT || type === INT || type === SCRIM || type === LONG;
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function avg(rows, key) {
  const values = [];
  for (const row of rows || []) {
    const value = row?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
  }
  if (!values.length) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return { mean: sum / values.length, n: values.length, sum };
}

function phi(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function normalAtLeast(mean, sd, line) {
  if (!(sd > 0) || !Number.isFinite(mean)) return null;
  const z = (Number(line) - 0.5 - mean) / sd;
  return clamp(1 - phi(z), 0.02, 0.95);
}

function poissonAtLeast(lambda, line) {
  const need = Math.ceil(Number(line));
  if (!Number.isFinite(need) || need <= 0) return 1;
  if (!(lambda > 0)) return 0.02;
  let term = Math.exp(-lambda);
  let below = term;
  for (let k = 1; k < need; k += 1) {
    term *= lambda / k;
    below += term;
  }
  return clamp(1 - below, 0.02, 0.95);
}

function fallbackRate(type, line) {
  if (type === PASS_TD) {
    if (line <= 1) return 0.55;
    if (line <= 2) return 0.28;
    if (line <= 3) return 0.12;
    return 0.04;
  }
  if (type === TD) {
    if (line <= 1) return 0.28;
    if (line <= 2) return 0.08;
    return 0.03;
  }
  if (type === INT) return line <= 1 ? 0.35 : 0.12;
  if (type === LONG) return line <= 20 ? 0.45 : 0.2;
  return 0.45;
}

function windowOf(prior, recent, key) {
  const older = avg(prior, key);
  return (older?.n >= 5 ? prior : recent) || [];
}

function shrunk(all, numKey, denKey, priorNum, priorDen) {
  const num = avg(all, numKey);
  const den = avg(all, denKey);
  if (!num || !den || !(den.sum > 0)) return null;
  return (num.sum + priorNum) / (den.sum + priorDen);
}

function volumeRead(type, line, recentContext, priorContext) {
  const recent = recentContext || [];
  const prior = priorContext || [];
  const all = [...prior, ...recent];
  const last5 = recent.slice(-5);
  const blank = { p: null, rows: [] };

  if (type === PASS_YDS || type === PASS_TD || type === COMP || type === PASS_ATT || type === INT) {
    const source = windowOf(prior, recent, 'passAtt');
    const attempts = avg(source, 'passAtt');
    if (!attempts || attempts.n < 5) return { ...blank, rows: usageRows('Attempts', 'Prior att', last5, prior, 'passAtt') };
    const ypa = shrunk(all, 'passYds', 'passAtt', 7 * 100, 100);
    const compRate = shrunk(all, 'completions', 'passAtt', 0.64 * 80, 80);
    const tdRate = shrunk(all, 'passTd', 'passAtt', 0.045 * 120, 120);
    const intRate = shrunk(all, 'ints', 'passAtt', 0.025 * 120, 120);
    let p = null;
    let rateLabel = 'Y/A';
    let rateValue = ypa == null ? null : ypa.toFixed(1);
    if (type === PASS_YDS && ypa != null) {
      const mean = attempts.mean * ypa;
      p = normalAtLeast(mean, Math.max(45, mean * 0.22), line);
    } else if (type === PASS_ATT) {
      p = poissonAtLeast(attempts.mean, line);
      rateLabel = null;
    } else if (type === COMP && compRate != null) {
      p = poissonAtLeast(attempts.mean * compRate, line);
      rateLabel = 'Cmp%';
      rateValue = `${Math.round(compRate * 100)}%`;
    } else if (type === PASS_TD && tdRate != null) {
      p = poissonAtLeast(attempts.mean * tdRate, line);
      rateLabel = 'TD/att';
      rateValue = tdRate.toFixed(3);
    } else if (type === INT && intRate != null) {
      p = poissonAtLeast(attempts.mean * intRate, line);
      rateLabel = 'INT/att';
      rateValue = intRate.toFixed(3);
    }
    return { p, rows: usageRows('Attempts', 'Prior att', last5, prior, 'passAtt', rateLabel, rateValue) };
  }

  if (type === RUSH_YDS || type === RUSH_ATT) {
    const source = windowOf(prior, recent, 'rushAtt');
    const carries = avg(source, 'rushAtt');
    if (!carries || carries.n < 5) return { ...blank, rows: usageRows('Carries', 'Prior carries', last5, prior, 'rushAtt') };
    const ypc = shrunk(all, 'rushYds', 'rushAtt', 4.3 * 40, 40);
    let p = null;
    if (type === RUSH_ATT) p = poissonAtLeast(carries.mean, line);
    else if (ypc != null) {
      const mean = carries.mean * ypc;
      p = normalAtLeast(mean, Math.max(18, mean * 0.4), line);
    }
    return {
      p,
      rows: usageRows('Carries', 'Prior carries', last5, prior, 'rushAtt', type === RUSH_YDS ? 'YPC' : null, ypc == null ? null : ypc.toFixed(1)),
    };
  }

  if (type === REC_YDS || type === RECS || type === LONG) {
    const source = windowOf(prior, recent, 'targets');
    const targets = avg(source, 'targets');
    const ypt = shrunk(all, 'recYds', 'targets', 7.8 * 40, 40);
    const catchRate = shrunk(all, 'rec', 'targets', 0.65 * 30, 30);
    let p = null;
    if (targets && targets.n >= 5 && type === RECS && catchRate != null) p = poissonAtLeast(targets.mean * catchRate, line);
    else if (targets && targets.n >= 5 && type === REC_YDS && ypt != null) {
      const mean = targets.mean * ypt;
      p = normalAtLeast(mean, Math.max(18, mean * 0.45), line);
    }
    const rateLabel = type === RECS ? 'Catch%' : 'Y/tgt';
    const rateValue = type === RECS
      ? (catchRate == null ? null : `${Math.round(catchRate * 100)}%`)
      : (ypt == null ? null : ypt.toFixed(1));
    return { p, rows: usageRows('Targets', 'Prior tgt', last5, prior, 'targets', type === LONG ? null : rateLabel, type === LONG ? null : rateValue) };
  }

  if (type === SCRIM || type === TD) {
    const carrySource = windowOf(prior, recent, 'rushAtt');
    const targetSource = windowOf(prior, recent, 'targets');
    const carries = avg(carrySource, 'rushAtt');
    const targets = avg(targetSource, 'targets');
    const ypc = shrunk(all, 'rushYds', 'rushAtt', 4.3 * 40, 40);
    const ypt = shrunk(all, 'recYds', 'targets', 7.8 * 40, 40);
    const rushTd = shrunk(all, 'rushTd', 'rushAtt', 0.03 * 50, 50);
    const recTd = shrunk(all, 'recTd', 'targets', 0.035 * 40, 40);
    let p = null;
    if (type === SCRIM) {
      const rushMean = carries && carries.n >= 5 && ypc != null ? carries.mean * ypc : 0;
      const recMean = targets && targets.n >= 5 && ypt != null ? targets.mean * ypt : 0;
      if (rushMean || recMean) {
        const mean = rushMean + recMean;
        const sd = Math.max(20, Math.sqrt((rushMean * 0.4) ** 2 + (recMean * 0.45) ** 2));
        p = normalAtLeast(mean, sd, line);
      }
    } else {
      const lambda = (carries && carries.n >= 5 && rushTd != null ? carries.mean * rushTd : 0)
        + (targets && targets.n >= 5 && recTd != null ? targets.mean * recTd : 0);
      if (lambda > 0) p = poissonAtLeast(lambda, line);
    }
    const rows = [
      ...usageRows('Carries', 'Prior carries', last5, prior, 'rushAtt'),
      ...usageRows('Targets', 'Prior tgt', last5, prior, 'targets'),
    ];
    return { p, rows };
  }

  return blank;
}

function usageRows(label, priorLabel, recent, prior, key, rateLabel, rateValue) {
  const rows = [];
  const recentAvg = avg(recent, key);
  const priorAvg = avg(prior, key);
  if (recentAvg) rows.push({ id: 'usage', label, value: recentAvg.mean.toFixed(1) });
  if (priorAvg && priorAvg.n >= 5) rows.push({ id: 'usage', label: priorLabel, value: priorAvg.mean.toFixed(1) });
  if (rateLabel && rateValue != null) rows.push({ id: 'volume', label: rateLabel, value: rateValue });
  return rows;
}

function trend(recent, prior, key, per) {
  const recentAvg = avg((recent || []).slice(-5), key);
  const priorAvg = avg(prior, key);
  if (!recentAvg || recentAvg.n < 3 || !priorAvg || priorAvg.n < 5) return 0;
  return clamp((recentAvg.mean - priorAvg.mean) * per, -0.06, 0.06);
}

function applyShift(p, tags, shift, up, down) {
  if (shift >= 0.014 && up) tags.push(up);
  else if (shift <= -0.014 && down) tags.push(down);
  return p + shift;
}

function sameTeam(a, b) {
  const left = String(a || '').toLowerCase().trim();
  const right = String(b || '').toLowerCase().trim();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function nflFactorLines({
  type, line, recent, prior, recentContext, priorContext, versus,
  lastPlayed, gameStart, gameTotal, teamName, opponentName, favoriteName, favoriteYes, opponentLabel,
}) {
  if (!nflModeled(type) || line == null) return [];
  const lines = [];
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
  const volume = volumeRead(type, line, recentContext, priorContext);
  lines.push(...volume.rows);
  if (volume.p != null) lines.push({ id: 'volume', label: 'Volume', value: `${Math.round(volume.p * 100)}%` });
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
    if (hours > 0 && hours < 144) lines.push({ id: 'rest', label: 'Rest', value: 'Short week' });
    else if (hours >= 240) lines.push({ id: 'rest', label: 'Rest', value: 'Rested' });
    else if (hours >= 144) lines.push({ id: 'rest', label: 'Rest', value: `${Math.round(hours / 24)} days` });
  }
  return lines;
}

export function nflPropEdge(input) {
  const {
    type, line, recent, prior, recentContext, priorContext, versus, marketYes,
    lastPlayed, gameStart, gameTotal, teamName, opponentName, favoriteName, favoriteYes,
  } = input;
  if (!nflModeled(type)) return null;
  if (!recent || recent.length < 5 || line == null) return null;
  if (typeof marketYes !== 'number' || !Number.isFinite(marketYes) || marketYes < 0 || marketYes > 1) return null;

  const hits = recent.filter((value) => value >= line).length;
  const n = recent.length;
  const priorHits = (prior || []).filter((value) => value >= line).length;
  const priorN = (prior || []).length;
  const strength = VOLATILE.has(type) ? 14 : 8;
  const anchor = priorN >= 8 ? priorHits / priorN : fallbackRate(type, line);
  let p = (hits + anchor * strength) / (n + strength);
  const tags = [];

  const volume = volumeRead(type, line, recentContext, priorContext);
  if (volume.p != null) {
    const blended = VOLATILE.has(type) ? (0.55 * p + 0.45 * volume.p) : (0.65 * p + 0.35 * volume.p);
    p = applyShift(p, tags, blended - p, 'volume', 'low volume');
  }

  const usage = [
    [PASS_YDS, 'passAtt', 0.008, 'attempts up', 'attempts down'],
    [PASS_TD, 'passAtt', 0.006, 'attempts up', 'attempts down'],
    [COMP, 'passAtt', 0.008, 'attempts up', 'attempts down'],
    [PASS_ATT, 'passAtt', 0.01, 'attempts up', 'attempts down'],
    [INT, 'passAtt', 0.004, 'attempts up', 'attempts down'],
    [RUSH_YDS, 'rushAtt', 0.012, 'carries up', 'carries down'],
    [RUSH_ATT, 'rushAtt', 0.012, 'carries up', 'carries down'],
    [REC_YDS, 'targets', 0.015, 'targets up', 'targets down'],
    [RECS, 'targets', 0.015, 'targets up', 'targets down'],
    [LONG, 'targets', 0.008, 'targets up', 'targets down'],
  ];
  const spec = usage.find((item) => item[0] === type);
  if (spec) {
    const shift = trend(recentContext, priorContext, spec[1], spec[2]);
    p = applyShift(p, tags, shift, spec[3], spec[4]);
  } else if (type === SCRIM || type === TD) {
    const carry = trend(recentContext, priorContext, 'rushAtt', type === TD ? 0.008 : 0.01);
    const target = trend(recentContext, priorContext, 'targets', type === TD ? 0.008 : 0.012);
    const shift = clamp(carry + target, -0.06, 0.06);
    const up = Math.abs(target) >= Math.abs(carry) ? 'targets up' : 'carries up';
    const down = Math.abs(target) >= Math.abs(carry) ? 'targets down' : 'carries down';
    p = applyShift(p, tags, shift, up, down);
  }

  if (versus && versus.length >= 3) {
    const rate = versus.filter((value) => value >= line).length / versus.length;
    const shift = clamp((rate - p) * 0.25, -0.04, 0.04);
    p = applyShift(p, tags, shift, 'hot vs opponent', 'cold vs opponent');
  }

  if (typeof gameTotal === 'number' && Number.isFinite(gameTotal)) {
    const per = VOLATILE.has(type) ? 0.008 : 0.006;
    const shift = clamp((gameTotal - 45) * per, -0.04, 0.04);
    p = applyShift(p, tags, shift, 'high total', 'low total');
  }

  if (typeof favoriteYes === 'number' && Number.isFinite(favoriteYes)) {
    const favP = Math.max(favoriteYes, 1 - favoriteYes);
    let lean = null;
    if (sameTeam(teamName, favoriteName)) lean = favP - 0.5;
    else if (sameTeam(opponentName, favoriteName)) lean = 0.5 - favP;
    if (lean != null) {
      const shift = clamp(lean * (VOLATILE.has(type) ? 0.08 : 0.06), -0.03, 0.03);
      p = applyShift(p, tags, shift, 'favorite', 'underdog');
    }
  }

  if (typeof gameStart === 'number' && typeof lastPlayed === 'number' && Number.isFinite(lastPlayed)) {
    const hours = (gameStart - lastPlayed) / 36e5;
    if (hours > 0 && hours < 144) {
      p -= VOLATILE.has(type) ? 0.03 : 0.02;
      tags.push('short week');
    } else if (hours >= 240) {
      p += 0.015;
      tags.push('rested');
    }
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
