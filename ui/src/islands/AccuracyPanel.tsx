import { useStore } from '@nanostores/preact';
import { useState } from 'preact/hooks';
import { Legend } from '../components/Legend';
import LineChart from '../components/LineChart';
import { $config, $history, $methods, $status, $visible } from '../lib/store';

const METRICS = [
  { id: 'linf', label: 'ℓ∞ error' },
  { id: 'mse', label: 'MSE' },
] as const;

export default function AccuracyPanel() {
  const config = useStore($config);
  const history = useStore($history);
  const methods = useStore($methods);
  const visible = useStore($visible);
  const { running } = useStore($status);
  const [metric, setMetric] = useState<'linf' | 'mse'>('linf');

  const latest = history.at(-1);

  return (
    <section class="card accuracy-panel">
      <div class="card-header">
        <div>
          <h2>
            Accuracy over time
            {running && (
              <span class="badge live-chip">
                <i />
                Live
              </span>
            )}
          </h2>
          <p>Maximum absolute error against the clipped window truth</p>
        </div>
        <div class="tabs chart-menu">
          {METRICS.map((m) => (
            <button key={m.id} class={m.id === metric ? 'chart-metric selected' : 'chart-metric'} onClick={() => setMetric(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <Legend />
      <LineChart
        rounds={history}
        series={methods.filter((m) => visible.includes(m.id))}
        value={(r) => r?.metrics[metric]}
        target={metric === 'linf' ? config?.target_error : null}
        label="Estimation error over streaming rounds"
        tooltip
      />
      <div class="card-footer">
        <span>
          <i class="drift-key" /> Injected distribution shift
        </span>
        <span>{latest ? `${history.length} rounds shown · ${latest.phase}` : 'Waiting for streaming events'}</span>
      </div>
    </section>
  );
}
