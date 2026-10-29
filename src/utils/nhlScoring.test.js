import test from 'node:test';
import assert from 'node:assert/strict';
import { scoringAssists } from './nhlScoring.js';

const player = (name, shortName) => ({ displayName: name, shortName });

test('an assist shows the season total through that goal', () => {
  const rows = scoringAssists([
    { type: 'scorer', athlete: player('Gavin McKenna', 'G. McKenna'), ytdGoals: 4 },
    { type: 'assister', athlete: player('Auston Matthews', 'A. Matthews'), ytdAssists: 12 },
    { type: 'assister', athlete: player('Darren Raddysh', 'D. Raddysh'), ytdAssists: 7 },
  ], 'Gavin McKenna Goal (4) Wrist Shot, assists: Auston Matthews (12), Darren Raddysh (7)');
  assert.deepEqual(rows, [
    { name: 'A. Matthews', count: '12' },
    { name: 'D. Raddysh', count: '7' },
  ]);
});

test('a later assist uses the new season total', () => {
  const rows = scoringAssists([
    { type: 'assister', athlete: player('Auston Matthews', 'A. Matthews'), ytdAssists: 13 },
  ], 'Gavin McKenna Goal (5) Slap Shot, assists: Auston Matthews (13)');
  assert.equal(rows[0].count, '13');
});

test('the play text supplies the count when the feed omits it', () => {
  const rows = scoringAssists([
    { type: 'firstAssist', athlete: player('Mackie Samoskevich', 'M. Samoskevich') },
  ], 'Berkly Catton Goal (4) Backhand, assists: Mackie Samoskevich (2)');
  assert.deepEqual(rows, [{ name: 'M. Samoskevich', count: '2' }]);
});

test('an unassisted goal has no assist row', () => {
  const rows = scoringAssists([
    { type: 'scorer', athlete: player('Brayden Point', 'B. Point'), ytdGoals: 3 },
  ], 'Brayden Point Goal (3) Wrist Shot');
  assert.deepEqual(rows, []);
});

test('a name still shows when neither source has a count', () => {
  const rows = scoringAssists([
    { type: 'secondAssist', athlete: player('Evan Bouchard', 'E. Bouchard') },
  ], 'Connor McDavid Goal (7) Snap Shot');
  assert.deepEqual(rows, [{ name: 'E. Bouchard', count: null }]);
});
