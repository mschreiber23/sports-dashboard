import assert from 'node:assert/strict';
import test from 'node:test';
import { coldScorers, seasonScoring } from './coldStreak.js';

function games(points) {
  return points.map((value, index) => ({ time: 1000 + index, points: value }));
}

test('the cold streak is the blanks at the end of the season', () => {
  const score = seasonScoring(games([1, 0, 2, 0, 0, 0]));
  assert.equal(score.streak, 3);
  assert.equal(score.points, 3);
  assert.equal(score.games, 6);
  assert.equal(score.perGame, 0.5);
});

test('a point in the latest game ends the streak', () => {
  assert.equal(seasonScoring(games([0, 0, 1])).streak, 0);
});

test('tonight’s list keeps a 2-game drought at 0.65 a game and sorts the longest first', () => {
  const rows = coldScorers([
    { name: 'Short', games: games([1, 1, 1, 1, 0, 0]) },
    { name: 'Cold', games: games([2, 2, 1, 1, 0, 0, 0, 0]) },
    { name: 'Light', games: games([1, 0, 0, 0, 0, 0]) },
    { name: 'Hot', games: games([1, 1, 1, 1]) },
  ]);
  assert.deepEqual(rows.map((row) => row.name), ['Cold', 'Short']);
  assert.equal(rows[0].streak, 4);
  assert.ok(rows[0].perGame >= 0.65);
  assert.ok(rows.find((row) => row.name === 'Light') == null);
});
