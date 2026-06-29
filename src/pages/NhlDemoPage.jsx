import NhlGamecast from './NhlGamecast';

// Stanley Cup Finals 2026: CAR 3 – VGK 0 (Game 6, CAR wins the Cup)
const DEMO_GAME_ID = 2025030416;

export default function NhlDemoPage() {
  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px 4px',
        fontSize: 11, color: 'var(--text2)', fontWeight: 600,
      }}>
        <span style={{
          background: 'rgba(255,183,0,0.15)', color: '#ffb700',
          padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '0.4px',
        }}>DEMO</span>
        2026 Stanley Cup Final · Game 6 · CAR vs VGK
      </div>
      <NhlGamecast directNhlGameId={DEMO_GAME_ID} sport="nhl" />
    </div>
  );
}
