import { useStore } from '@nanostores/preact';
import { ColorDot } from '../components/Legend';
import { bytes, fmt } from '../lib/format';
import { $latest, $selected } from '../lib/store';

export default function ComparisonTable() {
  const latest = useStore($latest);
  const selected = useStore($selected);

  return (
    <div class="table-scroll">
      <table class="table comparison-table">
        <thead>
          <tr>
            <th>Method</th>
            <th>ℓ∞ error</th>
            <th>MSE</th>
            <th>NCR</th>
            <th>Top-k recall</th>
            <th>Width</th>
            <th>ε spent</th>
            <th>Releases</th>
            <th>Bytes / client</th>
            <th>Processing</th>
          </tr>
        </thead>
        <tbody>
          {latest?.results.map((r) => (
            <tr key={r.id} class={r.id === selected ? 'selected' : ''}>
              <td>
                <ColorDot color={r.color} />
                {r.name}
                <small>
                  {r.target} · {r.privacy}
                </small>
              </td>
              <td>{fmt(r.metrics.linf, 4)}</td>
              <td>{fmt(r.metrics.mse, 6)}</td>
              <td>{fmt(r.metrics.ncr, 3)}</td>
              <td>{fmt(r.metrics.top_k_recall * 100, 0)}%</td>
              <td>{r.width}</td>
              <td class={r.exhausted ? 'exhausted' : ''}>
                {fmt(r.epsilon, 2)}
                {r.conditional && '*'}
              </td>
              <td>{r.releases}</td>
              <td>{bytes(r.bytes_per_client)}</td>
              <td>{fmt(r.latency_ms, 1)} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
