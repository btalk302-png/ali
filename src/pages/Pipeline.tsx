import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Check,
  Clapperboard,
  Download,
  Film,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { post } from '../lib/api';
import { useApi, useLive, useToast } from '../lib/context';
import type { ProjectStatus, StageId } from '../../shared/types';
import { Button, Card, Empty, Pill, ProgressBar, StatusPill } from '../components/ui';
import { clock, dateTimeLabel, downloadFile, stageLabels, stageOrder, timeAgo } from '../lib/format';

interface ProjectRow {
  id: string;
  title: string;
  topic: string;
  status: ProjectStatus;
  format: 'long' | 'short';
  durationMin: number;
  niche: string;
  progress: number;
  quality: number | null;
  titles: number;
  videos: number;
  runtimeSec: number | null;
  production: { status: string; durationSec: number } | null;
  updatedAt: string;
  stages: Record<StageId, string>;
}

interface ProjectsResponse {
  items: ProjectRow[];
  counts: Record<string, number>;
}

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'generating', label: 'Generating' },
  { key: 'review', label: 'Needs review' },
  { key: 'ready', label: 'Ready' },
  { key: 'failed', label: 'Failed' },
];

export function Pipeline() {
  const { push } = useToast();
  const { refresh } = useLive();
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading } = useApi<ProjectsResponse>(`/projects?status=${status}`);

  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = data?.counts ?? {};

  const downloadMp4 = async (p: { id: string; title: string }) => {
    setBusy(`dl-${p.id}`);
    try {
      await downloadFile(`/api/projects/${p.id}/download`, `${(p.title || 'video').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.mp4`);
      push('MP4 saved to your downloads', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Download failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const run = async (id: string, fromStage?: StageId) => {
    setBusy(id);
    try {
      await post(`/projects/${id}/run`, fromStage ? { fromStage } : {});
      push('Pipeline started', 'success');
      refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not start the pipeline', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 7 }}>Workspace</div>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-sub">
            Real title research first, then strategy, script, visuals, SEO, quality and the MP4 export. No demo content, no fake analytics.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/research" className="btn">
            <Search size={14} />
            Research a title
          </Link>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => window.dispatchEvent(new Event('cp-new-project'))}>
            New video
          </Button>
        </div>
      </div>

      <div className="row wrap section" style={{ gap: 8 }}>
        {FILTERS.map((f) => {
          const count = f.key === 'all' ? counts.all : counts[f.key];
          return (
            <button
              key={f.key}
              className={`btn ${status === f.key ? 'btn-primary' : 'btn-ghost'}`}
              style={{ height: 30, fontSize: 12 }}
              onClick={() => setStatus(f.key)}
            >
              {f.label}
              {typeof count === 'number' && count > 0 ? <span style={{ opacity: 0.65 }}>{count}</span> : null}
            </button>
          );
        })}
      </div>

      {loading && !data ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : items.length === 0 ? (
        <Card className="flat">
          <Empty
            icon={<Clapperboard size={20} />}
            title="No projects yet"
            text="Start with a keyword. The researcher pulls real YouTube results, ranks the title patterns that are working, and only then does the pipeline write the video."
            action={
              <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
                <Link to="/research" className="btn btn-ghost">
                  <Search size={14} /> Research titles first
                </Link>
                <Button variant="primary" icon={<Plus size={14} />} onClick={() => window.dispatchEvent(new Event('cp-new-project'))}>
                  New video
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="stack section" style={{ gap: 10 }}>
          {items.map((p) => {
            const running = p.status === 'generating';
            return (
              <Card key={p.id} className="card-hover" bodyClass="tight">
                <div className="row wrap" style={{ gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div className="row wrap" style={{ gap: 7, marginBottom: 6 }}>
                      <StatusPill status={p.status} />
                      <Pill tone="neutral">{p.format === 'short' ? 'Short · 9:16' : `${p.durationMin} min · 16:9`}</Pill>
                      {p.quality != null && <Pill tone={p.quality >= 80 ? 'green' : p.quality >= 60 ? 'amber' : 'red'}>QA {p.quality}</Pill>}
                      {p.production && <Pill tone="green"><Film size={10} /> {clock(p.production.durationSec)} MP4</Pill>}
                    </div>
                    <Link to={`/projects/${p.id}`} style={{ color: 'inherit' }}>
                      <div style={{ fontSize: 15, fontWeight: 650, lineHeight: 1.35 }}>{p.title}</div>
                    </Link>
                    <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>
                      {p.niche} · {p.videos ? `${p.videos} real videos researched` : 'research pending'} · updated {timeAgo(p.updatedAt)} · {dateTimeLabel(p.updatedAt)}
                    </div>
                    <div className="row wrap" style={{ gap: 4, marginTop: 10 }}>
                      {stageOrder.map((s) => {
                        const st = p.stages[s];
                        return (
                          <span
                            key={s}
                            className="pill"
                            style={{
                              height: 21,
                              fontSize: 10,
                              padding: '0 7px',
                              gap: 4,
                              color: st === 'done' ? 'var(--green)' : st === 'failed' ? 'var(--red)' : st === 'running' ? 'var(--violet-2)' : 'var(--text-3)',
                              borderColor: st === 'done' ? 'rgba(61,220,151,0.28)' : st === 'failed' ? 'rgba(255,107,129,0.3)' : 'var(--border)',
                              background: st === 'done' ? 'rgba(61,220,151,0.08)' : st === 'failed' ? 'rgba(255,107,129,0.08)' : 'transparent',
                            }}
                          >
                            {st === 'done' ? <Check size={9} /> : st === 'failed' ? <X size={9} /> : null}
                            {stageLabels[s]}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ width: 190, flex: 'none' }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 5 }}>
                      <span className="faint" style={{ fontSize: 10.5 }}>{p.progress}% complete</span>
                      <span className="faint" style={{ fontSize: 10.5 }}>{p.runtimeSec ? clock(p.runtimeSec) : '—'}</span>
                    </div>
                    <ProgressBar value={p.progress} />
                    <div className="row" style={{ gap: 6, marginTop: 12 }}>
                      <Button size="sm" onClick={() => navigate(`/projects/${p.id}`)}>
                        Open <ArrowUpRight size={12} />
                      </Button>
                      {p.status !== 'generating' && (
                        <Button size="sm" variant="ghost" icon={<Play size={12} />} onClick={() => run(p.id)} loading={busy === p.id}>
                          {p.status === 'failed' ? 'Retry' : p.progress === 0 ? 'Run' : 'Resume'}
                        </Button>
                      )}
                      {p.status === 'generating' && <Pill tone="violet"><RefreshCw size={10} className="spin" /> running</Pill>}
                      {p.production && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Download size={12} />}
                          onClick={() => downloadMp4(p)}
                          loading={busy === `dl-${p.id}`}
                          title={`Download the MP4 (${clock(p.production.durationSec ?? 0)})`}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="flat section" title={<span className="row" style={{ gap: 8 }}><Sparkles size={14} /> How this pipeline works</span>}>
        <div className="grid g-3" style={{ gap: 14 }}>
          {[
            { title: '1 · Title research', body: 'YouTube Data API pulls real top-performing videos. Wikipedia and Gemini search grounding add context. Title patterns are measured, not guessed.' },
            { title: '2 · Strategy → Script', body: 'The model works from that evidence: angle, outline, then a spoken script with beat timing and b-roll direction.' },
            { title: '3 · Visuals → MP4', body: 'Scene prompts and thumbnails, then images, narration and a downloadable MP4 in the Production tab of each project.' },
          ].map((step) => (
            <div key={step.title}>
              <div style={{ fontSize: 12.5, fontWeight: 650, marginBottom: 4 }}>{step.title}</div>
              <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.6 }}>{step.body}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
