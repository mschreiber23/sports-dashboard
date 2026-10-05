// A saved read is the raw model probability and the yes price before lock.
// The price updates until the game starts. After the game it becomes a hit,
// a miss, or a void. Voids stay out of the hit rate.

import { chartLabel } from '../api/playerLogs';
import { nflModeled, nflPropEdge } from './nflEdge';
import { nhlPropEdge } from './nhlEdge';
import { callGrade } from './modelCall';

export const LOOKAHEAD_MS = 8 * 24 * 60 * 60 * 1000;
const NEAR_MS = 12 * 60 * 60 * 1000;
const NEAR_STALE_MS = 45 * 60 * 1000;
const FAR_STALE_MS = 6 * 60 * 60 * 1000;
const VOID_AFTER_MS = 18 * 60 * 60 * 1000;

const MODEL_BANDS = [
  [0, 0.45, 'Under 45%'],
  [0.45, 0.55, '45–54%'],
  [0.55, 0.65, '55–64%'],
  [0.65, 0.75, '65–74%'],
  [0.75, 1.01, '75% and up'],
];

const EDGE_BANDS = [
  [-2, 0, 'Price was higher'],
  [0, 0.04, '0 to +3'],
  [0.04, 0.08, '+4 to +7'],
  [0.08, 0.151, '+8 to +15'],
  [0.151, 2, '+15 and up'],
];

function edgeFn(league, type) {
  if (league === 'nfl' && nflModeled(type)) return nflPropEdge;
  if (league === 'nhl' && (type === 'hockey_player_goals' || type === 'hockey_player_points')) return nhlPropEdge;
  return null;
}

function mainLine(lines) {
  return lines
    .filter((line) => typeof line.yes === 'number' && Number.isFinite(line.yes))
    .slice()
    .sort((a, b) => Math.abs(a.yes - 0.5) - Math.abs(b.yes - 0.5) || a.line - b.line)[0] || null;
}

function slateContext(rows) {
  let total = null;
  let totalDist = Infinity;
  let favorite = '';
  let favoriteYes = null;
  let favoriteDist = Infinity;
  let spreadLine = null;
  let spreadLabel = '';
  let spreadDist = Infinity;
  for (const row of rows || []) {
    if (row.section !== 'line' || typeof row.yes !== 'number') continue;
    const dist = Math.abs(row.yes - 0.5);
    const type = row.type || '';
    if (row.sideText === 'total' && row.line != null && !type.includes('points_') && dist < totalDist) {
      total = row.line;
      totalDist = dist;
    }
    if (row.sideText === 'spread' && row.line != null && dist < spreadDist) {
      spreadLine = row.line;
      spreadLabel = row.player || '';
      spreadDist = dist;
    }
    if (row.sideText === 'moneyline' && dist < favoriteDist) {
      favorite = row.player || '';
      favoriteYes = row.yes;
      favoriteDist = dist;
    }
  }
  return { total, favorite, favoriteYes, spreadLine, spreadLabel };
}

function teammateLogs(entries, logs) {
  const mates = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry?.name || seen.has(entry.name)) continue;
    seen.add(entry.name);
    const mate = logs[entry.id];
    if (!mate?.context && !mate?.priorContext) continue;
    mates.push({ name: entry.name, recent: mate.context || null, prior: mate.priorContext || null });
  }
  return mates;
}

function lineText(line) {
  return `${line}+`;
}

export function upcomingSlate(events, now = Date.now()) {
  return (events || []).filter((event) => (
    (event.league === 'nfl' || event.league === 'nhl')
    && event.gameStart > now
    && event.gameStart - now <= LOOKAHEAD_MS
  ));
}

export function needsPrice(row, now = Date.now()) {
  if (!row || row.result || !(row.gameStart > now)) return false;
  const age = now - (row.pricedAt || row.recordedAt || 0);
  const stale = row.gameStart - now <= NEAR_MS ? NEAR_STALE_MS : FAR_STALE_MS;
  return age >= stale;
}

export function gamesToRecord(events, reads, now = Date.now(), force = false) {
  const bySlug = new Map();
  for (const row of reads || []) {
    if (!bySlug.has(row.eventSlug)) bySlug.set(row.eventSlug, []);
    bySlug.get(row.eventSlug).push(row);
  }
  return upcomingSlate(events, now).filter((event) => {
    const rows = bySlug.get(event.key) || [];
    if (!rows.length || force) return true;
    return rows.some((row) => needsPrice(row, now));
  });
}

export function buildReads({ games, logs, now = Date.now() }) {
  const reads = [];
  for (const game of games || []) {
    if (!game?.rows) continue;
    if (game.league !== 'nfl' && game.league !== 'nhl') continue;
    if (!(game.gameStart > now) || game.gameStart - now > LOOKAHEAD_MS) continue;
    const slate = slateContext(game.rows);
    const mates = game.rows.filter((row) => row.section === 'player').map((row) => ({
      name: row.player,
      id: `${game.league}|${row.player}|${row.gameStart}`,
      teamName: row.teamName,
    }));
    const groups = new Map();
    for (const row of game.rows) {
      if (row.section !== 'player' || row.line == null) continue;
      if (!edgeFn(game.league, row.type)) continue;
      const key = `${row.playerId || row.player}|${row.type}`;
      if (!groups.has(key)) groups.set(key, []);
      const lines = groups.get(key);
      if (!lines.some((item) => item.line === row.line)) lines.push(row);
    }
    for (const lines of groups.values()) {
      const sample = lines[0];
      const line = mainLine(lines);
      if (!line) continue;
      const logKey = `${game.league}|${sample.player}|${sample.gameStart}`;
      const log = logs[logKey];
      const recent = log?.series?.[sample.type];
      if (!recent || recent.length < 5) continue;
      const model = edgeFn(game.league, sample.type)({
        type: sample.type,
        line: line.line,
        recent,
        prior: log?.prior?.[sample.type],
        recentContext: log?.context,
        priorContext: log?.priorContext,
        versus: log?.versus?.[sample.type],
        marketYes: line.yes,
        lastPlayed: log?.lastPlayed,
        gameStart: sample.gameStart,
        gameTotal: slate.total,
        teamName: sample.teamName,
        opponentName: sample.opponentName,
        favoriteName: slate.favorite,
        favoriteYes: slate.favoriteYes,
        spreadLine: slate.spreadLine,
        spreadLabel: slate.spreadLabel,
        matchup: log?.matchup,
        teammates: game.league === 'nfl'
          ? teammateLogs(mates.filter((mate) => mate.name !== sample.player && mate.teamName && mate.teamName === sample.teamName), logs)
          : undefined,
      });
      if (!model) continue;
      reads.push({
        id: `${game.league}|${game.key}|${sample.player}|${sample.type}|${line.line}`,
        league: game.league,
        eventSlug: game.key,
        game: game.title,
        gameStart: game.gameStart,
        player: sample.player,
        team: sample.teamName || '',
        opponent: sample.opponentName || '',
        propType: sample.type,
        propLabel: `${lineText(line.line)} ${chartLabel(sample.type)}`,
        line: line.line,
        price: line.yes,
        baseP: model.p,
        modelP: model.p,
        edge: model.edge,
        rate: model.rate,
        hits: model.hits,
        sample: model.total,
        tags: model.tags,
        result: null,
        actual: null,
        gradedAt: null,
        recordedAt: now,
        pricedAt: now,
      });
    }
  }
  return reads;
}

export function mergeReads(existing, incoming) {
  const map = new Map((existing || []).map((row) => [row.id, row]));
  for (const row of incoming || []) {
    if (!map.has(row.id)) map.set(row.id, row);
  }
  return [...map.values()];
}

/** Replace the price and the raw read until the game starts. A grade stays. */
export function refreshReads(existing, incoming, now = Date.now()) {
  const map = new Map((existing || []).map((row) => [row.id, row]));
  for (const row of incoming || []) {
    const prev = map.get(row.id);
    if (!prev) {
      map.set(row.id, row);
      continue;
    }
    if (prev.result || !(prev.gameStart > now)) continue;
    map.set(row.id, {
      ...prev,
      price: row.price,
      baseP: row.baseP,
      modelP: row.modelP,
      edge: row.edge,
      tags: row.tags,
      rate: row.rate,
      hits: row.hits,
      sample: row.sample,
      team: row.team || prev.team,
      opponent: row.opponent || prev.opponent,
      propLabel: row.propLabel || prev.propLabel,
      prediction: row.prediction || prev.prediction,
      pricedAt: now,
    });
  }
  return [...map.values()];
}

/** Grade one saved read. A missing log stays open until the next morning, then voids. */
export function gradeRead(read, stat, now = Date.now()) {
  if (!read || read.result) return read;
  if (!(now >= read.gameStart)) return read;
  if (stat?.status === 'played' && typeof stat.value === 'number' && Number.isFinite(stat.value)) {
    return {
      ...read,
      result: stat.value >= read.line ? 'hit' : 'miss',
      actual: stat.value,
      gradedAt: now,
    };
  }
  if (now < read.gameStart + VOID_AFTER_MS) return read;
  if (stat?.status === 'missing') {
    return { ...read, result: 'void', actual: null, gradedAt: now };
  }
  return read;
}

function bandRows(rows, bands, valueOf) {
  return bands.map(([lo, hi, label]) => {
    const group = rows.filter((row) => {
      const value = valueOf(row);
      return value >= lo && value < hi;
    });
    const hits = group.filter((row) => row.result === 'hit').length;
    const price = group.reduce((sum, row) => sum + row.price, 0);
    const model = group.reduce((sum, row) => sum + row.modelP, 0);
    return {
      label,
      count: group.length,
      hits,
      hitRate: group.length ? hits / group.length : null,
      price: group.length ? price / group.length : null,
      model: group.length ? model / group.length : null,
    };
  }).filter((band) => band.count > 0);
}

export function ledgerReport(rows) {
  const list = rows || [];
  const graded = list.filter((row) => row.result === 'hit' || row.result === 'miss');
  const hits = graded.filter((row) => row.result === 'hit').length;
  const callHits = graded.filter((row) => callGrade(row) === 'hit').length;
  const voids = list.filter((row) => row.result === 'void').length;
  const open = list.filter((row) => !row.result).length;
  const tags = new Map();
  for (const row of graded) {
    for (const tag of row.tags || []) {
      if (!tags.has(tag)) tags.set(tag, { tag, count: 0, hits: 0, model: 0, price: 0 });
      const item = tags.get(tag);
      item.count += 1;
      item.model += row.modelP;
      item.price += row.price;
      if (row.result === 'hit') item.hits += 1;
    }
  }
  const tagRows = [...tags.values()].map((item) => ({
    tag: item.tag,
    count: item.count,
    hits: item.hits,
    hitRate: item.hits / item.count,
    model: item.model / item.count,
    price: item.price / item.count,
  })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return {
    saved: list.length,
    graded: graded.length,
    hits,
    hitRate: graded.length ? hits / graded.length : null,
    callHits,
    callRate: graded.length ? callHits / graded.length : null,
    voids,
    open,
    model: graded.length ? graded.reduce((sum, row) => sum + row.modelP, 0) / graded.length : null,
    price: graded.length ? graded.reduce((sum, row) => sum + row.price, 0) / graded.length : null,
    modelBands: bandRows(graded, MODEL_BANDS, (row) => row.modelP),
    edgeBands: bandRows(graded, EDGE_BANDS, (row) => row.edge),
    tags: tagRows,
  };
}
