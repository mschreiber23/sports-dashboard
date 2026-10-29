import assert from 'node:assert/strict';
import test from 'node:test';
import { clearRecent, mergeRecent, removeRecentPlayer, viewPlayer } from './recentPlayers.js';

function player(id, sport, name) {
  return { id, sport, name, team: 'BOS', headshot: '', position: 'C', jersey: '88' };
}

test('opening a player puts them first', () => {
  const first = viewPlayer(null, player('1', 'nhl', 'Alex Ovechkin'), 100);
  const next = viewPlayer(first, player('2', 'nba', 'Jayson Tatum'), 200);
  assert.deepEqual(next.players.map((row) => row.name), ['Jayson Tatum', 'Alex Ovechkin']);
});

test('a later open on the phone keeps the desktop name', () => {
  const desktop = viewPlayer(null, player('1', 'nhl', 'Alex Ovechkin'), 100);
  const phone = viewPlayer(null, { id: '1', sport: 'nhl' }, 300);
  const merged = mergeRecent(phone, desktop);
  assert.equal(merged.players.length, 1);
  assert.equal(merged.players[0].name, 'Alex Ovechkin');
  assert.equal(merged.players[0].viewedAt, 300);
});

test('two devices keep the newer order', () => {
  const desktop = viewPlayer(viewPlayer(null, player('1', 'nhl', 'One'), 100), player('2', 'nba', 'Two'), 200);
  const phone = viewPlayer(null, player('1', 'nhl', 'One'), 400);
  const merged = mergeRecent(phone, desktop);
  assert.deepEqual(merged.players.map((row) => row.id), ['1', '2']);
});

test('a clear drops players opened before it', () => {
  const desktop = viewPlayer(null, player('1', 'nhl', 'One'), 100);
  const cleared = clearRecent(desktop, 150);
  const phone = viewPlayer(null, player('1', 'nhl', 'One'), 100);
  const merged = mergeRecent(phone, cleared);
  assert.equal(merged.players.length, 0);
  const after = viewPlayer(cleared, player('2', 'nba', 'Two'), 200);
  const kept = mergeRecent(after, phone);
  assert.deepEqual(kept.players.map((row) => row.name), ['Two']);
});

test('removing a player stays removed on the other device', () => {
  const both = viewPlayer(viewPlayer(null, player('1', 'nhl', 'One'), 100), player('2', 'nba', 'Two'), 120);
  const desktop = removeRecentPlayer(both, '1', 'nhl', 200);
  const merged = mergeRecent(both, desktop);
  assert.deepEqual(merged.players.map((row) => row.id), ['2']);
  const again = viewPlayer(desktop, player('1', 'nhl', 'One'), 300);
  assert.deepEqual(mergeRecent(again, desktop).players.map((row) => row.id), ['1', '2']);
});
