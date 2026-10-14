import { useStore } from '@nanostores/preact';
import StatusDot from '../components/StatusDot';
import { int } from '../lib/format';
import { $latest, $status } from '../lib/store';

export default function FooterStatus() {
  const { connection, offlineReason } = useStore($status);
  const latest = useStore($latest);

  let message = 'Connecting to the Go streaming engine';
  if (connection === 'offline') message = offlineReason;
  else if (latest) message = `${int(latest.events)} events processed · ${int(latest.clipped)} clipped this round`;
  else if (connection === 'online') message = 'Connected · waiting for first round';

  return (
    <span>
      <StatusDot /> {message}
    </span>
  );
}
