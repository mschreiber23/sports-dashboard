import assert from 'node:assert/strict';
import test from 'node:test';
import { explainNhlPoint, nhlFactorLines, nhlPointChance, nhlPropEdge } from './nhlEdge.js';

function pointRow(date, shots, goals, assists) {
  return { date, shots, goals, assists, toi: 18, pp: 0.2 };
}

function pointLog(count, shots, goals, assists, start) {
  return Array.from({ length: count }, (_, index) => pointRow(`2026-01-${String(start + index).padStart(2, '0')}`, shots, goals, assists));
}

const sample = {
  recent: [1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  prior: [1, 0, 1, 0, 1, 0, 1, 0],
  recentContext: pointLog(10, 3, 0, 0, 1),
  priorContext: pointLog(8, 3, 1, 1, 11),
  teamName: 'Detroit Red Wings',
  opponentName: 'New Jersey Devils',
  home: true,
  gameTotal: 6.5,
  opponentGoalsAgainst: 3.4,
};

test('a point chance with a price matches the prop model', () => {
  const priced = nhlPropEdge({
    type: 'hockey_player_points',
    line: 1,
    marketYes: 0.5,
    ...sample,
  });
  const chance = nhlPointChance({ marketYes: 0.5, ...sample });
  assert.ok(priced);
  assert.ok(chance);
  assert.equal(chance.priced, true);
  assert.equal(chance.p, priced.p);
  assert.equal(chance.edge, priced.edge);
});

test('a point chance without a price still ranks the skater', () => {
  const chance = nhlPointChance(sample);
  assert.ok(chance);
  assert.equal(chance.priced, false);
  assert.equal(chance.edge, null);
  assert.ok(chance.p > 0.2 && chance.p < 0.92, chance.p);
});

test('the point explanation uses the last ten and the matchup', () => {
  const lines = nhlFactorLines({
    type: 'hockey_player_points',
    line: 1,
    ...sample,
    opponentLabel: 'NJ',
  });
  const text = explainNhlPoint(lines, { priced: true, marketYes: 0.54 });
  assert.match(text, /7 of his last 10/);
  assert.match(text, /at home/);
  assert.match(text, /3\.4\/g/);
  assert.match(text, /54%/);
});
