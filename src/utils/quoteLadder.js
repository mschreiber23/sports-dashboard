// A higher line is harder, so its Yes price has to be lower. A 15+ quote
// under a 20+ quote is a bad book, not a bargain. Those lines stay off
// the picks.

import { takerQuote } from './propBook.js';

export function crossedLines(lines) {
  const rows = [];
  for (const line of lines || []) {
    const level = Number(line?.line);
    const price = takerQuote(line, 'yes');
    if (!Number.isFinite(level) || price == null) continue;
    rows.push({ line, level, price });
  }
  const bad = new Set();
  for (const row of rows) {
    if (rows.some((other) => other.level > row.level && other.price > row.price)) bad.add(row.line);
  }
  return bad;
}

export function soundLines(lines) {
  const bad = crossedLines(lines);
  if (bad.size === 0) return lines || [];
  return (lines || []).filter((line) => !bad.has(line));
}
