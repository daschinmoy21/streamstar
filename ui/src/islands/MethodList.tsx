import { useStore } from '@nanostores/preact';
import { ColorDot } from '../components/Legend';
import { $methods, $selected } from '../lib/store';

export default function MethodList() {
  const methods = useStore($methods);
  const selected = useStore($selected);

  return (
    <>
      <div class="nav-label methods-label">
        Estimators {methods.length > 0 && <span>{methods.length}</span>}
      </div>
      <div class="method-list">
      {methods.map((m) => (
        <button
          key={m.id}
          class={m.id === selected ? 'method-button selected' : 'method-button'}
          aria-pressed={m.id === selected}
          onClick={() => $selected.set(m.id)}
        >
          <ColorDot color={m.color} />
          <span>
            {m.name}
            {m.conditional && <small>Conditional privacy · {m.target}</small>}
          </span>
        </button>
      ))}
      </div>
    </>
  );
}
