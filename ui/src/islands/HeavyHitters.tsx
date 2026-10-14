import { useStore } from '@nanostores/preact';
import { fmt } from '../lib/format';
import { useSelectedResult } from '../lib/hooks';
import { $config } from '../lib/store';

export default function HeavyHitters() {
  const r = useSelectedResult();
  const config = useStore($config);
  const maxValue = Math.max(0.0001, ...(r?.top ?? []).flatMap((item) => [item.estimate, item.truth]));

  return (
    <section class="card heavy-panel">
      <div class="card-header">
        <div>
          <h2>Frequent items</h2>
          <p>{r ? `${r.target} · ${r.name}` : 'Estimated leaders in the current window'}</p>
        </div>
        {config && <span class="badge outline">Top {config.top_k}</span>}
      </div>
      <div class="table-scroll">
        <table class="table heavy-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Estimate</th>
              <th>Truth</th>
              <th>Δ</th>
              <th>Distribution</th>
            </tr>
          </thead>
          <tbody>
            {!r && (
              <tr>
                <td colSpan={5} class="empty-row">
                  Waiting for the first streaming window…
                </td>
              </tr>
            )}
            {r?.top.map((item) => {
              const delta = item.estimate - item.truth;
              return (
                <tr key={item.id}>
                  <td>item_{String(item.id).padStart(3, '0')}</td>
                  <td>{fmt(item.estimate, 4)}</td>
                  <td>{fmt(item.truth, 4)}</td>
                  <td class="delta">
                    {delta >= 0 ? '+' : ''}
                    {fmt(delta, 4)}
                  </td>
                  <td>
                    <div class="frequency-bars">
                      <i style={{ width: `${Math.max(0, (item.estimate / maxValue) * 100)}%` }} />
                      <i class="truth" style={{ width: `${(item.truth / maxValue) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
