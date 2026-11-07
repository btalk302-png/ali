import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { clock, dateLabel, percent } from '../lib/format';

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function AreaChart({
  labels,
  values,
  height = 220,
  format = (v) => String(v),
  color = '#7c6bff',
  secondColor = '#3dd9e8',
  id = 'area',
  tooltipLabel,
}: {
  labels: string[];
  values: number[];
  height?: number;
  format?: (v: number) => string;
  color?: string;
  secondColor?: string;
  id?: string;
  tooltipLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const W = 800;
  const H = height;
  const padTop = 14;
  const padBottom = 10;
  const max = Math.max(...values, 1) * 1.12;
  const min = 0;
  const points = useMemo(
    () =>
      values.map((v, i) => ({
        x: (i / Math.max(1, values.length - 1)) * W,
        y: padTop + (1 - (v - min) / (max - min || 1)) * (H - padTop - padBottom),
      })),
    [values, max, H],
  );
  const line = smoothPath(points);
  const area = points.length ? `${line} L ${W} ${H} L 0 ${H} Z` : '';

  return (
    <div
      className="chart-wrap"
      ref={wrap}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        setHover(Math.round(f * (values.length - 1)));
      }}
      onMouseLeave={() => setHover(null)}
    >
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.34" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={secondColor} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={0} y1={padTop + f * (H - padTop - padBottom)} x2={W} y2={padTop + f * (H - padTop - padBottom)} stroke="rgba(255,255,255,0.055)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {area && <path d={area} fill={`url(#${id}-fill)`} />}
        {line && <path d={line} fill="none" stroke={`url(#${id}-stroke)`} strokeWidth={2.4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {hover != null && points[hover] && (
          <>
            <line x1={points[hover].x} y1={padTop - 4} x2={points[hover].x} y2={H} stroke="rgba(255,255,255,0.28)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <circle cx={points[hover].x} cy={points[hover].y} r={5} fill={color} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {hover != null && points[hover] && (
        <div className="chart-tooltip" style={{ left: `${(points[hover].x / W) * 100}%`, top: `${(points[hover].y / H) * 100}%` }}>
          <div className="k">{dateLabel(labels[hover])} · {tooltipLabel ?? 'value'}</div>
          <b>{format(values[hover])}</b>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {[0, Math.floor(labels.length / 2), labels.length - 1].map((i) => (
          <span key={i} className="faint" style={{ fontSize: 10 }}>
            {dateLabel(labels[i])}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ values, width = 80, height = 28, color = '#7c6bff' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * width},${height - (v / max) * (height - 3) - 1.5}`).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function BarList({
  items,
  format = (v) => String(v),
  color,
}: {
  items: { label: string; value: number; color?: string }[];
  format?: (v: number) => string;
  color?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="barlist">
      {items.map((i) => (
        <div className="barlist-row" key={i.label}>
          <div className="top">
            <span>{i.label}</span>
            <b>{format(i.value)}</b>
          </div>
          <div className="track">
            <span style={{ width: `${(i.value / max) * 100}%`, background: i.color ?? color ?? undefined }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RetentionChart({
  values,
  scenes,
  durationSec,
  height = 240,
}: {
  values: number[];
  scenes: { id: string; title: string; durationSec: number }[];
  durationSec: number;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = height;
  const max = 100;
  const points = values.map((v, i) => ({ x: (i / 99) * W, y: 10 + (1 - v / max) * (H - 30) }));
  const line = smoothPath(points);
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;

  const sceneTotal = scenes.reduce((s, x) => s + x.durationSec, 0) || 1;
  let acc = 0;
  const markers = scenes.map((s) => {
    acc += s.durationSec;
    return { title: s.title, x: (acc / sceneTotal) * W, frac: acc / sceneTotal };
  });

  return (
    <div className="chart-wrap" onMouseMove={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      setHover(Math.round(f * 99));
    }} onMouseLeave={() => setHover(null)}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="ret-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 50, 75, 100].map((v) => (
          <line key={v} x1={0} y1={10 + (1 - v / 100) * (H - 30)} x2={W} y2={10 + (1 - v / 100) * (H - 30)} stroke="rgba(255,255,255,0.05)" vectorEffect="non-scaling-stroke" />
        ))}
        {markers.map((m) => (
          <line key={m.title + m.x} x1={m.x} y1={10} x2={m.x} y2={H} stroke="rgba(124,107,255,0.22)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill="url(#ret-fill)" />
        <path d={line} fill="none" stroke="#3dd9e8" strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
        {hover != null && (
          <>
            <line x1={(hover / 99) * W} y1={0} x2={(hover / 99) * W} y2={H} stroke="rgba(255,255,255,0.3)" vectorEffect="non-scaling-stroke" />
            <circle cx={(hover / 99) * W} cy={10 + (1 - values[hover] / 100) * (H - 30)} r={4.5} fill="#3dd9e8" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {hover != null && (
        <div className="chart-tooltip" style={{ left: `${(hover / 99) * 100}%`, top: `${((10 + (1 - values[hover] / 100) * (H - 30)) / H) * 100}%` }}>
          <div className="k">{clock((hover / 99) * durationSec)} into the video</div>
          <b>{values[hover]}% still watching</b>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, gap: 12 }}>
        <span className="faint" style={{ fontSize: 10 }}>0:00</span>
        <span className="faint" style={{ fontSize: 10 }}>middle · {clock(durationSec / 2)}</span>
        <span className="faint" style={{ fontSize: 10 }}>{clock(durationSec)}</span>
      </div>
    </div>
  );
}

export function MiniStat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12, background: 'rgba(255,255,255,0.02)' }}>
      <div className="faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: '-0.02em', marginTop: 4 }} className="mono">{value}</div>
      {hint && <div className="faint" style={{ fontSize: 10.5, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export function RetentionLegend() {
  return (
    <div className="row" style={{ gap: 14, fontSize: 10.5, color: 'var(--text-3)' }}>
      <span className="row" style={{ gap: 5 }}>
        <span style={{ width: 14, height: 2, background: '#3dd9e8', display: 'inline-block' }} /> audience retention
      </span>
      <span className="row" style={{ gap: 5 }}>
        <span style={{ width: 12, height: 1, borderTop: '1px dashed rgba(124,107,255,0.6)', display: 'inline-block' }} /> scene break
      </span>
    </div>
  );
}

export function Confidence({ value }: { value: number }) {
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginBottom: 5 }}>
        <span>Statistical confidence</span>
        <b style={{ color: value >= 95 ? 'var(--green)' : value >= 70 ? 'var(--amber)' : 'var(--text-2)' }}>{percent(value, 0)}</b>
      </div>
      <div className="progress thin">
        <span style={{ width: `${value}%`, background: value >= 95 ? 'var(--green)' : value >= 70 ? 'var(--amber)' : 'var(--text-3)' }} />
      </div>
    </div>
  );
}
