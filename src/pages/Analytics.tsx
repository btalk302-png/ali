import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Clock3, DollarSign, Eye, MousePointerClick, Users } from 'lucide-react';
import { useApi } from '../lib/context';
import { compact, money, n, percent } from '../lib/format';
import { Button, Card, Empty, Pill, ScoreRing } from '../components/ui';
import { AreaChart, BarList, MiniStat, RetentionChart, RetentionLegend } from '../components/charts';

interface AnalyticsData {
  series: { date: string; views: number; subs: number; watchHours: number }[];
  totals: { views: number; watchHours: number; subscribers: number; videos: number; revenue: number; avgCtr: number };
  videos: {
    id: string;
    title: string;
    thumbnail?: string;
    format: string;
    publishedAt?: string;
    duration: string;
    metrics: {
      views: number;
      ctr: number;
      avd: string;
      subscribers: number;
      likes: number;
      comments: number;
      revenue: number;
      retention: number[];
      watchHours: number;
    };
    scenes: { id: string; title: string; durationSec: number }[];
  }[];
  demographics: { label: string; value: number }[];
  trafficSources: { label: string; value: number }[];
}

export function Analytics() {
  const navigate = useNavigate();
  const { data, loading } = useApi<AnalyticsData>('/analytics');
  const [metric, setMetric] = useState<'views' | 'watchHours' | 'subs'>('views');
  const [range, setRange] = useState<14 | 30 | 60>(30);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const series = useMemo(() => (data ? data.series.slice(-range) : []), [data, range]);
  const selected = data?.videos.find((v) => v.id === selectedId) ?? data?.videos[0];
  const avgRetention = selected ? selected.metrics.retention.reduce((s, v) => s + v, 0) / selected.metrics.retention.length : 0;
  const durationSec = selected ? Number(selected.duration.split(':')[0]) * 60 + Number(selected.duration.split(':')[1]) : 0;
  const sceneTotal = selected?.scenes.reduce((s, x) => s + x.durationSec, 0) || 1;
  let acc = 0;
  const sceneRows = (selected?.scenes ?? []).map((s) => {
    acc += s.durationSec;
    const idx = Math.min(99, Math.round((acc / sceneTotal) * 99));
    const prevIdx = Math.max(0, idx - Math.round((s.durationSec / sceneTotal) * 99));
    const drop = selected ? selected.metrics.retention[prevIdx] - selected.metrics.retention[idx] : 0;
    return { ...s, at: idx, still: selected?.metrics.retention[idx] ?? 100, drop };
  });

  if (loading && !data) {
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 36, width: 260 }} />
        <div className="grid g-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 110 }} />)}</div>
        <div className="skeleton" style={{ height: 340 }} />
      </div>
    );
  }
  if (!data) return <Empty title="Analytics unavailable" text="The studio server did not respond." />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 7 }}>Growth</div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-sub">Performance for the published catalogue — impressions, retention and what the audience actually did.</p>
        </div>
        <div className="page-actions">
          <div className="segmented">
            {[14, 30, 60].map((r) => (
              <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r as 14 | 30 | 60)}>{r}d</button>
            ))}
          </div>
          <Button variant="ghost" icon={<ArrowUpRight size={14} />} onClick={() => navigate('/insights')}>Learning loop</Button>
        </div>
      </div>

      <div className="grid g-4">
        {[
          { label: 'Views', value: compact(data.totals.views), icon: <Eye size={14} />, hint: `${data.totals.videos} published videos` },
          { label: 'Watch hours', value: n(data.totals.watchHours), icon: <Clock3 size={14} />, hint: 'lifetime catalogue' },
          { label: 'Subscribers gained', value: `+${compact(data.totals.subscribers)}`, icon: <Users size={14} />, hint: 'attributed to videos' },
          { label: 'Estimated revenue', value: money(data.totals.revenue), icon: <DollarSign size={14} />, hint: `${percent(data.totals.avgCtr)} average CTR` },
        ].map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi-top"><span className="kpi-icon">{k.icon}</span>{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-foot">{k.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid g-analytics section">
        <Card
          title="Channel trend"
          subtitle={`Last ${range} days`}
          right={
            <div className="segmented">
              {(['views', 'watchHours', 'subs'] as const).map((m) => (
                <button key={m} className={metric === m ? 'on' : ''} onClick={() => setMetric(m)}>
                  {m === 'watchHours' ? 'Hours' : m === 'subs' ? 'Subs' : 'Views'}
                </button>
              ))}
            </div>
          }
        >
          <AreaChart
            labels={series.map((s) => s.date)}
            values={series.map((s) => (metric === 'watchHours' ? Math.round(s.watchHours) : s[metric]))}
            format={(v) => (metric === 'watchHours' ? `${n(v)} h` : n(v))}
            tooltipLabel={metric === 'watchHours' ? 'watch hours' : metric === 'subs' ? 'subscribers' : 'views'}
            id="analytics"
            height={260}
          />
        </Card>

        <div className="stack">
          <Card title="Traffic sources" subtitle="Share of impressions">
            <BarList items={data.trafficSources.map((s) => ({ ...s, value: s.value }))} format={(v) => `${v}%`} />
          </Card>
          <Card title="Audience age" subtitle="Who is watching">
            <BarList items={data.demographics} format={(v) => `${v}%`} color="var(--cyan)" />
          </Card>
        </div>
      </div>

      <div className="section">
        <Card title="Video performance" subtitle="Click a row to inspect retention">
          {data.videos.length === 0 ? (
            <Empty title="No published videos yet" text="Publish your first project to unlock analytics." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Video</th>
                    <th className="num">Views</th>
                    <th className="num">CTR</th>
                    <th className="num">AVD</th>
                    <th className="num hide-sm">Watch hours</th>
                    <th className="num hide-sm">Subs</th>
                    <th className="num hide-sm">Likes</th>
                    <th className="num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.videos.map((v) => (
                    <tr key={v.id} onClick={() => setSelectedId(v.id)} style={{ background: selected?.id === v.id ? 'rgba(124,107,255,0.08)' : undefined }}>
                      <td>
                        <div className="row" style={{ gap: 9 }}>
                          {v.thumbnail && <img className="thumb thumb-sm" src={`/api/projects/${v.id}/thumbnail/${v.thumbnail}.svg`} alt="" style={{ width: 66 }} />}
                          <div>
                            <strong style={{ fontSize: 12 }}>{v.title}</strong>
                            <div className="faint" style={{ fontSize: 10.5, marginTop: 2 }}>{v.format === 'short' ? 'Short' : 'Long-form'} · {v.duration}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num">{compact(v.metrics.views)}</td>
                      <td className="num">{percent(v.metrics.ctr)}</td>
                      <td className="num">{v.metrics.avd}</td>
                      <td className="num hide-sm">{n(v.metrics.watchHours)}</td>
                      <td className="num hide-sm">+{n(v.metrics.subscribers)}</td>
                      <td className="num hide-sm">{n(v.metrics.likes)}</td>
                      <td className="num">{money(v.metrics.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {selected && (
        <div className="grid g-main section">
          <Card
            title="Audience retention"
            subtitle={selected.title}
            right={<RetentionLegend />}
          >
            <div className="row" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              {data.videos.map((v) => (
                <button key={v.id} className={`chip ${selected.id === v.id ? 'on' : ''}`} onClick={() => setSelectedId(v.id)}>
                  {v.title.slice(0, 30)}{v.title.length > 30 ? '…' : ''}
                </button>
              ))}
            </div>
            <RetentionChart values={selected.metrics.retention} scenes={selected.scenes} durationSec={durationSec} />
            <div className="grid g-4" style={{ marginTop: 16 }}>
              <MiniStat label="Avg retention" value={`${avgRetention.toFixed(1)}%`} hint="watch time share" />
              <MiniStat label="Avg view duration" value={selected.metrics.avd} hint={`of ${selected.duration}`} />
              <MiniStat label="CTR" value={percent(selected.metrics.ctr)} hint="impressions → clicks" />
              <MiniStat label="Watch hours" value={n(selected.metrics.watchHours)} hint="this video" />
            </div>
            <div className="note" style={{ marginTop: 14 }}>
              <MousePointerClick size={13} style={{ color: 'var(--violet-2)' }} />
              <div>
                {sceneRows.length > 0 && sceneRows[sceneRows.length - 1].drop > 0
                  ? `Steepest scene drop: “${[...sceneRows].sort((a, b) => b.drop - a.drop)[0].title}”. Tighten the transition or move the payoff earlier.`
                  : 'Retention is holding across scenes. Keep this structure and reuse it.'}
              </div>
            </div>
          </Card>

          <Card title="Scene-by-scene" subtitle="Where attention leaks">
            <div className="stack" style={{ gap: 0 }}>
              {sceneRows.map((s, i) => (
                <div key={s.id} className="row" style={{ padding: '9px 0', borderBottom: '1px solid var(--border)', gap: 9 }}>
                  <span className="faint mono" style={{ fontSize: 10, width: 16 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 550, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
                    <div className="faint" style={{ fontSize: 10, marginTop: 2 }}>{s.durationSec}s · {s.still}% still watching</div>
                  </div>
                  <Pill tone={s.drop > 6 ? 'red' : s.drop > 3 ? 'amber' : 'green'}>
                    {s.drop > 6 ? <ArrowDownRight size={10} /> : <ArrowUpRight size={10} />}
                    {Math.abs(s.drop).toFixed(1)}%
                  </Pill>
                </div>
              ))}
              {sceneRows.length === 0 && <div className="faint" style={{ fontSize: 12 }}>No scene data.</div>}
            </div>
            <div className="divider-label">Benchmark</div>
            <div className="row" style={{ gap: 14 }}>
              <ScoreRing value={avgRetention * 2} size={70} thickness={6} label="index" />
              <div className="faint" style={{ fontSize: 11, lineHeight: 1.6 }}>
                A 40–45% average retention is healthy for an 8–12 minute explainer. Above 50% usually means the promise and the payoff are aligned.
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
