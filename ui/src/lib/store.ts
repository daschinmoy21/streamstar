// Shared state for every island on the page.
//
// The engine is polled once per second, but each slice of the response lives in
// its own store and is only replaced when its contents actually change. An
// island re-renders only when a store it reads changes: the method list ignores
// new rounds, and nothing re-renders while the stream is paused.

import { atom, computed, onMount, type WritableAtom } from 'nanostores';
import { errorMessage } from './format';
import type { Action, Config, Method, Round, Source, StateResponse } from './types';

const POLL_INTERVAL_MS = 1000;
const HISTORY_LIMIT = 120;

export interface Status {
  connection: 'connecting' | 'online' | 'offline';
  offlineReason: string;
  source: Source | null;
  running: boolean;
  error: string;
}

export const $config = atom<Config | null>(null);
export const $methods = atom<Method[]>([]);
export const $history = atom<Round[]>([]);
export const $latest = computed($history, (history) => history.at(-1) ?? null);
export const $status = atom<Status>({
  connection: 'connecting',
  offlineReason: '',
  source: null,
  running: false,
  error: '',
});
export const $busy = atom(false);

// UI preferences survive navigation between pages.
export const $selected = persistent('streamstar:selected', 'gated');
export const $visible = persistent('streamstar:visible', ['hybrid', 'adaptive', 'gated']);

export function toggleVisible(id: string) {
  const visible = $visible.get();
  $visible.set(visible.includes(id) ? visible.filter((v) => v !== id) : [...visible, id]);
}

// ---------- polling ----------

let generation = 0;
// Responses can arrive out of order (a control action polls while the regular
// poll is still in flight). Only apply a response newer than the last one applied.
let requested = 0;
let applied = 0;

function setIfChanged<T>(store: WritableAtom<T>, value: T) {
  if (JSON.stringify(store.get()) !== JSON.stringify(value)) store.set(value);
}

async function poll() {
  const id = ++requested;
  try {
    const since = $history.get().at(-1)?.number ?? 0;
    const response = await fetch(`/api/state?since=${since}&generation=${generation}&limit=${HISTORY_LIMIT}`);
    if (!response.ok) throw new Error(`Engine returned ${response.status}`);
    const next: StateResponse = await response.json();
    if (id < applied) return;
    applied = id;

    if (next.generation !== generation) {
      generation = next.generation;
      $history.set(next.history);
    } else {
      // Merge by round number: an overlapping response must not duplicate rounds.
      const history = $history.get();
      const fresh = next.history.filter((round) => round.number > (history.at(-1)?.number ?? 0));
      if (fresh.length) $history.set([...history, ...fresh].slice(-HISTORY_LIMIT));
    }
    setIfChanged($config, next.config);
    setIfChanged($methods, next.methods);
    setIfChanged($status, {
      connection: 'online',
      offlineReason: '',
      source: next.source,
      running: next.running,
      error: next.error,
    });
  } catch (err) {
    if (id < applied) return;
    applied = id;
    setIfChanged($status, {
      ...$status.get(),
      connection: 'offline',
      offlineReason: errorMessage(err),
    });
  }
}

/** Polls once per interval while the page is visible; catches up as soon as it is shown again. */
function startPolling() {
  let stopped = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    clearTimeout(timer);
    if (stopped || inFlight || document.hidden) return;
    inFlight = true;
    await poll();
    inFlight = false;
    if (!stopped && !document.hidden) timer = setTimeout(tick, POLL_INTERVAL_MS);
  };

  document.addEventListener('visibilitychange', tick);
  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', tick);
  };
}

// Poll while at least one island is subscribed to engine data. Islands are
// server-rendered at build time, so never poll outside the browser.
let subscribers = 0;
let stopPolling: (() => void) | undefined;

function keepPolling() {
  if (typeof window === 'undefined') return;
  if (subscribers++ === 0) stopPolling = startPolling();
  return () => {
    if (--subscribers === 0) stopPolling?.();
  };
}

for (const store of [$config, $methods, $history, $status]) onMount(store, keepPolling);

// ---------- controls ----------

/** Sends a control action and refreshes state. Throws the server's message on failure. */
export async function control(action: Action, config?: Config) {
  if ($busy.get()) return;
  $busy.set(true);
  try {
    const response = await fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...(config ? { config } : {}) }),
    });
    if (!response.ok) throw new Error((await response.text()).trim());
    await poll();
  } finally {
    $busy.set(false);
  }
}

// ---------- helpers ----------

function persistent<T>(key: string, initial: T) {
  const store = atom<T>(initial);
  if (typeof localStorage === 'undefined') return store;
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) store.set(JSON.parse(saved));
  } catch {
    // Ignore unreadable preferences.
  }
  store.listen((value) => localStorage.setItem(key, JSON.stringify(value)));
  return store;
}
