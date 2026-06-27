import { useEffect, useState } from 'react';
import useBoxScore from '../hooks/useBoxScore';

/* ─── helpers ─────────────────────────────────────── */
function buildRosterMap(rosters = []) {
  const map = {};
  rosters.forEach((r) =>
    (r.roster || []).forEach((entry) => {
      const a = entry.athlete || {};
      if (a.id) map[String(a.id)] = { ...a, jersey: entry.jersey };
    })
  );
  return map;
}

/* ─── Header ──────────────────────────────────────── */
function teamLogo(team) {
  return team?.logo || team?.logos?.[0]?.href || null;
}

function Header({ competitors, status }) {
  const away = competitors?.find((c) => c.homeAway === 'away') || competitors?.[0];
  const home = competitors?.find((c) => c.homeAway === 'home') || competitors?.[1];
  const isLive = status?.type?.state === 'in';
  const isFinal = status?.type?.state === 'post';
  const shortDetail = status?.type?.shortDetail || '';

  return (
    <div className="bsm2-header">
      {/* Away team */}
      <div className="bsm2-team-side">
        {teamLogo(away?.team) && (
          <img src={teamLogo(away.team)} alt="" className="bsm2-team-logo" />
        )}
        <div>
          <div className="bsm2-team-abbr">{away?.team?.abbreviation}</div>
          <div className="bsm2-score">{away?.score ?? '—'}</div>
          <div className="bsm2-team-record">{away?.record?.[0]?.displayValue}</div>
        </div>
      </div>

      {/* Center */}
      <div className="bsm2-center-info">
        {isLive && <span className="badge badge-live" style={{ fontSize: 10 }}><span className="live-dot" /> LIVE</span>}
        {isFinal && <span className="badge badge-final" style={{ fontSize: 10 }}>Final</span>}
        <div className="bsm2-detail">{shortDetail}</div>
        <BaseDiamond small />
      </div>

      {/* Home team */}
      <div className="bsm2-team-side bsm2-team-side-right">
        <div style={{ textAlign: 'right' }}>
          <div className="bsm2-team-abbr">{home?.team?.abbreviation}</div>
          <div className="bsm2-score">{home?.score ?? '—'}</div>
          <div className="bsm2-team-record">{home?.record?.[0]?.displayValue}</div>
        </div>
        {teamLogo(home?.team) && (
          <img src={teamLogo(home.team)} alt="" className="bsm2-team-logo" />
        )}
      </div>
    </div>
  );
}

/* ─── Base Diamond ─────────────────────────────────── */
function BaseDiamond({ onFirst, onSecond, onThird, small }) {
  const size = small ? 28 : 44;
  return (
    <svg viewBox="0 0 44 44" style={{ width: size, height: size, flexShrink: 0 }}>
      <rect x="16" y="2"  width="12" height="12" rx="1.5" className={`tr-base ${onSecond ? 'tr-base-on' : ''}`} transform="rotate(45 22 8)" />
      <rect x="2"  y="16" width="12" height="12" rx="1.5" className={`tr-base ${onThird  ? 'tr-base-on' : ''}`} transform="rotate(45 8 22)" />
      <rect x="30" y="16" width="12" height="12" rx="1.5" className={`tr-base ${onFirst  ? 'tr-base-on' : ''}`} transform="rotate(45 36 22)" />
      <rect x="16" y="30" width="12" height="12" rx="1.5" className="tr-base" transform="rotate(45 22 36)" />
    </svg>
  );
}

/* ─── Line Score ───────────────────────────────────── */
function LineScore({ competitors }) {
  const maxInnings = Math.max(...competitors.map((c) => (c.linescores || []).length), 9);
  const innings = Array.from({ length: maxInnings }, (_, i) => i + 1);
  return (
    <div className="bsm2-linescore-wrap">
      <table className="bsm2-linescore">
        <thead>
          <tr>
            <th className="bsm2-ls-th bsm2-ls-team" />
            {innings.map((n) => <th key={n} className="bsm2-ls-th">{n}</th>)}
            <th className="bsm2-ls-th bsm2-ls-rhe">R</th>
            <th className="bsm2-ls-th bsm2-ls-rhe">H</th>
            <th className="bsm2-ls-th bsm2-ls-rhe">E</th>
          </tr>
        </thead>
        <tbody>
          {competitors.map((c) => (
            <tr key={c.team?.id}>
              <td className="bsm2-ls-td bsm2-ls-team">
                {teamLogo(c.team) && <img src={teamLogo(c.team)} alt="" className="bsm2-ls-logo" />}
                <span className="bsm2-ls-abbr">{c.team?.abbreviation}</span>
              </td>
              {innings.map((_, i) => (
                <td key={i} className="bsm2-ls-td bsm2-ls-inning">
                  {c.linescores?.[i]?.displayValue ?? '—'}
                </td>
              ))}
              <td className="bsm2-ls-td bsm2-ls-rhe bsm2-ls-bold">{c.score ?? '0'}</td>
              <td className="bsm2-ls-td bsm2-ls-rhe">{c.hits ?? '0'}</td>
              <td className="bsm2-ls-td bsm2-ls-rhe">{c.errors ?? '0'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Situation Bar ────────────────────────────────── */
function SituationBar({ situation, rosters, status }) {
  if (!situation || status?.type?.state !== 'in') return null;
  const rosterMap = buildRosterMap(rosters);
  const pitcher = rosterMap[String(situation.pitcher?.playerId)];
  const batter = rosterMap[String(situation.batter?.playerId)];

  // Get pitcher stats from boxscore via context — passed as prop
  const { balls = 0, strikes = 0, outs = 0 } = situation;

  const dots = (filled, total, color) =>
    Array.from({ length: total }).map((_, i) => (
      <span key={i} className={`bsm2-dot ${i < filled ? `bsm2-dot-${color}` : ''}`} />
    ));

  return (
    <div className="bsm2-situation">
      {pitcher && (
        <div className="bsm2-sit-player">
          <div className="bsm2-sit-role">PITCHER</div>
          <div className="bsm2-sit-name">
            {pitcher.shortName || pitcher.displayName}
            {pitcher.jersey && <span className="bsm2-sit-jersey"> #{pitcher.jersey}</span>}
          </div>
        </div>
      )}
      {batter && (
        <div className="bsm2-sit-player">
          <div className="bsm2-sit-role">BATTER</div>
          <div className="bsm2-sit-name">
            {batter.shortName || batter.displayName}
            {batter.jersey && <span className="bsm2-sit-jersey"> #{batter.jersey}</span>}
          </div>
        </div>
      )}
      <div className="bsm2-sit-count">
        <div className="bsm2-sit-count-row"><span className="bsm2-sit-count-label">B</span>{dots(balls, 4, 'green')}</div>
        <div className="bsm2-sit-count-row"><span className="bsm2-sit-count-label">S</span>{dots(strikes, 3, 'yellow')}</div>
        <div className="bsm2-sit-count-row"><span className="bsm2-sit-count-label">O</span>{dots(outs, 3, 'red')}</div>
      </div>
      <BaseDiamond
        onFirst={!!situation.onFirst}
        onSecond={!!situation.onSecond}
        onThird={!!situation.onThird}
      />
    </div>
  );
}

/* ─── Stats Table ──────────────────────────────────── */
const MLB_BATTING_COLS  = ['AB','R','H','RBI','HR','BB','K','AVG','OBP','SLG'];
const MLB_PITCHING_COLS = ['IP','H','R','ER','BB','K','HR','ERA'];
const NBA_COLS          = ['MIN','PTS','REB','AST','STL','BLK','FG','3PT','+/-'];
const NFL_PASS_COLS     = ['C/ATT','YDS','TD','INT','RTG'];
const NFL_RUSH_COLS     = ['CAR','YDS','AVG','TD'];
const NFL_REC_COLS      = ['REC','YDS','AVG','TD'];
const NHL_COLS          = ['G','A','PTS','+/-','SOG','TOI'];

function wantCols(sport, type) {
  if (sport === 'mlb') return type === 'pitching' ? MLB_PITCHING_COLS : MLB_BATTING_COLS;
  if (sport === 'nba') return NBA_COLS;
  if (sport === 'nfl') {
    if (type?.includes('pass')) return NFL_PASS_COLS;
    if (type?.includes('rush')) return NFL_RUSH_COLS;
    return NFL_REC_COLS;
  }
  if (sport === 'nhl') return NHL_COLS;
  return [];
}

const HIGHLIGHT = { mlb: ['H','HR','RBI','ERA'], nba: ['PTS','REB','AST'], nfl: ['YDS','TD'], nhl: ['G','A','PTS'] };

function StatsTable({ statGroup, sport }) {
  const labels = statGroup.labels || [];
  const athletes = statGroup.athletes || [];
  const totals = statGroup.totals || [];
  const type = (statGroup.type || statGroup.name || '').toLowerCase();
  const want = wantCols(sport, type);
  const cols = want.length
    ? want.map((w) => ({ label: w, index: labels.indexOf(w) })).filter((c) => c.index !== -1)
    : labels.map((l, i) => ({ label: l, index: i })).slice(0, 8);
  const hl = HIGHLIGHT[sport] || [];

  if (!athletes.length) return null;

  return (
    <div className="bsm2-table-wrap">
      <table className="bsm2-table">
        <thead>
          <tr>
            <th className="bsm2-th bsm2-th-player">{type === 'pitching' ? 'PITCHERS' : 'HITTERS'}</th>
            {cols.map((c) => <th key={c.label} className="bsm2-th">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {athletes.map((a, i) => {
            const player = a.athlete || {};
            const stats = a.stats || [];
            const dnp = a.didNotPlay || !stats.length;
            return (
              <tr key={i} className={`bsm2-tr ${dnp ? 'bsm2-dnp' : ''}`}>
                <td className="bsm2-td bsm2-td-player">
                  <div className="bsm2-player-cell">
                    {player.headshot?.href && (
                      <img src={player.headshot.href} alt="" className="bsm2-avatar" />
                    )}
                    <div>
                      <span className="bsm2-player-name">{player.shortName || player.displayName}</span>
                      <span className="bsm2-player-pos"> {a.position?.abbreviation || ''}</span>
                    </div>
                  </div>
                </td>
                {dnp
                  ? <td className="bsm2-td" colSpan={cols.length} style={{ color: 'var(--text2)', fontStyle: 'italic' }}>DNP</td>
                  : cols.map((c) => (
                    <td key={c.label} className={`bsm2-td ${hl.includes(c.label) ? 'bsm2-hl' : ''}`}>
                      {stats[c.index] ?? '—'}
                    </td>
                  ))}
              </tr>
            );
          })}
          {totals.length > 0 && (
            <tr className="bsm2-totals">
              <td className="bsm2-td bsm2-td-player" style={{ fontWeight: 800, fontSize: 11, color: 'var(--text2)' }}>TEAM</td>
              {cols.map((c) => <td key={c.label} className="bsm2-td">{totals[c.index] ?? ''}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Team Stats Section ───────────────────────────── */
function TeamStats({ group, sport }) {
  const team = group?.team || {};
  const stats = group?.statistics || [];
  const batting  = stats.find((s) => (s.type || s.name) === 'batting')  || stats[0];
  const pitching = stats.find((s) => (s.type || s.name) === 'pitching') || stats[1];

  return (
    <div className="bsm2-team-stats">
      {batting && (
        <>
          <div className="bsm2-stats-heading">
            {team.logo && <img src={team.logo} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />}
            <span>{team.displayName} Hitting</span>
          </div>
          <StatsTable statGroup={batting} sport={sport} />
        </>
      )}
      {pitching && (
        <>
          <div className="bsm2-stats-heading" style={{ marginTop: 16 }}>
            {team.logo && <img src={team.logo} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />}
            <span>{team.displayName} Pitching</span>
          </div>
          <StatsTable statGroup={pitching} sport={sport} />
        </>
      )}
    </div>
  );
}

/* ─── Main Modal ───────────────────────────────────── */
export default function BoxScoreModal({ sport, game, onClose }) {
  const { data, loading, error } = useBoxScore(sport, game?.id);
  const [activeTeam, setActiveTeam] = useState(0);

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const comp     = data?.header?.competitions?.[0];
  const comps    = comp?.competitors || [];
  const status   = comp?.status;
  const players  = data?.boxscore?.players || [];
  const situation = data?.situation;
  const rosters  = data?.rosters || [];

  const away = comps.find((c) => c.homeAway === 'away') || comps[0];
  const home = comps.find((c) => c.homeAway === 'home') || comps[1];
  const awayGroup = players.find((p) => p.team?.id === away?.team?.id) || players[0];
  const homeGroup = players.find((p) => p.team?.id === home?.team?.id) || players[1];
  const groups = [awayGroup, homeGroup].filter(Boolean);
  const awayAbbr = away?.team?.abbreviation || 'Away';
  const homeAbbr = home?.team?.abbreviation || 'Home';

  return (
    <div className="bsm2-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bsm2-panel">
        {/* Top bar */}
        <div className="bsm2-topbar">
          <span className="bsm2-title">Box Score</span>
          <button className="bsm-close" onClick={onClose}>✕</button>
        </div>

        {loading && <div style={{ padding: 24, color: 'var(--text2)' }}>Loading…</div>}
        {error   && <div style={{ padding: 24, color: 'var(--danger)' }}>{error}</div>}

        {!loading && !error && data && (
          <>
            {/* Sticky header — always visible */}
            <div className="bsm2-sticky-top">
              <Header competitors={comps} status={status} />
              {(sport === 'mlb' || sport === 'nhl') && comps.length > 0 && (
                <LineScore competitors={comps} />
              )}
              {situation && (
                <SituationBar situation={situation} rosters={rosters} status={status} />
              )}
              {groups.length > 1 && (
                <div className="bsm2-tabs">
                  <button className={`bsm2-tab ${activeTeam === 0 ? 'bsm2-tab-active' : ''}`} onClick={() => setActiveTeam(0)}>{awayAbbr}</button>
                  <button className={`bsm2-tab ${activeTeam === 1 ? 'bsm2-tab-active' : ''}`} onClick={() => setActiveTeam(1)}>{homeAbbr}</button>
                </div>
              )}
            </div>

            {/* Scrollable stats */}
            <div className="bsm2-scroll">
              <div className="bsm2-body">
                {groups[activeTeam] && <TeamStats group={groups[activeTeam]} sport={sport} />}
                {!groups.length && (
                  <div style={{ padding: 20, color: 'var(--text2)', textAlign: 'center' }}>Box score not available yet.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
