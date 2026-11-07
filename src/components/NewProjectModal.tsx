import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Wand2 } from 'lucide-react';
import { post } from '../lib/api';
import { useToast } from '../lib/context';
import { Button, Field, Modal } from './ui';
import type { Project } from '../../shared/types';

const TONES = ['Analytical', 'Friendly expert', 'High energy', 'Documentary', 'Story-driven'];
const STYLES = ['Cinematic', 'Editorial', 'Neon', 'Minimal'];

const IDEAS = [
  'The 90-day system for a channel that compounds',
  'I rebuilt my workflow around one repeatable format',
  'What 100 thumbnails taught me about curiosity',
  'The hidden cost of chasing trends every week',
  'Retention is a design problem, not an edit problem',
];

export function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [topic, setTopic] = useState('');
  const [format, setFormat] = useState<'long' | 'short'>('long');
  const [durationMin, setDurationMin] = useState(8);
  const [tone, setTone] = useState('Analytical');
  const [style, setStyle] = useState('Cinematic');
  const [audience, setAudience] = useState('');
  const [niche, setNiche] = useState('');
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const navigate = useNavigate();

  const submit = async () => {
    if (topic.trim().length < 4) {
      push('Describe the video topic in a few more words.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await post<{ project: Project }>('/projects', {
        topic,
        format,
        durationMin,
        tone,
        style,
        audience: audience || undefined,
        niche: niche || undefined,
        autoRun: true,
      });
      push('Project created — the pipeline is running.', 'success');
      onClose();
      setTopic('');
      navigate(`/projects/${res.project.id}`);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not create project', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      title="New video project"
      subtitle="Give it a topic. The seven-stage pipeline handles research, script, visuals, SEO and QA."
      onClose={onClose}
      width={600}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Sparkles size={14} />} loading={busy} onClick={submit}>
            Generate video
          </Button>
        </>
      }
    >
      <Field label="Topic or working title" hint="Be specific — the research stage builds angles and keywords from this.">
        <textarea
          className="textarea"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. The 3-layer system behind channels that compound"
          rows={3}
          autoFocus
        />
      </Field>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="faint" style={{ fontSize: 11 }}>Need a spark?</span>
        <button
          className="chip"
          onClick={() => setTopic(IDEAS[Math.floor(Math.random() * IDEAS.length)])}
          style={{ height: 26, fontSize: 11 }}
        >
          <Wand2 size={12} /> Surprise me
        </button>
        {IDEAS.slice(0, 2).map((idea) => (
          <button key={idea} className="chip" style={{ height: 26, fontSize: 11 }} onClick={() => setTopic(idea)}>
            {idea.slice(0, 30)}…
          </button>
        ))}
      </div>

      <div className="grid g-2" style={{ gap: 12 }}>
        <Field label="Format">
          <div className="segmented" style={{ width: '100%' }}>
            <button className={format === 'long' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setFormat('long')}>Long-form</button>
            <button className={format === 'short' ? 'on' : ''} style={{ flex: 1 }} onClick={() => setFormat('short')}>Short</button>
          </div>
        </Field>
        <Field label={format === 'short' ? 'Target length' : `Target length — ${durationMin} min`}>
          <input
            type="range"
            min={format === 'short' ? 1 : 3}
            max={format === 'short' ? 1 : 25}
            value={format === 'short' ? 1 : durationMin}
            disabled={format === 'short'}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#7c6bff' }}
          />
        </Field>
        <Field label="Tone">
          <select className="select" value={tone} onChange={(e) => setTone(e.target.value)}>
            {TONES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Visual style">
          <select className="select" value={style} onChange={(e) => setStyle(e.target.value)}>
            {STYLES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Audience (optional)" hint="Who is this for? Sharper audience notes improve the hook and the CTA.">
        <input className="input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. solo creators stuck under 2,000 subscribers" />
      </Field>
      <Field label="Niche (optional)">
        <input className="input" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="e.g. AI tools & creator systems" />
      </Field>

      <div className="note">
        <Sparkles size={14} style={{ color: 'var(--violet-2)' }} />
        <div>
          The project lands in <b>Needs review</b> with a quality score, SEO package and thumbnail options. Nothing publishes without your approval.
        </div>
      </div>
    </Modal>
  );
}
