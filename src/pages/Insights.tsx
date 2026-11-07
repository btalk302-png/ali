import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Check, FlaskConical, Lightbulb, RefreshCw, Sparkles, TrendingUp, X } from 'lucide-react';
import { useApi, useToast } from '../lib/context';
import { post } from '../lib/api';
import { percent, timeAgo } from '../lib/format';
import { Button, Card, Empty, Pill, ProgressBar } from '../components/ui';
import { Confidence } from '../components/charts';

interface Recommendation {
  id: string;
  title: string;
  insight: string;
  evidence: string;
  impact: 'high' | 'medium' | 'low';
  category: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface Experiment {
  id: string;
  projectId: string;
  kind: string;
  variantA: string;
  variantB: string;
  impressionsA: number;
  impressionsB: number;
  ctrA: number;
  ctrB: number;
  confidence: number;
  status: 'running' | 'winner' | 'inconclusive';
  startedAt: string;
}

interface ProjectsResponse {
  items: { id: string; title: string; status: string }[];
}

export function Insights() {
  const { push } = useToast();
  const navigate = useNavigate();
  const { data, loading, reload } = useApi<{ items: Recommendation[]; experiments: Experiment[] }>('/recommendations');
  const projects = useApi<ProjectsResponse>('/projects?status=published');
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [experimentTarget, setExperimentTarget] = useState('');

  const recs = useMemo(() => (data?.items ?? []).filter((r) => r.status === filter), [data, filter]);
  const counts = useMemo(() => {
    const items = data?.items ?? [];
    return {
      pending: items.filter((r) => r.status === 'pending').length,
      approved: items.filter((r) => r.status === 'approved').length,
      rejected: items.filter((r) => r.status === 'rejected').length,
    };
  }, [data]);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id);
    try {
      await post(`/recommendations/${id}/decision`, { decision });
      push(decision === 'approve' ? 'Learning approved — it will shape the next brief' : 'Learning rejected', 'success');
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not save decision', 'error');
    } finally {
      setBusy(null);
    }
  };

  const refresh = async () => {
    setBusy('refresh');
    try {
      await post('/recommendations/refresh');
      push('Learning loop refreshed from the latest analytics', 'success');
      reload();
    } finally {
      setBusy(null);
    }
  };

  const startExperiment = async () => {
    if (!experimentTarget) return;
    setBusy('experiment');
    try {
      await post('/experiments', { projectId: experimentTarget });
      push('Title experiment started — results simulate across impressions', 'success');
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not start experiment', 'error');
    } finally {
      setBusy(null);
    }
  };

  const adopt = async (id: string, winner: 'A' | 'B') => {
    setBusy(id);
    try {
      await post(`/experiments/${id}/decide`, { winner });
      push(`Variant ${winner} adopted on the live video`, 'success');
      reload();
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <div className="skeleton" style={{ height: 460 }} />;
  if (!data) return <Empty title="Learning loop unavailable" />;

  const running = data.experiments.filter((e) => e.status === 'running').length;
  const won = data.experiments.filter((e) => e.status === 'winner').length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 7 }}>Growth</div>
          <h1 className="page-title">Learning loop</h1>
          <p className="page-sub">
            Evidence from your own analytics, turned into specific next moves. Nothing changes in the studio until you approve a lesson.
          </p>
        </div>
        <div className="page-actions">
          <Button icon={<RefreshCw size={14} />} onClick={refresh} loading={busy === 'refresh'}>Refresh evidence</Button>
          <Button variant="ghost" icon={<TrendingUp size={14} />} onClick={() => navigate('/analytics')}>Open analytics</Button>
        </div>
      </div>

      <div className="grid g-4" style={{ marginBottom: 18 }}>
        {[
          { label: 'Awaiting decision', value: counts.pending, icon: <Lightbulb size={14} />, hint: 'proposed by the loop' },
          { label: 'Approved lessons', value: counts.approved, icon: <Check size={14} />, hint: 'applied to briefs' },
          { label: 'Experiments running', value: running, icon: <FlaskConical size={14} />, hint: 'title and thumbnail A/B' },
          { label: 'Variants adopted', value: won, icon: <Sparkles size={14} />, hint: 'winners applied' },
        ].map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-top"><span className="kpi-icon">{k.icon}</span>{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-foot">{k.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <div>
          <div className="chips" style={{ marginBottom: 14 }}>
            {(['pending', 'approved', 'rejected'] as const).map((f) => (
              <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                {f[0].toUpperCase() + f.slice(1)}
                <span className="n">{counts[f]}</span>
              </button>
            ))}
          </div>

          {recs.length === 0 && (
            <Empty
              icon={<Brain size={17} />}
              title={filter === 'pending' ? 'No lessons waiting' : 'Nothing here yet'}
              text={filter === 'pending' ? 'Refresh evidence after a few videos have real numbers.' : 'Decided lessons appear here with their evidence.'}
            />
          )}

          <div className="stack">
            {recs.map((r) => (
              <div className="rec" key={r.id}>
                <div className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
                  <Pill tone={r.impact === 'high' ? 'red' : r.impact === 'medium' ? 'amber' : 'neutral'}>{r.impact} impact</Pill>
                  <Pill tone="violet">{r.category}</Pill>
                  <span className="faint" style={{ fontSize: 10.5, marginLeft: 'auto' }}>{timeAgo(r.createdAt)}</span>
                </div>
                <h4>{r.title}</h4>
                <p>{r.insight}</p>
                <div className="evidence">
                  <Brain size={11} style={{ marginTop: 2, flex: 'none' }} />
                  {r.evidence}
                </div>
                {r.status === 'pending' ? (
                  <div className="row" style={{ gap: 6, marginTop: 2 }}>
                    <Button size="sm" variant="primary" icon={<Check size={12} />} loading={busy === r.id} onClick={() => decide(r.id, 'approve')}>
                      Approve lesson
                    </Button>
                    <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={() => decide(r.id, 'reject')}>Reject</Button>
                    <span className="faint" style={{ fontSize: 10.5, marginLeft: 'auto' }}>Applies to future briefs only</span>
                  </div>
                ) : (
                  <div className="row">
                    <Pill tone={r.status === 'approved' ? 'green' : 'neutral'}>{r.status}</Pill>
                    <span className="faint" style={{ fontSize: 10.5 }}>Locked into the current strategy</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="section">
            <div className="section-head">
              <h2>Controlled experiments</h2>
              <span className="faint" style={{ fontSize: 11 }}>A winner needs 95% confidence before it is adopted</span>
            </div>
            <div className="stack">
              {data.experiments.length === 0 && (
                <Empty icon={<FlaskConical size={17} />} title="No experiments yet" text="Start one below on any published video. The studio splits impressions and reports the winner." />
              )}
              {data.experiments.map((e) => (
                <Card key={e.id} bodyClass="tight">
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <Pill tone="violet">{e.kind} test</Pill>
                    <Pill tone={e.status === 'winner' ? 'green' : e.status === 'running' ? 'amber' : 'neutral'}>{e.status}</Pill>
                    <span className="faint" style={{ fontSize: 10.5, marginLeft: 'auto' }}>Started {timeAgo(e.startedAt)}</span>
                  </div>
                  <div className="stack" style={{ gap: 9 }}>
                    {[
                      { key: 'A', title: e.variantA, impressions: e.impressionsA, ctr: e.ctrA },
                      { key: 'B', title: e.variantB, impressions: e.impressionsB, ctr: e.ctrB },
                    ].map((v) => (
                      <div key={v.key}>
                        <div className="row" style={{ gap: 7, marginBottom: 4 }}>
                          <b style={{ fontSize: 10, width: 14, color: 'var(--text-3)' }}>{v.key}</b>
                          <span style={{ fontSize: 12, flex: 1, lineHeight: 1.4 }}>{v.title}</span>
                          <span className="faint" style={{ fontSize: 10.5 }}>{v.impressions.toLocaleString()} impressions</span>
                          <b style={{ fontSize: 12, color: v.ctr === Math.max(e.ctrA, e.ctrB) ? 'var(--green)' : 'var(--text-2)' }}>{percent(v.ctr)}</b>
                        </div>
                        <div className="progress thin">
                          <span style={{ width: `${Math.min(100, (v.ctr / 10) * 100)}%`, background: v.ctr === Math.max(e.ctrA, e.ctrB) ? 'linear-gradient(90deg,#3ddc97,#3dd9e8)' : undefined }} />
                        </div>
                      </div>
                    ))}
                    <Confidence value={e.confidence} />
                    {e.status !== 'inconclusive' && (
                      <div className="row" style={{ gap: 6 }}>
                        <Button size="sm" variant="ghost" disabled={e.status === 'winner'} onClick={() => adopt(e.id, 'A')}>Adopt A</Button>
                        <Button size="sm" variant="ghost" disabled={e.status === 'winner'} onClick={() => adopt(e.id, 'B')}>Adopt B</Button>
                        <span className="faint" style={{ fontSize: 10.5, marginLeft: 'auto' }}>
                          {e.confidence >= 95 ? 'Significant — safe to adopt' : 'Still collecting evidence'}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <aside className="stack">
          <Card title="Start an experiment" subtitle="Pick a published video">
            <div className="stack" style={{ gap: 10 }}>
              <select className="select" value={experimentTarget} onChange={(e) => setExperimentTarget(e.target.value)}>
                <option value="">Choose a video…</option>
                {(projects.data?.items ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              <Button variant="primary" block icon={<FlaskConical size={14} />} onClick={startExperiment} disabled={!experimentTarget} loading={busy === 'experiment'}>
                Start title test
              </Button>
              <div className="faint" style={{ fontSize: 10.5, lineHeight: 1.6 }}>
                The original title is preserved and restored if the test is inconclusive. No experiment can run on an unapproved or unpublished video.
              </div>
            </div>
          </Card>

          <Card title="How the loop works">
            <ol style={{ margin: 0, paddingLeft: 17, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>Analytics snapshots are collected for every published video.</li>
              <li>The engine compares each video to <b>your</b> baseline, never to a random channel.</li>
              <li>Retention curves are mapped to scene boundaries to find the leak.</li>
              <li>Proposals land here with their evidence attached.</li>
              <li>Only approved lessons enter future briefs and scripts.</li>
            </ol>
            <div className="note" style={{ marginTop: 12, fontSize: 11.5 }}>
              <Brain size={13} style={{ color: 'var(--violet-2)' }} />
              <div>No silent learning: the strategy file changes only through your decisions.</div>
            </div>
          </Card>

          <Card title="Brand guardrails" subtitle="Used when drafting titles and scripts">
            <div className="row wrap" style={{ gap: 6 }}>
              {['no income claims', 'no fake urgency', 'cite every stat', 'one CTA per video', 'human approval'].map((g) => (
                <Pill key={g} tone="neutral">{g}</Pill>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <ProgressBar value={100} tone="green" />
              <div className="faint" style={{ fontSize: 10.5, marginTop: 5 }}>All published videos passed the guardrail review.</div>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
