// Learned from graded reads. A league stays put until 40 props have a hit or a
// miss. A tag moves only when it misses differently from the league overall,
// and only after 25 graded props carried it. The nudge shrinks toward zero
// when the sample is small, and it is recomputed from the whole log.

const MIN_LEAGUE = 40;
const MIN_TAG = 25;
const PRIOR = 80;
const GLOBAL_CAP = 0.025;
const TAG_CAP = 0.03;
const TAG_STACK_CAP = 0.05;

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function baseP(row) {
  return typeof row.baseP === 'number' && Number.isFinite(row.baseP) ? row.baseP : row.modelP;
}

function shrink(gap, n, cap) {
  if (!n) return 0;
  return clamp(gap * (n / (n + PRIOR)), -cap, cap);
}

function fitLeague(rows, league) {
  const graded = (rows || []).filter((row) => (
    row.league === league && (row.result === 'hit' || row.result === 'miss') && typeof baseP(row) === 'number'
  ));
  const hits = graded.filter((row) => row.result === 'hit').length;
  const mean = graded.length ? graded.reduce((sum, row) => sum + baseP(row), 0) / graded.length : null;
  const hitRate = graded.length ? hits / graded.length : null;
  const active = graded.length >= MIN_LEAGUE && mean != null;
  const gap = active ? hitRate - mean : 0;
  const global = active ? shrink(gap, graded.length, GLOBAL_CAP) : 0;
  const tags = {};
  if (active) {
    const grouped = new Map();
    for (const row of graded) {
      for (const tag of row.tags || []) {
        if (!grouped.has(tag)) grouped.set(tag, []);
        grouped.get(tag).push(row);
      }
    }
    for (const [tag, group] of grouped) {
      if (group.length < MIN_TAG) continue;
      const tagHits = group.filter((row) => row.result === 'hit').length / group.length;
      const tagMean = group.reduce((sum, row) => sum + baseP(row), 0) / group.length;
      const extra = (tagHits - tagMean) - gap;
      const delta = shrink(extra, group.length, TAG_CAP);
      if (Math.abs(delta) >= 0.005) tags[tag] = delta;
    }
  }
  return {
    active,
    graded: graded.length,
    need: MIN_LEAGUE,
    tagNeed: MIN_TAG,
    global,
    tags,
  };
}

export function learnCalibration(rows) {
  return {
    nfl: fitLeague(rows, 'nfl'),
    nhl: fitLeague(rows, 'nhl'),
  };
}

export function applyLearned(p, tags, fit) {
  if (!fit?.active || typeof p !== 'number' || !Number.isFinite(p)) return p;
  let next = p + (fit.global || 0);
  let tagShift = 0;
  for (const tag of tags || []) {
    const delta = fit.tags?.[tag];
    if (typeof delta === 'number') tagShift += delta;
  }
  next += clamp(tagShift, -TAG_STACK_CAP, TAG_STACK_CAP);
  return clamp(next, 0.02, 0.92);
}

export function calibrationMoves(fit) {
  if (!fit?.active) return [];
  const moves = [];
  if (Math.abs(fit.global || 0) >= 0.005) moves.push({ label: 'Overall', delta: fit.global });
  for (const [label, delta] of Object.entries(fit.tags || {})) {
    if (Math.abs(delta) >= 0.005) moves.push({ label, delta });
  }
  return moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.label.localeCompare(b.label));
}

export function priceRead(row, calibration) {
  const raw = baseP(row);
  const modelP = applyLearned(raw, row.tags, calibration?.[row.league]);
  return {
    ...row,
    baseP: raw,
    modelP,
    edge: modelP - row.price,
  };
}
