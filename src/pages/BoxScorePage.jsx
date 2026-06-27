import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import useBoxScore from '../hooks/useBoxScore';
import { getTeamLogo, getTeamLogoFallback } from '../api/espn';

/* ─── helpers ──────────────────────────────────────── */
function teamLogo(team) { return team?.logo || team?.logos?.[0]?.href || null; }

function darkUrl(url) {
  if (!url) return url;
  return url.replace(/(\/i\/teamlogos\/[^/]+\/)(\d+)(\/)/, '$1$2-dark$3');
}
function LogoImg({ team, url, className, style }) {
  const dark = team ? getTeamLogo(team) : darkUrl(url);
  const orig = team ? getTeamLogoFallback(team) : url;
  if (!dark && !orig) return null;
  return (
    <img src={dark || orig} onError={(e) => { if (orig && e.target.src !== orig) { e.target.onerror = null; e.target.src = orig; } }}
      alt="" className={className} style={style} />
  );
}
function getScore(c) {
  const s = c?.score;
  if (s == null) return null;
  return typeof s === 'object' ? s.displayValue : String(s);
}
function buildRosterMap(rosters = []) {
  const map = {};
  rosters.forEach((r) => (r.roster || []).forEach((e) => { const a = e.athlete||{}; if (a.id) map[String(a.id)] = {...a,jersey:e.jersey}; }));
  return map;
}

/* ─── Base Diamond ──────────────────────────────────── */
function BaseDiamond({ onFirst, onSecond, onThird, size = 44 }) {
  return (
    <svg viewBox="0 0 44 44" style={{ width: size, height: size, flexShrink: 0 }}>
      <rect x="16" y="2"  width="12" height="12" rx="1.5" className={`tr-base ${onSecond ? 'tr-base-on' : ''}`} transform="rotate(45 22 8)" />
      <rect x="2"  y="16" width="12" height="12" rx="1.5" className={`tr-base ${onThird  ? 'tr-base-on' : ''}`} transform="rotate(45 8 22)" />
      <rect x="30" y="16" width="12" height="12" rx="1.5" className={`tr-base ${onFirst  ? 'tr-base-on' : ''}`} transform="rotate(45 36 22)" />
      <rect x="16" y="30" width="12" height="12" rx="1.5" className="tr-base" transform="rotate(45 22 36)" />
    </svg>
  );
}

/* ─── PREVIEW TAB ──────────────────────────────────── */
const WEATHER_ICONS = { '1':'☀️','2':'⛅','3':'🌥','4':'☁️','5':'🌧','6':'🌦','7':'🌩','8':'❄️','11':'🌫','12':'🌧','13':'🌨','14':'⛈','15':'⛈','16':'❄️','17':'⛈','18':'🌧','19':'🌨','20':'🌨','21':'🌨','22':'❄️','23':'🌬','25':'🌧','26':'🌧','29':'🌧','30':'🌡️','31':'🧊','32':'☀️','33':'🌙','34':'⛅','35':'⛅','36':'🌥','37':'🌧','38':'⛈','39':'🌧','40':'🌧','41':'❄️','42':'❄️','43':'❄️','44':'⛅' };

function PreviewTab({ data, competitors, status, sport }) {
  const gameInfo = data?.gameInfo || {};
  const weather = gameInfo.venue ? gameInfo : null;
  const venue = gameInfo.venue?.fullName;
  const wx = gameInfo.weather;
  const predictor = data?.predictor;
  const lastFiveGames = data?.lastFiveGames || [];

  const away = competitors?.find((c) => c.homeAway === 'away') || competitors?.[0];
  const home = competitors?.find((c) => c.homeAway === 'home') || competitors?.[1];

  return (
    <div className="preview-wrap">
      {/* Game info */}
      {(venue || wx) && (
        <div className="preview-card">
          {venue && <div className="preview-info-row"><span className="preview-label">🏟 Venue</span><span>{venue}</span></div>}
          {wx?.temperature && (
            <div className="preview-info-row">
              <span className="preview-label">{WEATHER_ICONS[wx.conditionId] || '🌤'} Weather</span>
              <span>{wx.temperature}°F{wx.gust ? `, ${wx.gust}mph wind` : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Win probability */}
      {predictor?.homeTeam && (
        <div className="preview-card">
          <div className="preview-card-title">Win Probability</div>
          <div className="preview-prob-row">
            <div className="preview-prob-team">
              <LogoImg team={away?.team} className="preview-team-logo" />
              <span>{away?.team?.abbreviation}</span>
              <span className="preview-prob-pct">{predictor.awayTeam?.gameProjection}%</span>
            </div>
            <div className="preview-prob-bar">
              <div className="preview-prob-fill-away" style={{ width: `${predictor.awayTeam?.gameProjection}%` }} />
              <div className="preview-prob-fill-home" style={{ width: `${predictor.homeTeam?.gameProjection}%` }} />
            </div>
            <div className="preview-prob-team preview-prob-team-right">
              <span className="preview-prob-pct">{predictor.homeTeam?.gameProjection}%</span>
              <span>{home?.team?.abbreviation}</span>
              <LogoImg team={home?.team} className="preview-team-logo" />
            </div>
          </div>
        </div>
      )}

      {/* MLB: Starting pitchers */}
      {sport === 'mlb' && (
        <div className="preview-card">
          <div className="preview-card-title">Starting Pitchers</div>
          <div className="preview-pitchers">
            {[away, home].filter(Boolean).map((c) => {
              const probable = c.probables?.[0];
              if (!probable) return null;
              const ath = probable.athlete;
              const stats = probable.statistics?.splits?.categories || [];
              const statMap = {};
              stats.forEach((s) => { statMap[s.abbreviation] = s.displayValue; });
              return (
                <div key={c.team?.id} className="preview-pitcher">
                  <div className="preview-pitcher-header">
                    <LogoImg team={c.team} className="preview-pitcher-team" />
                    <span className="preview-pitcher-team-abbr">{c.team?.abbreviation}</span>
                    <span className="preview-pitcher-ha">{c.homeAway === 'home' ? 'Home' : 'Away'}</span>
                  </div>
                  <div className="preview-pitcher-row">
                    {ath?.headshot?.href && <img src={ath.headshot.href} alt="" className="preview-pitcher-avatar" />}
                    <div className="preview-pitcher-info">
                      <div className="preview-pitcher-name">{ath?.fullName}</div>
                      <div className="preview-pitcher-sub">#{ath?.jersey} · {ath?.throws?.displayValue}-HP</div>
                      <div className="preview-pitcher-stats">
                        {statMap['W'] && statMap['L'] && <span className="preview-stat-pill">{statMap['W']}-{statMap['L']}</span>}
                        {(statMap['FI'] || statMap['PI']) && <span className="preview-stat-pill">{statMap['FI'] || 0}.{statMap['PI'] || 0} IP</span>}
                        {statMap['ERA'] && <span className="preview-stat-pill">{statMap['ERA']} ERA</span>}
                        {statMap['WHIP'] && <span className="preview-stat-pill">{statMap['WHIP']} WHIP</span>}
                        {statMap['K'] && <span className="preview-stat-pill">{statMap['K']} K</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Last 5 games */}
      {lastFiveGames.length > 0 && (
        <div className="preview-card">
          <div className="preview-card-title">Recent Form</div>
          <div className="preview-last5">
            {lastFiveGames.map((teamData) => {
              const teamInfo = teamData.team;
              const events = (teamData.events || []).slice(-5);
              return (
                <div key={teamInfo?.id} className="preview-last5-team">
                  <div className="preview-last5-header">
                    {teamInfo?.id === away?.team?.id
                      ? <LogoImg team={away?.team} className="preview-team-logo" />
                      : <LogoImg team={home?.team} className="preview-team-logo" />}
                    <span className="preview-last5-abbr">{teamInfo?.abbreviation}</span>
                  </div>
                  <div className="preview-last5-games">
                    {events.map((e, i) => {
                      const won = e.gameResult === 'W';
                      return (
                        <div key={i} className={`preview-last5-dot ${won ? 'preview-dot-w' : 'preview-dot-l'}`} title={`${e.atVs} ${e.opponent?.abbreviation}: ${e.score}`}>
                          {won ? 'W' : 'L'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── GAMECAST TAB ──────────────────────────────────── */
function CountDots({ filled, total, color }) {
  return (
    <div className="bs-count-dots">
      {Array.from({length:total}).map((_,i) => (
        <span key={i} className={`bs-count-dot ${i < filled ? `bs-dot-${color}` : ''}`} />
      ))}
    </div>
  );
}

function MlbGamecast({ data, rosters, situation, competitors, status }) {
  const rosterMap = buildRosterMap(rosters);
  const pitcher = rosterMap[String(situation?.pitcher?.playerId)];
  const batter  = rosterMap[String(situation?.batter?.playerId)];

  const isLive = status?.type?.state === 'in';
  const shortDetail = status?.type?.shortDetail || '';
  const isBot = shortDetail.toLowerCase().startsWith('bot');

  const plays = data?.plays || [];
  // Recent plays (last 10 non-event plays)
  const recentPlays = plays.filter((p) => {
    const t = p.type?.type || '';
    return !['start-inning','end-inning'].includes(t);
  }).slice(-8).reverse();

  // Scoring plays
  const scoringPlays = plays.filter((p) => p.scoringPlay).slice(-5).reverse();

  const away = competitors?.find((c) => c.homeAway === 'away') || competitors?.[0];
  const home = competitors?.find((c) => c.homeAway === 'home') || competitors?.[1];

  return (
    <div className="gamecast-wrap">
      {/* Situation */}
      {isLive && situation && (
        <>
          <div className="gc-inning-bar">
            <span className={`gc-half ${isBot ? 'gc-bot' : 'gc-top'}`}>{isBot ? '▼' : '▲'} {shortDetail}</span>
            {situation.lastPlay?.id && recentPlays[0]?.text && (
              <span className="gc-last-play">{recentPlays[0].text}</span>
            )}
          </div>

      {/* Teams score bar — away on top, home on bottom */}
      <div className="gc-score-row">
        {[away, home].filter(Boolean).sort((a,b) => a.homeAway==='away' ? -1 : 1).map((c) => (
              <div key={c.team?.id} className="gc-team-score-row">
                <LogoImg team={c.team} className="gc-team-logo" />
                <span className="gc-team-abbr">{c.team?.abbreviation}</span>
                <span className="gc-team-record">{c.record?.[0]?.displayValue}</span>
                <div className="gc-rhe">
                  <span className="gc-rhe-val">{getScore(c) ?? '0'}</span>
                  <span className="gc-rhe-label">R</span>
                  <span className="gc-rhe-val">{c.hits ?? '0'}</span>
                  <span className="gc-rhe-label">H</span>
                  <span className="gc-rhe-val">{c.errors ?? '0'}</span>
                  <span className="gc-rhe-label">E</span>
                </div>
              </div>
            ))}
          </div>

          {/* Pitcher / Count / Batter */}
          <div className="gc-at-bat">
            {pitcher && (
              <div className="gc-player-block">
                <div className="gc-player-role">PITCHING</div>
                <div className="gc-player-row">
                  {pitcher.headshot?.href && <img src={pitcher.headshot.href} alt="" className="gc-avatar" />}
                  <div>
                    <div className="gc-player-name">{pitcher.shortName || pitcher.displayName}</div>
                    {pitcher.jersey && <div className="gc-player-sub">#{pitcher.jersey}</div>}
                  </div>
                </div>
              </div>
            )}

            <div className="gc-count-diamond">
              <BaseDiamond onFirst={!!situation.onFirst} onSecond={!!situation.onSecond} onThird={!!situation.onThird} size={52} />
              <div className="gc-count-col">
                <div className="gc-count-row"><span className="gc-count-label">B</span><CountDots filled={situation.balls||0} total={4} color="green" /></div>
                <div className="gc-count-row"><span className="gc-count-label">S</span><CountDots filled={situation.strikes||0} total={3} color="yellow" /></div>
                <div className="gc-count-row"><span className="gc-count-label">O</span><CountDots filled={situation.outs||0} total={3} color="red" /></div>
              </div>
            </div>

            {batter && (
              <div className="gc-player-block gc-player-block-right">
                <div className="gc-player-role">NOW AT BAT</div>
                <div className="gc-player-row">
                  {batter.headshot?.href && <img src={batter.headshot.href} alt="" className="gc-avatar" />}
                  <div>
                    <div className="gc-player-name">{batter.shortName || batter.displayName}</div>
                    {batter.jersey && <div className="gc-player-sub">#{batter.jersey}</div>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Situation notes */}
          {(data?.situation?.situationNotes || []).map((n, i) => (
            <div key={i} className="gc-note">{n.text}</div>
          ))}
        </>
      )}

      {/* Recent plays */}
      {recentPlays.length > 0 && (
        <div className="gc-plays-section">
          <div className="gc-section-label">Recent Plays</div>
          {recentPlays.slice(0, 6).map((p) => (
            <div key={p.id} className={`gc-play-row ${p.scoringPlay ? 'gc-play-scoring' : ''}`}>
              <div className="gc-play-period">{p.period?.displayValue}</div>
              <div className="gc-play-text">{p.text}</div>
              {p.scoringPlay && <div className="gc-play-score">{p.awayScore}-{p.homeScore}</div>}
            </div>
          ))}
        </div>
      )}

      {!isLive && scoringPlays.length > 0 && (
        <div className="gc-plays-section">
          <div className="gc-section-label">Scoring Summary</div>
          {scoringPlays.map((p) => (
            <div key={p.id} className="gc-play-row gc-play-scoring">
              <div className="gc-play-period">{p.period?.displayValue}</div>
              <div className="gc-play-text">{p.text}</div>
              <div className="gc-play-score">{p.awayScore}-{p.homeScore}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GenericGamecast({ data, situation, competitors, status, sport }) {
  const plays = data?.plays || [];
  const recentPlays = plays.slice(-8).reverse();
  const scoringPlays = plays.filter((p) => p.scoringPlay).slice(-8).reverse();
  const isLive = status?.type?.state === 'in';
  const shortDetail = status?.type?.shortDetail || '';

  return (
    <div className="gamecast-wrap">
      {isLive && (
        <div className="gc-inning-bar">
          <span className="gc-half">{shortDetail}</span>
          {situation?.balls !== undefined && (
            <span className="gc-count-text">
              {situation.balls}-{situation.strikes} · {situation.outs} out{situation.outs !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {recentPlays.length > 0 && (
        <div className="gc-plays-section">
          <div className="gc-section-label">{isLive ? 'Recent Plays' : 'Scoring Summary'}</div>
          {(isLive ? recentPlays : scoringPlays).slice(0, 8).map((p) => (
            <div key={p.id} className={`gc-play-row ${p.scoringPlay ? 'gc-play-scoring' : ''}`}>
              <div className="gc-play-period">{p.period?.displayValue}</div>
              <div className="gc-play-text">{p.text}</div>
              {p.scoringPlay && <div className="gc-play-score">{p.awayScore}-{p.homeScore}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── PLAY BY PLAY TAB ──────────────────────────────── */
function PlayByPlay({ data, competitors, sport }) {
  const [showScoring, setShowScoring] = useState(false);
  const plays = data?.plays || [];

  const away = competitors?.find((c) => c.homeAway === 'away') || competitors?.[0];
  const home = competitors?.find((c) => c.homeAway === 'home') || competitors?.[1];

  // Group plays by period/half-inning
  const groups = [];
  let current = null;
  const filtered = showScoring ? plays.filter((p) => p.scoringPlay) : plays;

  for (const p of filtered) {
    const t = p.type?.type || '';
    const key = p.period?.displayValue || '';

    // Start new group on new inning/period
    if (t === 'start-inning' || t === 'start-period' || !current || current.key !== key) {
      if (current) groups.push(current);
      const teamId = p.team?.id;
      const teamData = competitors?.find((c) => c.team?.id === teamId);
      current = {
        key,
        label: p.text || key,
        teamLogo: teamLogo(teamData?.team),
        teamName: teamData?.team?.shortDisplayName || teamData?.team?.abbreviation,
        plays: [],
        awayScore: p.awayScore,
        homeScore: p.homeScore,
      };
    } else if (t !== 'start-inning' && t !== 'start-period') {
      current.plays.push(p);
      current.awayScore = p.awayScore;
      current.homeScore = p.homeScore;
    }
  }
  if (current) groups.push(current);

  return (
    <div className="pbp-wrap">
      {/* Toggle */}
      <div className="pbp-toggle">
        <button className={`pbp-tog-btn ${!showScoring ? 'pbp-tog-active' : ''}`} onClick={() => setShowScoring(false)}>All Plays</button>
        <button className={`pbp-tog-btn ${showScoring ? 'pbp-tog-active' : ''}`} onClick={() => setShowScoring(true)}>Scoring Plays</button>
      </div>

      {plays.length === 0 && <div className="tp-loading">Play-by-play not available.</div>}

      {groups.slice().reverse().map((g, gi) => (
        <div key={gi} className="pbp-group">
          <div className="pbp-group-header">
            <LogoImg url={g.teamLogo} className="pbp-team-logo" />
            <span className="pbp-group-label">{g.label}</span>
            <span className="pbp-score">{away?.team?.abbreviation} {g.awayScore} · {home?.team?.abbreviation} {g.homeScore}</span>
          </div>
          {g.plays.filter((p) => p.text && p.type?.type !== 'end-inning').map((p) => (
            <div key={p.id} className={`pbp-play ${p.scoringPlay ? 'pbp-play-scoring' : ''}`}>
              <div className="pbp-play-icon">
                {p.scoringPlay ? '🔴' : p.type?.type?.includes('pitch') ? '⚾' : '·'}
              </div>
              <div className="pbp-play-text">{p.text}</div>
            </div>
          ))}
          {g.plays.length === 0 && <div className="pbp-play-text" style={{padding:'8px 12px',color:'var(--text2)'}}>No plays yet.</div>}
        </div>
      ))}
    </div>
  );
}

/* ─── BOX SCORE TAB (unchanged) ─────────────────────── */
const COLS = {
  mlb_batting:  ['AB','R','H','RBI','HR','BB','K','AVG','OBP','SLG'],
  mlb_pitching: ['IP','H','R','ER','BB','K','HR','ERA'],
  nba:          ['MIN','PTS','REB','AST','STL','BLK','FG','3PT','+/-'],
  nfl_passing:  ['C/ATT','YDS','TD','INT','RTG'],
  nfl_rushing:  ['CAR','YDS','AVG','TD'],
  nfl_receiving:['REC','YDS','AVG','TD'],
  nhl:          ['G','A','PTS','+/-','SOG','TOI'],
};
const HL = { mlb: ['H','HR','RBI','ERA'], nba: ['PTS','REB','AST'], nfl: ['YDS','TD'], nhl: ['G','A','PTS'] };

function getColKey(sport, type) {
  if (sport === 'mlb') return type === 'pitching' ? 'mlb_pitching' : 'mlb_batting';
  if (sport === 'nba') return 'nba';
  if (sport === 'nhl') return 'nhl';
  if (sport === 'nfl') {
    if (type?.includes('pass')) return 'nfl_passing';
    if (type?.includes('rush')) return 'nfl_rushing';
    return 'nfl_receiving';
  }
  return null;
}

function StatsTable({ statGroup, sport }) {
  const navigate = useNavigate();
  const labels   = statGroup.labels || [];
  const athletes = statGroup.athletes || [];
  const totals   = statGroup.totals || [];
  const type     = (statGroup.type || statGroup.name || '').toLowerCase();
  const isMlbBat = sport === 'mlb' && type !== 'pitching';
  const key  = getColKey(sport, type);
  const want = key ? COLS[key] : [];
  const cols = want.length
    ? want.map((w) => ({ label: w, index: labels.indexOf(w) })).filter((c) => c.index !== -1)
    : labels.map((l, i) => ({ label: l, index: i })).slice(0, 8);
  const hl = HL[sport] || [];
  if (!athletes.length) return null;

  return (
    <div className="bsp-table-wrap">
      <table className="bsp-table">
        <thead>
          <tr>
            <th className="bsp-th bsp-th-player">{type === 'pitching' ? 'PITCHERS' : 'HITTERS'}</th>
            {cols.map((c) => <th key={c.label} className="bsp-th">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {athletes.map((a, i) => {
            const player = a.athlete || {};
            const stats  = a.stats || [];
            const dnp    = a.didNotPlay || !stats.length;
            // MLB: indent substitute players (starter===false)
            const isSub  = isMlbBat && a.starter === false;
            return (
              <tr key={i} className={`bsp-tr ${dnp ? 'bsp-dnp' : ''} ${player.id ? 'bsp-tr-clickable' : ''} ${isSub ? 'bsp-tr-sub' : ''}`}
                onClick={() => player.id && navigate(`/player/${sport}/${player.id}`)}>
                <td className="bsp-td bsp-td-player">
                  <div className={`bsp-player-cell ${isSub ? 'bsp-player-sub' : ''}`}>
                    <div>
                      <span className="bsp-player-name">{player.shortName || player.displayName}</span>
                      <span className="bsp-player-pos"> {a.position?.abbreviation || ''}</span>
                    </div>
                  </div>
                </td>
                {dnp
                  ? <td className="bsp-td" colSpan={cols.length} style={{color:'var(--text2)',fontStyle:'italic'}}>DNP</td>
                  : cols.map((c) => (
                    <td key={c.label} className={`bsp-td ${hl.includes(c.label) ? 'bsp-hl' : ''}`}>
                      {stats[c.index] ?? '—'}
                    </td>
                  ))}
              </tr>
            );
          })}
          {totals.length > 0 && (
            <tr className="bsp-totals">
              <td className="bsp-td bsp-td-player bsp-totals-label">TEAM</td>
              {cols.map((c) => <td key={c.label} className="bsp-td">{totals[c.index] ?? ''}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ── MLB batting/fielding notes (2B, HR, RBI, DP, etc.) ──────────── */
function MLBGameNotes({ details }) {
  if (!details?.length) return null;
  const batting  = details.find((d) => d.name === 'battingDetails');
  const fielding = details.find((d) => d.name === 'fieldingDetails');
  const sections = [batting, fielding].filter(Boolean);
  if (!sections.length) return null;
  return (
    <div className="bsp-mlb-notes">
      {sections.map((section) => (
        <div key={section.name} className="bsp-notes-section">
          <div className="bsp-notes-heading">{section.displayName?.toUpperCase()}</div>
          {(section.stats || []).map((stat) => (
            <div key={stat.abbreviation} className="bsp-notes-row">
              <span className="bsp-notes-label">{stat.shortDisplayName || stat.abbreviation}:</span>
              <span className="bsp-notes-value">{stat.displayValue}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TeamStats({ group, sport, teamDetails }) {
  const team    = group?.team || {};
  const stats   = group?.statistics || [];
  const batting  = stats.find((s) => (s.type||s.name) === 'batting')  || stats[0];
  const pitching = stats.find((s) => (s.type||s.name) === 'pitching') || stats[1];
  return (
    <div className="bsp-team-stats">
      {batting && (<>
        <div className="bsp-stats-heading">
          <LogoImg team={team} style={{width:20,height:20,objectFit:'contain'}} />
          <span>{team.displayName} Hitting</span>
        </div>
        <StatsTable statGroup={batting} sport={sport} />
        {sport === 'mlb' && <MLBGameNotes details={teamDetails} />}
      </>)}
      {pitching && (<>
        <div className="bsp-stats-heading" style={{marginTop:16}}>
          <LogoImg team={team} style={{width:20,height:20,objectFit:'contain'}} />
          <span>{team.displayName} Pitching</span>
        </div>
        <StatsTable statGroup={pitching} sport={sport} />
      </>)}
    </div>
  );
}

/* ─── Line Score ─────────────────────────────────────── */
function LineScore({ competitors, sport }) {
  if (!['mlb','nhl'].includes(sport)) return null;
  // Always show away on top, home on bottom (standard convention)
  const sorted = [...competitors].sort((a, b) => {
    if (a.homeAway === 'away') return -1;
    if (b.homeAway === 'away') return 1;
    return 0;
  });
  const maxPeriods = Math.max(...sorted.map((c) => (c.linescores||[]).length), sport === 'mlb' ? 9 : 3);
  const cols = Array.from({length: maxPeriods}, (_, i) => i + 1);
  return (
    <div className="bsp-linescore-wrap">
      <table className="bsp-linescore">
        <thead>
          <tr>
            <th className="bsp-ls-th bsp-ls-team-col" />
            {cols.map((n) => <th key={n} className="bsp-ls-th">{n}</th>)}
            <th className="bsp-ls-th bsp-ls-rhe">R</th>
            <th className="bsp-ls-th bsp-ls-rhe">H</th>
            <th className="bsp-ls-th bsp-ls-rhe">E</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.team?.id}>
              <td className="bsp-ls-td bsp-ls-team-col">
                <LogoImg team={c.team} className="bsp-ls-logo" />
                <span className="bsp-ls-abbr">{c.team?.abbreviation}</span>
              </td>
              {cols.map((_,i) => (
                <td key={i} className="bsp-ls-td">{c.linescores?.[i]?.displayValue ?? '—'}</td>
              ))}
              <td className="bsp-ls-td bsp-ls-rhe bsp-ls-bold">{c.score ?? '0'}</td>
              <td className="bsp-ls-td bsp-ls-rhe">{c.hits ?? '0'}</td>
              <td className="bsp-ls-td bsp-ls-rhe">{c.errors ?? '0'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Game Header ────────────────────────────────────── */
function GameHeader({ competitors, status }) {
  const away = competitors?.find((c) => c.homeAway === 'away') || competitors?.[0];
  const home = competitors?.find((c) => c.homeAway === 'home') || competitors?.[1];
  const isLive = status?.type?.state === 'in';
  const isFinal = status?.type?.state === 'post';
  const shortDetail = status?.type?.shortDetail || '';
  return (
    <div className="bsp-header">
      <div className="bsp-team">
        <LogoImg team={away?.team} className="bsp-team-logo" />
        <div className="bsp-team-abbr">{away?.team?.abbreviation}</div>
        <div className="bsp-score">{getScore(away) ?? '—'}</div>
        <div className="bsp-record">{away?.record?.[0]?.displayValue}</div>
      </div>
      <div className="bsp-center">
        {isLive && <span className="badge badge-live" style={{fontSize:11}}><span className="live-dot" /> LIVE</span>}
        {isFinal && <span className="badge badge-final" style={{fontSize:11}}>Final</span>}
        {!isLive && !isFinal && <span className="badge badge-pre" style={{fontSize:11}}>{shortDetail}</span>}
        <div className="bsp-detail">{isLive ? shortDetail : ''}</div>
        <BaseDiamond size={28} />
      </div>
      <div className="bsp-team bsp-team-right">
        <LogoImg team={home?.team} className="bsp-team-logo" />
        <div className="bsp-team-abbr">{home?.team?.abbreviation}</div>
        <div className="bsp-score">{getScore(home) ?? '—'}</div>
        <div className="bsp-record">{home?.record?.[0]?.displayValue}</div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */
export default function BoxScorePage() {
  const { sport, gameId } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useBoxScore(sport, gameId);
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => location.state?.tab || 'Gamecast');
  const [bsTeam, setBsTeam] = useState(0);

  const comp   = data?.header?.competitions?.[0];
  const comps  = comp?.competitors || [];
  const status = comp?.status;
  const isLive = status?.type?.state === 'in';
  const isFinal = status?.type?.state === 'post';
  const players      = data?.boxscore?.players || [];
  const bsTeams      = data?.boxscore?.teams   || [];  // contains .details with batting/fielding notes
  const situation    = data?.situation;
  const rosters      = data?.rosters || [];

  const away = comps.find((c) => c.homeAway === 'away') || comps[0];
  const home = comps.find((c) => c.homeAway === 'home') || comps[1];
  const awayGroup   = players.find((p) => p.team?.id === away?.team?.id) || players[0];
  const homeGroup   = players.find((p) => p.team?.id === home?.team?.id) || players[1];
  const groups      = [awayGroup, homeGroup].filter(Boolean);
  // Team details (batting/fielding notes) keyed by team id
  const awayDetails = bsTeams.find((t) => t.team?.id === away?.team?.id)?.details || [];
  const homeDetails = bsTeams.find((t) => t.team?.id === home?.team?.id)?.details || [];
  const groupDetails = [awayDetails, homeDetails];

  const isPre = status?.type?.state === 'pre';

  // Auto-select best tab only if no tab was passed via navigation state
  useEffect(() => {
    if (!loading && !location.state?.tab) {
      if (isPre) setActiveTab('Preview');
      else if (!isLive) setActiveTab('Box Score');
      else setActiveTab('Gamecast');
    }
  }, [loading, isLive, isPre]);

  const tabs = isPre
    ? ['Preview']
    : isLive
    ? ['Gamecast', 'Box Score', 'Play-by-Play']
    : ['Box Score', 'Play-by-Play', 'Gamecast'];

  return (
    <div className="bsp-page">
      <button className="tp-back" onClick={() => navigate(-1)}>← Back</button>

      {loading && <div className="tp-loading">Loading…</div>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && data && (
        <>
          <GameHeader competitors={comps} status={status} />
          <LineScore competitors={comps} sport={sport} />

          {/* Tabs */}
          <div className="bsp-tabs-row">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={`bsp-tab-btn ${activeTab === tab ? 'bsp-tab-btn-active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="bsp-tab-content">
            {activeTab === 'Preview' && (
              <PreviewTab data={data} competitors={comps} status={status} sport={sport} />
            )}

            {activeTab === 'Gamecast' && (
              sport === 'mlb'
                ? <MlbGamecast data={data} rosters={rosters} situation={situation} competitors={comps} status={status} />
                : <GenericGamecast data={data} situation={situation} competitors={comps} status={status} sport={sport} />
            )}

            {activeTab === 'Box Score' && (
              <div>
                {groups.length > 1 && (
                  <div className="bsp-team-toggle">
                    <button className={`bsp-tab ${bsTeam === 0 ? 'bsp-tab-active' : ''}`} onClick={() => setBsTeam(0)}>
                      {away?.team?.abbreviation || 'Away'}
                    </button>
                    <button className={`bsp-tab ${bsTeam === 1 ? 'bsp-tab-active' : ''}`} onClick={() => setBsTeam(1)}>
                      {home?.team?.abbreviation || 'Home'}
                    </button>
                  </div>
                )}
                {groups[bsTeam] && <TeamStats group={groups[bsTeam]} sport={sport} teamDetails={groupDetails[bsTeam]} />}
                {!groups.length && <div className="empty-state"><div className="empty-icon">📋</div><p>Box score not available yet.</p></div>}
              </div>
            )}

            {activeTab === 'Play-by-Play' && (
              <PlayByPlay data={data} competitors={comps} sport={sport} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
