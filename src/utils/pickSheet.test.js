import assert from 'node:assert/strict';
import test from 'node:test';
import { gameChip, picksForGame, pickSummary, pickTitle, rankPicks } from './pickSheet.js';

test('a yes pick reads as the player and the line', () => {
  assert.equal(pickTitle({ player: 'Connor McDavid', prop: '1+ points', prediction: 'yes' }), 'Connor McDavid — 1+ points');
  assert.equal(pickTitle({ player: 'Josh Allen', prop: '250+ passing yards', prediction: 'no' }), 'Josh Allen — No, 250+ passing yards');
  assert.equal(pickTitle({ player: 'Rangers', prop: 'to win', gameLine: true, kind: 'winner' }), 'Rangers to win');
  assert.equal(pickTitle({ player: 'Over 6.5', prop: 'goals', gameLine: true, kind: 'total' }), 'Over 6.5 goals');
});

test('the summary leads with our number, then the record and what supports it', () => {
  const summary = pickSummary({
    player: 'Connor McDavid',
    prop: '1+ points',
    prediction: 'yes',
    modelPct: 62,
    market: 48,
    edgePts: 14,
    hits: 7,
    total: 10,
    tags: ['shots up', 'back to back', 'home'],
    factors: [
      { label: 'Last 10', value: '7/10' },
      { label: 'Long sample', value: '18/30' },
      { label: 'vs Bruins', value: '3/4' },
      { label: 'Minutes', value: '21.0' },
    ],
  });
  assert.equal(summary.lead, 'We have this at 62%. The price is 48%.');
  assert.equal(summary.edge, 'That is 14 points above the price.');
  assert.equal(summary.why[0], 'Cleared it in 7 of the last 10.');
  assert.ok(summary.why.includes('Shots are up.'));
  assert.ok(summary.why.includes('Playing at home.'));
  assert.ok(summary.why.includes('Over the longer run, 18 of 30 cleared it.'));
  assert.ok(summary.why.includes('Against Bruins, 3 of 4.'));
  assert.deepEqual(summary.watch, ['This is a back-to-back.']);
  assert.equal(summary.why.some((line) => line.includes('21.0')), false);
});

test('an under states that the pick is the under', () => {
  const summary = pickSummary({
    prediction: 'no',
    modelPct: 61,
    market: 47,
    edgePts: 14,
    hits: 3,
    total: 10,
    tags: [],
    factors: [],
  });
  assert.equal(summary.lead, 'We have the under at 61%. The price is 47%.');
  assert.match(summary.why[0], /only 3 of the last 10/);
});

test('picks sort by the highest percentage', () => {
  const ranked = rankPicks([
    { player: 'B', modelPct: 55, edge: 0.2, gameStart: 2, modeled: true },
    { player: 'A', rate: 80, edge: 0.05, gameStart: 3 },
    { player: 'C', modelPct: 70, edge: 0.04, gameStart: 1, modeled: true },
  ]);
  assert.deepEqual(ranked.map((pick) => pick.player), ['A', 'C', 'B']);
});

test('a game filter keeps that game and the percentage order', () => {
  assert.equal(gameChip('UTA Mammoth vs. PIT Penguins'), 'UTA vs PIT');
  assert.equal(gameChip('Boston Bruins vs. St. Louis Blues'), 'Boston Bruins vs St. Louis Blues');
  const picks = [
    { player: 'A', gameKey: 'uta-pit', modelPct: 64 },
    { player: 'B', gameKey: 'wpg-tbl', modelPct: 70 },
    { player: 'C', gameKey: 'uta-pit', modelPct: 58 },
  ];
  assert.deepEqual(picksForGame(picks, '').map((pick) => pick.player), ['A', 'B', 'C']);
  assert.deepEqual(rankPicks(picksForGame(picks, 'uta-pit')).map((pick) => pick.player), ['A', 'C']);
});

test('a last-10 pick says the record and the price once', () => {
  const summary = pickSummary({
    prediction: 'yes',
    rate: 70,
    hits: 7,
    total: 10,
    market: 40,
    edgePts: 30,
  });
  assert.equal(summary.lead, 'Cleared it in 7 of the last 10. The price is 40%.');
  assert.equal(summary.edge, '');
  assert.deepEqual(summary.why, []);
  assert.deepEqual(summary.watch, []);
});
