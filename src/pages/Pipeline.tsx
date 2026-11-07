import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clapperboard, Filter, Grid2X2, List, Plus, Search, Sparkles } from 'lucide-react';
import { useApi } from '../lib/context';
import { compact, dateLabel, percent, scoreTone } from '../lib/format';
import type { ProjectStatus } from '../../shared/types';
import { Button, Card, Empty, Pill, ProgressBar, StatusPill } from '../components/ui';

interface ProjectRow {
  id: string;
  title: string;
  topic: string;
  status: ProjectStatus;
  format: 'long' | 'short';
  durationMin: number;
  thumbnail?: string;
  progress: number;
  quality: number | null;
  seo: number | null;
  schedule?: { publishAt: string; privacy: string; status: string };
  metrics: { views: number; ctr: number; avd: string; subs: number } | null;
  updatedAt: string;
  engine: string;
  production?: { status: string; durationSec: number } | null;
}

interface ProjectsResponse {
  items: ProjectRow[];
  counts: Record<string, number>;
}

const COLUMNS: { key: ProjectStatus | 'all'; label: string; tone: string }[] = [
  { key: 'draft', label: 'Draft', tone: 'var(--text-3)' },
  { key: 'generating', label: 'Generating', tone: 'var(--violet)' },
  { key: 'review', label: 'Needs review', tone: 'var(--amber)' },
  { key: 'approved', label: 'Approved', tone: 'var(--cyan)' },
  { key: 'scheduled', label: 'Scheduled', tone: 'var(--green)' },
  { key: 'published', label: 'Published', tone: 'var(--green)' },
];

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All projects' },
  { key: 'generating', label: 'Generating' },
  { key: 'review', label: 'Needs review' },
  { key: 'approved', label: 'Approved' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Draft' },
];

export function Pipeline() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'board' | 'list'>('board');
  const { data, loading } = useApi<ProjectsResponse>('/projects');

  const items = useMemo(() => {
    if (!data) return [];
    return data.items.filter((p) => {
      const statusOk = filter === 'all' || p.status === filter || (filter === 'draft' && p.status === 'failed');
      const q = query.trim().toLowerCase();
      return statusOk && (!q || `${p.title} ${p.topic}`.toLowerCase().includes(q));
    });
  }, [data, filter, query]);

  const counts = data?.counts ?? {};

  if (loading && !data) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 40, width: 280 }} />
        <div className="skeleton" style={{ height: 420 }} />
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 7 }}>Production</div>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-sub">
            Every video project moves through seven stages. Nothing reaches YouTube without passing the quality gate and your approval.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => window.dispatchEvent(new CustomEvent('cp-new-project'))}>
            New project
          </Button>
        </div>
      </div>

      <div className="row wrap" style={{ marginBottom: 16, gap: 10 }}>
        <div className="chips">
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label}
              <span className="n">{f.key === 'all' ? counts.all ?? 0 : f.key === 'draft' ? (counts.draft ?? 0) + (counts.failed ?? 0) : counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="spacer" />
        <div className="row" style={{ gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-3)' }} />
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects…" style={{ height: 32, paddingLeft: 29, width: 210, fontSize: 12 }} />
          </div>
          <div className="segmented">
            <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')} title="Board view"><Grid2X2 size={12} /></button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} title="List view"><List size={12} /></button>
          </div>
        </div>
      </div>

      {items.length === 0 && (
        <Empty
          icon={<Clapperboard size={18} />}
          title="No projects match this filter"
          text="Create a project or clear the filter to see the whole pipeline."
          action={<Button variant="primary" size="sm" icon={<Sparkles size={13} />} onClick={() => window.dispatchEvent(new CustomEvent('cp-new-project'))}>Create a video</Button>}
        />
      )}

      {view === 'board' && items.length > 0 && (
        <div className="board">
          {COLUMNS.map((col) => {
            const list = items.filter((p) => (col.key === 'draft' ? p.status === 'draft' || p.status === 'failed' : p.status === col.key));
            if (filter !== 'all' && filter !== col.key && !(filter === 'draft' && col.key === 'draft')) return null;
            return (
              <div key={col.key} className="board-col">
                <div className="board-col-head">
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: col.tone }} />
                  {col.label}
                  <span className="n">{list.length}</span>
                </div>
                {list.map((p) => (
                  <div key={p.id} className="board-card" onClick={() => navigate(`/projects/${p.id}`)}>
                    {p.thumbnail ? (
                      <div className="thumb" style={{ aspectRatio: '16/9' }}>
                        <img src={`/api/projects/${p.id}/thumbnail/${p.thumbnail}.svg`} alt="" />
                        <span className="duration">{p.format === 'short' ? '0:58' : `${p.durationMin}:00`}</span>
                      </div>
                    ) : (
                      <div className="thumb" style={{ aspectRatio: '16/9', display: 'grid', placeItems: 'center', background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 8px, transparent 8px 16px)' }}>
                        <Clapperboard size={18} style={{ color: 'var(--text-3)' }} />
                      </div>
                    )}
                    <div className="t">{p.title}</div>
                    <div className="meta">
                      <Pill tone={p.format === 'short' ? 'cyan' : 'neutral'}>{p.format === 'short' ? 'Short' : `${p.durationMin} min`}</Pill>
                      {p.quality != null && <span style={{ color: scoreTone(p.quality) }}>QA {p.quality}</span>}
                      {p.seo != null && <span>SEO {p.seo}</span>}
                      <span style={{ marginLeft: 'auto' }}>{p.metrics ? compact(p.metrics.views) : dateLabel(p.updatedAt)}</span>
                    </div>
                    {p.status !== 'published' && (
                      <div className="row" style={{ gap: 7 }}>
                        <ProgressBar value={p.progress} />
                        <span className="faint" style={{ fontSize: 9.5, fontWeight: 600 }}>{p.progress}%</span>
                      </div>
                    )}
                    {p.status === 'published' && p.metrics && (
                      <div className="row" style={{ gap: 10, fontSize: 10.5, color: 'var(--text-3)' }}>
                        <span>{compact(p.metrics.views)} views</span>
                        <span>{percent(p.metrics.ctr)} CTR</span>
                        <span>{p.metrics.avd} AVD</span>
                      </div>
                    )}
                  </div>
                ))}
                {list.length === 0 && <div className="faint" style={{ fontSize: 11, padding: '8px 4px' }}>Empty</div>}
              </div>
            );
          })}
        </div>
      )}

      {view === 'list' && items.length > 0 && (
        <Card bodyClass="tight">
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th className="num">QA</th>
                  <th className="num">SEO</th>
                  <th>Publishes</th>
                  <th className="num">Views</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
                    <td>
                      <div className="row">
                        {p.thumbnail && <img className="thumb thumb-sm" src={`/api/projects/${p.id}/thumbnail/${p.thumbnail}.svg`} alt="" style={{ width: 64 }} />}
                        <div>
                          <strong style={{ fontSize: 12.5 }}>{p.title}</strong>
                          <div className="faint" style={{ fontSize: 10.5, marginTop: 2 }}>
                            {p.format === 'short' ? 'Short' : `${p.durationMin} min`} · {p.engine} engine
                            {p.production && (
                              <>
                                {' · '}
                                <a
                                  href={`/api/projects/${p.id}/download`}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ color: 'var(--green)', fontWeight: 650 }}
                                  title="Download the rendered MP4"
                                >
                                  MP4 ready
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><StatusPill status={p.status} /></td>
                    <td style={{ minWidth: 90 }}>
                      <div className="row" style={{ gap: 7 }}>
                        <ProgressBar value={p.progress} />
                        <span className="faint" style={{ fontSize: 10 }}>{p.progress}%</span>
                      </div>
                    </td>
                    <td className="num" style={{ color: p.quality != null ? scoreTone(p.quality) : undefined }}>{p.quality ?? '—'}</td>
                    <td className="num">{p.seo ?? '—'}</td>
                    <td>{p.schedule ? dateLabel(p.schedule.publishAt) : '—'}</td>
                    <td className="num">{p.metrics ? compact(p.metrics.views) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="row section" style={{ color: 'var(--text-3)', fontSize: 11, gap: 8 }}>
        <Filter size={12} />
        {items.length} of {counts.all ?? 0} projects shown
      </div>
    </>
  );
}
