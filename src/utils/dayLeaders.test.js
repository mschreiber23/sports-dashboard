import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  playersFromBoxscore,
  combinePlayers,
  sortDayLeaders,
  formatLeaderStat,
  playedTime,
} from './dayLeaders.js';

function nbaGame() {
  return {
    competitions: [{
      status: { type: { state: 'in', shortDetail: 'Q3 4:12' } },
      competitors: [
        { homeAway: 'away', team: { id: '6', abbreviation: 'DAL' } },
        { homeAway: 'home', team: { id: '24', abbreviation: 'SA' } },
      ],
    }],
  };
}

function nbaSummary() {
  const keys = ['minutes', 'points', 'rebounds', 'assists', 'turnovers', 'steals', 'blocks'];
  return {
    boxscore: {
      players: [
        {
          team: { id: '6', abbreviation: 'DAL' },
          statistics: [{
            keys,
            athletes: [
              { athlete: { id: '1', shortName: 'D. Gafford', position: { abbreviation: 'C' } }, stats: ['18', '2', '4', '1', '2', '1', '2'] },
              { athlete: { id: '2', shortName: 'Sat Out', position: { abbreviation: 'F' } }, stats: ['0', '0', '0', '0', '0', '0', '0'], didNotPlay: false },
              { athlete: { id: '3', shortName: 'Hurt', position: { abbreviation: 'G' } }, stats: [], didNotPlay: true },
            ],
          }],
        },
        {
          team: { id: '24', abbreviation: 'SA' },
          statistics: [{
            keys,
            athletes: [
              { athlete: { id: '4', shortName: 'V. Wembanyama', position: { abbreviation: 'C' }, headshot: { href: 'https://img/wemby' } }, stats: ['28', '31', '12', '4', '3', '2', '5'] },
            ],
          }],
        },
      ],
    },
  };
}

function nhlGame() {
  return {
    competitions: [{
      status: { type: { state: 'post', shortDetail: 'Final' } },
      competitors: [
        { homeAway: 'away', team: { id: '18', abbreviation: 'SJ' } },
        { homeAway: 'home', team: { id: '8', abbreviation: 'LA' } },
      ],
    }],
  };
}

function nhlSummary() {
  const keys = ['hits', 'plusMinus', 'timeOnIce', 'goals', 'assists', 'shotsTotal', 'blockedShots'];
  return {
    boxscore: {
      players: [{
        team: { id: '18', abbreviation: 'SJ' },
        statistics: [
          {
            name: 'forwards',
            keys,
            athletes: [
              { athlete: { id: '10', shortName: 'F. Bystedt' }, stats: ['0', '1', '5:34', '0', '2', '3', '1'] },
              { athlete: { id: '11', shortName: 'Scratch' }, stats: ['0', '0', '0:00', '0', '0', '0', '0'] },
            ],
          },
          {
            name: 'defenses',
            keys,
            athletes: [
              { athlete: { id: '12', shortName: 'S. Dickinson' }, stats: ['4', '-2', '12:24', '2', '1', '2', '1'] },
            ],
          },
          {
            name: 'goalies',
            keys: ['saves'],
            athletes: [
              { athlete: { id: '13', shortName: 'Y. Askarov' }, stats: ['13'] },
            ],
          },
          {
            name: 'skaters',
            keys,
            athletes: [
              { athlete: { id: '10', shortName: 'F. Bystedt' }, stats: ['0', '1', '5:34', '0', '2', '3', '1'] },
            ],
          },
        ],
      }],
    },
  };
}

describe('day leaders', () => {
  it('keeps NBA players who played and sorts points first', () => {
    const rows = playersFromBoxscore('nba', nbaSummary(), nbaGame());
    assert.deepEqual(rows.map((r) => r.name), ['D. Gafford', 'V. Wembanyama']);
    const ranked = sortDayLeaders(rows, 'points', 'desc');
    assert.equal(ranked[0].name, 'V. Wembanyama');
    assert.equal(ranked[0].points, 31);
    assert.equal(ranked[0].opponent, 'DAL');
    assert.equal(ranked[0].home, true);
    assert.equal(ranked[0].live, true);
    assert.equal(ranked[0].headshot, 'https://img/wemby');
    const byBoards = sortDayLeaders(rows, 'rebounds', 'desc');
    assert.equal(byBoards[0].name, 'V. Wembanyama');
    assert.equal(byBoards[0].rebounds, 12);
  });

  it('scores NHL points as goals plus assists and skips goalies and scratches', () => {
    const rows = playersFromBoxscore('nhl', nhlSummary(), nhlGame());
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    assert.deepEqual(Object.keys(byId).sort(), ['10', '12']);
    assert.equal(byId['10'].points, 2);
    assert.equal(byId['10'].assists, 2);
    assert.equal(byId['12'].points, 3);
    assert.equal(byId['12'].goals, 2);
    assert.equal(byId['12'].plusMinus, -2);
    assert.equal(byId['12'].hits, 4);
    const ranked = sortDayLeaders(rows, 'points', 'desc');
    assert.equal(ranked[0].name, 'S. Dickinson');
    const byPlus = sortDayLeaders(rows, 'plusMinus', 'desc');
    assert.equal(byPlus[0].name, 'F. Bystedt');
    assert.equal(byPlus[1].plusMinus, -2);
    const lowPlus = sortDayLeaders(rows, 'plusMinus', 'asc');
    assert.equal(lowPlus[0].name, 'S. Dickinson');
  });

  it('adds a second game onto the same player', () => {
    const combined = combinePlayers([
      { id: '1', name: 'A', points: 20, rebounds: 5, live: true },
      { id: '1', name: 'A', points: 8, rebounds: 3, live: false },
    ]);
    assert.equal(combined.length, 1);
    assert.equal(combined[0].points, 28);
    assert.equal(combined[0].rebounds, 8);
    assert.equal(combined[0].live, true);
  });

  it('formats plus-minus with a sign and ignores a zero minute line', () => {
    assert.equal(formatLeaderStat('plusMinus', 3), '+3');
    assert.equal(formatLeaderStat('plusMinus', -2), '-2');
    assert.equal(formatLeaderStat('points', 0), '0');
    assert.equal(playedTime('0'), false);
    assert.equal(playedTime('0:00'), false);
    assert.equal(playedTime('5:34'), true);
    assert.equal(playedTime('18'), true);
  });
});
