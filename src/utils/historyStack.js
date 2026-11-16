// Each browser history entry keeps its own page. Back and forward return to
// that entry. A new visit drops the pages that used to sit ahead of it.

export function nextHistoryStack(pages, index, location, navType, limit = 30) {
  const found = pages.findIndex((page) => page.key === location.key);
  if (navType === 'POP' && found !== -1) return { pages, index: found };

  if (navType === 'REPLACE' && pages.length) {
    const at = Math.min(Math.max(index, 0), pages.length - 1);
    const next = pages.slice();
    next[at] = location;
    return { pages: next, index: at };
  }

  const base = pages.slice(0, Math.max(index, 0) + 1);
  if (base[base.length - 1]?.key === location.key) {
    return { pages: base, index: base.length - 1 };
  }
  base.push(location);
  const capped = base.length > limit ? base.slice(base.length - limit) : base;
  return { pages: capped, index: capped.length - 1 };
}

export function rememberHistory(stack, location, navType, limit = 30) {
  if (!stack) return { pages: [location], index: 0, key: location.key };
  if (stack.key === location.key) return stack;
  const next = nextHistoryStack(stack.pages, stack.index, location, navType, limit);
  return { ...next, key: location.key };
}
