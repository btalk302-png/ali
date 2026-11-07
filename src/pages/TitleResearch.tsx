import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BookOpen,
  ExternalLink,
  Flame,
  Loader2,
  Play,
  Search,
  Sparkles,
  TrendingUp,
  Youtube,
} from 'lucide-react';
import type { Project, Research, TitleCandidate } from '../../shared/types';
import { post } from '../lib/api';
import { useApi, useToast } from '../lib/context';
import { Button, Card, Field, Pill } from '../components/ui';
import { compact, dateLabel } from '../lib/format';

interface Bootstrap {
  settings: { status: { youtube: boolean; textProvider: string | null } };
}

const STYLES = ['Cinematic', 'Editorial', 'Neon', 'Minimal'];

export function TitleResearch() {
  const keywordRef = useRef<HTMLInputElement>(null);
  const [keywordFlash, setKeywordFlash] = useState(false);

  useEffect(() => {
    const grab = () => {
      keywordRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      keywordRef.current?.focus();
      setKeywordFlash(true);
      window.setTimeout(() => setKeywordFlash(false), 1200);
    };
    window.addEventListener('cp-focus-research', grab);
    return () => window.removeEventListener('cp-focus-research', grab);
  }, []);

  const { push } = useToast();
  const navigate = useNavigate();
  const { data: boot } = useApi<Bootstrap>('/bootstrap');
  const [keyword, setKeyword] = useState('');
  const [research, setResearch] = useState<Research | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<TitleCandidate | null>(null);
  const [format, setFormat] = useState<'long' | 'short'>('long');
  const [durationMin, setDurationMin] = useState(8);
  const [style, setStyle] = useState('Cinematic');
  const [runNow, setRunNow] = useState(true);

  const status = boot?.settings.status;
  const canResearch = Boolean(status?.youtube || status?.textProvider);

  const run = async () => {
    if (keyword.trim().length < 3) {
      push('Enter a keyword or topic first.', 'error');
      return;
    }
    setBusy(true);
    setResearch(null);
    setSelected(null);
    try {
      const res = await post<{ research: Research }>('/research', { keyword: keyword.trim() });
      setResearch(res.research);
      setSelected(res.research.titles[0] ?? null);
      push(`Researched ${res.research.videos.length} videos and ${res.research.titles.length} title options`, 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Research failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const createProject = async () => {
    if (!research || !selected) return;
    setCreating(true);
    try {
      const res = await post<{ project: Project }>('/projects', {
        topic: research.keyword,
        title: selected.text,
        research: { ...research, selectedTitle: selected.text },
        format,
        durationMin: format === 'short' ? 1 : durationMin,
        style,
      });
      if (runNow) await post(`/projects/${res.project.id}/run`, {});
      push(runNow ? 'Project created — pipeline running' : 'Project created', 'success');
      navigate(`/projects/${res.project.id}`);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not create the project', 'error');
    } finally {
      setCreating(false);
    }
  };

  const best = useMemo(() => research?.titles.slice(0, 1)[0], [research]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 7 }}>Step 1</div>
          <h1 className="page-title">Video title researcher</h1>
          <p className="page-sub">
            Real YouTube data, not a bot: top-performing videos in your topic, measured title patterns, live web context, and titles built from that evidence.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/projects" className="btn btn-ghost">
            Pipeline <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {!canResearch && (
        <Card className="flat" title="Add a key to research for real" subtitle="No demo data — the researcher only reports what it can verify.">
          <div className="stack" style={{ gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
            <div><b style={{ color: 'var(--text)' }}>YouTube Data API key</b> — pulls real search results, view counts and publish dates. Free quota: 10,000 units/day.</div>
            <div><b style={{ color: 'var(--text)' }}>Text provider</b> (Gemini is free-tier) — turns that evidence into insights and title options. Without it you still get raw data and pattern-based titles.</div>
            <div><Link to="/settings" style={{ color: 'var(--accent)', fontWeight: 650 }}>Open Settings → keys</Link></div>
          </div>
        </Card>
      )}

      <Card className="flat" title="Research a keyword" subtitle="The same keyword can seed a new video, or just answer what is working in your niche.">
        <div className="row wrap" style={{ gap: 10 }}>
          <input
            id="research-keyword"
            ref={keywordRef}
            aria-label="Research keyword"
            className="input"
            style={
              keywordFlash
                ? { flex: 1, minWidth: 260, height: 42, outline: '2px solid rgba(124,107,255,0.65)', outlineOffset: 2 }
                : { flex: 1, minWidth: 260, height: 42 }
            }
            placeholder="e.g. how to price a freelance video edit"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
          <Button variant="primary" icon={busy ? <Loader2 size={15} className="spin" /> : <Search size={15} />} onClick={run} loading={busy} disabled={!canResearch}>
            {busy ? 'Researching…' : 'Research titles'}
          </Button>
        </div>
        <div className="faint" style={{ fontSize: 11, marginTop: 8 }}>
          {status?.youtube ? 'YouTube data connected' : 'No YouTube key — YouTube results will be skipped'} ·{' '}
          {status?.textProvider ? `${status.textProvider} for analysis` : 'no text model — analysis skipped'}
        </div>
      </Card>

      {busy && (
        <Card className="flat">
          <div className="row" style={{ gap: 10 }}>
            <Loader2 size={16} className="spin" style={{ color: 'var(--violet-2)' }} />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Pulling real data…</div>
              <div className="faint" style={{ fontSize: 11.5 }}>YouTube search → video statistics → Wikipedia → web grounding → title synthesis</div>
            </div>
          </div>
        </Card>
      )}

      {research && (
        <>
          <Card
            className="flat"
            title="Opportunity read"
            subtitle={`${research.videos.length} real videos · ${research.sources.length} sources · ${research.providers.join(' + ') || 'limited providers'}`}
            right={<Pill tone="violet"><Sparkles size={10} /> {research.keyword}</Pill>}
          >
            <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)' }}>{research.summary}</p>
            {research.insights.length > 0 && (
              <div className="stack" style={{ gap: 6, marginTop: 12 }}>
                {research.insights.map((insight, i) => (
                  <div key={i} className="row" style={{ gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                    <TrendingUp size={12} style={{ color: 'var(--green)', flex: 'none' }} />
                    {insight}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid g-main section" style={{ alignItems: 'start' }}>
            <Card
              title="Title options"
              subtitle="Click one to use it. Scores reflect length, keyword presence and proven patterns — not promises."
              right={best ? <Pill tone="green"><Award size={10} /> top {best.score}</Pill> : undefined}
            >
              <div className="stack" style={{ gap: 8 }}>
                {research.titles.map((title) => {
                  const active = selected?.text === title.text;
                  return (
                    <button
                      key={title.text}
                      onClick={() => setSelected(title)}
                      className="row"
                      style={{
                        gap: 12,
                        alignItems: 'flex-start',
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: `1px solid ${active ? 'rgba(124,107,255,0.55)' : 'var(--border)'}`,
                        background: active ? 'rgba(124,107,255,0.08)' : 'var(--surface-2)',
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 9,
                          flex: 'none',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 12,
                          fontWeight: 700,
                          color: active ? '#fff' : 'var(--text-2)',
                          background: active ? 'var(--grad)' : 'rgba(255,255,255,0.05)',
                        }}
                      >
                        {title.score}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 620, lineHeight: 1.4 }}>{title.text}</div>
                        <div className="faint" style={{ fontSize: 11, marginTop: 3 }}>
                          {title.angle} · {title.why || '—'}
                        </div>
                      </div>
                      <Pill tone={title.source === 'ai' ? 'violet' : 'neutral'}>{title.source === 'ai' ? 'AI' : 'pattern'}</Pill>
                    </button>
                  );
                })}
                {research.titles.length === 0 && <div className="faint">No titles generated — add a text provider key.</div>}
              </div>
            </Card>

            <aside className="stack">
              <Card title="Start the project" subtitle="Uses this research as step 1 — no re-research needed.">
                <div className="stack" style={{ gap: 12 }}>
                  <Field label="Selected title">
                    <input className="input" value={selected?.text ?? ''} readOnly />
                  </Field>
                  <div className="grid g-2" style={{ gap: 10 }}>
                    <Field label="Format">
                      <select className="select" value={format} onChange={(e) => setFormat(e.target.value as 'long' | 'short')}>
                        <option value="long">Long-form</option>
                        <option value="short">Short</option>
                      </select>
                    </Field>
                    <Field label="Runtime">
                      <input
                        className="input"
                        type="number"
                        min={2}
                        max={60}
                        value={format === 'short' ? 1 : durationMin}
                        disabled={format === 'short'}
                        onChange={(e) => setDurationMin(Number(e.target.value))}
                      />
                    </Field>
                  </div>
                  <Field label="Visual style">
                    <select className="select" value={style} onChange={(e) => setStyle(e.target.value)}>
                      {STYLES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  <label className="row" style={{ gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                    <input type="checkbox" checked={runNow} onChange={(e) => setRunNow(e.target.checked)} />
                    Run strategy → script → visuals → SEO now
                  </label>
                  <Button variant="primary" icon={<Play size={14} />} onClick={createProject} loading={creating} disabled={!selected} block>
                    Create project
                  </Button>
                </div>
              </Card>

              {research.opportunities.length > 0 && (
                <Card title="Angles worth taking" bodyClass="tight">
                  <div className="stack" style={{ gap: 8 }}>
                    {research.opportunities.slice(0, 4).map((o) => (
                      <div key={o.title} style={{ fontSize: 11.5 }}>
                        <div className="row" style={{ gap: 6 }}>
                          <b style={{ flex: 1 }}>{o.title}</b>
                          <Pill tone={o.competition === 'low' ? 'green' : o.competition === 'medium' ? 'amber' : 'red'}>{o.competition}</Pill>
                          <span className="faint">{o.searchInterest}</span>
                        </div>
                        <div className="faint" style={{ marginTop: 2, lineHeight: 1.5 }}>{o.why}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </aside>
          </div>

          <Card
            title="What is already ranking"
            subtitle="Live YouTube results, sorted by views. Outlier = views per day far above the set's median."
            right={<Pill tone="neutral"><Youtube size={10} /> YouTube Data API</Pill>}
            bodyClass="tight"
          >
            {research.videos.length === 0 ? (
              <div className="faint" style={{ padding: 14 }}>No video data — add a YouTube Data API key in Settings.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Video</th>
                      <th>Channel</th>
                      <th className="num">Views</th>
                      <th>Published</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {research.videos.slice(0, 14).map((v) => (
                      <tr key={v.videoId}>
                        <td>
                          <div className="row" style={{ gap: 6 }}>
                            {v.outlier && <Flame size={12} style={{ color: 'var(--amber)', flex: 'none' }} />}
                            <span style={{ fontSize: 12.5 }}>{v.title}</span>
                          </div>
                        </td>
                        <td className="faint" style={{ fontSize: 11.5 }}>{v.channel}</td>
                        <td className="num">{compact(v.views)}</td>
                        <td className="faint" style={{ fontSize: 11.5 }}>{dateLabel(v.publishedAt)}</td>
                        <td>
                          <a href={v.url} target="_blank" rel="noreferrer" className="icon-btn" style={{ width: 26, height: 26 }}>
                            <ExternalLink size={12} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {research.sources.length > 0 && (
            <Card title="Sources used" subtitle="Everything the researcher could verify. Nothing invented." bodyClass="tight">
              <div className="stack" style={{ gap: 6 }}>
                {research.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="row" style={{ gap: 8, fontSize: 11.5, color: 'var(--text-2)' }}>
                    {s.kind === 'wikipedia' ? <BookOpen size={12} /> : s.kind === 'youtube' ? <Youtube size={12} /> : <ExternalLink size={12} />}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                    <span className="faint">{s.kind}</span>
                  </a>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
