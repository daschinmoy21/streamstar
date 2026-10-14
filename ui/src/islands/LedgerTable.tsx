import { useStore } from '@nanostores/preact';
import { ColorDot } from '../components/Legend';
import { fmt } from '../lib/format';
import { $latest } from '../lib/store';

export default function LedgerTable() {
  const latest = useStore($latest);

  return (
    <div class="table-scroll">
      <table class="table comparison-table">
        <thead>
          <tr>
            <th>Method</th>
            <th>Privacy model</th>
            <th>Probes</th>
            <th>Releases</th>
            <th>ρ</th>
            <th>Pure ε</th>
            <th>Composed ε</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {latest?.results.map((r) => (
            <tr key={r.id}>
              <td>
                <ColorDot color={r.color} />
                {r.name}
              </td>
              <td class={r.conditional ? 'conditional' : ''}>{r.privacy}</td>
              <td>{r.ledger.probe_queries}</td>
              <td>{r.ledger.release_queries}</td>
              <td>{fmt(r.ledger.rho, 4)}</td>
              <td>{fmt(r.ledger.pure_epsilon, 2)}</td>
              <td>
                {fmt(r.epsilon, 2)}
                {r.conditional && '*'}
              </td>
              <td class={r.exhausted ? 'exhausted' : ''}>
                {r.exhausted ? 'Cap reached' : r.conditional ? 'Conditional only' : 'Active'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
