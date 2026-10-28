import assert from 'node:assert/strict';
import test from 'node:test';
import { learnCalibration } from './propCalibration.js';

function graded(count, hits, baseP) {
  return Array.from({ length: count }, (_, index) => ({
    league: 'nba',
    propType: 'basketball_player_points',
    line: 20.5,
    result: index < hits ? 'hit' : 'miss',
    modelP: baseP,
    baseP,
    price: 0.48,
    edge: baseP - 0.48,
  }));
}

test('a long miss can move a league by more than 2.5 points, and a short one stays shrunk', () => {
  const long = learnCalibration(graded(200, 90, 0.55));
  assert.equal(long.nba.active, true);
  assert.ok(long.nba.global <= -0.04, long.nba.global);
  assert.ok(long.nba.global >= -0.05, long.nba.global);

  const short = learnCalibration(graded(40, 18, 0.55));
  assert.equal(short.nba.active, true);
  assert.ok(short.nba.global > -0.04, short.nba.global);
  assert.ok(short.nba.global < -0.02, short.nba.global);
});
