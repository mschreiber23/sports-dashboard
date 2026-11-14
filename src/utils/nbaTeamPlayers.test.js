import test from 'node:test';
import assert from 'node:assert/strict';
import {
  facesNbaOpponent,
  formatAverage,
  gamesFromNbaLog,
  playersFromRoster,
  seasonAverages,
  sortPlayers,
  statSeries,
} from './nbaTeamPlayers.js';

test('a flat roster and grouped roster both keep every player once', () => {
  const player = (id, name, pos) => ({
    id,
    shortName: name,
    displayName: name,
    position: { abbreviation: pos },
    headshot: { href: `https://example.test/${id}.png` },
  });
  const flat = playersFromRoster([player('1', 'J. Brunson', 'G')]);
  const grouped = playersFromRoster([{ items: [player('1', 'J. Brunson', 'G'), player('2', 'K. Towns', 'C')] }]);
  assert.equal(flat[0].headshot, 'https://example.test/1.png');
  assert.deepEqual(grouped.map((row) => row.position), ['G', 'C']);
});

test('regular-season lines become per-game averages and oldest-left series', () => {
  const games = gamesFromNbaLog({
    names: ['minutes', 'totalRebounds', 'assists', 'blocks', 'steals', 'points'],
    events: {
      a: { gameDate: '2026-10-25T00:00Z', opponent: { id: '2', abbreviation: 'BOS', displayName: 'Boston Celtics' } },
      b: { gameDate: '2026-11-02T00:00Z', opponent: { id: '13', abbreviation: 'GS', displayName: 'Golden State Warriors' } },
      c: { gameDate: '2026-10-04T00:00Z', opponent: { id: '8', abbreviation: 'DET', displayName: 'Detroit Pistons' } },
    },
    seasonTypes: [
      {
        displayName: '2026-27 Preseason',
        categories: [{ events: [{ eventId: 'c', stats: ['20', '10', '10', '4', '4', '40'] }] }],
      },
      {
        displayName: '2026-27 Regular Season',
        categories: [{ events: [
          { eventId: 'a', stats: ['32', '4', '6', '0', '1', '20'] },
          { eventId: 'b', stats: ['30', '8', '2', '2', '3', '30'] },
        ] }],
      },
    ],
  });
  assert.deepEqual(games.map((game) => game.id), ['b', 'a']);
  assert.equal(games[0].points, 30);
  assert.equal(games[0].rebounds, 8);
  assert.deepEqual(seasonAverages(games), {
    points: 25,
    rebounds: 6,
    assists: 4,
    blocks: 1,
    steals: 2,
  });
  assert.equal(formatAverage(25), '25.0');
  assert.equal(formatAverage(null), '—');
  assert.deepEqual(statSeries(games, 'points', 10), [20, 30]);
  const celtics = games.filter((game) => facesNbaOpponent(game, { id: '2', abbreviation: 'BOS', name: 'Celtics' }));
  assert.deepEqual(statSeries(celtics, 'assists'), [6]);
  assert.equal(facesNbaOpponent(
    { opponentId: '9', opponentAbbr: 'GSW', opponentName: 'Golden State Warriors' },
    { id: '10', abbreviation: 'GS', name: 'Warriors' },
  ), true);
});

test('players with no games sort after the averages', () => {
  const rows = sortPlayers([
    { name: 'B. Player', averages: { points: 10, rebounds: null } },
    { name: 'A. Player', averages: { points: 20, rebounds: 8 } },
    { name: 'C. Player', averages: { points: null, rebounds: null } },
  ], 'points', 'asc');
  assert.deepEqual(rows.map((row) => row.name), ['B. Player', 'A. Player', 'C. Player']);
});
