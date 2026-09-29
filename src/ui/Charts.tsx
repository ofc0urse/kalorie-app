import { useState } from 'preact/hooks';

export interface Point {
  key: string;
  label: string;
  value: number | null;
  /** tekst w dymku */
  tip?: string;
}

const W = 340;
const H = 180;
const PAD = { l: 38, r: 8, t: 12, b: 24 };

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

const nf = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });

function Tooltip({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.max(60, text.length * 6.4 + 16);
  const tx = Math.min(W - w - 2, Math.max(2, x - w / 2));
  const ty = Math.max(2, y - 34);
  return (
    <g pointer-events="none">
      <rect x={tx} y={ty} width={w} height={26} rx={6} fill="var(--text)" opacity="0.92" />
      <text x={tx + w / 2} y={ty + 17} text-anchor="middle" style={{ fill: 'var(--bg)', fontSize: '12px', fontWeight: 600 }}>
        {text}
      </text>
    </g>
  );
}

/** Wykres słupkowy (jedna seria) z linią celu. */
export function BarChart({ points, goal, color = 'var(--accent)', overColor = 'var(--danger)', unit = '', label }: {
  points: Point[];
  goal?: number;
  color?: string;
  overColor?: string;
  unit?: string;
  label: string;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const max = niceMax(Math.max(goal ?? 0, ...points.map((p) => p.value ?? 0)) * 1.05);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const band = iw / points.length;
  const bw = Math.min(24, Math.max(3, band - 2));
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const labelEvery = points.length > 14 ? Math.ceil(points.length / 7) : 1;
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onMouseLeave={() => setSel(null)}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" stroke-width="1" />
          <text x={PAD.l - 6} y={y(t) + 4} text-anchor="end">
            {nf.format(t)}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const cx = PAD.l + band * i + band / 2;
        const v = p.value ?? 0;
        const top = y(v);
        const h = PAD.t + ih - top;
        const r = Math.min(4, bw / 2, h);
        const fill = goal && v > goal * 1.05 ? overColor : color;
        return (
          <g key={p.key}>
            {v > 0 && (
              <path
                d={`M${cx - bw / 2},${PAD.t + ih} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${PAD.t + ih} Z`}
                fill={fill}
                opacity={sel == null || sel === i ? 1 : 0.45}
              />
            )}
            {i % labelEvery === 0 && (
              <text x={cx} y={H - 6} text-anchor="middle">
                {p.label}
              </text>
            )}
            <rect
              x={cx - band / 2}
              y={PAD.t}
              width={band}
              height={ih}
              fill="transparent"
              onMouseEnter={() => setSel(i)}
              onClick={() => setSel(sel === i ? null : i)}
            />
          </g>
        );
      })}
      {goal ? (
        <g pointer-events="none">
          <line x1={PAD.l} x2={W - PAD.r} y1={y(goal)} y2={y(goal)} stroke="var(--text-2)" stroke-width="1.5" />
          <text x={W - PAD.r} y={y(goal) - 4} text-anchor="end" style={{ fill: 'var(--text-2)', fontWeight: 600 }}>
            cel {nf.format(goal)}
          </text>
        </g>
      ) : null}
      {sel != null && points[sel] && (
        <Tooltip
          x={PAD.l + band * sel + band / 2}
          y={y(points[sel].value ?? 0)}
          text={points[sel].tip ?? `${points[sel].label}: ${nf.format(points[sel].value ?? 0)} ${unit}`}
        />
      )}
    </svg>
  );
}

/** Wykres liniowy (jedna seria), np. waga. Luki (null) nie przerywają linii. */
export function LineChart({ points, unit = '', label, color = 'var(--accent)' }: { points: Point[]; unit?: string; label: string; color?: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const span = Math.max(1, max - min);
  min = Math.floor(min - span * 0.2);
  max = Math.ceil(max + span * 0.2);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (points.length === 1 ? iw / 2 : (iw * i) / (points.length - 1));
  const y = (v: number) => PAD.t + ih - ((v - min) / (max - min)) * ih;
  const defined = points.map((p, i) => ({ p, i })).filter((d) => d.p.value != null);
  const d = defined.map((d, k) => `${k === 0 ? 'M' : 'L'}${x(d.i).toFixed(1)},${y(d.p.value!).toFixed(1)}`).join(' ');
  const ticks = [min, (min + max) / 2, max];
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const nearest = (px: number) => {
    let best = defined[0];
    for (const dd of defined) if (Math.abs(x(dd.i) - px) < Math.abs(x(best.i) - px)) best = dd;
    return best.i;
  };
  return (
    <svg
      class="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      onMouseLeave={() => setSel(null)}
      onMouseMove={(e) => {
        const svg = e.currentTarget as SVGSVGElement;
        const r = svg.getBoundingClientRect();
        setSel(nearest(((e.clientX - r.left) / r.width) * W));
      }}
      onClick={(e) => {
        const svg = e.currentTarget as SVGSVGElement;
        const r = svg.getBoundingClientRect();
        setSel(nearest(((e.clientX - r.left) / r.width) * W));
      }}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" stroke-width="1" />
          <text x={PAD.l - 6} y={y(t) + 4} text-anchor="end">
            {nf.format(t)}
          </text>
        </g>
      ))}
      {points.map((p, i) =>
        i % labelEvery === 0 ? (
          <text key={p.key} x={x(i)} y={H - 6} text-anchor="middle">
            {p.label}
          </text>
        ) : null,
      )}
      {sel != null && <line x1={x(sel)} x2={x(sel)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--text-3)" stroke-width="1" />}
      <path d={d} fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      {defined.map(({ p, i }) =>
        defined.length <= 31 || i === sel || i === defined[defined.length - 1].i ? (
          <circle key={p.key} cx={x(i)} cy={y(p.value!)} r={sel === i ? 5 : 4} fill={color} stroke="var(--surface)" stroke-width="2" />
        ) : null,
      )}
      {sel != null && points[sel]?.value != null && (
        <Tooltip x={x(sel)} y={y(points[sel].value!)} text={points[sel].tip ?? `${points[sel].label}: ${nf.format(points[sel].value!)} ${unit}`} />
      )}
    </svg>
  );
}
