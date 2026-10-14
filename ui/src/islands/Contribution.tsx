import { useStore } from '@nanostores/preact';
import { int } from '../lib/format';
import { $config } from '../lib/store';

export default function Contribution() {
  const config = useStore($config);
  if (!config) return <p>Loading the experiment configuration…</p>;

  return (
    <p>
      Each client group contributes at most {config.contribution_cap} events per cohort, across {config.window_rounds} sliding
      cohorts. Public domain: {int(config.domain)} items; public population: {int(config.clients)} groups.
    </p>
  );
}
