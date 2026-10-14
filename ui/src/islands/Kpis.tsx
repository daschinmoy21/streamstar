import { useStore } from '@nanostores/preact';
import { bytes, fmt, int, resultFor } from '../lib/format';
import { useSelectedResult } from '../lib/hooks';
import { $config, $history, $latest, $methods, $selected } from '../lib/store';

export default function Kpis() {
  const config = useStore($config);
  const latest = useStore($latest);
  const methods = useStore($methods);
  const selected = useStore($selected);
  const r = useSelectedResult();

  const limit = config?.epsilon_limit ?? 0;
  const epsilon = r?.epsilon ?? 0;
  const aboveTarget = r && config && r.metrics.linf > config.target_error;

  return (
    <div class="metrics-grid">
      <article class="card metric-card">
        <div class="metric-label">
          Estimation error <span>ℓ∞</span>
        </div>
        <div class="metric-row">
          <div class="metric-value">{r ? fmt(r.metrics.linf, 4) : '—'}</div>
          <Sparkline />
        </div>
        <div class="metric-footer">
          <span class={`metric-tag ${aboveTarget ? 'warning' : 'success'}`}>
            {!r ? 'Waiting for first window' : aboveTarget ? 'Above target accuracy' : 'Within target accuracy'}
          </span>
          <span>{methods.find((m) => m.id === selected)?.name}</span>
        </div>
      </article>

      <article class="card metric-card">
        <div class="metric-label">
          Privacy spent <span>ε</span>
        </div>
        <div class="metric-value">
          {r ? fmt(r.epsilon, 2) : '—'} <small>/ {fmt(limit, 0)}</small>
        </div>
        <div class="budget-track">
          <div
            class={r?.exhausted ? 'exhausted-fill' : ''}
            style={{ width: `${limit ? Math.min(100, (epsilon / limit) * 100) : 0}%` }}
          />
        </div>
        <div class="metric-footer">
          <span>
            {r?.exhausted ? 'Budget exhausted' : limit ? `${fmt(100 * (1 - epsilon / limit), 0)}% budget remaining` : 'Budget available'}
          </span>
          <span>δ = 10⁻⁵</span>
        </div>
      </article>

      <article class="card metric-card">
        <div class="metric-label">
          Sketch width <span>W</span>
        </div>
        <div class="metric-value">
          {r?.width ?? '—'} <small>buckets</small>
        </div>
        <div class="metric-footer">
          <span>{r?.adaptive ? 'Selected from private probe' : 'Fixed experimental layout'}</span>
          <span>
            {config?.rows ?? '—'} rows · {bytes(r?.memory_bytes ?? 0)}
          </span>
        </div>
      </article>

      <article class="card metric-card">
        <div class="metric-label">
          Processing rate <span>evt/s</span>
        </div>
        <div class="metric-value">
          {latest ? int(latest.throughput) : '—'} <small>evt/s</small>
        </div>
        <div class="metric-footer">
          <span>{fmt(latest?.latency_ms, 1)} ms per round</span>
          <span>{int(latest?.window_events)} events in window</span>
        </div>
      </article>
    </div>
  );
}

/** ℓ∞ error of the selected method over the last 20 rounds. */
function Sparkline() {
  const history = useStore($history);
  const selected = useStore($selected);

  const values = history.slice(-20).map((round) => resultFor(round, selected)?.metrics.linf ?? 0);
  const max = Math.max(0.001, ...values);
  const step = 82 / Math.max(1, values.length - 1);
  const path = values.map((v, i) => `${i ? 'L' : 'M'} ${i * step} ${30 - (v / max) * 25}`).join(' ');

  return (
    <svg class="sparkline" viewBox="0 0 82 32" aria-hidden="true">
      <path d={path} fill="none" stroke="var(--foreground)" stroke-width="1.5" stroke-linejoin="round" />
    </svg>
  );
}
