import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CornerDownRight, Lightbulb, MessageSquare, Send, ShieldAlert, Sparkles, ThumbsUp, Wand2 } from 'lucide-react';
import { useApi, useToast } from '../lib/context';
import { post } from '../lib/api';
import { avatarColor, initials, timeAgo } from '../lib/format';
import { Button, Card, Empty, Pill } from '../components/ui';
import { BarList } from '../components/charts';

interface CommentItem {
  id: string;
  projectId: string;
  author: string;
  avatarHue: number;
  text: string;
  likes: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  theme: string;
  isQuestion: boolean;
  spam: boolean;
  replied: boolean;
  replyDraft?: string;
  postedAt: string;
  video: string;
  thumbnail?: string;
}

interface CommentsResponse {
  items: CommentItem[];
  counts: { all: number; pending: number; questions: number; spam: number; replied: number };
  ideas: { title: string; evidence: string; status: string }[];
}

const FILTERS = [
  { key: 'all', label: 'All comments' },
  { key: 'pending', label: 'Needs reply' },
  { key: 'questions', label: 'Questions' },
  { key: 'positive', label: 'Positive' },
  { key: 'spam', label: 'Quarantined' },
];

export function Audience() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [filter, setFilter] = useState('pending');
  const { data, loading, reload } = useApi<CommentsResponse>(`/comments?filter=${filter}`);
  const [busy, setBusy] = useState<string | null>(null);

  const items = useMemo(() => {
    if (!data) return [];
    return [...data.items].sort((a, b) => Number(a.spam) - Number(b.spam) || b.likes - a.likes);
  }, [data]);

  const sentiment = useMemo(() => {
    const all = data?.items ?? [];
    const count = (s: string) => all.filter((c) => c.sentiment === s).length;
    return [
      { label: 'Positive', value: count('positive'), color: 'var(--green)' },
      { label: 'Neutral', value: count('neutral'), color: 'var(--text-3)' },
      { label: 'Negative', value: count('negative'), color: 'var(--red)' },
    ];
  }, [data]);

  const createFromIdea = async (title: string) => {
    setBusy(title);
    try {
      const res = await post<{ project: { id: string } }>('/projects', { topic: title, autoRun: true });
      push('Video project created from audience idea', 'success');
      navigate(`/projects/${res.project.id}`);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not create project', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <div className="skeleton" style={{ height: 460 }} />;
  if (!data) return <Empty title="Audience studio unavailable" />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 7 }}>Growth</div>
          <h1 className="page-title">Audience studio</h1>
          <p className="page-sub">
            Every comment triaged into sentiment and theme. Replies are drafted in your voice and post only after you approve them. Spam is quarantined, never deleted.
          </p>
        </div>
        <div className="page-actions">
          <Pill tone="amber"><span className="bullet" />{data.counts.pending} need a reply</Pill>
          <Pill tone="red"><span className="bullet" />{data.counts.spam} quarantined</Pill>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
            <span className="n">{data.counts[f.key as keyof typeof data.counts] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <div className="stack">
          {items.length === 0 && (
            <Empty icon={<MessageSquare size={17} />} title="Nothing in this queue" text="You are caught up. Switch filters to see the rest of the conversation." />
          )}
          {items.map((c) => (
            <CommentCard key={c.id} comment={c} onChanged={reload} onOpenVideo={() => navigate(`/projects/${c.projectId}`)} push={push} />
          ))}
        </div>

        <aside className="stack">
          <Card title="Sentiment" subtitle="Across the comments in view">
            <BarList items={sentiment} format={(v) => `${v}`} />
            <div className="divider-label">Themes</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {[...new Set(data.items.map((c) => c.theme))].map((t) => (
                <Pill key={t} tone="neutral">{t}</Pill>
              ))}
            </div>
          </Card>

          <Card title="Ideas from your audience" subtitle="Requests that repeat get mined automatically">
            <div className="stack" style={{ gap: 11 }}>
              {data.ideas.map((idea) => (
                <div key={idea.title} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                  <div className="row" style={{ gap: 7, alignItems: 'flex-start' }}>
                    <Lightbulb size={13} style={{ color: 'var(--amber)', marginTop: 2, flex: 'none' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 550, lineHeight: 1.45 }}>{idea.title}</div>
                      <div className="faint" style={{ fontSize: 10.5, marginTop: 3 }}>{idea.evidence}</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    style={{ marginTop: 6, marginLeft: 20 }}
                    icon={<Sparkles size={12} />}
                    loading={busy === idea.title}
                    onClick={() => createFromIdea(idea.title)}
                  >
                    Make this video
                  </Button>
                </div>
              ))}
              {data.ideas.length === 0 && <div className="faint" style={{ fontSize: 12 }}>No repeated requests yet.</div>}
            </div>
          </Card>

          <Card title="Moderation policy">
            <div className="stack" style={{ gap: 9 }}>
              <div className="note" style={{ fontSize: 11.5 }}>
                <ShieldAlert size={13} style={{ color: 'var(--amber)' }} />
                <div>Links, giveaway language and crypto pitches are quarantined automatically. The agent never hides or deletes a comment — that stays a human action in YouTube Studio.</div>
              </div>
              <div className="note" style={{ fontSize: 11.5 }}>
                <AlertTriangle size={13} style={{ color: 'var(--violet-2)' }} />
                <div>Approving a reply posts it publicly. In this build posting is a dry run and recorded in the activity log.</div>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

function CommentCard({
  comment,
  onChanged,
  onOpenVideo,
  push,
}: {
  comment: CommentItem;
  onChanged: () => void;
  onOpenVideo: () => void;
  push: (m: string, k?: 'success' | 'error' | 'info') => void;
}) {
  const [draft, setDraft] = useState(comment.replyDraft ?? '');
  const [editing, setEditing] = useState(Boolean(comment.replyDraft));
  const [busy, setBusy] = useState<string | null>(null);

  const draftWithAi = async () => {
    setBusy('draft');
    try {
      const res = await post<{ comment: CommentItem }>(`/comments/${comment.id}/draft`);
      setDraft(res.comment.replyDraft ?? '');
      setEditing(true);
      onChanged();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not draft a reply', 'error');
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy('send');
    try {
      await post(`/comments/${comment.id}/reply`, { text: draft });
      push(`Reply to ${comment.author} recorded`, 'success');
      onChanged();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not post', 'error');
    } finally {
      setBusy(null);
    }
  };

  const quarantine = async () => {
    setBusy('quarantine');
    try {
      await post(`/comments/${comment.id}/quarantine`);
      push(comment.spam ? 'Restored from quarantine' : 'Moved to quarantine', 'info');
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`comment ${comment.spam ? 'spam' : ''}`}>
      <div className="comment-head">
        <div className="avatar" style={{ background: avatarColor(comment.avatarHue) }}>{initials(comment.author)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 7, flexWrap: 'wrap' }}>
            <b>{comment.author}</b>
            <span className="when">{timeAgo(comment.postedAt)}</span>
            {comment.spam && <Pill tone="red">quarantined</Pill>}
            {comment.isQuestion && <Pill tone="violet">question</Pill>}
            <Pill tone={comment.sentiment === 'positive' ? 'green' : comment.sentiment === 'negative' ? 'red' : 'neutral'}>{comment.sentiment}</Pill>
            <Pill tone="neutral">{comment.theme}</Pill>
          </div>
          <button className="faint" style={{ background: 'none', border: 0, padding: 0, fontSize: 10.5, cursor: 'pointer', textAlign: 'left' }} onClick={onOpenVideo}>
            on {comment.video}
          </button>
        </div>
        <span className="faint row" style={{ fontSize: 10.5, gap: 4 }}><ThumbsUp size={11} />{comment.likes}</span>
      </div>
      <p>{comment.text}</p>

      {comment.replied ? (
        <div className="reply row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <CornerDownRight size={12} style={{ marginTop: 3, color: 'var(--green)', flex: 'none' }} />
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--green)', fontWeight: 600, marginBottom: 2 }}>You replied</div>
            {comment.replyDraft || draft || '—'}
          </div>
        </div>
      ) : comment.spam ? (
        <div className="row" style={{ gap: 7 }}>
          <Pill tone="red"><ShieldAlert size={10} /> filtered as spam</Pill>
          <Button size="sm" variant="ghost" loading={busy === 'quarantine'} onClick={quarantine}>Restore</Button>
        </div>
      ) : (
        <>
          {editing && (
            <div className="stack" style={{ gap: 7 }}>
              <textarea
                className="textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="Write a reply, or let the studio draft one in your voice…"
                style={{ fontSize: 12.5, lineHeight: 1.6 }}
              />
              <div className="row" style={{ gap: 6 }}>
                <Button size="sm" variant="primary" icon={<Send size={12} />} onClick={send} loading={busy === 'send'} disabled={!draft.trim()}>
                  Post reply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <span className="faint" style={{ fontSize: 10.5 }}>Posts publicly after approval</span>
              </div>
            </div>
          )}
          {!editing && (
            <div className="row" style={{ gap: 6 }}>
              <Button size="sm" variant="ghost" icon={<Wand2 size={12} />} onClick={draftWithAi} loading={busy === 'draft'}>
                Draft reply
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Write manually</Button>
              <span className="spacer" />
              <Button size="sm" variant="ghost" loading={busy === 'quarantine'} onClick={quarantine}>Quarantine</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
