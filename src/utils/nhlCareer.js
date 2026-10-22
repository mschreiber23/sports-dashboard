// ESPN's season table. The year on the feed is the year the season ends,
// so 2016 is the 2015-16 season. Totals come from ESPN, not a sum of the
// rows, because a traded season is listed once per team and once as a total.

export function seasonLabel(year) {
  const end = Number(year);
  if (!Number.isFinite(end)) return '';
  return `${end - 1}-${String(end).slice(-2)}`;
}

export function parseAthleteCareer(data, currentYear, categoryName) {
  const categories = data?.categories || [];
  const category = categoryName
    ? categories.find((cat) => cat.name === categoryName) || categories[0]
    : categories[0];
  const labels = category?.labels || [];
  if (!labels.length) return null;
  const teams = data?.teams || {};
  const rows = [];
  (category.statistics || []).forEach((row, index) => {
    const year = Number(row?.season?.year);
    const label = seasonLabel(year);
    if (!label) return;
    const slug = row?.teamSlug || '';
    const team = teams[slug];
    rows.push({
      key: `${year}|${slug}|${index}`,
      label,
      team: team?.abbreviation || (slug ? 'TOT' : ''),
      seasonTotal: !team,
      current: Number.isFinite(Number(currentYear)) && year === Number(currentYear),
      values: labels.map((_, i) => row?.stats?.[i] ?? '—'),
    });
  });
  if (!rows.length) return null;
  return {
    labels,
    rows,
    totals: labels.map((_, i) => category.totals?.[i] ?? '—'),
  };
}

/** Drop exact column labels. FG stays distinct from FG%. */
export function omitCareerColumns(table, hiddenLabels) {
  if (!table) return null;
  const hidden = new Set(hiddenLabels || []);
  const keep = [];
  table.labels.forEach((label, index) => {
    if (!hidden.has(label)) keep.push(index);
  });
  return {
    labels: keep.map((index) => table.labels[index]),
    rows: table.rows.map((row) => ({
      ...row,
      values: keep.map((index) => row.values[index]),
    })),
    totals: keep.map((index) => table.totals[index]),
  };
}
