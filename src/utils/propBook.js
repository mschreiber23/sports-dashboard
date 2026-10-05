// Model accuracy from graded reads, and the money on trades the user picked.
// A trade risks the unit at the Yes price. A hit pays the unit times
// (1 - price) / price. A miss loses the unit. A void returns it.

import { easternDay } from '../api/polymarket';

export function tradeProfit(trade) {
  if (!trade?.result) return null;
  if (trade.result === 'void') return 0;
  const unit = Number(trade.unit);
  if (!(unit > 0)) return null;
  if (trade.result === 'miss') return -unit;
  if (trade.result !== 'hit') return null;
  const price = Number(trade.price);
  if (!(price > 0 && price < 1)) return null;
  return unit * (1 - price) / price;
}

export function tradeId(draft) {
  const line = draft.line == null ? '' : draft.line;
  const pick = draft.pick || draft.side || 'yes';
  return [
    draft.league,
    draft.eventSlug,
    draft.kind || 'player',
    draft.player,
    draft.propType,
    line,
    pick,
  ].join('|');
}

export function bookReport(trades, now = Date.now()) {
  const today = easternDay(now);
  let total = 0;
  let todayProfit = 0;
  let open = 0;
  const days = new Map();
  for (const trade of trades || []) {
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
  return { total, today: todayProfit, open, days: ordered };
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
