import assert from 'node:assert/strict';
import test from 'node:test';
import { teamsWithGamesFirst } from './homeTeamOrder.js';

const teams = [
  { sport: 'nba', team: { id: '27', abbreviation: 'WSH' } },
  { sport: 'nhl', team: { id: '23', abbreviation: 'WSH' } },
  { sport: 'nhl', team: { id: '16', abbreviation: 'PIT' } },
  { sport: 'nhl', team: { id: '14', abbreviation: 'TB' } },
];

test('teams with a game that day move up and favorites order stays inside each group', () => {
  const ordered = teamsWithGamesFirst(teams, { 'nhl-16': true });
  assert.deepEqual(ordered.map((entry) => entry.team.abbreviation), ['PIT', 'WSH', 'WSH', 'TB']);
});

test('several teams on the slate keep their favorites order', () => {
  const ordered = teamsWithGamesFirst(teams, { 'nba-27': true, 'nhl-14': true });
  assert.deepEqual(ordered.map((entry) => `${entry.sport}-${entry.team.abbreviation}`), [
    'nba-WSH',
    'nhl-TB',
    'nhl-WSH',
    'nhl-PIT',
  ]);
});

test('an empty slate leaves the favorites order alone', () => {
  const ordered = teamsWithGamesFirst(teams, {});
  assert.deepEqual(ordered.map((entry) => entry.team.id), ['27', '23', '16', '14']);
});
