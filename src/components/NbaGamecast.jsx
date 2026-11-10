import { useNavigate } from 'react-router-dom';
import { getTeamLogo } from '../api/espn';
import {
  NBA_BOX_COLUMNS,
  nbaPlayTitle,
  nbaPlayClock,
  nbaNotablePlays,
  nbaWinLabel,
  nbaCourtSides,
} from '../utils/nbaGamecast';

const FEED_LIMIT = 8;
const HIGHLIGHT = new Set(['PTS', 'REB', 'AST']);

function teamLogo(team) {
  return getTeamLogo(team) || team?.logo || '';
}

function PlayFeed({ plays, winById, away, home, onShowAll }) {
  const notable = nbaNotablePlays(plays).slice(0, FEED_LIMIT);
  if (!notable.length) return null;
  const awayAbbr = away?.team?.abbreviation || '';
  const homeAbbr = home?.team?.abbreviation || '';
  const logoFor = (teamId) => {
    const id = String(teamId || '');
    if (id && id === String(away?.team?.id)) return teamLogo(away.team);
    if (id && id === String(home?.team?.id)) return teamLogo(home.team);
    return '';
  };

  return (
    <section className="nba-gc-feed">
      {notable.map((play, index) => {
        const logo = logoFor(play.team?.id);
        const win = index === 0 ? nbaWinLabel(winById.get(String(play.id)), awayAbbr, homeAbbr) : '';
        return (
          <article key={play.id || index} className="nba-gc-play">
            {logo
              ? <img src={logo} alt="" className="nba-gc-play-logo" />
              : <span className="nba-gc-play-logo nba-gc-play-logo-empty" />}
            <div className="nba-gc-play-main">
              <div className="nba-gc-play-top">
                <span className="nba-gc-play-title">{nbaPlayTitle(play)}</span>
                <span className="nba-gc-play-score">{play.awayScore} {play.homeScore}</span>
              </div>
              <div className="nba-gc-play-meta">
                <span>{nbaPlayClock(play)}</span>
                {win && <span>{win}</span>}
              </div>
              {play.text && <p className="nba-gc-play-text">{play.text}</p>}
            </div>
          </article>
        );
      })}
      {onShowAll && (
        <button type="button" className="nba-gc-more" onClick={onShowAll}>Full Play-By-Play</button>
      )}
    </section>
  );
}

function CourtPlayer({ player, onOpen }) {
  return (
    <tr className={player.id ? 'bsp-tr bsp-tr-clickable' : 'bsp-tr'} onClick={() => player.id && onOpen(player.id)}>
      <td className="bsp-td bsp-td-player">
        <div className="bsp-player-cell">
          {player.headshot
            ? <img src={player.headshot} alt="" className="bsp-player-headshot" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            : null}
          <span className="bsp-player-name">{player.name}</span>
          {player.pos && <span className="bsp-nba-pos">{player.pos}</span>}
          {player.jersey && <span className="bsp-nba-num">#{player.jersey}</span>}
        </div>
      </td>
      {NBA_BOX_COLUMNS.map((col, index) => {
        const val = player.line[index] ?? '—';
        const isZero = val === '0' || val === '0-0';
        return (
          <td key={col.key} className={`bsp-td${HIGHLIGHT.has(col.key) ? ' bsp-hl' : ''}${isZero ? ' bsp-zero' : ''}`}>
            {val}
          </td>
        );
      })}
    </tr>
  );
}

function OnCourt({ sides, onOpen }) {
  if (!sides.length) return null;
  return (
    <section className="nba-gc-court bsp-nba">
      <h2 className="nba-gc-heading">On the Court</h2>
      {sides.map((side) => (
        <div key={side.id || side.name} className="bsp-table-wrap">
          <table className="bsp-table">
            <thead>
              <tr>
                <th className="bsp-th bsp-th-player">
                  <span className="nba-gc-teamhead">
                    {teamLogo(side.team) && <img src={teamLogo(side.team)} alt="" />}
                    {side.name}
                  </span>
                </th>
                {NBA_BOX_COLUMNS.map((col) => <th key={col.key} className="bsp-th">{col.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {side.players.map((player) => (
                <CourtPlayer key={player.id || player.name} player={player} onOpen={onOpen} />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

export default function NbaGamecast({ data, competitors, onShowAll }) {
  const navigate = useNavigate();
  const comps = competitors || [];
  const away = comps.find((comp) => comp.homeAway === 'away') || comps[0];
  const home = comps.find((comp) => comp.homeAway === 'home') || comps[1];
  const winById = new Map((data?.winprobability || []).map((row) => [String(row.playId), row.homeWinPercentage]));
  const sides = nbaCourtSides(data?.boxscore, comps);
  const open = (id) => navigate(`/player/nba/${id}`);

  return (
    <div className="nba-gc">
      <PlayFeed plays={data?.plays} winById={winById} away={away} home={home} onShowAll={onShowAll} />
      <OnCourt sides={sides} onOpen={open} />
    </div>
  );
}
