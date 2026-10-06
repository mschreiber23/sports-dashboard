import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReads, ledgerReport, refreshReads } from './propReads.js';
import { accuracyReport } from './propBook.js';
import { learnCalibration } from './propCalibration.js';

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
  const row = (type, yes) => ({
    section: 'player',
    player,
    type,
    line: 1,
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
        row('hockey_player_points', 0.55),
      ],
    }],
  });
  assert.equal(reads.length, 1);
  assert.equal(reads[0].propType, 'hockey_player_points');
});
