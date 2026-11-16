import test from 'node:test';
import assert from 'node:assert/strict';
import { nextHistoryStack, rememberHistory } from './historyStack.js';

const loc = (key) => ({ key, pathname: `/${key}` });

test('a new visit keeps the pages behind it and drops the ones ahead', () => {
  const first = nextHistoryStack([], 0, loc('home'), 'PUSH');
  const second = nextHistoryStack(first.pages, first.index, loc('scores'), 'PUSH');
  const back = nextHistoryStack(second.pages, second.index, loc('home'), 'POP');
  const next = nextHistoryStack(back.pages, back.index, loc('team'), 'PUSH');
  assert.deepEqual(next.pages.map((page) => page.key), ['home', 'team']);
  assert.equal(next.index, 1);
});

test('back and forward return the same page entry', () => {
  const first = nextHistoryStack([], 0, loc('home'), 'PUSH');
  const second = nextHistoryStack(first.pages, first.index, loc('game'), 'PUSH');
  const back = nextHistoryStack(second.pages, second.index, loc('home'), 'POP');
  const forward = nextHistoryStack(back.pages, back.index, loc('game'), 'POP');
  assert.equal(back.index, 0);
  assert.equal(forward.index, 1);
  assert.equal(forward.pages[1], second.pages[1]);
});

test('replace updates the current page and leaves the rest', () => {
  const first = nextHistoryStack([], 0, loc('home'), 'PUSH');
  const second = nextHistoryStack(first.pages, first.index, loc('stats'), 'PUSH');
  const third = nextHistoryStack(second.pages, second.index, loc('player'), 'PUSH');
  const back = nextHistoryStack(third.pages, third.index, loc('stats'), 'POP');
  const replaced = nextHistoryStack(back.pages, back.index, loc('stats-nba'), 'REPLACE');
  assert.deepEqual(replaced.pages.map((page) => page.key), ['home', 'stats-nba', 'player']);
  assert.equal(replaced.index, 1);
});

test('the stack forgets the oldest page once it is past the limit', () => {
  let pages = [];
  let index = 0;
  for (let i = 0; i < 4; i += 1) {
    ({ pages, index } = nextHistoryStack(pages, index, loc(String(i)), 'PUSH', 3));
  }
  assert.deepEqual(pages.map((page) => page.key), ['1', '2', '3']);
  assert.equal(index, 2);
});

test('rememberHistory ignores a repeat render of the same entry', () => {
  const home = loc('home');
  const first = rememberHistory(null, home, 'POP');
  const again = rememberHistory(first, home, 'POP');
  assert.equal(again, first);
});
