import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  AlertTriangle,
  Layers,
  ListChecks,
  RefreshCw,
  Rocket,
  Save,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wand2,
  X,
  XCircle,
} from 'lucide-react';
import { useApi, useLive, useToast } from '../lib/context';
import { del, get, patch, post } from '../lib/api';
import { clock, copyText, dateTimeLabel, download, percent, scoreTone, stageLabels, stageOrder, statusMeta, timeAgo } from '../lib/format';
import type { Beat, Project, StageId } from '../../shared/types';
import { Button, Card, CopyButton, Empty, Field, KeyValue, Pill, ProgressBar, ScoreRing, StatusPill, Tabs } from '../components/ui';
import { ProductionTab } from './ProductionTab';

type TabId = 'research' | 'strategy' | 'script' | 'storyboard' | 'thumbnails' | 'seo' | 'qa' | 'production' | 'publish';

interface WorkspaceData {
  project: Project;
  job?: { id: string; status: string; progress: number; currentStage?: string; logs: { msg: string; level: string; t: string }[]; stages: { id: string; label: string; status: string }[] };
  comments: { id: string; author: string; text: string; sentiment: string; theme: string; isQuestion: boolean; postedAt: string; avatarHue: number }[];
  estimates: { label: string; value: number }[];
  scheduledAfter: string;
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function Workspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const { refresh } = useLive();
  const { data, loading } = useApi<WorkspaceData>(id ? `/projects/${id}` : null);
  const [tab, setTab] = useState<TabId>('research');
  const [busy, setBusy] = useState<string | null>(null);

  const project = data?.project;
  const job = data?.job;
  const running = job?.status === 'running' || job?.status === 'queued';

  const [titleDraft, setTitleDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'unlisted' | 'private'>('private');
  const [attestFacts, setAttestFacts] = useState(false);
  const [attestRights, setAttestRights] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [showReject, setShowReject] = useState(false);

  useEffect(() => {
    if (!project) return;
    setTitleDraft(project.title);
    setDescDraft(project.seo?.description ?? '');
    const at = project.schedule?.publishAt ?? data?.scheduledAfter;
    if (at) setScheduleAt(toLocalInput(at));
    if (project.schedule?.privacy) setPrivacy(project.schedule.privacy);
  }, [project?.id, project?.updatedAt, data?.scheduledAfter]);

  const stageProgress = useMemo(() => {
    if (!project) return 0;
    return (stageOrder.filter((s) => project.stages[s].status === 'done').length / stageOrder.length) * 100;
  }, [project]);

  if (loading && !data) {
    return <div className="skeleton" style={{ height: 500 }} />;
  }
  if (!project) {
    return <Empty title="Project not found" text="It may have been deleted." action={<Button onClick={() => navigate('/projects')}>Back to pipeline</Button>} />;
  }

  const act = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await fn();
      push(success, 'success');
      refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  };

  const runPipeline = (fromStage?: StageId) =>
    act('run', () => post(`/projects/${project.id}/run`, fromStage ? { fromStage } : {}), fromStage ? `Regenerating from ${stageLabels[fromStage]}…` : 'Pipeline started');

  const regenerate = (stage: StageId) =>
    act(`regen-${stage}`, () => post(`/projects/${project.id}/stage/${stage}/regenerate`), `${stageLabels[stage]} is regenerating…`);

  const approve = () =>
    act('approve', () => post(`/projects/${project.id}/approve`), 'Approved. It is queued for scheduling.');

  const saveTitle = () =>
    act('title', async () => {
      await patch(`/projects/${project.id}`, { title: titleDraft });
      setEditingTitle(false);
    }, 'Title updated');

  const saveDescription = () => act('desc', () => patch(`/projects/${project.id}`, { seo: { description: descDraft } }), 'Description saved');

  const selectTitle = (text: string) =>
    act('select-title', () => patch(`/projects/${project.id}`, { title: text, seo: { selectedTitle: text } }), 'Publishing title updated');

  const selectThumbnail = (tid: string) =>
    act('thumb', () => patch(`/projects/${project.id}`, { selectedThumbnailId: tid }), 'Thumbnail selected');

  const schedule = () =>
    act('schedule', () => post(`/projects/${project.id}/schedule`, { publishAt: new Date(scheduleAt).toISOString(), privacy }), 'Scheduled');

  const publishNow = () =>
    act('publish', () => post(`/projects/${project.id}/publish-now`), 'Published (dry run). Queue processed.');

  const exportPackage = () =>
    act('export', async () => {
      const res = await get<{ filename: string; markdown: string }>(`/projects/${project.id}/export`);
      download(res.filename, res.markdown);
    }, 'Package downloaded');

  const allChecks = project.quality?.checks ?? [];
  const blockers = project.quality?.blockers ?? [];
  const isLocked = ['approved', 'scheduled', 'published'].includes(project.status);

  return (
    <>
      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => navigate('/projects')}>
          Pipeline
        </Button>
        <ChevronRight size={13} style={{ color: 'var(--text-3)' }} />
        <span className="faint" style={{ fontSize: 12 }}>{project.format === 'short' ? 'Short' : `${project.durationMin}-minute long-form`}</span>
        <span className="spacer" />
        <span className="faint" style={{ fontSize: 11 }}>Updated {timeAgo(project.updatedAt)}</span>
      </div>

      <div className="page-head" style={{ alignItems: 'flex-start', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 14, minWidth: 0, flex: 1 }}>
          {data?.project.visuals?.thumbnails.find((t) => t.id === project.visuals?.selectedThumbnailId) && (
            <div className="thumb" style={{ width: 150, flex: 'none', boxShadow: 'var(--shadow)' }}>
              <img src={`/api/projects/${project.id}/thumbnail/${project.visuals?.selectedThumbnailId}.svg`} alt="" />
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <StatusPill status={project.status} />
              <Pill tone="neutral">{project.format === 'short' ? 'Short · 9:16' : `Long-form · ${project.durationMin} min`}</Pill>
              <Pill tone="violet">{project.tone}</Pill>
              <Pill tone="neutral">{project.engine === 'live' ? 'Live provider' : 'Demo engine'}</Pill>
            </div>
            {editingTitle ? (
              <div className="row" style={{ gap: 6, marginTop: 9 }}>
                <input className="input" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} autoFocus style={{ fontSize: 18, fontWeight: 650, maxWidth: 640 }} />
                <Button size="sm" variant="primary" icon={<Save size={13} />} loading={busy === 'title'} onClick={saveTitle}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingTitle(false); setTitleDraft(project.title); }}>Cancel</Button>
              </div>
            ) : (
              <h1
                className="page-title"
                style={{ marginTop: 9, fontSize: 24, lineHeight: 1.25, maxWidth: 780, cursor: isLocked ? 'default' : 'text' }}
                onClick={() => !isLocked && setEditingTitle(true)}
                title={isLocked ? 'Locked after approval' : 'Click to edit the title'}
              >
                {project.title}
              </h1>
            )}
            <p className="page-sub" style={{ marginTop: 6 }}>
              {project.topic} · {project.niche}
            </p>
          </div>
        </div>
        <div className="page-actions" style={{ marginLeft: 0 }}>
          {project.production?.status === 'ready' && (
            <Button icon={<Download size={14} />} onClick={() => window.open(`/api/projects/${project.id}/download`, '_blank')}>
              Download MP4
            </Button>
          )}
          <Button icon={<Download size={14} />} onClick={exportPackage} loading={busy === 'export'}>Export package</Button>
          {!isLocked && (
            <Button icon={running ? <RefreshCw size={14} className="spin" /> : <Wand2 size={14} />} onClick={() => runPipeline()} loading={busy === 'run'} disabled={running}>
              {running ? 'Generating…' : 'Regenerate all'}
            </Button>
          )}
          {project.status === 'review' && (
            <Button variant="primary" icon={<BadgeCheck size={14} />} onClick={approve} loading={busy === 'approve'} disabled={blockers.length > 0 || !attestFacts || !attestRights}>
              Approve
            </Button>
          )}
          {isLocked && project.status !== 'published' && (
            <Button variant="primary" icon={<CalendarIcon />} onClick={() => setTab('publish')}>Publish</Button>
          )}
        </div>
      </div>

      <Card bodyClass="tight" className="flat">
        <div className="row wrap" style={{ gap: 10, justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="stages">
            {stageOrder.map((stage, i) => {
              const st = project.stages[stage];
              return (
                <Fragment key={stage}>
                  <button className={`stage-node ${tab === stageTabMap[stage] ? 'active' : ''}`} onClick={() => setTab(stageTabMap[stage])}>
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
            <span className="faint" style={{ fontSize: 10.5 }}>{Math.round(stageProgress)}%</span>
            <div style={{ width: 90 }}><ProgressBar value={stageProgress} /></div>
          </div>
        </div>
        {running && job && (
          <div className="note" style={{ marginTop: 6 }}>
            <RefreshCw size={13} className="spin" style={{ color: 'var(--violet-2)' }} />
            <div style={{ flex: 1 }}>
              <b style={{ color: 'var(--text)' }}>{job.currentStage ?? 'Starting'}…</b>{' '}
              <span className="faint">{(job.logs ?? []).slice(-1)[0]?.msg ?? 'Warming up the agents'}</span>
            </div>
            <span className="faint" style={{ fontSize: 11 }}>{job.progress}%</span>
          </div>
        )}
      </Card>

      <div className="grid g-main section" style={{ alignItems: 'start' }}>
        <div>
          <Tabs<TabId>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'research', label: 'Research', badge: project.research ? 1 : 0 },
              { id: 'strategy', label: 'Strategy', badge: project.strategy ? 1 : 0 },
              { id: 'script', label: 'Script', badge: project.script ? project.script.beats.length : 0 },
              { id: 'storyboard', label: 'Storyboard', badge: project.visuals?.scenes.length ?? 0 },
              { id: 'thumbnails', label: 'Thumbnails', badge: project.visuals?.thumbnails.length ?? 0 },
              { id: 'seo', label: 'SEO', badge: project.seo?.score },
              { id: 'qa', label: 'Quality gate', badge: project.quality?.score },
              { id: 'production', label: 'Production', badge: project.production?.status === 'ready' ? 'MP4' : undefined },
              { id: 'publish', label: 'Publish' },
            ]}
          />

          {tab === 'research' && (
            <ResearchTab project={project} onRegenerate={() => regenerate('research')} busy={busy === 'regen-research'} disabled={isLocked} />
          )}
          {tab === 'strategy' && (
            <StrategyTab project={project} onRegenerate={() => regenerate('strategy')} busy={busy === 'regen-strategy'} disabled={isLocked} />
          )}
          {tab === 'script' && (
            <ScriptTab project={project} onRegenerate={() => regenerate('script')} busy={busy === 'regen-script'} disabled={isLocked} />
          )}
          {tab === 'storyboard' && (
            <StoryboardTab project={project} onRegenerate={() => regenerate('visuals')} busy={busy === 'regen-visuals'} disabled={isLocked} />
          )}
          {tab === 'thumbnails' && (
            <ThumbnailsTab project={project} onSelect={selectThumbnail} onRegenerate={() => regenerate('visuals')} busy={busy === 'regen-visuals'} disabled={isLocked} />
          )}
          {tab === 'seo' && (
            <SeoTab
              project={project}
              descDraft={descDraft}
              setDescDraft={setDescDraft}
              onSaveDescription={saveDescription}
              savingDesc={busy === 'desc'}
              onSelectTitle={selectTitle}
              onRegenerate={() => regenerate('seo')}
              busy={busy === 'regen-seo'}
              disabled={isLocked}
            />
          )}
          {tab === 'qa' && (
            <QaTab
              project={project}
              attestFacts={attestFacts}
              attestRights={attestRights}
              setAttestFacts={setAttestFacts}
              setAttestRights={setAttestRights}
              onApprove={approve}
              approving={busy === 'approve'}
              onReject={() => setShowReject(true)}
              onRegenerate={() => regenerate('quality')}
            />
          )}
          {tab === 'production' && (
            <ProductionTab project={project} onProjectReload={() => refresh()} />
          )}
          {tab === 'publish' && (
            <PublishTab
              project={project}
              scheduleAt={scheduleAt}
              setScheduleAt={setScheduleAt}
              privacy={privacy}
              setPrivacy={setPrivacy}
              onSchedule={schedule}
              onPublishNow={publishNow}
              busy={busy}
              onExport={exportPackage}
              blocked={blockers.length > 0}
            />
          )}
        </div>

        <aside className="stack">
          <Card title="Production summary" right={<Pill tone={running ? 'violet' : 'neutral'}>{running ? 'live' : project.engine}</Pill>}>
            <div className="row" style={{ gap: 14, marginBottom: 12 }}>
              <ScoreRing value={project.quality?.score} size={78} thickness={6} label="quality" />
              <div style={{ flex: 1 }}>
                <KeyValue label="Runtime" value={project.script ? clock(project.script.estimatedDurationSec) : '—'} />
                <KeyValue label="Words" value={project.script?.wordCount ?? '—'} />
                <KeyValue label="Beats / scenes" value={`${project.script?.beats.length ?? 0} / ${project.visuals?.scenes.length ?? 0}`} />
                <KeyValue label="SEO score" value={project.seo ? `${project.seo.score}/100` : '—'} />
              </div>
            </div>
            <div className="stack" style={{ gap: 7 }}>
              {(data?.estimates ?? []).map((e) => (
                <div key={e.label} className="row" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  <span>{e.label}</span>
                  <span className="spacer" />
                  <b style={{ color: 'var(--text-2)', fontWeight: 600 }}>{e.label.includes('USD') ? `$${e.value}` : e.value}</b>
                </div>
              ))}
            </div>
            {!isLocked && (
              <>
                <div className="split" style={{ margin: '12px 0' }} />
                <div className="stack" style={{ gap: 7 }}>
                  <div className="eyebrow">Regenerate a stage</div>
                  <div className="chips">
                    {(['research', 'strategy', 'script', 'visuals', 'seo'] as StageId[]).map((s) => (
                      <button key={s} className="chip" style={{ height: 27, fontSize: 11 }} disabled={busy === `regen-${s}`} onClick={() => regenerate(s)}>
                        {stageLabels[s]}
                      </button>
                    ))}
                  </div>
                  <div className="faint" style={{ fontSize: 10.5, lineHeight: 1.5 }}>Regenerating a stage re-runs everything after it. Earlier artifacts stay intact until replaced.</div>
                </div>
              </>
            )}
          </Card>

          <Card title="Quality gate" subtitle={project.quality ? `${allChecks.filter((c) => c.status === 'pass').length}/${allChecks.length} checks passing` : 'Not run yet'}>
            {project.quality ? (
              <div className="stack" style={{ gap: 8 }}>
                {blockers.length === 0 ? (
                  <div className="note ok" style={{ fontSize: 11.5 }}>
                    <ShieldCheck size={13} /> No blocking issues. Ready for your review.
                  </div>
                ) : (
                  <div className="note warn" style={{ fontSize: 11.5 }}>
                    <TriangleAlert size={13} /> {blockers.length} blocker{blockers.length > 1 ? 's' : ''}: {blockers.join(', ')}
                  </div>
                )}
                {allChecks.slice(0, 4).map((c) => (
                  <div key={c.id} className="row" style={{ gap: 7, fontSize: 11.5 }}>
                    {c.status === 'pass' ? <Check size={12} style={{ color: 'var(--green)' }} /> : c.status === 'warn' ? <AlertTriangle size={12} style={{ color: 'var(--amber)' }} /> : <XCircle size={12} style={{ color: 'var(--red)' }} />}
                    <span style={{ color: 'var(--text-2)' }}>{c.label}</span>
                  </div>
                ))}
                <Button size="sm" variant="ghost" block onClick={() => setTab('qa')}>Open quality gate</Button>
              </div>
            ) : (
              <div className="faint" style={{ fontSize: 12 }}>Run the pipeline to populate checks.</div>
            )}
          </Card>

          <Card title="Export & handoff">
            <div className="stack" style={{ gap: 8 }}>
              <Button size="sm" block icon={<Download size={13} />} onClick={exportPackage} loading={busy === 'export'}>
                Download production package
              </Button>
              <Button size="sm" block variant="ghost" icon={<Copy size={13} />} onClick={() => { copyText(project.script?.fullText ?? ''); push('Script copied', 'success'); }}>
                Copy full script
              </Button>
              <div className="faint" style={{ fontSize: 10.5, lineHeight: 1.55 }}>
                Markdown includes title, description, tags, chapters, script, shot list and quality report — pasted straight into YouTube Studio.
              </div>
            </div>
          </Card>

          {project.status === 'published' && project.metrics && (
            <Card title="This video's numbers" subtitle={`Published ${timeAgo(project.publishedAt)}`}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Pill tone="green">{project.metrics.views.toLocaleString()} views</Pill>
                <Pill tone="cyan">{project.metrics.ctr}% CTR</Pill>
                <Pill tone="neutral">{project.metrics.avd} AVD</Pill>
              </div>
              <Button size="sm" variant="ghost" block style={{ marginTop: 10 }} onClick={() => navigate('/analytics')} icon={<ArrowUpRight size={13} />}>
                Open in analytics
              </Button>
            </Card>
          )}

          {data?.comments && data.comments.length > 0 && (
            <Card title="Audience replies" subtitle={`${data.comments.length} comments on this video`}>
              <div className="stack" style={{ gap: 10 }}>
                {data.comments.slice(0, 3).map((c) => (
                  <div key={c.id}>
                    <div className="s" style={{ fontSize: 10.5, display: 'flex', gap: 5 }}>
                      <b style={{ color: 'var(--text-2)' }}>{c.author}</b>
                      <span className="faint">· {timeAgo(c.postedAt)}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 2 }}>{c.text.slice(0, 120)}{c.text.length > 120 ? '…' : ''}</div>
                  </div>
                ))}
                <Button size="sm" variant="ghost" block onClick={() => navigate('/audience')}>Reply in audience studio</Button>
              </div>
            </Card>
          )}
        </aside>
      </div>

      {showReject && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowReject(false)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <header className="modal-head"><h3>Request changes</h3></header>
            <div className="modal-body">
              <Field label="What should change?" hint="This note is stored on the project and shown in the activity feed.">
                <textarea className="textarea" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={4} placeholder="e.g. Tighten the second beat and re-record the CTA" />
              </Field>
            </div>
            <footer className="modal-foot">
              <Button variant="ghost" onClick={() => setShowReject(false)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  await act('reject', () => post(`/projects/${project.id}/reject`, { note: rejectNote }), 'Sent back for revision');
                  setShowReject(false);
                  setRejectNote('');
                }}
              >
                Request changes
              </Button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

const stageTabMap: Record<StageId, TabId> = {
  research: 'research',
  strategy: 'strategy',
  script: 'script',
  visuals: 'storyboard',
  seo: 'seo',
  quality: 'qa',
  release: 'publish',
};

function CalendarIcon() {
  return <Rocket size={14} />;
}

function Missing({ label }: { label: string }) {
  return (
    <Card>
      <Empty icon={<Layers size={17} />} title={`No ${label} yet`} text="Run the pipeline or regenerate this stage to fill it in." />
    </Card>
  );
}

/* ------------------------------------------------------------------ research */
function ResearchTab({ project, onRegenerate, busy, disabled }: { project: Project; onRegenerate: () => void; busy: boolean; disabled: boolean }) {
  const r = project.research;
  if (!r) return <Missing label="research" />;
  return (
    <div className="stack">
      <Card
        title="Opportunity brief"
        subtitle={r.generatedBy}
        right={!disabled && <Button size="sm" variant="ghost" icon={<RefreshCw size={12} />} onClick={onRegenerate} loading={busy}>Regenerate</Button>}
      >
        <p className="quote" style={{ margin: 0 }}>{r.summary}</p>
        <div className="grid g-2" style={{ marginTop: 16, gap: 10 }}>
          {r.audienceInsights.map((insight, i) => (
            <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 9, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'rgba(255,255,255,0.02)' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--violet-2)', marginTop: 2 }}>0{i + 1}</span>
              {insight}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Trending angles" subtitle="Ranked by search interest and competition">
        <div className="stack">
          {r.trendingAngles.map((a) => (
            <div key={a.title} style={{ padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="row" style={{ gap: 8, marginBottom: 5 }}>
                <b style={{ fontSize: 12.5, flex: 1 }}>{a.title}</b>
                <Pill tone={a.competition === 'low' ? 'green' : a.competition === 'high' ? 'red' : 'amber'}>{a.competition} competition</Pill>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <div style={{ flex: 1 }}><ProgressBar value={a.searchInterest} /></div>
                <span className="faint" style={{ fontSize: 10 }}>{a.searchInterest}/100 interest</span>
              </div>
              <div className="faint" style={{ fontSize: 11, marginTop: 5 }}>{a.why}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid g-2">
        <Card title="Keyword clusters">
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Keyword</th><th className="num">Volume</th><th>Difficulty</th><th>Intent</th></tr></thead>
              <tbody>
                {r.keywordClusters.map((k) => (
                  <tr key={k.keyword}>
                    <td><strong>{k.keyword}</strong></td>
                    <td className="num">{k.volume.toLocaleString()}</td>
                    <td style={{ minWidth: 70 }}>
                      <div className="row" style={{ gap: 6 }}>
                        <ProgressBar value={k.difficulty} />
                        <span className="faint" style={{ fontSize: 10 }}>{k.difficulty}</span>
                      </div>
                    </td>
                    <td><Pill tone="neutral">{k.intent}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Competitive patterns">
          <div className="list">
            {r.competitors.map((c) => (
              <div key={c.channel} className="list-row" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div className="t">{c.channel}</div>
                  <div className="s">{c.subscribers} subs · {c.avgViews} avg views</div>
                  <div className="faint" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>{c.pattern}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="divider-label">Sources</div>
          <div className="stack" style={{ gap: 7 }}>
            {r.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="row" style={{ fontSize: 11.5, color: 'var(--text-2)', gap: 7 }}>
                <ExternalLink size={11} /> {s.label}
              </a>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ strategy */
function StrategyTab({ project, onRegenerate, busy, disabled }: { project: Project; onRegenerate: () => void; busy: boolean; disabled: boolean }) {
  const s = project.strategy;
  if (!s) return <Missing label="strategy" />;
  return (
    <div className="stack">
      <Card
        title="Big idea"
        right={!disabled && <Button size="sm" variant="ghost" icon={<RefreshCw size={12} />} onClick={onRegenerate} loading={busy}>Regenerate</Button>}
      >
        <p className="quote" style={{ margin: 0 }}>{s.bigIdea}</p>
        <div className="grid g-3" style={{ marginTop: 16 }}>
          <div>
            <div className="eyebrow">Hook angle</div>
            <div style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.5 }}>{s.hookAngle}</div>
          </div>
          <div>
            <div className="eyebrow">Target emotion</div>
            <div style={{ fontSize: 12.5, marginTop: 5 }}>{s.targetEmotion}</div>
          </div>
          <div>
            <div className="eyebrow">Recommended slot</div>
            <div style={{ fontSize: 12.5, marginTop: 5 }}>{s.publishSlot}</div>
          </div>
        </div>
      </Card>

      <div className="grid g-2">
        <Card title="Episode outline" subtitle={`${s.outline.length} beats · ${clock(s.outline.reduce((sum, o) => sum + o.durationSec, 0))}`}>
          <div className="stack" style={{ gap: 0 }}>
            {s.outline.map((o, i) => (
              <div key={o.id} className="list-row">
                <span className="faint mono" style={{ fontSize: 10, width: 16 }}>{String(i + 1).padStart(2, '0')}</span>
                <div className="grow">
                  <div className="t">{o.title}</div>
                  <div className="s">{o.purpose}</div>
                </div>
                <Pill tone="neutral">{clock(o.durationSec)}</Pill>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Editorial guardrails">
          <div className="stack">
            {s.differentiators.map((d) => (
              <div key={d} className="row" style={{ alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>
                <Check size={13} style={{ color: 'var(--green)', marginTop: 2, flex: 'none' }} />
                {d}
              </div>
            ))}
          </div>
          <div className="divider-label">Call to action</div>
          <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{s.cta}</p>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ script */
function ScriptTab({ project, onRegenerate, busy, disabled }: { project: Project; onRegenerate: () => void; busy: boolean; disabled: boolean }) {
  const script = project.script;
  const { push } = useToast();
  const { refresh } = useLive();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  if (!script) return <Missing label="script" />;

  const dirty = Object.keys(drafts).length > 0;

  const saveBeat = async (beat: Beat) => {
    const narration = drafts[beat.id];
    if (narration == null) return;
    setSaving(beat.id);
    try {
      const beats = script.beats.map((b) => (b.id === beat.id ? { ...b, narration } : b));
      await patch(`/projects/${project.id}`, { beats });
      setDrafts((d) => {
        const copy = { ...d };
        delete copy[beat.id];
        return copy;
      });
      push('Beat saved, quality gate re-scored', 'success');
      refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="stack">
      <Card
        title="Script"
        subtitle={`${script.wordCount} words · ${clock(script.estimatedDurationSec)} at ${script.wpm} wpm · ${script.beats.length} beats`}
        right={
          <div className="row" style={{ gap: 6 }}>
            <CopyButton text={script.fullText} label="Copy script" />
            {!disabled && <Button size="sm" variant="ghost" icon={<RefreshCw size={12} />} onClick={onRegenerate} loading={busy}>Regenerate</Button>}
          </div>
        }
      >
        <div className="note" style={{ marginBottom: 14 }}>
          <FileText size={13} style={{ color: 'var(--violet-2)' }} />
          <div>
            Narration is written for the ear: read it at ~{script.wpm} wpm. Edit any beat inline; the quality score and runtime recalculate on save.
          </div>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          {script.beats.map((beat, i) => (
            <div key={beat.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 13, background: 'rgba(255,255,255,0.018)' }}>
              <div className="row" style={{ marginBottom: 8, gap: 8 }}>
                <span className="faint mono" style={{ fontSize: 10.5 }}>{String(i + 1).padStart(2, '0')}</span>
                <b style={{ fontSize: 12.5 }}>{beat.title}</b>
                <Pill tone="neutral">{clock(beat.durationSec)}</Pill>
                <div className="spacer" />
                <span className="faint" style={{ fontSize: 10.5 }}>{beat.narration.trim().split(/\s+/).length} words</span>
              </div>
              <textarea
                className="textarea"
                value={drafts[beat.id] ?? beat.narration}
                onChange={(e) => setDrafts((d) => ({ ...d, [beat.id]: e.target.value }))}
                rows={4}
                style={{ fontSize: 12.5, lineHeight: 1.7, background: 'transparent', borderColor: drafts[beat.id] != null ? 'rgba(124,107,255,0.5)' : 'var(--border)' }}
                readOnly={disabled}
              />
              {drafts[beat.id] != null && (
                <div className="row" style={{ gap: 6, marginTop: 7 }}>
                  <Button size="sm" variant="primary" icon={<Save size={12} />} loading={saving === beat.id} onClick={() => saveBeat(beat)}>Save beat</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDrafts((d) => { const c = { ...d }; delete c[beat.id]; return c; })}>Discard</Button>
                </div>
              )}
              <div className="row" style={{ gap: 7, marginTop: 8, alignItems: 'flex-start' }}>
                <Sparkles size={11} style={{ color: 'var(--text-3)', marginTop: 3 }} />
                <span className="faint" style={{ fontSize: 10.5, lineHeight: 1.5 }}>
                  <b style={{ color: 'var(--text-2)', fontWeight: 600 }}>B-roll ·</b> {beat.bRollPrompt}
                  {beat.emphasis ? <em style={{ display: 'block', marginTop: 3 }}>{beat.emphasis}</em> : null}
                </span>
              </div>
            </div>
          ))}
          <div style={{ border: '1px solid rgba(124,107,255,0.3)', borderRadius: 12, padding: 13, background: 'rgba(124,107,255,0.06)' }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <b style={{ fontSize: 12.5 }}>Outro</b>
              <Pill tone="violet" >CTA</Pill>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-2)' }}>{script.outro}</p>
            <p className="faint" style={{ margin: '8px 0 0', fontSize: 11 }}>{script.cta}</p>
          </div>
        </div>
        {dirty && <div className="faint" style={{ fontSize: 11, marginTop: 10 }}>You have unsaved beat edits.</div>}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ storyboard */
function StoryboardTab({ project, onRegenerate, busy, disabled }: { project: Project; onRegenerate: () => void; busy: boolean; disabled: boolean }) {
  const v = project.visuals;
  if (!v) return <Missing label="visual storyboard" />;
  const total = v.scenes.reduce((s, sc) => s + sc.durationSec, 0);
  let acc = 0;
  const palette = v.palette;
  return (
    <div className="stack">
      <Card
        title="Visual direction"
        subtitle={`${v.scenes.length} scenes · ${clock(total)} total`}
        right={!disabled && <Button size="sm" variant="ghost" icon={<RefreshCw size={12} />} onClick={onRegenerate} loading={busy}>Regenerate</Button>}
      >
        <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
          <Pill tone="violet">{v.style}</Pill>
          {palette.slice(0, 3).map((c) => (
            <span key={c} className="row" style={{ gap: 6, fontSize: 11, color: 'var(--text-3)' }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: c, border: '1px solid rgba(255,255,255,0.2)' }} />
              {c}
            </span>
          ))}
          <span className="spacer" />
          <span className="faint" style={{ fontSize: 11 }}>Every prompt is copy-ready for your generator of choice</span>
        </div>
        <div style={{ display: 'flex', gap: 3, height: 34, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {v.scenes.map((sc, i) => {
            acc += sc.durationSec;
            return (
              <div
                key={sc.id}
                title={`${sc.title} · ${clock(sc.durationSec)}`}
                style={{
                  width: `${(sc.durationSec / total) * 100}%`,
                  background: `linear-gradient(135deg, ${palette[i % 3]}, ${palette[(i + 1) % 3]})`,
                  opacity: 0.85,
                  borderRight: '1px solid rgba(0,0,0,0.35)',
                  position: 'relative',
                }}
              >
                <span style={{ position: 'absolute', left: 5, top: 9, fontSize: 9, color: 'rgba(255,255,255,0.9)', fontWeight: 700 }}>{i + 1}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="scene-grid">
        {v.scenes.map((sc, i) => (
          <div key={sc.id} className="scene">
            <div className="scene-art" style={{ background: `linear-gradient(135deg, ${palette[i % 3]} 0%, ${palette[(i + 1) % 3]} 100%)` }}>
              <span className="num">{String(i + 1).padStart(2, '0')}</span>
              <span className="dur">{clock(sc.durationSec)}</span>
            </div>
            <div className="scene-body">
              <b>{sc.title}</b>
              <div>{sc.prompt}</div>
              <div className="faint" style={{ fontSize: 10, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span>{sc.composition.split(',')[0]}</span>
                <span>{sc.transition}</span>
              </div>
              <CopyButton text={sc.prompt} label="Copy prompt" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ thumbnails */
function ThumbnailsTab({
  project,
  onSelect,
  onRegenerate,
  busy,
  disabled,
}: {
  project: Project;
  onSelect: (id: string) => void;
  onRegenerate: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  const v = project.visuals;
  if (!v) return <Missing label="thumbnails" />;
  const { push } = useToast();
  return (
    <div className="stack">
      <Card
        title="Thumbnail options"
        subtitle="Rendered live as vectors — readable at 120px, the size viewers actually see"
        right={!disabled && <Button size="sm" variant="ghost" icon={<RefreshCw size={12} />} onClick={onRegenerate} loading={busy}>Regenerate</Button>}
      >
        <div className="thumb-grid">
          {v.thumbnails.map((t) => {
            const selected = project.visuals?.selectedThumbnailId === t.id;
            return (
              <div key={t.id} className={`thumb-option ${selected ? 'selected' : ''}`} onClick={() => !disabled && onSelect(t.id)}>
                <div className="thumb" style={{ borderRadius: 0, border: 0 }}>
                  <img src={`/api/projects/${project.id}/thumbnail/${t.id}.svg`} alt={t.headline} />
                </div>
                <div className="foot">
                  <span style={{ textTransform: 'capitalize' }}>{t.variant}</span>
                  <span className="faint" style={{ fontSize: 10.5 }}>{t.composition.split(',')[0]}</span>
                  {selected ? <Check size={14} className="check" /> : <span className="faint" style={{ marginLeft: 'auto', fontSize: 10.5 }}>Select</span>}
                </div>
                <div className="row" style={{ padding: '0 10px 10px', gap: 4 }}>
                  <button
                    className="chip"
                    style={{ height: 25, fontSize: 10.5 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      fetch(`/api/projects/${project.id}/thumbnail/${t.id}.svg`)
                        .then((r) => r.text())
                        .then((svg) => download(`${project.id}-${t.variant}.svg`, svg, 'image/svg+xml'));
                      push('Thumbnail downloaded as SVG', 'success');
                    }}
                  >
                    <Download size={11} /> SVG
                  </button>
                  <button
                    className="chip"
                    style={{ height: 25, fontSize: 10.5 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      copyText(`Thumbnail concept (${t.variant}): headline "${t.headline.replace(/\n/g, ' ')}", subline "${t.subline}", palette ${t.palette.join(', ')}, ${t.composition}`);
                      push('Concept copied', 'success');
                    }}
                  >
                    <Copy size={11} /> Concept
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="note" style={{ marginTop: 14 }}>
          <ShieldCheck size={13} style={{ color: 'var(--violet-2)' }} />
          <div>
            Selected: <b>{v.thumbnails.find((t) => t.id === v.selectedThumbnailId)?.variant ?? 'none'}</b>. Export the SVG at 1280×720, or use the concept copy as a prompt for your image model.
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ seo */
function SeoTab({
  project,
  descDraft,
  setDescDraft,
  onSaveDescription,
  savingDesc,
  onSelectTitle,
  onRegenerate,
  busy,
  disabled,
}: {
  project: Project;
  descDraft: string;
  setDescDraft: (s: string) => void;
  onSaveDescription: () => void;
  savingDesc: boolean;
  onSelectTitle: (t: string) => void;
  onRegenerate: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  const seo = project.seo;
  if (!seo) return <Missing label="SEO package" />;
  const selected = seo.selectedTitle ?? project.title;
  return (
    <div className="stack">
      <Card
        title="Discoverability score"
        right={!disabled && <Button size="sm" variant="ghost" icon={<RefreshCw size={12} />} onClick={onRegenerate} loading={busy}>Regenerate</Button>}
      >
        <div className="row" style={{ gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <ScoreRing value={seo.score} size={104} thickness={8} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="barlist">
              {seo.breakdown.map((b) => (
                <div className="barlist-row" key={b.label}>
                  <div className="top"><span>{b.label}</span><b>{b.score}/{b.max}</b></div>
                  <div className="track"><span style={{ width: `${(b.score / b.max) * 100}%` }} /></div>
                  <div className="faint" style={{ fontSize: 10, marginTop: 3 }}>{b.note}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ minWidth: 170 }}>
            <div className="eyebrow">Predicted CTR</div>
            <div className="metric-big" style={{ fontSize: 28, color: 'var(--cyan)' }}>{percent(seo.ctrPrediction)}</div>
            <div className="faint" style={{ fontSize: 10.5 }}>based on packaging quality</div>
            <div className="eyebrow" style={{ marginTop: 12 }}>Search intent</div>
            <div className="faint" style={{ fontSize: 11, lineHeight: 1.5 }}>{seo.searchIntent}</div>
          </div>
        </div>
      </Card>

      <Card title="Title variants" subtitle="Pick the one that earns the click">
        <div className="stack" style={{ gap: 8 }}>
          {seo.titles.map((t) => {
            const active = t.text === selected;
            return (
              <div
                key={t.text}
                onClick={() => !disabled && onSelectTitle(t.text)}
                className="row"
                style={{
                  gap: 11,
                  padding: '10px 12px',
                  borderRadius: 11,
                  border: `1px solid ${active ? 'rgba(124,107,255,0.55)' : 'var(--border)'}`,
                  background: active ? 'rgba(124,107,255,0.1)' : 'rgba(255,255,255,0.015)',
                  cursor: disabled ? 'default' : 'pointer',
                }}
              >
                <span style={{ width: 16, height: 16, borderRadius: 99, border: `1.5px solid ${active ? 'var(--violet)' : 'var(--border-strong)'}`, display: 'grid', placeItems: 'center', flex: 'none' }}>
                  {active && <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--violet)' }} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: active ? 600 : 500 }}>{t.text}</div>
                  <div className="faint" style={{ fontSize: 10.5, marginTop: 2 }}>{t.reason} · {t.text.length} characters</div>
                </div>
                <div style={{ width: 46 }}>
                  <ProgressBar value={t.score} />
                </div>
                <b style={{ fontSize: 12, color: scoreTone(t.score), width: 26, textAlign: 'right' }}>{t.score}</b>
                <CopyButton text={t.text} label="" />
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid g-2">
        <Card
          title="Description"
          right={<Button size="sm" variant={descDraft !== (project.seo?.description ?? '') ? 'primary' : 'ghost'} icon={<Save size={12} />} onClick={onSaveDescription} loading={savingDesc} disabled={descDraft === (project.seo?.description ?? '') || disabled}>Save</Button>}
        >
          <textarea className="textarea" value={descDraft} onChange={(e) => setDescDraft(e.target.value)} rows={15} style={{ fontSize: 12, lineHeight: 1.65, fontFamily: 'var(--font-sans)' }} readOnly={disabled} />
          <div className="row" style={{ marginTop: 8 }}>
            <span className="faint" style={{ fontSize: 10.5 }}>{descDraft.length} characters · {(descDraft.match(/#\w+/g) ?? []).length} hashtags</span>
            <span className="spacer" />
            <CopyButton text={descDraft} label="Copy" />
          </div>
        </Card>
        <div className="stack">
          <Card title="Tags" subtitle={`${seo.tags.length} tags`}>
            <div className="row wrap" style={{ gap: 6 }}>
              {seo.tags.map((t) => (
                <span key={t} className="pill pill-neutral" style={{ height: 24 }}>{t}</span>
              ))}
            </div>
            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              {seo.hashtags.map((h) => <Pill key={h} tone="violet">{h}</Pill>)}
            </div>
            <Button size="sm" variant="ghost" icon={<Copy size={12} />} style={{ marginTop: 10 }} onClick={() => copyText(seo.tags.join(', '))}>Copy tag list</Button>
          </Card>
          <Card title="Chapters">
            <div className="stack" style={{ gap: 0 }}>
              {seo.chapters.map((c) => (
                <div key={c.time + c.label} className="row" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span className="mono faint" style={{ width: 42 }}>{c.time}</span>
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ qa */
function QaTab({
  project,
  attestFacts,
  attestRights,
  setAttestFacts,
  setAttestRights,
  onApprove,
  approving,
  onReject,
  onRegenerate,
}: {
  project: Project;
  attestFacts: boolean;
  attestRights: boolean;
  setAttestFacts: (v: boolean) => void;
  setAttestRights: (v: boolean) => void;
  onApprove: () => void;
  approving: boolean;
  onReject: () => void;
  onRegenerate: () => void;
}) {
  const q = project.quality;
  const locked = ['approved', 'scheduled', 'published'].includes(project.status);
  return (
    <div className="stack">
      <Card
        title="Quality gate"
        subtitle="Automated checks plus the two human attestations that unlock approval"
        right={<Button size="sm" variant="ghost" icon={<RefreshCw size={12} />} onClick={onRegenerate} disabled={locked}>Re-score</Button>}
      >
        {!q ? (
          <Empty icon={<ListChecks size={17} />} title="No quality report yet" text="Run the pipeline through the quality stage to score this video." />
        ) : (
          <>
            <div className="row" style={{ gap: 18, marginBottom: 16 }}>
              <ScoreRing value={q.score} size={96} thickness={8} label="quality" />
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <Pill tone="green">{q.checks.filter((c) => c.status === 'pass').length} passing</Pill>
                  <Pill tone="amber">{q.checks.filter((c) => c.status === 'warn').length} warnings</Pill>
                  <Pill tone={q.blockers.length ? 'red' : 'neutral'}>{q.blockers.length} blockers</Pill>
                </div>
                <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                  Reviewed {dateTimeLabel(q.reviewedAt)}. Warnings are advisory; blockers must be fixed before approval.
                </div>
              </div>
            </div>
            <div className="stack" style={{ gap: 9 }}>
              {q.checks.map((c) => (
                <div key={c.id} className="row" style={{ alignItems: 'flex-start', gap: 9, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  {c.status === 'pass' ? <Check size={14} style={{ color: 'var(--green)', marginTop: 1 }} /> : c.status === 'warn' ? <AlertTriangle size={14} style={{ color: 'var(--amber)', marginTop: 1 }} /> : <XCircle size={14} style={{ color: 'var(--red)', marginTop: 1 }} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 550 }}>{c.label}</div>
                    <div className="faint" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.5 }}>{c.detail}</div>
                    {c.fix && c.status !== 'pass' && <div style={{ fontSize: 10.5, color: 'var(--amber)', marginTop: 3 }}>Fix: {c.fix}</div>}
                  </div>
                  <Pill tone={c.status === 'pass' ? 'green' : c.status === 'warn' ? 'amber' : 'red'}>{c.status}</Pill>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card title="Human review" subtitle="Nothing publishes without these two confirmations">
        <div className="stack" style={{ gap: 11 }}>
          <Attest checked={attestFacts} onChange={setAttestFacts} title="I reviewed the facts and claims" hint="Every claim in the narration has been checked against a source, or removed." />
          <Attest checked={attestRights} onChange={setAttestRights} title="I hold the rights to the visuals and audio" hint="Thumbnails, b-roll direction, music and any uploaded assets are cleared for use." />
          <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
            <Button
              variant="primary"
              icon={<BadgeCheck size={14} />}
              disabled={locked || !attestFacts || !attestRights || (q?.blockers.length ?? 1) > 0}
              loading={approving}
              onClick={onApprove}
            >
              {locked ? `Already ${statusMeta[project.status].label.toLowerCase()}` : 'Approve for publishing'}
            </Button>
            <Button variant="danger" icon={<XCircle size={14} />} onClick={onReject} disabled={locked}>Request changes</Button>
            <span className="faint" style={{ fontSize: 11, marginLeft: 'auto' }}>
              {q?.blockers.length ? `${q.blockers.length} blocker${q.blockers.length > 1 ? 's' : ''} must be cleared` : 'All automated checks clear'}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Attest({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        textAlign: 'left',
        border: `1px solid ${checked ? 'rgba(61,220,151,0.4)' : 'var(--border)'}`,
        background: checked ? 'rgba(61,220,151,0.07)' : 'rgba(255,255,255,0.015)',
        borderRadius: 11,
        padding: '11px 12px',
        cursor: 'pointer',
      }}
    >
      <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${checked ? 'var(--green)' : 'var(--border-strong)'}`, display: 'grid', placeItems: 'center', flex: 'none', marginTop: 1, background: checked ? 'var(--green)' : 'transparent' }}>
        {checked && <Check size={11} strokeWidth={3} style={{ color: '#06281a' }} />}
      </span>
      <span>
        <span style={{ fontSize: 12.5, fontWeight: 600, display: 'block' }}>{title}</span>
        <span className="faint" style={{ fontSize: 11, lineHeight: 1.5, display: 'block', marginTop: 2 }}>{hint}</span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ publish */
function PublishTab({
  project,
  scheduleAt,
  setScheduleAt,
  privacy,
  setPrivacy,
  onSchedule,
  onPublishNow,
  busy,
  onExport,
  blocked,
}: {
  project: Project;
  scheduleAt: string;
  setScheduleAt: (v: string) => void;
  privacy: 'public' | 'unlisted' | 'private';
  setPrivacy: (v: 'public' | 'unlisted' | 'private') => void;
  onSchedule: () => void;
  onPublishNow: () => void;
  busy: string | null;
  onExport: () => void;
  blocked: boolean;
}) {
  const canPublish = ['approved', 'scheduled'].includes(project.status);
  return (
    <div className="stack">
      <Card title="Release plan" subtitle="Approve first, then choose a slot. The queue uploads at the scheduled time.">
        {!canPublish && (
          <div className="note warn" style={{ marginBottom: 14 }}>
            <TriangleAlert size={13} />
            <div>This project is <b>{statusMeta[project.status].label.toLowerCase()}</b>. Approve it in the quality gate before scheduling or publishing.</div>
          </div>
        )}
        <div className="grid g-2" style={{ gap: 14 }}>
          <Field label="Publish at" hint="Local time · the queue checks every 60 seconds">
            <input type="datetime-local" className="input" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} disabled={!canPublish} />
          </Field>
          <Field label="Privacy">
            <select className="select" value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)} disabled={!canPublish}>
              <option value="private">Private — review in YouTube Studio first</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </Field>
        </div>
        <div className="row wrap" style={{ gap: 8, marginTop: 16 }}>
          <Button variant="primary" icon={<Clock3 size={14} />} onClick={onSchedule} disabled={!canPublish || !scheduleAt} loading={busy === 'schedule'}>
            Schedule upload
          </Button>
          <Button icon={<Rocket size={14} />} onClick={onPublishNow} disabled={!canPublish} loading={busy === 'publish'}>
            Publish now
          </Button>
          <Button variant="ghost" icon={<Download size={14} />} onClick={onExport} loading={busy === 'export'}>
            Export package
          </Button>
        </div>
        <div className="note" style={{ marginTop: 14, fontSize: 11.5 }}>
          <ShieldCheck size={13} style={{ color: 'var(--violet-2)' }} />
          <div>
            Uploads are a <b>dry run</b> in this build: the project is marked published and analytics are simulated, but nothing is sent to YouTube. Wire the YouTube Data API OAuth flow in <code>server/index.ts</code> to make it real.
          </div>
        </div>
      </Card>

      {project.schedule && (
        <Card title="Queue status" right={<Pill tone={project.schedule.status === 'published' ? 'green' : project.schedule.status === 'queued' ? 'cyan' : 'neutral'}>{project.schedule.status}</Pill>}>
          <div className="grid g-2" style={{ gap: 10 }}>
            <KeyValue label="Scheduled for" value={dateTimeLabel(project.schedule.publishAt)} />
            <KeyValue label="Privacy" value={project.schedule.privacy} />
            <KeyValue label="Timezone" value={project.schedule.timezone} />
            <KeyValue label="YouTube ID" value={project.schedule.youtubeId ?? '—'} />
          </div>
        </Card>
      )}

      <Card title="Final pre-flight">
        <div className="stack" style={{ gap: 9 }}>
          {[
            { label: 'Publishing title selected', ok: Boolean(project.seo?.selectedTitle) },
            { label: 'Description and tags complete', ok: Boolean((project.seo?.description.length ?? 0) > 300 && (project.seo?.tags.length ?? 0) >= 8) },
            { label: 'Thumbnail selected', ok: Boolean(project.visuals?.selectedThumbnailId) },
            { label: 'Quality gate clear', ok: !blocked },
            { label: 'Approved by a human', ok: ['approved', 'scheduled', 'published'].includes(project.status) },
          ].map((item) => (
            <div key={item.label} className="row" style={{ gap: 8, fontSize: 12 }}>
              {item.ok ? <Check size={13} style={{ color: 'var(--green)' }} /> : <XCircle size={13} style={{ color: 'var(--red)' }} />}
              <span style={{ color: item.ok ? 'var(--text-2)' : 'var(--text-3)' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
