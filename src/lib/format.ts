import type { ProjectStatus, StageId } from '../../shared/types';

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const NUM = new Intl.NumberFormat('en');

export const n = (v: number | null | undefined) => NUM.format(Math.round(Number(v ?? 0)));
export const compact = (v: number | null | undefined) => COMPACT.format(Number(v ?? 0));

export function dateLabel(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function dateTimeLabel(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso?: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return dateLabel(iso);
}

export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const statusMeta: Record<ProjectStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'pill-neutral' },
  generating: { label: 'Generating', tone: 'pill-violet' },
  review: { label: 'Needs review', tone: 'pill-amber' },
  ready: { label: 'Ready', tone: 'pill-green' },
  failed: { label: 'Failed', tone: 'pill-red' },
};

export const stageLabels: Record<StageId, string> = {
  research: 'Title research',
  strategy: 'Strategy',
  script: 'Script',
  visuals: 'Visuals',
  seo: 'SEO',
  quality: 'Quality',
  export: 'Export',
};

export const stageOrder: StageId[] = ['research', 'strategy', 'script', 'visuals', 'seo', 'quality', 'export'];

export function scoreTone(score: number | null | undefined) {
  const v = score ?? 0;
  if (v >= 85) return 'var(--green)';
  if (v >= 70) return 'var(--cyan)';
  if (v >= 55) return 'var(--amber)';
  return 'var(--red)';
}

export function download(filename: string, text: string, type = 'text/markdown') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
