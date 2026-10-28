import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NFL_STABLE_HIT_WEIGHT,
  NFL_STABLE_MARKET_WEIGHT,
  NFL_VOLATILE_HIT_WEIGHT,
  NFL_VOLATILE_MARKET_WEIGHT,
  NHL_HIT_WEIGHT,
  NHL_MARKET_WEIGHT,
  fairProbability,
  settledProbability,
} from './fairPrice.js';
import { nhlPropEdge } from './nhlEdge.js';
import { nflPropEdge } from './nflEdge.js';

function projection(hitP, volumeP, hitWeight) {
  return hitWeight * hitP + (1 - hitWeight) * volumeP;
}

test('a 7-of-10 streak against a matching price is not a 4-point edge', () => {
  const hitP = (7 + 0.5 * 8) / 18;
  const next = fairProbability(projection(hitP, 0.48, NHL_HIT_WEIGHT), 0.5, NHL_MARKET_WEIGHT);
  assert.ok(Math.abs(next - 0.5) < 0.04, next);
  assert.ok(next > 0.49 && next < 0.52, next);
});

test('a cold recent record does not fade a real volume projection', () => {
  const hitP = (4 + 0.5 * 8) / 18;
  const next = fairProbability(projection(hitP, 0.7, NHL_HIT_WEIGHT), 0.52, NHL_MARKET_WEIGHT);
  assert.ok(next - 0.52 >= 0.04, next);
});

test('an NFL yards streak near the volume price stays inside 4 points', () => {
  const hitP = (8 + 0.5 * 8) / 18;
  const next = fairProbability(projection(hitP, 0.55, NFL_STABLE_HIT_WEIGHT), 0.55, NFL_STABLE_MARKET_WEIGHT);
  assert.ok(Math.abs(next - 0.55) < 0.04, next);
});

function pointRow(date, shots, goals, assists) {
  return { date, shots, goals, assists, toi: 18, pp: 0 };
}

function pointLog(count, shots, goals, assists, start) {
  return Array.from({ length: count }, (_, index) => pointRow(`2026-01-${String(start + index).padStart(2, '0')}`, shots, goals, assists));
}

test('a points streak does not clear 4 points when the shot rate matches the price', () => {
  const model = nhlPropEdge({
    type: 'hockey_player_points',
    line: 1,
    recent: [1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
    prior: [1, 0, 1, 0, 1, 0, 1, 0],
    recentContext: pointLog(10, 3, 0, 0, 1),
    priorContext: pointLog(8, 3, 1, 1, 11),
    marketYes: 0.5,
  });
  assert.ok(model);
  assert.equal(model.rate, 70);
  assert.ok(Math.abs(model.edge) < 0.04, `edge ${model.edge} p ${model.p}`);
});

test('a points prop still bets when expected chances are well above the price', () => {
  const model = nhlPropEdge({
    type: 'hockey_player_points',
    line: 1,
    recent: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    prior: [1, 0, 1, 0, 1, 0, 1, 0],
    recentContext: pointLog(10, 4, 1, 1, 1),
    priorContext: pointLog(8, 4, 1, 1, 11),
    marketYes: 0.52,
  });
  assert.ok(model);
  assert.equal(model.rate, 40);
  assert.ok(model.edge >= 0.04, `edge ${model.edge} p ${model.p}`);
  assert.ok(model.p > model.rate / 100);
});

test('a rushing-yards streak does not clear 4 points when the carry rate matches the price', () => {
  const row = (date) => ({ date, rushAtt: 10, rushYds: 43, rushTd: 0, targets: 2, rec: 1, recYds: 8, recTd: 0 });
  const days = (count, start) => Array.from({ length: count }, (_, index) => row(`2026-09-${String(start + index).padStart(2, '0')}`));
  const model = nflPropEdge({
    type: 'football_player_rushing_yards',
    line: 40,
    recent: [80, 80, 80, 80, 80, 80, 80, 80, 10, 10],
    prior: [50, 10, 50, 10, 50, 10, 50, 10],
    recentContext: days(10, 1),
    priorContext: days(8, 12),
    marketYes: 0.55,
  });
  assert.ok(model);
  assert.equal(model.rate, 80);
  assert.ok(Math.abs(model.edge) < 0.04, `edge ${model.edge} p ${model.p}`);
});

test('rushing yards still bet when expected yards are well above a stale price', () => {
  const row = (date) => ({ date, rushAtt: 12, rushYds: 55, rushTd: 0, targets: 2, rec: 1, recYds: 8, recTd: 0 });
  const days = (count, start) => Array.from({ length: count }, (_, index) => row(`2026-09-${String(start + index).padStart(2, '0')}`));
  const model = nflPropEdge({
    type: 'football_player_rushing_yards',
    line: 40,
    recent: [10, 10, 10, 10, 10, 10, 80, 80, 80, 80],
    prior: [50, 10, 50, 10, 50, 10, 50, 10],
    recentContext: days(10, 1),
    priorContext: days(8, 12),
    marketYes: 0.52,
  });
  assert.ok(model);
  assert.equal(model.rate, 40);
  assert.ok(model.edge >= 0.04, `edge ${model.edge} p ${model.p}`);
});

test('a hot streak against the volume projection is not a 4-point edge', () => {
  const hitP = 0.9;
  const volumeP = 0.46;
  const market = 0.5;
  const blended = projection(hitP, volumeP, NFL_VOLATILE_HIT_WEIGHT);
  const next = settledProbability(blended, market, NFL_VOLATILE_MARKET_WEIGHT, {
    hitP,
    volumeP,
    hitWeight: NFL_VOLATILE_HIT_WEIGHT,
  });
  assert.ok(next - market < 0.04, next);
});

test('a cold recent record still leaves 4 points after the heavier pull', () => {
  const hitP = (4 + 0.5 * 8) / 18;
  const volumeP = 0.7;
  const market = 0.52;
  const blended = projection(hitP, volumeP, NHL_HIT_WEIGHT);
  const next = settledProbability(blended, market, NHL_MARKET_WEIGHT, {
    hitP,
    volumeP,
    hitWeight: NHL_HIT_WEIGHT,
  });
  assert.ok(next - market >= 0.04, next);
});

test('a passing-touchdown streak does not clear 4 points when the attempt rate is under the price', () => {
  function passRow(date, att, td) {
    return { date, passAtt: att, passYds: att * 7, passTd: td, completions: Math.round(att * 0.65), ints: 0 };
  }
  const recent = Array.from({ length: 10 }, (_, index) => passRow(`2026-09-${String(index + 1).padStart(2, '0')}`, 28, index < 8 ? 2 : 0));
  const prior = Array.from({ length: 8 }, (_, index) => passRow(`2025-11-${String(index + 2).padStart(2, '0')}`, 32, 1));
  const model = nflPropEdge({
    type: 'football_player_passing_touchdowns',
    line: 1.5,
    recent: recent.map((row) => row.passTd),
    prior: prior.map((row) => row.passTd),
    recentContext: recent,
    priorContext: prior,
    marketYes: 0.55,
  });
  assert.ok(model);
  assert.equal(model.rate, 80);
  assert.ok(model.edge < 0.04, `edge ${model.edge} p ${model.p}`);
});

test('seven of the last ten is not a bet when there is no volume projection', () => {
  const model = nhlPropEdge({
    type: 'hockey_player_points',
    line: 1,
    recent: [1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
    prior: [1, 0, 1, 0, 1, 0, 1, 0],
    marketYes: 0.5,
  });
  assert.ok(model);
  assert.ok(Math.abs(model.edge) < 0.04, `edge ${model.edge} p ${model.p}`);
});
