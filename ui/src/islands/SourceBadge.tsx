import { useStore } from '@nanostores/preact';
import StatusDot from '../components/StatusDot';
import { capitalize } from '../lib/format';
import { $status } from '../lib/store';

export default function SourceBadge() {
  const { connection, source } = useStore($status);

  let label = 'Connecting to engine';
  if (connection === 'offline') label = 'Engine disconnected';
  else if (source === 'synthetic') label = 'Synthetic source connected';
  else if (source) label = `${capitalize(source)} source`;

  return (
    <div class="source-badge">
      <StatusDot />
      <span>{label}</span>
    </div>
  );
}
