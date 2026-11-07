import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, Rocket } from 'lucide-react';
import { useApi, useToast } from '../lib/context';
import { get, post } from '../lib/api';
import { dateTimeLabel, timeAgo } from '../lib/format';
import type { ProjectStatus } from '../../shared/types';
import { Button, Card, Empty, Pill, StatusPill } from '../components/ui';

interface ProjectRow {
  id: string;
  title: string;
  status: ProjectStatus;
  thumbnail?: string;
  schedule?: { publishAt: string; privacy: string; status: string };
  metrics: { views: number } | null;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function CalendarPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const { data } = useApi<{ items: ProjectRow[] }>('/projects');
  const boot = useApi<{ automation: { cadence: string; publishHour: number; privacy: string } }>('/bootstrap');
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const items = data?.items ?? [];

  const events = useMemo(() => {
    const list: { id: string; title: string; date: string; status: ProjectStatus; published: boolean; at: string }[] = [];
    for (const p of items) {
      if (p.schedule?.publishAt) {
        list.push({
          id: p.id,
          title: p.title,
          date: new Date(p.schedule.publishAt).toDateString(),
          status: p.status,
          published: p.status === 'published',
          at: p.schedule.publishAt,
        });
      } else if (p.status === 'published' && p.metrics) {
        list.push({ id: p.id, title: p.title, date: '', status: p.status, published: true, at: '' });
      }
    }
    return list.sort((a, b) => (a.at < b.at ? -1 : 1));
  }, [items]);

  const cells = useMemo(() => {
    const first = new Date(cursor);
    const startDay = first.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const prevMonthDays = new Date(cursor.getFullYear(), cursor.getMonth(), 0).getDate();
    const out: { date: Date; out: boolean }[] = [];
    for (let i = startDay - 1; i >= 0; i--) out.push({ date: new Date(cursor.getFullYear(), cursor.getMonth() - 1, prevMonthDays - i), out: true });
    for (let d = 1; d <= daysInMonth; d++) out.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), d), out: false });
    while (out.length % 7 !== 0) {
      const last = out[out.length - 1].date;
      out.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), out: true });
    }
    return out;
  }, [cursor]);

  const todayKey = new Date().toDateString();
  const upcoming = items
    .filter((p) => p.schedule?.publishAt && ['approved', 'scheduled'].includes(p.status))
    .sort((a, b) => (a.schedule!.publishAt < b.schedule!.publishAt ? -1 : 1));
  const unscheduled = items.filter((p) => p.status === 'approved' && !p.schedule);

  const scheduleNext = async (id: string) => {
    setBusy(id);
    try {
      const detail = await get<{ project: ProjectRow; scheduledAfter: string }>(`/projects/${id}`);
      await post(`/projects/${id}/schedule`, { publishAt: detail.scheduledAfter, privacy: boot.data?.automation.privacy ?? 'private' });
      push('Scheduled into the next free slot', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not schedule', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 7 }}>Planning</div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-sub">
            Your publishing rhythm. {boot.data?.automation.cadence.replace(/-/g, ' ')} cadence, publishing around {String(boot.data?.automation.publishHour ?? 18).padStart(2, '0')}:00.
          </p>
        </div>
        <div className="page-actions">
          <div className="row" style={{ gap: 4 }}>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} icon={<ChevronLeft size={14} />} />
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} icon={<ChevronRight size={14} />} />
          </div>
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => window.dispatchEvent(new CustomEvent('cp-new-project'))}>New video</Button>
        </div>
      </div>

      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, fontWeight: 650 }}>
              {MONTHS[cursor.getMonth()]} <span className="faint" style={{ fontWeight: 400 }}>{cursor.getFullYear()}</span>
            </h2>
            <div className="row" style={{ gap: 10, fontSize: 10.5, color: 'var(--text-3)' }}>
              <span className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(124,107,255,0.6)' }} /> scheduled</span>
              <span className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--green)' }} /> published</span>
            </div>
          </div>
          <div className="cal">
            <div className="cal-grid">
              {DOW.map((d) => <div className="cal-dow" key={d}>{d}</div>)}
            </div>
            <div className="cal-grid">
              {cells.map(({ date, out }, i) => {
                const key = date.toDateString();
                const dayEvents = events.filter((e) => e.date === key);
                return (
                  <div
                    key={`${key}-${i}`}
                    className={`cal-day ${out ? 'out' : ''} ${key === todayKey ? 'today' : ''}`}
                    onClick={() => setSelectedDay(dayEvents.length ? key : null)}
                    style={{ cursor: dayEvents.length ? 'pointer' : 'default' }}
                  >
                    <div className="d">
                      <span>{date.getDate()}</span>
                      {key === todayKey && <span style={{ fontSize: 8.5 }}>today</span>}
                    </div>
                    {dayEvents.slice(0, 2).map((e) => (
                      <div
                        key={e.id}
                        className={`cal-event ${e.published ? 'published' : ''}`}
                        onClick={(ev) => { ev.stopPropagation(); navigate(`/projects/${e.id}`); }}
                        title={e.title}
                      >
                        {e.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && <span className="faint" style={{ fontSize: 9.5 }}>+{dayEvents.length - 2} more</span>}
                  </div>
                );
              })}
            </div>
          </div>
          {selectedDay && (
            <Card title={selectedDay} className="section">
              <div className="stack">
                {events.filter((e) => e.date === selectedDay).map((e) => (
                  <div key={e.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${e.id}`)}>
                    <div className="grow">
                      <div className="t">{e.title}</div>
                      <div className="s"><StatusPill status={e.status} /> {e.at && <span>{dateTimeLabel(e.at)}</span>}</div>
                    </div>
                    <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <aside className="stack">
          <Card title="Next uploads" subtitle={`${upcoming.length} queued`}>
            {upcoming.length === 0 && <div className="faint" style={{ fontSize: 12 }}>Nothing queued. Approve a review-ready project to fill the calendar.</div>}
            <div className="list">
              {upcoming.slice(0, 6).map((p) => (
                <div key={p.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}`)}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(124,107,255,0.14)', border: '1px solid rgba(124,107,255,0.28)', display: 'grid', placeItems: 'center', flex: 'none' }}>
                    <Clock3 size={12} style={{ color: 'var(--violet-2)' }} />
                  </div>
                  <div className="grow">
                    <div className="t">{p.title}</div>
                    <div className="s">{dateTimeLabel(p.schedule!.publishAt)} · {p.schedule!.privacy}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Awaiting a slot" subtitle="Approved but not scheduled">
            {unscheduled.length === 0 && <div className="faint" style={{ fontSize: 12 }}>No approved projects waiting.</div>}
            <div className="stack" style={{ gap: 9 }}>
              {unscheduled.map((p) => (
                <div key={p.id} className="row" style={{ gap: 8 }}>
                  <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                  <Button size="sm" variant="ghost" loading={busy === p.id} onClick={() => scheduleNext(p.id)}>Next slot</Button>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Published" subtitle="Recent uploads">
            <div className="list">
              {items.filter((p) => p.status === 'published').slice(0, 5).map((p) => (
                <div key={p.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}`)}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(61,220,151,0.12)', border: '1px solid rgba(61,220,151,0.26)', display: 'grid', placeItems: 'center', flex: 'none' }}>
                    <Rocket size={12} style={{ color: 'var(--green)' }} />
                  </div>
                  <div className="grow">
                    <div className="t">{p.title}</div>
                    <div className="s">{p.metrics ? `${p.metrics.views.toLocaleString()} views` : 'no data yet'} · {p.schedule ? timeAgo(p.schedule.publishAt) : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {items.length === 0 && <Empty icon={<CalendarDays size={17} />} title="Calendar is empty" text="Create a project to populate the schedule." />}
          <div className="note">
            <CalendarDays size={13} style={{ color: 'var(--violet-2)' }} />
            <div>The publishing agent checks the queue every 60 seconds. In this build the upload is a dry run — connect YouTube OAuth in <code>server/index.ts</code> to go live.</div>
          </div>
        </aside>
      </div>
    </>
  );
}
