import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  playersFromBoxscore,
  combinePlayers,
  sortDayLeaders,
  formatLeaderStat,
  formatGameLine,
  gameSituation,
  playedTime,
} from './dayLeaders.js';

function nbaGame() {
  return {
    competitions: [{
      status: { period: 3, displayClock: '4:12', type: { state: 'in', shortDetail: '4:12 - 3rd' } },
      competitors: [
        { homeAway: 'away', score: '98', team: { id: '6', abbreviation: 'DAL', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/dal.png' } },
        { homeAway: 'home', score: '101', team: { id: '24', abbreviation: 'SA', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/sa.png' } },
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
    assert.equal(ranked[0].score, 'DAL 98, SA 101');
    assert.equal(ranked[0].clock, '4:12');
    assert.equal(ranked[0].period, '3rd');
    assert.equal(ranked[0].awaySide.abbr, 'DAL');
    assert.equal(ranked[0].awaySide.score, '98');
    assert.equal(ranked[0].homeSide.abbr, 'SA');
    assert.equal(ranked[0].homeSide.score, '101');
    assert.match(ranked[0].awaySide.logo, /500-dark\/dal\.png$/);
    assert.match(ranked[0].homeSide.logoFallback, /500\/sa\.png$/);
    assert.equal(formatGameLine(ranked[0]), 'DAL 98, SA 101 · 4:12 3rd');
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

  it('reads a live clock and leaves a final game without a period', () => {
    assert.deepEqual(gameSituation(
      { period: 4, displayClock: '0:41', type: { state: 'in', shortDetail: '0:41 - 4th' } },
      [
        { homeAway: 'away', score: '110', team: { abbreviation: 'WSH' } },
        { homeAway: 'home', score: '108', team: { abbreviation: 'DET' } },
      ],
    ), {
      live: true,
      score: 'WSH 110, DET 108',
      period: '4th',
      clock: '0:41',
      awaySide: { abbr: 'WSH', score: '110', logo: '', logoFallback: '' },
      homeSide: { abbr: 'DET', score: '108', logo: '', logoFallback: '' },
    });
    assert.deepEqual(gameSituation(
      { displayClock: '0:00', type: { state: 'post', shortDetail: 'Final' } },
      [
        { homeAway: 'away', score: '111', team: { abbreviation: 'WSH' } },
        { homeAway: 'home', score: '122', team: { abbreviation: 'DET' } },
      ],
    ), {
      live: false,
      score: 'WSH 111, DET 122',
      period: '',
      clock: '',
      awaySide: { abbr: 'WSH', score: '111', logo: '', logoFallback: '' },
      homeSide: { abbr: 'DET', score: '122', logo: '', logoFallback: '' },
    });
    assert.equal(formatGameLine({ live: false, score: 'WSH 111, DET 122', period: '4th', clock: '0:41' }), 'WSH 111, DET 122');
  });

  it('keeps the live game score when a player appears twice', () => {
    const combined = combinePlayers([
      { id: '1', name: 'A', points: 20, live: false, score: 'BOS 100, NYK 99', period: '', clock: '' },
      { id: '1', name: 'A', points: 8, live: true, score: 'BOS 40, MIA 38', period: '2nd', clock: '5:01', team: 'BOS', opponent: 'MIA', home: true, awaySide: { abbr: 'MIA', score: '38' }, homeSide: { abbr: 'BOS', score: '40' } },
    ]);
    assert.equal(combined[0].points, 28);
    assert.equal(combined[0].score, 'BOS 40, MIA 38');
    assert.equal(combined[0].period, '2nd');
    assert.equal(combined[0].clock, '5:01');
    assert.equal(combined[0].homeSide.abbr, 'BOS');
  });

  it('formats plus-minus with a sign and ignores a zero minute line', () => {
    assert.equal(formatLeaderStat('plusMinus', 3), '+3');
    assert.equal(formatLeaderStat('plusMinus', -2), '-2');
    assert.equal(formatLeaderStat('points', 0), '0');
    assert.equal(playedTime('0'), false);
    assert.equal(playedTime('0:00'), false);
    assert.equal(playedTime('5:34'), true);
    assert.equal(playedTime('18'), true);
    assert.equal(formatLeaderStat('innings', 6.1), '6.1');
    assert.equal(formatLeaderStat('innings', 6), '6.0');
  });
});

function nflGame() {
  return {
    competitions: [{
      status: { type: { state: 'post', shortDetail: 'Final' } },
      competitors: [
        { homeAway: 'away', team: { id: '3', abbreviation: 'CHI' } },
        { homeAway: 'home', team: { id: '26', abbreviation: 'SEA' } },
      ],
    }],
  };
}

function nflSummary() {
  return {
    boxscore: {
      players: [{
        team: { id: '3', abbreviation: 'CHI' },
        statistics: [
          {
            name: 'passing',
            keys: ['completions/passingAttempts', 'passingYards', 'passingTouchdowns', 'interceptions'],
            athletes: [
              { athlete: { id: '8', shortName: 'C. Williams', position: { abbreviation: 'QB' } }, stats: ['24/34', '247', '1', '0'] },
              { athlete: { id: '9', shortName: 'Backup', position: { abbreviation: 'QB' } }, stats: ['0/0', '0', '0', '0'] },
            ],
          },
          {
            name: 'rushing',
            keys: ['rushingAttempts', 'rushingYards', 'rushingTouchdowns'],
            athletes: [
              { athlete: { id: '20', shortName: 'D. Swift', position: { abbreviation: 'RB' } }, stats: ['27', '69', '3'] },
            ],
          },
          {
            name: 'receiving',
            keys: ['receptions', 'receivingYards', 'receivingTouchdowns'],
            athletes: [
              { athlete: { id: '20', shortName: 'D. Swift', position: { abbreviation: 'RB' } }, stats: ['4', '20', '0'] },
              { athlete: { id: '15', shortName: 'R. Odunze', position: { abbreviation: 'WR' } }, stats: ['4', '87', '0'] },
            ],
          },
        ],
      }],
    },
  };
}

function mlbGame() {
  return {
    competitions: [{
      status: { type: { state: 'in', shortDetail: 'Top 7th' } },
      competitors: [
        { homeAway: 'away', score: '4', team: { id: '8', abbreviation: 'MIL' } },
        { homeAway: 'home', score: '2', team: { id: '30', abbreviation: 'TB' } },
      ],
    }],
  };
}

function mlbSummary() {
  return {
    rosters: [{
      roster: [
        { athlete: { id: '30' }, stats: [{ name: 'stolenBases', value: 2 }] },
        { athlete: { id: '31' }, stats: [{ name: 'stolenBases', value: 0 }] },
      ],
    }],
    boxscore: {
      players: [{
        team: { id: '8', abbreviation: 'MIL' },
        statistics: [
          {
            name: 'batting',
            keys: ['atBats', 'hits', 'RBIs', 'homeRuns'],
            athletes: [
              { athlete: { id: '30', shortName: 'J. Chourio', position: { abbreviation: 'CF' } }, stats: ['5', '4', '1', '0'] },
              { athlete: { id: '31', shortName: 'W. Contreras', position: { abbreviation: 'C' } }, stats: ['4', '1', '3', '2'] },
              { athlete: { id: '32', shortName: 'Sat', position: { abbreviation: 'DH' } }, stats: ['0', '0', '0', '0'] },
            ],
          },
          {
            name: 'pitching',
            keys: ['fullInnings.partInnings', 'strikeouts'],
            athletes: [
              { athlete: { id: '40', shortName: 'R. Gasser', position: { abbreviation: 'P' } }, stats: ['6.0', '3'] },
              { athlete: { id: '41', shortName: 'A. Senzatela', position: { abbreviation: 'P' } }, stats: ['2.0', '8'] },
              { athlete: { id: '42', shortName: 'Unused', position: { abbreviation: 'P' } }, stats: ['0.0', '0'] },
            ],
          },
        ],
      }],
    },
  };
}

describe('football and baseball leaders', () => {
  it('splits passing, rushing, and receiving and skips a quarterback who did not throw', () => {
    const rows = combinePlayers(playersFromBoxscore('nfl', nflSummary(), nflGame()));
    const passing = sortDayLeaders(rows.filter((row) => row.line === 'passing'), 'passingYards', 'desc');
    assert.deepEqual(passing.map((row) => row.name), ['C. Williams']);
    assert.equal(passing[0].passingYards, 247);
    assert.equal(passing[0].passingTouchdowns, 1);
    const rushing = rows.filter((row) => row.line === 'rushing');
    const receiving = rows.filter((row) => row.line === 'receiving');
    assert.equal(rushing.find((row) => row.id === '20').rushingYards, 69);
    assert.equal(receiving.find((row) => row.id === '20').receivingYards, 20);
    const byYards = sortDayLeaders(receiving, 'receivingYards', 'desc');
    assert.equal(byYards[0].name, 'R. Odunze');
    assert.equal(byYards[0].receptions, 4);
  });

  it('ranks home runs, hits, steals, and pitcher strikeouts separately', () => {
    const rows = playersFromBoxscore('mlb', mlbSummary(), mlbGame());
    const hitting = sortDayLeaders(rows.filter((row) => row.line === 'hitting'), 'homeRuns', 'desc');
    assert.deepEqual(hitting.map((row) => row.name), ['W. Contreras', 'J. Chourio']);
    assert.equal(hitting[0].homeRuns, 2);
    assert.equal(hitting[0].rbi, 3);
    assert.equal(hitting.find((row) => row.id === '30').steals, 2);
    const byHits = sortDayLeaders(hitting, 'hits', 'desc');
    assert.equal(byHits[0].name, 'J. Chourio');
    const pitching = sortDayLeaders(rows.filter((row) => row.line === 'pitching'), 'strikeouts', 'desc');
    assert.deepEqual(pitching.map((row) => row.name), ['A. Senzatela', 'R. Gasser']);
    assert.equal(pitching[0].strikeouts, 8);
    assert.equal(pitching[1].innings, 6);
    assert.equal(pitching[0].live, true);
    assert.equal(pitching[0].score, 'MIL 4, TB 2');
    assert.equal(pitching[0].period, 'Top 7th');
    assert.equal(pitching[0].clock, '');
  });
});
