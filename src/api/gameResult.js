// Final score for a saved winner or total. The first host that answers is used.

import { easternDay } from './polymarket';

const PATH = {
  nhl: 'hockey/nhl',
  nfl: 'football/nfl',
};

async function scoreboard(league, gameStart) {
  const path = PATH[league];
  if (!path) return [];
  const dates = easternDay(gameStart).replace(/-/g, '');
  for (const host of ['https://site.api.espn.com', 'https://site.web.api.espn.com']) {
    try {
      const res = await fetch(`${host}/apis/site/v2/sports/${path}/scoreboard?dates=${dates}`);
      if (!res.ok) continue;
      const data = await res.json();
      return data.events || [];
    } catch {
      // Try the other host.
    }
  }
  return [];
}

export async function finalScore(league, gameStart, teams) {
  const events = await scoreboard(league, gameStart);
  const abbrs = new Set((teams || []).map((team) => String(team.abbr || '').toUpperCase()).filter(Boolean));
  const event = events.find((item) => {
    const comps = item.competitions?.[0]?.competitors || [];
    const found = comps.filter((comp) => abbrs.has(String(comp.team?.abbreviation || '').toUpperCase()));
    return found.length >= Math.min(2, abbrs.size);
  });
  if (!event) return { status: 'missing' };
  const competition = event.competitions?.[0];
  if (!competition?.status?.type?.completed) return { status: 'pending' };
  const scores = (competition.competitors || []).map((comp) => ({
    abbr: String(comp.team?.abbreviation || '').toUpperCase(),
    name: comp.team?.displayName || comp.team?.shortDisplayName || '',
    score: Number(comp.score),
    winner: Boolean(comp.winner),
  }));
  if (scores.length < 2 || scores.some((side) => !Number.isFinite(side.score))) return { status: 'missing' };
  return {
    status: 'final',
    scores,
    total: scores.reduce((sum, side) => sum + side.score, 0),
  };
}

const VOID_AFTER_MS = 18 * 60 * 60 * 1000;

export function gradeMarketTrade(trade, score, now = Date.now()) {
  if (!trade || trade.result) return trade;
  if (!(now >= trade.gameStart)) return trade;
  if (!score || score.status === 'pending') return trade;
  if (score.status !== 'final') {
    if (now < trade.gameStart + VOID_AFTER_MS) return trade;
    return { ...trade, result: 'void', actual: null, gradedAt: now };
  }
  if (trade.kind === 'winner') {
    const abbr = String(trade.pickAbbr || '').toUpperCase();
    const pick = String(trade.pick || trade.player || '').toLowerCase();
    const side = score.scores.find((item) => item.abbr === abbr || (pick && item.name.toLowerCase().includes(pick)));
    if (!side) {
      if (now < trade.gameStart + VOID_AFTER_MS) return trade;
      return { ...trade, result: 'void', actual: null, gradedAt: now };
    }
    return { ...trade, result: side.winner ? 'hit' : 'miss', actual: side.score, gradedAt: now };
  }
  if (trade.kind === 'total') {
    if (score.total === trade.line) return { ...trade, result: 'void', actual: score.total, gradedAt: now };
    const over = trade.pick === 'Over';
    const hit = over ? score.total > trade.line : score.total < trade.line;
    return { ...trade, result: hit ? 'hit' : 'miss', actual: score.total, gradedAt: now };
  }
  return trade;
}
