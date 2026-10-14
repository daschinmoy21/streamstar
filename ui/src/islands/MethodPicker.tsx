import { useStore } from '@nanostores/preact';
import { $methods, $selected } from '../lib/store';

/** Replaces the sidebar method list on narrow screens. */
export default function MethodPicker() {
  const methods = useStore($methods);
  const selected = useStore($selected);

  return (
    <label class="mobile-method-label">
      Selected estimator
      <select value={selected} onChange={(e) => $selected.set(e.currentTarget.value)}>
        {methods.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}
