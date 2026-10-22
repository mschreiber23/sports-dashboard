import assert from 'node:assert/strict';
import test from 'node:test';
import { activeSeasonYear, nbaSeasonAverages } from './espn.js';

const oct2026 = new Date('2026-10-22T18:00:00Z');
const jan2027 = new Date('2027-01-15T17:00:00Z');
const aug2026 = new Date('2026-08-01T16:00:00Z');

test('October cards use the season that is underway', () => {
  assert.equal(activeSeasonYear('nhl', oct2026), 2027);
  assert.equal(activeSeasonYear('nba', oct2026), 2027);
  assert.equal(activeSeasonYear('nfl', oct2026), 2026);
  assert.equal(activeSeasonYear('mlb', oct2026), 2026);
});

test('winter cards stay on the season already in progress', () => {
  assert.equal(activeSeasonYear('nhl', jan2027), 2027);
  assert.equal(activeSeasonYear('nba', jan2027), 2027);
  assert.equal(activeSeasonYear('nfl', jan2027), 2026);
  assert.equal(activeSeasonYear('mlb', jan2027), 2027);
});

test('summer cards stay on the season that already finished', () => {
  assert.equal(activeSeasonYear('nba', aug2026), 2026);
  assert.equal(activeSeasonYear('nfl', aug2026), 2025);
  assert.equal(activeSeasonYear('nhl', new Date('2026-09-15T16:00:00Z')), 2027);
  assert.equal(activeSeasonYear('nba', new Date('2026-09-15T16:00:00Z')), 2026);
});

test('NBA card averages are per game, not totals or per 48 minutes', () => {
  const averages = nbaSeasonAverages([
    {
      name: 'defensive',
      stats: [
        { name: 'steals', abbreviation: 'STL', displayValue: '3' },
        { name: 'avgSteals', abbreviation: 'STL', displayValue: '3.0' },
        { name: 'avg48Steals', abbreviation: 'STL', displayValue: '5.3' },
        { name: 'blocks', abbreviation: 'BLK', displayValue: '0' },
        { name: 'avgBlocks', abbreviation: 'BLK', displayValue: '0.0' },
      ],
    },
    {
      name: 'offensive',
      stats: [
        { name: 'points', abbreviation: 'PTS', displayValue: '5' },
        { name: 'avgPoints', abbreviation: 'PTS', displayValue: '5.0' },
        { name: 'avg48Points', abbreviation: 'PTS', displayValue: '8.9' },
        { name: 'avgRebounds', abbreviation: 'REB', displayValue: '6.0' },
        { name: 'avgAssists', abbreviation: 'AST', displayValue: '3.0' },
      ],
    },
  ]);
  assert.deepEqual(averages, {
    PTS: '5.0',
    REB: '6.0',
    AST: '3.0',
    STL: '3.0',
    BLK: '0.0',
  });
});
