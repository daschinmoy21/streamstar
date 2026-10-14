import { useStore } from '@nanostores/preact';
import { useState } from 'preact/hooks';
import Icon from '../components/Icon';
import { capitalize, errorMessage, int } from '../lib/format';
import { $busy, $config, $latest, $status, control } from '../lib/store';
import type { Action } from '../lib/types';

export default function ExperimentBar() {
  const config = useStore($config);
  const status = useStore($status);
  const latest = useStore($latest);
  const busy = useStore($busy);
  const [actionError, setActionError] = useState('');
  const [dismissed, setDismissed] = useState('');

  const synthetic = status.source === 'synthetic';
  const controllable = !busy && (synthetic || status.source === 'replay');

  const run = async (action: Action) => {
    try {
      await control(action);
      setActionError('');
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  let scenario = 'Connecting to engine';
  if (synthetic) scenario = config?.drift_every ? 'Drifting Zipf stream' : 'Stationary Zipf stream';
  else if (status.source) scenario = `${capitalize(status.source)} event stream`;

  // Server errors persist until the stream resumes; let the user hide them meanwhile.
  const error = actionError || status.error;
  const dismiss = () => {
    setDismissed(error);
    setActionError('');
  };

  return (
    <>
      <div class="card experiment-bar">
        <div class="experiment-source">
          <span class="source-icon">
            <Icon name="activity" />
          </span>
          <div>
            <b>{scenario}</b>
            {config && (
              <span>
                {int(config.clients)} client groups · {int(config.domain)}-item domain · {config.window_rounds} cohorts
              </span>
            )}
          </div>
        </div>
        <div class="experiment-controls">
          <span class="badge outline round-badge">Round {latest?.number ?? 0}</span>
          <button class="button outline" disabled={!controllable || !synthetic} onClick={() => run('drift')}>
            <Icon name="zap" />
            <span>Inject drift</span>
          </button>
          <button class="button outline" disabled={!controllable} aria-label="Process one round" onClick={() => run('step')}>
            <Icon name="step" />
            <span>Step</span>
          </button>
          <button class="button primary" disabled={!controllable} onClick={() => run(status.running ? 'pause' : 'play')}>
            <Icon name={status.running ? 'pause' : 'play'} />
            <span>{status.running ? 'Pause stream' : 'Resume stream'}</span>
          </button>
        </div>
      </div>
      {error && error !== dismissed && (
        <div class="notice" role="alert">
          <span>{error}</span>
          <button class="button ghost icon-button notice-dismiss" aria-label="Dismiss" onClick={dismiss}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </>
  );
}
