// NBA injury report. Out is a real absence. Day-to-day is listed, and the
// minutes model only trims it. The report does not say who starts.

import { sameName, sameTeam } from './nflInjuries.js';

const HOST = 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';

let cache = null;

function statusOf(row) {
  const text = String(row?.status || '').toLowerCase();
  if (text === 'out') return 'out';
  if (text.includes('day')) return 'dtd';
  return '';
}

export function loadNbaInjuries() {
  if (!cache) {
    cache = fetch(HOST)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data?.injuries || []).map((team) => ({
        team: team.displayName || '',
        players: (team.injuries || []).map((row) => ({
          name: row.athlete?.displayName || '',
          status: statusOf(row),
        })).filter((row) => row.name && row.status),
      })))
      .catch(() => []);
  }
  return cache;
}

export function teamAbsences(report, teamName) {
  const team = (report || []).find((row) => sameTeam(row.team, teamName));
  return team?.players || [];
}

export function playerAbsence(name, absences) {
  const hit = (absences || []).find((row) => sameName(row.name, name));
  return hit?.status || '';
}
