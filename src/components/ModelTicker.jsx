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
      <p className="props-likely-note">Each point is how often the call was right after that day’s graded props. A Yes is right when the player clears the line. A No is right when they stay under. Voids stay out.</p>
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
                  <span>{pct(point.rate)}</span>
                  <span>{point.hits}/{point.graded}</span>
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
