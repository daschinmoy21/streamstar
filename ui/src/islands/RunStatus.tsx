import { useStore } from '@nanostores/preact';
import { $config, $status } from '../lib/store';

export default function RunStatus() {
  const config = useStore($config);
  const { connection, running } = useStore($status);

  let label = 'Connecting';
  if (connection === 'offline') label = 'Disconnected';
  else if (config) label = running ? 'Live experiment' : 'Paused';

  return (
    <>
      {config && <span class="seed-label">Seed {config.seed}</span>}
      <span class={running || !config ? 'run-status' : 'run-status paused'}>
        <i /> {label}
      </span>
    </>
  );
}
