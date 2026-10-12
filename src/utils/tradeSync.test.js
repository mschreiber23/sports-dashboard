import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeBooks, preferTrade } from './tradeSync.js';

function trade(id, extra = {}) {
  return {
    id,
    player: id,
    unit: 25,
    price: 0.5,
    payout: 48.32,
    recordedAt: 1,
    ...extra,
  };
}

test('a computer book uploads when the account is empty', () => {
  const computer = [trade('karlsson', { unit: 34.12, price: 0.56, payout: 59.12 })];
  const merged = mergeBooks(computer, [], new Set());
  assert.deepEqual(merged.map((row) => row.id), ['karlsson']);
  assert.equal(merged[0].unit, 34.12);
});

test('a phone with no local trades receives the account book', () => {
  const account = [trade('karlsson'), trade('johnston')];
  const merged = mergeBooks([], account, new Set());
  assert.deepEqual(merged.map((row) => row.id), ['karlsson', 'johnston']);
});

test('a trade removed on the phone stays removed on the computer', () => {
  const seen = new Set(['karlsson', 'johnston']);
  const computer = [trade('karlsson'), trade('johnston')];
  const account = [trade('karlsson')];
  const merged = mergeBooks(computer, account, seen);
  assert.deepEqual(merged.map((row) => row.id), ['karlsson']);
});

test('a trade added on the computer is kept and a new account trade arrives', () => {
  const seen = new Set(['karlsson']);
  const computer = [trade('karlsson'), trade('hagel', { recordedAt: 2 })];
  const account = [trade('karlsson'), trade('point')];
  const merged = mergeBooks(computer, account, seen);
  assert.deepEqual(merged.map((row) => row.id).sort(), ['hagel', 'karlsson', 'point']);
});

test('the later edit wins the stake and the later grade wins the result', () => {
  const local = trade('karlsson', { unit: 40, editedAt: 20, payout: 70 });
  const remote = trade('karlsson', { unit: 34.12, editedAt: 10, result: 'loss', gradedAt: 30, actual: 0 });
  const row = preferTrade(local, remote);
  assert.equal(row.unit, 40);
  assert.equal(row.payout, 70);
  assert.equal(row.result, 'loss');
});
