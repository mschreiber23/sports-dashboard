import assert from 'node:assert/strict';
import test from 'node:test';
import { NFL_STAT_GROUPS, nflPlayedSides } from './nflScoreLine.js';

const passingLabels = ['C/ATT', 'YDS', 'AVG', 'TD', 'INT', 'SACKS', 'QBR', 'RTG'];
const rushingLabels = ['CAR', 'YDS', 'AVG', 'TD', 'LONG'];
const receivingLabels = ['REC', 'YDS', 'AVG', 'TD', 'LONG', 'TGTS'];

function athlete(id, name, stats) {
  const [first, ...rest] = name.split(' ');
  return { athlete: { id, firstName: first, lastName: rest.join(' '), displayName: name }, stats };
}

test('football lines are passing, rushing, and receiving', () => {
  assert.deepEqual(NFL_STAT_GROUPS.map((group) => group.label), ['Passing', 'Rushing', 'Receiving']);
  assert.deepEqual(NFL_STAT_GROUPS[0].columns.map((col) => col.label), ['C/ATT', 'YDS', 'TD', 'INT']);
  assert.deepEqual(NFL_STAT_GROUPS[1].columns.map((col) => col.label), ['CAR', 'YDS', 'TD']);
  assert.deepEqual(NFL_STAT_GROUPS[2].columns.map((col) => col.label), ['REC', 'YDS', 'TD']);
});

test('each side keeps the players who touched the ball, away then home', () => {
  const summary = {
    boxscore: {
      players: [
        {
          displayOrder: 2,
          team: { id: '33', abbreviation: 'BAL' },
          statistics: [
            { name: 'passing', labels: passingLabels, athletes: [
              athlete('1', 'Lamar Jackson', ['23/34', '298', '8.8', '1', '1', '4-22', '30.4', '92.5']),
            ] },
            { name: 'rushing', labels: rushingLabels, athletes: [
              athlete('2', 'Derrick Henry', ['17', '45', '2.6', '0', '9']),
              athlete('3', 'Rasheen Ali', ['4', '19', '4.8', '0', '7']),
              athlete('9', 'Did Not Carry', ['0', '0', '0.0', '0', '0']),
            ] },
            { name: 'receiving', labels: receivingLabels, athletes: [
              athlete('4', 'Zay Flowers', ['8', '137', '17.1', '1', '48', '11']),
              athlete('5', 'Mark Andrews', ['2', '35', '17.5', '0', '19', '3']),
            ] },
            { name: 'defensive', labels: ['TOT', 'SOLO'], athletes: [athlete('8', 'Roquan Smith', ['8', '5'])] },
          ],
        },
        {
          displayOrder: 1,
          team: { id: '4', abbreviation: 'CIN' },
          statistics: [
            { name: 'passing', labels: passingLabels, athletes: [
              athlete('6', 'Joe Burrow', ['22/30', '292', '9.7', '4', '0', '1-8', '91.5', '143.3']),
              athlete('7', 'Jake Browning', ['0/0', '0', '0.0', '0', '0', '0-0', '0.0', '0.0']),
            ] },
            { name: 'rushing', labels: rushingLabels, athletes: [
              athlete('10', 'Chase Brown', ['11', '39', '3.5', '0', '6']),
            ] },
            { name: 'receiving', labels: receivingLabels, athletes: [
              athlete('11', 'Tee Higgins', ['6', '148', '24.7', '1', '44', '7']),
              athlete('12', 'Ja\'Marr Chase', ['5', '62', '12.4', '1', '30', '7']),
              athlete('13', 'Dohnte Meyers', ['0', '0', '0.0', '0', '0', '2']),
              athlete('14', 'No Touches', ['0', '8', '0.0', '0', '0', '0']),
            ] },
          ],
        },
      ],
    },
  };
  const sides = nflPlayedSides(summary, '4', '33');
  assert.deepEqual(sides.map((side) => side.abbr), ['CIN', 'BAL']);
  assert.deepEqual(sides[0].sections.map((section) => section.key), ['passing', 'rushing', 'receiving']);
  assert.deepEqual(sides[0].sections[0].players.map((player) => [player.name, ...player.stats]), [
    ['J. Burrow', '22/30', '292', '4', '0'],
  ]);
  assert.deepEqual(sides[0].sections[2].players.map((player) => player.name), ['T. Higgins', 'J. Chase']);
  assert.deepEqual(sides[1].sections[1].players.map((player) => player.name), ['D. Henry', 'R. Ali']);
  assert.equal(JSON.stringify(sides).includes('Roquan'), false);
});
