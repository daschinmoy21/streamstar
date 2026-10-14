import { useStore } from '@nanostores/preact';
import { $status } from '../lib/store';

export default function StatusDot() {
  const { connection } = useStore($status);
  return <span class={connection === 'offline' ? 'status-dot offline' : 'status-dot'} />;
}
