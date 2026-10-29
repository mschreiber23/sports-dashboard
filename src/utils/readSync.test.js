import assert from 'node:assert/strict';
import test from 'node:test';
import { ledgerReport } from './propReads.js';
import { mergeStoredReads, publicReads } from './readSync.js';

function read(extra) {
  return {
    id: 'nhl|game|Player|hockey_player_points|1',
    league: 'nhl',
    propType: 'hockey_player_points',
    line: 1,
    player: 'Player',
    modelP: 0.54,
    baseP: 0.54,
    price: 0.48,
    edge: 0.06,
    prediction: 'yes',
    result: 'hit',
    actual: 2,
    gradedAt: 100,
    pricedAt: 50,
    recordedAt: 40,
    tags: [],
    ...extra,
  };
}

test('a settled phone read keeps its price when the desktop reprices it', () => {
  const phone = read();
  const desktop = read({
    result: null,
    actual: null,
    gradedAt: null,
    modelP: 0.7,
    price: 0.62,
    edge: 0.08,
    pricedAt: 200,
  });
  const merged = mergeStoredReads([desktop], [phone]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].price, 0.48);
  assert.equal(merged[0].modelP, 0.54);
  assert.equal(merged[0].result, 'hit');
  const phoneLedger = ledgerReport([phone]);
  const mergedLedger = ledgerReport(merged);
  assert.equal(mergedLedger.graded, phoneLedger.graded);
  assert.equal(mergedLedger.callRate, phoneLedger.callRate);
  assert.equal(mergedLedger.model, phoneLedger.model);
});

test('a price written after the grade loses to the settled copy', () => {
  const settled = read();
  const rewritten = read({ modelP: 0.7, price: 0.62, edge: 0.08, pricedAt: 180 });
  const merged = mergeStoredReads([rewritten], [settled]);
  assert.equal(merged[0].price, 0.48);
  assert.equal(merged[0].modelP, 0.54);
});

test('an open read keeps the newer price from either device', () => {
  const phone = read({ result: null, gradedAt: null, actual: null, pricedAt: 80, price: 0.46, modelP: 0.52, edge: 0.06 });
  const desktop = read({ result: null, gradedAt: null, actual: null, pricedAt: 120, price: 0.51, modelP: 0.57, edge: 0.06 });
  const merged = mergeStoredReads([phone], [desktop]);
  assert.equal(merged[0].price, 0.51);
  assert.equal(merged[0].modelP, 0.57);
  assert.equal(merged[0].result, null);
});

test('the account copy wins when both devices settled the same grade', () => {
  const phone = read({ modelP: 0.54, price: 0.48, edge: 0.06 });
  const desktop = read({ modelP: 0.61, price: 0.5, edge: 0.11 });
  const merged = mergeStoredReads([desktop], [phone]);
  assert.equal(merged[0].modelP, 0.54);
  assert.equal(merged[0].price, 0.48);
  assert.equal(ledgerReport(merged).model, ledgerReport([phone]).model);
});

test('a read saved on only one device stays in the log', () => {
  const phone = read();
  const desktop = read({ id: 'nba|game|Other|points|1', player: 'Other', league: 'nba' });
  const merged = mergeStoredReads([desktop], [phone]);
  assert.deepEqual(merged.map((row) => row.player).sort(), ['Other', 'Player']);
});

test('a new account keeps the older graded read', () => {
  const older = read({ recordedAt: 40, gradedAt: 100, result: 'hit', modelP: 0.54, price: 0.48 });
  const signup = read({
    recordedAt: 900,
    pricedAt: 900,
    result: null,
    actual: null,
    gradedAt: null,
    modelP: 0.7,
    price: 0.6,
    edge: 0.1,
  });
  const merged = publicReads([older], [signup]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].result, 'hit');
  assert.equal(merged[0].modelP, 0.54);
  assert.equal(merged[0].price, 0.48);
  assert.equal(ledgerReport(merged).graded, 1);
  assert.equal(ledgerReport(merged).callRate, ledgerReport([older]).callRate);
});

test('a one-day account does not erase an older slate', () => {
  const older = read({ id: 'nhl|old|Player|hockey_player_points|1', result: 'hit' });
  const today = read({
    id: 'nhl|today|Player|hockey_player_points|1',
    result: 'miss',
    actual: 0,
    gradedAt: 900,
    recordedAt: 800,
    pricedAt: 700,
  });
  const signup = read({
    id: 'nhl|today|Player|hockey_player_points|1',
    result: null,
    actual: null,
    gradedAt: null,
    recordedAt: 950,
    pricedAt: 950,
    modelP: 0.7,
    price: 0.6,
  });
  const merged = publicReads([older, today], [signup]);
  assert.equal(merged.length, 2);
  const kept = merged.find((row) => row.id.includes('|today|'));
  assert.equal(kept.result, 'miss');
  assert.equal(kept.modelP, 0.54);
  const report = ledgerReport(merged);
  assert.equal(report.graded, 2);
  assert.equal(report.callRate, 0.5);
});

test('copies of the same prop from two accounts keep the graded one', () => {
  const older = read();
  const signup = read({
    result: null,
    actual: null,
    gradedAt: null,
    recordedAt: 900,
    pricedAt: 900,
    modelP: 0.7,
    price: 0.6,
    edge: 0.1,
  });
  const merged = publicReads([older, signup], []);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].result, 'hit');
  assert.equal(merged[0].modelP, 0.54);
  assert.equal(merged[0].price, 0.48);
});

test('a failed shared load leaves the account log in place', () => {
  const own = read({ id: 'nba|game|Other|points|1', player: 'Other', league: 'nba' });
  assert.deepEqual(publicReads(null, [own]), [own]);
});
