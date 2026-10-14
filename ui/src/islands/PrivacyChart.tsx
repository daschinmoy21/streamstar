import { useStore } from '@nanostores/preact';
import { Legend } from '../components/Legend';
import LineChart from '../components/LineChart';
import { $config, $history, $methods, $visible } from '../lib/store';

export default function PrivacyChart() {
  const config = useStore($config);
  const history = useStore($history);
  const methods = useStore($methods);
  const visible = useStore($visible);

  return (
    <>
      <Legend />
      <LineChart
        rounds={history}
        series={methods.filter((m) => visible.includes(m.id))}
        value={(r) => r?.epsilon}
        target={config?.epsilon_limit}
        label="Cumulative epsilon by estimator"
      />
    </>
  );
}
