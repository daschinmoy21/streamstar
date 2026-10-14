import { useStore } from '@nanostores/preact';
import { resultFor } from './format';
import { $latest, $selected } from './store';

/** The selected method's result in the latest round, if any. */
export function useSelectedResult() {
  const latest = useStore($latest);
  const selected = useStore($selected);
  return resultFor(latest, selected);
}
