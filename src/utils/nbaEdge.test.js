import assert from 'node:assert/strict';
import test from 'node:test';
import { espnAbbr } from '../api/teamForm.js';
import { gameEnvironment, lineCardModel } from './gameLineEdge.js';
import { nbaFactorLines, nbaPropEdge } from './nbaEdge.js';

function row(min, fga, pts, extra = {}) {
  return {
    date: extra.date || '2026-01-02',
    min,
    fga,
    pts,
    tpa: extra.tpa ?? 6,
    tpm: extra.tpm ?? 2,
    reb: extra.reb ?? 6,
    ast: extra.ast ?? 5,
    pf: extra.pf ?? 2,
    stl: extra.stl ?? 1,
    blk: extra.blk ?? 0.5,
  };
}

function stretch(count, min, fga, pts, start, extra) {
  return Array.from({ length: count }, (_, index) => row(min, fga, pts, {
    ...extra,
    date: `2026-01-${String(start + index).padStart(2, '0')}`,
  }));
}

const base = {
  type: 'basketball_player_points',
  line: 20.5,
  recent: [22, 18, 24, 16, 21, 19, 23, 17, 20, 22],
  prior: [21, 18, 19, 24, 16, 22, 20, 17],
  marketYes: 0.5,
  teamName: 'Celtics',
  opponentName: 'Wizards',
  playerName: 'Jayson Tatum',
};

test('a jump in minutes raises the points projection before the attempts catch up', () => {
  const flat = nbaPropEdge({
    ...base,
    recentContext: stretch(10, 24, 12, 16, 1),
    priorContext: stretch(8, 24, 12, 16, 11),
  });
  const recent = stretch(7, 24, 12, 16, 1).concat(stretch(3, 34, 12, 16, 8));
  const jumped = nbaPropEdge({
    ...base,
    recentContext: recent,
    priorContext: stretch(8, 24, 12, 16, 11),
  });
  assert.ok(flat && jumped);
  assert.ok(jumped.proj > flat.proj, `flat ${flat.proj} jumped ${jumped.proj}`);
  assert.ok(jumped.p > flat.p);
  assert.ok(jumped.tags.includes('minutes up'));
});

test('a hot shooting stretch is faded toward a normal rate', () => {
  const hot = nbaPropEdge({
    ...base,
    recentContext: stretch(5, 32, 8, 18, 1),
    priorContext: [],
  });
  assert.ok(hot.proj < 14, hot.proj);
  assert.ok(hot.proj > 8, hot.proj);
  assert.ok(hot.tags.includes('hot shooting'));
  const lines = nbaFactorLines({
    ...base,
    recentContext: stretch(5, 32, 8, 18, 1),
    priorContext: [],
  });
  assert.equal(lines.some((line) => line.label === 'Defender'), false);
  assert.equal(lines.some((line) => /other book/i.test(line.label)), false);
});

test('a double-digit spread trims a high-minute player', () => {
  const context = {
    recentContext: stretch(10, 34, 18, 24, 1),
    priorContext: stretch(8, 34, 18, 24, 11),
  };
  const calm = nbaPropEdge({ ...base, ...context, spreadLabel: 'Celtics -3.5' });
  const blowout = nbaPropEdge({ ...base, ...context, spreadLabel: 'Celtics -15.5' });
  assert.ok(blowout.proj < calm.proj);
  assert.ok(blowout.tags.includes('blowout'));
  assert.equal(calm.tags.includes('blowout'), false);
});

test('a back-to-back lowers the points chance', () => {
  const context = {
    recentContext: stretch(10, 32, 16, 22, 1),
    priorContext: stretch(8, 32, 16, 22, 11),
  };
  const rested = nbaPropEdge({
    ...base,
    ...context,
    lastPlayed: Date.parse('2026-04-01T00:00:00Z'),
    gameStart: Date.parse('2026-04-03T00:00:00Z'),
  });
  const tired = nbaPropEdge({
    ...base,
    ...context,
    lastPlayed: Date.parse('2026-04-02T00:00:00Z'),
    gameStart: Date.parse('2026-04-02T20:00:00Z'),
  });
  assert.ok(tired.p < rested.p);
  assert.ok(tired.tags.includes('back to back'));
});

test('a player listed out is capped and a missing log does not produce NaN', () => {
  const out = nbaPropEdge({
    ...base,
    recentContext: stretch(10, 34, 20, 28, 1),
    priorContext: stretch(8, 34, 20, 28, 11),
    absences: [{ name: 'Jayson Tatum', status: 'out' }],
  });
  assert.ok(out.p <= 0.12);
  assert.ok(out.tags.includes('out'));

  const bare = nbaPropEdge({ ...base });
  assert.equal(Number.isFinite(bare.p), true);
  assert.equal(bare.proj ?? null, null);
  const lines = nbaFactorLines(base);
  assert.equal(lines.some((line) => line.label === 'Pace'), false);
  assert.equal(lines.some((line) => line.id === 'l10'), true);
});

test('threes use three-point attempts and a faded percentage', () => {
  const edge = nbaPropEdge({
    ...base,
    type: 'basketball_player_threes',
    line: 2.5,
    recent: [3, 2, 4, 1, 2, 3, 2, 1, 3, 2],
    prior: [2, 1, 3, 2, 2, 1, 3, 2],
    recentContext: stretch(10, 32, 16, 22, 1, { tpa: 8, tpm: 3 }),
    priorContext: stretch(8, 32, 16, 22, 11, { tpa: 8, tpm: 3 }),
  });
  assert.ok(edge.proj > 1.5 && edge.proj < 5, edge.proj);
  const lines = nbaFactorLines({
    ...base,
    type: 'basketball_player_threes',
    line: 2.5,
    recentContext: stretch(10, 32, 16, 22, 1, { tpa: 8, tpm: 3 }),
    priorContext: stretch(8, 32, 16, 22, 11, { tpa: 8, tpm: 3 }),
  });
  assert.equal(lines.some((line) => line.label === '3PA'), true);
  assert.equal(lines.some((line) => line.label === 'Shooting'), true);
});

function scored(count, gf, ga) {
  return Array.from({ length: count }, () => ({ gf, ga, weight: 1 }));
}

test('an nba game projects team points instead of a football cap', () => {
  const env = gameEnvironment({
    league: 'nba',
    homeGames: scored(8, 120, 110),
    awayGames: scored(8, 108, 112),
    homeName: 'Celtics',
    awayName: 'Wizards',
    homeAbbr: 'BOS',
    awayAbbr: 'WSH',
    homeRows: [{ date: Date.parse('2026-04-01T00:00:00Z'), done: true, opp: 'WSH' }],
    awayRows: [{ date: Date.parse('2026-04-02T00:00:00Z'), done: true, opp: 'BOS' }],
    gameStart: Date.parse('2026-04-02T23:00:00Z'),
  });
  assert.ok(env.homeEG > 100, env.homeEG);
  assert.ok(env.homeEG + env.awayEG > 200);
  assert.ok(env.homeP > 0.5);
  assert.equal(env.factors.some((line) => line.label === 'BOS'), true);
  assert.equal(env.factors.some((line) => line.value === 'Back to back'), true);

  const favorite = lineCardModel({
    sideText: 'spread',
    player: 'Celtics -6.5',
    marketP: 0.5,
    line: 6.5,
  }, env);
  const dog = lineCardModel({
    sideText: 'spread',
    player: 'Wizards +6.5',
    marketP: 0.5,
    line: 6.5,
  }, env);
  assert.ok(dog[1].value > favorite[1].value || dog.find((chip) => chip.label === 'Model').value !== favorite.find((chip) => chip.label === 'Model').value);
  const dogCover = Number(dog.find((chip) => chip.label === 'Model').value.replace(/\D/g, ''));
  const favCover = Number(favorite.find((chip) => chip.label === 'Model').value.replace(/\D/g, ''));
  assert.ok(dogCover > favCover, `${dogCover} vs ${favCover}`);

  const team = lineCardModel({
    type: 'basketball_team_total_points',
    teamName: 'Wizards',
    line: 126.5,
    yes: 0.45,
    marketP: 0.45,
  }, env);
  assert.ok(team.some((chip) => chip.label === 'Proj'));
  const over = Number(team.find((chip) => chip.label === 'Model').value.replace(/\D/g, ''));
  assert.ok(over < 50, over);
});

test('nba schedule abbreviations stay off the hockey codes', () => {
  assert.equal(espnAbbr('GSW', 'nba'), 'GS');
  assert.equal(espnAbbr('PHO', 'nba'), 'PHX');
  assert.equal(espnAbbr('UTA', 'nba'), 'UTAH');
  assert.equal(espnAbbr('UTA', 'nhl'), 'UTA');
  assert.equal(espnAbbr('WAS', 'nba'), 'WSH');
});
