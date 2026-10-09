import { accuracyReport } from '../utils/propBook';
import { usePropSync } from './PropSync';

function pct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  return `${Math.round(value * 100)}%`;
}

function Spark({ series }) {
  if (!series || series.length < 2) return null;
  const width = 88;
  const height = 22;
  const points = series.map((point, index) => {
    const x = (index / (series.length - 1)) * width;
    const y = height - point.rate * (height - 2) - 1;
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg className="model-spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={points} />
    </svg>
  );
}

export function AccuracyPanel() {
  const { reads } = usePropSync();
  const report = accuracyReport(reads || []);
  return (
    <section className="ledger-section">
      <h3>Accuracy over time</h3>
      <p className="props-likely-note">Each day is that day’s record. The line is the running rate after that day, and the record at the right is the whole sample. A call needs a 4-point edge, and winning $25 cannot cost more than $36 after the fee, so the price stays at 57% or under. The points score is the 1+ line. Voids stay out.</p>
      {report.sports.map((sport) => (
        <div className="model-sport" key={sport.league}>
          <div className="model-sport-top">
            <span>{sport.label}</span>
            <Spark series={sport.series} />
            <span>{sport.graded ? `${sport.hits}–${sport.misses} · ${pct(sport.rate)}` : '0–0'}</span>
          </div>
          {sport.series.length > 0 && (
            <div className="model-days">
              {sport.series.slice(-8).map((point) => (
                <div className="model-day" key={point.day}>
                  <span>{point.day.slice(5)}</span>
                  <span>{pct(point.dayCount ? point.dayHits / point.dayCount : null)}</span>
                  <span>{point.dayHits}/{point.dayCount}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

export default function ModelTicker({ onOpen }) {
  const { reads } = usePropSync();
  if (!reads) return null;
  const report = accuracyReport(reads);
  return (
    <button type="button" className="model-ticker" onClick={onOpen}>
      <span className="model-ticker-score">
        <b>Model</b>
        <span>{report.hits} right</span>
        <span>{report.misses} wrong</span>
        <span>{pct(report.rate)}</span>
      </span>
      <span className="model-ticker-sports">
        {report.sports.map((sport) => (
          <span key={sport.league}>
            {sport.label} {sport.graded ? `${sport.hits}–${sport.misses} · ${pct(sport.rate)}` : '0–0'}
          </span>
        ))}
      </span>
    </button>
  );
}
