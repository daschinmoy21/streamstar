// Mirrors the JSON returned by GET /api/state (internal/server/server.go).

export interface Config {
  domain: number;
  clients: number;
  events_per_round: number;
  window_rounds: number;
  contribution_cap: number;
  rows: number;
  width: number;
  min_width: number;
  max_width: number;
  probe_width: number;
  noise_multiplier: number;
  probe_multiplier: number;
  epsilon_limit: number;
  delta: number;
  local_epsilon: number;
  local_width: number;
  target_error: number;
  change_threshold: number;
  max_staleness: number;
  drift_every: number;
  top_k: number;
  seed: number;
  deterministic_noise: boolean;
}

export interface Method {
  id: string;
  name: string;
  color: string;
  target: string;
  privacy: string;
  adaptive: boolean;
  gated: boolean;
  conditional: boolean;
}

export interface Ledger {
  rho: number;
  pure_epsilon: number;
  delta: number;
  limit: number;
  queries: number;
  probe_queries: number;
  release_queries: number;
}

export interface Metrics {
  linf: number;
  mse: number;
  ncr: number;
  top_k_variance: number;
  top_k_recall: number;
  top_k_error_variance: number;
  top_k_intersection: number;
}

export interface Item {
  id: number;
  estimate: number;
  truth: number;
}

export interface Result extends Method {
  round: number;
  width: number;
  epsilon: number;
  ledger: Ledger;
  released: boolean;
  reason: string;
  last_release: number;
  staleness: number;
  releases: number;
  exhausted: boolean;
  detected: boolean;
  signal: number;
  fit: { alpha: number; beta: number; width: number; predicted_collision: number };
  metrics: Metrics;
  top: Item[];
  latency_ms: number;
  bytes_per_client: number;
  total_bytes: number;
  memory_bytes: number;
}

export interface Round {
  number: number;
  timestamp: number;
  phase: string;
  injected_drift: boolean;
  events: number;
  clipped: number;
  window_events: number;
  window_cohorts: number;
  latency_ms: number;
  end_to_end_p50_ms: number;
  end_to_end_p95_ms: number;
  throughput: number;
  results: Result[];
}

export type Source = 'synthetic' | 'replay' | 'manual' | 'kafka';

export interface StateResponse {
  config: Config;
  methods: Method[];
  source: Source;
  running: boolean;
  generation: number;
  error: string;
  latest: Round | null;
  history: Round[];
}

export type Action = 'play' | 'pause' | 'step' | 'drift' | 'reset';
