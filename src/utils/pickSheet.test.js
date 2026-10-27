import assert from 'node:assert/strict';
import test from 'node:test';
import { pickReasons, pickTitle, rankPicks } from './pickSheet.js';

test('a yes pick reads as the player and the line', () => {
  assert.equal(pickTitle({ player: 'Connor McDavid', prop: '1+ points', prediction: 'yes' }), 'Connor McDavid — 1+ points');
  assert.equal(pickTitle({ player: 'Josh Allen', prop: '250+ passing yards', prediction: 'no' }), 'Josh Allen — No, 250+ passing yards');
  assert.equal(pickTitle({ player: 'Rangers', prop: 'to win', gameLine: true, kind: 'winner' }), 'Rangers to win');
  assert.equal(pickTitle({ player: 'Over 6.5', prop: 'goals', gameLine: true, kind: 'total' }), 'Over 6.5 goals');
});

test('the reason leads with the gap, the record, and what supports it', () => {
  const reasons = pickReasons({
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
  assert.equal(reasons[0], 'The read is 62% this hits. The Yes price is 48%. That is 14 points above the price.');
  assert.equal(reasons[1], 'Cleared this line in 7 of the last 10.');
  assert.ok(reasons.includes('The shot rate is up.'));
  assert.ok(reasons.includes('Home is a small lift.'));
  assert.ok(reasons.includes('Over the longer run, 18/30 cleared it.'));
  assert.ok(reasons.includes('Against Bruins, this line hit 3/4.'));
  assert.ok(reasons.includes('Watch: This is a back-to-back.'));
  assert.equal(reasons.some((line) => line.includes('21.0')), false);
});

test('an under states that the pick is the under', () => {
  const reasons = pickReasons({
    prediction: 'no',
    modelPct: 61,
    market: 47,
    edgePts: 14,
    hits: 3,
    total: 10,
    tags: [],
    factors: [],
  });
  assert.match(reasons[0], /stay under/);
  assert.match(reasons[1], /This pick is the under/);
});

test('a model read sorts ahead of a bigger last-10 gap', () => {
  const ranked = rankPicks([
    { player: 'B', edge: 0.05, gameStart: 2, modeled: true },
    { player: 'A', edge: 0.3, gameStart: 3 },
    { player: 'C', edge: 0.12, gameStart: 1, modeled: true },
  ]);
  assert.deepEqual(ranked.map((pick) => pick.player), ['C', 'B', 'A']);
});

test('a last-10 pick says the record and the price once', () => {
  const reasons = pickReasons({
    prediction: 'yes',
    rate: 70,
    hits: 7,
    total: 10,
    market: 40,
    edgePts: 30,
  });
  assert.deepEqual(reasons, ['Cleared this line in 7 of the last 10. The Yes price is 40%.']);
});
