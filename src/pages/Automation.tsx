import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Check, Clock3, ListChecks, Play, Plus, RefreshCw, Save, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useApi, useToast } from '../lib/context';
import { post, put } from '../lib/api';
import { timeAgo } from '../lib/format';
import { Button, Card, Empty, Field, Pill, ProgressBar, Toggle } from '../components/ui';

interface AutopilotData {
  running: boolean;
  settings: {
    enabled: boolean;
    cadence: 'daily' | '3-per-week' | 'weekly';
    publishHour: number;
    privacy: 'public' | 'unlisted' | 'private';
    autoApprove: boolean;
    pillars: string[];
    mandate: string;
    guardrails: string;
  };
  mandate: string;
  queue: { id: string; title: string }[];
  recentRuns: { id: string; status: string; progress: number; currentStage?: string; createdAt: string; projectId?: string; logs: { msg: string; level: string }[] }[];
}

export function Automation() {
  const navigate = useNavigate();
  const { push } = useToast();
  const { data, loading, reload } = useApi<AutopilotData>('/autopilot');
  const [form, setForm] = useState<AutopilotData['settings'] | null>(null);
  const [newPillar, setNewPillar] = useState('');
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data?.settings]);

  const save = async () => {
    if (!form) return;
    setBusy('save');
    try {
      await put('/settings', { automation: form });
      push('Autopilot strategy saved', 'success');
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not save', 'error');
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    setBusy('run');
    try {
      await post('/autopilot/run', { count, pillars: form?.pillars });
      push(`Autopilot queued ${count} episode${count > 1 ? 's' : ''}. Watch the pipeline fill up.`, 'success');
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Autopilot could not start', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <div className="skeleton" style={{ height: 460 }} />;
  if (!data || !form) return <Empty title="Autopilot unavailable" />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 7 }}>Studio</div>
          <h1 className="page-title">
            Autonomous operator
            <Pill tone={data.running ? 'violet' : 'neutral'}><span className="bullet" />{data.running ? 'running' : 'idle'}</Pill>
          </h1>
          <p className="page-sub">
            Describe the channel you want — not a task list. The operator plans episodes inside your pillars and guardrails, then sends each one through the pipeline. Approval stays human.
          </p>
        </div>
        <div className="page-actions">
          <Button icon={<RefreshCw size={14} />} onClick={reload}>Refresh</Button>
          <Button variant="primary" icon={<Save size={14} />} onClick={save} loading={busy === 'save'}>Save strategy</Button>
        </div>
      </div>

      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title="Channel mandate" subtitle="The operator reads this before planning anything">
            <textarea
              className="textarea"
              rows={4}
              value={form.mandate}
              onChange={(e) => setForm({ ...form, mandate: e.target.value })}
              style={{ fontSize: 13, lineHeight: 1.65 }}
            />
            <div className="row" style={{ marginTop: 8 }}>
              <span className="faint" style={{ fontSize: 10.5 }}>{(form.mandate.match(/\b\w+\b/g) ?? []).length} words · specific mandates produce sharper plans</span>
              <span className="spacer" />
              <Button size="sm" variant="ghost" icon={<Sparkles size={12} />} onClick={() => setForm({ ...form, mandate: `Build the most trusted systems channel for solo creators. Every upload must teach one repeatable workflow, stay under ${form.publishHour}:00 publish time, and never promise overnight results.` })}>
                Use a template
              </Button>
            </div>
          </Card>

          <Card title="Content pillars" subtitle="Rotated across planned episodes">
            <div className="row wrap" style={{ gap: 7, marginBottom: 12 }}>
              {form.pillars.map((p) => (
                <span key={p} className="pill pill-violet" style={{ height: 27, paddingRight: 4 }}>
                  {p}
                  <button
                    onClick={() => setForm({ ...form, pillars: form.pillars.filter((x) => x !== p) })}
                    style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', display: 'flex', padding: 2 }}
                    aria-label={`Remove ${p}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              {form.pillars.length === 0 && <span className="faint" style={{ fontSize: 12 }}>Add at least one pillar.</span>}
            </div>
            <div className="row" style={{ gap: 7 }}>
              <input
                className="input"
                placeholder="Add a pillar…"
                value={newPillar}
                onChange={(e) => setNewPillar(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPillar.trim()) {
                    setForm({ ...form, pillars: [...form.pillars, newPillar.trim()] });
                    setNewPillar('');
                  }
                }}
                style={{ height: 33 }}
              />
              <Button
                size="sm"
                icon={<Plus size={13} />}
                onClick={() => {
                  if (!newPillar.trim()) return;
                  setForm({ ...form, pillars: [...form.pillars, newPillar.trim()] });
                  setNewPillar('');
                }}
              >
                Add
              </Button>
            </div>
          </Card>

          <Card title="Cadence and guardrails">
            <div className="grid g-2" style={{ gap: 14 }}>
              <Field label="Publishing cadence" hint="Drives the scheduler and the next free slot">
                <select className="select" value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value as typeof form.cadence })}>
                  <option value="daily">Daily</option>
                  <option value="3-per-week">3 per week</option>
                  <option value="weekly">Weekly</option>
                </select>
              </Field>
              <Field label="Preferred publish hour" hint="Local time on the studio server">
                <select className="select" value={form.publishHour} onChange={(e) => setForm({ ...form, publishHour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </Field>
              <Field label="Default privacy">
                <select className="select" value={form.privacy} onChange={(e) => setForm({ ...form, privacy: e.target.value as typeof form.privacy })}>
                  <option value="private">Private (recommended)</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </Field>
              <Field label="Operator status">
                <div style={{ paddingTop: 6 }}>
                  <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label={form.enabled ? 'Autopilot enabled' : 'Paused'} hint="Scheduled runs follow the cadence above" />
                </div>
              </Field>
            </div>
            <div className="split" style={{ margin: '14px 0' }} />
            <Field label="Guardrails" hint="Hard limits the writer may never cross">
              <textarea className="textarea" rows={3} value={form.guardrails} onChange={(e) => setForm({ ...form, guardrails: e.target.value })} />
            </Field>
            <div className="row wrap" style={{ gap: 10, marginTop: 12 }}>
              <Toggle checked={form.autoApprove} onChange={(v) => setForm({ ...form, autoApprove: v })} label="Auto-approve when quality is perfect" hint="Off by default. Off is the professional setting." />
            </div>
            {form.autoApprove && (
              <div className="note warn" style={{ marginTop: 12 }}>
                <ShieldCheck size={13} />
                <div>Auto-approve bypasses the human review gate and publishes anything that clears the automated checks. Turn it off unless you are running a fully automated channel.</div>
              </div>
            )}
          </Card>
        </div>

        <aside className="stack">
          <Card title="Run now" subtitle="Creates episodes and runs the full pipeline">
            <div className="row" style={{ gap: 10, marginBottom: 12 }}>
              <div className="segmented" style={{ flex: 1 }}>
                {[1, 2, 3].map((n) => (
                  <button key={n} className={count === n ? 'on' : ''} style={{ flex: 1 }} onClick={() => setCount(n)}>{n} video{n > 1 ? 's' : ''}</button>
                ))}
              </div>
            </div>
            <Button variant="primary" block size="lg" icon={<Play size={15} />} onClick={run} loading={busy === 'run'} disabled={data.running}>
              {data.running ? 'Autopilot is running…' : 'Activate & run'}
            </Button>
            <div className="faint" style={{ fontSize: 10.5, marginTop: 9, lineHeight: 1.55 }}>
              {form.pillars.length} pillars · {form.cadence.replace(/-/g, ' ')} · approval gate {form.autoApprove ? 'disabled' : 'on'}
            </div>
            {data.queue.length > 0 && (
              <>
                <div className="divider-label">In progress</div>
                <div className="stack" style={{ gap: 8 }}>
                  {data.queue.map((q) => (
                    <div key={q.id} className="row" style={{ fontSize: 11.5 }}>
                      <RefreshCw size={11} className="spin" style={{ color: 'var(--violet-2)' }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</span>
                      <button className="link" onClick={() => navigate(`/projects/${q.id}`)}>open</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card title="Recent runs" subtitle="Full pipeline history">
            {data.recentRuns.length === 0 && <div className="faint" style={{ fontSize: 12 }}>No runs yet.</div>}
            <div className="stack" style={{ gap: 10 }}>
              {data.recentRuns.slice(0, 4).map((j) => (
                <div key={j.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 9 }}>
                  <div className="row" style={{ gap: 7, marginBottom: 5 }}>
                    <Pill tone={j.status === 'done' ? 'green' : j.status === 'running' ? 'violet' : j.status === 'failed' ? 'red' : 'neutral'}>{j.status}</Pill>
                    <span className="faint" style={{ fontSize: 10.5, marginLeft: 'auto' }}>{timeAgo(j.createdAt)}</span>
                  </div>
                  <div className="row" style={{ gap: 7 }}>
                    <div style={{ flex: 1 }}><ProgressBar value={j.progress} /></div>
                    <span className="faint" style={{ fontSize: 10 }}>{j.progress}%</span>
                  </div>
                  <div className="faint" style={{ fontSize: 10.5, marginTop: 4, lineHeight: 1.5 }}>
                    {j.logs?.slice(-1)[0]?.msg ?? j.currentStage ?? 'Queued'}
                  </div>
                  {j.projectId && <button className="link" style={{ fontSize: 10.5, marginTop: 3 }} onClick={() => navigate(`/projects/${j.projectId}`)}>Open project</button>}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Operator contract">
            <div className="stack" style={{ gap: 9 }}>
              {[
                { icon: <ListChecks size={13} />, text: 'Plans only within your pillars and mandate.' },
                { icon: <Clock3 size={13} />, text: 'Respects cadence and never double-books a slot.' },
                { icon: <ShieldCheck size={13} />, text: 'Every episode passes the quality gate and your approval.' },
                { icon: <Bot size={13} />, text: 'Logs every decision to the activity feed.' },
              ].map((r, i) => (
                <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-start', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--violet-2)', marginTop: 1 }}>{r.icon}</span>
                  {r.text}
                </div>
              ))}
            </div>
            <div className="note ok" style={{ marginTop: 12, fontSize: 11 }}>
              <Check size={12} /> Human-in-the-loop by design. Autonomy does not bypass review.
            </div>
          </Card>

          <Card title="Automation schedule">
            <div className="kv"><span>Planned episodes</span><b>{form.pillars.length} per cycle</b></div>
            <div className="kv"><span>Next slot</span><b>{form.publishHour}:00</b></div>
            <div className="kv"><span>Queue worker</span><b>60s interval</b></div>
            <div className="kv"><span>Learning refresh</span><b>after analytics</b></div>
          </Card>
        </aside>
      </div>
    </>
  );
}
