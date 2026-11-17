import assert from 'node:assert/strict';
import test from 'node:test';
import { nflGameStatMap, nflHomeLines, nflLogColumns, nflLogStats, nflPositionGroup, nflSeasonStatMap } from './nflCardStats.js';

function stat(name, abbreviation, displayValue) {
  return { name, abbreviation, displayValue };
}

test('each football position uses its own categories', () => {
  assert.equal(nflPositionGroup('QB'), 'qb');
  assert.equal(nflPositionGroup('FB'), 'rb');
  assert.equal(nflPositionGroup('WR'), 'wr');
  assert.equal(nflPositionGroup('TE'), 'te');
  assert.equal(nflPositionGroup('LB'), 'def');
  assert.equal(nflPositionGroup('CB'), 'def');
  assert.equal(nflPositionGroup('DE'), 'def');
  assert.equal(nflPositionGroup('PK'), 'k');
  assert.equal(nflPositionGroup('P'), 'p');
  assert.equal(nflPositionGroup('OT'), null);
});

test('a quarterback card uses passing yards and passing touchdowns', () => {
  const categories = [
    { name: 'general', stats: [stat('gamesPlayed', 'GP', '8')] },
    { name: 'passing', stats: [
      stat('passingYards', 'YDS', '2,037'),
      stat('passingTouchdowns', 'TD', '14'),
      stat('interceptions', 'INT', '4'),
      stat('completions', 'CMP', '177'),
      stat('passingAttempts', 'ATT', '263'),
      stat('totalTouchdowns', 'TD', '15'),
      stat('totalYardsFromScrimmage', 'CMP', '85'),
    ] },
    { name: 'rushing', stats: [
      stat('rushingAttempts', 'CAR', '23'),
      stat('rushingYards', 'YDS', '85'),
      stat('rushingTouchdowns', 'TD', '1'),
      stat('totalTouchdowns', 'TD', '15'),
    ] },
  ];
  const map = nflSeasonStatMap(categories, 'QB');
  assert.equal(map.YDS, '2,037');
  assert.equal(map.TD, '14');
  assert.equal(map.INT, '4');
  assert.equal(map['C/ATT'], '177/263');
  assert.equal(map.RYDS, '85');
  assert.equal(map.RTD, '1');
  assert.deepEqual(nflHomeLines({ _position: 'QB', splits: { categories } }).map((line) => line.value), ['8', '2,037', '14', '4']);
});

test('a back uses rushing and a receiver uses receiving', () => {
  const categories = [
    { name: 'general', stats: [stat('gamesPlayed', 'GP', '8')] },
    { name: 'rushing', stats: [
      stat('rushingAttempts', 'CAR', '22'),
      stat('rushingYards', 'YDS', '101'),
      stat('rushingTouchdowns', 'TD', '0'),
      stat('totalYards', 'TYDS', '171'),
      stat('totalTouchdowns', 'TD', '2'),
    ] },
    { name: 'receiving', stats: [
      stat('receptions', 'REC', '6'),
      stat('receivingTargets', 'TGTS', '7'),
      stat('receivingYards', 'YDS', '70'),
      stat('receivingTouchdowns', 'TD', '2'),
      stat('totalTouchdowns', 'TD', '2'),
    ] },
  ];
  const back = nflSeasonStatMap(categories, 'RB');
  assert.equal(back.YDS, '101');
  assert.equal(back.TD, '0');
  assert.equal(back.RECYDS, '70');
  assert.equal(back.RECTD, '2');
  const end = nflSeasonStatMap(categories, 'TE');
  assert.equal(end.REC, '6');
  assert.equal(end.RECYDS, '70');
  assert.equal(end.CAR, undefined);
});

test('a defender, kicker, and punter do not get receiving stats', () => {
  const defender = nflSeasonStatMap([
    { name: 'general', stats: [stat('gamesPlayed', 'GP', '8'), stat('fumblesForced', 'FF', '2')] },
    { name: 'defensive', stats: [
      stat('totalTackles', 'TOT', '16'),
      stat('soloTackles', 'SOLO', '6'),
      stat('sacks', 'SACK', '0'),
      stat('tacklesForLoss', 'TFL', '1'),
      stat('passesDefended', 'PD', '0'),
    ] },
    { name: 'defensiveInterceptions', stats: [stat('interceptions', 'INT', '1')] },
    { name: 'receiving', stats: [stat('receivingYards', 'YDS', '0'), stat('receptions', 'REC', '0')] },
  ], 'LB');
  assert.equal(defender.TOT, '16');
  assert.equal(defender.SACK, '0');
  assert.equal(defender.INT, '1');
  assert.equal(defender.REC, undefined);
  assert.deepEqual(nflHomeLines({ _position: 'CB', splits: { categories: [
    { name: 'general', stats: [stat('gamesPlayed', 'GP', '5')] },
    { name: 'defensive', stats: [stat('totalTackles', 'TOT', '4'), stat('sacks', 'SACK', '0')] },
    { name: 'defensiveInterceptions', stats: [stat('interceptions', 'INT', '0')] },
  ] } }).map((line) => `${line.label}:${line.value}`), ['GP:5', 'TOT:4', 'SACK:0', 'INT:0']);

  const kicker = nflSeasonStatMap([
    { name: 'general', stats: [stat('gamesPlayed', 'GP', '8')] },
    { name: 'kicking', stats: [
      stat('fieldGoalsMade', 'FGM', '12'),
      stat('fieldGoalAttempts', 'FGA', '19'),
      stat('fieldGoalPct', 'FG%', '63.2'),
      stat('longFieldGoalMade', 'LNG', '50'),
      stat('extraPointsMade', 'XPM', '22'),
      stat('extraPointAttempts', 'XPA', '23'),
      stat('totalKickingPoints', 'PTS', '58'),
    ] },
    { name: 'receiving', stats: [stat('receivingYards', 'YDS', '0')] },
  ], 'PK');
  assert.equal(kicker.FG, '12/19');
  assert.equal(kicker.XP, '22/23');
  assert.equal(kicker.PTS, '58');
  assert.equal(kicker.YDS, undefined);

  const punter = nflSeasonStatMap([
    { name: 'punting', stats: [
      stat('avgPuntReturnYards', 'AVG', '15.6'),
      stat('grossAvgPuntYards', 'AVG', '50.8'),
      stat('punts', 'PUNTS', '25'),
      stat('puntsInside20', 'IN20', '12'),
      stat('touchbacks', 'TB', '5'),
      stat('longPunt', 'LNG', '69'),
    ] },
  ], 'P');
  assert.equal(punter.NO, '25');
  assert.equal(punter.AVG, '50.8');
  assert.equal(punter.IN20, '12');
});

test('a game line follows the position, including the defensive table', () => {
  const groups = [
    { name: 'passing', labels: ['C/ATT', 'YDS', 'TD', 'INT'], stats: ['22/35', '348', '5', '0'] },
    { name: 'rushing', labels: ['CAR', 'YDS', 'TD'], stats: ['2', '15', '0'] },
    { name: 'receiving', labels: ['REC', 'YDS', 'TD', 'TGTS'], stats: ['6', '70', '2', '7'] },
    { name: 'defensive', labels: ['TOT', 'SOLO', 'SACKS', 'TFL', 'PD'], stats: ['9', '5', '1.5', '1', '1'] },
    { name: 'interceptions', labels: ['INT', 'YDS', 'TD'], stats: ['1', '20', '0'] },
    { name: 'kicking', labels: ['FG', 'PCT', 'LONG', 'XP', 'PTS'], stats: ['2/2', '100.0', '38', '1/1', '7'] },
    { name: 'punting', labels: ['NO', 'YDS', 'AVG', 'TB', 'In 20', 'LONG'], stats: ['7', '355', '50.7', '0', '1', '60'] },
  ];
  assert.equal(nflGameStatMap(groups, 'QB').YDS, '348');
  assert.equal(nflGameStatMap(groups, 'QB').RYDS, '15');
  assert.equal(nflGameStatMap(groups, 'WR').RECYDS, '70');
  assert.equal(nflGameStatMap(groups, 'TE').RECTD, '2');
  assert.equal(nflGameStatMap(groups, 'LB').SACK, '1.5');
  assert.equal(nflGameStatMap(groups, 'S').INT, '1');
  assert.equal(nflGameStatMap(groups, 'LB').REC, undefined);
  assert.equal(nflGameStatMap(groups, 'PK').FG, '2/2');
  assert.equal(nflGameStatMap(groups, 'P').AVG, '50.7');
  assert.equal(nflGameStatMap(groups, 'P').IN20, '1');
  assert.deepEqual(nflGameStatMap(groups, 'OT'), {});
});

test('a game log keeps passing yards when rushing yards share the YDS label', () => {
  const names = ['completions', 'passingAttempts', 'passingYards', 'passingTouchdowns', 'interceptions', 'QBRating', 'rushingAttempts', 'rushingYards', 'rushingTouchdowns'];
  const values = ['22', '35', '348', '5', '0', '135.5', '2', '15', '0'];
  const stats = nflLogStats(names, values, 'QB');
  assert.equal(stats.YDS, '348');
  assert.equal(stats.TD, '5');
  assert.equal(stats.RYDS, '15');
  assert.equal(stats.RTD, '0');
  assert.deepEqual(nflLogColumns('QB'), ['CMP', 'ATT', 'YDS', 'TD', 'INT', 'RTG', 'CAR', 'RYDS', 'RTD']);
});

test('running back, receiver, defender, kicker, and punter logs use their own columns', () => {
  const back = nflLogStats(
    ['rushingAttempts', 'rushingYards', 'yardsPerRushAttempt', 'rushingTouchdowns', 'receptions', 'receivingTargets', 'receivingYards', 'receivingTouchdowns'],
    ['22', '101', '4.6', '0', '6', '7', '70', '2'],
    'RB',
  );
  assert.equal(back.YDS, '101');
  assert.equal(back.RECYDS, '70');
  assert.equal(back.RECTD, '2');

  const receiver = nflLogStats(
    ['receptions', 'receivingTargets', 'receivingYards', 'yardsPerReception', 'receivingTouchdowns', 'rushingYards'],
    ['5', '6', '82', '16.4', '0', '0'],
    'WR',
  );
  assert.equal(receiver.YDS, '82');
  assert.equal(receiver.RYDS, '0');

  const defender = nflLogStats(
    ['totalTackles', 'soloTackles', 'sacks', 'stuffs', 'passesDefended', 'interceptions', 'fumblesForced'],
    ['9', '5', '0', '1', '0', '0', '1'],
    'LB',
  );
  assert.equal(defender.TOT, '9');
  assert.equal(defender.TFL, '1');
  assert.equal(defender.YDS, undefined);
  assert.deepEqual(nflLogColumns('CB'), ['TOT', 'SOLO', 'SACK', 'TFL', 'PD', 'INT', 'FF']);

  const kicker = nflLogStats(
    ['fieldGoalsMade-fieldGoalAttempts', 'fieldGoalPct', 'longFieldGoalMade', 'extraPointsMade-extraPointAttempts', 'totalKickingPoints'],
    ['0-0', '0.0', '0', '5-5', '5'],
    'PK',
  );
  assert.equal(kicker.FG, '0-0');
  assert.equal(kicker.XP, '5-5');
  assert.equal(kicker.PTS, '5');

  const punter = nflLogStats(
    ['punts', 'grossAvgPuntYards', 'longPunt', 'touchbacks', 'puntsInside20', 'puntReturnYards', 'avgPuntReturnYards', 'netAvgPuntYards'],
    ['7', '50.7', '60', '0', '1', '81', '16.2', '39.1'],
    'P',
  );
  assert.equal(punter.AVG, '50.7');
  assert.equal(punter.NET, '39.1');
  assert.equal(punter.NO, '7');
});
