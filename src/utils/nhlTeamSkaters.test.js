import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chartMax,
  facesOpponent,
  gamesFromNhlLog,
  mergeGames,
  nextOpponent,
  pointSeries,
  seasonTotals,
  skatersFromRoster,
  sortSkaters,
} from './nhlTeamSkaters.js';

const player = (id, name, pos) => ({
  id,
  shortName: name,
  displayName: name,
  position: { abbreviation: pos },
  headshot: { href: `https://example.test/${id}.png` },
});

test('the roster keeps skaters and drops goalies', () => {
  const rows = skatersFromRoster([
    { items: [player('1', 'C. McDavid', 'C'), player('2', 'S. Skinner', 'G')] },
    { items: [player('3', 'E. Bouchard', 'D')] },
  ]);
  assert.deepEqual(rows.map((row) => row.id), ['1', '3']);
  assert.equal(rows[0].headshot, 'https://example.test/1.png');
});

test('a gamelog keeps regular-season points, newest first', () => {
  const games = gamesFromNhlLog({
    names: ['goals', 'assists', 'points'],
    events: {
      a: { gameDate: '2026-10-10T00:00Z', opponent: { id: '21', abbreviation: 'TOR', displayName: 'Toronto Maple Leafs' } },
      b: { gameDate: '2026-11-01T00:00Z', opponent: { id: '15', abbreviation: 'PHI', displayName: 'Philadelphia Flyers' } },
      c: { gameDate: '2026-09-20T00:00Z', opponent: { id: '1', abbreviation: 'BOS', displayName: 'Boston Bruins' } },
    },
    seasonTypes: [
      {
        displayName: '2026-27 Preseason',
        categories: [{ events: [{ eventId: 'c', stats: ['2', '2', '4'] }] }],
      },
      {
        displayName: '2026-27 Regular Season',
        categories: [{ events: [
          { eventId: 'a', stats: ['1', '1', '2'] },
          { eventId: 'b', stats: ['0', '1', '1'] },
        ] }],
      },
    ],
  });
  assert.deepEqual(games.map((game) => game.id), ['b', 'a']);
  assert.equal(games[0].points, 1);
  assert.deepEqual(seasonTotals(games), { goals: 1, assists: 2, points: 3 });
});

test('last 10 points read oldest on the left and the opponent series matches the team', () => {
  const games = [
    { id: '3', points: 3, opponentId: '21', opponentAbbr: 'TOR', opponentName: 'Toronto Maple Leafs' },
    { id: '2', points: 0, opponentId: '15', opponentAbbr: 'PHI', opponentName: 'Philadelphia Flyers' },
    { id: '1', points: 2, opponentId: '8', opponentAbbr: 'LA', opponentName: 'Los Angeles Kings' },
  ];
  assert.deepEqual(pointSeries(games, 10), [2, 0, 3]);
  const leafs = games.filter((game) => facesOpponent(game, { id: '21', abbreviation: 'TOR', name: 'Maple Leafs' }));
  assert.deepEqual(pointSeries(leafs, 10), [3]);
  assert.equal(facesOpponent(
    { opponentId: '9', opponentAbbr: 'LAK', opponentName: 'Los Angeles Kings' },
    { id: '8', abbreviation: 'LA', name: 'Kings' },
  ), true);
  assert.deepEqual(mergeGames([games.slice(0, 1), games]).map((game) => game.id), ['3', '2', '1']);
  assert.equal(chartMax([[2, 0], [4]]), 4);
});

test('the next opponent skips finals and says whether the team is home', () => {
  const events = [
    { date: '2026-11-10T00:00:00Z', competitions: [{ status: { type: { state: 'post' } }, competitors: [] }] },
    {
      date: '2026-11-15T00:00:00Z',
      competitions: [{
        status: { type: { state: 'pre' } },
        competitors: [
          { homeAway: 'away', team: { id: '6', abbreviation: 'EDM' } },
          { homeAway: 'home', team: { id: '21', abbreviation: 'TOR', shortDisplayName: 'Maple Leafs' } },
        ],
      }],
    },
  ];
  const next = nextOpponent(events, '6', Date.parse('2026-11-14T18:00:00Z'));
  assert.equal(next.abbreviation, 'TOR');
  assert.equal(next.home, false);
});

test('skaters sort by the chosen column', () => {
  const rows = sortSkaters([
    { name: 'B. Player', points: 10, goals: 2, assists: 8 },
    { name: 'A. Player', points: 20, goals: 12, assists: 8 },
  ], 'goals', 'desc');
  assert.equal(rows[0].name, 'A. Player');
  const assists = sortSkaters(rows, 'assists', 'asc');
  assert.equal(assists[0].name, 'A. Player');
});
