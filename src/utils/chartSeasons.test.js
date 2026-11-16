import test from 'node:test';
import assert from 'node:assert/strict';
import { chartSeasons } from './chartSeasons.js';

function game(id, date, opp) {
  return { id, date, opp };
}

test('lookback stops once ten games against the opponent are in hand', async () => {
  const asked = [];
  const seasons = await chartSeasons(async (year) => {
    asked.push(year);
    return [0, 1, 2, 3].map((n) => game(`${year}-${n}`, `${year}-0${n + 1}-01`, true));
  }, 2027, { id: '21' }, (game) => game.opp);
  assert.deepEqual(asked.slice(0, 3), [2027, 2026, 2025]);
  assert.equal(asked.includes(2023), false);
  assert.equal(seasons.length, 3);
  assert.equal(seasons[0][0].id, '2027-0');
});

test('one empty season does not hide the games behind it', async () => {
  const seasons = await chartSeasons(async (year) => {
    if (year === 2026) return [];
    return [0, 1, 2, 3, 4].map((n) => game(`${year}-${n}`, `${year}-0${n + 1}-02`, year < 2027));
  }, 2027, { id: '21' }, (game) => game.opp);
  assert.equal(seasons.filter((list) => list.length).length, 3);
  const versus = seasons.flat().filter((game) => game.opp);
  assert.equal(versus.length >= 10, true);
});

test('two empty seasons in a row ends the search', async () => {
  const asked = [];
  const seasons = await chartSeasons(async (year) => {
    asked.push(year);
    if (year === 2027) return [game('now', '2026-11-01', false)];
    return [];
  }, 2027, { id: '21' }, (game) => game.opp);
  assert.deepEqual(asked, [2027, 2026, 2025, 2024]);
  assert.equal(seasons.length, 1);
  assert.equal(seasons[0][0].id, 'now');
});
