import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Wand2 } from 'lucide-react';
import { post } from '../lib/api';
import { useToast } from '../lib/context';
import type { Project } from '../../shared/types';
import { Button, Field, Modal } from './ui';

const STYLES = ['Cinematic', 'Editorial', 'Neon', 'Minimal'];

const IDEAS = [
  'how to price a freelance video edit',
  'the 90-day system for a channel that compounds',
  'best microphones under $100',
  'why retention drops at 30 seconds',
];

export function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [topic, setTopic] = useState('');
  const [format, setFormat] = useState<'long' | 'short'>('long');
  const [durationMin, setDurationMin] = useState(8);
  const [style, setStyle] = useState('Cinematic');
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
        topic: topic.trim(),
        format,
        durationMin: format === 'short' ? 1 : durationMin,
        style,
      });
      await post(`/projects/${res.project.id}/run`, {});
      push('Project created — title research is running.', 'success');
      onClose();
      setTopic('');
      navigate(`/projects/${res.project.id}`);
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not create project', 'error');
      // project may exist even if the run failed; send the user there
      onClose();
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <Modal onClose={onClose} title="New video" subtitle="One topic in, a full pipeline out — research first.">
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Topic or working title" hint="This is the keyword the researcher will dig into.">
          <input
            className="input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. how to price a freelance video edit"
            autoFocus
          />
        </Field>

        <div className="row wrap" style={{ gap: 6 }}>
          {IDEAS.map((idea) => (
            <button key={idea} className="btn btn-ghost" style={{ fontSize: 11, height: 26 }} onClick={() => setTopic(idea)}>
              {idea}
            </button>
          ))}
        </div>

        <div className="grid g-2" style={{ gap: 14 }}>
          <Field label="Format">
            <select className="select" value={format} onChange={(e) => setFormat(e.target.value as 'long' | 'short')}>
              <option value="long">Long-form · 16:9</option>
              <option value="short">Short · 9:16</option>
            </select>
          </Field>
          <Field label={format === 'short' ? 'Runtime' : 'Target runtime'}>
            <input
              className="input"
              type="number"
              min={format === 'short' ? 1 : 2}
              max={60}
              value={format === 'short' ? 1 : durationMin}
              disabled={format === 'short'}
              onChange={(e) => setDurationMin(Number(e.target.value))}
            />
          </Field>
          <Field label="Visual style">
            <select className="select" value={style} onChange={(e) => setStyle(e.target.value)}>
              {STYLES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Flow">
            <div className="row" style={{ gap: 6, paddingTop: 8, fontSize: 11.5, color: 'var(--text-2)' }}>
              <Sparkles size={12} style={{ color: 'var(--violet-2)' }} /> Research → Strategy → Script → Visuals → SEO → Quality
            </div>
          </Field>
        </div>

        <Button variant="primary" icon={<Wand2 size={14} />} onClick={submit} loading={busy} block>
          Create and run pipeline
        </Button>
        <div className="faint" style={{ fontSize: 11, textAlign: 'center' }}>
          Needs an AI key (Settings → AI providers) and a YouTube Data API key for real research.
        </div>
      </div>
    </Modal>
  );
}
