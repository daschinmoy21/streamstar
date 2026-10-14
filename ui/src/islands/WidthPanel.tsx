import { useStore } from '@nanostores/preact';
import LineChart from '../components/LineChart';
import { bytes, fmt } from '../lib/format';
import { useSelectedResult } from '../lib/hooks';
import { $config, $history, $latest, $methods } from '../lib/store';

export default function WidthPanel() {
  const config = useStore($config);
  const history = useStore($history);
  const latest = useStore($latest);
  const methods = useStore($methods);
  const r = useSelectedResult();
  const alpha = latest?.results.find((result) => result.gated)?.fit.alpha;

  return (
    <section class="card width-panel">
      <div class="card-header">
        <div>
          <h2>Sketch width</h2>
          <p>Adjusted from private tail estimates</p>
        </div>
        <span class="badge outline">Zipf α {alpha ? fmt(alpha, 2) : '—'}</span>
      </div>
      <LineChart
        rounds={history}
        series={methods.filter((m) => m.adaptive)}
        value={(result) => result?.width}
        minMax={config?.max_width}
        label="Sketch width over rounds"
        step
      />
      <div class="card-footer">
        <span>Adaptive width</span>
        <span>
          {r ? `${bytes(r.bytes_per_client)} / client this round · ${bytes(r.total_bytes)} total` : 'Includes both secure-sum helper shares'}
        </span>
      </div>
    </section>
  );
}
