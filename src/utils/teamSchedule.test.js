import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultScheduleMonth, focusScheduleEvent, scheduleMonths } from './teamSchedule.js';

const events = [
  { id: 'oct', date: '2026-10-20T23:00:00Z' },
  { id: 'nov-early', date: '2026-11-02T00:00:00Z' },
  { id: 'nov-today', date: '2026-11-15T20:00:00Z' },
  { id: 'nov-next', date: '2026-11-18T00:00:00Z' },
  { id: 'dec', date: '2026-12-04T00:00:00Z' },
];

test('schedule months stay in order and keep that month’s games', () => {
  const months = scheduleMonths(events);
  assert.deepEqual(months.map((month) => month.label), ['Oct', 'Nov', 'Dec']);
  assert.deepEqual(months[1].events.map((event) => event.id), ['nov-early', 'nov-today', 'nov-next']);
});

test('the current month is selected, and a game today is the scroll target', () => {
  const now = new Date('2026-11-15T18:00:00Z');
  const months = scheduleMonths(events);
  assert.equal(defaultScheduleMonth(months, now), '202611');
  assert.equal(focusScheduleEvent(months[1].events, now).id, 'nov-today');
});

test('a month without today scrolls to the next game, and a missing month moves forward', () => {
  const now = new Date('2026-11-10T18:00:00Z');
  const months = scheduleMonths(events);
  assert.equal(focusScheduleEvent(months[1].events, now).id, 'nov-today');
  const later = scheduleMonths(events.filter((event) => event.id !== 'nov-early' && !event.id.startsWith('nov')));
  assert.equal(defaultScheduleMonth(later, now), '202612');
});
