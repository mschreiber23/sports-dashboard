// NFL injury report and offensive depth chart. Out, doubtful, and injured
// reserve clear a player. Questionable moves 40% of his carries, targets, or
// attempts. The depth-chart order decides who is next at that position.

const HOST = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl';
const SLOT = { qb: 'QB', rb: 'RB', fb: 'RB', te: 'TE', wr1: 'WR', wr2: 'WR', wr3: 'WR' };

const injuryCache = { promise: null };
const depthCache = new Map();

export function injuryMiss(status) {
  const text = String(status || '').toLowerCase();
  if (!text || text === 'active' || text === 'probable') return 0;
  if (text.includes('question')) return 0.4;
  if (
    text === 'out'
    || text === 'ir'
    || text.includes('doubt')
    || text.includes('reserve')
    || text.includes('suspend')
    || text.includes('pup')
    || text.includes('nfi')
  ) return 1;
  return 0;
}

export function skillGroup(position) {
  const abbr = String(position || '').toUpperCase();
  if (abbr === 'QB') return 'QB';
  if (abbr === 'RB' || abbr === 'HB' || abbr === 'FB') return 'RB';
  if (abbr === 'WR') return 'WR';
  if (abbr === 'TE') return 'TE';
  return '';
}

function squash(name) {
  return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function sameName(a, b) {
  const left = squash(a);
  const right = squash(b);
  return Boolean(left) && left === right;
}

export function sameTeam(a, b) {
  const left = squash(a);
  const right = squash(b);
  if (!left || !right) return false;
  return left === right || left.endsWith(right) || right.endsWith(left);
}

function statusText(injury) {
  if (!injury) return '';
  if (typeof injury === 'string') return injury;
  if (typeof injury.status === 'string') return injury.status;
  if (injury.status?.abbreviation) return injury.status.abbreviation;
  if (injury.type?.abbreviation) return injury.type.abbreviation;
  return '';
}

export function buildRoles(slots, injuries) {
  const roles = [];
  const seen = new Set();
  const rank = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const slot of slots || []) {
    const group = SLOT[String(slot?.slot || '').toLowerCase()];
    if (!group) continue;
    for (const athlete of slot.athletes || []) {
      const name = athlete?.name || '';
      const key = squash(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rank[group] += 1;
      roles.push({
        name,
        group,
        rank: rank[group],
        miss: injuryMiss(athlete.status),
      });
    }
  }
  for (const row of injuries || []) {
    const group = skillGroup(row?.position);
    const key = squash(row?.name);
    if (!group || !key) continue;
    const miss = injuryMiss(row.status);
    if (seen.has(key)) {
      const role = roles.find((item) => squash(item.name) === key);
      if (role && miss > role.miss) role.miss = miss;
      continue;
    }
    if (!(miss > 0)) continue;
    seen.add(key);
    rank[group] += 1;
    roles.push({ name: row.name, group, rank: rank[group], miss });
  }
  return roles;
}

function depthSlots(data) {
  const slots = [];
  for (const chart of data?.depthchart || []) {
    const positions = chart.positions || {};
    for (const slot of Object.keys(positions)) {
      const athletes = (positions[slot].athletes || []).map((athlete) => ({
        name: athlete.displayName || athlete.shortName || '',
        status: statusText((athlete.injuries || [])[0]),
      }));
      slots.push({ slot, athletes });
    }
  }
  return slots;
}

function injuryRows(list) {
  return (list || []).map((item) => ({
    name: item.athlete?.displayName || '',
    position: item.athlete?.position?.abbreviation || '',
    status: statusText(item.status) || statusText(item),
  }));
}

async function loadInjuries() {
  if (!injuryCache.promise) {
    injuryCache.promise = (async () => {
      const res = await fetch(`${HOST}/injuries`);
      if (!res.ok) throw new Error('injury report');
      const data = await res.json();
      return (data.injuries || []).map((team) => ({
        id: String(team.id || ''),
        teamName: team.displayName || '',
        injuries: injuryRows(team.injuries),
      }));
    })().catch((err) => {
      injuryCache.promise = null;
      throw err;
    });
  }
  return injuryCache.promise;
}

async function loadDepth(id) {
  if (!id) return [];
  if (depthCache.has(id)) return depthCache.get(id);
  const pending = (async () => {
    const res = await fetch(`${HOST}/teams/${id}/depthcharts`);
    if (!res.ok) return [];
    return depthSlots(await res.json());
  })().catch(() => []);
  depthCache.set(id, pending);
  return pending;
}

function teamHit(report, teamName) {
  return report.find((team) => sameTeam(team.teamName, teamName)) || null;
}

export async function loadTeamRoles(teamNames) {
  const report = await loadInjuries();
  const wanted = [];
  const seen = new Set();
  for (const teamName of teamNames || []) {
    const team = teamHit(report, teamName);
    if (!team || seen.has(team.id)) continue;
    seen.add(team.id);
    wanted.push(team);
  }
  const charts = await Promise.all(wanted.map((team) => loadDepth(team.id)));
  return wanted.map((team, index) => ({
    teamName: team.teamName,
    roles: buildRoles(charts[index], team.injuries),
  }));
}

export function rolesForTeam(report, teamName) {
  const team = (report || []).find((item) => sameTeam(item.teamName, teamName));
  return team?.roles || [];
}

export function roleFor(roles, name) {
  return (roles || []).find((role) => sameName(role.name, name)) || null;
}

export function mergeTeammates(roles, selfName, boardMates, logFor) {
  const mates = [];
  const seen = [];
  const add = (name) => {
    if (!name || sameName(name, selfName) || seen.some((item) => sameName(item, name))) return false;
    seen.push(name);
    return true;
  };
  for (const role of roles || []) {
    if (!add(role.name)) continue;
    const log = (logFor ? logFor(role.name) : null) || {};
    mates.push({
      name: role.name,
      recent: log.context || log.recent || null,
      prior: log.priorContext || log.prior || null,
      miss: role.miss || 0,
      group: role.group || skillGroup(log.position),
      rank: role.rank || 99,
    });
  }
  for (const mate of boardMates || []) {
    if (!add(mate?.name)) continue;
    const log = (logFor ? logFor(mate.name) : null) || {};
    mates.push({
      name: mate.name,
      recent: mate.recent || log.context || null,
      prior: mate.prior || log.priorContext || null,
      miss: 0,
      group: skillGroup(mate.position || log.position),
      rank: 99,
    });
  }
  return mates;
}

export function playerRole(roles, name, position) {
  const role = roleFor(roles, name);
  return {
    miss: role?.miss || 0,
    group: role?.group || skillGroup(position),
    rank: role?.rank || 99,
  };
}
