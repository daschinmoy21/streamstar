import { useStore } from '@nanostores/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import Icon from '../components/Icon';
import { errorMessage } from '../lib/format';
import { $busy, $config, $status, control } from '../lib/store';
import type { Config } from '../lib/types';

const SCENARIOS = [
  { value: 'drifting', label: 'Scheduled Zipf drift', driftEvery: 15 },
  { value: 'stable', label: 'Stationary Zipf stream', driftEvery: 0 },
  { value: 'fast', label: 'Frequent distribution shifts', driftEvery: 5 },
];

const WIDTHS = [16, 32, 64, 128, 256];

interface Field {
  name: keyof Config;
  label: string;
  min?: number;
  max?: number;
  step?: number;
}

const DATA_FIELDS: Field[] = [
  { name: 'clients', label: 'Client groups', min: 2, max: 100000 },
  { name: 'domain', label: 'Domain size', min: 8, max: 1000000 },
  { name: 'events_per_round', label: 'Events per round', min: 1, max: 1000000 },
  { name: 'window_rounds', label: 'Window cohorts', min: 1, max: 32 },
  { name: 'contribution_cap', label: 'Contribution cap', min: 1, max: 1024 },
  { name: 'seed', label: 'Data seed' },
];

const PRIVACY_FIELDS: Field[] = [
  { name: 'epsilon_limit', label: 'Privacy cap ε', min: 0.1, step: 0.1 },
  { name: 'noise_multiplier', label: 'Gaussian multiplier', min: 0.1, step: 0.1 },
  { name: 'probe_multiplier', label: 'Probe multiplier', min: 0.1, step: 0.1 },
  { name: 'local_epsilon', label: 'Local ε / round', min: 0.01, max: 16, step: 0.01 },
  { name: 'target_error', label: 'Target ℓ∞ error', min: 0.001, step: 0.001 },
  { name: 'change_threshold', label: 'Change threshold', min: 0.001, step: 0.001 },
  { name: 'max_staleness', label: 'Max estimate age', min: 1 },
];

function scenarioFor(driftEvery: number) {
  if (driftEvery === 0) return 'stable';
  return driftEvery <= 6 ? 'fast' : 'drifting';
}

/** Settings button plus the drawer it opens. Only synthetic runs can be reset. */
export default function Settings() {
  const config = useStore($config);
  const { source } = useStore($status);
  const busy = useStore($busy);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      else if (event.key === 'Tab' && drawerRef.current) trapFocus(event, drawerRef.current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!config) return;
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const next = { ...config, drift_every: SCENARIOS.find((s) => s.value === data.get('scenario'))?.driftEvery ?? 0 };
    for (const [key, value] of data) {
      if (key !== 'scenario') Object.assign(next, { [key]: Number(value) });
    }

    try {
      await control('reset', next);
      close();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const input = (field: Field) => (
    <label key={field.name}>
      {field.label}
      <input
        name={field.name}
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        defaultValue={String(config?.[field.name] ?? '')}
        required
      />
    </label>
  );

  return (
    <>
      <button
        ref={buttonRef}
        class="button outline icon-button"
        aria-label="Experiment settings"
        disabled={!config || source !== 'synthetic'}
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        <Icon name="settings" />
      </button>

      {open && config && (
        <>
          <div class="drawer-backdrop" onClick={close} />
          <aside ref={drawerRef} class="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div class="drawer-heading">
              <div>
                <h2 id="settings-title">Experiment settings</h2>
                <p class="settings-intro">
                  Applying settings starts a new synthetic run. This clears the charts and creates new experimental ledgers.
                </p>
              </div>
              <button class="button ghost icon-button" aria-label="Close settings" onClick={close}>
                <Icon name="close" />
              </button>
            </div>

            <form onSubmit={submit}>
              <div class="form-section">Data &amp; windows</div>
              <label>
                Stream scenario
                <select ref={firstFieldRef} name="scenario">
                  {SCENARIOS.map((s) => (
                    <option key={s.value} value={s.value} selected={s.value === scenarioFor(config.drift_every)}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <div class="form-pair">{DATA_FIELDS.map(input)}</div>

              <div class="form-section">Sketch &amp; privacy</div>
              <div class="form-pair">
                <label>
                  Initial width
                  <select name="width">
                    {WIDTHS.map((w) => (
                      <option key={w} selected={w === config.width}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
                {PRIVACY_FIELDS.map(input)}
              </div>

              {error && <div class="notice">{error}</div>}
              <button class="button primary apply-button" type="submit" disabled={busy}>
                Start new experiment
              </button>
              <p class="settings-footnote">
                Privacy noise uses crypto entropy by default. Reproducible noise is a CLI research option.
              </p>
            </form>
          </aside>
        </>
      )}
    </>
  );
}

/** Keeps Tab and Shift+Tab cycling inside the open drawer. */
function trapFocus(event: KeyboardEvent, container: HTMLElement) {
  const focusable = [...container.querySelectorAll<HTMLElement>('button, input, select, a[href]')].filter(
    (el) => !el.hasAttribute('disabled'),
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
