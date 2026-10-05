// Model accuracy from graded reads, and the sheet of trades the user picked.
// Price is the side they took. A win returns the unit divided by that price.
// A loss is the unit. A void returns the stake, so the profit is zero.

import { easternDay } from '../api/polymarket';

export function sideDraft(draft, prediction) {
  const listed = Number(draft.price);
  const takingNo = prediction === 'no';
  const price = takingNo ? 1 - listed : listed;
  const edge = typeof draft.edge !== 'number'
    ? null
    : (takingNo ? -Math.round(draft.edge * 100) / 100 : draft.edge);
  return {
    ...draft,
    prediction: takingNo ? 'no' : 'yes',
    price,
    edge,
  };
}

export function predictionWon(trade) {
  if (!trade?.result || trade.result === 'void') return null;
  if (trade.result !== 'hit' && trade.result !== 'miss') return null;
  const listedHit = trade.result === 'hit';
  return trade.prediction === 'no' ? !listedHit : listedHit;
}

export function tradePayout(trade) {
  if (!trade?.result) return null;
  if (trade.result === 'void') return 0;
  const unit = Number(trade.unit);
  if (!(unit > 0)) return null;
  const won = predictionWon(trade);
  if (won == null) return null;
  if (!won) return -unit;
  const price = Number(trade.price);
  if (!(price > 0 && price < 1)) return null;
  return unit / price;
}

export function tradeProfit(trade) {
  const payout = tradePayout(trade);
  if (payout == null) return null;
  if (payout <= 0) return payout;
  return payout - Number(trade.unit);
}

export function potentialWin(trade) {
  const unit = Number(trade.unit);
  const price = Number(trade.price);
  if (!(unit > 0) || !(price > 0 && price < 1)) return null;
  return unit / price;
}

// Over 50%, risk enough to profit one unit. At 50% or less, risk the unit.
export function stakeForUnit(price, unit) {
  const p = Number(price);
  const target = Number(unit);
  if (!(target > 0) || !(p > 0 && p < 1)) return null;
  if (p <= 0.5) return target;
  return Math.round((target * p / (1 - p)) * 100) / 100;
}

export function tradeId(draft) {
  const line = draft.line == null ? '' : draft.line;
  const pick = draft.pick || draft.side || 'yes';
  const base = [
    draft.league,
    draft.eventSlug,
    draft.kind || 'player',
    draft.player,
    draft.propType,
    line,
    pick,
  ].join('|');
  return draft.prediction === 'no' ? `${base}|no` : base;
}

export function sheetMarket(trade) {
  if (trade.kind === 'total') return trade.game;
  return trade.player;
}

export function sheetTrade(trade) {
  if (trade.kind === 'winner') return 'To Win';
  if (trade.kind === 'total') {
    const side = trade.pick || trade.propLabel;
    return trade.line == null ? side : `${side} ${trade.line}`;
  }
  return trade.propLabel;
}

export function bookReport(trades, now = Date.now()) {
  const today = easternDay(now);
  const month = today.slice(0, 7);
  let total = 0;
  let todayProfit = 0;
  let open = 0;
  let tradedToday = 0;
  let tradedMonth = 0;
  let tradedLifetime = 0;
  const days = new Map();
  for (const trade of trades || []) {
    const unit = Number(trade.unit);
    if (unit > 0) {
      tradedLifetime += unit;
      const placed = easternDay(trade.recordedAt || trade.gameStart);
      if (placed === today) tradedToday += unit;
      if (placed.slice(0, 7) === month) tradedMonth += unit;
    }
    const profit = tradeProfit(trade);
    const day = easternDay(trade.gameStart);
    if (!days.has(day)) days.set(day, { day, profit: 0, settled: 0, open: 0, trades: [] });
    const bucket = days.get(day);
    bucket.trades.push({ ...trade, profit });
    if (profit == null) {
      bucket.open += 1;
      open += 1;
    } else {
      bucket.profit += profit;
      bucket.settled += 1;
      total += profit;
      if (day === today) todayProfit += profit;
    }
  }
  const ordered = [...days.values()].sort((a, b) => b.day.localeCompare(a.day));
  for (const bucket of ordered) {
    bucket.trades.sort((a, b) => (a.gameStart - b.gameStart) || String(a.player || '').localeCompare(String(b.player || '')));
  }
  return { total, today: todayProfit, open, tradedToday, tradedMonth, tradedLifetime, days: ordered };
}

function seriesFor(rows) {
  const byDay = new Map();
  for (const row of rows) {
    const day = easternDay(row.gameStart);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(row);
  }
  let hits = 0;
  let graded = 0;
  return [...byDay.keys()].sort().map((day) => {
    const group = byDay.get(day);
    const dayHits = group.filter((row) => row.result === 'hit').length;
    hits += dayHits;
    graded += group.length;
    return {
      day,
      dayHits,
      dayCount: group.length,
      hits,
      graded,
      rate: hits / graded,
    };
  });
}

export function accuracyReport(reads) {
  const graded = (reads || []).filter((row) => row.result === 'hit' || row.result === 'miss');
  const byLeague = new Map([['nhl', []], ['nfl', []]]);
  for (const row of graded) {
    const league = row.league || 'other';
    if (!byLeague.has(league)) byLeague.set(league, []);
    byLeague.get(league).push(row);
  }
  const rank = { nhl: 0, nfl: 1 };
  const sports = [...byLeague.entries()].map(([league, rows]) => {
    const hits = rows.filter((row) => row.result === 'hit').length;
    return {
      league,
      label: String(league).toUpperCase(),
      hits,
      misses: rows.length - hits,
      graded: rows.length,
      rate: rows.length ? hits / rows.length : null,
      series: seriesFor(rows),
    };
  }).sort((a, b) => (rank[a.league] ?? 9) - (rank[b.league] ?? 9) || b.graded - a.graded);
  const hits = graded.filter((row) => row.result === 'hit').length;
  return {
    hits,
    misses: graded.length - hits,
    graded: graded.length,
    rate: graded.length ? hits / graded.length : null,
    sports,
  };
}
