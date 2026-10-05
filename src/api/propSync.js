import { loadPropEvents, loadGameProps } from './polymarket';
import { recentPlayerLogs, playerResultOnDate } from './playerLogs';
import { loadReads, saveReads } from './propStore';
import { loadTrades, saveTrades } from './tradeStore';
import { finalScore, gradeMarketTrade } from './gameResult';
import { gamesToRecord, buildReads, refreshReads, gradeRead } from '../utils/propReads';
import { learnCalibration, priceRead } from '../utils/propCalibration';

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index], index);
    }
  }
  const workers = Math.min(limit, items.length);
  if (workers > 0) await Promise.all(Array.from({ length: workers }, worker));
  return out;
}

async function gradeTrades(userId) {
  const trades = await loadTrades(userId);
  const pending = trades.filter((trade) => !trade.result && trade.gameStart <= Date.now());
  if (!pending.length) return trades;
  const graded = await pool(pending, 4, async (trade) => {
    if (trade.kind === 'winner' || trade.kind === 'total') {
      const score = await finalScore(trade.league, trade.gameStart, trade.teams).catch(() => ({ status: 'missing' }));
      return gradeMarketTrade(trade, score);
    }
    const stat = await playerResultOnDate(trade.league, trade.player, trade.propType, trade.gameStart).catch(() => ({ status: 'unknown' }));
    return gradeRead(trade, stat);
  });
  const fresh = await loadTrades(userId);
  const byId = new Map(graded.map((trade) => [trade.id, trade]));
  const next = fresh.map((trade) => {
    const update = byId.get(trade.id);
    if (!update?.result || trade.result) return trade;
    return { ...trade, result: update.result, actual: update.actual, gradedAt: update.gradedAt };
  });
  await saveTrades(userId, next);
  return next;
}

export async function runPropSync({ userId, force = false, onStatus, onUpdate, shouldStop }) {
  const stop = () => shouldStop?.();
  const publish = (nextRows, calibration, trades) => {
    onUpdate?.({ reads: nextRows, calibration, trades });
    return { reads: nextRows, calibration, trades };
  };
  let rows = await loadReads(userId);
  let calibration = learnCalibration(rows);
  let trades = await gradeTrades(userId);
  publish(rows, calibration, trades);
  if (stop()) return { reads: rows, calibration };

  const pending = rows.filter((row) => !row.result && row.gameStart <= Date.now());
  if (pending.length) {
    let done = 0;
    const graded = await pool(pending, 6, async (row) => {
      const stat = await playerResultOnDate(row.league, row.player, row.propType, row.gameStart).catch(() => ({ status: 'unknown' }));
      done += 1;
      if (done % 10 === 0 || done === pending.length) onStatus?.(`Grading finished games ${done}/${pending.length}…`);
      return gradeRead(row, stat);
    });
    if (stop()) return { reads: rows, calibration: learnCalibration(rows) };
    const byId = new Map(graded.map((row) => [row.id, row]));
    rows = rows.map((row) => byId.get(row.id) || row);
    calibration = learnCalibration(rows);
    publish(rows, calibration, trades);
    await saveReads(userId, rows);
  }
  const events = await loadPropEvents();
  if (stop()) return { reads: rows, calibration };
  const due = gamesToRecord(events, rows, Date.now(), force);
  if (!due.length) {
    onStatus?.(rows.length ? '' : 'No upcoming NHL or NFL games to record.');
    return { reads: rows, calibration };
  }

  let loaded = 0;
  const withRows = await pool(due, 4, async (game) => {
    const props = await loadGameProps(game.key).catch(() => []);
    loaded += 1;
    onStatus?.(`Recording NHL and NFL games ${loaded}/${due.length}…`);
    return { ...game, rows: props };
  });
  if (stop()) return { reads: rows, calibration };

  const players = [];
  const seen = new Set();
  for (const game of withRows) {
    for (const row of game.rows || []) {
      if (row.section !== 'player') continue;
      const id = `${game.league}|${row.player}|${row.gameStart}`;
      if (seen.has(id)) continue;
      seen.add(id);
      players.push({
        id,
        league: game.league,
        name: row.player,
        opponentAbbr: row.opponentAbbr,
        opponentName: row.opponentName,
        before: row.gameStart,
      });
    }
  }

  const logs = {};
  let checked = 0;
  await pool(players, 6, async (player) => {
    const result = await recentPlayerLogs(player.league, [player]).catch(() => ({}));
    logs[player.id] = result[player.name] ?? null;
    checked += 1;
    if (checked % 15 === 0 || checked === players.length) onStatus?.(`Checking players ${checked}/${players.length}…`);
  });
  if (stop()) return { reads: rows, calibration };

  const fresh = buildReads({ games: withRows, logs }).map((row) => priceRead(row, calibration));
  rows = refreshReads(rows, fresh);
  calibration = learnCalibration(rows);
  publish(rows, calibration, trades);
  await saveReads(userId, rows);
  const noun = due.length === 1 ? 'game' : 'games';
  const covered = due.filter((game) => rows.some((row) => row.eventSlug === game.key)).length;
  let message = '';
  if (fresh.length) message = `Saved ${fresh.length} reads from ${due.length} ${noun}.`;
  else if (!rows.length && !covered) message = `No modeled props were ready in ${due.length} ${noun}.`;
  onStatus?.(message);
  return { reads: rows, calibration };
}
