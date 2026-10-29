const SUPPORT = {
  'ice time up': 'Ice time is up.',
  'shots up': 'Shots are up.',
  'power play': 'Power-play points add a little.',
  home: 'Playing at home.',
  'soft defense': 'The opponent has been giving up points.',
  'soft vs centers': 'This defense has been giving points to centers.',
  'soft vs wingers': 'This defense has been giving points to wingers.',
  'soft vs guards': 'This defense has been giving production to guards.',
  'soft vs forwards': 'This defense has been giving production to forwards.',
  'boards available': 'The opponent has been losing the offensive glass.',
  'turnovers up': 'The opponent has been turning the ball over.',
  'teammate out': 'A teammate at this position is out, so some of those minutes come here.',
  'pace up': 'The game should be a little faster.',
  'high total': 'The game total is high.',
  'minutes up': 'Minutes are up.',
  'usage up': 'Usage is up.',
  rested: 'There is extra rest.',
  'hot vs opponent': 'This has been hitting against this opponent.',
  'hot shooting': 'Recent shooting is hot, and the number fades some of that.',
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
  'cold shooting': 'Recent shooting is cold, and the number fades some of that.',
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
  'low volume': 'The chances behind this are light.',
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

function leadSentence(item) {
  const price = item.market != null ? ` The price is ${item.market}%.` : '';
  if (item.modelPct != null) {
    if (item.gameLine && item.kind === 'winner') return `We have them at ${item.modelPct}% to win.${price}`;
    if (item.gameLine) return `We have ${item.player} at ${item.modelPct}%.${price}`;
    if (item.prediction === 'no') return `We have the under at ${item.modelPct}%.${price}`;
    return `We have this at ${item.modelPct}%.${price}`;
  }
  if (item.hits != null && item.total) {
    if (item.prediction === 'no') return `The line hit in only ${item.hits} of the last ${item.total}.${price}`;
    return `Cleared it in ${item.hits} of the last ${item.total}.${price}`;
  }
  return price.trim();
}

function edgeSentence(item) {
  if (item.modelPct == null || !(item.edgePts > 0)) return '';
  return `That is ${item.edgePts} points above the price.`;
}

function recordSentence(item) {
  if (item.modelPct == null || item.gameLine || item.hits == null || !item.total) return '';
  if (item.prediction === 'no') return `The line hit in only ${item.hits} of the last ${item.total}.`;
  return `Cleared it in ${item.hits} of the last ${item.total}.`;
}

function tagSentence(tag, item) {
  const text = String(tag || '');
  if (/^\d+ games$/.test(text)) return `Built from the last ${text}.`;
  if (text === 'home') return item.gameLine ? 'They are at home.' : SUPPORT.home;
  if (text === 'road') return item.gameLine ? 'They are on the road.' : 'This is on the road.';
  if (SUPPORT[text]) return SUPPORT[text];
  if (CAUTION[text]) return CAUTION[text];
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
    if (item.prediction === 'no' && hits / total <= 0.45) return `Over the longer run, only ${hits} of ${total} cleared it.`;
    if (item.prediction !== 'no' && hits / total >= 0.55) return `Over the longer run, ${hits} of ${total} cleared it.`;
    return '';
  }
  if (label.startsWith('vs ')) {
    const [hits, total] = String(value).split('/').map(Number);
    if (!total) return '';
    if (item.prediction === 'no' && hits / total <= 0.45) return `Against ${label.slice(3)}, ${hits} of ${total}.`;
    if (item.prediction !== 'no' && hits / total >= 0.5) return `Against ${label.slice(3)}, ${hits} of ${total}.`;
    return '';
  }
  if (label === 'Role' && String(value).includes('back')) return `${value} in the lineup, so the read uses the games they played together.`;
  if (label === 'Injuries') return `${value} changes the usage.`;
  if (label === 'Weather' && value !== 'Dome') return `Weather: ${value}.`;
  if (label === 'Proj') return `The projection tonight is ${value}.`;
  if (label === 'Out') return `${value} ${String(value).includes(',') ? 'are' : 'is'} out.`;
  if (label === 'Lineup' && value === 'Listed out') return 'Listed out, so this is capped.';
  if (label === 'Lineup' && value === 'Day to day') return 'Listed day-to-day, so the read is trimmed.';
  if (label === 'Script' && value === 'Throwing') return 'The script leans toward throwing.';
  if (label === 'Script' && value === 'Running') return 'The script leans toward the run.';
  if (label === 'Opp goals') return `The opponent is allowing ${value}.`;
  if (label === 'Opp pts') return `The opponent is allowing ${value}.`;
  return '';
}

function shownPct(item) {
  if (typeof item?.modelPct === 'number') return item.modelPct;
  if (typeof item?.rate === 'number') return item.rate;
  return -1;
}

export function pickSummary(item) {
  if (!item) return { lead: '', edge: '', why: [], watch: [] };
  const why = [];
  const watch = [];
  const record = recordSentence(item);
  if (record) why.push(record);
  for (const tag of item.tags || []) {
    const line = tagSentence(tag, item);
    if (!line) continue;
    if (CAUTION[tag] || tag === 'road') watch.push(line);
    else why.push(line);
  }
  for (const factor of item.factors || []) {
    const line = factorSentence(factor, item);
    if (line) why.push(line);
  }
  return {
    lead: leadSentence(item),
    edge: edgeSentence(item),
    why: unique(why).slice(0, 5),
    watch: unique(watch).slice(0, 2),
  };
}

export function rankPicks(picks) {
  return [...(picks || [])].sort((a, b) => (
    shownPct(b) - shownPct(a)
    || (b.edge || 0) - (a.edge || 0)
    || (a.gameStart || 0) - (b.gameStart || 0)
    || String(a.player || '').localeCompare(String(b.player || ''))
  ));
}
