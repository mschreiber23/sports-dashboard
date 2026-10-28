const SUPPORT = {
  'ice time up': 'Ice time is up.',
  'shots up': 'The shot rate is up.',
  'power play': 'Power-play points add a little.',
  home: 'Home is a small lift.',
  'soft defense': 'The opponent has been giving up points.',
  'soft vs centers': 'This defense has been giving points to centers.',
  'soft vs wingers': 'This defense has been giving points to wingers.',
  'soft vs guards': 'This defense has been giving production to guards.',
  'soft vs forwards': 'This defense has been giving production to forwards.',
  'boards available': 'The opponent has been losing the offensive glass.',
  'turnovers up': 'The opponent has been turning the ball over.',
  'teammate out': 'A teammate at this position is out, so some of those minutes move here.',
  'pace up': 'The game should be a bit faster.',
  'high total': 'The game total is high.',
  'minutes up': 'Minutes are up.',
  'usage up': 'Usage is up.',
  rested: 'There is extra rest.',
  'hot vs opponent': 'This line has been hitting against this opponent.',
  'hot shooting': 'Recent shooting is hot. The read fades some of that.',
};

const CAUTION = {
  'back to back': 'This is a back-to-back.',
  'short week': 'This is a short week.',
  '3 in 4': 'This is the third game in four nights.',
  'ice time down': 'Ice time is down.',
  'shots down': 'The shot rate is down.',
  'minutes down': 'Minutes are down.',
  'usage down': 'Usage is down.',
  'foul risk': 'Foul trouble has been cutting minutes.',
  'volatile minutes': 'Minutes have been swinging.',
  blowout: 'A blowout could cost late minutes.',
  'cold shooting': 'Recent shooting is cold. The read fades some of that.',
  'tough defense': 'The opponent has been stingy.',
  'tough vs centers': 'This defense has been stingy against centers.',
  'tough vs wingers': 'This defense has been stingy against wingers.',
  'tough vs guards': 'This defense has been stingy against guards.',
  'tough vs forwards': 'This defense has been stingy against forwards.',
  'boards taken': 'The opponent has been grabbing offensive rebounds.',
  'turnovers down': 'The opponent has been taking care of the ball.',
  'pace down': 'The pace has been slower.',
  'low total': 'The game total is low.',
  'day to day': 'Listed day-to-day, so the read is trimmed.',
  out: 'Listed out, so this is capped.',
  'low volume': 'The usage math is light.',
};

function unique(lines) {
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

export function pickTitle(item) {
  if (!item) return '';
  if (item.gameLine && item.kind === 'winner') return `${item.player} to win`;
  if (item.gameLine) return `${item.player} ${item.prop}`.trim();
  if (item.prediction === 'no') return `${item.player} — No, ${item.prop}`;
  return `${item.player} — ${item.prop}`;
}

function gapSentence(item) {
  if (item.modelPct == null || item.market == null) return '';
  const gap = item.edgePts > 0 ? ` That is ${item.edgePts} points above the price.` : '';
  if (item.gameLine && item.kind === 'winner') {
    return `The read has them at ${item.modelPct}% to win. The price is ${item.market}%.${gap}`;
  }
  if (item.gameLine) {
    return `The read is ${item.modelPct}% on ${item.player}. The price is ${item.market}%.${gap}`;
  }
  if (item.prediction === 'no') {
    return `The read says ${item.modelPct}% they stay under. The No price is ${item.market}%.${gap}`;
  }
  return `The read is ${item.modelPct}% this hits. The Yes price is ${item.market}%.${gap}`;
}

function recordSentence(item) {
  if (item.gameLine || item.hits == null || !item.total) return '';
  if (item.prediction === 'no') {
    const price = item.modelPct == null && item.market != null ? ` The No price is ${item.market}%.` : '';
    return `The line hit in ${item.hits} of the last ${item.total}. This pick is the under.${price}`;
  }
  const price = item.modelPct == null && item.market != null ? ` The Yes price is ${item.market}%.` : '';
  return `Cleared this line in ${item.hits} of the last ${item.total}.${price}`;
}

function tagSentence(tag, item) {
  const text = String(tag || '');
  if (/^\d+ games$/.test(text)) return `Built from the last ${text}.`;
  if (text === 'home') return item.gameLine ? 'They are at home.' : SUPPORT.home;
  if (text === 'road') return item.gameLine ? 'They are on the road.' : 'Watch: This is on the road.';
  if (SUPPORT[text]) return SUPPORT[text];
  if (CAUTION[text]) return `Watch: ${CAUTION[text]}`;
  if (text.endsWith(' back')) return `${text.slice(0, -5)} is back, so the read uses the games they played together.`;
  if (text.endsWith(' targets down')) return 'This defense has been throwing less to that position.';
  if (text.endsWith(' targets')) return `This defense has been throwing more to the ${text.slice(0, -8)}.`;
  if (text.endsWith(' out') || text.endsWith(' doubtful') || text.endsWith(' questionable')) {
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}, and that work moves down the depth chart.`;
  }
  return '';
}

function factorSentence(factor, item) {
  const label = factor?.label || '';
  const value = factor?.value;
  if (!label || value == null || value === '') return '';
  if (label === 'Last 10') return '';
  if (label === 'Long sample' && /^\d+\/\d+$/.test(String(value))) {
    const [hits, total] = String(value).split('/').map(Number);
    if (item.prediction === 'no' && hits / total <= 0.45) return `Over the longer run, only ${value} cleared it.`;
    if (item.prediction !== 'no' && hits / total >= 0.55) return `Over the longer run, ${value} cleared it.`;
    return '';
  }
  if (label.startsWith('vs ')) {
    const [hits, total] = String(value).split('/').map(Number);
    if (!total) return '';
    if (item.prediction === 'no' && hits / total <= 0.45) return `Against ${label.slice(3)}, this line hit ${value}.`;
    if (item.prediction !== 'no' && hits / total >= 0.5) return `Against ${label.slice(3)}, this line hit ${value}.`;
    return '';
  }
  if (label === 'Role' && String(value).includes('back')) return `${value} in the lineup, so the read uses the games they played together.`;
  if (label === 'Injuries') return `${value} changes the usage.`;
  if (label === 'Weather' && value !== 'Dome') return `Weather: ${value}.`;
  if (label === 'Proj') return `Tonight's projection is ${value}.`;
  if (label === 'Out') return `${value} ${String(value).includes(',') ? 'are' : 'is'} out.`;
  if (label === 'Lineup' && value === 'Listed out') return 'Listed out, so this is capped.';
  if (label === 'Lineup' && value === 'Day to day') return 'Listed day-to-day, so the read is trimmed.';
  if (label === 'Script' && value === 'Throwing') return 'The script leans toward throwing.';
  if (label === 'Script' && value === 'Running') return 'The script leans toward the run.';
  if (label === 'Opp goals') return `The opponent is allowing ${value}.`;
  if (label === 'Opp pts') return `The opponent is allowing ${value}.`;
  return '';
}

export function pickReasons(item) {
  if (!item) return [];
  const support = [];
  const caution = [];
  for (const tag of item.tags || []) {
    const line = tagSentence(tag, item);
    if (!line) continue;
    if (line.startsWith('Watch:')) caution.push(line);
    else support.push(line);
  }
  for (const factor of item.factors || []) {
    const line = factorSentence(factor, item);
    if (line) support.push(line);
  }
  return unique([gapSentence(item), recordSentence(item), ...support.slice(0, 4), ...caution.slice(0, 2)]).filter(Boolean);
}

export function rankPicks(picks) {
  return [...(picks || [])].sort((a, b) => (
    Number(Boolean(b.modeled)) - Number(Boolean(a.modeled))
    || (b.edge || 0) - (a.edge || 0)
    || (a.gameStart || 0) - (b.gameStart || 0)
    || String(a.player || '').localeCompare(String(b.player || ''))
  ));
}
