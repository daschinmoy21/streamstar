import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Round, StateResponse } from './types';

type Store = typeof import('./store');

const round = (number: number) => ({ number, results: [] }) as unknown as Round;

function state(overrides: Partial<StateResponse> = {}): StateResponse {
  return {
    config: { seed: 26 } as StateResponse['config'],
    methods: [],
    source: 'synthetic',
    running: true,
    generation: 1,
    error: '',
    latest: null,
    history: [],
    ...overrides,
  };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** A fetch mock whose responses the test resolves explicitly, in any order. */
function controllableFetch() {
  const pending: { url: string; resolve: (response: Response) => void }[] = [];
  const fetch = vi.fn(
    (url: string) => new Promise<Response>((resolve) => pending.push({ url: String(url), resolve })),
  );
  vi.stubGlobal('fetch', fetch);
  return { fetch, pending };
}

let store: Store;
let unsubscribe: () => void;

async function start() {
  store = await import('./store');
  unsubscribe = store.$history.listen(() => {});
}

const settle = () => vi.advanceTimersByTimeAsync(0);

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  setHidden(false);
});

afterEach(async () => {
  // Nanostores unmounts a store 1s after its last listener leaves; let that
  // stop the poller so it cannot leak into the next test.
  unsubscribe?.();
  await vi.advanceTimersByTimeAsync(1000);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('polling', () => {
  it('requests a bounded history and appends new rounds without duplicates', async () => {
    const { pending } = controllableFetch();
    await start();

    expect(pending[0].url).toBe('/api/state?since=0&generation=0&limit=120');
    pending[0].resolve(json(state({ history: [round(1), round(2)] })));
    await settle();
    expect(store.$history.get().map((r) => r.number)).toEqual([1, 2]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(pending[1].url).toBe('/api/state?since=2&generation=1&limit=120');
    // An overlapping response repeats round 2.
    pending[1].resolve(json(state({ history: [round(2), round(3)] })));
    await settle();
    expect(store.$history.get().map((r) => r.number)).toEqual([1, 2, 3]);
  });

  it('replaces history when the engine starts a new generation', async () => {
    const { pending } = controllableFetch();
    await start();
    pending[0].resolve(json(state({ history: [round(1), round(2), round(3)] })));
    await settle();

    await vi.advanceTimersByTimeAsync(1000);
    pending[1].resolve(json(state({ generation: 2, history: [round(1)] })));
    await settle();
    expect(store.$history.get().map((r) => r.number)).toEqual([1]);
  });

  it('ignores a response that arrives after a newer one', async () => {
    const { pending } = controllableFetch();
    await start();
    pending[0].resolve(json(state()));
    await settle();

    // The regular poll is in flight when the user pauses.
    await vi.advanceTimersByTimeAsync(1000);
    const slowPoll = pending[1];
    const pausing = store.control('pause');
    pending[2].resolve(json({ ok: true }));
    await settle();
    pending[3].resolve(json(state({ running: false })));
    await pausing;
    expect(store.$status.get().running).toBe(false);

    slowPoll.resolve(json(state({ running: true })));
    await settle();
    expect(store.$status.get().running).toBe(false);
  });

  it('does not re-publish unchanged data', async () => {
    const { pending } = controllableFetch();
    await start();
    pending[0].resolve(json(state({ history: [round(1)] })));
    await settle();

    const changes = vi.fn();
    const unbind = [store.$config, store.$methods, store.$status, store.$history].map((s) => s.listen(changes));
    await vi.advanceTimersByTimeAsync(1000);
    pending[1].resolve(json(state()));
    await settle();
    expect(changes).not.toHaveBeenCalled();
    unbind.forEach((u) => u());
  });

  it('stops while the page is hidden and catches up when shown', async () => {
    const { fetch, pending } = controllableFetch();
    await start();
    pending[0].resolve(json(state()));
    await settle();

    setHidden(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);

    setHidden(false);
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports the engine as offline when a request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('connection refused'))));
    await start();
    await settle();
    expect(store.$status.get()).toMatchObject({ connection: 'offline', offlineReason: 'connection refused' });
  });
});
