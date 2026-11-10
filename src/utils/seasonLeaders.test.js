import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatSeasonStat, mergeSeasonAthletes, nhlHitBlock, rowsFromSeasonAthletes } from './seasonLeaders.js';

const nbaSchema = [
  { name: 'general', names: ['gamesPlayed', 'rebounds', 'avgRebounds'] },
  { name: 'offensive', names: ['avgPoints', 'points', 'avgAssists', 'assists', 'avgTurnovers', 'turnovers'] },
  { name: 'defensive', names: ['avgSteals', 'steals', 'avgBlocks', 'blocks'] },
];

function nbaAthlete(id, name, games, totals) {
  return {
    athlete: {
      id,
      shortName: name,
      position: { abbreviation: 'G' },
      teamShortName: 'LAL',
      teams: [{ abbreviation: 'LAL', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nba/500/lal.png', rel: ['full', 'default'] }] }],
    },
    categories: [
      { name: 'general', totals: [games, totals.rebounds, totals.avgRebounds] },
      { name: 'offensive', totals: [totals.avgPoints, totals.points, totals.avgAssists, totals.assists, totals.avgTurnovers, totals.turnovers] },
      { name: 'defensive', totals: [totals.avgSteals, totals.steals, totals.avgBlocks, totals.blocks] },
    ],
  };
}

describe('season leader rows', () => {
  it('uses NBA per-game averages instead of season totals', () => {
    const rows = rowsFromSeasonAthletes('nba', [
      nbaAthlete('1', 'L. Doncic', '10', {
        rebounds: '78', avgRebounds: '7.8', avgPoints: '39.3', points: '393',
        avgAssists: '7.9', assists: '79', avgTurnovers: '5.0', turnovers: '50',
        avgSteals: '2.0', steals: '20', avgBlocks: '0.8', blocks: '8',
      }),
      nbaAthlete('2', 'Sat Out', '0', {
        rebounds: '0', avgRebounds: '0', avgPoints: '0', points: '0',
        avgAssists: '0', assists: '0', avgTurnovers: '0', turnovers: '0',
        avgSteals: '0', steals: '0', avgBlocks: '0', blocks: '0',
      }),
    ], nbaSchema);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].points, 39.3);
    assert.equal(rows[0].rebounds, 7.8);
    assert.equal(rows[0].assists, 7.9);
    assert.equal(rows[0].steals, 2);
    assert.equal(rows[0].blocks, 0.8);
    assert.equal(rows[0].turnovers, 5);
    assert.equal(formatSeasonStat('nba', 'points', rows[0].points), '39.3');
    assert.equal(formatSeasonStat('nba', 'steals', rows[0].steals), '2.0');
    assert.equal(rows[0].team, 'LAL');
    assert.match(rows[0].teamLogo, /500-dark\/lal\.png$/);
  });

  it('keeps NHL skaters and leaves hits empty until the extra feed fills them', () => {
    const schema = [
      { name: 'general', names: ['games', 'plusMinus'] },
      { name: 'offensive', names: ['goals', 'assists', 'points', 'shotsTotal'] },
    ];
    const skater = {
      athlete: { id: '9', shortName: 'C. McDavid', position: { abbreviation: 'C' }, teamShortName: 'EDM' },
      categories: [
        { name: 'general', totals: ['19', '12'] },
        { name: 'offensive', totals: ['18', '30', '48', '70'] },
      ],
    };
    const goalie = {
      athlete: { id: '8', shortName: 'S. Bobrovsky', position: { abbreviation: 'G' }, teamShortName: 'FLA' },
      categories: [
        { name: 'general', totals: ['12', '0'] },
        { name: 'offensive', totals: ['0', '0', '0', '0'] },
      ],
    };
    const rows = rowsFromSeasonAthletes('nhl', [skater, goalie], schema, { 9: { hits: 22, blocks: 11 } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].points, 48);
    assert.equal(rows[0].shots, 70);
    assert.equal(rows[0].plusMinus, 12);
    assert.equal(rows[0].hits, 22);
    assert.equal(rows[0].blocks, 11);
  });

  it('splits an NFL season into passing, rushing, and receiving lines', () => {
    const schema = [{
      name: 'passing',
      names: ['completions', 'passingAttempts', 'passingYards', 'passingTouchdowns', 'interceptions'],
    }, {
      name: 'rushing',
      names: ['rushingAttempts', 'rushingYards', 'rushingTouchdowns', 'rushingFumblesLost'],
    }, {
      name: 'receiving',
      names: ['receptions', 'receivingTargets', 'receivingYards', 'receivingTouchdowns', 'receivingFumblesLost'],
    }, {
      name: 'defensiveinterceptions',
      names: ['interceptions'],
    }];
    const rows = rowsFromSeasonAthletes('nfl', [{
      athlete: { id: '15', shortName: 'P. Mahomes', position: { abbreviation: 'QB' } },
      categories: [
        { name: 'passing', totals: ['200', '310', '2400', '18', '6'] },
        { name: 'rushing', totals: ['30', '180', '2', '1'] },
        { name: 'receiving', totals: ['0', '0', '0', '0', '0'] },
        { name: 'defensiveinterceptions', totals: ['0'] },
      ],
    }], schema);
    const passing = rows.find((row) => row.line === 'passing');
    const rushing = rows.find((row) => row.line === 'rushing');
    assert.equal(passing.passingYards, 2400);
    assert.equal(passing.interceptions, 6);
    assert.equal(passing.carries, 30);
    assert.equal(passing.fumblesLost, 1);
    assert.equal(rushing.rushingYards, 180);
    assert.equal(rows.some((row) => row.line === 'receiving'), false);
  });

  it('reads MLB hitting and pitching totals', () => {
    const schema = [
      { name: 'batting', names: ['atBats', 'hits', 'homeRuns', 'RBIs', 'stolenBases'] },
      { name: 'pitching', names: ['innings', 'strikeouts'] },
    ];
    const rows = rowsFromSeasonAthletes('mlb', [{
      athlete: { id: '27', shortName: 'S. Ohtani', position: { abbreviation: 'DH' } },
      categories: [
        { name: 'batting', totals: ['400', '120', '40', '90', '12'] },
        { name: 'pitching', totals: ['80.1', '95'] },
      ],
    }], schema);
    assert.deepEqual(rows.map((row) => row.line), ['hitting', 'pitching']);
    assert.equal(rows[0].homeRuns, 40);
    assert.equal(rows[0].rbi, 90);
    assert.equal(rows[1].strikeouts, 95);
    assert.equal(rows[1].innings, 80.1);
    const hitter = rowsFromSeasonAthletes('mlb', [{
      athlete: { id: '4', shortName: 'A. Judge', position: { abbreviation: 'RF' } },
      categories: [
        { name: 'batting', totals: ['500', '140', '45', '100', '6', '180'] },
      ],
    }], [
      { name: 'batting', names: ['atBats', 'hits', 'homeRuns', 'RBIs', 'stolenBases', 'strikeouts'] },
      { name: 'pitching', names: ['innings', 'strikeouts'] },
    ]);
    assert.deepEqual(hitter.map((row) => row.line), ['hitting']);
  });

  it('merges a hitter list with a separate pitcher list', () => {
    const schema = [
      { name: 'batting', names: ['atBats', 'hits', 'homeRuns', 'RBIs', 'stolenBases'] },
      { name: 'pitching', names: ['innings', 'strikeouts'] },
    ];
    const merged = mergeSeasonAthletes([[{
      athlete: { id: '27', shortName: 'S. Ohtani' },
      categories: [
        { name: 'batting', totals: ['400', '120', '40', '90', '12'] },
        { name: 'pitching', totals: ['-', '-'] },
      ],
    }], [{
      athlete: { id: '27', shortName: 'S. Ohtani' },
      categories: [
        { name: 'batting', totals: ['-', '-', '-', '-', '-'] },
        { name: 'pitching', totals: ['80.1', '95'] },
      ],
    }]]);
    const rows = rowsFromSeasonAthletes('mlb', merged, schema);
    assert.deepEqual(rows.map((row) => [row.line, row.line === 'hitting' ? row.homeRuns : row.strikeouts]), [
      ['hitting', 40],
      ['pitching', 95],
    ]);
  });

  it('reads hits and blocks from a skater statistics payload', () => {
    const extra = nhlHitBlock({
      splits: {
        categories: [{
          name: 'defensive',
          stats: [
            { name: 'hits', value: 105 },
            { name: 'blockedShots', displayValue: '8' },
          ],
        }],
      },
    });
    assert.deepEqual(extra, { hits: 105, blocks: 8 });
  });
});
