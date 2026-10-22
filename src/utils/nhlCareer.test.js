import assert from 'node:assert/strict';
import test from 'node:test';
import { omitCareerColumns, parseAthleteCareer, seasonLabel } from './nhlCareer.js';

test('an ending year reads as the two-season span', () => {
  assert.equal(seasonLabel(2016), '2015-16');
  assert.equal(seasonLabel(2026), '2025-26');
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

test('NBA averages keep the season span, each team, and the current year', () => {
  const table = parseAthleteCareer({
    teams: {
      'washington-wizards': { abbreviation: 'WSH' },
      'milwaukee-bucks': { abbreviation: 'MIL' },
    },
    categories: [
      { name: 'totals', labels: ['PTS'], statistics: [], totals: [] },
      {
        name: 'averages',
        labels: ['GP', 'PTS'],
        statistics: [
          { teamSlug: 'washington-wizards', season: { year: 2025 }, stats: ['54', '15.2'] },
          { teamSlug: 'milwaukee-bucks', season: { year: 2025 }, stats: ['11', '12.4'] },
          { teamSlug: '2024-25 Totals', season: { year: 2025 }, stats: ['65', '14.8'] },
          { teamSlug: 'milwaukee-bucks', season: { year: 2026 }, stats: ['69', '13.0'] },
          { teamSlug: 'milwaukee-bucks', season: { year: 2027 }, stats: ['1', '5.0'] },
        ],
        totals: ['810', '16.5'],
      },
    ],
  }, 2027, 'averages');

  assert.deepEqual(table.rows.map((row) => [row.label, row.team, row.current, row.seasonTotal]), [
    ['2024-25', 'WSH', false, false],
    ['2024-25', 'MIL', false, false],
    ['2024-25', 'TOT', false, true],
    ['2025-26', 'MIL', false, false],
    ['2026-27', 'MIL', true, false],
  ]);
  assert.deepEqual(table.rows[4].values, ['1', '5.0']);
  assert.deepEqual(table.totals, ['810', '16.5']);
});

test('NBA season lines drop made-attempted shooting and keep the percentages', () => {
  const table = omitCareerColumns({
    labels: ['GP', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'PTS'],
    rows: [{ label: '2025-26', team: 'MIL', values: ['69', '4.9-10.0', '49.2', '1.2-4.0', '30.0', '2.0-2.5', '80.0', '13.0'] }],
    totals: ['611', '6.3-13.9', '45.3', '2.0-5.5', '36.0', '1.8-2.4', '75.0', '16.1'],
  }, ['FG', '3PT', 'FT']);
  assert.deepEqual(table.labels, ['GP', 'FG%', '3P%', 'FT%', 'PTS']);
  assert.deepEqual(table.rows[0].values, ['69', '49.2', '30.0', '80.0', '13.0']);
  assert.deepEqual(table.totals, ['611', '45.3', '36.0', '75.0', '16.1']);
});
