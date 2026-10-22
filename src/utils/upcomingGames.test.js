import assert from 'node:assert/strict';
import test from 'node:test';
import { formatKickoff, gameOnDay, gameOpponent, selectUpcomingGames } from './upcomingGames.js';

const NOW = new Date('2026-10-22T16:00:00Z');

function game(iso, state, id) {
  return {
    id,
    date: iso,
    competitions: [{
      status: { type: { state } },
      competitors: [
        { homeAway: 'away', team: { id: '2', abbreviation: 'BUF', shortDisplayName: 'Sabres' } },
        { homeAway: 'home', team: { id: '23', abbreviation: 'WSH', shortDisplayName: 'Capitals' } },
      ],
    }],
  };
}

const SLATE = [
  game('2026-10-22T23:00:00Z', 'pre', 'today'),
  game('2026-10-23T23:00:00Z', 'post', 'final'),
  game('2026-10-24T23:00:00Z', 'pre', 'sat'),
  game('2026-10-28T23:30:00Z', 'pre', 'wed'),
  game('2026-10-30T00:00:00Z', 'pre', 'thu'),
  game('2026-11-01T20:30:00Z', 'pre', 'sun'),
  game('2026-11-04T00:00:00Z', 'pre', 'tue'),
  game('2026-11-07T17:30:00Z', 'pre', 'later'),
];

test('an off day keeps the next five games that have not been played', () => {
  const next = selectUpcomingGames(SLATE, '20261022', NOW);
  assert.deepEqual(next.map((event) => event.id), ['sat', 'wed', 'thu', 'sun', 'tue']);
});

test('a later day skips games before it', () => {
  const next = selectUpcomingGames(SLATE, '20261028', NOW);
  assert.deepEqual(next.map((event) => event.id), ['thu', 'sun', 'tue', 'later']);
});

test('a past off day skips games that already finished', () => {
  const next = selectUpcomingGames(SLATE, '20261020', NOW);
  assert.equal(next[0].id, 'today');
  assert.equal(next.some((event) => event.id === 'final'), false);
  assert.equal(next.some((event) => event.id === 'sat'), true);
});

test('kickoff reads as an Eastern date and time', () => {
  assert.equal(formatKickoff('2026-10-24T23:00:00Z').label, 'Sat, Oct 24 · 7:00 PM EDT');
});

test('only the game on the selected day counts as playing that day', () => {
  assert.equal(gameOnDay(SLATE[2], '20261022'), null);
  assert.equal(gameOnDay(SLATE[2], '20261024')?.id, 'sat');
});

test('opponent side follows home and away', () => {
  assert.deepEqual(gameOpponent(SLATE[2], '23'), { prefix: 'vs', abbr: 'BUF', name: 'Sabres' });
  assert.equal(gameOpponent(SLATE[2], '2').prefix, '@');
});
