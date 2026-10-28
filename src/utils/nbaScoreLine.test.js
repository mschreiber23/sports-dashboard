import assert from 'node:assert/strict';
import test from 'node:test';
import { NBA_STAT_COLUMNS, nbaPlayedSides, nbaStatValues, playedName } from './nbaScoreLine.js';

const labels = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF', '+/-'];

test('a played line is points, rebounds, assists, blocks, steals, and turnovers', () => {
  const stats = ['44', '24', '10-23', '0-7', '4-5', '9', '4', '5', '2', '0', '2', '7', '6', '+8'];
  assert.deepEqual(NBA_STAT_COLUMNS.map((col) => col.key), ['PTS', 'REB', 'AST', 'BLK', 'STL', 'TO']);
  assert.deepEqual(nbaStatValues(labels, stats), ['24', '9', '4', '0', '2', '5']);
});

test('a name is the first initial and the last name', () => {
  assert.equal(playedName({ shortName: 'M. Porter Jr.' }), 'M. Porter Jr.');
  assert.equal(playedName({ firstName: 'Jayson', lastName: 'Tatum' }), 'J. Tatum');
  assert.equal(playedName({ displayName: 'Day\'Ron Sharpe' }), 'D. Sharpe');
});

test('each side keeps the players who actually played, away then home', () => {
  const summary = {
    boxscore: {
      players: [
        {
          displayOrder: 2,
          team: { id: '2', abbreviation: 'BOS' },
          statistics: [{
            labels,
            athletes: [
              { athlete: { id: '9', shortName: 'P. George' }, stats: ['36', '20', '8-16', '1-6', '3-3', '7', '7', '3', '2', '0', '0', '7', '3', '-2'] },
              { athlete: { id: '1', shortName: 'J. Tatum' }, stats: ['42', '40', '10-20', '2-7', '18-22', '5', '8', '0', '0', '1', '0', '5', '3', '+5'] },
              { didNotPlay: true, athlete: { id: '2', shortName: 'C. Cenac Jr.' }, stats: [] },
              { athlete: { id: '3', shortName: 'Z. Zero' }, stats: ['0', '0', '0-0', '0-0', '0-0', '0', '0', '0', '0', '0', '0', '0', '0', '0'] },
            ],
          }],
        },
        {
          displayOrder: 1,
          team: { id: '17', abbreviation: 'BKN' },
          statistics: [{
            labels,
            athletes: [
              { athlete: { id: '4', displayName: 'Michael Porter Jr.' }, stats: ['40', '27', '8-16', '6-12', '5-6', '12', '2', '3', '0', '2', '1', '11', '2', '+1'] },
            ],
          }],
        },
      ],
    },
  };
  const sides = nbaPlayedSides(summary, '17', '2');
  assert.deepEqual(sides.map((side) => side.abbr), ['BKN', 'BOS']);
  assert.deepEqual(sides[0].players.map((player) => [player.name, ...player.stats]), [['M. Porter Jr.', '27', '12', '2', '2', '0', '3']]);
  assert.deepEqual(sides[1].players.map((player) => player.name), ['J. Tatum', 'P. George']);
});
