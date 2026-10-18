import assert from 'node:assert/strict';
import test from 'node:test';
import { nflScoreSituation } from './nflScoreSituation.js';

const COLTS = [
  { homeAway: 'away', team: { id: '10', abbreviation: 'TEN', shortDisplayName: 'Titans' } },
  { homeAway: 'home', team: { id: '11', abbreviation: 'IND', shortDisplayName: 'Colts' } },
];

test('a live down names the team with the ball and the last play', () => {
  const sit = nflScoreSituation({
    possession: '11',
    down: 2,
    downDistanceText: '2nd & 8 at IND 11',
    isRedZone: false,
    lastPlay: { text: ' (Shotgun) D.Jones pass short middle to K.Allen to IND 11 for 2 yards (T.Adams).' },
  }, COLTS);

  assert.equal(sit.possessionId, '11');
  assert.equal(sit.possessionName, 'Colts');
  assert.equal(sit.downText, '2nd & 8 at IND 11');
  assert.equal(sit.lastPlay, '(Shotgun) D.Jones pass short middle to K.Allen to IND 11 for 2 yards (T.Adams).');
  assert.equal(sit.isRedZone, false);
});

test('a timeout does not invent a team that has the ball', () => {
  const sit = nflScoreSituation({
    down: -1,
    yardLine: 15,
    isRedZone: true,
    lastPlay: { text: 'Official Timeout at 08:15.', team: { id: '3' } },
  }, [
    { team: { id: '1', abbreviation: 'ATL', shortDisplayName: 'Falcons' } },
    { team: { id: '3', abbreviation: 'CHI', shortDisplayName: 'Bears' } },
  ]);

  assert.equal(sit.possessionId, '');
  assert.equal(sit.possessionName, '');
  assert.equal(sit.downText, '');
  assert.equal(sit.isRedZone, false);
  assert.equal(sit.lastPlay, 'Official Timeout at 08:15.');
});

test('an unknown possession id is not labeled', () => {
  const sit = nflScoreSituation({ possession: '99', down: 1, downDistanceText: '1st & 10' }, COLTS);
  assert.equal(sit.possessionName, '');
  assert.equal(sit.downText, '1st & 10');
});
