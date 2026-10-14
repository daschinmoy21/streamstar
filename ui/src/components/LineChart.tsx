import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { fmt, resultFor } from '../lib/format';
import type { Method, Result, Round } from '../lib/types';
import { ColorDot } from './Legend';

const PAD = { left: 51, right: 19, top: 14, bottom: 32 };
const COLORS = { grid: '#27272a', axis: '#a1a1aa', target: '#71717a', warning: '#f59e0b' };

interface Props {
  rounds: Round[];
  series: Method[];
  value: (result: Result | undefined) => number | undefined;
  label: string;
  /** Dashed reference line, e.g. the target error or privacy cap. */
  target?: number | null;
  /** Draw a step function with integer axis labels. */
  step?: boolean;
  /** Lower bound for the top of the y-axis. */
  minMax?: number;
  tooltip?: boolean;
}

export default function LineChart({ rounds, series, value, label, target = null, step = false, minMax = 0, tooltip = false }: Props) {
  const [ref, { width, height }] = useSize<SVGSVGElement>();
  const [pointerX, setPointerX] = useState<number | null>(null);

  const w = width - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const ready = w > 0 && h > 0;
  const points = series.map((m) => rounds.map((round) => value(resultFor(round, m.id))));

  const finite = points.flat().filter((v): v is number => v !== undefined && Number.isFinite(v));
  const ymax = Math.max(minMax, Math.max(target ?? 0, ...finite, 0.001) * 1.17);
  const last = rounds.length - 1;
  const x = (i: number) => PAD.left + (last === 0 ? w / 2 : (i * w) / last);
  const y = (v: number) => PAD.top + h - (Math.max(0, v) / ymax) * h;

  // Recomputed every render so the tooltip follows new rounds under a still cursor.
  const hovered =
    pointerX === null || !rounds.length
      ? null
      : Math.max(0, Math.min(last, Math.round(((pointerX - PAD.left) / w) * last)));

  return (
    <div class="chart-container">
      <svg
        ref={ref}
        class="chart"
        role="img"
        aria-label={label}
        viewBox={ready ? `0 0 ${width} ${height}` : undefined}
        onPointerMove={tooltip ? (e) => setPointerX(e.clientX - e.currentTarget.getBoundingClientRect().left) : undefined}
        onPointerLeave={tooltip ? () => setPointerX(null) : undefined}
      >
        {ready && !rounds.length && (
          <text x={width / 2} y={height / 2} text-anchor="middle" class="chart-empty">
            The next window starts the story.
          </text>
        )}
        {ready && rounds.length > 0 && (
          <>
            {[0, 1, 2, 3, 4].map((i) => {
              const v = (ymax * i) / 4;
              return (
                <g key={i}>
                  <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke={COLORS.grid} />
                  <AxisLabel x={PAD.left - 10} y={y(v) + 4} anchor="end">
                    {step ? Math.round(v) : fmt(v, v < 0.01 ? 4 : 2)}
                  </AxisLabel>
                </g>
              );
            })}

            {xTicks(rounds.length).map((index, tick) => (
              <AxisLabel key={tick} x={x(index)} y={height - 10} anchor="middle">
                {String(rounds[index].number).padStart(2, '0')}
              </AxisLabel>
            ))}

            {rounds.map((round, i) =>
              round.injected_drift ? (
                <line
                  key={round.number}
                  x1={x(i)}
                  x2={x(i)}
                  y1={PAD.top}
                  y2={PAD.top + h}
                  stroke={COLORS.warning}
                  stroke-dasharray="4 4"
                  opacity={0.6}
                />
              ) : null,
            )}

            {target !== null && (
              <>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(target)} y2={y(target)} stroke={COLORS.target} stroke-dasharray="5 5" />
                <AxisLabel x={width - PAD.right} y={y(target) - 6} anchor="end">{`target ${target}`}</AxisLabel>
              </>
            )}

            {series.map((m, s) => {
              const values = points[s];
              const end = values[last];
              return (
                <g key={m.id}>
                  <path
                    d={linePath(values, x, y, step)}
                    fill="none"
                    stroke={m.color}
                    stroke-width={m.gated ? 2.3 : 1.6}
                    stroke-linejoin="round"
                    stroke-linecap="round"
                    opacity={m.gated ? 1 : 0.85}
                  />
                  {end !== undefined && Number.isFinite(end) && <circle cx={x(last)} cy={y(end)} r={3} fill={m.color} />}
                </g>
              );
            })}
          </>
        )}
      </svg>

      {hovered !== null && (
        <div class="chart-tooltip" style={{ left: `${Math.max(0, Math.min(width - 230, (pointerX ?? 0) + 10))}px`, top: '30px' }}>
          <strong>
            Round {rounds[hovered].number}
            {rounds[hovered].injected_drift && ' · drift'}
          </strong>
          {series.map((m, s) => (
            <div key={m.id}>
              <span>
                <ColorDot color={m.color} />
                {m.name}
              </span>
              <b>{fmt(points[s][hovered], 4)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const AxisLabel = ({ x, y, anchor, children }: { x: number; y: number; anchor: string; children: string | number }) => (
  <text x={x} y={y} text-anchor={anchor} fill={COLORS.axis} font-size="11">
    {children}
  </text>
);

/** Up to six evenly spaced indexes for x-axis round labels. */
function xTicks(count: number) {
  const ticks = Math.min(6, count);
  const last = count - 1;
  return Array.from({ length: ticks }, (_, i) => (ticks === 1 ? 0 : Math.round((i * last) / (ticks - 1))));
}

function linePath(values: (number | undefined)[], x: (i: number) => number, y: (v: number) => number, step: boolean) {
  let path = '';
  values.forEach((v, i) => {
    if (v === undefined || !Number.isFinite(v)) return;
    if (!path) path = `M ${x(i)} ${y(v)}`;
    else if (step) path += ` H ${x(i)} V ${y(v)}`;
    else path += ` L ${x(i)} ${y(v)}`;
  });
  return path;
}

/** Tracks an element's rendered size so the chart can match it in pixels. */
function useSize<T extends Element>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}
