import assert from 'node:assert/strict';
import test from 'node:test';
import { nhlCardSeasonLabel, nhlGameStatMap, nhlSeasonStatMap } from './nhlCardStats.js';

const LEONARD_LABELS = ['BS', 'HT', 'TK', '+/-', 'TOI', 'PPTOI', 'SHTOI', 'ESTOI', 'SHFT', 'G', 'YTDG', 'A', 'S', 'SM', 'SOG', 'FW', 'FL', 'FO%', 'GV', 'PN', 'PIM'];
const LEONARD_STATS = ['0', '1', '1', '0', '13:23', '1:57', '0:00', '11:26', '17', '1', '3', '0', '2', '0', '0', '0', '0', '0.0', '0', '0', '0'];

test('October belongs to the season that ends the next spring', () => {
  assert.equal(nhlCardSeasonLabel(new Date('2026-10-17T21:00:00Z')), '2026-27');
  assert.equal(nhlCardSeasonLabel(new Date('2026-04-01T16:00:00Z')), '2025-26');
});

test('a skater card reads shots on goal from S, not shootout goals', () => {
  const map = nhlGameStatMap([
    {
      name: 'forwards',
      labels: LEONARD_LABELS,
      athletes: [{ athlete: { id: '5149172' }, stats: LEONARD_STATS }],
    },
    {
      name: 'goalies',
      labels: ['GA', 'SA', 'SV', 'SV%', 'TOI'],
      athletes: [{ athlete: { id: '5149172' }, stats: ['9', '40', '31', '.775', '60:00'] }],
    },
  ], '5149172', false);

  assert.equal(map.G, '1');
  assert.equal(map.A, '0');
  assert.equal(map['+/-'], '0');
  assert.equal(map.S, '2');
  assert.equal(map.SOG, '0');
  assert.equal(map.HT, '1');
  assert.equal(map.BS, '0');
  assert.equal(map.PIM, '0');
  assert.equal(map.TK, '1');
  assert.equal(map.GV, '0');
  assert.equal(map.TOI, '13:23');
});

test('a goalie card stays on the goalie line', () => {
  const map = nhlGameStatMap([
    {
      name: 'forwards',
      labels: LEONARD_LABELS,
      athletes: [{ athlete: { id: '1' }, stats: LEONARD_STATS }],
    },
    {
      name: 'goalies',
      labels: ['GA', 'SA', 'SV', 'SV%', 'TOI'],
      athletes: [{ athlete: { id: '99' }, stats: ['2', '28', '26', '.929', '60:00'] }],
    },
  ], 99, true);

  assert.equal(map.GA, '2');
  assert.equal(map.SA, '28');
  assert.equal(map.SV, '26');
  assert.equal(map['SV%'], '.929');
});

test('season lines use goals and shots, not team games or shootout goals', () => {
  const map = nhlSeasonStatMap([
    { name: 'general', stats: [{ abbreviation: 'G', displayValue: '8' }, { abbreviation: '+/-', displayValue: '1' }, { abbreviation: 'TOI', displayValue: '110:25' }] },
    { name: 'offensive', stats: [{ abbreviation: 'G', displayValue: '3' }, { abbreviation: 'A', displayValue: '4' }, { abbreviation: 'S', displayValue: '19' }, { abbreviation: 'SOG', displayValue: '0' }] },
    { name: 'defensive', stats: [{ abbreviation: 'HT', displayValue: '14' }, { abbreviation: 'BS', displayValue: '2' }] },
    { name: 'penalties', stats: [{ abbreviation: 'PIM', displayValue: '8' }] },
  ], false);

  assert.equal(map.G, '3');
  assert.equal(map.A, '4');
  assert.equal(map.S, '19');
  assert.equal(map['+/-'], '1');
  assert.equal(map.HT, '14');
  assert.equal(map.BS, '2');
  assert.equal(map.PIM, '8');
  assert.equal(map.TOI, '110:25');
});
