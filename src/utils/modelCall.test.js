import assert from 'node:assert/strict';
import test from 'node:test';
import { callGrade, modelSide, stampPrediction } from './modelCall.js';

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
