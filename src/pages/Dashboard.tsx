import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Eye,
  FlaskConical,
  MessageSquare,
  MousePointerClick,
  Play,
  RefreshCw,
  Rocket,
  Sparkles,
  TrendingUp,
  Users,
  Wand2,
  Zap,
} from 'lucide-react';
import { useApi, useLive } from '../lib/context';
import { compact, dateLabel, dateTimeLabel, n, percent, statusMeta, timeAgo } from '../lib/format';
import type { ProjectStatus } from '../../shared/types';
import { Button, Card, Empty, Pill, ProgressBar, ScoreRing, StatusPill } from '../components/ui';
import { AreaChart, BarList, Sparkline } from '../components/charts';

interface DashboardData {
  channel: { name: string; niche: string; handle: string };
  automation: { cadence: string; enabled: boolean };
  demoMode: boolean;
  kpis: {
    views: number;
    viewsDelta: number;
    watchHours: number;
    subs: number;
    subsDelta: number;
    ctr: number;
    retention: number;
    published: number;
    inProduction: number;
  };
  series: { date: string; views: number; subs: number; watchHours: number }[];
  stages: Record<'generating' | 'review' | 'approved' | 'scheduled' | 'published' | 'draft', number>;
  pipeline: {
    id: string;
    title: string;
    status: ProjectStatus;
    format: string;
    topic: string;
    stages: Record<string, { status: string }>;
    quality: number | null;
    updatedAt: string;
    schedule?: { publishAt: string };
  }[];
  upcoming: { id: string; title: string; schedule: { publishAt: string; privacy: string }; quality: number | null }[];
  topVideos: { id: string; title: string; thumbnail?: string; views: number; ctr: number; avd: string; subs: number; spark: number[] }[];
  activity: { id: string; icon: string; text: string; meta?: string; createdAt: string; projectId?: string }[];
  jobs: { id: string; status: string; progress: number; currentStage?: string; projectId?: string; logs: { msg: string }[] }[];
  recommendations: { id: string; title: string; insight: string; impact: string; category: string }[];
  commentsNeedingAttention: number;
  spamQuarantined: number;
  experiments: { id: string; status: string }[];
}

const ACTIVITY_ICONS: Record<string, typeof Play> = {
  rocket: Rocket,
  trending: TrendingUp,
  message: MessageSquare,
  calendar: CalendarDays,
  check: Check,
  sparkles: Sparkles,
  settings: Zap,
  brain: Sparkles,
  flask: FlaskConical,
  bot: Wand2,
  undo: RefreshCw,
  x: RefreshCw,
};

function Kpi({
  label,
  value,
  delta,
  icon,
  hint,
  spark,
  color,
}: {
  label: string;
  value: string;
  delta?: number;
  icon: React.ReactNode;
  hint: string;
  spark?: number[];
  color?: string;
}) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className="kpi-icon">{icon}</span>
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">
        {delta != null && (
          <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>
            <TrendingUp size={11} style={{ transform: delta >= 0 ? 'none' : 'scaleY(-1)' }} />
            {delta >= 0 ? '+' : ''}
            {delta}%
          </span>
        )}
        <span>{hint}</span>
      </div>
      {spark && spark.length > 1 && (
        <div className="spark">
          <Sparkline values={spark} color={color} width={92} height={30} />
        </div>
      )}
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { data, loading } = useApi<DashboardData>('/dashboard');
  const { refresh } = useLive();
  const [metric, setMetric] = useState<'views' | 'subs' | 'watchHours'>('views');

  const spark = useMemo(() => data?.series.map((s) => s.views) ?? [], [data]);
  const chart = useMemo(() => {
    if (!data) return { labels: [], values: [] };
    return {
      labels: data.series.map((s) => s.date),
      values: data.series.map((s) => (metric === 'watchHours' ? Math.round(s.watchHours) : s[metric])),
    };
  }, [data, metric]);

  if (loading && !data) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 40, width: 320 }} />
        <div className="grid g-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 126 }} />)}
        </div>
        <div className="grid g-main">
          <div className="skeleton" style={{ height: 320 }} />
          <div className="skeleton" style={{ height: 320 }} />
        </div>
      </div>
    );
  }

  if (!data) return <Empty title="Could not load the dashboard" text="Reload the page to reconnect to the local studio server." />;

  const metricConfig = {
    views: { label: 'Views', format: (v: number) => n(v), tooltip: 'views' },
    subs: { label: 'Subscribers', format: (v: number) => `+${n(v)}`, tooltip: 'new subscribers' },
    watchHours: { label: 'Watch hours', format: (v: number) => `${n(v)} h`, tooltip: 'watch hours' },
  }[metric];

  const stageRows: { key: keyof DashboardData['stages']; label: string; tone: string }[] = [
    { key: 'generating', label: 'Generating', tone: 'var(--violet)' },
    { key: 'review', label: 'Needs review', tone: 'var(--amber)' },
    { key: 'approved', label: 'Approved', tone: 'var(--cyan)' },
    { key: 'scheduled', label: 'Scheduled', tone: 'var(--green)' },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 7 }}>{data.channel.niche} · {data.automation.cadence.replace(/-/g, ' ')} cadence</div>
          <h1 className="page-title">
            Command center
            <Pill tone={data.demoMode ? 'amber' : 'green'}>
              <span className="bullet" />
              {data.demoMode ? 'Demo data' : 'Live'}
            </Pill>
          </h1>
          <p className="page-sub">
            Everything your channel needs in one place. The studio researches, writes, packages and schedules — you approve every upload before it leaves.
          </p>
        </div>
        <div className="page-actions">
          <Button icon={<RefreshCw size={14} />} onClick={refresh} className="hide-sm">
            Sync
          </Button>
          <Button icon={<Wand2 size={14} />} onClick={() => navigate('/automation')}>
            Autopilot
          </Button>
          <Button variant="primary" icon={<Sparkles size={14} />} onClick={() => window.dispatchEvent(new CustomEvent('cp-new-project'))}>
            New video
          </Button>
        </div>
      </div>

      <div className="grid g-4">
        <Kpi label="Views · 28 days" value={compact(data.kpis.views)} delta={data.kpis.viewsDelta} icon={<Eye size={14} />} hint="vs previous 28" spark={spark} color="#7c6bff" />
        <Kpi label="Watch hours" value={compact(data.kpis.watchHours)} icon={<Clock3 size={14} />} hint="all published videos" spark={data.series.map((s) => Math.round(s.watchHours))} color="#3dd9e8" />
        <Kpi label="New subscribers" value={`+${compact(data.kpis.subs)}`} delta={data.kpis.subsDelta} icon={<Users size={14} />} hint="last 28 days" spark={data.series.map((s) => s.subs)} color="#3ddc97" />
        <Kpi label="Click-through rate" value={percent(data.kpis.ctr)} icon={<MousePointerClick size={14} />} hint={`${percent(data.kpis.retention)} avg retention`} color="#f5b544" />
      </div>

      <div className="grid g-main section">
        <Card
          title="Channel growth"
          subtitle="Views, subscribers and watch time across the last 30 days"
          right={
            <div className="segmented">
              {(['views', 'subs', 'watchHours'] as const).map((m) => (
                <button key={m} className={metric === m ? 'on' : ''} onClick={() => setMetric(m)}>
                  {m === 'watchHours' ? 'Hours' : m === 'subs' ? 'Subs' : 'Views'}
                </button>
              ))}
            </div>
          }
        >
          <div className="row" style={{ gap: 26, marginBottom: 14, alignItems: 'flex-end' }}>
            <div>
              <div className="metric-big">{metricConfig.format(chart.values[chart.values.length - 1] ?? 0)}</div>
              <div className="faint" style={{ fontSize: 11 }}>{metricConfig.tooltip} · today</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--green)' }}>
                <TrendingUp size={12} style={{ verticalAlign: -1 }} /> {data.kpis.viewsDelta >= 0 ? '+' : ''}{data.kpis.viewsDelta}%
              </div>
              <div className="faint" style={{ fontSize: 11 }}>28-day momentum</div>
            </div>
          </div>
          <AreaChart labels={chart.labels} values={chart.values} format={metricConfig.format} tooltipLabel={metricConfig.tooltip} id="dash" height={232} />
        </Card>

        <div className="stack">
          <Card
            title="Production board"
            subtitle={`${data.kpis.inProduction} in the studio`}
            right={<Button size="sm" variant="ghost" icon={<ChevronRight size={13} />} onClick={() => navigate('/projects')}>Open</Button>}
          >
            <div className="stack" style={{ gap: 10 }}>
              {stageRows.map((row) => (
                <div key={row.key} className="row" style={{ gap: 10 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: row.tone, flex: 'none' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{row.label}</span>
                  <b style={{ fontSize: 12.5, fontWeight: 650 }}>{data.stages[row.key]}</b>
                </div>
              ))}
              <div className="split" style={{ margin: '4px 0' }} />
              {data.pipeline.slice(0, 3).map((p) => {
                const done = Object.values(p.stages).filter((s) => s.status === 'done').length;
                return (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}
                  >
                    <div className="row" style={{ gap: 7 }}>
                      <span style={{ fontSize: 12, fontWeight: 550, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                      <StatusPill status={p.status} />
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <div style={{ flex: 1 }}><ProgressBar value={(done / 7) * 100} /></div>
                      <span className="faint" style={{ fontSize: 10 }}>{done}/7</span>
                    </div>
                  </button>
                );
              })}
              {data.pipeline.length === 0 && <div className="faint" style={{ fontSize: 12 }}>Nothing in the studio yet. Create your first video.</div>}
            </div>
          </Card>

          <Card title="Channel health" subtitle="Rolling 28-day benchmarks">
            <div className="row" style={{ gap: 16 }}>
              <ScoreRing value={data.kpis.retention * 1.2} size={86} thickness={7} label="health" />
              <div style={{ flex: 1 }}>
                <BarList
                  items={[
                    { label: 'Retention', value: Math.round(data.kpis.retention) },
                    { label: 'CTR vs niche median', value: Math.round((data.kpis.ctr / 6) * 100) },
                    { label: 'Upload consistency', value: 78 },
                  ]}
                  format={(v) => `${v}`}
                />
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid g-2 section">
        <Card
          title="Needs your decision"
          subtitle="Finished videos waiting for a human"
          right={<Pill tone={data.stages.review ? 'amber' : 'green'}>{data.stages.review} waiting</Pill>}
        >
          {data.pipeline.filter((p) => p.status === 'review' || p.status === 'approved').length === 0 && (
            <div className="faint" style={{ fontSize: 12.5, padding: '8px 0' }}>Nothing waiting. The studio is working ahead of you.</div>
          )}
          <div className="list">
            {data.pipeline
              .filter((p) => p.status === 'review' || p.status === 'approved')
              .map((p) => (
                <div key={p.id} className="list-row">
                  <div style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'rgba(124,107,255,0.14)', border: '1px solid rgba(124,107,255,0.25)' }}>
                    <Play size={13} style={{ color: 'var(--violet-2)' }} />
                  </div>
                  <div className="grow">
                    <div className="t">{p.title}</div>
                    <div className="s">
                      <StatusPill status={p.status} />
                      <span>Quality {p.quality ?? '—'}/100</span>
                      <span>· {timeAgo(p.updatedAt)}</span>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/projects/${p.id}`)} icon={<ArrowUpRight size={13} />}>
                    Review
                  </Button>
                </div>
              ))}
          </div>
        </Card>

        <Card
          title="Publishing queue"
          subtitle="Approved and scheduled uploads"
          right={<Button size="sm" variant="ghost" onClick={() => navigate('/calendar')} icon={<CalendarDays size={13} />}>Calendar</Button>}
        >
          {data.upcoming.length === 0 && <div className="faint" style={{ fontSize: 12.5 }}>No uploads queued. Approve a video to schedule it.</div>}
          <div className="list">
            {data.upcoming.map((u) => (
              <div key={u.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${u.id}`)}>
                <div style={{ width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'rgba(61,220,151,0.12)', border: '1px solid rgba(61,220,151,0.25)' }}>
                  <CalendarDays size={13} style={{ color: 'var(--green)' }} />
                </div>
                <div className="grow">
                  <div className="t">{u.title}</div>
                  <div className="s">
                    {dateTimeLabel(u.schedule.publishAt)} · {u.schedule.privacy}
                  </div>
                </div>
                <Pill tone="neutral">{dateLabel(u.schedule.publishAt)}</Pill>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid g-main section">
        <Card
          title="Top performing videos"
          subtitle="Ranked by views since publishing"
          right={<Button size="sm" variant="ghost" onClick={() => navigate('/analytics')} icon={<ChevronRight size={13} />}>Analytics</Button>}
        >
          {data.topVideos.length === 0 ? (
            <Empty icon={<Eye size={17} />} title="No published videos yet" text="Publish your first project and performance shows up here." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Video</th>
                    <th className="num">Views</th>
                    <th className="num">CTR</th>
                    <th className="num">AVD</th>
                    <th className="num hide-sm">Subs</th>
                    <th>Traction</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topVideos.map((v) => (
                    <tr key={v.id} onClick={() => navigate(`/projects/${v.id}`)}>
                      <td>
                        <div className="row" style={{ gap: 9 }}>
                          {v.thumbnail && (
                            <img
                              className="thumb thumb-sm"
                              src={`/api/projects/${v.id}/thumbnail/${v.thumbnail}.svg`}
                              alt=""
                              style={{ width: 70, aspectRatio: '16/9', objectFit: 'cover' }}
                            />
                          )}
                          <strong style={{ fontSize: 12, lineHeight: 1.4 }}>{v.title}</strong>
                        </div>
                      </td>
                      <td className="num">{compact(v.views)}</td>
                      <td className="num">{percent(v.ctr)}</td>
                      <td className="num">{v.avd}</td>
                      <td className="num hide-sm">+{n(v.subs)}</td>
                      <td><Sparkline values={v.spark} width={70} height={22} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Studio activity" subtitle="Latest agent decisions">
          <div className="list">
            {data.activity.slice(0, 6).map((a) => {
              const Icon = ACTIVITY_ICONS[a.icon] ?? Sparkles;
              return (
                <div key={a.id} className="list-row" style={{ alignItems: 'flex-start', cursor: a.projectId ? 'pointer' : 'default' }} onClick={() => a.projectId && navigate(`/projects/${a.projectId}`)}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', flex: 'none' }}>
                    <Icon size={12} style={{ color: 'var(--text-2)' }} />
                  </div>
                  <div className="grow">
                    <div className="t" style={{ whiteSpace: 'normal', fontSize: 12, lineHeight: 1.45 }}>{a.text}</div>
                    <div className="s">{a.meta ? `${a.meta} · ` : ''}{timeAgo(a.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {data.recommendations[0] && (
        <div className="section">
          <div className="card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: 'linear-gradient(120deg, rgba(124,107,255,0.14), rgba(61,217,232,0.05))' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(124,107,255,0.2)', border: '1px solid rgba(124,107,255,0.35)' }}>
              <Sparkles size={16} style={{ color: '#c9c1ff' }} />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="eyebrow">Learning loop · pending</span>
                <Pill tone={data.recommendations[0].impact === 'high' ? 'red' : 'amber'}>{data.recommendations[0].impact} impact</Pill>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>{data.recommendations[0].title}</div>
              <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>{data.recommendations[0].insight}</div>
            </div>
            <Button variant="primary" size="sm" onClick={() => navigate('/insights')}>Review insight</Button>
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 26, gap: 18, flexWrap: 'wrap', color: 'var(--text-3)', fontSize: 11 }}>
        <span className="row" style={{ gap: 5 }}><CircleDollarSign size={12} /> Local-first · your keys stay on this machine</span>
        <span className="row" style={{ gap: 5 }}><MessageSquare size={12} /> {data.commentsNeedingAttention} comments need a reply · {data.spamQuarantined} quarantined</span>
        <span className="spacer" />
        <span>CreatorPilot Studio v1.0</span>
      </div>
    </>
  );
}
