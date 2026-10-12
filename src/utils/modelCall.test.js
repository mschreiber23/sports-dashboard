import assert from 'node:assert/strict';
import test from 'node:test';
import { callGrade, modelSide, sideQuote, stampPrediction } from './modelCall.js';

test('a Yes that clears the line is a hit', () => {
  assert.equal(callGrade({ prediction: 'yes', result: 'hit' }), 'hit');
  assert.equal(callGrade({ prediction: 'yes', result: 'miss' }), 'miss');
});

test('a No that stays under the line is a hit', () => {
  assert.equal(callGrade({ prediction: 'no', result: 'miss' }), 'hit');
  assert.equal(callGrade({ prediction: 'no', result: 'hit' }), 'miss');
});

test('an edge of 4 points or more on the No side is a No', () => {
  assert.equal(modelSide({ edge: -0.11, result: 'miss' }), 'no');
  assert.equal(callGrade({ edge: -0.11, result: 'miss' }), 'hit');
  assert.equal(stampPrediction({ edge: -0.05 }).prediction, 'no');
});

test('a smaller edge stays a Yes', () => {
  assert.equal(modelSide({ edge: -0.02 }), 'yes');
  assert.equal(stampPrediction({ edge: 0.08 }).prediction, 'yes');
  assert.equal(callGrade({ result: 'void' }), 'void');
});

test('a 70% No with a small edge is not a bet', () => {
  const read = { modelP: 0.28, price: 0.3, edge: -0.02, result: 'miss' };
  assert.equal(modelSide(read), null);
  assert.equal(callGrade(read), null);
});

test('a No at 52% with a 10-point edge is a hit when the line misses', () => {
  const read = { modelP: 0.38, price: 0.48, edge: -0.1, result: 'miss' };
  assert.equal(modelSide(read), 'no');
  assert.equal(callGrade(read), 'hit');
});

test('a No card quotes the No side, not the Yes price', () => {
  const quote = sideQuote({ modelP: 0.38, price: 0.48, edge: -0.1, result: 'hit' });
  assert.equal(quote.side, 'no');
  assert.ok(Math.abs(quote.modelP - 0.62) < 1e-9);
  assert.ok(Math.abs(quote.price - 0.52) < 1e-9);
  assert.ok(Math.abs(quote.edge - 0.1) < 1e-9);
  assert.equal(callGrade({ modelP: 0.38, price: 0.48, edge: -0.1, result: 'hit' }), 'miss');
});
