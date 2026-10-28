import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hockeyAllowed,
  hockeyGroup,
  hockeyIndex,
  nbaAllowed,
  nbaGroup,
  nbaIndex,
} from './positionDefense.js';

test('hockey positions land on center, wing, or defense', () => {
  assert.equal(hockeyGroup('C'), 'C');
  assert.equal(hockeyGroup('LW'), 'W');
  assert.equal(hockeyGroup('RW'), 'W');
  assert.equal(hockeyGroup('D'), 'D');
  assert.equal(hockeyGroup('G'), '');
});

test('basketball positions land on guard, forward, or center', () => {
  assert.equal(nbaGroup('PG'), 'G');
  assert.equal(nbaGroup('G'), 'G');
  assert.equal(nbaGroup('SF'), 'F');
  assert.equal(nbaGroup('F'), 'F');
  assert.equal(nbaGroup('C'), 'C');
});

test('a defense that feeds centers ranks above one that does not', () => {
  const soft = hockeyIndex({ games: 6, points: { C: 30, W: 12, D: 6 } }, 'C');
  const tough = hockeyIndex({ games: 6, points: { C: 4, W: 30, D: 8 } }, 'C');
  assert.ok(soft > 1.15, soft);
  assert.ok(tough < 0.85, tough);
  assert.equal(hockeyIndex({ games: 2, points: { C: 10, W: 2, D: 1 } }, 'C'), null);
});

test('guard points and forward rebounds use their own shares', () => {
  const profile = {
    games: 5,
    allowed: {
      G: { pts: 400, reb: 40, ast: 80 },
      F: { pts: 80, reb: 180, ast: 20 },
      C: { pts: 40, reb: 40, ast: 8 },
    },
  };
  assert.ok(nbaIndex(profile, 'G', 'pts') > 1.1);
  assert.ok(nbaIndex(profile, 'F', 'reb') > 1.1);
  assert.ok(nbaIndex(profile, 'C', 'ast') < 1);
});

test('a box score sums the opponent by position and skips the team itself', () => {
  const skater = (id, position, goals, assists) => ({
    athlete: { position: { abbreviation: position } },
    stats: [String(goals), String(assists)],
  });
  const box = {
    boxscore: {
      players: [
        {
          team: { id: '1' },
          statistics: [{ name: 'forwards', keys: ['goals', 'assists'], athletes: [skater('a', 'C', 2, 1)] }],
        },
        {
          team: { id: '6' },
          statistics: [
            { name: 'forwards', keys: ['goals', 'assists'], athletes: [skater('b', 'C', 1, 1), skater('c', 'LW', 0, 2)] },
            { name: 'defenses', keys: ['goals', 'assists'], athletes: [skater('d', 'D', 0, 1)] },
          ],
        },
      ],
    },
  };
  assert.deepEqual(hockeyAllowed(box, '1'), { C: 2, W: 2, D: 1 });

  const nba = {
    boxscore: {
      players: [
        { team: { id: '2' }, statistics: [{ athletes: [] }] },
        {
          team: { id: '17' },
          statistics: [{
            keys: ['points', 'rebounds', 'assists'],
            athletes: [
              { athlete: { position: { abbreviation: 'G' } }, stats: ['22', '4', '8'] },
              { didNotPlay: true, athlete: { position: { abbreviation: 'F' } }, stats: ['30', '10', '4'] },
              { athlete: { position: { abbreviation: 'C' } }, stats: ['12', '11', '1'] },
            ],
          }],
        },
      ],
    },
  };
  assert.deepEqual(nbaAllowed(nba, '2'), {
    G: { pts: 22, reb: 4, ast: 8 },
    F: { pts: 0, reb: 0, ast: 0 },
    C: { pts: 12, reb: 11, ast: 1 },
  });
});
