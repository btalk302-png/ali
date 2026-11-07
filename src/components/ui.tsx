import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Check, Copy, Loader2, X } from 'lucide-react';
import type { ProjectStatus } from '../../shared/types';
import { copyText, statusMeta } from '../lib/format';
import { useToast } from '../lib/context';

export function Card({
  title,
  subtitle,
  right,
  children,
  className = '',
  bodyClass = '',
  style,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClass?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || right) && (
        <header className="card-head">
          <div style={{ minWidth: 0 }}>
            {title && <h3>{title}</h3>}
            {subtitle && <div className="sub">{subtitle}</div>}
          </div>
          {right && <div className="right">{right}</div>}
        </header>
      )}
      {children && <div className={`card-body ${bodyClass}`}>{children}</div>}
    </section>
  );
}

export function Button({
  children,
  variant = 'default',
  size = 'md',
  icon,
  loading,
  block,
  className = '',
  ...rest
}: {
  children?: ReactNode;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`btn ${variant === 'primary' ? 'btn-primary' : variant === 'ghost' ? 'btn-ghost' : variant === 'danger' ? 'btn-danger' : ''} ${
        size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : ''
      } ${block ? 'btn-block' : ''} ${className}`}
      {...rest}
      disabled={rest.disabled || loading}
    >
      {loading ? <Loader2 size={14} className="spin" /> : icon}
      {children}
    </button>
  );
}

export function StatusPill({ status }: { status: ProjectStatus }) {
  const meta = statusMeta[status] ?? { label: status, tone: 'pill-neutral' };
  return (
    <span className={`pill ${meta.tone}`}>
      <span className="bullet" />
      {meta.label}
    </span>
  );
}

export function Pill({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: string; className?: string }) {
  return <span className={`pill pill-${tone} ${className}`}>{children}</span>;
}

export function ScoreRing({
  value,
  size = 92,
  thickness = 7,
  label = 'score',
  color,
}: {
  value: number | null | undefined;
  size?: number;
  thickness?: number;
  label?: string;
  color?: string;
}) {
  const v = Math.max(0, Math.min(100, Number(value ?? 0)));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const stroke = color ?? (v >= 85 ? 'var(--green)' : v >= 70 ? 'var(--cyan)' : v >= 55 ? 'var(--amber)' : 'var(--red)');
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="ring-label">
        <b>{value == null ? '—' : Math.round(v)}</b>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function ProgressBar({ value, tone = '' }: { value: number; tone?: string }) {
  return (
    <div className={`progress ${tone}`}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="row" style={{ gap: 12 }}>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        style={{
          width: 38,
          height: 22,
          borderRadius: 99,
          border: `1px solid ${checked ? 'rgba(124,107,255,0.6)' : 'var(--border)'}`,
          background: checked ? 'var(--grad)' : 'rgba(255,255,255,0.06)',
          position: 'relative',
          cursor: 'pointer',
          flex: 'none',
          transition: 'all 0.18s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: 99,
            background: '#fff',
            transition: 'left 0.18s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}
        />
      </button>
      {(label || hint) && (
        <div style={{ minWidth: 0 }}>
          {label && <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>}
          {hint && <div className="faint" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.5 }}>{hint}</div>}
        </div>
      )}
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 560,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }}>
        <header className="modal-head">
          <div style={{ flex: 1 }}>
            <h3>{title}</h3>
            {subtitle && <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'transparent' }}>
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function CopyButton({ text, label = 'Copy', size = 'sm' }: { text: string; label?: string; size?: 'sm' | 'md' }) {
  const [done, setDone] = useState(false);
  const { push } = useToast();
  return (
    <Button
      size={size === 'sm' ? 'sm' : 'md'}
      variant="ghost"
      icon={done ? <Check size={13} /> : <Copy size={13} />}
      onClick={async () => {
        await copyText(text);
        setDone(true);
        push('Copied to clipboard', 'success');
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="icon">{icon}</div>}
      <h4>{title}</h4>
      {text && <p>{text}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; badge?: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
          {t.badge != null && <span className="badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function Field({ label, hint, children, right }: { label: ReactNode; hint?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="field">
      <label>
        {label}
        {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
      </label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
