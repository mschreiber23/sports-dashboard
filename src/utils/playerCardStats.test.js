import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSeasonStats, gamesPlayedLine, gamesPlayedValue } from './playerCardStats.js';

test('NBA cards keep the four averages and read games played beside them', () => {
  const stats = {
    _merged: { PTS: '21.5', REB: '10.5', AST: '2.0', STL: '1.0', BLK: '2.0', GP: '2' },
    splits: { categories: [] },
  };
  const lines = extractSeasonStats(stats, 'nba');
  assert.deepEqual(lines.map((line) => line.label), ['PTS', 'REB', 'AST', 'STOCKS']);
  assert.equal(gamesPlayedLine(lines, gamesPlayedValue(stats, 'nba')), '2');
});

test('NHL games played is the skater total, not team games or goals', () => {
  const stats = {
    splits: {
      categories: [
        {
          name: 'general',
          stats: [
            { name: 'games', abbreviation: 'GP', displayValue: '11' },
            { name: 'teamGamesPlayed', abbreviation: 'G', displayValue: '11' },
          ],
        },
        {
          name: 'offensive',
          stats: [
            { name: 'goals', abbreviation: 'G', displayValue: '3' },
            { name: 'assists', abbreviation: 'A', displayValue: '3' },
            { name: 'points', abbreviation: 'PTS', displayValue: '6' },
            { name: 'plusMinus', abbreviation: '+/-', displayValue: '1' },
          ],
        },
      ],
    },
  };
  const lines = extractSeasonStats(stats, 'nhl');
  assert.equal(lines.find((line) => line.label === 'G').value, '3');
  assert.equal(gamesPlayedLine(lines, gamesPlayedValue(stats, 'nhl')), '11');
});

test('a batter uses batting games and a pitcher uses pitching games', () => {
  const batter = {
    splits: {
      categories: [
        { name: 'batting', stats: [{ name: 'gamesPlayed', abbreviation: 'GP', displayValue: '66' }, { name: 'teamGamesPlayed', abbreviation: 'G', displayValue: '161' }, { abbreviation: 'AVG', displayValue: '.300' }, { abbreviation: 'OBP', displayValue: '.400' }, { abbreviation: 'HR', displayValue: '10' }, { abbreviation: 'RBI', displayValue: '40' }] },
        { name: 'fielding', stats: [{ name: 'gamesPlayed', abbreviation: 'GP', displayValue: '59' }] },
      ],
    },
  };
  assert.equal(gamesPlayedValue(batter, 'mlb'), '66');
  const pitcher = {
    splits: {
      categories: [
        { name: 'pitching', stats: [{ name: 'gamesPlayed', abbreviation: 'GP', displayValue: '22' }, { name: 'teamGamesPlayed', abbreviation: 'G', displayValue: '161' }, { abbreviation: 'ERA', displayValue: '3.10' }, { abbreviation: 'WHIP', displayValue: '1.10' }, { abbreviation: 'K', displayValue: '140' }, { abbreviation: 'L', displayValue: '8' }] },
        { name: 'general', stats: [{ abbreviation: 'WINS', displayValue: '10' }] },
      ],
    },
  };
  const lines = extractSeasonStats(pitcher, 'mlb');
  assert.deepEqual(lines.map((line) => line.label), ['W-L', 'ERA', 'WHIP', 'K']);
  assert.equal(gamesPlayedLine(lines, gamesPlayedValue(pitcher, 'mlb')), '22');
});

test('football cards already show games played in the grid', () => {
  const stats = {
    _position: 'QB',
    splits: {
      categories: [
        { name: 'general', stats: [{ name: 'gamesPlayed', abbreviation: 'GP', displayValue: '6' }] },
        { name: 'passing', stats: [{ abbreviation: 'YDS', displayValue: '1800' }, { abbreviation: 'TD', displayValue: '12' }, { abbreviation: 'INT', displayValue: '4' }] },
      ],
    },
  };
  const lines = extractSeasonStats(stats, 'nfl');
  assert.equal(lines[0].label, 'GP');
  assert.equal(lines[0].value, '6');
  assert.equal(gamesPlayedLine(lines, gamesPlayedValue(stats, 'nfl')), null);
});
