import assert from 'node:assert/strict';
import test from 'node:test';
import { crossedLines, soundLines } from './quoteLadder.js';

function ladder(pairs) {
  return pairs.map(([line, ask]) => ({ line, ask, yes: ask }));
}

test('a 15+ price under a 20+ price is the broken quote', () => {
  const lines = ladder([
    [15, 0.53],
    [20, 0.73],
    [25, 0.37],
    [30, 0.10],
    [35, 0.02],
    [40, 0.04],
  ]);
  const bad = crossedLines(lines);
  assert.deepEqual([...bad].map((line) => line.line), [15, 35]);
  assert.deepEqual(soundLines(lines).map((line) => line.line), [20, 25, 30, 40]);
});

test('a clean ladder and a single line stay whole', () => {
  const lines = ladder([[10, 0.8], [15, 0.55], [20, 0.55], [25, 0.3]]);
  assert.equal(crossedLines(lines).size, 0);
  assert.equal(soundLines(lines).length, 4);
  assert.equal(crossedLines(ladder([[15, 0.53]])).size, 0);
});

test('the same break is the cheap line in football, hockey, and baseball', () => {
  const completions = ladder([[22, 0.52], [24, 0.66], [26, 0.62]]);
  assert.deepEqual(soundLines(completions).map((line) => line.line), [24, 26]);
  const points = ladder([[1, 0.67], [2, 0.34], [3, 0.04], [4, 0.13]]);
  assert.deepEqual(soundLines(points).map((line) => line.line), [1, 2, 4]);
  const outs = ladder([[13, 0.57], [14, 0.62], [15, 0.62], [16, 0.46]]);
  assert.deepEqual(soundLines(outs).map((line) => line.line), [14, 15, 16]);
});
