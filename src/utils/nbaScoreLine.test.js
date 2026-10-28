import assert from 'node:assert/strict';
import test from 'node:test';
import { nbaPlayedSides, nbaStatLine, playedName } from './nbaScoreLine.js';

const labels = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF', '+/-'];

test('a played line is points, rebounds, assists, steals, blocks, turnovers, and fouls', () => {
  const stats = ['44', '24', '10-23', '0-7', '4-5', '9', '4', '5', '2', '0', '2', '7', '6', '+8'];
  assert.equal(nbaStatLine(labels, stats), '24p/9r/4a/2s/0b/5t/6f');
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
  assert.deepEqual(sides[0].players.map((player) => `${player.name} ${player.line}`), ['M. Porter Jr. 27p/12r/2a/0s/2b/3t/2f']);
  assert.deepEqual(sides[1].players.map((player) => player.name), ['J. Tatum']);
});
