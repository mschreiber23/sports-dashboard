import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NBA_BOX_COLUMNS,
  nbaPeriodLabel,
  nbaPlayClock,
  nbaPlayTitle,
  nbaNotablePlays,
  nbaWinLabel,
  nbaOnCourt,
  nbaCourtSides,
} from './nbaGamecast.js';

test('period labels stay short', () => {
  assert.equal(nbaPeriodLabel({ number: 1, displayValue: '1st Quarter' }), '1st');
  assert.equal(nbaPeriodLabel({ number: 3 }), '3rd');
  assert.equal(nbaPeriodLabel({ number: 5 }), 'OT');
  assert.equal(nbaPeriodLabel({ number: 6 }), '2OT');
});

test('clock reads like 7:19 - 1st', () => {
  assert.equal(nbaPlayClock({
    clock: { displayValue: '7:19' },
    period: { number: 1 },
  }), '7:19 - 1st');
});

test('play titles match the gamecast card', () => {
  assert.equal(nbaPlayTitle({ type: { text: 'Full Timeout' }, shortDescription: 'Timeout' }), 'Timeout');
  assert.equal(nbaPlayTitle({
    scoringPlay: true,
    scoreValue: 2,
    shortDescription: '+2 Points',
    text: 'John Collins makes 1-foot dunk',
  }), '+2 Points');
  assert.equal(nbaPlayTitle({
    scoringPlay: true,
    scoreValue: 1,
    shortDescription: '+1 Point',
  }), '+1 Point');
  assert.equal(nbaPlayTitle({
    type: { text: 'Bad Pass Turnover' },
    text: 'AJ Dybantsa bad pass turnover (Daniss Jenkins steals)',
  }), 'Steal');
  assert.equal(nbaPlayTitle({ type: { text: 'Defensive Rebound' }, text: 'Cade Cunningham defensive rebound' }), '');
  assert.equal(nbaPlayTitle({ type: { text: 'Jump Shot' }, text: 'Trae Young misses 7-foot floating jump shot' }), '');
  assert.equal(nbaPlayTitle({ type: { text: 'Shooting Foul' }, text: 'Trae Young shooting foul' }), '');
});

test('notable plays are newest first and drop misses', () => {
  const plays = [
    { id: '1', type: { text: 'Jump Shot' }, text: 'misses' },
    { id: '2', scoringPlay: true, scoreValue: 1, shortDescription: '+1 Point', text: 'free throw' },
    { id: '3', type: { text: 'Bad Pass Turnover' }, text: 'turnover (Jenkins steals)' },
    { id: '4', type: { text: 'Full Timeout' }, shortDescription: 'Timeout', text: 'Wizards Full timeout' },
  ];
  assert.deepEqual(nbaNotablePlays(plays).map((play) => play.id), ['4', '3', '2']);
});

test('win percent names the leader', () => {
  assert.equal(nbaWinLabel(0.85, 'WSH', 'DET'), 'Win %: DET, 85.0');
  assert.equal(nbaWinLabel(0.42, 'WSH', 'DET'), 'Win %: WSH, 58.0');
  assert.equal(nbaWinLabel(null, 'WSH', 'DET'), '');
});

test('on the court is the active five, with the gamecast stat line', () => {
  const group = {
    labels: ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF', '+/-'],
    athletes: [
      {
        active: true,
        athlete: { id: '1', shortName: 'A. Davis', jersey: '23', position: { abbreviation: 'F' }, headshot: { href: 'https://img/davis' } },
        stats: ['5', '5', '2-2', '1-1', '0-0', '3', '0', '1', '0', '0', '1', '2', '0', '-7'],
      },
      { active: false, didNotPlay: true, athlete: { id: '2', shortName: 'Bench' }, stats: [] },
    ],
  };
  const [player] = nbaOnCourt(group);
  assert.equal(player.name, 'A. Davis');
  assert.equal(player.headshot, 'https://img/davis');
  assert.deepEqual(NBA_BOX_COLUMNS.map((col) => col.label), [
    'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'OREB', 'DREB', 'FG', '3PT', 'FT', 'PF', '+/-',
  ]);
  assert.deepEqual(player.line, ['5', '5', '3', '0', '0', '0', '1', '1', '2', '2-2', '1-1', '0-0', '0', '-7']);
  assert.equal(player.jersey, '23');
  assert.equal(player.pos, 'F');
});

test('court sides follow away then home', () => {
  const box = {
    players: [
      { team: { id: '8' }, statistics: [{ labels: ['PTS'], athletes: [{ active: true, athlete: { id: '9', shortName: 'C. Cunningham' }, stats: ['4'] }] }] },
      { team: { id: '27' }, statistics: [{ labels: ['PTS'], athletes: [{ active: true, athlete: { id: '1', shortName: 'A. Davis' }, stats: ['5'] }] }] },
    ],
  };
  const sides = nbaCourtSides(box, [
    { homeAway: 'away', team: { id: '27', name: 'Wizards', displayName: 'Washington Wizards' } },
    { homeAway: 'home', team: { id: '8', name: 'Pistons', displayName: 'Detroit Pistons' } },
  ]);
  assert.deepEqual(sides.map((side) => side.name), ['Wizards', 'Pistons']);
  assert.equal(sides[0].players[0].line[1], '5');
});
