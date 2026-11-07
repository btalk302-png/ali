import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Loader2,
  Mic,
  Play,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  TrendingUp,
  Wand2,
  X,
  Youtube,
} from 'lucide-react';
import type { Project, StageId } from '../../shared/types';
import { get, patch, post } from '../lib/api';
import { useApi, useLive, useToast } from '../lib/context';
import { copyText, clock, compact, dateLabel, download, downloadFile, scoreTone, stageLabels, stageOrder, timeAgo } from '../lib/format';
import { Button, Card, CopyButton, Empty, KeyValue, Pill, ProgressBar, ScoreRing, StatusPill } from '../components/ui';
import { ProductionTab } from './ProductionTab';

type TabId = 'research' | 'strategy' | 'script' | 'visuals' | 'seo' | 'quality' | 'production';

interface WorkspaceData {
  project: Project;
  job: { id: string; status: string; progress: number; currentStage?: string; error?: string; logs: { msg: string; level: string; t: string }[]; stages: { id: string; label: string; status: string; message?: string }[] } | null;
  summary: { stageProgress: number; quality: number | null; runtime: string | null; runtimeSec: number | null; scenes: number; titles: number; videos: number; production: string };
}

const TAB_FOR_STAGE: Record<StageId, TabId> = {
  research: 'research',
  strategy: 'strategy',
  script: 'script',
  visuals: 'visuals',
  seo: 'seo',
  quality: 'quality',
  export: 'production',
};

export function Workspace() {
  const { id } = useParams();
  const { push } = useToast();
  const { refresh } = useLive();
  const { data, loading } = useApi<WorkspaceData>(id ? `/projects/${id}` : null);
  const [tab, setTab] = useState<TabId>('research');
  const [busy, setBusy] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [descDirty, setDescDirty] = useState(false);

  const project = data?.project;
  const job = data?.job;
  const running = job?.status === 'running' || job?.status === 'queued';
  const blocked = !project?.stages.research || project.stages.research.status !== 'done';

  useEffect(() => {
    if (project) setTitleDraft(project.title);
  }, [project?.title, project?.updatedAt]);

  useEffect(() => {
    if (project?.seo && !descDirty) setDescDraft(project.seo.description);
  }, [project?.seo?.description]);

  useEffect(() => {
    if (project?.production?.status === 'ready') return;
    if (project?.stages.research.status === 'done' && project.stages.strategy.status === 'pending' && !running) setTab('strategy');
  }, [project?.id]);

  const act = async (key: string, fn: () => Promise<unknown>, message?: string) => {
    setBusy(key);
    try {
      await fn();
      if (message) push(message, 'success');
      refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const run = (fromStage?: StageId) => act('run', () => post(`/projects/${project?.id}/run`, fromStage ? { fromStage } : {}), 'Pipeline started');
  const regenerate = (stage: StageId) =>
    act(`regen-${stage}`, () => post(`/projects/${project?.id}/stage/${stage}/regenerate`, {}), `${stageLabels[stage]} regenerating`);
  const saveTitle = () =>
    act('title', async () => {
      await patch(`/projects/${project?.id}`, { title: titleDraft });
      setEditingTitle(false);
    }, 'Title updated');
  const selectTitle = (text: string) =>
    act('select-title', () => patch(`/projects/${project?.id}`, { selectedTitle: text }), 'Title selected');
  const saveDescription = () =>
    act('desc', async () => {
      await patch(`/projects/${project?.id}`, { seo: { description: descDraft } });
      setDescDirty(false);
    }, 'Description saved');
  const selectThumbnail = (tid: string) => act('thumb', () => patch(`/projects/${project?.id}`, { selectedThumbnailId: tid }));
  const downloadVideo = async () => {
    if (!project) return;
    try {
      setBusy('download');
      await downloadFile(`/api/projects/${project.id}/download`, `${(project.title || 'video').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.mp4`);
      push('MP4 saved to your downloads', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Download failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const stuck = project ? stageOrder.map((id) => ({ id, state: project.stages[id] })).find((row) => row.state?.relayKey) : undefined;

  const relayThroughBrowser = async () => {
    if (!project) return;
    setBusy('relay');
    try {
      let current = project;
      let rounds = 0;
      // One click should finish the stage even when it needs several requests
      // (YouTube search → video details → Wikipedia → the model call).
      for (;;) {
        const next = stageOrder.map((id) => ({ id, state: current.stages[id] })).find((row) => row.state?.relayKey);
        if (!next?.state?.relayKey || rounds >= 6) break;
        rounds++;
        const key = next.state.relayKey;
        const spec = await get<{ relay: { providerLabel: string; kind: string; request: { url: string; method: string; headers: Record<string, string>; body: string } } }>(`/relay/${key}`);
        const req = spec.relay.request;
        let res: Response;
        try {
          res = await fetch(req.url, {
            method: req.method,
            headers: req.headers,
            ...(req.method === 'POST' ? { body: req.body } : {}),
          });
        } catch {
          throw new Error(
            `Your browser could not send the request to ${spec.relay.providerLabel} — the provider blocked the cross-origin call (CORS). Gemini and the YouTube Data API allow this; some providers do not.`,
          );
        }
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = payload?.error?.message ?? payload?.error ?? `the provider answered ${res.status}`;
          throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 240));
        }
        await post(`/relay/${key}`, { response: payload, projectId: current.id, stage: next.id });

        // wait until the resumed stage either finishes or asks for the next request
        for (let i = 0; i < 25; i++) {
          await new Promise((r) => setTimeout(r, 600));
          const fresh = await get<{ project: Project; job?: { status?: string } }>(`/projects/${current.id}`);
          current = fresh.project;
          const again = stageOrder.some((id) => current.stages[id].relayKey);
          if (again || fresh.job?.status !== 'running') break;
        }
      }
      push(rounds > 1 ? `Fetched ${rounds} requests in your browser — stage resumed` : 'Fetched in your browser — stage resumed', 'success');
      refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Browser relay failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const exportPackage = () =>
    act('export', async () => {
      const res = await get<{ filename: string; markdown: string }>(`/projects/${project?.id}/export`);
      download(res.filename, res.markdown);
    }, 'Package downloaded');

  const stageProgress = data?.summary.stageProgress ?? 0;
  const tabs = useMemo(
    () =>
      [
        { id: 'research' as TabId, label: stageLabels.research, done: project?.research, badge: project?.research?.titles.length },
        { id: 'strategy' as TabId, label: stageLabels.strategy, done: project?.strategy },
        { id: 'script' as TabId, label: stageLabels.script, done: project?.script, badge: project?.script?.beats.length },
        { id: 'visuals' as TabId, label: stageLabels.visuals, done: project?.visuals, badge: project?.visuals?.scenes.length },
        { id: 'seo' as TabId, label: stageLabels.seo, done: project?.seo, badge: project?.seo?.score },
        { id: 'quality' as TabId, label: stageLabels.quality, done: project?.quality, badge: project?.quality?.score },
        { id: 'production' as TabId, label: 'Production', done: project?.production?.status === 'ready' },
      ].filter(Boolean),
    [project],
  );

  if (loading && !data) return <div className="skeleton" style={{ height: 420 }} />;
  if (!project) {
    return (
      <Card>
        <Empty title="Project not found" text="It may have been deleted." action={<Link to="/projects" className="btn">Back to pipeline</Link>} />
      </Card>
    );
  }

  return (
    <>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <Link to="/projects" className="row faint" style={{ gap: 5, fontSize: 11.5, marginBottom: 8 }}>
            <ArrowLeft size={12} /> Pipeline
          </Link>
          <div style={{ maxWidth: 820 }}>
            <div className="row wrap" style={{ gap: 7, marginBottom: 7 }}>
              <StatusPill status={project.status} />
              <Pill tone="neutral">{project.format === 'short' ? 'Short · 9:16' : `Long-form · ${project.durationMin} min`}</Pill>
              <Pill tone="violet">{project.style}</Pill>
              {project.production?.status === 'ready' && <Pill tone="green"><Film size={10} /> MP4 ready</Pill>}
              {project.quality && <Pill tone="neutral">QA {project.quality.score}</Pill>}
            </div>
            {editingTitle ? (
              <div className="row" style={{ gap: 6 }}>
                <input
                  className="input"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  autoFocus
                  style={{ fontSize: 18, fontWeight: 650 }}
                />
                <Button size="sm" variant="primary" icon={<Save size={13} />} onClick={saveTitle} loading={busy === 'title'}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingTitle(false); setTitleDraft(project.title); }}>
                  Cancel
                </Button>
              </div>
            ) : (
              <h1
                className="page-title"
                style={{ fontSize: 23, lineHeight: 1.3, cursor: 'text' }}
                onClick={() => setEditingTitle(true)}
                title="Click to edit the working title"
              >
                {project.title}
              </h1>
            )}
            <p className="page-sub" style={{ marginTop: 6 }}>
              Research keyword: <b>{project.topic}</b> · {project.niche} · updated {timeAgo(project.updatedAt)}
            </p>
          </div>
        </div>

        <div className="page-actions">
          {project.production?.status === 'ready' && (
            <Button icon={<Download size={14} />} onClick={downloadVideo} loading={busy === 'download'}>
              Download MP4
            </Button>
          )}
          <Button icon={<Download size={14} />} onClick={exportPackage} loading={busy === 'export'}>
            Export package
          </Button>
          <Button
            variant="primary"
            icon={running ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />}
            onClick={() => run()}
            loading={busy === 'run'}
            disabled={running}
          >
            {running ? 'Running…' : project.status === 'failed' ? 'Retry pipeline' : stageProgress === 100 ? 'Run again' : 'Run pipeline'}
          </Button>
        </div>
      </div>

      {stuck && (
        <Card className="flat">
          <div className="row wrap" style={{ gap: 10 }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 12.5, fontWeight: 650 }}>
                {stageLabels[stuck.id]} needs a trip through your browser
              </div>
              <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>
                This server has no outbound internet, so it cannot call the model provider. Your browser can — it will send this one request with
                your stored key and hand the answer back, then the stage resumes.
              </div>
            </div>
            <Button variant="primary" icon={<Wand2 size={14} />} onClick={relayThroughBrowser} loading={busy === 'relay'}>
              Fetch with my browser
            </Button>
          </div>
        </Card>
      )}

      {blocked && (
        <Card className="flat">
          <div className="row wrap" style={{ gap: 10 }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 12.5, fontWeight: 650 }}>Start with real research</div>
              <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>
                The pipeline needs title research (YouTube Data API + a text model) before it can write strategy and script.
              </div>
            </div>
            <Button icon={<Search size={14} />} onClick={() => run('research')} loading={busy === 'run'} disabled={running}>
              Run title research
            </Button>
            <Link to={`/research`} className="btn btn-ghost">
              Research another keyword <ArrowUpRight size={13} />
            </Link>
          </div>
        </Card>
      )}

      <Card className="flat" bodyClass="tight">
        <div className="row wrap" style={{ gap: 10, justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="stages">
            {stageOrder.map((stage, i) => {
              const st = project.stages[stage];
              return (
                <Fragment key={stage}>
                  <button className={`stage-node ${tab === TAB_FOR_STAGE[stage] ? 'active' : ''}`} onClick={() => setTab(TAB_FOR_STAGE[stage])}>
                    <span className={`stage-dot ${st.status}`}>
                      {st.status === 'done' ? <Check size={9} strokeWidth={3} /> : st.status === 'failed' ? <X size={9} strokeWidth={3} /> : st.status === 'running' ? '•' : i + 1}
                    </span>
                    {stageLabels[stage]}
                  </button>
                  {i < stageOrder.length - 1 && <span className="stage-sep"><ChevronRight size={11} /></span>}
                </Fragment>
              );
            })}
          </div>
          <div className="row" style={{ gap: 8, minWidth: 140 }}>
            <span className="faint" style={{ fontSize: 10.5 }}>{stageProgress}%</span>
            <div style={{ width: 90 }}><ProgressBar value={stageProgress} /></div>
          </div>
        </div>

        {running && job && (
          <div className="row wrap" style={{ gap: 10, marginTop: 6 }}>
            <Loader2 size={13} className="spin" style={{ color: 'var(--violet-2)' }} />
            <div style={{ flex: 1 }}>
              <b style={{ color: 'var(--text)', fontSize: 12 }}>{job.currentStage ?? 'Starting'}…</b>{' '}
              <span className="faint" style={{ fontSize: 11.5 }}>{job.logs?.slice(-1)[0]?.msg ?? 'Working'}</span>
            </div>
            <span className="faint" style={{ fontSize: 11 }}>{job.progress}%</span>
          </div>
        )}
        {job?.status === 'failed' && job.error && (
          <div className="notice" style={{ marginTop: 8 }}>
            <X size={14} />
            <div>{job.error}</div>
          </div>
        )}
      </Card>

      <div className="tabs" style={{ marginTop: 14 }}>
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.badge ? <span className="badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <div className="section">
        {tab === 'research' && (
          <ResearchTab project={project} onSelectTitle={selectTitle} onRegenerate={() => regenerate('research')} busy={busy === 'regen-research'} />
        )}
        {tab === 'strategy' && (
          <StrategyTab project={project} onRegenerate={() => regenerate('strategy')} busy={busy === 'regen-strategy'} onRun={() => run('strategy')} />
        )}
        {tab === 'script' && (
          <ScriptTab project={project} onRegenerate={() => regenerate('script')} busy={busy === 'regen-script'} onRun={() => run('script')} />
        )}
        {tab === 'visuals' && (
          <VisualsTab project={project} onRegenerate={() => regenerate('visuals')} busy={busy === 'regen-visuals'} onRun={() => run('visuals')} onSelectThumbnail={selectThumbnail} />
        )}
        {tab === 'seo' && (
          <SeoTab
            project={project}
            descDraft={descDraft}
            setDescDraft={(v) => { setDescDraft(v); setDescDirty(true); }}
            onSave={saveDescription}
            saving={busy === 'desc'}
            onSelectTitle={selectTitle}
            onRegenerate={() => regenerate('seo')}
            busy={busy === 'regen-seo'}
            onRun={() => run('seo')}
          />
        )}
        {tab === 'quality' && <QualityTab project={project} onRun={() => run('quality')} running={running} />}
        {tab === 'production' && <ProductionTab project={project} onProjectReload={() => refresh()} />}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ research */

function SectionEmpty({ title, text, action }: { title: string; text: string; action: React.ReactNode }) {
  return <Empty icon={<Sparkles size={18} />} title={title} text={text} action={action} />;
}

function ResearchTab({
  project,
  onSelectTitle,
  onRegenerate,
  busy,
}: {
  project: Project;
  onSelectTitle: (text: string) => void;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const r = project.research;
  if (!r) {
    return (
      <Card>
        <SectionEmpty
          title="No research yet"
          text="Real research needs a YouTube Data API key and a text model. Add them in Settings, then run this stage."
          action={<Button variant="primary" icon={<Search size={14} />} onClick={onRegenerate} loading={busy}>Run title research</Button>}
        />
      </Card>
    );
  }
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card
        title="Opportunity read"
        subtitle={`${r.videos.length} real videos · ${r.sources.length} sources · ${r.providers.join(' + ')}`}
        right={<Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={onRegenerate} loading={busy}>Re-research</Button>}
      >
        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)' }}>{r.summary}</p>
        <div className="stack" style={{ gap: 6, marginTop: 12 }}>
          {r.insights.map((insight, i) => (
            <div key={i} className="row" style={{ gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
              <TrendingUp size={12} style={{ color: 'var(--green)', flex: 'none' }} />
              {insight}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Titles from the evidence" subtitle="The selected title flows into strategy, script and SEO." bodyClass="tight">
        <div className="stack" style={{ gap: 6 }}>
          {r.titles.map((t) => {
            const active = (r.selectedTitle ?? project.title) === t.text;
            return (
              <div key={t.text} className="row" style={{ gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                <span className="faint mono" style={{ fontSize: 11, width: 26 }}>{t.score}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: active ? 650 : 500 }}>{t.text}</div>
                  <div className="faint" style={{ fontSize: 10.5 }}>{t.angle} · {t.why}</div>
                </div>
                {active ? <Pill tone="green"><Check size={10} /> in use</Pill> : <Button size="sm" variant="ghost" onClick={() => onSelectTitle(t.text)}>Use</Button>}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <Card title="What is ranking" subtitle="Live YouTube data, sorted by views" bodyClass="tight">
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Video</th><th>Channel</th><th className="num">Views</th><th>Published</th></tr>
              </thead>
              <tbody>
                {r.videos.slice(0, 12).map((v) => (
                  <tr key={v.videoId}>
                    <td><a href={v.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{v.title}</a></td>
                    <td className="faint" style={{ fontSize: 11 }}>{v.channel}</td>
                    <td className="num">{compact(v.views)}</td>
                    <td className="faint" style={{ fontSize: 11 }}>{dateLabel(v.publishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Sources" bodyClass="tight">
          <div className="stack" style={{ gap: 6 }}>
            {r.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="row" style={{ gap: 7, fontSize: 11.5, color: 'var(--text-2)' }}>
                {s.kind === 'wikipedia' ? <BookOpen size={12} /> : s.kind === 'youtube' ? <Youtube size={12} /> : <ExternalLink size={12} />}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              </a>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ strategy */

function StrategyTab({ project, onRegenerate, busy, onRun }: { project: Project; onRegenerate: () => void; busy: boolean; onRun: () => void }) {
  const s = project.strategy;
  if (!s) {
    return (
      <Card>
        <SectionEmpty
          title="No strategy yet"
          text="Strategy turns the research into an angle, outline and CTA."
          action={<Button variant="primary" icon={<Play size={14} />} onClick={onRun} disabled={!project.research}>Run strategy</Button>}
        />
      </Card>
    );
  }
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card title="The angle" right={<Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={onRegenerate} loading={busy}>Regenerate</Button>}>
        <div className="stack" style={{ gap: 12 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Big idea</div>
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>{s.bigIdea}</p>
          </div>
          <div className="grid g-2" style={{ gap: 14 }}>
            <div><div className="eyebrow" style={{ marginBottom: 4 }}>Hook</div><div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>{s.hookAngle}</div></div>
            <div><div className="eyebrow" style={{ marginBottom: 4 }}>Target emotion</div><div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{s.targetEmotion}</div></div>
          </div>
          {(s.differentiators ?? []).length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Why this one wins</div>
              <div className="stack" style={{ gap: 5 }}>
                {(s.differentiators ?? []).map((d) => (
                  <div key={d} className="row" style={{ gap: 7, fontSize: 12, color: 'var(--text-2)' }}><Check size={12} style={{ color: 'var(--green)' }} />{d}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="Outline" subtitle={`${(s.outline ?? []).reduce((sum, o) => sum + (Number.isFinite(o.durationSec) ? o.durationSec : 0), 0)} seconds planned`} bodyClass="tight">
        <table className="table">
          <thead><tr><th>#</th><th>Section</th><th>Purpose</th><th className="num">Time</th></tr></thead>
          <tbody>
            {(s.outline ?? []).map((o, i) => (
              <tr key={o.id}>
                <td className="faint">{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{o.title}</td>
                <td className="faint" style={{ fontSize: 11.5 }}>{o.purpose}</td>
                <td className="num">{clock(o.durationSec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.cta && <div className="row" style={{ gap: 6, marginTop: 12, fontSize: 12 }}><Sparkles size={12} style={{ color: 'var(--violet-2)' }} /><b>CTA:</b> <span className="faint">{s.cta}</span></div>}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ script */

function ScriptTab({ project, onRegenerate, busy, onRun }: { project: Project; onRegenerate: () => void; busy: boolean; onRun: () => void }) {
  const s = project.script;
  if (!s) {
    return (
      <Card>
        <SectionEmpty
          title="No script yet"
          text="The script writes the spoken words, beat by beat, with b-roll prompts."
          action={<Button variant="primary" icon={<Play size={14} />} onClick={onRun} disabled={!project.strategy}>Run script</Button>}
        />
      </Card>
    );
  }
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card
        title="Script"
        subtitle={`${s.wordCount} words · ${clock(s.estimatedDurationSec)} at ${s.wpm} wpm · ${s.generatedBy}`}
        right={
          <div className="row" style={{ gap: 6 }}>
            <CopyButton text={s.fullText} label="Copy script" />
            <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={onRegenerate} loading={busy}>Regenerate</Button>
          </div>
        }
      >
        <div className="stack" style={{ gap: 14 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Hook</div>
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>{s.hook}</p>
          </div>
          {s.intro && <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.65 }}>{s.intro}</div>}
          {s.beats.map((b, i) => (
            <div key={b.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                <span className="faint mono" style={{ fontSize: 10.5 }}>{String(i + 1).padStart(2, '0')}</span>
                <b style={{ fontSize: 12.5 }}>{b.title}</b>
                <Pill tone="neutral">{clock(b.durationSec)}</Pill>
              </div>
              <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-2)' }}>{b.narration}</p>
              <div className="faint row" style={{ gap: 6, fontSize: 10.5, marginTop: 6 }}>
                <ImageIcon size={11} /> {b.bRollPrompt}
              </div>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Outro</div>
            <p style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-2)' }}>{s.outro}</p>
            {s.cta && <div className="row" style={{ gap: 6, marginTop: 8, fontSize: 12 }}><Sparkles size={12} style={{ color: 'var(--violet-2)' }} />{s.cta}</div>}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ visuals */

function VisualsTab({
  project,
  onRegenerate,
  busy,
  onRun,
  onSelectThumbnail,
}: {
  project: Project;
  onRegenerate: () => void;
  busy: boolean;
  onRun: () => void;
  onSelectThumbnail: (id: string) => void;
}) {
  const v = project.visuals;
  const [tab, setTab] = useState<'scenes' | 'thumbs'>('scenes');
  if (!v) {
    return (
      <Card>
        <SectionEmpty
          title="No visual plan yet"
          text="Visuals turns every beat into an image prompt and designs four thumbnail concepts."
          action={<Button variant="primary" icon={<Play size={14} />} onClick={onRun} disabled={!project.script}>Run visuals</Button>}
        />
      </Card>
    );
  }
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card
        title="Visual plan"
        subtitle={`${v.scenes.length} scenes · ${v.style}`}
        right={
          <div className="row" style={{ gap: 6 }}>
            <Button size="sm" variant={tab === 'scenes' ? 'primary' : 'ghost'} onClick={() => setTab('scenes')}>Scenes</Button>
            <Button size="sm" variant={tab === 'thumbs' ? 'primary' : 'ghost'} onClick={() => setTab('thumbs')}>Thumbnails</Button>
            <Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={onRegenerate} loading={busy}>Regenerate</Button>
          </div>
        }
      >
        {tab === 'scenes' ? (
          <div className="stack" style={{ gap: 10 }}>
            {v.scenes.map((scene, i) => (
              <div key={scene.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                <div className="row" style={{ gap: 8, marginBottom: 5 }}>
                  <span className="faint mono" style={{ fontSize: 10.5 }}>{String(i + 1).padStart(2, '0')}</span>
                  <b style={{ fontSize: 12.5 }}>{scene.title}</b>
                  <Pill tone="neutral">{clock(scene.durationSec)}</Pill>
                  {scene.image?.status === 'ready' && <Pill tone="green"><ImageIcon size={10} /> still</Pill>}
                  {scene.audio?.status === 'ready' && <Pill tone="green"><Mic size={10} /> voice</Pill>}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{scene.prompt}</p>
                <div className="faint" style={{ fontSize: 10.5, marginTop: 4 }}>{scene.composition} · {scene.transition}</div>
              </div>
            ))}
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <Link to={`/projects/${project.id}`} className="btn btn-ghost" onClick={() => undefined}>
                <Film size={13} /> Generate images &amp; MP4 in Production
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid g-2" style={{ gap: 14 }}>
            {v.thumbnails.map((t) => (
              <div key={t.id}>
                <div className="thumb" style={{ boxShadow: (v.selectedThumbnailId ?? v.thumbnails[0]?.id) === t.id ? '0 0 0 2px var(--violet)' : undefined }}>
                  <img src={`/api/projects/${project.id}/thumbnail/${t.id}.svg`} alt={t.headline} />
                </div>
                <div className="row" style={{ gap: 6, marginTop: 7 }}>
                  <Pill tone="neutral">{t.variant}</Pill>
                  <span className="faint" style={{ fontSize: 10.5, flex: 1 }}>{t.subline}</span>
                  <Button size="sm" variant={(v.selectedThumbnailId ?? v.thumbnails[0]?.id) === t.id ? 'primary' : 'ghost'} onClick={() => onSelectThumbnail(t.id)}>
                    {(v.selectedThumbnailId ?? v.thumbnails[0]?.id) === t.id ? 'Selected' : 'Use'}
                  </Button>
                  <a className="btn btn-sm btn-ghost" href={`/api/projects/${project.id}/thumbnail/${t.id}.svg`} download={`${t.variant}-thumbnail.svg`}>
                    <Download size={12} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ seo */

function SeoTab({
  project,
  descDraft,
  setDescDraft,
  onSave,
  saving,
  onSelectTitle,
  onRegenerate,
  busy,
  onRun,
}: {
  project: Project;
  descDraft: string;
  setDescDraft: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  onSelectTitle: (text: string) => void;
  onRegenerate: () => void;
  busy: boolean;
  onRun: () => void;
}) {
  const seo = project.seo;
  if (!seo) {
    return (
      <Card>
        <SectionEmpty
          title="No SEO package yet"
          text="Generates title variants, a description with chapters, tags and hashtags from the script."
          action={<Button variant="primary" icon={<Play size={14} />} onClick={onRun} disabled={!project.script}>Run SEO</Button>}
        />
      </Card>
    );
  }
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card
        title="Search package"
        subtitle={`${seo.score}/100 · intent: ${seo.searchIntent || '—'}`}
        right={<Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={onRegenerate} loading={busy}>Regenerate</Button>}
      >
        <div className="grid g-2" style={{ alignItems: 'start', gap: 16 }}>
          <div className="stack" style={{ gap: 8 }}>
            <div className="eyebrow">Title variants</div>
            {seo.titles.map((t) => {
              const active = seo.selectedTitle === t.text;
              return (
                <div key={t.text} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <span className="faint mono" style={{ fontSize: 11, width: 22 }}>{t.score}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: active ? 650 : 500 }}>{t.text}</div>
                    <div className="faint" style={{ fontSize: 10.5 }}>{t.reason}</div>
                  </div>
                  {active ? <Pill tone="green">live</Pill> : <Button size="sm" variant="ghost" onClick={() => onSelectTitle(t.text)}>Use</Button>}
                </div>
              );
            })}
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <div className="eyebrow">Score breakdown</div>
            {seo.breakdown.map((b) => (
              <div key={b.label}>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 11.5 }}>
                  <span>{b.label}</span>
                  <span className="faint">{b.score}/{b.max}</span>
                </div>
                <ProgressBar value={(b.score / b.max) * 100} />
                <div className="faint" style={{ fontSize: 10 }}>{b.note}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label>Description <span className="faint" style={{ marginLeft: 'auto', fontSize: 10 }}>{descDraft.split(/\s+/).filter(Boolean).length} words</span></label>
          <textarea className="textarea" rows={8} value={descDraft} onChange={(e) => setDescDraft(e.target.value)} />
        </div>
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <Button size="sm" variant="primary" icon={<Save size={13} />} onClick={onSave} loading={saving}>Save description</Button>
          <CopyButton text={descDraft} label="Copy description" />
        </div>

        <div className="grid g-2" style={{ gap: 16, marginTop: 16 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Tags</div>
            <div className="row wrap" style={{ gap: 5 }}>
              {seo.tags.map((t) => <span key={t} className="pill pill-neutral">{t}</span>)}
            </div>
            <div className="eyebrow" style={{ margin: '12px 0 6px' }}>Hashtags</div>
            <div className="row wrap" style={{ gap: 5 }}>
              {seo.hashtags.map((h) => <span key={h} className="pill pill-violet">#{h}</span>)}
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Chapters</div>
            <div className="stack" style={{ gap: 4 }}>
              {seo.chapters.map((c) => (
                <div key={c.time} className="row" style={{ gap: 8, fontSize: 11.5 }}>
                  <span className="faint mono">{c.time}</span>
                  <span style={{ color: 'var(--text-2)' }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ quality */

function QualityTab({ project, onRun, running }: { project: Project; onRun: () => void; running: boolean }) {
  const q = project.quality;
  if (!q) {
    return (
      <Card>
        <SectionEmpty title="No quality report yet" text="Checks run against the actual artifacts: evidence, runtime, hook, beats, thumbnails, SEO and the rendered file." action={<Button variant="primary" onClick={onRun}>Run checks</Button>} />
      </Card>
    );
  }
  return (
    <div className="stack" style={{ gap: 14 }}>
      <Card title="Quality report" subtitle={`Reviewed ${timeAgo(q.reviewedAt)}`} right={<Button size="sm" variant="ghost" icon={<RefreshCw size={13} />} onClick={onRun} loading={running}>Re-run</Button>}>
        <div className="row" style={{ gap: 18 }}>
          <ScoreRing value={q.score} size={92} thickness={7} label="quality" />
          <div style={{ flex: 1 }}>
            <KeyValue label="Checks passed" value={`${q.checks.filter((c) => c.status === 'pass').length}/${q.checks.length}`} />
            <KeyValue label="Warnings" value={q.checks.filter((c) => c.status === 'warn').length} />
            <KeyValue label="Blockers" value={q.blockers.length} />
            <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>
              Blockers are things the pipeline refuses to call ready — fix them and re-run.
            </div>
          </div>
        </div>
        <div className="stack" style={{ gap: 8, marginTop: 14 }}>
          {q.checks.map((c) => (
            <div key={c.id} className="row" style={{ gap: 9, alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ color: c.status === 'pass' ? 'var(--green)' : c.status === 'warn' ? 'var(--amber)' : 'var(--red)', marginTop: 1 }}>
                {c.status === 'pass' ? <Check size={13} /> : c.status === 'warn' ? <ListChecks size={13} /> : <X size={13} />}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.label}</div>
                <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.55 }}>{c.detail}</div>
              </div>
              {c.status !== 'pass' && <span className="pill pill-neutral" style={{ height: 21, fontSize: 10 }}>{c.status}</span>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
