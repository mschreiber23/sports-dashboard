import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHomeBoard, finalStatusText, keptHideFlags, liveStatusText, omittedFavorites, teamForMark, teamLabel, teamScoreValue } from './homeTeamBoard.js';

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
    { ...lightning, loading: false, game: finalGame, games: [game('300', 'pre')] },
    { ...avalanche, loading: false, game: finalGame, games: [game('301', 'pre')] },
    { ...sabres, loading: false, game: null, games: [game('200', 'pre')] },
  ]);
  assert.deepEqual(board.scores.map((row) => row.game.id), ['100']);
  assert.equal(board.scores[0].favoriteId, '20');
  assert.deepEqual(board.upcoming.map((row) => row.team.id), ['20', '17', '8']);
  assert.deepEqual(board.upcoming.map((row) => row.games.map((item) => item.id)), [['300'], ['301'], ['200']]);
});

test('a game on the selected day is a square, and later games stay on that team', () => {
  const pre = game('10', 'pre', { detail: '7:00 PM EDT' });
  const board = buildHomeBoard([
    { sport: 'nba', team: { id: '15' }, loading: false, game: pre, games: [game('11', 'pre'), game('12', 'pre')] },
  ]);
  assert.deepEqual(board.scores.map((row) => row.game.id), ['10']);
  assert.deepEqual(board.upcoming[0].games.map((row) => row.id), ['11', '12']);
});

test('a live game stays on the score row and the following games are that team’s list', () => {
  const board = buildHomeBoard([
    { sport: 'nfl', team: { id: '12' }, loading: false, game: game('9', 'in'), games: [game('12', 'pre')] },
  ]);
  assert.deepEqual(board.scores.map((row) => row.game.id), ['9']);
  assert.deepEqual(board.upcoming[0].games.map((row) => row.id), ['12']);
});

test('a team with only later games has no square, and the row stops at five', () => {
  const games = ['1', '2', '3', '4', '5', '6'].map((id) => game(id, 'pre'));
  const board = buildHomeBoard([
    { sport: 'nhl', team: { id: '8' }, loading: false, game: null, games },
  ]);
  assert.equal(board.scores.length, 0);
  assert.deepEqual(board.upcoming[0].games.map((row) => row.id), ['1', '2', '3', '4', '5']);
});

test('two favorites keep separate upcoming rows when they share a later game', () => {
  const shared = game('300', 'pre');
  const board = buildHomeBoard([
    { ...lightning, loading: false, game: null, games: [shared] },
    { ...avalanche, loading: false, game: null, games: [shared] },
  ]);
  assert.deepEqual(board.upcoming.map((row) => row.team.id), ['20', '17']);
  assert.equal(board.upcoming[0].games[0], shared);
  assert.equal(board.upcoming[1].games[0], shared);
});

test('still-loading favorites are skipped', () => {
  const board = buildHomeBoard([
    { sport: 'mlb', team: { id: '1' }, loading: true, game: game('1', 'post'), games: [] },
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

test('a favorite saved without a logo uses the mark from its next game', () => {
  const games = [{
    id: '1',
    competitions: [{
      competitors: [
        { homeAway: 'away', team: { id: '4', abbreviation: 'CHI', logo: 'https://example.com/chi.png' } },
        {
          homeAway: 'home',
          team: {
            id: '26',
            abbreviation: 'FLA',
            displayName: 'Florida Panthers',
            logos: [{ href: 'https://example.com/fla.png', rel: ['full', 'default'] }],
          },
        },
      ],
    }],
  }];
  const mark = teamForMark({ id: '26', displayName: 'Florida Panthers', logo: '', abbreviation: '', color: '' }, games);
  assert.equal(mark.logo, 'https://example.com/fla.png');
  assert.equal(mark.abbreviation, 'FLA');
  assert.equal(mark.displayName, 'Florida Panthers');
  const kept = teamForMark({ id: '26', logo: 'https://example.com/saved.png', logos: [{ href: 'https://example.com/saved.png' }] }, games);
  assert.equal(kept.logo, 'https://example.com/saved.png');
});

test('a hide flag for a team that is not a favorite does not count as hidden', () => {
  const teams = [
    { sport: 'nba', team: { id: '1', displayName: 'Wizards' } },
    { sport: 'nhl', team: { id: '8', displayName: 'Sabres' } },
  ];
  const stored = { 'nba-1': false, 'nhl-99': true, 'mlb-4': true };
  assert.deepEqual(keptHideFlags(teams, stored), {});
  assert.equal(omittedFavorites(teams, stored, {}).length, 0);
  const hidden = { 'nhl-8': true };
  assert.deepEqual(keptHideFlags(teams, hidden), hidden);
  assert.equal(omittedFavorites(teams, hidden, {})[0].team.displayName, 'Sabres');
  assert.equal(omittedFavorites(teams, {}, { '1-nba': true }).length, 1);
  assert.equal(omittedFavorites([{ sport: 'milb', team: { id: '9' } }], { 'milb-9': true }, {}).length, 0);
});

test('names and scores prefer the short label and a display value', () => {
  assert.equal(teamLabel({ shortDisplayName: 'Raptors', displayName: 'Toronto Raptors' }), 'Raptors');
  assert.equal(teamScoreValue({ score: { displayValue: '112' } }), '112');
  assert.equal(teamScoreValue({ score: '6' }), '6');
});
