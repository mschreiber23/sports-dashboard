import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHomeBoard, finalStatusText, liveStatusText, teamLabel, teamScoreValue } from './homeTeamBoard.js';

function game(id, state, extra = {}) {
  return {
    id,
    competitions: [{
      status: { type: { state, shortDetail: extra.detail || '', detail: extra.longDetail || '' } },
      situation: extra.situation,
      competitors: extra.competitors || [
        { homeAway: 'away', score: '3', team: { id: '1', shortDisplayName: 'Away' } },
        { homeAway: 'home', score: '1', team: { id: '2', shortDisplayName: 'Home' } },
      ],
    }],
  };
}

const lightning = { sport: 'nhl', team: { id: '20', displayName: 'Tampa Bay Lightning' } };
const avalanche = { sport: 'nhl', team: { id: '17', displayName: 'Colorado Avalanche' } };
const sabres = { sport: 'nhl', team: { id: '8', displayName: 'Buffalo Sabres' } };

test('final and live games are score tiles, and a shared game is one tile', () => {
  const finalGame = game('100', 'post');
  const board = buildHomeBoard([
    { ...lightning, loading: false, game: finalGame, next: game('300', 'pre') },
    { ...avalanche, loading: false, game: finalGame, next: game('301', 'pre') },
    { ...sabres, loading: false, game: null, next: game('200', 'pre') },
  ]);
  assert.deepEqual(board.scores.map((row) => row.game.id), ['100']);
  assert.equal(board.scores[0].favoriteId, '20');
  assert.deepEqual(board.upcoming.map((row) => row.game.id), ['300', '301', '200']);
});

test('a game that has not started is upcoming, including one later the same day', () => {
  const pre = game('10', 'pre', { detail: '7:00 PM EDT' });
  const board = buildHomeBoard([
    { sport: 'nba', team: { id: '15' }, loading: false, game: pre, next: game('11', 'pre') },
  ]);
  assert.equal(board.scores.length, 0);
  assert.deepEqual(board.upcoming.map((row) => row.game.id), ['10']);
});

test('a live game stays on the score row and the following game is upcoming', () => {
  const board = buildHomeBoard([
    { sport: 'nfl', team: { id: '12' }, loading: false, game: game('9', 'in'), next: game('12', 'pre') },
  ]);
  assert.deepEqual(board.scores.map((row) => row.game.id), ['9']);
  assert.deepEqual(board.upcoming.map((row) => row.game.id), ['12']);
});

test('still-loading favorites are skipped', () => {
  const board = buildHomeBoard([
    { sport: 'mlb', team: { id: '1' }, loading: true, game: game('1', 'post'), next: null },
  ]);
  assert.deepEqual(board, { scores: [], upcoming: [] });
});

test('status lines keep overtime and the clock', () => {
  assert.equal(finalStatusText({ type: { shortDetail: 'Final/OT', detail: 'Final/OT' } }), 'Final OT');
  assert.equal(finalStatusText({ type: { shortDetail: 'Final', detail: 'Final' } }), 'Final');
  assert.equal(liveStatusText({ type: { shortDetail: '4:12 - 4th' } }, null), '4:12 - 4th');
  assert.equal(
    liveStatusText({ type: { shortDetail: '3rd 8:22' } }, { down: 2, shortDownDistanceText: '2nd & 7' }),
    '3rd 8:22 · 2nd & 7',
  );
  assert.equal(liveStatusText({ type: { shortDetail: '3rd 8:22' } }, { down: -1, shortDownDistanceText: '2nd & 7' }), '3rd 8:22');
});

test('names and scores prefer the short label and a display value', () => {
  assert.equal(teamLabel({ shortDisplayName: 'Raptors', displayName: 'Toronto Raptors' }), 'Raptors');
  assert.equal(teamScoreValue({ score: { displayValue: '112' } }), '112');
  assert.equal(teamScoreValue({ score: '6' }), '6');
});
