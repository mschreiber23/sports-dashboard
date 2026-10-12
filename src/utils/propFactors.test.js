import assert from 'node:assert/strict';
import test from 'node:test';
import { nhlPropEdge } from './nhlEdge.js';
import { nflPropEdge } from './nflEdge.js';
import { readWeather } from '../api/nflWeather.js';
import { goalsAllowed } from '../api/teamForm.js';

function pointRow(date, shots, toi) {
  return { date, shots, goals: 0, assists: 0, toi, pp: 0 };
}

function pointLog(count, shots, toi, start) {
  return Array.from({ length: count }, (_, index) => pointRow(`2026-01-${String(start + index).padStart(2, '0')}`, shots, toi));
}

const points = {
  type: 'hockey_player_points',
  line: 1,
  recent: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  prior: [1, 0, 1, 0, 1, 0, 1, 0],
  marketYes: 0.5,
};

test('a jump in ice time raises the shot projection before the shot totals catch up', () => {
  const flat = nhlPropEdge({
    ...points,
    recentContext: pointLog(10, 2, 14, 1),
    priorContext: pointLog(8, 2, 14, 11),
  });
  const recent = pointLog(7, 2, 14, 1).concat(pointLog(3, 2, 20, 8));
  const jumped = nhlPropEdge({
    ...points,
    recentContext: recent,
    priorContext: pointLog(8, 2, 14, 11),
  });
  assert.ok(flat && jumped);
  assert.ok(jumped.p > flat.p, `flat ${flat.p} jumped ${jumped.p}`);
  assert.ok(jumped.p - flat.p < 0.08, jumped.p - flat.p);
  assert.ok(jumped.tags.includes('ice time up'));
});

test('a defense allowing more goals raises the points chance', () => {
  const context = {
    recentContext: pointLog(10, 3, 16, 1),
    priorContext: pointLog(8, 3, 16, 11),
  };
  const soft = nhlPropEdge({ ...points, ...context, opponentGoalsAgainst: 3.9 });
  const tough = nhlPropEdge({ ...points, ...context, opponentGoalsAgainst: 2.2 });
  assert.ok(soft.p > tough.p);
  assert.ok(soft.tags.includes('soft defense'));
  assert.ok(tough.tags.includes('tough defense'));
});

test('home ice is a small lift over the road', () => {
  const context = {
    recentContext: pointLog(10, 3, 16, 1),
    priorContext: pointLog(8, 3, 16, 11),
  };
  const home = nhlPropEdge({ ...points, ...context, home: true });
  const road = nhlPropEdge({ ...points, ...context, home: false });
  assert.ok(home.p > road.p);
  assert.ok(home.tags.includes('home'));
  assert.ok(road.tags.includes('road'));
  assert.ok(home.p - road.p < 0.04);
});

test('goals allowed needs five recent games', () => {
  assert.equal(goalsAllowed({ recent: [{ ga: 4, weight: 1 }] }), null);
  assert.equal(goalsAllowed({ recent: Array.from({ length: 5 }, () => ({ ga: 4, weight: 1 })) }), 4);
});

function passRow(date) {
  return { date, passAtt: 32, passYds: 230, completions: 21, passTd: 1, ints: 0 };
}

test('a windy outdoor game lowers the passing chance', () => {
  const days = (count, start) => Array.from({ length: count }, (_, index) => passRow(`2026-09-${String(start + index).padStart(2, '0')}`));
  const base = {
    type: 'football_player_passing_yards',
    line: 240,
    recent: Array(10).fill(230),
    prior: Array(8).fill(230),
    recentContext: days(10, 1),
    priorContext: days(8, 12),
    marketYes: 0.55,
  };
  const calm = nflPropEdge(base);
  const wind = nflPropEdge({ ...base, weather: { indoor: false, wind: 18, gust: 24, rain: false, snow: false } });
  const dome = nflPropEdge({ ...base, weather: { indoor: true, wind: 18, gust: 24, rain: false, snow: false } });
  assert.ok(wind.p < calm.p, `wind ${wind.p} calm ${calm.p}`);
  assert.equal(dome.p, calm.p);
  assert.ok(wind.tags.includes('wind'));
});

test('a gust under 20 mph is not treated as sustained wind', () => {
  const read = readWeather({
    weather: { gust: 18, precipitation: 0, conditionId: '36' },
    venue: { indoor: false },
  }, false);
  assert.equal(read.wind, null);
  assert.equal(read.gust, 18);
  assert.equal(read.rain, false);
  const dome = readWeather({ venue: { indoor: true }, weather: { gust: 30 } }, true);
  assert.equal(dome.indoor, true);
});

test('showers are rain, and a precipitation percent on a cloudy icon is not', () => {
  const showers = readWeather({
    weather: { conditionId: '13', precipitation: 51, gust: 27 },
    venue: { indoor: false },
  }, false);
  assert.equal(showers.rain, true);
  assert.equal(showers.snow, false);
  const clouds = readWeather({
    weather: { conditionId: '4', precipitation: 34, gust: 16 },
    venue: { fullName: 'SoFi Stadium', indoor: false },
  }, false);
  assert.equal(clouds.indoor, true);
  assert.equal(clouds.rain, false);
  const flurries = readWeather({
    weather: { conditionId: '19', precipitation: 40, gust: 12 },
    venue: { indoor: false },
  }, false);
  assert.equal(flurries.snow, true);
  assert.equal(flurries.rain, false);
});
