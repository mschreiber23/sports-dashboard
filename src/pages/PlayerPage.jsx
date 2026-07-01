import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { recordPlayerView } from './PlayersPage';
import { useFavorites } from '../context/FavoritesContext';
import { getPlayerBio, getPlayerSeasonStats, getPlayerGameLog, getPlayerSplits, getScoreboard, getGameBoxscore, searchTeams } from '../api/espn';
import { adaptColorForDarkBg } from '../utils/colorUtils';

/* Format a stat value:
   - Rate stats (.265, 0.923, 1.023, 48.4%) → keep 3 decimals for baseball rates, 1 decimal for % rates
   - Counting stats → integer or 1 decimal
*/
const BASEBALL_RATE_KEYS = new Set(['AVG','OBP','SLG','OPS','BABIP','ISO','ISOP','wOBA']);

function roundStat(val, key = '') {
  if (val == null || val === '—' || val === '') return val;
  const str = String(val).trim();

  // Baseball rate stats: always 3 decimal places
  if (BASEBALL_RATE_KEYS.has(key)) {
    const n = parseFloat(str);
    if (isNaN(n)) return str;
    // Format like .265 or 1.023
    if (Math.abs(n) < 2) {
      const formatted = Math.abs(n) < 1
        ? n.toFixed(3).replace(/^0\./, '.')   // 0.265 → .265
        : n.toFixed(3);                         // 1.023 → 1.023
      return n < 0 ? `-${formatted.replace('-', '')}` : formatted;
    }
    return n.toFixed(1);
  }

  // Values that look like batting averages already (start with ".")
  if (str.startsWith('.') || str.startsWith('-.')) {
    return str; // already formatted correctly by ESPN
  }

  const n = parseFloat(str.replace(/,/g, ''));
  if (isNaN(n)) return str;
  if (Number.isInteger(n)) return String(Math.round(n));
  return n.toFixed(1);
}

/* ── Recent AB Tracker ───────────────────────────────── */
function accumulateStats(games) {
  let ab=0,h=0,hr=0,rbi=0,bb=0,so=0,db=0,tr=0,r=0,sb=0;
  for (const g of games) {
    ab  += parseInt(g.stats['AB']  || 0);
    h   += parseInt(g.stats['H']   || 0);
    hr  += parseInt(g.stats['HR']  || 0);
    rbi += parseInt(g.stats['RBI'] || 0);
    bb  += parseInt(g.stats['BB']  || 0);
    so  += parseInt(g.stats['SO']  || g.stats['K'] || 0);
    db  += parseInt(g.stats['2B']  || 0);
    tr  += parseInt(g.stats['3B']  || 0);
    r   += parseInt(g.stats['R']   || 0);
    sb  += parseInt(g.stats['SB']  || 0);
  }
  const fmt3 = (n) => n < 1 ? n.toFixed(3).replace(/^0\./, '.') : n.toFixed(3);
  const avg = ab > 0 ? fmt3(h / ab) : '.000';
  const obp = (ab+bb) > 0 ? fmt3((h+bb)/(ab+bb)) : '.000';
  const tb  = (h-db-tr-hr) + 2*db + 3*tr + 4*hr;
  const slg = ab > 0 ? fmt3(tb / ab) : '.000';
  const opsN = (parseFloat('0'+obp) + parseFloat('0'+slg));
  const ops = fmt3(opsN);
  return { ab, h, hr, rbi, bb, so, r, sb, avg, obp, slg, ops, games: games.length };
}

function RecentABTracker({ gamelog }) {
  const [searchMode, setSearchMode] = useState('games'); // 'games' | 'ab'
  const [abInput,    setAbInput]    = useState('20');
  const [gamesInput, setGamesInput] = useState('10');

  const trimmedGames = (() => {
    if (searchMode === 'games') {
      const n = Math.max(1, parseInt(gamesInput) || 10);
      return gamelog.slice(0, n);
    } else {
      const target = Math.max(1, parseInt(abInput) || 20);
      let ab = 0;
      const result = [];
      for (const g of gamelog) {
        if (ab >= target) break;
        ab += parseInt(g.stats['AB'] || 0);
        result.push(g);
      }
      return result;
    }
  })();

  const acc = accumulateStats(trimmedGames);

  const rateStats = [
    { label:'AVG', value:acc.avg }, { label:'OBP', value:acc.obp },
    { label:'SLG', value:acc.slg }, { label:'OPS', value:acc.ops },
  ];
  const countingStats = [
    { label:'AB',  value:acc.ab  }, { label:'H',   value:acc.h   },
    { label:'HR',  value:acc.hr  }, { label:'RBI', value:acc.rbi },
    { label:'BB',  value:acc.bb  }, { label:'SO',  value:acc.so  },
    { label:'R',   value:acc.r   }, { label:'SB',  value:acc.sb  },
  ];

  return (
    <div className="pp-stats-section">
      <div className="ab-tracker-inner">
        <div className="pp-stats-title">Recent AB Tracker</div>

        {/* Mode tabs + search input */}
        <div className="ab-tracker-search-row">
          <div className="ab-tracker-mode-tabs">
            <button
              className={`ab-tracker-mode-tab ${searchMode === 'games' ? 'ab-tracker-mode-active' : ''}`}
              onClick={() => setSearchMode('games')}
            >
              🔍 Games
            </button>
            <button
              className={`ab-tracker-mode-tab ${searchMode === 'ab' ? 'ab-tracker-mode-active' : ''}`}
              onClick={() => setSearchMode('ab')}
            >
              🔍 ABs
            </button>
          </div>
          <div className="ab-tracker-input-wrap">
            {searchMode === 'ab' ? (
              <input
                type="number"
                className="ab-tracker-input"
                value={abInput}
                min="1"
                max="600"
                placeholder="# of ABs"
                onChange={(e) => setAbInput(e.target.value)}
              />
            ) : (
              <input
                type="number"
                className="ab-tracker-input"
                value={gamesInput}
                min="1"
                max="162"
                placeholder="# of Games"
                onChange={(e) => setGamesInput(e.target.value)}
              />
            )}
          </div>
        </div>

        {/* Summary pills */}
        <div className="ab-tracker-meta">
          <span className="ab-tracker-meta-pill">{acc.ab} AB</span>
          <span className="ab-tracker-meta-pill">{acc.games} game{acc.games !== 1 ? 's' : ''}</span>
        </div>

        {/* Rate stats */}
        <div className="ab-tracker-rate-row">
          {rateStats.map((s) => (
            <div key={s.label} className="ab-tracker-rate-stat">
              <div className="ab-tracker-rate-value">{s.value}</div>
              <div className="ab-tracker-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Counting stats */}
        <div className="ab-tracker-count-row">
          {countingStats.map((s) => (
            <div key={s.label} className="ab-tracker-count-stat">
              <div className="ab-tracker-count-value">{s.value}</div>
              <div className="ab-tracker-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Position detection helpers ─────────────────────── */
const QB_POS  = ['QB'];
const RB_POS  = ['RB','HB','FB'];
const REC_POS = ['WR','TE'];
const NHL_GOALIE_POS = ['G','GK'];

function getNflKey(pos) {
  if (QB_POS.includes(pos))  return 'nfl_qb';
  if (RB_POS.includes(pos))  return 'nfl_rb';
  if (REC_POS.includes(pos)) return 'nfl_wr';
  return 'nfl_qb'; // fallback
}

/* ── Career table columns ─────────────────────────────── */
const CAREER_COLS = {
  mlb_batting: [
    { key: 'GP', label: 'GP' }, { key: 'AB', label: 'AB' },
    { key: 'AVG', label: 'AVG', hl: true }, { key: 'OBP', label: 'OBP', hl: true },
    { key: 'SLG', label: 'SLG', hl: true }, { key: 'OPS', label: 'OPS', hl: true },
    { key: 'R', label: 'R' }, { key: 'H', label: 'H' },
    { key: '2B', label: '2B' }, { key: '3B', label: '3B' },
    { key: 'HR', label: 'HR', hl: true }, { key: 'RBI', label: 'RBI', hl: true },
    { key: 'BB', label: 'BB' }, { key: 'SO', label: 'SO' },
    { key: 'SB', label: 'SB' }, { key: 'CS', label: 'CS' }, { key: 'WAR', label: 'WAR' },
  ],
  mlb_pitching: [
    { key: 'GP', label: 'G' }, { key: 'W', label: 'W', hl: true }, { key: 'L', label: 'L' },
    { key: 'SV', label: 'SV' }, { key: 'IP', label: 'IP', hl: true },
    { key: 'ERA', label: 'ERA', hl: true }, { key: 'WHIP', label: 'WHIP', hl: true },
    { key: 'K', label: 'K', hl: true }, { key: 'BB', label: 'BB' },
    { key: 'H', label: 'H' }, { key: 'HR', label: 'HR' },
  ],
  nba: [
    { key: 'GP', label: 'GP' }, { key: 'MIN', label: 'MIN' },
    { key: 'PTS', label: 'PTS', hl: true }, { key: 'REB', label: 'REB', hl: true },
    { key: 'AST', label: 'AST', hl: true }, { key: 'STL', label: 'STL' },
    { key: 'BLK', label: 'BLK' }, { key: 'FG%', label: 'FG%', hl: true },
    { key: '3P%', label: '3P%' }, { key: 'FT%', label: 'FT%' }, { key: 'TO', label: 'TO' },
  ],
  nfl_qb: [
    { key: 'GP', label: 'GP' }, { key: 'ATT', label: 'ATT' },
    { key: 'YDS', label: 'YDS', hl: true }, { key: 'TD', label: 'TD', hl: true },
    { key: 'INT', label: 'INT' }, { key: 'RTG', label: 'RTG', hl: true },
    { key: 'CAR', label: 'CAR' }, { key: 'RYDS', label: 'RYDS' }, { key: 'RTD', label: 'RTD' },
  ],
  nfl_rb: [
    { key: 'GP', label: 'GP' }, { key: 'CAR', label: 'CAR' },
    { key: 'YDS', label: 'YDS', hl: true }, { key: 'AVG', label: 'AVG' },
    { key: 'TD', label: 'TD', hl: true }, { key: 'REC', label: 'REC' },
    { key: 'RYDS', label: 'REC YDS' }, { key: 'RTD', label: 'REC TD' },
  ],
  nfl_wr: [
    { key: 'GP', label: 'GP' }, { key: 'REC', label: 'REC', hl: true },
    { key: 'YDS', label: 'YDS', hl: true }, { key: 'AVG', label: 'AVG' },
    { key: 'TD', label: 'TD', hl: true }, { key: 'TGTS', label: 'TGT' },
  ],
  nhl_skater: [
    { key: 'GP', label: 'GP' }, { key: 'G', label: 'G', hl: true },
    { key: 'A', label: 'A', hl: true }, { key: 'PTS', label: 'PTS', hl: true },
    { key: '+/-', label: '+/-' }, { key: 'PIM', label: 'PIM' }, { key: 'SOG', label: 'SOG' },
  ],
  nhl_goalie: [
    { key: 'GP', label: 'GP' }, { key: 'W', label: 'W', hl: true },
    { key: 'L', label: 'L' }, { key: 'GAA', label: 'GAA', hl: true },
    { key: 'SV%', label: 'SV%', hl: true }, { key: 'SO', label: 'SO' },
  ],
};

const CAREER_TITLE = {
  mlb_batting: 'Career Batting', mlb_pitching: 'Career Pitching',
  nba: 'Career Stats',
  nfl_qb: 'Career Passing', nfl_rb: 'Career Rushing', nfl_wr: 'Career Receiving',
  nhl_skater: 'Career Stats', nhl_goalie: 'Career Stats',
};

/* ── Game log columns ─────────────────────────────────── */
const GAMELOG_COLS = {
  mlb_batting:  ['AB','R','H','2B','3B','HR','RBI','BB','SO','SB','AVG','OPS'],
  mlb_pitching: ['IP','H','R','ER','BB','K','HR','ERA'],
  nba:   ['MIN','PTS','REB','AST','STL','BLK','FG','3PT','FT','TO'],
  nfl_qb:  ['CMP','ATT','YDS','TD','INT','RTG'],
  nfl_rb:  ['CAR','YDS','AVG','TD','REC','RYDS'],
  nfl_wr:  ['REC','YDS','AVG','TD','TGTS'],
  nhl_skater: ['G','A','PTS','+/-','SOG','TOI'],
  nhl_goalie: ['W','L','GAA','SV%','SO'],
};

/* ── Extract stats from core API response ─────────────── */
function getStats(data, sportKey) {
  if (!data) return {};
  const cats = data.splits?.categories || [];

  if (sportKey === 'mlb' || sportKey === 'mlb_batting' || sportKey === 'mlb_pitching') {
    const cat = cats.find((c) => c.name === 'pitching') || cats.find((c) => c.name === 'batting') || cats[0];
    const result = {};
    (cat?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
    // Alias K → SO and SO → K so both keys work
    if (result['K'] && !result['SO']) result['SO'] = result['K'];
    if (result['SO'] && !result['K']) result['K'] = result['SO'];
    return result;
  }

  if (sportKey === 'nba') {
    const result = {};
    cats.forEach((cat) => (cat.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; }));
    const off = cats.find((c) => c.name === 'offensive');
    if (off) (off.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });

    // Core API returns per-48-min rates — convert to per-game using MIN
    const minPerGame = parseFloat(result['MIN'] || 0);
    if (minPerGame > 0) {
      const factor = minPerGame / 48;
      ['PTS','REB','AST','STL','BLK','TO'].forEach((k) => {
        const v = parseFloat(result[k] || 0);
        if (v > 0) result[k] = (v * factor).toFixed(1);
      });
    }
    return result;
  }

  if (sportKey?.startsWith('nfl')) {
    const passing   = cats.find((c) => c.name?.includes('pass'));
    const rushing   = cats.find((c) => c.name?.includes('rush'));
    const receiving = cats.find((c) => c.name?.includes('receiv'));
    const general   = cats.find((c) => c.name === 'general');
    const result = {};
    // Always get GP from general
    (general?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });

    if (sportKey === 'nfl_qb') {
      (passing?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
      // Store rushing separately to avoid overwriting passing YDS
      (rushing?.stats || []).forEach((s) => {
        const key = s.abbreviation === 'YDS' ? 'RYDS' : s.abbreviation === 'TD' ? 'RTD' : s.abbreviation === 'AVG' ? 'RAVG' : s.abbreviation;
        if (!result[key]) result[key] = s.displayValue;
      });
      result['CAR'] = rushing ? (rushing.stats || []).find((s) => s.abbreviation === 'CAR')?.displayValue : null;
    } else if (sportKey === 'nfl_rb') {
      (rushing?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
      (receiving?.stats || []).forEach((s) => {
        const key = s.abbreviation === 'YDS' ? 'RYDS' : s.abbreviation === 'TD' ? 'RTD' : s.abbreviation;
        if (!result[key]) result[key] = s.displayValue;
      });
    } else {
      (receiving?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
    }
    return result;
  }

  if (sportKey === 'nhl_skater' || sportKey === 'nhl_goalie') {
    const result = {};
    cats.forEach((cat) => (cat.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; }));
    // Offensive overrides for accurate skater stats
    const off = cats.find((c) => c.name === 'offensive');
    if (off && sportKey === 'nhl_skater') (off.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
    return result;
  }

  const result = {};
  (cats[0]?.stats || []).forEach((s) => { result[s.abbreviation] = s.displayValue; });
  return result;
}

function hasStats(data, sportKey) {
  const s = getStats(data, sportKey);
  return Object.values(s).some((v) => {
    const n = parseFloat(v);
    return !isNaN(n) && n > 0;
  });
}

function darkUrl(url){if(!url)return url;return url.replace(/(\/i\/teamlogos\/[^/]+\/)(\d+)(\/)/,'$1$2-dark$3');}

export default function PlayerPage() {
  const { sport, playerId } = useParams();
  const navigate = useNavigate();
  const [bio, setBio] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [gamelog, setGamelog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [careerTab, setCareerTab] = useState('totals'); // 'totals' | 'rhp' | 'lhp' | 'opp'
  const [splitsBySeason, setSplitsBySeason] = useState({});
  const [vsTeamAbbr, setVsTeamAbbr] = useState(''); // e.g. "PHI"
  const [mlbTeams, setMlbTeams] = useState([]);

  // Derive sport key after bio loads
  const position = (bio?.athlete?.position?.abbreviation || '').toUpperCase();
  const sportKey = (() => {
    if (sport === 'mlb') {
      const PITCHER_POS = ['P','SP','RP','CL','MR','SU'];
      return PITCHER_POS.includes(position) ? 'mlb_pitching' : 'mlb_batting';
    }
    if (sport === 'nba') return 'nba';
    if (sport === 'nfl') return getNflKey(position);
    if (sport === 'nhl') return NHL_GOALIE_POS.includes(position) ? 'nhl_goalie' : 'nhl_skater';
    return sport;
  })();

  const cols        = CAREER_COLS[sportKey] || CAREER_COLS.nba;
  const glCols      = GAMELOG_COLS[sportKey] || GAMELOG_COLS.nba;
  const careerTitle = CAREER_TITLE[sportKey] || 'Career Stats';

  useEffect(() => {
    const currentYear = new Date().getFullYear();

    // Load bio first
    getPlayerBio(sport, playerId)
      .then((bioData) => {
        setBio(bioData);
        // Record this player view for the Players page recently-viewed list
        const ath = bioData?.athlete || {};
        if (ath.displayName) {
          recordPlayerView({
            id: playerId,
            sport,
            name: ath.displayName,
            team: ath.team?.abbreviation || ath.team?.shortDisplayName || ath.team?.displayName || '',
            headshot: ath.headshot?.href || `https://a.espncdn.com/i/headshots/${sport}/players/full/${playerId}.png`,
            position: ath.position?.abbreviation || '',
            jersey: ath.displayJersey || ath.jersey || '',
          });
        }
      })
      .catch(() => {});

    // Game log
    getPlayerGameLog(sport, playerId).then(async (data) => {
      const labels = data.labels || [];
      const eventsMap = data.events || {};
      const seasonTypes = data.seasonTypes || [];
      const games = [];
      const seenEventIds = new Set();
      for (const st of seasonTypes) {
        for (const cat of st.categories || []) {
          for (const ev of cat.events || []) {
            if (seenEventIds.has(ev.eventId)) continue;
            seenEventIds.add(ev.eventId);
            const info = eventsMap[ev.eventId] || {};
            games.push({
              date: info.gameDate || '',
              opponent: info.opponent?.abbreviation || '',
              atVs: info.atVs || '',
              result: info.gameResult || '',
              stats: Object.fromEntries(labels.map((l, i) => [l, ev.stats?.[i] ?? ''])),
            });
          }
        }
      }
      games.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Prepend today's game if not in log
      const today = new Date().toISOString().slice(0, 10);
      const todayStr = today.replace(/-/g, ''); // YYYYMMDD for scoreboard API
      const hasToday = games.some((g) => g.date.startsWith(today));
      if (!hasToday) {
        try {
          const events = await getScoreboard(sport, todayStr);
          const bioData = await getPlayerBio(sport, playerId).catch(() => null);
          const teamId = bioData?.athlete?.team?.id;
          const todayGame = teamId
            ? events.find((e) => e.competitions?.[0]?.competitors?.some((c) => c.team?.id === teamId))
            : null;
          if (todayGame) {
            const comp = todayGame.competitions?.[0];
            const state = comp?.status?.type?.state;
            // Only inject for live or completed games — pre-game box scores show season totals not game stats
            if (state === 'in' || state === 'post') {
              const summary = await getGameBoxscore(sport, todayGame.id);
              for (const group of summary?.boxscore?.players || []) {
                for (const sg of group.statistics || []) {
                  const bsLabels = sg.labels || [];
                  const found = (sg.athletes || []).find((a) => String(a.athlete?.id) === String(playerId));
                  if (found?.stats?.length) {
                    const myTeam = comp?.competitors?.find((c) => c.team?.id === teamId);
                    const opp = comp?.competitors?.find((c) => c.team?.id !== teamId);
                    const injected = Object.fromEntries(bsLabels.map((l, i) => [l, found.stats[i] ?? '']));
                    // Sanity: AB must be a realistic single-game number (not season totals)
                    if (parseInt(injected['AB'] || 0) <= 10) {
                      games.unshift({
                        date: todayGame.date || new Date().toISOString(),
                        opponent: opp?.team?.abbreviation || '',
                        atVs: myTeam?.homeAway === 'home' ? 'vs' : '@',
                        result: state === 'post' ? (myTeam?.winner ? 'W' : 'L') : 'Live',
                        stats: injected,
                        isLive: state === 'in',
                      });
                    }
                    break;
                  }
                }
              }
            }
          }
        } catch {}
      }
      // Full gamelog for AB tracker (up to full season), display capped at 25
      setGamelog(games.slice(0, 162));
    }).catch(() => {});

    // Season stats — fetch from debut year to current
    getPlayerBio(sport, playerId).then((bioData) => {
      const debutYear = bioData?.athlete?.debutYear || currentYear - 8;
      const years = Array.from(
        { length: currentYear - debutYear + 1 },
        (_, i) => debutYear + i
      );
      Promise.allSettled(years.map((y) => getPlayerSeasonStats(sport, playerId, y)))
        .then((results) => {
          // Determine sport key from bio position
          const pos = (bioData?.athlete?.position?.abbreviation || '').toUpperCase();
          const sk = (() => {
            if (sport === 'mlb') return ['P','SP','RP','CL','MR','SU'].includes(pos) ? 'mlb_pitching' : 'mlb_batting';
            if (sport === 'nba') return 'nba';
            if (sport === 'nfl') return getNflKey(pos);
            if (sport === 'nhl') return NHL_GOALIE_POS.includes(pos) ? 'nhl_goalie' : 'nhl_skater';
            return sport;
          })();

          const valid = results
            .filter((r) => r.status === 'fulfilled')
            .map((r) => r.value)
            .filter((r) => hasStats(r.data, sk));
        setSeasons(valid);

        // For MLB batters: also fetch vs RHP / vs LHP splits for each season
        if (sport === 'mlb' && !['P','SP','RP','CL','MR','SU'].includes(pos)) {
          const splitYears = years.filter((y) => valid.some((v) => v.year === y));
          const splitsMap = {};
          Promise.allSettled(
            splitYears.map((y) =>
              getPlayerSplits(sport, playerId, y).then((data) => {
                const labels = data.labels || [];
                const cats = data.splitCategories || [];
                const breakdown = cats.find((c) => c.name === 'byBreakdown');
                const toStatObj = (statsArr) =>
                  Object.fromEntries(labels.map((l, i) => [l, statsArr[i] ?? '—']));
                // Opponent splits
                const oppCat = cats.find((c) => c.name === 'byOpponent');
                const oppMap = {};
                (oppCat?.splits || []).forEach((s) => {
                  const abbr = s.abbreviation?.replace('vs. ', '') || '';
                  if (abbr) oppMap[abbr] = toStatObj(s.stats || []);
                });

                if (breakdown || oppCat) {
                  const rhpSplit = breakdown?.splits?.find((s) => s.displayName?.includes('Right'));
                  const lhpSplit = breakdown?.splits?.find((s) => s.displayName?.includes('Left'));
                  splitsMap[y] = {
                    rhp: rhpSplit ? toStatObj(rhpSplit.stats || []) : null,
                    lhp: lhpSplit ? toStatObj(lhpSplit.stats || []) : null,
                    opp: oppMap,
                  };
                }
              }).catch(() => {})
            )
          ).then(() => setSplitsBySeason({ ...splitsMap }));
        }
      })
      .finally(() => setLoading(false));
  }).catch(() => setLoading(false));
  }, [sport, playerId]);

  // Load MLB teams for vs Team picker
  useEffect(() => {
    if (careerTab === 'opp' && mlbTeams.length === 0 && sport === 'mlb') {
      searchTeams('mlb', '').then(setMlbTeams).catch(() => {});
    }
  }, [careerTab, sport]);

  const { favorites, addPlayer, removePlayer } = useFavorites();
  const athlete = bio?.athlete || {};
  const summary = athlete.statsSummary?.statistics || [];
  const teamLogo = athlete.team?.logos?.[0]?.href || athlete.team?.logo;
  const teamColorRaw = athlete.team?.color ? `#${athlete.team.color}` : null;
  const teamAltColorRaw = athlete.team?.alternateColor ? `#${athlete.team.alternateColor}` : null;
  // Adapt color so very dark team colors (e.g. Eagles, Tigers, Yankees) are visible on dark bg.
  // Keeps null when the athlete has no team color so conditional guards below still work.
  const teamColor = teamColorRaw ? adaptColorForDarkBg(teamColorRaw, teamAltColorRaw) : null;
  const teamAltColor = teamAltColorRaw;

  const careerTotals = (() => {
    if (!seasons.length) return {};

    const rateKeys = ['AVG','OBP','SLG','OPS','ERA','WHIP','FG%','3P%','FT%','GAA','SV%','RTG','RAVG'];
    const isNba = sportKey === 'nba';
    const NBA_AVG_KEYS = ['MIN','PTS','REB','AST','STL','BLK','FG%','3P%','FT%','TO'];

    const totals = {};
    const counts = {};

    seasons.forEach(({ year, data }) => {
      const splitData = splitsBySeason[year];
      const baseStats = getStats(data, sportKey);

      // For split tabs, skip seasons where split data doesn't exist
      let s;
      if (careerTab === 'rhp') {
        if (!splitData?.rhp) return; // skip years with no RHP data
        s = splitData.rhp;
      } else if (careerTab === 'lhp') {
        if (!splitData?.lhp) return; // skip years with no LHP data
        s = splitData.lhp;
      } else if (careerTab === 'opp' && vsTeamAbbr) {
        if (!splitData?.opp?.[vsTeamAbbr]) return; // skip years with no data vs this team
        s = splitData.opp[vsTeamAbbr];
      } else {
        s = baseStats;
      }
      cols.forEach(({ key }) => {
        const val = s[key];
        if (val == null || val === '—') return;
        const n = parseFloat(String(val).replace(/,/g, ''));
        if (isNaN(n)) return;

        if (isNba && NBA_AVG_KEYS.includes(key)) {
          // Average these for NBA
          totals[key] = (totals[key] || 0) + n;
          counts[key] = (counts[key] || 0) + 1;
        } else if (!rateKeys.includes(key)) {
          // Sum for counting stats
          totals[key] = (totals[key] || 0) + n;
        }
      });
    });

    // Finalize averages for NBA
    if (isNba) {
      NBA_AVG_KEYS.forEach((k) => {
        if (totals[k] !== undefined && counts[k]) {
          totals[k] = totals[k] / counts[k];
        }
      });
    }

    // For MLB batting splits: recalculate rate stats from accumulated counting totals
    if ((sportKey === 'mlb_batting') && (careerTab === 'rhp' || careerTab === 'lhp' || careerTab === 'opp')) {
      const ab = totals['AB'] || 0, h = totals['H'] || 0;
      const bb = totals['BB'] || 0, hbp = totals['HBP'] || 0;
      const d2 = totals['2B'] || 0, d3 = totals['3B'] || 0, hr = totals['HR'] || 0;
      if (ab > 0) {
        const avg = h / ab;
        const obp = (h + bb + hbp) / (ab + bb + hbp);
        const singles = h - d2 - d3 - hr;
        const tb = singles + 2*d2 + 3*d3 + 4*hr;
        const slg = tb / ab;
        const ops = obp + slg;
        totals['AVG'] = avg < 1 ? avg.toFixed(3).replace(/^0/, '') : avg.toFixed(3);
        totals['OBP'] = obp < 1 ? obp.toFixed(3).replace(/^0/, '') : obp.toFixed(3);
        totals['SLG'] = slg < 1 ? slg.toFixed(3).replace(/^0/, '') : slg.toFixed(3);
        totals['OPS'] = ops < 1 ? ops.toFixed(3).replace(/^0/, '') : ops.toFixed(3);
      }
    } else {
      // Rate stats: use most recent season's value
      const lastStats = getStats(seasons[seasons.length - 1].data, sportKey);
      rateKeys.forEach((k) => {
        if (lastStats[k] && lastStats[k] !== '—') totals[k] = lastStats[k];
      });
    }

    return totals;
  })();

  const pageStyle = teamColor
    ? { '--accent': teamColor, '--accent2': teamColor }
    : {};

  return (
    <div className="pp-page" style={pageStyle}>
      <button className="tp-back" onClick={() => navigate(-1)}>← Back</button>

      {loading && <div className="tp-loading">Loading…</div>}

      {!loading && athlete.displayName && (
        <>
          <div className="pp-header">
            {/* Colored top strip using team color */}
            {teamColor && (
              <div className="pp-team-stripe" style={{ background: teamColor }} />
            )}
            <div className="pp-hero">
              {athlete.headshot?.href && (
                <img src={athlete.headshot.href} alt={athlete.displayName} className="pp-headshot"
                  style={teamColor ? { background: `linear-gradient(to bottom, color-mix(in srgb, ${teamColor} 30%, transparent), var(--bg3))` } : {}}
                />
              )}
              <div className="pp-bio">
                <div className="pp-name">
                  <span className="pp-firstname">{athlete.firstName}</span>
                  <span className="pp-lastname"> {athlete.lastName}</span>
                </div>
                <div className="pp-team-row">
                  <img src={darkUrl(teamLogo)} onError={(e)=>{if(e.target.src!==teamLogo){e.target.onerror=null;e.target.src=teamLogo;}}} alt="" className="pp-team-logo" />
                  <span className="pp-team-name">{athlete.team?.displayName}</span>
                  {athlete.displayJersey && <span className="pp-meta"> · {athlete.displayJersey}</span>}
                  {athlete.position?.abbreviation && <span className="pp-meta"> · {athlete.position.abbreviation}</span>}
                </div>
                <div className="pp-details">
                  {athlete.displayHeight && athlete.displayWeight && (
                    <div className="pp-detail-row"><span className="pp-detail-label">HT/WT</span><span>{athlete.displayHeight}, {athlete.displayWeight}</span></div>
                  )}
                  {athlete.displayDOB && (
                    <div className="pp-detail-row"><span className="pp-detail-label">BORN</span><span>{(() => {
                      // ESPN returns D/M/YYYY — convert to M/D/YYYY
                      const parts = athlete.displayDOB.split('/');
                      return parts.length === 3 ? `${parts[1]}/${parts[0]}/${parts[2]}` : athlete.displayDOB;
                    })()}{athlete.age ? ` (${athlete.age})` : ''}</span></div>
                  )}
                  {athlete.displayBatsThrows && (
                    <div className="pp-detail-row"><span className="pp-detail-label">BAT/THR</span><span>{athlete.displayBatsThrows}</span></div>
                  )}
                  {athlete.displayDraft && (
                    <div className="pp-detail-row"><span className="pp-detail-label">DRAFT</span><span>{athlete.displayDraft}</span></div>
                  )}
                </div>
              </div>
            </div>

            {summary.length > 0 && (
              <div className="pp-stat-highlights">
                <div className="pp-highlights-label">{athlete.statsSummary?.displayName || 'Season Stats'}</div>
                <div className="pp-highlights-grid">
                  {summary.map((s) => (
                    <div key={s.abbreviation} className="pp-highlight-pill">
                      <div className="pp-hl-value">{s.displayValue}</div>
                      <div className="pp-hl-label">{s.abbreviation}</div>
                      {s.rankDisplayValue && (
                        <span className="pp-hl-rank-pill">{s.rankDisplayValue}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Statcast button — MLB batters only */}
          {sport === 'mlb' && sportKey === 'mlb_batting' && (
            <Link to={`/statcast/mlb/${playerId}`} className="pp-statcast-btn">
              <span className="pp-statcast-icon">⚡</span>
              View Statcast Data
              <span className="pp-statcast-badge">Powered by Baseball Savant</span>
            </Link>
          )}

          {/* Add / Remove from My Players */}
          {(()=>{
            const isFav = favorites.players.some((p) => p.id === playerId);
            return (
              <button
                className={`pp-fav-btn ${isFav ? 'pp-fav-btn-remove' : 'pp-fav-btn-add'}`}
                onClick={() => isFav ? removePlayer(playerId) : addPlayer({
                  id: playerId, sport,
                  displayName: athlete.displayName,
                  headshot: athlete.headshot,
                  team: athlete.team,
                  position: athlete.position,
                  _position: athlete.position?.abbreviation || '',
                })}
              >
                {isFav ? '✕  Remove from My Players' : '＋  Add to My Players'}
              </button>
            );
          })()}

          {/* Career stats table */}
          <div className="pp-stats-section">
            <div className="pp-career-header">
              <div className="pp-stats-title">{careerTitle}</div>
              {/* RHP/LHP tabs — MLB batters only */}
              {sport === 'mlb' && sportKey === 'mlb_batting' && Object.keys(splitsBySeason).length > 0 && (
                <div className="pp-career-tabs">
                  {[
                    { key: 'totals', label: 'Career Stats Totals' },
                    { key: 'rhp',    label: 'vs RHP' },
                    { key: 'lhp',    label: 'vs LHP' },
                    { key: 'opp',    label: 'vs Team' },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      className={`pp-career-tab ${careerTab === tab.key ? 'pp-career-tab-active' : ''}`}
                      onClick={() => setCareerTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {careerTab === 'opp' && (
              <div className="vs-team-picker-wrap">
                <select
                  className="vs-team-picker-select"
                  value={vsTeamAbbr}
                  onChange={(e) => setVsTeamAbbr(e.target.value)}
                >
                  <option value="">— Select an opponent —</option>
                  {mlbTeams.map((t) => (
                    <option key={t.id} value={t.abbreviation}>
                      {t.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead>
                  <tr>
                    <th className="pp-th pp-th-season">SEASON</th>
                    {cols.map((c) => <th key={c.key} className="pp-th">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {seasons.map(({ year, data }) => {
                    const totalStats = getStats(data, sportKey);
                    const splitData = splitsBySeason[year];
                    const s = careerTab === 'rhp' && splitData?.rhp
                      ? splitData.rhp
                      : careerTab === 'lhp' && splitData?.lhp
                      ? splitData.lhp
                      : careerTab === 'opp' && vsTeamAbbr && splitData?.opp?.[vsTeamAbbr]
                      ? splitData.opp[vsTeamAbbr]
                      : careerTab === 'opp' && vsTeamAbbr
                      ? null // no data vs this team in this year
                      : totalStats;
                    const isCurrent = year === new Date().getFullYear();
                    // Skip years with no data for selected opponent
                    if (s === null) return null;

                    return (
                      <tr key={year} className={`pp-tr ${isCurrent ? 'pp-tr-current' : ''}`}>
                        <td className="pp-td pp-td-season">{year}</td>
                        {cols.map((c) => (
                          <td key={c.key} className={`pp-td ${c.hl ? 'pp-td-hl' : ''}`}>
                            {roundStat(s[c.key], c.key) ?? '—'}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {seasons.length > 1 && (
                    <tr className="pp-tr-career">
                      <td className="pp-td pp-td-season pp-career-label">Career</td>
                      {cols.map((c) => (
                        <td key={c.key} className={`pp-td ${c.hl ? 'pp-td-hl' : ''}`}>
                          {careerTotals[c.key] !== undefined ? roundStat(careerTotals[c.key], c.key) : '—'}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent AB Tracker — MLB batters only */}
          {sport === 'mlb' && sportKey === 'mlb_batting' && gamelog.length > 0 && (
            <RecentABTracker gamelog={gamelog} />
          )}

          {/* Game Log */}
          {gamelog.length > 0 && (
            <div className="pp-stats-section">
              <div className="pp-stats-title">Last 25 Games</div>
              <div className="pp-table-wrap">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th className="pp-th pp-th-season">DATE</th>
                      <th className="pp-th pp-th-season">OPP</th>
                      <th className="pp-th pp-th-season">RESULT</th>
                      {glCols.map((c) => <th key={c} className="pp-th">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {gamelog.slice(0, 25).map((g, i) => {
                      const date = g.date ? new Date(g.date) : null;
                      const dateStr = date
                        ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '—';
                      const isWin = g.result === 'W';
                      return (
                        <tr key={i} className="pp-tr">
                          <td className="pp-td pp-td-season">{dateStr}</td>
                          <td className="pp-td pp-td-season">
                            <span className="pp-gl-atVs">{g.atVs}</span> {g.opponent}
                          </td>
                          <td className="pp-td pp-td-season">
                            {g.isLive ? (
                              <span className="badge badge-live" style={{ fontSize: 10, padding: '2px 6px' }}>
                                <span className="live-dot" />Live
                              </span>
                            ) : (
                              <span className={`pp-gl-result ${isWin ? 'pp-gl-win' : 'pp-gl-loss'}`}>
                                {g.result}
                              </span>
                            )}
                          </td>
                          {glCols.map((c) => (
                            <td key={c} className={`pp-td ${c === 'PTS' || c === 'HR' || c === 'TD' ? 'pp-td-hl' : ''}`}>
                              {g.stats[c] || '0'}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !athlete.displayName && (
        <div className="error-banner">Could not load player information.</div>
      )}
    </div>
  );
}
