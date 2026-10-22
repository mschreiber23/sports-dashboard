import assert from 'node:assert/strict';
import test from 'node:test';
import { rosterGroups } from '../api/espn.js';
import {
  buildTeamStatRows,
  depthCharts,
  scheduleOpponentLogo,
  statsByName,
  statsSeasonChoices,
} from './teamStats.js';

const oct2026 = new Date('2026-10-22T18:00:00Z');

test('flat NBA rosters become position groups with a string label', () => {
  const groups = rosterGroups([
    { id: '1', displayName: 'Kyle Kuzma', position: { displayName: 'Forward', abbreviation: 'F' } },
    { id: '2', displayName: 'Ryan Rollins', position: { displayName: 'Guard', abbreviation: 'G' } },
    { id: '3', displayName: 'Giannis Antetokounmpo', position: { displayName: 'Forward', abbreviation: 'F' } },
  ]);
  assert.deepEqual(groups.map((group) => group.position), ['Forward', 'Guard']);
  assert.deepEqual(groups[0].items.map((player) => player.id), ['1', '3']);
  assert.equal(typeof groups[0].position, 'string');
});

test('grouped rosters keep their labels and drop empty groups', () => {
  const groups = rosterGroups([
    { position: 'offense', items: [{ id: '7' }] },
    { position: 'suspended', items: [] },
    { position: { displayName: 'Defense' }, items: [{ id: '8' }] },
  ]);
  assert.deepEqual(groups.map((group) => [group.position, group.items.length]), [
    ['offense', 1],
    ['Defense', 1],
  ]);
});

test('October NBA and NHL stat seasons use the ending year', () => {
  assert.deepEqual(statsSeasonChoices('nba', oct2026).map((choice) => choice.label), [
    '2026-27', '2025-26', '2024-25', '2023-24',
  ]);
  assert.equal(statsSeasonChoices('nba', oct2026)[0].year, 2027);
  assert.equal(statsSeasonChoices('nhl', oct2026)[0].year, 2027);
  assert.deepEqual(statsSeasonChoices('nfl', oct2026).map((choice) => choice.label), [
    '2026', '2025', '2024', '2023',
  ]);
});

test('NBA team stats use per-game names and games played', () => {
  const byName = statsByName({
    splits: {
      categories: [
        {
          name: 'general',
          stats: [
            { name: 'gamesPlayed', abbreviation: 'GP', displayValue: '1' },
            { name: 'avgMinutes', abbreviation: 'MIN', displayValue: '27.0' },
            { name: 'avgRebounds', abbreviation: 'REB', displayValue: '6.0' },
            { name: 'avg48Rebounds', abbreviation: 'REB', displayValue: '10.7' },
          ],
        },
        {
          name: 'offensive',
          stats: [
            { name: 'avgPoints', abbreviation: 'PTS', displayValue: '5.0' },
            { name: 'avg48Points', abbreviation: 'PTS', displayValue: '8.9' },
            { name: 'avgAssists', abbreviation: 'AST', displayValue: '3.0' },
            { name: 'avgTurnovers', abbreviation: 'TO', displayValue: '3.0' },
            { name: 'fieldGoalPct', abbreviation: 'FG%', displayValue: '22.2' },
            { name: 'threePointFieldGoalPct', abbreviation: '3P%', displayValue: '25.0' },
            { name: 'freeThrowPct', abbreviation: 'FT%', displayValue: '0.0' },
          ],
        },
        {
          name: 'defensive',
          stats: [
            { name: 'avgSteals', abbreviation: 'STL', displayValue: '3.0' },
            { name: 'avg48Steals', abbreviation: 'STL', displayValue: '5.3' },
            { name: 'avgBlocks', abbreviation: 'BLK', displayValue: '0.0' },
          ],
        },
      ],
    },
  });
  const { rows } = buildTeamStatRows('nba', 'Players', [
    { id: '3134907', name: 'Kyle Kuzma', pos: 'F', byName },
    { id: '0', name: 'Did Not Play', pos: 'G', byName: { general: { gamesPlayed: '0', avgPoints: '20.0' } } },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stats.G, '1');
  assert.equal(rows[0].stats.PTS, '5.0');
  assert.equal(rows[0].stats.REB, '6.0');
  assert.equal(rows[0].stats.STL, '3.0');
  assert.equal(rows[0].stats['3P%'], '25.0');
});

test('NFL passing uses games played, passing yards, and passer rating', () => {
  const byName = {
    general: { gamesPlayed: '5' },
    passing: {
      completions: '105',
      passingAttempts: '158',
      passingYards: '1,309',
      passingTouchdowns: '9',
      totalTouchdowns: '10',
      interceptions: '3',
      ESPNQBRating: '1849.0',
      QBRating: '103.1',
    },
    rushing: {
      rushingAttempts: '17',
      rushingYards: '57',
      yardsPerRushAttempt: '3.4',
      rushingTouchdowns: '1',
      teamGamesPlayed: '5',
    },
    receiving: { receptions: '0', receivingYards: '0', receivingTargets: '0' },
  };
  const passing = buildTeamStatRows('nfl', 'Passing', [{ id: '3139477', name: 'Patrick Mahomes', pos: 'QB', byName }]);
  assert.deepEqual(passing.rows[0].stats, {
    G: '5', 'C/ATT': '105/158', YDS: '1,309', TD: '9', INT: '3', RTG: '103.1',
  });
  const rushing = buildTeamStatRows('nfl', 'Rushing', [{ id: '3139477', name: 'Patrick Mahomes', pos: 'QB', byName }]);
  assert.equal(rushing.rows[0].stats.CAR, '17');
  assert.equal(rushing.rows[0].stats.YDS, '57');
  assert.equal(rushing.rows[0].stats.TD, '1');
  const receiving = buildTeamStatRows('nfl', 'Receiving', [{ id: '3139477', name: 'Patrick Mahomes', pos: 'QB', byName }]);
  assert.equal(receiving.rows.length, 0);
});

test('NHL skater goals are not team games, and goalie wins come from games played', () => {
  const skater = {
    id: '3114778',
    name: 'Sidney Crosby',
    pos: 'C',
    byName: {
      general: { games: '10', teamGamesPlayed: '10', plusMinus: '2', wins: '0' },
      offensive: { goals: '4', assists: '8', points: '12', shotsTotal: '34', powerPlayGoals: '3', shortHandedGoals: '0', shootoutGoals: '0' },
      penalties: { penaltyMinutes: '2' },
    },
  };
  const goalie = {
    id: '3942459',
    name: 'Daniel Vladar',
    pos: 'G',
    byName: {
      general: { games: '6', teamGamesPlayed: '12', wins: '2', losses: '3' },
      defensive: { avgGoalsAgainst: '3.15', savePct: '.900', shutouts: '0' },
      offensive: { goals: '0', assists: '1', points: '1' },
    },
  };
  const skating = buildTeamStatRows('nhl', 'Skaters', [skater, goalie]);
  assert.deepEqual(skating.rows.map((row) => row.name), ['Sidney Crosby']);
  assert.equal(skating.rows[0].stats.G, '4');
  assert.equal(skating.rows[0].stats.A, '8');
  assert.equal(skating.rows[0].stats.PTS, '12');
  assert.equal(skating.rows[0].stats.SOG, '34');
  assert.equal(skating.rows[0].stats.PIM, '2');
  const goalies = buildTeamStatRows('nhl', 'Goalies', [skater, goalie]);
  assert.deepEqual(goalies.rows[0].stats, {
    GP: '6', W: '2', L: '3', GAA: '3.15', 'SV%': '.900', SO: '0',
  });
});

test('depth charts keep every formation, including NFL offense', () => {
  const charts = depthCharts({
    depthchart: [
      { name: 'Base 4-3 D', positions: { lde: { athletes: [{ id: '1', shortName: 'G. Karlaftis' }] } } },
      { name: 'Special Teams', positions: { pk: { athletes: [{ id: '2', shortName: 'H. Butker' }] } } },
      { name: '3WR 1TE', positions: { wr1: { athletes: [{ id: '3', shortName: 'R. Rice' }] }, qb: { athletes: [] } } },
    ],
  });
  assert.deepEqual(charts.map((chart) => chart.name), ['Base 4-3 D', 'Special Teams', '3WR 1TE']);
  assert.equal(charts[2].rows[0].label, 'WR1');
  assert.equal(charts[0].rows[0].label, 'LDE');
});

test('schedule logos fall back to the logos array', () => {
  assert.equal(scheduleOpponentLogo({ logos: [{ href: 'https://example.com/wsh.png' }] }), 'https://example.com/wsh.png');
  assert.equal(scheduleOpponentLogo({ logo: 'https://example.com/primary.png', logos: [{ href: 'https://example.com/other.png' }] }), 'https://example.com/primary.png');
});
