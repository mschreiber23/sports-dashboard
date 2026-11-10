/* The season-stats feed lags the game log by a game after the final buzzer.
   When the log has more finished regular-season appearances than the official
   games-played number, fold only those newest games into the card. */

import { gamesPlayedValue } from './playerCardStats.js';

function categories(stats) {
  return stats?.splits?.categories || [];
}

function readStat(stats, predicate) {
  for (const cat of categories(stats)) {
    for (const stat of cat.stats || []) {
      if (predicate(stat, cat)) return stat;
    }
  }
  return null;
}

function parseNum(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text === '--' || text === '-' || /dnp|did not play/i.test(text)) return null;
  if (/^\d+:\d+/.test(text)) {
    const [mins, secs] = text.split(':').map(Number);
    return mins + (secs || 0) / 60;
  }
  const n = parseFloat(text.replace(/^\+/, '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function formatLike(original, value) {
  const text = String(original ?? '');
  const decimals = (text.split('.')[1] || '').replace(/[^0-9]/g, '').length;
  let out = decimals ? value.toFixed(decimals) : String(Math.round(value));
  if (!decimals && text.includes(',')) out = Math.round(value).toLocaleString('en-US');
  if (text.startsWith('.') && out.startsWith('0.')) out = out.slice(1);
  if (text.startsWith('+') && value > 0 && !out.startsWith('+')) out = `+${out}`;
  return out;
}

function nth(labels, values, label, index) {
  let seen = 0;
  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i] !== label) continue;
    if (seen === index) return parseNum(values[i]);
    seen += 1;
  }
  return null;
}

function rawAt(labels, values, label, index) {
  let seen = 0;
  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i] !== label) continue;
    if (seen === index) return values[i];
    seen += 1;
  }
  return null;
}

function sumLabel(games, label, index = 0) {
  return games.reduce((sum, game) => sum + (nth(game.labels, game.values, label, index) || 0), 0);
}

function isRegularSeason(season) {
  const label = `${season?.displayName || ''} ${season?.name || ''}`;
  if (/pre[\s-]?season/i.test(label)) return false;
  if (/post[\s-]?season|playoff/i.test(label)) return false;
  return /regular/i.test(label);
}

function isFinalResult(result) {
  return /^(W|L|T|OTL|SOL)\b/i.test(String(result || '').trim());
}

function appeared(labels, values, sport) {
  const joined = values.map((value) => String(value ?? '')).join(' ');
  if (/dnp|did not play|inactive/i.test(joined)) return false;
  if (sport === 'nba') {
    const minutes = nth(labels, values, 'MIN', 0);
    return minutes != null && minutes > 0;
  }
  if (sport === 'nhl') {
    const toi = nth(labels, values, 'TOI/G', 0) ?? nth(labels, values, 'TOI', 0);
    if (toi != null) return toi > 0;
  }
  if (sport === 'mlb' && /^(W|L)\b/i.test(String(rawAt(labels, values, 'Dec', 0) || '').trim())) return true;
  return values.some((value) => {
    const n = parseNum(value);
    return n != null && n > 0;
  });
}

export function finishedGames(log, sport) {
  const labels = log?.labels || [];
  const events = log?.events || {};
  const games = [];
  const seen = new Set();
  for (const season of log?.seasonTypes || []) {
    if (!isRegularSeason(season)) continue;
    const rows = [];
    for (const category of season.categories || []) rows.push(...(category.events || []));
    for (const event of season.events || []) rows.push(event);
    for (const event of rows) {
      if (!event?.eventId || seen.has(event.eventId)) continue;
      const meta = events[event.eventId] || {};
      if (!isFinalResult(meta.gameResult)) continue;
      const values = event.stats || [];
      if (!appeared(labels, values, sport)) continue;
      seen.add(event.eventId);
      games.push({ date: meta.gameDate || '', labels, values });
    }
  }
  games.sort((a, b) => {
    const left = new Date(a.date).getTime();
    const right = new Date(b.date).getTime();
    if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
    if (!Number.isFinite(left)) return 1;
    if (!Number.isFinite(right)) return -1;
    return right - left;
  });
  return games;
}

function setGamesPlayed(stats, sport, value) {
  const text = String(value);
  if (stats._merged && Object.prototype.hasOwnProperty.call(stats._merged, 'GP')) {
    stats._merged.GP = text;
  }
  const cats = categories(stats);
  if (sport === 'mlb') {
    const pitching = cats.find((cat) => cat.name === 'pitching');
    const target = pitching || cats.find((cat) => cat.name === 'batting');
    const stat = (target?.stats || []).find((item) => item.name === 'gamesPlayed');
    if (stat) stat.displayValue = text;
    return;
  }
  const general = cats.find((cat) => cat.name === 'general');
  const stat = (general?.stats || []).find((item) => item.name === 'gamesPlayed' || item.name === 'games');
  if (stat) stat.displayValue = text;
}

function addMatching(stats, predicate, delta) {
  if (!Number.isFinite(delta) || delta === 0) return;
  for (const cat of categories(stats)) {
    for (const stat of cat.stats || []) {
      if (!predicate(stat, cat)) continue;
      const current = parseNum(stat.displayValue);
      if (current == null) continue;
      stat.displayValue = formatLike(stat.displayValue, current + delta);
    }
  }
}

function clockSeconds(value) {
  const parts = String(value ?? '').trim().split(':').map(Number);
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function ipOuts(value) {
  const match = String(value ?? '').trim().match(/^(\d+)(?:\.(\d))?/);
  if (!match) return null;
  const thirds = Number(match[2] || 0);
  if (thirds > 2) return null;
  return Number(match[1]) * 3 + thirds;
}

function formatInnings(outs) {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

function writeRate(stat, value) {
  if (!stat || !Number.isFinite(value)) return;
  stat.displayValue = formatLike(stat.displayValue, value);
}

function foldNba(stats, games, base, count) {
  const merged = stats._merged || {};
  for (const key of ['PTS', 'REB', 'AST', 'STL', 'BLK']) {
    if (merged[key] == null) continue;
    const current = parseNum(merged[key]);
    if (current == null) continue;
    merged[key] = formatLike(merged[key], (current * base + sumLabel(games, key)) / count);
  }
  stats._merged = merged;
}

function foldNfl(stats, games, position) {
  const pos = (position || stats._position || '').toUpperCase();
  const cats = categories(stats);
  const hasPass = cats.some((cat) => /pass/i.test(cat.name || ''));
  let adds;
  if (pos === 'QB' || (!pos && hasPass)) {
    adds = [
      [/pass/i, 'YDS', 'YDS', 0],
      [/pass/i, 'TD', 'TD', 0],
      [/pass/i, 'INT', 'INT', 0],
    ];
  } else if (['RB', 'HB', 'FB'].includes(pos) || (!pos && cats.some((cat) => /rush/i.test(cat.name || '')) && !hasPass)) {
    adds = [
      [/rush/i, 'CAR', 'CAR', 0],
      [/rush/i, 'YDS', 'YDS', 1],
      [/rush/i, 'TD', 'TD', 1],
    ];
  } else {
    adds = [
      [/receiv/i, 'REC', 'REC', 0],
      [/receiv/i, 'YDS', 'YDS', 0],
      [/receiv/i, 'TD', 'TD', 0],
    ];
  }
  for (const [catTest, abbr, label, index] of adds) {
    addMatching(
      stats,
      (stat, cat) => stat.abbreviation === abbr && catTest.test(cat.name || ''),
      sumLabel(games, label, index),
    );
  }
}

function foldNhlSkater(stats, games) {
  const offensive = (stat, cat) => cat.name === 'offensive' && stat.abbreviation === 'G';
  addMatching(stats, offensive, sumLabel(games, 'G'));
  addMatching(stats, (stat, cat) => cat.name === 'offensive' && stat.abbreviation === 'A', sumLabel(games, 'A'));
  addMatching(stats, (stat, cat) => cat.name === 'offensive' && stat.abbreviation === 'PTS', sumLabel(games, 'PTS'));
  addMatching(stats, (stat, cat) => cat.name === 'offensive' && stat.abbreviation === '+/-', sumLabel(games, '+/-'));
}

function foldNhlGoalie(stats, games) {
  addMatching(stats, (stat, cat) => cat.name === 'general' && (stat.name === 'wins' || stat.abbreviation === 'WINS'), sumLabel(games, 'WINS'));
  addMatching(stats, (stat, cat) => stat.name === 'shutouts' || (cat.name === 'defensive' && stat.abbreviation === 'SO'), sumLabel(games, 'SO'));
  addMatching(stats, (stat) => stat.name === 'goalsAgainst', sumLabel(games, 'GA'));
  addMatching(stats, (stat) => stat.name === 'shotsAgainst', sumLabel(games, 'SA'));
  addMatching(stats, (stat) => stat.name === 'saves', sumLabel(games, 'SV'));

  const toi = readStat(stats, (stat) => stat.name === 'timeOnIce');
  const currentSeconds = toi ? clockSeconds(toi.displayValue) : null;
  const addedSeconds = games.reduce((sum, game) => sum + (clockSeconds(rawAt(game.labels, game.values, 'TOI/G', 0)) || 0), 0);
  if (toi && currentSeconds != null) toi.displayValue = formatClock(currentSeconds + addedSeconds);

  const goals = parseNum(readStat(stats, (stat) => stat.name === 'goalsAgainst')?.displayValue);
  const shots = parseNum(readStat(stats, (stat) => stat.name === 'shotsAgainst')?.displayValue);
  const saves = parseNum(readStat(stats, (stat) => stat.name === 'saves')?.displayValue);
  const seconds = toi ? clockSeconds(toi.displayValue) : null;
  if (goals != null && seconds) writeRate(readStat(stats, (stat) => stat.name === 'avgGoalsAgainst' || stat.abbreviation === 'GAA'), (goals * 3600) / seconds);
  if (saves != null && shots) writeRate(readStat(stats, (stat) => stat.name === 'savePct' || stat.abbreviation === 'SV%'), saves / shots);
}

function foldNhl(stats, games, position) {
  const pos = (position || stats._position || '').toUpperCase();
  if (['G', 'GK'].includes(pos)) foldNhlGoalie(stats, games);
  else foldNhlSkater(stats, games);
}

function named(catName, name, abbr) {
  return (stat, cat) => cat.name === catName && (stat.name ? stat.name === name : stat.abbreviation === abbr);
}

function foldBatter(stats, games) {
  const inBatting = (name, abbr) => named('batting', name, abbr);
  addMatching(stats, inBatting('homeRuns', 'HR'), sumLabel(games, 'HR'));
  addMatching(stats, inBatting('RBIs', 'RBI'), sumLabel(games, 'RBI'));
  addMatching(stats, inBatting('hits', 'H'), sumLabel(games, 'H'));
  addMatching(stats, inBatting('atBats', 'AB'), sumLabel(games, 'AB'));
  addMatching(stats, inBatting('walks', 'BB'), sumLabel(games, 'BB'));
  addMatching(stats, inBatting('hitByPitch', 'HBP'), sumLabel(games, 'HBP'));
  addMatching(stats, inBatting('sacFlies', 'SF'), sumLabel(games, 'SF'));

  const hits = parseNum(readStat(stats, inBatting('hits', 'H'))?.displayValue);
  const atBats = parseNum(readStat(stats, inBatting('atBats', 'AB'))?.displayValue);
  const walks = parseNum(readStat(stats, inBatting('walks', 'BB'))?.displayValue) || 0;
  const hitByPitch = parseNum(readStat(stats, inBatting('hitByPitch', 'HBP'))?.displayValue) || 0;
  const sacFlies = parseNum(readStat(stats, inBatting('sacFlies', 'SF'))?.displayValue) || 0;
  if (hits != null && atBats) writeRate(readStat(stats, inBatting('avg', 'AVG')), hits / atBats);
  const plate = (atBats || 0) + walks + hitByPitch + sacFlies;
  if (hits != null && plate) writeRate(readStat(stats, inBatting('onBasePct', 'OBP')), (hits + walks + hitByPitch) / plate);
}

function foldPitcher(stats, games) {
  const inPitching = (name, abbr) => named('pitching', name, abbr);
  addMatching(stats, inPitching('strikeouts', 'K'), sumLabel(games, 'K'));
  addMatching(stats, inPitching('hits', 'H'), sumLabel(games, 'H'));
  addMatching(stats, inPitching('walks', 'BB'), sumLabel(games, 'BB'));
  addMatching(stats, inPitching('earnedRuns', 'ER'), sumLabel(games, 'ER'));
  const decisions = games.map((game) => String(rawAt(game.labels, game.values, 'Dec', 0) || '').trim());
  const wins = decisions.filter((dec) => /^W/i.test(dec)).length;
  addMatching(
    stats,
    (stat, cat) => (cat.name === 'general' || cat.name === 'pitching') && (stat.name === 'wins' || stat.abbreviation === 'WINS'),
    wins,
  );
  addMatching(stats, inPitching('losses', 'L'), decisions.filter((dec) => /^L/i.test(dec)).length);

  const ip = readStat(stats, inPitching('innings', 'IP'));
  const addedOuts = games.reduce((sum, game) => sum + (ipOuts(rawAt(game.labels, game.values, 'IP', 0)) || 0), 0);
  const outs = (ip ? ipOuts(ip.displayValue) : null);
  const totalOuts = outs == null ? null : outs + addedOuts;
  if (ip && totalOuts != null) ip.displayValue = formatInnings(totalOuts);

  const earned = parseNum(readStat(stats, inPitching('earnedRuns', 'ER'))?.displayValue);
  const hits = parseNum(readStat(stats, inPitching('hits', 'H'))?.displayValue);
  const walks = parseNum(readStat(stats, inPitching('walks', 'BB'))?.displayValue);
  if (earned != null && totalOuts) writeRate(readStat(stats, inPitching('ERA', 'ERA')), (earned * 27) / totalOuts);
  if (hits != null && walks != null && totalOuts) writeRate(readStat(stats, inPitching('WHIP', 'WHIP')), ((hits + walks) * 3) / totalOuts);
}

function foldMlb(stats, games) {
  const pitching = categories(stats).find((cat) => cat.name === 'pitching');
  if (pitching) foldPitcher(stats, games);
  else foldBatter(stats, games);
}

export function applyFinishedGames(stats, log, sport, position = '') {
  if (!stats || !log) return stats;
  const games = finishedGames(log, sport);
  const officialRaw = gamesPlayedValue(stats, sport);
  const official = officialRaw == null || officialRaw === '' ? null : Number(officialRaw);
  if (!Number.isFinite(official) || games.length <= official) return stats;

  const fresh = games.slice(0, games.length - official);
  const next = JSON.parse(JSON.stringify(stats));
  setGamesPlayed(next, sport, games.length);
  if (sport === 'nba') foldNba(next, fresh, official, games.length);
  else if (sport === 'nfl') foldNfl(next, fresh, position);
  else if (sport === 'nhl') foldNhl(next, fresh, position);
  else if (sport === 'mlb') foldMlb(next, fresh);
  return next;
}
