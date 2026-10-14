import type { Round } from './types';

const integer = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

export const fmt = (n: number | undefined, digits = 3) =>
  n !== undefined && Number.isFinite(n) ? n.toFixed(digits) : '—';

export const int = (n: number | undefined) => integer.format(n || 0);

export function bytes(n: number) {
  if (n >= 1048576) return `${fmt(n / 1048576, 1)} MB`;
  if (n >= 1024) return `${fmt(n / 1024, 1)} KB`;
  return `${int(n)} B`;
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const resultFor = (round: Round | null | undefined, id: string) =>
  round?.results.find((r) => r.id === id);

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
