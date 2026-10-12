import assert from 'node:assert/strict';
import test from 'node:test';
import { nflFactorLines, nflPropEdge } from './nflEdge.js';
import { buildRoles, injuryMiss } from '../api/nflInjuries.js';

const RECENT_DAYS = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'];
const PRIOR_DAYS = ['2025-11-02', '2025-11-09', '2025-11-16', '2025-11-23', '2025-11-30', '2025-12-07', '2025-12-14', '2025-12-21'];

function rushRow(date, carries, targets = 2) {
  return {
    date,
    rushAtt: carries,
    rushYds: carries * 4,
    rushTd: 0,
    targets,
    rec: 1,
    recYds: 8,
    recTd: 0,
  };
}

function games(days, carries, targets) {
  return days.map((date) => rushRow(date, carries, targets));
}

function shipleyInput(teammates, role) {
  const carries = [4, 3, 3, 2, 4];
  return {
    type: 'football_player_rushing_yards',
    line: 40,
    recent: carries.map((value) => value * 4),
    prior: Array(8).fill(16),
    recentContext: RECENT_DAYS.map((date, index) => rushRow(date, carries[index])),
    priorContext: games(PRIOR_DAYS, 4),
    marketYes: 0.42,
    teammates,
    role,
  };
}

const barkley = {
  name: 'Saquon Barkley',
  group: 'RB',
  rank: 1,
  miss: 0.4,
  recent: games(RECENT_DAYS, 16, 4),
  prior: games(PRIOR_DAYS, 16, 4),
};

const bigsby = {
  name: 'Tank Bigsby',
  group: 'RB',
  rank: 4,
  miss: 1,
  recent: games(RECENT_DAYS, 8, 2),
  prior: games(PRIOR_DAYS, 8, 2),
};

const pierce = { name: 'Dameon Pierce', group: 'RB', rank: 3, miss: 0 };
const shipleyRole = { miss: 0, group: 'RB', rank: 2 };

test('a backup inherits carries when the backs ahead of him are hurt', () => {
  const healthy = nflPropEdge(shipleyInput([
    { ...barkley, miss: 0 },
    { ...bigsby, miss: 0 },
    pierce,
  ], shipleyRole));
  const hurt = nflPropEdge(shipleyInput([barkley, bigsby, pierce], shipleyRole));
  assert.ok(healthy && hurt);
  assert.ok(hurt.p > healthy.p);
  assert.ok(hurt.tags.includes('Barkley Q'));
  assert.ok(hurt.tags.includes('Bigsby out'));
  const lines = nflFactorLines(shipleyInput([barkley, bigsby, pierce], shipleyRole));
  assert.equal(lines.find((line) => line.label === 'Injuries').value, 'Barkley Q, Bigsby out');
});

test('a hurt quarterback does not add carries for a running back', () => {
  const hurts = {
    name: 'Jalen Hurts',
    group: 'QB',
    rank: 1,
    miss: 1,
    recent: RECENT_DAYS.map((date) => ({ date, passAtt: 32, passYds: 220, completions: 20, passTd: 1, ints: 0 })),
    prior: PRIOR_DAYS.map((date) => ({ date, passAtt: 32, passYds: 220, completions: 20, passTd: 1, ints: 0 })),
  };
  const alone = nflPropEdge(shipleyInput([pierce], shipleyRole));
  const qbOut = nflPropEdge(shipleyInput([hurts, pierce], shipleyRole));
  assert.equal(qbOut.p, alone.p);
  assert.equal(qbOut.tags.some((tag) => tag.includes('Hurts')), false);
});

test('a starter who is back still cuts the backup role', () => {
  const apartDays = RECENT_DAYS;
  const together = {
    ...barkley,
    miss: 0,
    recent: [],
    prior: games(PRIOR_DAYS, 18, 4),
  };
  const input = {
    ...shipleyInput([together, pierce], shipleyRole),
    recent: Array(5).fill(56),
    recentContext: apartDays.map((date) => rushRow(date, 14)),
    priorContext: games(PRIOR_DAYS, 3),
  };
  const model = nflPropEdge(input);
  assert.match(model.tags.join(' '), /Barkley back/);
  const stillTheStarter = nflPropEdge({ ...input, teammates: [pierce], role: shipleyRole });
  assert.ok(model.p < stillTheStarter.p);
});

test('carries already earned while a back was out are not added again', () => {
  const sitting = {
    ...barkley,
    miss: 1,
    recent: [],
    prior: games(PRIOR_DAYS, 16, 4),
  };
  const elevated = {
    ...shipleyInput([sitting, pierce], shipleyRole),
    recent: Array(5).fill(56),
    recentContext: RECENT_DAYS.map((date) => rushRow(date, 14)),
  };
  const withInjury = nflPropEdge(elevated);
  const without = nflPropEdge({ ...elevated, teammates: [pierce] });
  assert.ok(withInjury.p <= without.p + 0.02);
  assert.equal(withInjury.tags.some((tag) => tag.includes('Barkley')), false);
});

test('a player who is himself out loses the carries', () => {
  const active = nflPropEdge(shipleyInput([pierce], shipleyRole));
  const out = nflPropEdge(shipleyInput([pierce], { ...shipleyRole, miss: 1 }));
  assert.ok(out.p < active.p);
  assert.ok(out.tags.includes('Out'));
});

test('depth chart order and injury status become a role', () => {
  assert.equal(injuryMiss('Questionable'), 0.4);
  assert.equal(injuryMiss('Doubtful'), 1);
  assert.equal(injuryMiss('Injured Reserve'), 1);
  assert.equal(injuryMiss('Active'), 0);
  const roles = buildRoles([
    {
      slot: 'rb',
      athletes: [
        { name: 'Saquon Barkley', status: 'Questionable' },
        { name: 'Will Shipley', status: '' },
        { name: 'Dameon Pierce', status: '' },
        { name: 'Tank Bigsby', status: 'Injured Reserve' },
      ],
    },
  ], [
    { name: 'Saquon Barkley', position: 'RB', status: 'Questionable' },
  ]);
  assert.equal(roles.find((role) => role.name === 'Will Shipley').rank, 2);
  assert.equal(roles.find((role) => role.name === 'Saquon Barkley').miss, 0.4);
  assert.equal(roles.find((role) => role.name === 'Tank Bigsby').miss, 1);
  assert.equal(roles.find((role) => role.name === 'Dameon Pierce').miss, 0);
});
