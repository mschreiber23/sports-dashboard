import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFinishedGames } from './freshPlayerGames.js';
import { extractSeasonStats, gamesPlayedValue } from './playerCardStats.js';

function eventLog({ labels, regular, preseason = [], live = null }) {
  const events = {};
  const row = (game) => {
    events[game.id] = { gameDate: game.date, gameResult: game.result };
    return { eventId: game.id, stats: game.stats };
  };
  const seasonTypes = [
    { displayName: 'Regular Season', categories: [{ events: regular.map(row) }] },
  ];
  if (preseason.length) seasonTypes.push({ displayName: 'Preseason', categories: [{ events: preseason.map(row) }] });
  if (live) seasonTypes[0].categories[0].events.push(row(live));
  return { labels, events, seasonTypes };
}

test('a finished NBA game raises games played and the averages', () => {
  const stats = {
    _merged: { PTS: '16.0', REB: '5.8', AST: '2.3', STL: '1.3', BLK: '0.0', GP: '6' },
    splits: { categories: [] },
  };
  const older = (id, date) => ({ id, date, result: 'W', stats: ['30', '6', '2', '0', '1', '16'] });
  const log = eventLog({
    labels: ['MIN', 'REB', 'AST', 'BLK', 'STL', 'PTS'],
    regular: [
      older('g1', '2026-10-22'),
      older('g2', '2026-10-24'),
      older('g3', '2026-10-26'),
      older('g4', '2026-10-28'),
      older('g5', '2026-10-30'),
      older('g6', '2026-11-01'),
      { id: 'g7', date: '2026-11-10', result: 'L', stats: ['37', '8', '1', '2', '0', '21'] },
    ],
    preseason: [{ id: 'pre', date: '2026-10-10', result: 'W', stats: ['20', '4', '3', '1', '1', '18'] }],
    live: { id: 'live', date: '2026-11-12', result: '', stats: ['12', '4', '2', '0', '0', '10'] },
  });

  const next = applyFinishedGames(stats, log, 'nba');
  assert.equal(gamesPlayedValue(next, 'nba'), '7');
  const lines = extractSeasonStats(next, 'nba');
  const value = (label) => lines.find((line) => line.label === label).value;
  assert.equal(value('PTS'), '16.7');
  assert.equal(value('REB'), '6.1');
  assert.equal(value('AST'), '2.1');
  assert.equal(value('STOCKS'), '1.4');
  assert.equal(stats._merged.GP, '6');
});

test('an official line that is already current stays as published', () => {
  const stats = {
    _merged: { PTS: '16.0', REB: '5.8', AST: '2.3', STL: '1.3', BLK: '0.0', GP: '7' },
    splits: { categories: [] },
  };
  const log = eventLog({
    labels: ['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK'],
    regular: [{ id: 'g1', date: '2026-11-10', result: 'L', stats: ['37', '21', '8', '1', '0', '2'] }],
  });
  assert.equal(applyFinishedGames(stats, log, 'nba'), stats);
});

test('a did-not-play line and an in-progress game do not count', () => {
  const stats = {
    _merged: { PTS: '10.0', REB: '4.0', AST: '2.0', STL: '1.0', BLK: '0.0', GP: '1' },
    splits: { categories: [] },
  };
  const log = eventLog({
    labels: ['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK'],
    regular: [
      { id: 'played', date: '2026-11-01', result: 'W', stats: ['30', '10', '4', '2', '1', '0'] },
      { id: 'dnp', date: '2026-11-08', result: 'L', stats: ['DNP', '0', '0', '0', '0', '0'] },
    ],
    live: { id: 'now', date: '2026-11-10', result: '1st', stats: ['8', '6', '2', '1', '0', '0'] },
  });
  assert.equal(applyFinishedGames(stats, log, 'nba'), stats);
});

test('a finished NFL game updates the passer line, not the second yards column', () => {
  const stats = {
    splits: {
      categories: [
        { name: 'general', stats: [{ name: 'gamesPlayed', abbreviation: 'GP', displayValue: '8' }] },
        { name: 'passing', stats: [
          { abbreviation: 'YDS', displayValue: '2,000' },
          { abbreviation: 'TD', displayValue: '14' },
          { abbreviation: 'INT', displayValue: '6' },
        ] },
      ],
    },
  };
  const stub = (id, date) => ({ id, date, result: 'W', stats: ['10', '1', '0', '0', '0'] });
  const log = eventLog({
    labels: ['YDS', 'TD', 'INT', 'YDS', 'TD'],
    regular: [
      stub('a', '2026-09-07'), stub('b', '2026-09-14'), stub('c', '2026-09-21'), stub('d', '2026-09-28'),
      stub('e', '2026-10-05'), stub('f', '2026-10-12'), stub('g', '2026-10-19'), stub('h', '2026-10-26'),
      { id: 'new', date: '2026-11-02', result: 'W', stats: ['300', '3', '1', '80', '1'] },
    ],
  });
  const next = applyFinishedGames(stats, log, 'nfl', 'QB');
  next._position = 'QB';
  const lines = extractSeasonStats(next, 'nfl');
  const value = (label) => lines.find((line) => line.label === label).value;
  assert.equal(value('GP'), '9');
  assert.equal(value('YDS'), '2,300');
  assert.equal(value('TD'), '17');
  assert.equal(value('INT'), '7');
});

test('a finished NHL game updates the skater totals', () => {
  const stats = {
    splits: {
      categories: [
        { name: 'general', stats: [{ name: 'games', abbreviation: 'GP', displayValue: '10' }, { name: 'teamGamesPlayed', abbreviation: 'G', displayValue: '12' }] },
        { name: 'offensive', stats: [
          { abbreviation: 'G', displayValue: '4' },
          { abbreviation: 'A', displayValue: '6' },
          { abbreviation: 'PTS', displayValue: '10' },
          { abbreviation: '+/-', displayValue: '+3' },
        ] },
      ],
    },
  };
  const stub = (id, date) => ({ id, date, result: 'W', stats: ['18:00', '0', '0', '0', '0'] });
  const regular = Array.from({ length: 10 }, (_, i) => stub(`g${i}`, `2026-10-${String(i + 10).padStart(2, '0')}`));
  regular.push({ id: 'new', date: '2026-11-09', result: 'L', stats: ['21:00', '1', '2', '3', '-1'] });
  const log = eventLog({ labels: ['TOI/G', 'G', 'A', 'PTS', '+/-'], regular });
  const next = applyFinishedGames(stats, log, 'nhl', 'C');
  const lines = extractSeasonStats(next, 'nhl');
  const value = (label) => lines.find((line) => line.label === label).value;
  assert.equal(gamesPlayedValue(next, 'nhl'), '11');
  assert.equal(value('G'), '5');
  assert.equal(value('A'), '8');
  assert.equal(value('PTS'), '13');
  assert.equal(value('+/-'), '+2');
  assert.equal(next.splits.categories[0].stats[1].displayValue, '12');
});

test('a finished goalie game updates the win, shutout, and rates', () => {
  const stats = {
    splits: {
      categories: [
        { name: 'general', stats: [
          { name: 'games', abbreviation: 'GP', displayValue: '5' },
          { name: 'wins', abbreviation: 'WINS', displayValue: '5' },
          { name: 'timeOnIce', abbreviation: 'TOI', displayValue: '306:00' },
        ] },
        { name: 'defensive', stats: [
          { name: 'goalsAgainst', abbreviation: 'GA', displayValue: '10' },
          { name: 'avgGoalsAgainst', abbreviation: 'GAA', displayValue: '1.96' },
          { name: 'shotsAgainst', abbreviation: 'SA', displayValue: '115' },
          { name: 'saves', abbreviation: 'SV', displayValue: '105' },
          { name: 'savePct', abbreviation: 'SV%', displayValue: '.913' },
          { name: 'shutouts', abbreviation: 'SO', displayValue: '1' },
        ] },
      ],
    },
  };
  const stub = (id, date) => ({ id, date, result: 'W', stats: ['1', '60:00', '1', '0', '23', '23', '0'] });
  const regular = Array.from({ length: 5 }, (_, i) => stub(`g${i}`, `2026-10-${String(i + 10).padStart(2, '0')}`));
  regular.push({ id: 'new', date: '2026-11-09', result: 'W', stats: ['1', '60:00', '1', '0', '23', '23', '1'] });
  const log = eventLog({ labels: ['GS', 'TOI/G', 'WINS', 'GA', 'SA', 'SV', 'SO'], regular });
  const next = applyFinishedGames(stats, log, 'nhl', 'G');
  next._position = 'G';
  const lines = extractSeasonStats(next, 'nhl');
  const value = (label) => lines.find((line) => line.label === label).value;
  assert.equal(value('W'), '6');
  assert.equal(value('SO'), '2');
  assert.equal(value('GAA'), '1.64');
  assert.equal(value('SV%'), '.928');
});

test('a finished hitting game updates the slash line', () => {
  const stats = {
    splits: {
      categories: [{
        name: 'batting',
        stats: [
          { name: 'gamesPlayed', abbreviation: 'GP', displayValue: '2' },
          { name: 'hits', abbreviation: 'H', displayValue: '4' },
          { name: 'atBats', abbreviation: 'AB', displayValue: '10' },
          { name: 'homeRuns', abbreviation: 'HR', displayValue: '1' },
          { name: 'RBIs', abbreviation: 'RBI', displayValue: '2' },
          { name: 'walks', abbreviation: 'BB', displayValue: '1' },
          { name: 'hitByPitch', abbreviation: 'HBP', displayValue: '0' },
          { name: 'sacFlies', abbreviation: 'SF', displayValue: '0' },
          { name: 'avg', abbreviation: 'AVG', displayValue: '.400' },
          { name: 'onBasePct', abbreviation: 'OBP', displayValue: '.455' },
        ],
      }],
    },
  };
  const log = eventLog({
    labels: ['AB', 'H', 'HR', 'RBI', 'BB', 'HBP'],
    regular: [
      { id: 'a', date: '2026-04-01', result: 'W', stats: ['4', '2', '0', '1', '0', '0'] },
      { id: 'b', date: '2026-04-02', result: 'L', stats: ['4', '1', '0', '0', '1', '0'] },
      { id: 'c', date: '2026-04-03', result: 'W', stats: ['4', '2', '1', '3', '1', '0'] },
    ],
  });
  const next = applyFinishedGames(stats, log, 'mlb');
  const lines = extractSeasonStats(next, 'mlb');
  const value = (label) => lines.find((line) => line.label === label).value;
  assert.equal(gamesPlayedValue(next, 'mlb'), '3');
  assert.equal(value('AVG'), '.429');
  assert.equal(value('OBP'), '.500');
  assert.equal(value('HR'), '2');
  assert.equal(value('RBI'), '5');
});

test('a finished pitching game updates the record, strikeouts, and rates', () => {
  const stats = {
    splits: {
      categories: [
        { name: 'general', stats: [{ abbreviation: 'WINS', displayValue: '1' }] },
        { name: 'pitching', stats: [
          { name: 'gamesPlayed', abbreviation: 'GP', displayValue: '2' },
          { name: 'strikeouts', abbreviation: 'K', displayValue: '10' },
          { name: 'losses', abbreviation: 'L', displayValue: '1' },
          { name: 'wins', abbreviation: 'W', displayValue: '1' },
          { name: 'hits', abbreviation: 'H', displayValue: '8' },
          { name: 'walks', abbreviation: 'BB', displayValue: '2' },
          { name: 'earnedRuns', abbreviation: 'ER', displayValue: '4' },
          { name: 'innings', abbreviation: 'IP', displayValue: '10.0' },
          { name: 'ERA', abbreviation: 'ERA', displayValue: '3.60' },
          { name: 'WHIP', abbreviation: 'WHIP', displayValue: '1.00' },
        ] },
      ],
    },
  };
  const log = eventLog({
    labels: ['IP', 'H', 'ER', 'BB', 'K', 'Dec'],
    regular: [
      { id: 'a', date: '2026-04-01', result: 'W', stats: ['5.0', '4', '2', '1', '5', 'W(1-0)'] },
      { id: 'b', date: '2026-04-06', result: 'L', stats: ['5.0', '4', '2', '1', '5', 'L(1-1)'] },
      { id: 'c', date: '2026-04-11', result: 'W', stats: ['5.2', '3', '2', '1', '7', 'W(2-1)'] },
    ],
  });
  const next = applyFinishedGames(stats, log, 'mlb');
  const lines = extractSeasonStats(next, 'mlb');
  const value = (label) => lines.find((line) => line.label === label).value;
  assert.equal(gamesPlayedValue(next, 'mlb'), '3');
  assert.equal(value('W-L'), '2-1');
  assert.equal(value('K'), '17');
  assert.equal(value('ERA'), '3.45');
  assert.equal(value('WHIP'), '0.89');
});
