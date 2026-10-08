import assert from 'node:assert/strict';
import test from 'node:test';
import { leadersSeasonYear, nhlSeasonYear } from './espn.js';

test('October 2026 is the 2027 NHL season', () => {
  assert.equal(nhlSeasonYear(new Date('2026-10-05T16:00:00Z')), 2027);
});

test('January stays on the season already underway', () => {
  assert.equal(nhlSeasonYear(new Date('2027-01-15T16:00:00Z')), 2027);
});

test('August is still the season that ended in the spring', () => {
  assert.equal(nhlSeasonYear(new Date('2026-08-01T16:00:00Z')), 2026);
});

test('NHL leaders use the season that is underway', () => {
  assert.equal(leadersSeasonYear('nhl', new Date('2026-10-08T16:00:00Z')), 2027);
  assert.equal(leadersSeasonYear('mlb', new Date('2026-10-08T16:00:00Z')), 2026);
});
