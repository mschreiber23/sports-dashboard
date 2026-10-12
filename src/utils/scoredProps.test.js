import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReads, ledgerReport, refreshReads } from './propReads.js';
import { accuracyReport, stakeForUnit } from './propBook.js';
import { learnCalibration } from './propCalibration.js';
import { BET_PRICE_MAX, countsInScore } from './scoredProps.js';

const goal = {
  league: 'nhl',
  propType: 'hockey_player_goals',
  result: 'miss',
  prediction: 'yes',
  modelP: 0.32,
  baseP: 0.32,
  price: 0.25,
  edge: 0.07,
  gameStart: 1_700_000_000_000,
  player: 'Scorer',
};

const points = {
  league: 'nhl',
  propType: 'hockey_player_points',
  result: 'hit',
  prediction: 'yes',
  modelP: 0.6,
  baseP: 0.6,
  price: 0.5,
  edge: 0.1,
  gameStart: 1_700_000_000_000,
  player: 'Playmaker',
  line: 1,
};

test('a graded goal prop stays out of the score and a points prop still counts', () => {
  const rows = [goal, points];
  const ledger = ledgerReport(rows);
  assert.equal(ledger.graded, 1);
  assert.equal(ledger.callHits, 1);
  assert.equal(ledger.hits, 1);

  const accuracy = accuracyReport(rows);
  assert.equal(accuracy.graded, 1);
  assert.equal(accuracy.hits, 1);
  assert.equal(accuracy.misses, 0);
  assert.equal(accuracy.sports.find((sport) => sport.league === 'nhl').graded, 1);

  const fit = learnCalibration(rows);
  assert.equal(fit.nhl.graded, 1);
});

test('a day’s accuracy record does not include earlier days', () => {
  const first = {
    ...points,
    id: 'day-one',
    gameStart: Date.parse('2026-10-05T23:00:00Z'),
    result: 'hit',
  };
  const second = {
    ...points,
    id: 'day-two',
    player: 'Next',
    gameStart: Date.parse('2026-10-06T23:00:00Z'),
    result: 'miss',
    modelP: 0.62,
    price: 0.5,
    edge: 0.12,
  };
  const sport = accuracyReport([first, second]).sports.find((item) => item.league === 'nhl');
  assert.equal(sport.series.length, 2);
  assert.equal(sport.series[0].dayHits, 1);
  assert.equal(sport.series[0].dayCount, 1);
  assert.equal(sport.series[0].hits, 1);
  assert.equal(sport.series[0].graded, 1);
  assert.equal(sport.series[1].dayHits, 0);
  assert.equal(sport.series[1].dayCount, 1);
  assert.equal(sport.series[1].hits, 1);
  assert.equal(sport.series[1].graded, 2);
});

test('a 2+ points No stays out and the 1+ line still counts', () => {
  const two = {
    ...points,
    id: 'two',
    player: 'Depth',
    line: 2,
    propLabel: '2+ points',
    price: 0.18,
    modelP: 0.15,
    edge: -0.03,
    result: 'miss',
    prediction: 'no',
  };
  const ledger = ledgerReport([two, points]);
  assert.equal(ledger.graded, 1);
  assert.equal(ledger.callHits, 1);
  const next = refreshReads([two, points], []);
  assert.deepEqual(next.map((row) => row.line), [1]);
});

test('winning $25 cannot cost more than $36', () => {
  assert.ok(stakeForUnit(BET_PRICE_MAX, 25) <= 36);
  assert.ok(stakeForUnit(0.574, 25) > 36);
  const favorite = {
    ...points,
    id: '58',
    player: 'Favorite',
    price: 0.58,
    modelP: 0.64,
    edge: 0.06,
  };
  const fair = {
    ...points,
    id: '57',
    player: 'Fair',
    price: 0.57,
    modelP: 0.62,
    edge: 0.05,
  };
  const noFavorite = {
    ...points,
    id: 'no58',
    player: 'NoFavorite',
    price: 0.42,
    modelP: 0.36,
    edge: -0.06,
    result: 'miss',
  };
  assert.equal(countsInScore(favorite), false);
  assert.equal(countsInScore(fair), true);
  assert.equal(countsInScore(noFavorite), false);
  const ledger = ledgerReport([favorite, fair, noFavorite, points]);
  assert.equal(ledger.graded, 2);
  assert.equal(ledger.callHits, 2);
});

test('a 70% No touchdown stays out and a 52% No with an edge still counts', () => {
  const favorite = {
    ...points,
    id: 'td',
    player: 'Johnson',
    propType: 'football_player_touchdowns',
    propLabel: '1+ touchdowns',
    modelP: 0.28,
    price: 0.3,
    edge: -0.02,
    result: 'miss',
    prediction: 'no',
  };
  const priced = {
    ...points,
    id: 'fair',
    player: 'Vele',
    modelP: 0.35,
    price: 0.49,
    edge: -0.14,
    result: 'miss',
    prediction: 'no',
  };
  const ledger = ledgerReport([favorite, priced, points]);
  assert.equal(ledger.graded, 2);
  assert.equal(ledger.callHits, 2);
});

test('a 2% quote and a 93% empty-book ask stay out of the score', () => {
  const penny = { ...points, id: 'penny', player: 'Depth', price: 0.02, modelP: 0.24, edge: 0.22, result: 'miss' };
  const stub = { ...points, id: 'stub', player: 'Amadio', price: 0.93, modelP: 0.38, edge: -0.55, result: 'hit' };
  const ledger = ledgerReport([penny, stub, points]);
  assert.equal(ledger.graded, 1);
  assert.equal(ledger.callHits, 1);
  const next = refreshReads([penny, stub, points], []);
  assert.deepEqual(next.map((row) => row.player), ['Playmaker']);
});

test('refreshing the log drops a goal read that was already saved', () => {
  const next = refreshReads([goal, points], []);
  assert.deepEqual(next.map((row) => row.propType), ['hockey_player_points']);
});

test('new reads skip goal props and keep point props', () => {
  const now = Date.now();
  const gameStart = now + 60_000;
  const recent = [1, 0, 1, 0, 1];
  const player = 'A';
  const logs = {
    [`nhl|${player}|${gameStart}`]: {
      series: {
        hockey_player_goals: recent,
        hockey_player_points: recent,
      },
    },
  };
  const row = (type, yes, line = 1) => ({
    section: 'player',
    player,
    type,
    line,
    yes,
    gameStart,
    teamName: 'X',
    opponentName: 'Y',
  });
  const reads = buildReads({
    now,
    logs,
    games: [{
      league: 'nhl',
      key: 'game',
      title: 'X at Y',
      gameStart,
      rows: [
        row('hockey_player_goals', 0.3),
        row('hockey_player_points', 0.45, 1),
        row('hockey_player_points', 0.48, 2),
      ],
    }],
  });
  assert.equal(reads.length, 1);
  assert.equal(reads[0].propType, 'hockey_player_points');
  assert.equal(reads[0].line, 1);
});
