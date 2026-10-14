import { useStore } from '@nanostores/preact';
import { $methods, $visible, toggleVisible } from '../lib/store';

export const ColorDot = ({ color }: { color: string }) => (
  <i class="color-dot" style={{ background: color }} />
);

/** Series toggles shared by every chart; hiding a method hides it everywhere. */
export function Legend() {
  const methods = useStore($methods);
  const visible = useStore($visible);

  return (
    <div class="legend">
      {methods.map((m) => {
        const on = visible.includes(m.id);
        return (
          <button key={m.id} class={on ? 'enabled' : ''} aria-pressed={on} onClick={() => toggleVisible(m.id)}>
            <ColorDot color={m.color} />
            {m.name}
          </button>
        );
      })}
    </div>
  );
}
