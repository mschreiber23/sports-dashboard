import { useEffect, useMemo } from 'react';
import useBoxScore from '../hooks/useBoxScore';

/* ─── helpers ─────────────────────────────────────── */

function buildRosterMap(rosters = []) {
  const map = {};
  rosters.forEach((r) => {
    (r.roster || []).forEach((entry) => {
      const a = entry.athlete || {};
      if (a.id) map[a.id] = { ...a, jersey: entry.jersey };
    });
  });
  return map;
}

/* ─── Live Situation Bar (baseball) ─────────────────── */

function BaseDiamond({ onFirst, onSecond, onThird }) {
  return (
    <svg viewBox="0 0 60 60" className="base-diamond">
      {/* bases rendered as rotated squares */}
      <rect x="22" y="2" width="16" height="16" rx="2"
        className={`base ${onSecond ? 'base-on' : ''}`} transform="rotate(45 30 10)" />
      <rect x="2" y="22" width="16" height="16" rx="2"
        className={`base ${onThird ? 'base-on' : ''}`} transform="rotate(45 10 30)" />
      <rect x="42" y="22" width="16" height="16" rx="2"
        className={`base ${onFirst ? 'base-on' : ''}`} transform="rotate(45 50 30)" />
      <rect x="22" y="42" width="16" height="16" rx="2"
        className="base" transform="rotate(45 30 50)" />
    </svg>
  );
}

function CountDots({ filled, total, color }) {
  return (
    <div className="count-dots">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`count-dot ${i < filled ? `count-dot-${color}` : ''}`} />
      ))}
    </div>
  );
}

function SituationBar({ situation, rosters, status, competitors }) {
  if (!situation || !status) return null;
  const state = status?.type?.state;
  if (state === 'pre' || state === 'post') return null;

  const rosterMap = buildRosterMap(rosters);
  const pitcher = rosterMap[situation.pitcher?.playerId];
  const batter = rosterMap[situation.batter?.playerId];

  const inningText = status?.type?.shortDetail || '';
  const period = status?.period;
  const isBot = status?.type?.description?.toLowerCase().includes('bot') ||
    status?.type?.shortDetail?.toLowerCase().includes('bot');

  const away = competitors?.find((c) => c.homeAway === 'away') || competitors?.[0];
  const home = competitors?.find((c) => c.homeAway === 'home') || competitors?.[1];

  return (
    <div className="situation-bar">
      <div className="sit-inning">
        <span className={`sit-half ${isBot ? 'sit-bot' : 'sit-top'}`}>
          {isBot ? '▼' : '▲'} {period ? `${period}${['st','nd','rd'][period-1]||'th'}` : ''}
        </span>
      </div>

      <div className="sit-teams">
        {[away, home].filter(Boolean).map((c) => (
          <div key={c.team?.id} className="sit-team-row">
            {c.team?.logo && <img src={c.team.logo} alt={c.team.abbreviation} className="sit-team-logo" />}
            <span className="sit-team-abbr">{c.team?.abbreviation}</span>
            <span className="sit-stat-label">R</span><span className="sit-stat-val">{c.score ?? 0}</span>
            <span className="sit-stat-label">H</span><span className="sit-stat-val">{c.hits ?? 0}</span>
            <span className="sit-stat-label">E</span><span className="sit-stat-val">{c.errors ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="sit-bases-count">
        <BaseDiamond
          onFirst={!!situation.onFirst}
          onSecond={!!situation.onSecond}
          onThird={!!situation.onThird}
        />
        <div className="sit-count">
          <div className="sit-count-row">
            <span className="sit-count-label">B</span>
            <CountDots filled={situation.balls ?? 0} total={4} color="green" />
          </div>
          <div className="sit-count-row">
            <span className="sit-count-label">S</span>
            <CountDots filled={situation.strikes ?? 0} total={3} color="yellow" />
          </div>
          <div className="sit-count-row">
            <span className="sit-count-label">O</span>
            <CountDots filled={situation.outs ?? 0} total={3} color="red" />
          </div>
        </div>
      </div>

      {pitcher && (
        <div className="sit-player">
          <div className="sit-player-label">PITCHING</div>
          <div className="sit-player-info">
            {pitcher.headshot?.href && (
              <img src={pitcher.headshot.href} alt="" className="sit-player-avatar" />
            )}
            <div>
              <div className="sit-player-name">
                {pitcher.shortName || pitcher.displayName}
                {pitcher.jersey && <span className="sit-jersey"> #{pitcher.jersey}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {batter && (
        <div className="sit-player">
          <div className="sit-player-label">BATTING</div>
          <div className="sit-player-info">
            {batter.headshot?.href && (
              <img src={batter.headshot.href} alt="" className="sit-player-avatar" />
            )}
            <div>
              <div className="sit-player-name">
                {batter.shortName || batter.displayName}
                {batter.jersey && <span className="sit-jersey"> #{batter.jersey}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Line Score ───────────────────────────────────── */

function LineScore({ competitors }) {
  if (!competitors?.length) return null;

  const maxInnings = Math.max(...competitors.map((c) => (c.linescores || []).length), 9);
  const innings = Array.from({ length: maxInnings }, (_, i) => i + 1);

  return (
    <div className="linescore-wrap">
      <table className="linescore-table">
        <thead>
          <tr>
            <th className="ls-th ls-th-team" />
            {innings.map((n) => <th key={n} className="ls-th">{n}</th>)}
            <th className="ls-th ls-th-rhe">R</th>
            <th className="ls-th ls-th-rhe">H</th>
            <th className="ls-th ls-th-rhe">E</th>
          </tr>
        </thead>
        <tbody>
          {competitors.map((c) => {
            const ls = c.linescores || [];
            return (
              <tr key={c.team?.id} className="ls-tr">
                <td className="ls-td ls-td-team">
                  {c.team?.logo && <img src={c.team.logo} alt="" className="ls-team-logo" />}
                  <span className="ls-team-abbr">{c.team?.abbreviation}</span>
                </td>
                {innings.map((_, i) => (
                  <td key={i} className="ls-td ls-td-num">
                    {ls[i]?.displayValue ?? '—'}
                  </td>
                ))}
                <td className="ls-td ls-td-rhe">{c.score ?? '0'}</td>
                <td className="ls-td ls-td-rhe">{c.hits ?? '0'}</td>
                <td className="ls-td ls-td-rhe">{c.errors ?? '0'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Stats Table ─────────────────────────────────── */

const DISPLAY_COLS = {
  nba: { default: ['MIN','PTS','REB','AST','STL','BLK','FG','3PT','FT','+/-','TO'] },
  mlb: {
    batting: ['AB','R','H','RBI','HR','BB','K','AVG','OBP','SLG'],
    pitching: ['IP','H','R','ER','BB','K','HR','PC-ST','ERA'],
  },
  nfl: {
    passing: ['C/ATT','YDS','AVG','TD','INT','QBR','RTG'],
    rushing: ['CAR','YDS','AVG','TD','LONG'],
    receiving: ['REC','YDS','AVG','TD','LONG','TGTS'],
    default: [],
  },
  nhl: { default: ['G','A','PTS','+/-','SOG','PIM','TOI'] },
};

const HIGHLIGHT = {
  nba: ['PTS','REB','AST'],
  mlb: ['H','HR','RBI','K','ERA','IP'],
  nfl: ['YDS','TD'],
  nhl: ['G','A','PTS'],
};

function filterCols(labels, want) {
  if (!want?.length) return labels.map((l, i) => ({ label: l, index: i })).slice(0, 10);
  const result = [];
  for (const w of want) {
    const i = labels.indexOf(w);
    if (i !== -1) result.push({ label: w, index: i });
  }
  return result.length ? result : labels.map((l, i) => ({ label: l, index: i })).slice(0, 8);
}

function getWantCols(sport, groupType) {
  const cfg = DISPLAY_COLS[sport] || {};
  const t = (groupType || '').toLowerCase();
  return cfg[t] || cfg.default || [];
}

function StatsTable({ statGroup, sport, title }) {
  const labels = statGroup.labels || [];
  const athletes = statGroup.athletes || [];
  const totals = statGroup.totals || [];
  const type = statGroup.type || statGroup.name || '';

  const cols = filterCols(labels, getWantCols(sport, type));
  const highlights = HIGHLIGHT[sport] || [];

  if (!athletes.length) return null;

  return (
    <div className="bs-stat-block">
      {title && <div className="bs-stat-title">{title}</div>}
      <div className="bs-table-wrap">
        <table className="bs-table">
          <thead>
            <tr>
              <th className="bs-th bs-th-player">{type === 'pitching' ? 'PITCHERS' : 'HITTERS'}</th>
              {cols.map((c) => <th key={c.label} className="bs-th">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {athletes.map((a, i) => {
              const player = a.athlete || {};
              const stats = a.stats || [];
              const dnp = a.didNotPlay || !stats.length;
              return (
                <tr key={i} className={`bs-tr ${dnp ? 'bs-dnp' : ''}`}>
                  <td className="bs-td bs-td-player">
                    <div className="bs-player-cell">
                      {player.headshot?.href && (
                        <img src={player.headshot.href} alt="" className="bs-avatar" />
                      )}
                      <div>
                        <span className="bs-player-name">{player.shortName || player.displayName}</span>
                        <span className="bs-player-pos"> {a.position?.abbreviation || ''}</span>
                      </div>
                    </div>
                  </td>
                  {dnp ? (
                    <td className="bs-td bs-dnp-label" colSpan={cols.length}>DNP</td>
                  ) : (
                    cols.map((c) => (
                      <td key={c.label} className={`bs-td ${highlights.includes(c.label) ? 'bs-hl' : ''}`}>
                        {stats[c.index] ?? '—'}
                      </td>
                    ))
                  )}
                </tr>
              );
            })}
            {totals.length > 0 && (
              <tr className="bs-totals-row">
                <td className="bs-td bs-td-player bs-totals-label">TEAM</td>
                {cols.map((c) => (
                  <td key={c.label} className="bs-td">{totals[c.index] ?? ''}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Side-by-side section ──────────────────────────── */

function SideBySideStats({ awayGroup, homeGroup, sport, awayTeam, homeTeam, label }) {
  const awayStats = awayGroup?.statistics || [];
  const homeStats = homeGroup?.statistics || [];

  const awayBatting = awayStats.find((s) => (s.type || s.name) === 'batting') || awayStats[0];
  const homeBatting = homeStats.find((s) => (s.type || s.name) === 'batting') || homeStats[0];
  const awayPitching = awayStats.find((s) => (s.type || s.name) === 'pitching') || awayStats[1];
  const homePitching = homeStats.find((s) => (s.type || s.name) === 'pitching') || homeStats[1];

  if (sport === 'mlb') {
    return (
      <>
        <div className="bs-dual-section">
          <div className="bs-dual-col">
            {awayBatting && (
              <StatsTable
                statGroup={awayBatting}
                sport={sport}
                title={`${awayTeam?.displayName || ''} Hitting`}
              />
            )}
          </div>
          <div className="bs-dual-divider" />
          <div className="bs-dual-col">
            {homeBatting && (
              <StatsTable
                statGroup={homeBatting}
                sport={sport}
                title={`${homeTeam?.displayName || ''} Hitting`}
              />
            )}
          </div>
        </div>

        {(awayPitching || homePitching) && (
          <div className="bs-dual-section">
            <div className="bs-dual-col">
              {awayPitching && (
                <StatsTable
                  statGroup={awayPitching}
                  sport={sport}
                  title={`${awayTeam?.displayName || ''} Pitching`}
                />
              )}
            </div>
            <div className="bs-dual-divider" />
            <div className="bs-dual-col">
              {homePitching && (
                <StatsTable
                  statGroup={homePitching}
                  sport={sport}
                  title={`${homeTeam?.displayName || ''} Pitching`}
                />
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  // For other sports: show each team stacked
  return (
    <>
      {[awayGroup, homeGroup].filter(Boolean).map((group, i) => (
        <div key={i} className="bs-team-section">
          <div className="bs-team-header">
            {group.team?.logo && (
              <img src={group.team.logo} alt="" className="bs-team-logo" />
            )}
            <span className="bs-team-name">{group.team?.displayName}</span>
          </div>
          {(group.statistics || []).map((sg, j) => (
            <StatsTable key={j} statGroup={sg} sport={sport} />
          ))}
        </div>
      ))}
    </>
  );
}

/* ─── Game Header ───────────────────────────────────── */

function GameHeader({ competitors, status }) {
  const away = competitors?.find((c) => c.homeAway === 'away') || competitors?.[0];
  const home = competitors?.find((c) => c.homeAway === 'home') || competitors?.[1];
  const state = status?.type?.state;
  const isLive = state === 'in';
  const isFinal = state === 'post';

  return (
    <div className="bsm-game-header">
      <div className="bsm-side">
        {away?.team?.logo && <img src={away.team.logo} alt="" className="bsm-hdr-logo" />}
        <div className="bsm-hdr-info">
          <div className="bsm-hdr-name">{away?.team?.shortDisplayName || away?.team?.displayName}</div>
          <div className="bsm-hdr-record">{away?.record?.[0]?.displayValue}</div>
          {away?.homeAway && <div className="bsm-hdr-ha">Away</div>}
        </div>
        <div className="bsm-hdr-score">{away?.score ?? '—'}</div>
      </div>

      <div className="bsm-hdr-center">
        {isLive && (
          <div className="bsm-hdr-status">
            <span className="badge badge-live"><span className="live-dot" /> LIVE</span>
          </div>
        )}
        {isFinal && <div className="bsm-hdr-status"><span className="badge badge-final">Final</span></div>}
        {!isLive && !isFinal && (
          <div className="bsm-hdr-status"><span className="badge badge-pre">{status?.type?.shortDetail}</span></div>
        )}
        <div className="bsm-hdr-detail">{isLive ? status?.type?.detail : ''}</div>
      </div>

      <div className="bsm-side bsm-side-right">
        <div className="bsm-hdr-score">{home?.score ?? '—'}</div>
        <div className="bsm-hdr-info bsm-hdr-info-right">
          <div className="bsm-hdr-name">{home?.team?.shortDisplayName || home?.team?.displayName}</div>
          <div className="bsm-hdr-record">{home?.record?.[0]?.displayValue}</div>
          {home?.homeAway && <div className="bsm-hdr-ha">Home</div>}
        </div>
        {home?.team?.logo && <img src={home.team.logo} alt="" className="bsm-hdr-logo" />}
      </div>
    </div>
  );
}

/* ─── Main Modal ─────────────────────────────────────── */

export default function BoxScoreModal({ sport, game, onClose }) {
  const gameId = game?.id;
  const { data, loading, error } = useBoxScore(sport, gameId);

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const comp = data?.header?.competitions?.[0];
  const competitors = comp?.competitors || [];
  const status = comp?.status;
  const players = data?.boxscore?.players || [];
  const situation = data?.situation;
  const rosters = data?.rosters || [];

  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const awayGroup = players.find((p) => p.team?.id === away?.team?.id) || players[0];
  const homeGroup = players.find((p) => p.team?.id === home?.team?.id) || players[1];

  return (
    <div className="bsm-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bsm-panel">
        <div className="bsm-top-bar">
          <span className="bsm-title">Box Score</span>
          <button className="bsm-close" onClick={onClose}>✕</button>
        </div>

        {loading && (
          <div className="bsm-loading">
            <div className="skeleton-card" style={{ height: 100, margin: 20 }} />
            <div className="skeleton-card" style={{ height: 300, margin: '0 20px' }} />
          </div>
        )}

        {error && <div className="error-banner" style={{ margin: 20 }}>{error}</div>}

        {!loading && !error && data && (
          <>
            <GameHeader competitors={competitors} status={status} />

            {/* Live situation strip */}
            {situation && (
              <SituationBar
                situation={situation}
                rosters={rosters}
                status={status}
                competitors={competitors}
              />
            )}

            {/* Line score */}
            {sport === 'mlb' && competitors.length > 0 && (
              <LineScore competitors={competitors} />
            )}
            {sport === 'nhl' && competitors.length > 0 && (
              <LineScore competitors={competitors} />
            )}

            <div className="bsm-body">
              <SideBySideStats
                awayGroup={awayGroup}
                homeGroup={homeGroup}
                sport={sport}
                awayTeam={away?.team}
                homeTeam={home?.team}
              />

              {!players.length && (
                <div className="empty-state">
                  <div className="empty-icon">📋</div>
                  <p>Box score not available yet.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
