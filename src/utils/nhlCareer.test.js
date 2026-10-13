import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAthleteCareer, seasonLabel } from './nhlCareer.js';

test('an ending year reads as the two-season span', () => {
  assert.equal(seasonLabel(2016), '2015-16');
  assert.equal(seasonLabel(2027), '2026-27');
});

test('the table keeps ESPN values, the current season, and the career line', () => {
  const table = parseAthleteCareer({
    teams: {
      'edmonton-oilers': { abbreviation: 'EDM' },
      'carolina-hurricanes': { abbreviation: 'CAR' },
    },
    categories: [{
      labels: ['GP', 'G', 'A', 'PTS', 'SOG'],
      statistics: [
        { teamSlug: 'edmonton-oilers', season: { year: 2016, displayName: '15-16' }, stats: ['45', '16', '32', '48', '0'] },
        { teamSlug: 'carolina-hurricanes', season: { year: 2025, displayName: '24-25' }, stats: ['13', '2', '4', '6', '0'] },
        { teamSlug: '24-25', season: { year: 2025, displayName: '24-25' }, stats: ['82', '32', '56', '88', '0'] },
        { teamSlug: 'edmonton-oilers', season: { year: 2027, displayName: '26-27' }, stats: ['5', '3', '10', '13', '0'] },
      ],
      totals: ['799', '412', '821', '1233', '15'],
    }],
  }, 2027);

  assert.deepEqual(table.rows.map((row) => [row.label, row.team, row.current, row.seasonTotal]), [
    ['2015-16', 'EDM', false, false],
    ['2024-25', 'CAR', false, false],
    ['2024-25', 'TOT', false, true],
    ['2026-27', 'EDM', true, false],
  ]);
  assert.deepEqual(table.rows[3].values, ['5', '3', '10', '13', '0']);
  assert.deepEqual(table.totals, ['799', '412', '821', '1233', '15']);
});
