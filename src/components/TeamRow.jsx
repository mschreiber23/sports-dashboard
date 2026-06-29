import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useTeamGame from '../hooks/useTeamGame';
import useLiveSituation from '../hooks/useLiveSituation';
import useMlbLiveGame from '../hooks/useMlbLiveGame';
import { mlbHeadshot, extractTopPerformers } from '../hooks/useMlbLiveFeed';
import { useFavorites } from '../context/FavoritesContext';
import { SPORTS, getTeamLogo, getTeamLogoFallback } from '../api/espn';
import { adaptColorForDarkBg } from '../utils/colorUtils';

/** Search ESPN by player name and navigate to their player page. */
async function goToEspnPlayer(fullName, sport, navigate) {
  try {
    const r = await fetch(`https://site.api.espn.com/apis/search/v2?query=${encodeURIComponent(fullName)}&limit=5`);
    const d = await r.json();
    // Results are under d.results; athlete results have type === 'player'
    const playerResult = (d.results || []).find(res => res.type === 'player');
    const hit = playerResult?.contents?.[0];
    if (!hit) return;
    // ESPN athlete ID is in uid as "s:1~l:10~a:36052" — extract the numeric part after "a:"
    const uidMatch = hit.uid?.match(/a:(\d+)/);
    const espnId = uidMatch ? uidMatch[1] : null;
    if (espnId) navigate(`/player/${sport}/${espnId}`);
  } catch {}
}

function LogoImg({ team, className, style }) {
  const dark = getTeamLogo(team);
  const orig = getTeamLogoFallback(team);
  if (!dark && !orig) return null;
  return (
    <img
      src={dark || orig}
      onError={(e) => { if (orig && e.target.src !== orig) { e.target.onerror = null; e.target.src = orig; } }}
      alt=""
      className={className}
      style={style}
    />
  );
}

function getScore(c) {
  const s = c?.score;
  if (s == null) return null;
  return typeof s === 'object' ? s.displayValue : String(s);
}

/* ── Score display for non-live ─────────────────────── */
/* ══════════════════════════════════════════════════════
   NEW MLB CARD COMPONENTS — clean card design (dark mode)
   ══════════════════════════════════════════════════════ */
function MlbTeamRows({ away, home, sport, mlbTotals, showRHE, finalLabel, liveLabel }) {
  const navigate = useNavigate();
  const rec = (c) => c.records?.[0]?.summary || '';
  const r = (c) => { const t = mlbTotals?.[c.homeAway]; return t?.runs ?? (typeof c.score === 'object' ? c.score?.displayValue : c.score) ?? '—'; };
  const h = (c) => mlbTotals?.[c.homeAway]?.hits ?? c.hits ?? '—';
  const e = (c) => mlbTotals?.[c.homeAway]?.errors ?? c.errors ?? '—';
  return (
    <div className="mlbc-teams">
      {showRHE && (
        <div className="mlbc-rhe-header">
          {finalLabel
            ? <span className="mlbc-final-label">{finalLabel}</span>
            : liveLabel
            ? liveLabel
            : <span className="mlbc-rhe-spacer"/>
          }
          <span>R</span><span>H</span><span>E</span>
        </div>
      )}
      {[away, home].filter(Boolean).map((c) => (
        <div key={c.team?.id} className="mlbc-team-row">
          <LogoImg team={c.team} className="mlbc-logo" />
          <div className="mlbc-team-info">
            <span className="mlbc-name">{c.team?.shortDisplayName || c.team?.displayName}</span>
            <span className="mlbc-rec">{rec(c)}</span>
          </div>
          {showRHE && (
            <>
              <span className={`mlbc-stat${c.winner ? ' mlbc-winner' : ''}`}>{r(c)}</span>
              <span className="mlbc-stat mlbc-dim">{h(c)}</span>
              <span className="mlbc-stat mlbc-dim">{e(c)}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function MlbPreCard({ game, sport, navigate, accentColor }) {
  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const broadcast = comp?.broadcasts?.[0]?.names?.join('/') || '';
  const shortDetail = comp?.status?.type?.shortDetail || '';
  const timeStr = shortDetail.includes(' - ') ? shortDetail.split(' - ').slice(1).join(' - ') : shortDetail;

  // prob.statistics is a flat array on the scoreboard endpoint
  const probables = [away, home].filter(Boolean).map((c) => {
    const prob = c.probables?.[0]; if (!prob) return null;
    const ath = prob.athlete || {};
    const headshot = typeof ath.headshot === 'string' ? ath.headshot : ath.headshot?.href;
    const sm = {};
    (Array.isArray(prob.statistics) ? prob.statistics : []).forEach(s => { sm[s.abbreviation] = s.displayValue; });
    return {
      id: ath.id, team: c.team,
      name: ath.shortName || ath.displayName,
      headshot,
      hand: ath.throws?.abbreviation || '',
      record: sm.W && sm.L ? `${sm.W}-${sm.L}` : '',
      era: sm.ERA || '',
    };
  }).filter(Boolean);

  // Fetch IP + K from ESPN core stats API (not included in scoreboard)
  const [extraStats, setExtraStats] = useState({});
  useEffect(() => {
    const ids = probables.map(p => p.id).filter(Boolean);
    if (!ids.length) return;
    const year = new Date().getFullYear();
    let cancelled = false;
    Promise.all(ids.map(id =>
      fetch(`https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/${year}/types/2/athletes/${id}/statistics/0`)
        .then(r => r.json())
        .then(d => {
          const cats = d?.splits?.categories || [];
          const pitCat = cats.find(c => c.name?.toLowerCase() === 'pitching');
          const sm = {};
          (pitCat?.stats || []).forEach(s => { sm[s.abbreviation] = s.displayValue; });
          return { id, ip: sm.IP || '', k: sm.K || '' };
        })
        .catch(() => ({ id, ip: '', k: '' }))
    )).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(r => { map[r.id] = { ip: r.ip, k: r.k }; });
      setExtraStats(map);
    });
    return () => { cancelled = true; };
  }, [game.id]);
  return (
    <div className="mlbc-card" style={accentColor ? {background:`linear-gradient(135deg,color-mix(in srgb,${accentColor} 15%,var(--bg2)) 0%,var(--bg2) 55%)`,
      borderColor:`color-mix(in srgb,${accentColor} 55%,transparent)`,
      boxShadow:`0 0 12px color-mix(in srgb,${accentColor} 25%,transparent)`} : undefined}>
      <div className="mlbc-top-tap" onClick={() => navigate(`/boxscore/${sport}/${game.id}`, { state: { tab: 'Preview' } })}>
        <div className="mlbc-header">
          <span className="mlbc-time">{timeStr}</span>
          {broadcast && <span className="mlbc-broadcast"> · {broadcast}</span>}
        </div>
        <div className="mlbc-divider" />
        <MlbTeamRows away={away} home={home} sport={sport} showRHE={false} />
      </div>
      {probables.length > 0 && (
        <>
          <div className="mlbc-divider" />
          <div className="mlbc-pitchers-row">
            {probables.map((p, i) => {
              const ex = extraStats[p.id] || {};
              const statsToShow = [
                p.record && { val: p.record, lbl: 'W-L' },
                p.era    && { val: p.era,    lbl: 'ERA' },
                ex.ip    && { val: ex.ip,    lbl: 'IP'  },
                ex.k     && { val: ex.k,     lbl: 'SO'  },
              ].filter(Boolean);
              return (
                <div key={i} className="mlbc-pitcher-col"
                  onClick={(ev) => { ev.stopPropagation(); p.id && navigate(`/player/${sport}/${p.id}`); }}>
                  <div className="mlbc-pitcher-team">{p.team?.abbreviation}</div>
                  <div className="mlbc-pitcher-info">
                    {p.headshot && <img src={p.headshot} alt="" className="mlbc-pitcher-photo" onError={(ev)=>ev.target.style.display='none'} />}
                    <div className="mlbc-pitcher-details">
                      <div className="mlbc-pitcher-name">{p.name}{p.hand && <span className="mlbc-hand"> {p.hand}HP</span>}</div>
                      {statsToShow.length > 0 && (
                        <div className="mlbc-pitcher-statrow">
                          {statsToShow.map(s => (
                            <div key={s.lbl} className="mlbc-pstat">
                              <span className="mlbc-pstat-val">{s.val}</span>
                              <span className="mlbc-pstat-lbl">{s.lbl}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Top Performers section (MLB live + final cards) ── */
function TopPerformersSection({ performers, sport, navigate }) {
  return (
    <div className="mlbc-tp-wrap">
      <div className="mlbc-tp-label">TOP PERFORMERS</div>
      <div className="mlbc-tp-row">
        {performers.map((p, i) => (
          <div key={i} className="mlbc-tp-player"
            style={{ cursor: p.fullName ? 'pointer' : 'default' }}
            onClick={(ev) => { ev.stopPropagation(); if (p.fullName) goToEspnPlayer(p.fullName, sport, navigate); }}>
            <img src={p.headshot} alt="" className="mlbc-tp-photo" onError={(e) => e.target.style.display = 'none'} />
            <div className="mlbc-tp-name">{p.lastName}</div>
            <div className="mlbc-tp-stat">{p.hAb}{p.statLine ? ` | ${p.statLine}` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MlbLiveCard({ game, sport, navigate, accentColor }) {
  // Self-contained: always fetches its own live MLB feed — identical everywhere
  const mlbFeed = useMlbLiveGame(sport, game);

  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const broadcast = comp?.broadcasts?.[0]?.names?.[0] || '';
  const mlbTotals = mlbFeed?.linescoreTotals || {};
  const inningStr = mlbFeed?.inningDisplay || comp?.status?.type?.shortDetail || '';
  const balls   = mlbFeed?.count?.balls   ?? 0;
  const strikes = mlbFeed?.count?.strikes ?? 0;
  const outs    = mlbFeed?.outs           ?? 0;
  const on1 = !!mlbFeed?.onFirst;
  const on2 = !!mlbFeed?.onSecond;
  const on3 = !!mlbFeed?.onThird;
  const pName  = mlbFeed?.matchup?.pitcher?.fullName;
  const pPhoto = pName ? mlbHeadshot(mlbFeed.matchup.pitcher.id) : null;
  const bName  = mlbFeed?.matchup?.batter?.fullName;
  const bPhoto = bName ? mlbHeadshot(mlbFeed.matchup.batter.id)  : null;
  const pStats = mlbFeed?.pitcherGameStats || {};
  const bStats = mlbFeed?.batterGameStats  || {};
  const pitchingTeamAbbr = inningStr.startsWith('BOT') ? home?.team?.abbreviation : away?.team?.abbreviation;
  const battingTeamAbbr  = inningStr.startsWith('BOT') ? away?.team?.abbreviation : home?.team?.abbreviation;
  return (
    <div className="mlbc-card" style={accentColor ? {background:`linear-gradient(135deg,color-mix(in srgb,${accentColor} 15%,var(--bg2)) 0%,var(--bg2) 55%)`,
      borderColor:`color-mix(in srgb,${accentColor} 55%,transparent)`,
      boxShadow:`0 0 12px color-mix(in srgb,${accentColor} 25%,transparent)`} : undefined}>
      <div className="mlbc-top-tap" onClick={() => navigate(`/boxscore/${sport}/${game.id}`, { state: { tab: 'Gamecast' } })}>
      <div className="mlbc-live-body">
        <MlbTeamRows away={away} home={home} sport={sport} mlbTotals={mlbTotals} showRHE
          liveLabel={
            <span className="mlbc-live-inline">
              <span className="mlbc-inning-live">{inningStr}</span>
              {broadcast && <span className="mlbc-broadcast"> · {broadcast}</span>}
            </span>
          } />
        <div className="mlbc-diamond-col">
          <SmallDiamond onFirst={on1} onSecond={on2} onThird={on3} />
          <div className="mlbc-count-dots">
            <div className="mlbc-dot-row">{Array.from({length:4}).map((_,i)=><span key={i} className={`mlbc-dot ${i<balls?'mlbc-dot-g':''}`}/>)}</div>
            <div className="mlbc-dot-row">{Array.from({length:3}).map((_,i)=><span key={i} className={`mlbc-dot ${i<strikes?'mlbc-dot-y':''}`}/>)}</div>
            <div className="mlbc-dot-row">{Array.from({length:3}).map((_,i)=><span key={i} className={`mlbc-dot ${i<outs?'mlbc-dot-r':''}`}/>)}</div>
          </div>
          <div className="mlbc-count-num">{balls} - {strikes}</div>
        </div>
      </div>
      </div>{/* end mlbc-top-tap */}
      {(pName || bName) && (
        <>
          <div className="mlbc-divider" />
          <div className="mlbc-matchup-row">
            {pName && (
              <div className="mlbc-matchup-col" onClick={(ev)=>{
                ev.stopPropagation();
                // Use ESPN situation pitcher ID (ESPN athlete ID) when available
                const espnId = comp?.situation?.pitcher?.id;
                if (espnId) navigate(`/player/${sport}/${espnId}`);
                else goToEspnPlayer(pName, sport, navigate);
              }}>
                <div className="mlbc-matchup-label">PITCHING</div>
                <div className="mlbc-matchup-info">
                  {pPhoto && <img src={pPhoto} alt="" className="mlbc-matchup-photo" onError={(ev)=>ev.target.style.display='none'} />}
                  <div>
                    <div className="mlbc-matchup-name">{pName.split(' ').slice(-1)[0]}</div>
                    <div className="mlbc-matchup-stats">
                      {[
                        pStats.inningsPitched != null && { v: pStats.inningsPitched, l: 'IP' },
                        pStats.hits          != null && { v: pStats.hits,          l: 'H'  },
                        pStats.earnedRuns    != null && { v: pStats.earnedRuns,    l: 'ER' },
                        pStats.strikeOuts    != null && { v: pStats.strikeOuts,    l: 'K'  },
                        pStats.baseOnBalls   != null && { v: pStats.baseOnBalls,   l: 'BB' },
                      ].filter(Boolean).map((s, i) => (
                        <span key={s.l}>{i > 0 ? ' ' : ''}{s.v}<span className="mlbc-gs-lbl">{s.l}</span></span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {bName && (
              <div className="mlbc-matchup-col" onClick={(ev)=>{
                ev.stopPropagation();
                const espnId = comp?.situation?.batter?.id;
                if (espnId) navigate(`/player/${sport}/${espnId}`);
                else goToEspnPlayer(bName, sport, navigate);
              }}>
                <div className="mlbc-matchup-label">AT BAT</div>
                <div className="mlbc-matchup-info">
                  {bPhoto && <img src={bPhoto} alt="" className="mlbc-matchup-photo" onError={(ev)=>ev.target.style.display='none'} />}
                  <div>
                    <div className="mlbc-matchup-name">{bName.split(' ').slice(-1)[0]}</div>
                    <div className="mlbc-matchup-stats">{(() => {
                      if (bStats.hits == null) return '';
                      const parts = [
                        (bStats.homeRuns  > 0) && ((bStats.homeRuns  > 1 ? `${bStats.homeRuns}`  : '') + 'HR'),
                        (bStats.doubles   > 0) && ((bStats.doubles   > 1 ? `${bStats.doubles}`   : '') + '2B'),
                        (bStats.triples   > 0) && ((bStats.triples   > 1 ? `${bStats.triples}`   : '') + '3B'),
                        (bStats.rbi       > 0) && `${bStats.rbi}RBI`,
                      ].filter(Boolean);
                      const base = `${bStats.hits}-${bStats.atBats ?? 0}`;
                      return parts.length ? `${base} | ${parts.join(', ')}` : base;
                    })()}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {mlbFeed?.topPerformers?.length > 0 && (
        <>
          <div className="mlbc-divider" />
          <TopPerformersSection performers={mlbFeed.topPerformers} sport={sport} navigate={navigate} />
        </>
      )}
      <div className="mlbc-divider" />
      <div className="mlbc-actions">
        <span className="mlbc-action-btn" onClick={(ev)=>{ev.stopPropagation();navigate(`/boxscore/${sport}/${game.id}`,{state:{tab:'Gamecast'}});}}>Gamecast</span>
        <span className="mlbc-action-btn" onClick={(ev)=>{ev.stopPropagation();navigate(`/boxscore/${sport}/${game.id}`,{state:{tab:'Play-by-Play'}});}}>Play-by-Play</span>
      </div>
    </div>
  );
}

function MlbFinalCard({ game, sport, navigate, accentColor }) {
  const [decisions, setDecisions] = useState(null);
  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  useEffect(() => {
    const homeAbbr = home?.team?.abbreviation;
    const gameDate = game.date || comp?.date;
    if (!homeAbbr || !gameDate) return;
    fetchMlbDecisions(gameDate, homeAbbr).then((dec) => { if (dec) setDecisions(dec); }).catch(()=>{});
  }, [game.id]);
  return (
    <div className="mlbc-card" style={accentColor ? {background:`linear-gradient(135deg,color-mix(in srgb,${accentColor} 15%,var(--bg2)) 0%,var(--bg2) 55%)`,
      borderColor:`color-mix(in srgb,${accentColor} 55%,transparent)`,
      boxShadow:`0 0 12px color-mix(in srgb,${accentColor} 25%,transparent)`} : undefined}>
      <div className="mlbc-top-tap" onClick={() => navigate(`/boxscore/${sport}/${game.id}`, { state: { tab: 'Box Score' } })}>
        <MlbTeamRows away={away} home={home} sport={sport} showRHE finalLabel="FINAL" />
      </div>
      {decisions?.topPerformers?.length > 0 && (
        <>
          <div className="mlbc-divider" />
          <TopPerformersSection performers={decisions.topPerformers} sport={sport} navigate={navigate} />
        </>
      )}
      {decisions && (
        <>
          <div className="mlbc-divider" />
          <div className="mlbc-decisions">
            {[
              { label: 'W', p: decisions.winner },
              { label: 'L', p: decisions.loser },
              decisions.save && { label: 'S', p: decisions.save },
            ].filter(Boolean).map(({ label, p }) => {
              const gs = p.gameStat || {};
              const gameStats = [
                gs.ip && { val: gs.ip,  lbl: 'IP' },
                gs.h  && { val: gs.h,   lbl: 'H'  },
                gs.er && { val: gs.er,  lbl: 'ER' },
                gs.k  && { val: gs.k,   lbl: 'K'  },
                gs.bb && { val: gs.bb,  lbl: 'BB' },
              ].filter(Boolean);
              const recordStr = label === 'S'
                ? (p.sv != null ? `${p.sv} SV` : '')
                : p.wl;
              return (
                <div key={label} className="mlbc-decision-col"
                  style={{ cursor: (p.espnId || p.mlbId) ? 'pointer' : 'default' }}
                  onClick={(ev) => { ev.stopPropagation(); if (p.espnId) navigate(`/player/mlb/${p.espnId}`); else if (p.fullName) goToEspnPlayer(p.fullName, 'mlb', navigate); }}>
                  <div className="mlbc-decision-label">
                    {label}: <span className="mlbc-matchup-name">{p.shortName}</span>
                    {recordStr && <span className="mlbc-decision-record-inline"> ({recordStr})</span>}
                  </div>
                  {gameStats.length > 0 && (
                    <div className="mlbc-decision-gamestats">
                      {gameStats.map((s, i) => (
                        <span key={s.lbl}>
                          {i > 0 && ' '}
                          {s.val}<span className="mlbc-gs-lbl">{s.lbl}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      <div className="mlbc-divider" />
      <div className="mlbc-actions">
        <span className="mlbc-action-btn" onClick={(ev)=>{ev.stopPropagation();navigate(`/boxscore/${sport}/${game.id}`,{state:{tab:'Scoring Summary'}});}}>Summary</span>
        <span className="mlbc-action-btn" onClick={(ev)=>{ev.stopPropagation();navigate(`/boxscore/${sport}/${game.id}`,{state:{tab:'Box Score'}});}}>Box Score</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ */

function GameScore({ game, teamId, sport, onOpen, mlbFeed, liveData }) {
  const navigate = useNavigate();
  if (!game) return <div className="tr2-no-game">No game scheduled</div>;

  // MLB gets dedicated clean card components
  const st = game.competitions?.[0]?.status?.type?.state;
  if (sport === 'mlb') {
    if (st === 'pre')  return <MlbPreCard  game={game} sport={sport} navigate={navigate} />;
    if (st === 'post') return <MlbFinalCard game={game} sport={sport} navigate={navigate} />;
    if (st === 'in')   return <MlbLiveCard  game={game} sport={sport} navigate={navigate}   />;
  }

  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const status = comp?.status;
  const state = status?.type?.state;
  const isFinal = state === 'post';
  const isPre   = state === 'pre';
  const shortDetail = status?.type?.shortDetail || '';
  const showScore = isFinal;

  if (isPre) {
    const probables = competitors.map((c) => {
      const prob = c.probables?.[0];
      if (!prob) return null;
      const ath = prob.athlete || {};
      // headshot can be a string URL or an object with href
      const headshot = typeof ath.headshot === 'string' ? ath.headshot : ath.headshot?.href;
      return { id: ath.id, team: c.team?.abbreviation, name: ath.shortName || ath.displayName, jersey: ath.jersey, headshot, record: prob.record || '' };
    }).filter(Boolean);
    const broadcast = comp?.broadcasts?.[0]?.names?.join('/') || '';
    const timeStr = shortDetail.includes(' - ') ? shortDetail.split(' - ').slice(1).join(' - ') : shortDetail;

    return (
      <div className="pregame-bar" style={{cursor:'pointer'}}
        onClick={() => navigate(`/boxscore/${sport}/${game.id}`, { state: { tab: 'Preview' } })}>
        <div className="pregame-body">
          {/* Left column: time + teams */}
          <div className="pregame-left">
            <div className="pregame-top">
              <span className="pregame-time">{timeStr}</span>
              {broadcast && <span className="pregame-tv"> · {broadcast}</span>}
            </div>
            <div className="pregame-teams">
              {[away, home].filter(Boolean).map((c) => {
                const overallRec = c.records?.[0]?.summary;
                const splitRec = c.homeAway === 'home'
                  ? (c.records?.find((r) => r.name === 'home' || r.type === 'home') || c.records?.[1])?.summary
                  : (c.records?.find((r) => r.name === 'road' || r.type === 'road') || c.records?.[2])?.summary;
                const splitLabel = c.homeAway === 'home' ? 'Home' : 'Away';
                return (
                  <Link key={c.team?.id} to={`/team/${sport}/${c.team?.id}`}
                    className={`pregame-team tr-team-link ${c.team?.id === String(teamId) ? 'pregame-my-team' : ''}`}
                    onClick={e => e.stopPropagation()}>
                    <LogoImg team={c.team} className="pregame-logo" />
                    <div>
                      <div className="pregame-name">{c.team?.shortDisplayName || c.team?.displayName}</div>
                      <div className="pregame-record">
                        ({overallRec}{splitRec ? `, ${splitRec} ${splitLabel}` : ''})
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
          {/* Right column: label + pitchers + gamecast */}
          {probables.length > 0 && (
            <div className="pregame-right">
              <div className="pregame-pitchers-label">PROBABLE PITCHERS</div>
              <div className="pregame-pitchers">
                {probables.map((p, i) => (
                  <div key={i} className="pregame-pitcher" onClick={() => p.id && navigate(`/player/${sport}/${p.id}`)} style={{ cursor: p.id ? 'pointer' : 'default' }}>
                    {p.headshot && <img src={p.headshot} alt="" className="pregame-pitcher-avatar" onError={(e) => { e.target.style.display='none'; }} />}
                    <div>
                      <div className="pregame-pitcher-name" style={{ color: p.id ? 'var(--accent2)' : 'var(--text)' }}>{p.name}</div>
                      {p.record && <div className="pregame-pitcher-record">{p.record}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* No Preview button — whole card is clickable */}
        </div>
      </div>
    );
  }

  // ── Final MLB game: enhanced R/H/E + decisions layout ──────────────
  if (isFinal && sport === 'mlb') {
    return <FinalMLBGame game={game} teamId={teamId} sport={sport} />;
  }

  return (
    <button className="tr2-game" onClick={onOpen}>
      <div className="tr2-status">
        {isFinal && <span className="badge badge-final">Final</span>}
      </div>
      <div className="tr2-matchup">
        <TeamScoreRow competitor={away} teamId={teamId} sport={sport} showScore={showScore} />
        <TeamScoreRow competitor={home} teamId={teamId} sport={sport} showScore={showScore} />
      </div>
      <div className="tr2-tap-hint">Box Score →</div>
    </button>
  );
}

/* ESPN abbreviation → MLB Stats API team ID */
const ESPN_ABB_TO_MLB_ID = {
  ARI: 109, ATH: 133, ATL: 144, BAL: 110, BOS: 111,
  CHC: 112, CHW: 145, CIN: 113, CLE: 114, COL: 115,
  DET: 116, HOU: 117, KC:  118, LAA: 108, LAD: 119,
  MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147,
  PHI: 143, PIT: 134, SD:  135, SEA: 136, SF:  137,
  STL: 138, TB:  139, TEX: 140, TOR: 141, WSH: 120,
};

/** Fetch pitcher decisions for a final MLB game via MLB Stats API.
 *  Returns { winner, loser, save? } where each is
 *  { mlbId, fullName, jersey, wl, era, sv, headshot }
 */
async function fetchMlbDecisions(gameDate, homeTeamAbbr) {
  const mlbTeamId = ESPN_ABB_TO_MLB_ID[homeTeamAbbr];
  if (!mlbTeamId) return null;

  // ESPN game dates are UTC timestamps. Most US games are in the evening local time,
  // so the UTC date matches. But late west-coast games (after midnight UTC) roll into
  // the next UTC day while still being the previous local date.
  // Strategy: try the ESPN date as-is, then the day before as a fallback.
  const d0 = new Date(gameDate);
  const d1 = new Date(gameDate);
  d1.setDate(d1.getDate() - 1);
  const candidates = [d0.toISOString().slice(0, 10), d1.toISOString().slice(0, 10)];

  // 1. Find game PK — try each candidate date, pick the first with a Final game
  let gamePk = null;
  for (const dateStr of candidates) {
    const schedRes = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateStr}&teamId=${mlbTeamId}`
    );
    const schedData = await schedRes.json();
    const games = schedData.dates?.[0]?.games || [];
    const finalGame = games.find(
      (g) => g.status?.abstractGameState === 'Final' || g.status?.detailedState === 'Final'
    );
    if (finalGame?.gamePk) { gamePk = finalGame.gamePk; break; }
  }
  if (!gamePk) return null;

  // 2. Get decisions
  const feedRes = await fetch(
    `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`
  );
  const feedData = await feedRes.json();
  const dec = feedData.liveData?.decisions;
  if (!dec?.winner?.id) return null;

  // 3. Extract game pitching stats from the boxscore in the feed we already fetched
  const allPlayers = {
    ...feedData.liveData?.boxscore?.teams?.away?.players,
    ...feedData.liveData?.boxscore?.teams?.home?.players,
  };
  const gameStatFor = (mlbId) => {
    const entry = allPlayers[`ID${mlbId}`];
    const ps = entry?.stats?.pitching || {};
    return {
      ip: ps.inningsPitched || '',
      h:  ps.hits != null ? String(ps.hits) : '',
      er: ps.earnedRuns != null ? String(ps.earnedRuns) : '',
      k:  ps.strikeOuts != null ? String(ps.strikeOuts) : '',
      bb: ps.baseOnBalls != null ? String(ps.baseOnBalls) : '',
    };
  };

  // 4. Batch-fetch pitcher season stats (W-L, ERA, saves)
  const ids = [dec.winner.id, dec.loser.id, dec.save?.id].filter(Boolean).join(',');
  const peopleRes = await fetch(
    `https://statsapi.mlb.com/api/v1/people?personIds=${ids}&hydrate=currentTeam,stats(group=pitching,type=season)`
  );
  const peopleData = await peopleRes.json();

  const byId = {};
  for (const p of peopleData.people || []) {
    const sp = p.stats?.[0]?.splits?.[0]?.stat || {};
    byId[p.id] = {
      mlbId: p.id,
      fullName: p.fullName,
      shortName: p.fullName?.replace(/^(\w)\w+\s/, '$1. ') || p.fullName,
      jersey: p.primaryNumber,
      wl: `${sp.wins ?? '?'}-${sp.losses ?? '?'}`,
      era: sp.era || '—',
      sv: sp.saves ?? null,
      headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${p.id}/headshot/67/current`,
      gameStat: gameStatFor(p.id),
      espnId: null, // filled in below
    };
  }

  // Look up ESPN athlete IDs so player page links work correctly
  await Promise.all(Object.values(byId).map(async (p) => {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/search/v2?query=${encodeURIComponent(p.fullName)}&limit=5`);
      const d = await r.json();
      const hit = d.items?.find(i => i.type === 'athlete');
      if (hit?.id) p.espnId = hit.id;
    } catch {}
  }));

  return {
    winner: byId[dec.winner.id],
    loser:  byId[dec.loser.id],
    save:   dec.save?.id ? byId[dec.save.id] : null,
    topPerformers: extractTopPerformers(feedData.liveData?.boxscore),
  };
}

/* ── Final MLB game — matches ESPN mobile style exactly ───────────── */
function FinalMLBGame({ game, teamId, sport }) {
  const navigate = useNavigate();
  const [decisions, setDecisions] = useState(null);

  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];

  useEffect(() => {
    const homeAbbr = home?.team?.abbreviation;
    const gameDate = game.date || comp?.date;
    if (!homeAbbr || !gameDate) return;
    fetchMlbDecisions(gameDate, homeAbbr)
      .then((dec) => { if (dec) setDecisions(dec); })
      .catch(() => {});
  }, [game.id]);

  const TeamRow = ({ c }) => {
    const isMine  = String(c.team?.id) === String(teamId);
    const overall = c.records?.[0]?.summary || '';
    const split   = (c.homeAway === 'home'
      ? (c.records?.find((r) => r.name === 'home' || r.type === 'home') || c.records?.[1])
      : (c.records?.find((r) => r.name === 'road' || r.type === 'road') || c.records?.[2]))?.summary;
    const splitLabel = c.homeAway === 'home' ? 'Home' : 'Away';
    const score   = getScore(c);
    return (
      <div className={`f2-team-row${c.winner ? ' f2-winner' : ''}${isMine ? ' f2-mine' : ''}`}>
        <LogoImg team={c.team} className="f2-logo" />
        <div className="f2-team-info">
          <span className="f2-team-name">{c.team?.shortDisplayName || c.team?.displayName}</span>
          <span className="f2-team-rec">({overall}{split ? `, ${split} ${splitLabel}` : ''})</span>
        </div>
        <div className="f2-score-wrap">
          <span className="f2-score">{score}</span>
        </div>
      </div>
    );
  };

  const Decision = ({ label, pitcher }) => {
    if (!pitcher) return null;
    const detail = label === 'S'
      ? (pitcher.sv != null ? `(${pitcher.sv})` : '')
      : `(${pitcher.wl}, ${pitcher.era})`;
    return (
      <div className="f2-decision" style={{ cursor: 'default' }}>
        <span className="f2-dec-label">{label}</span>
        <img src={pitcher.headshot} alt="" className="f2-dec-photo"
          onError={(e) => { e.target.style.display = 'none'; }} />
        <div className="f2-dec-info">
          <span className="f2-dec-name">{pitcher.shortName}</span>
          {detail && <span className="f2-dec-stats">{detail}</span>}
        </div>
      </div>
    );
  };

  // Render both team rows as cells in a shared grid so scores always align
  const awayScore = getScore(away);
  const homeScore = getScore(home);
  const makeInfo = (c) => {
    const overall = c.records?.[0]?.summary || '';
    const split = (c.homeAway === 'home'
      ? (c.records?.find((r) => r.name === 'home' || r.type === 'home') || c.records?.[1])
      : (c.records?.find((r) => r.name === 'road' || r.type === 'road') || c.records?.[2]))?.summary;
    const splitLabel = c.homeAway === 'home' ? 'Home' : 'Away';
    return { overall, split, splitLabel };
  };
  const awayInfo = makeInfo(away);
  const homeInfo = makeInfo(home);

  return (
    <div className="f2-box" style={{cursor:'pointer'}}
      onClick={() => navigate(`/boxscore/${sport}/${game.id}`, { state: { tab: 'Box Score' } })}>
      {/* Left: FINAL pill + two-row team grid */}
      <div className="f2-left-panel">
        <span className="badge badge-final f2-final-pill">FINAL</span>
        {/* Single shared grid: logo | info | score — both rows locked to same columns */}
        <div className="f2-teams">
          {/* Away */}
          <LogoImg team={away.team} className="f2-logo f2-clickable"
            onClick={(e) => { e.stopPropagation(); away.team?.id && navigate(`/team/${sport}/${away.team.id}`); }} />
          <div className="f2-team-info f2-clickable"
            onClick={(e) => { e.stopPropagation(); away.team?.id && navigate(`/team/${sport}/${away.team.id}`); }}>
            <span className={`f2-team-name${away.winner ? ' f2-team-bold' : ''}`}>
              {away.team?.shortDisplayName || away.team?.displayName}
            </span>
            <span className="f2-team-rec">
              ({awayInfo.overall}{awayInfo.split ? `, ${awayInfo.split} ${awayInfo.splitLabel}` : ''})
            </span>
          </div>
          <span className={`f2-score${away.winner ? ' f2-score-bold' : ''}`}>{awayScore}</span>

          {/* Home */}
          <LogoImg team={home.team} className="f2-logo f2-clickable"
            onClick={(e) => { e.stopPropagation(); home.team?.id && navigate(`/team/${sport}/${home.team.id}`); }} />
          <div className="f2-team-info f2-clickable"
            onClick={(e) => { e.stopPropagation(); home.team?.id && navigate(`/team/${sport}/${home.team.id}`); }}>
            <span className={`f2-team-name${home.winner ? ' f2-team-bold' : ''}`}>
              {home.team?.shortDisplayName || home.team?.displayName}
            </span>
            <span className="f2-team-rec">
              ({homeInfo.overall}{homeInfo.split ? `, ${homeInfo.split} ${homeInfo.splitLabel}` : ''})
            </span>
          </div>
          <span className={`f2-score${home.winner ? ' f2-score-bold' : ''}`}>{homeScore}</span>
        </div>
      </div>

      {/* Right: decisions + buttons */}
      <div className="f2-right-panel">
        {decisions && (
          <div className="f2-decisions">
            <Decision label="W"  pitcher={decisions.winner} />
            <Decision label="L" pitcher={decisions.loser}  />
            {decisions.save && <Decision label="S" pitcher={decisions.save} />}
          </div>
        )}
        {/* No buttons — whole card is clickable */}
      </div>
    </div>
  );
}

function TeamScoreRow({ competitor, teamId, sport, showScore }) {
  const team = competitor?.team || {};
  const isMine = team.id === String(teamId);
  const score = getScore(competitor);
  const won = competitor?.winner;

  return (
    <div className={`tr2-team-row ${isMine ? 'tr2-mine' : ''}`}>
      <Link to={`/team/${sport}/${team.id}`} className="tr2-team-left tr-team-link"
        onClick={e => e.stopPropagation()}>
        <LogoImg team={team} className="tr2-team-logo" />
        <div>
          <span className={`tr2-team-name ${isMine ? 'tr2-mine-name' : ''}`}>
            {team.shortDisplayName || team.displayName || team.abbreviation}
          </span>
          {competitor?.records?.[0]?.summary && (
            <span className="tr2-record"> · {competitor.records[0].summary}</span>
          )}
        </div>
      </Link>
      {showScore && score != null && (
        <span className={`tr2-score ${won ? 'tr2-winner-score' : ''}`}>{score}</span>
      )}
    </div>
  );
}

/* ── Small base diamond ─────────────────────────────── */
function SmallDiamond({ onFirst, onSecond, onThird }) {
  return (
    <svg viewBox="0 0 44 44" className="lv-diamond" style={{ overflow: 'visible' }}>
      <rect x="16" y="2"  width="12" height="12" rx="1.5" className={`lv-base ${onSecond ? 'lv-base-on' : ''}`} transform="rotate(45 22 8)" />
      <rect x="2"  y="16" width="12" height="12" rx="1.5" className={`lv-base ${onThird  ? 'lv-base-on' : ''}`} transform="rotate(45 8 22)" />
      <rect x="30" y="16" width="12" height="12" rx="1.5" className={`lv-base ${onFirst  ? 'lv-base-on' : ''}`} transform="rotate(45 36 22)" />
      <rect x="16" y="30" width="12" height="12" rx="1.5" className="lv-base" transform="rotate(45 22 36)" />
    </svg>
  );
}

/* ── Live bar ───────────────────────────────────────── */
function LiveBar({ game, teamId, sport, liveData, mlbFeed, onBoxScore }) {
  const navigate = useNavigate();
  const comp = game.competitions?.[0];
  const status = comp?.status;
  const shortDetail = status?.type?.shortDetail || '';
  const competitors = comp?.competitors || [];
  const away = competitors.find((c) => c.homeAway === 'away') || competitors[0];
  const home = competitors.find((c) => c.homeAway === 'home') || competitors[1];
  const sit = liveData?.situation || {};
  const lastPlay = liveData?.lastPlay;
  const broadcast = comp?.broadcasts?.[0]?.names?.[0] || '';

  const goTo = (tab) => navigate(`/boxscore/${sport}/${game.id}`, { state: { tab } });

  // ── MLB (baseball) — all data from MLB Stats API ─────────────
  if (sport === 'mlb') {
    // Prefer MLB feed; fall back to ESPN liveData
    const mlbTotals  = mlbFeed?.linescoreTotals || {};
    const balls      = mlbFeed?.count?.balls   ?? sit.balls   ?? 0;
    const strikes    = mlbFeed?.count?.strikes ?? sit.strikes ?? 0;
    const outs       = mlbFeed?.outs           ?? sit.outs    ?? 0;
    const onFirst    = mlbFeed?.raw ? !!mlbFeed.onFirst  : !!sit.onFirst;
    const onSecond   = mlbFeed?.raw ? !!mlbFeed.onSecond : !!sit.onSecond;
    const onThird    = mlbFeed?.raw ? !!mlbFeed.onThird  : !!sit.onThird;
    const inningStr  = mlbFeed?.inningDisplay || shortDetail;
    const isBot      = inningStr.startsWith('BOT') || shortDetail.toLowerCase().startsWith('bot');

    const pName  = mlbFeed?.matchup?.pitcher?.fullName;
    const bName  = mlbFeed?.matchup?.batter?.fullName;
    const pPhoto = pName ? mlbHeadshot(mlbFeed.matchup.pitcher.id) : null;
    const bPhoto = bName ? mlbHeadshot(mlbFeed.matchup.batter.id)  : null;
    const pitcher      = pName ? null : liveData?.pitcher;
    const batter       = bName ? null : liveData?.batter;
    const pitcherStats = liveData?.pitcherStats;
    const batterStats  = liveData?.batterStats;

    const runsFor = (c) => mlbTotals?.[c.homeAway]?.runs   ?? getScore(c) ?? '0';
    const hitsFor = (c) => mlbTotals?.[c.homeAway]?.hits   ?? c.hits      ?? '0';
    const errFor  = (c) => mlbTotals?.[c.homeAway]?.errors ?? c.errors    ?? '0';

    return (
      <div className="lv-bar">
        <div className="lv-status-row">
          <span className={`lv-inning ${isBot ? 'lv-bot' : 'lv-top'}`}>{isBot ? '▼' : '▲'} {inningStr}</span>
          {broadcast && <span className="lv-broadcast">{broadcast}</span>}
        </div>
        <div className="lv-top-section">
          <div className="lv-teams-section">
            <div className="lv-rhe-header">
              <div className="lv-rhe-spacer" />
              <span className="lv-rhe-label">R</span><span className="lv-rhe-label">H</span><span className="lv-rhe-label">E</span>
            </div>
            {[away, home].filter(Boolean).map((c) => (
              <div key={c.team?.id} className={`lv-team-row ${c.team?.id === String(teamId) ? 'lv-my-team' : ''}`}>
                <Link to={`/team/${sport}/${c.team?.id}`} className="lv-team-left tr-team-link" onClick={e=>e.stopPropagation()}>
                  <LogoImg team={c.team} className="lv-logo" />
                  <div>
                    <div className="lv-name">{c.team?.shortDisplayName || c.team?.abbreviation}</div>
                    {c.records?.[0]?.summary && <div className="lv-record">{c.records[0].summary} · {c.homeAway === 'home' ? 'Home' : 'Away'}</div>}
                  </div>
                </Link>
                <span className="lv-rhe-val">{runsFor(c)}</span>
                <span className="lv-rhe-val lv-rhe-secondary">{hitsFor(c)}</span>
                <span className="lv-rhe-val lv-rhe-secondary">{errFor(c)}</span>
              </div>
            ))}
            {broadcast && <div className="lv-broadcast-bottom">{broadcast}</div>}
          </div>
          <div className="lv-diamond-count">
            <SmallDiamond onFirst={onFirst} onSecond={onSecond} onThird={onThird} />
            <div className="lv-count-col">
              <div className="lv-count-row"><span className="lv-cl">B</span>{Array.from({length:4}).map((_,i)=><span key={i} className={`lv-dot ${i<balls?'lv-dot-g':''}`}/>)}</div>
              <div className="lv-count-row"><span className="lv-cl">S</span>{Array.from({length:3}).map((_,i)=><span key={i} className={`lv-dot ${i<strikes?'lv-dot-y':''}`}/>)}</div>
              <div className="lv-count-row"><span className="lv-cl">O</span>{Array.from({length:3}).map((_,i)=><span key={i} className={`lv-dot ${i<outs?'lv-dot-r':''}`}/>)}</div>
            </div>
          </div>
        </div>
        {lastPlay && <div className="lv-last-play"><span className="lv-lp-label">LAST PLAY</span><span className="lv-lp-text">{lastPlay}</span></div>}
        <button className="lv-pbp-link" onClick={() => goTo('Play-by-Play')}>Play-by-Play →</button>
        <div className="lv-body">
          <div className="lv-players">
            {/* MLB: prefer MLB CDN headshot + name */}
            {(pName || pitcher) && (
              <div className="lv-player">
                <div className="lv-player-role">PITCHING</div>
                <div className="lv-player-row">
                  {pPhoto && <img src={pPhoto} alt="" className="lv-avatar" onError={(e)=>{e.target.style.display='none';}} />}
                  {!pPhoto && pitcher?.headshot?.href && <img src={pitcher.headshot.href} alt="" className="lv-avatar" />}
                  <div>
                    <div className="lv-player-name" style={{color:'var(--accent2)'}}>{pName || pitcher?.shortName || pitcher?.displayName}</div>
                    {pitcherStats && <div className="lv-player-stats">{[pitcherStats.IP&&`${pitcherStats.IP} IP`,pitcherStats.ER!==null&&`${pitcherStats.ER} ER`,pitcherStats.H!==null&&`${pitcherStats.H} H`,pitcherStats.K!==null&&`${pitcherStats.K} K`].filter(Boolean).join(', ')}</div>}
                  </div>
                </div>
              </div>
            )}
            {(bName || batter) && (
              <div className="lv-player">
                <div className="lv-player-role">BATTING</div>
                <div className="lv-player-row">
                  {bPhoto && <img src={bPhoto} alt="" className="lv-avatar" onError={(e)=>{e.target.style.display='none';}} />}
                  {!bPhoto && batter?.headshot?.href && <img src={batter.headshot.href} alt="" className="lv-avatar" />}
                  <div>
                    <div className="lv-player-name" style={{color:'var(--accent2)'}}>{bName || batter?.shortName || batter?.displayName}</div>
                    {batterStats && <div className="lv-player-stats">{batterStats['H-AB'] || '0-0'}{batterStats.HR > 0 ? `, ${batterStats.HR} HR` : ''}{batterStats.RBI > 0 ? `, ${batterStats.RBI} RBI` : ''}</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="lv-actions">
          <button className="lv-btn" onClick={() => goTo('Gamecast')}>Gamecast</button>
          <button className="lv-btn" onClick={() => goTo('Box Score')}>Box Score</button>
        </div>
      </div>
    );
  }

  // ── NBA (basketball) ────────────────────────────────────────
  if (sport === 'nba') {
    const quarter = status?.period ? `Q${status.period}` : '';
    const clock = status?.displayClock && status.displayClock !== '0:00' ? status.displayClock : '';
    const possession = sit.possessionText || '';
    return (
      <div className="lv-bar">
        <div className="lv-status-row">
          <span className="lv-inning lv-top">● {quarter}{clock ? ` · ${clock}` : ''}</span>
          {broadcast && <span className="lv-broadcast">{broadcast}</span>}
        </div>
        <div className="lv-body">
          <div className="lv-teams-section">
            {[away, home].filter(Boolean).map((c) => (
              <div key={c.team?.id} className={`lv-team-row ${c.team?.id === String(teamId) ? 'lv-my-team' : ''}`}>
                <Link to={`/team/${sport}/${c.team?.id}`} className="lv-team-left tr-team-link" onClick={e=>e.stopPropagation()}>
                  <LogoImg team={c.team} className="lv-logo" />
                  <div>
                    <div className="lv-name">{c.team?.shortDisplayName || c.team?.abbreviation}</div>
                    {c.records?.[0]?.summary && <div className="lv-record">{c.records[0].summary}</div>}
                  </div>
                </Link>
                <span className="lv-rhe-val">{getScore(c) ?? '0'}</span>
              </div>
            ))}
          </div>
          {(possession || lastPlay) && (
            <div className="lv-center">
              {possession && <div className="lv-possession">🏀 {possession} possession</div>}
              {lastPlay && <div className="lv-last-play"><span className="lv-lp-label">LAST PLAY</span><span className="lv-lp-text">{lastPlay}</span></div>}
            </div>
          )}
        </div>
        <div className="lv-actions">
          <button className="lv-btn" onClick={() => goTo('Gamecast')}>Gamecast</button>
          <button className="lv-btn" onClick={() => goTo('Box Score')}>Box Score</button>
        </div>
      </div>
    );
  }

  // ── NFL (football) ──────────────────────────────────────────
  if (sport === 'nfl') {
    const quarter = status?.period ? `Q${status.period}` : '';
    const clock = status?.displayClock && status.displayClock !== '0:00' ? status.displayClock : '';
    const downDist = sit.downDistanceText || '';
    const possession = sit.possessionText || '';
    const isRedZone = sit.isRedZone;
    return (
      <div className="lv-bar">
        <div className="lv-status-row">
          <span className="lv-inning lv-top">● {quarter}{clock ? ` · ${clock}` : ''}</span>
          {broadcast && <span className="lv-broadcast">{broadcast}</span>}
        </div>
        <div className="lv-body">
          <div className="lv-teams-section">
            {[away, home].filter(Boolean).map((c) => (
              <div key={c.team?.id} className={`lv-team-row ${c.team?.id === String(teamId) ? 'lv-my-team' : ''}`}>
                <Link to={`/team/${sport}/${c.team?.id}`} className="lv-team-left tr-team-link" onClick={e=>e.stopPropagation()}>
                  <LogoImg team={c.team} className="lv-logo" />
                  <div>
                    <div className="lv-name">{c.team?.shortDisplayName || c.team?.abbreviation}</div>
                    {c.records?.[0]?.summary && <div className="lv-record">{c.records[0].summary}</div>}
                  </div>
                </Link>
                <span className="lv-rhe-val">{getScore(c) ?? '0'}</span>
              </div>
            ))}
          </div>
          {(downDist || lastPlay) && (
            <div className="lv-center">
              {downDist && <div className="lv-down-dist">{isRedZone ? '🔴 ' : '🏈 '}{downDist}{possession ? ` · ${possession}` : ''}</div>}
              {lastPlay && <div className="lv-last-play"><span className="lv-lp-label">LAST PLAY</span><span className="lv-lp-text">{lastPlay}</span></div>}
            </div>
          )}
        </div>
        <div className="lv-actions">
          <button className="lv-btn" onClick={() => goTo('Gamecast')}>Gamecast</button>
          <button className="lv-btn" onClick={() => goTo('Box Score')}>Box Score</button>
        </div>
      </div>
    );
  }

  // ── NHL (hockey) ────────────────────────────────────────────
  const period = status?.period;
  const periodLabel = period === 1 ? '1st' : period === 2 ? '2nd' : period === 3 ? '3rd' : period ? `OT${period-3}` : '';
  const clock = status?.displayClock && status.displayClock !== '0:00' ? status.displayClock : '';
  const powerPlay = sit.powerPlayText || '';
  return (
    <div className="lv-bar">
      <div className="lv-status-row">
        <span className="lv-inning lv-top">● {periodLabel}{clock ? ` · ${clock}` : ''}</span>
        {broadcast && <span className="lv-broadcast">{broadcast}</span>}
      </div>
      <div className="lv-body">
        <div className="lv-teams-section">
          {[away, home].filter(Boolean).map((c) => (
            <div key={c.team?.id} className={`lv-team-row ${c.team?.id === String(teamId) ? 'lv-my-team' : ''}`}>
              <Link to={`/team/${sport}/${c.team?.id}`} className="lv-team-left tr-team-link" onClick={e=>e.stopPropagation()}>
                <LogoImg team={c.team} className="lv-logo" />
                <div>
                  <div className="lv-name">{c.team?.shortDisplayName || c.team?.abbreviation}</div>
                  {c.records?.[0]?.summary && <div className="lv-record">{c.records[0].summary}</div>}
                </div>
              </Link>
              <span className="lv-rhe-val">{getScore(c) ?? '0'}</span>
            </div>
          ))}
        </div>
        {(powerPlay || lastPlay) && (
          <div className="lv-center">
            {powerPlay && <div className="lv-down-dist">🏒 {powerPlay}</div>}
            {lastPlay && <div className="lv-last-play"><span className="lv-lp-label">LAST PLAY</span><span className="lv-lp-text">{lastPlay}</span></div>}
          </div>
        )}
      </div>
      <div className="lv-actions">
        <button className="lv-btn" onClick={() => goTo('Gamecast')}>Gamecast</button>
        <button className="lv-btn" onClick={() => goTo('Box Score')}>Box Score</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   GENERIC SPORT CARDS  (NFL / NBA / NHL)
   Same visual language as the MLB cards above.
   ══════════════════════════════════════════════════════ */

const accentStyle = (color) => color ? {
  background: `linear-gradient(135deg,color-mix(in srgb,${color} 15%,var(--bg2)) 0%,var(--bg2) 55%)`,
  borderColor: `color-mix(in srgb,${color} 55%,transparent)`,
  boxShadow: `0 0 12px color-mix(in srgb,${color} 25%,transparent)`,
} : undefined;

/** Team rows reused by all three sport card states */
function GenericTeamRows({ away, home, sport, showScore, finalLabel, liveLabel, awayScoreOverride, homeScoreOverride }) {
  const nav = useNavigate();
  const rec = (c) => c?.records?.[0]?.summary || '';
  const score = (c) => {
    if (c?.homeAway === 'away' && awayScoreOverride != null) return awayScoreOverride;
    if (c?.homeAway === 'home' && homeScoreOverride != null) return homeScoreOverride;
    const s = c?.score;
    if (s == null) return '—';
    return typeof s === 'object' ? s.displayValue : String(s);
  };
  return (
    <div className="mlbc-teams">
      {showScore && (
        <div className="mlbc-rhe-header">
          {finalLabel ? <span className="mlbc-final-label">{finalLabel}</span>
          : liveLabel  ? liveLabel
          : <span className="mlbc-rhe-spacer" />}
          <span style={{width:40,textAlign:'right',fontSize:11,color:'var(--text2)'}}>PTS</span>
        </div>
      )}
      {[away, home].filter(Boolean).map((c) => (
        <div key={c.team?.id} className="mlbc-team-row">
          <LogoImg team={c.team} className="mlbc-logo" />
          <div className="mlbc-team-info">
            <span className="mlbc-name">{c.team?.shortDisplayName || c.team?.displayName}</span>
            <span className="mlbc-rec">{rec(c)}</span>
          </div>
          {showScore && (
            <span className={`mlbc-stat${c.winner ? ' mlbc-winner' : ''}`} style={{width:40}}>
              {score(c)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function SportPreCard({ game, sport, navigate, accentColor }) {
  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find(c => c.homeAway === 'away') || competitors[0];
  const home = competitors.find(c => c.homeAway === 'home') || competitors[1];
  const broadcast = comp?.broadcasts?.[0]?.names?.[0] || '';
  const shortDetail = comp?.status?.type?.shortDetail || '';
  const timeStr = shortDetail.includes(' - ') ? shortDetail.split(' - ').slice(1).join(' - ') : shortDetail;
  return (
    <div className="mlbc-card" style={accentStyle(accentColor)}>
      <div className="mlbc-top-tap" onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}>
        <div className="mlbc-header">
          <span className="mlbc-time">{timeStr}</span>
          {broadcast && <span className="mlbc-broadcast"> · {broadcast}</span>}
        </div>
        <div className="mlbc-divider" />
        <GenericTeamRows away={away} home={home} sport={sport} />
      </div>
    </div>
  );
}

function SportLiveCard({ game, sport, navigate, accentColor, nhlScore }) {
  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find(c => c.homeAway === 'away') || competitors[0];
  const home = competitors.find(c => c.homeAway === 'home') || competitors[1];
  const broadcast = comp?.broadcasts?.[0]?.names?.[0] || '';
  const espnLiveStr = comp?.status?.type?.shortDetail || '';
  const sit = comp?.situation || {};

  // NHL: use NHL API data when available
  const isNhl = sport === 'nhl';
  const nhlPeriod = nhlScore?.period;
  const nhlClock  = nhlScore?.clock || '';
  const nhlPType  = nhlScore?.periodType || 'REG';
  const nhlPLabel = nhlPeriod ? (nhlPType === 'OT' ? 'OT' : `P${nhlPeriod}`) : '';
  const liveStr = isNhl && nhlPLabel ? `${nhlPLabel} ${nhlClock}` : espnLiveStr;

  // Override scores with NHL API
  const awayOverride = isNhl && nhlScore?.awayScore != null ? String(nhlScore.awayScore) : null;
  const homeOverride = isNhl && nhlScore?.homeScore != null ? String(nhlScore.homeScore) : null;

  const sitLine = sport === 'nfl'
    ? sit.downDistanceText || ''
    : sport === 'nba'
    ? (sit.possessionText ? `${sit.possessionText} possession` : '')
    : sport === 'nhl'
    ? (nhlScore?.ppTeam ? `${nhlScore.ppTeam} Power Play` : '')
    : '';

  const liveLabel = (
    <span className="mlbc-live-inline">
      <span className="mlbc-inning-live">{liveStr}</span>
      {broadcast && <span className="mlbc-broadcast"> · {broadcast}</span>}
    </span>
  );
  return (
    <div className="mlbc-card" style={accentStyle(accentColor)}>
      <div className="mlbc-top-tap" onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}>
        <GenericTeamRows away={away} home={home} sport={sport} showScore liveLabel={liveLabel}
          awayScoreOverride={awayOverride} homeScoreOverride={homeOverride} />
      </div>
      {sitLine && (
        <>
          <div className="mlbc-divider" />
          <div className="sport-sit-line">{sitLine}</div>
        </>
      )}
    </div>
  );
}

function SportFinalCard({ game, sport, navigate, accentColor }) {
  const comp = game.competitions?.[0];
  const competitors = comp?.competitors || [];
  const away = competitors.find(c => c.homeAway === 'away') || competitors[0];
  const home = competitors.find(c => c.homeAway === 'home') || competitors[1];
  const allLeaders = comp?.leaders || [];

  // Pick the most relevant leader categories per sport
  const wantedKeys = sport === 'nfl'
    ? ['passingYards', 'rushingYards']
    : sport === 'nba'
    ? ['points', 'rebounds', 'assists']
    : sport === 'nhl'
    ? ['saves', 'goals']
    : [];
  const leaderCats = wantedKeys.length
    ? wantedKeys.map(k => allLeaders.find(l => l.name === k)).filter(Boolean)
    : allLeaders.slice(0, 2);

  const topLeaders = leaderCats.map(cat => {
    const top = cat.leaders?.[0];
    if (!top) return null;
    const ath = top.athlete;
    return {
      cat: cat.shortDisplayName || cat.displayName,
      name: ath?.shortName || ath?.displayName || '',
      value: top.displayValue || '',
      headshot: typeof ath?.headshot === 'string' ? ath.headshot : ath?.headshot?.href,
      espnId: ath?.id,
    };
  }).filter(Boolean);

  return (
    <div className="mlbc-card" style={accentStyle(accentColor)}>
      <div className="mlbc-top-tap" onClick={() => navigate(`/boxscore/${sport}/${game.id}`)}>
        <GenericTeamRows away={away} home={home} sport={sport} showScore finalLabel="FINAL" />
      </div>
      {topLeaders.length > 0 && (
        <>
          <div className="mlbc-divider" />
          <div className="sport-leaders-row">
            {topLeaders.map((l, i) => (
              <div key={i} className="sport-leader-col"
                style={{ cursor: (l.espnId || l.name) ? 'pointer' : 'default' }}
                onClick={(ev) => { ev.stopPropagation(); if (l.espnId) navigate(`/player/${sport}/${l.espnId}`); else if (l.name) goToEspnPlayer(l.name, sport, navigate); }}>
                {l.headshot && <img src={l.headshot} alt="" className="sport-leader-photo" onError={e => e.target.style.display = 'none'} />}
                <div>
                  <div className="sport-leader-cat">{l.cat}</div>
                  <div className="sport-leader-name">{l.name}</div>
                  <div className="sport-leader-val">{l.value}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mlbc-divider" />
      <div className="mlbc-actions">
        <span className="mlbc-action-btn" onClick={(ev) => { ev.stopPropagation(); navigate(`/boxscore/${sport}/${game.id}`, { state: { tab: 'Box Score' } }); }}>Box Score</span>
      </div>
    </div>
  );
}

function SportNoGameCard({ team, sport, accentColor }) {
  const nav = useNavigate();
  const sportLabel = SPORTS[sport]?.label || sport.toUpperCase();
  const SPORT_BADGE_COLORS = { mlb: '#e74c3c', nba: '#f39c12', nfl: '#27ae60', nhl: '#3498db' };
  return (
    <div className="mlbc-card sport-nogame-card" style={accentStyle(accentColor)}
      onClick={() => nav(`/team/${sport}/${team.id}`)}>
      <div className="sport-nogame-header">
        <LogoImg team={team} className="sport-nogame-logo" />
        <div>
          <div className="sport-nogame-name">{team.displayName}</div>
          <span className="sport-nogame-badge" style={{ background: SPORT_BADGE_COLORS[sport] || '#555' }}>{sportLabel}</span>
        </div>
      </div>
      <div className="sport-nogame-text">No game today</div>
    </div>
  );
}

/* ── Main TeamRow ────────────────────────────────────── */
export default function TeamRow({ sport, team, dateStr, onHiddenChange }) {
  const { removeTeam } = useFavorites();
  const { game, loading, hasUpcomingGame } = useTeamGame(sport, team.id, 30000, dateStr);
  const navigate = useNavigate();

  const isLive = game?.competitions?.[0]?.status?.type?.state === 'in';
  const liveData = useLiveSituation(sport, isLive && sport !== 'mlb' ? game : null);
  // MLB live games use useMlbLiveGame inside MlbLiveCard itself (self-contained)
  const sportLabel = SPORTS[sport]?.label || sport.toUpperCase();
  // Adapted accent color — visible even for dark team colors (e.g. navy, midnight green)
  const rawColor = team.color ? `#${team.color}` : null;
  const rawAlt   = team.alternateColor ? `#${team.alternateColor}` : null;
  const accentColor = adaptColorForDarkBg(rawColor, rawAlt, '#0092ff');

  useEffect(() => {
    if (hasUpcomingGame !== undefined) {
      onHiddenChange?.(team.id, sport, !hasUpcomingGame);
    }
  }, [hasUpcomingGame]);

  const goToBoxScore = () => game && navigate(`/boxscore/${sport}/${game.id}`);

  if (loading) return <div className="mlbc-card mlbc-loading">Loading…</div>;

  // MLB — self-contained cards
  if (sport === 'mlb') {
    if (!game) return null;
    if (isLive) return <MlbLiveCard game={game} sport={sport} navigate={navigate} accentColor={accentColor} />;
    const st = game.competitions?.[0]?.status?.type?.state;
    if (st === 'post') return <MlbFinalCard game={game} sport={sport} navigate={navigate} accentColor={accentColor} />;
    return <MlbPreCard game={game} sport={sport} navigate={navigate} accentColor={accentColor} />;
  }

  // NFL / NBA / NHL — generic sport cards
  if (!game) return <SportNoGameCard team={team} sport={sport} accentColor={accentColor} />;
  if (isLive) return <SportLiveCard game={game} sport={sport} navigate={navigate} accentColor={accentColor} />;
  const st2 = game.competitions?.[0]?.status?.type?.state;
  if (st2 === 'post') return <SportFinalCard game={game} sport={sport} navigate={navigate} accentColor={accentColor} />;
  return <SportPreCard game={game} sport={sport} navigate={navigate} accentColor={accentColor} />;
}

// Named exports for use in ScoresPage and elsewhere
export { MlbPreCard, MlbLiveCard, MlbFinalCard, fetchMlbDecisions, SportPreCard, SportLiveCard, SportFinalCard };
