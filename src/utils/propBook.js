// Model accuracy from graded reads, and the sheet of trades the user picked.
// Price is the side they took, at the price a taker pays. Polymarket US
// charges Fee = 0.0695 × contracts × price × (1 − price), rounded to the
// cent. Over 50%, the stake is the cash required to profit one unit after
// that fee. At 50% or less, the stake is the unit. A win returns the
// contracts. A loss costs the stake. A void returns nothing.

import { easternDay } from '../api/polymarket';
import { callGrade } from './modelCall';

// Standard taker coefficient on polymarket.us. Straight trades, not combos.
export const TAKER_FEE = 0.0695;

function openPrice(value) {
  const n = Number(value);
  return n > 0 && n < 1 ? n : null;
}

function bankersCents(value) {
  const sign = value < 0 ? -1 : 1;
  const scaled = Math.abs(value) * 100;
  const down = Math.floor(scaled + 1e-8);
  const frac = scaled - down;
  const cents = Math.abs(frac - 0.5) <= 1e-8
    ? (down % 2 === 0 ? down : down + 1)
    : Math.round(scaled);
  return sign * cents;
}

function fillCash(contractsCents, price) {
  const contracts = contractsCents / 100;
  const cost = bankersCents(contracts * price);
  const fee = bankersCents(TAKER_FEE * contracts * price * (1 - price));
  return { cost, fee, stake: cost + fee };
}

function quoteContracts(price, unit) {
  const p = Number(price);
  const target = Number(unit);
  if (!(target > 0) || !(p > 0 && p < 1)) return null;
  const targetCents = Math.round(target * 100);
  const favorite = p > 0.5;
  const ideal = favorite
    ? target / ((1 - p) * (1 - TAKER_FEE * p))
    : target / (p * (1 + TAKER_FEE * (1 - p)));
  const start = Math.round(ideal * 100);
  let best = null;
  for (let contractsCents = Math.max(1, start - 400); contractsCents <= start + 400; contractsCents += 1) {
    const cash = fillCash(contractsCents, p);
    const profit = contractsCents - cash.stake;
    const err = favorite ? Math.abs(profit - targetCents) : Math.abs(cash.stake - targetCents);
    const tie = Math.abs(contractsCents - Math.round(ideal * 100));
    if (!best || err < best.err || (err === best.err && tie < best.tie)) {
      best = { contractsCents, stake: cash.stake, err, tie };
    }
    if (err === 0 && contractsCents > start + 20) break;
  }
  if (!best) return null;
  return {
    stake: best.stake / 100,
    payout: best.contractsCents / 100,
  };
}

export function sideDraft(draft, prediction) {
  const listed = openPrice(draft.price);
  const takingNo = prediction === 'no';
  const price = takingNo
    ? (openPrice(draft.takerNo) ?? (openPrice(draft.bid) != null ? 1 - Number(draft.bid) : null) ?? (listed == null ? null : 1 - listed))
    : (openPrice(draft.takerYes) ?? openPrice(draft.ask) ?? listed);
  const edge = typeof draft.edge !== 'number'
    ? null
    : (takingNo ? -Math.round(draft.edge * 100) / 100 : draft.edge);
  return {
    ...draft,
    prediction: takingNo ? 'no' : 'yes',
    price: price == null ? price : Math.round(price * 10000) / 10000,
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
  return potentialWin(trade);
}

export function tradeProfit(trade) {
  const payout = tradePayout(trade);
  if (payout == null) return null;
  if (payout <= 0) return payout;
  return payout - Number(trade.unit);
}

export function potentialWin(trade) {
  const stored = Number(trade?.payout);
  if (stored > 0) return Math.round(stored * 100) / 100;
  const unit = Number(trade?.unit);
  const price = Number(trade?.price);
  if (!(unit > 0) || !(price > 0 && price < 1)) return null;
  return unit / price;
}

// Net if the trade is correct: money returned minus the amount wagered.
export function expectedProfit(trade) {
  const back = potentialWin(trade);
  const stake = Number(trade?.unit);
  if (!(back > 0) || !(stake > 0)) return null;
  return Math.round((back - stake) * 100) / 100;
}

// Cash a taker puts up, fee included. Over 50% that cash profits one unit.
export function quoteForUnit(price, unit) {
  return quoteContracts(price, unit);
}

export function stakeForUnit(price, unit) {
  return quoteForUnit(price, unit)?.stake ?? null;
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
    const dayHits = group.filter((row) => callGrade(row) === 'hit').length;
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
    const hits = rows.filter((row) => callGrade(row) === 'hit').length;
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
  const hits = graded.filter((row) => callGrade(row) === 'hit').length;
  return {
    hits,
    misses: graded.length - hits,
    graded: graded.length,
    rate: graded.length ? hits / graded.length : null,
    sports,
  };
}
