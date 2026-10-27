import assert from 'node:assert/strict';
import test from 'node:test';
import { pastPickSports, picksForSport } from './pastPicks.js';

const rows = [
  { league: 'nba', result: 'hit', player: 'Tatum' },
  { league: 'nhl', result: 'miss', player: 'McDavid' },
  { league: 'nfl', result: 'hit', player: 'Allen' },
  { league: 'nhl', result: 'void', player: 'Mackinnon' },
  { league: 'mlb', result: null, player: 'Open' },
];

test('past picks offer the sports that have a result, in league order', () => {
  assert.deepEqual(pastPickSports(rows), ['nhl', 'nfl', 'nba']);
});

test('a sport filter keeps that league and All keeps every pick', () => {
  assert.deepEqual(picksForSport(rows, 'nhl').map((row) => row.player), ['McDavid', 'Mackinnon']);
  assert.equal(picksForSport(rows, 'all').length, rows.length);
  assert.deepEqual(picksForSport(rows, 'nba').map((row) => row.player), ['Tatum']);
});
