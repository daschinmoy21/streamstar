import { useStore } from '@nanostores/preact';
import { $history, $latest } from '../lib/store';

const GRID_ROUNDS = 60;

/** Publication decisions of the gated method. */
export default function ReleasePanel() {
  const history = useStore($history);
  const latest = useStore($latest);
  const gate = latest?.results.find((r) => r.gated);

  return (
    <section class="card release-panel">
      <div class="card-header">
        <div>
          <h2>Release decisions</h2>
          <p>Private probes stay in the privacy ledger</p>
        </div>
      </div>
      <div class="release-number">
        {gate?.releases ?? 0} <small>of {latest?.number ?? 0} rounds</small>
      </div>
      <p class="release-description">Fresh estimates published by the adaptive gate</p>
      <div class="release-grid" aria-label="Release timeline">
        {history.slice(-GRID_ROUNDS).map((round) => {
          const g = round.results.find((r) => r.gated);
          const classes = ['release-cell', g?.released && 'published', round.injected_drift && 'injected'];
          return <span key={round.number} class={classes.filter(Boolean).join(' ')} title={`Round ${round.number}: ${g?.reason ?? ''}`} />;
        })}
      </div>
      <div class="release-legend">
        <span>
          <i class="release-key" /> Published
        </span>
        <span>
          <i class="hold-key" /> Reused
        </span>
      </div>
      <div class="release-detail">
        <div>
          <span>Last decision</span>
          <b>{gate?.reason || 'Awaiting a private probe'}</b>
        </div>
        <div>
          <span>Estimate age</span>
          <b>{gate?.staleness ?? 0} rounds</b>
        </div>
        <div>
          <span>Probe / release queries</span>
          <b>
            {gate?.ledger.probe_queries ?? 0} / {gate?.ledger.release_queries ?? 0}
          </b>
        </div>
      </div>
    </section>
  );
}
