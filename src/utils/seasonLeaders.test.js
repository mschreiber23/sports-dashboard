import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSeasonAthletes, nhlHitBlock, rowsFromSeasonAthletes } from './seasonLeaders.js';

const nbaSchema = [
  { name: 'general', names: ['gamesPlayed', 'rebounds'] },
  { name: 'offensive', names: ['avgPoints', 'points', 'assists', 'turnovers'] },
  { name: 'defensive', names: ['steals', 'blocks'] },
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
      { name: 'general', totals: [games, totals.rebounds] },
      { name: 'offensive', totals: [totals.avg, totals.points, totals.assists, totals.turnovers] },
      { name: 'defensive', totals: [totals.steals, totals.blocks] },
    ],
  };
}

describe('season leader rows', () => {
  it('uses NBA season totals instead of per-game averages', () => {
    const rows = rowsFromSeasonAthletes('nba', [
      nbaAthlete('1', 'L. Doncic', '10', { rebounds: '78', avg: '39.3', points: '393', assists: '79', turnovers: '50', steals: '20', blocks: '8' }),
      nbaAthlete('2', 'Sat Out', '0', { rebounds: '0', avg: '0', points: '0', assists: '0', turnovers: '0', steals: '0', blocks: '0' }),
    ], nbaSchema);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].points, 393);
    assert.equal(rows[0].rebounds, 78);
    assert.equal(rows[0].assists, 79);
    assert.equal(rows[0].steals, 20);
    assert.equal(rows[0].blocks, 8);
    assert.equal(rows[0].turnovers, 50);
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
    }];
    const rows = rowsFromSeasonAthletes('nfl', [{
      athlete: { id: '15', shortName: 'P. Mahomes', position: { abbreviation: 'QB' } },
      categories: [
        { name: 'passing', totals: ['200', '310', '2400', '18', '6'] },
        { name: 'rushing', totals: ['30', '180', '2', '1'] },
        { name: 'receiving', totals: ['0', '0', '0', '0', '0'] },
      ],
    }], schema);
    const passing = rows.find((row) => row.line === 'passing');
    const rushing = rows.find((row) => row.line === 'rushing');
    assert.equal(passing.passingYards, 2400);
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
