import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Clapperboard,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Info,
  Mic,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  Wand2,
  VolumeX,
} from 'lucide-react';
import type { Project } from '../../shared/types';
import { del, patch, post, put } from '../lib/api';
import { useApi, useLive, useToast } from '../lib/context';
import { Button, Card, Pill, ProgressBar, Empty } from '../components/ui';
import { clock, downloadFile, timeAgo } from '../lib/format';

interface SceneMedia {
  id: string;
  index: number;
  title: string;
  prompt: string;
  narration: string;
  durationSec: number;
  image?: { status: 'pending' | 'ready' | 'error'; url?: string; provider?: string; updatedAt?: string; error?: string };
  audio?: { status: 'pending' | 'ready' | 'error'; url?: string; provider?: string; voice?: string; durationSec?: number; error?: string; updatedAt?: string };
}

interface MediaPayload {
  production: {
    status: 'idle' | 'running' | 'ready' | 'failed';
    durationSec?: number;
    sizeBytes?: number;
    renderedAt?: string;
    aspect?: string;
    withNarration?: boolean;
    providerSummary?: string;
    error?: string;
  };
  aspect: '16:9' | '9:16';
  overrides: { imageProvider?: string; ttsProvider?: string; voice?: string; motion?: boolean };
  settings: { geminiVoice: string; defaultAspect: string; geminiImageModel: string; geminiTtsModel: string };
  scenes: SceneMedia[];
  videoUrl?: string;
  downloadUrl?: string;
  captionsUrl?: string;
  posterUrl?: string;
  job?: { status: string; progress: number; currentStage?: string; logs: { msg: string; level: string; t: string }[] } | null;
}

interface MediaConfig {
  image: { resolved: string; gemini: boolean; openai: boolean; pollinations: boolean };
  tts: { resolved: string | null; gemini: boolean; openai: boolean; elevenlabs: boolean };
  voices: string[];
  ffmpeg: { available: boolean; path: string };
  links: Record<string, string>;
}

const fmtSize = (bytes?: number) => {
  if (!bytes) return '—';
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};

const providerLabel: Record<string, string> = {
  gemini: 'Google AI Studio',
  openai: 'OpenAI',
  pollinations: 'Pollinations (free)',
  local: 'Studio art',
  elevenlabs: 'ElevenLabs',
};

export function ProductionTab({ project, onProjectReload }: { project: Project; onProjectReload: () => void }) {
  const { push } = useToast();
  const { refresh } = useLive();
  const { data, reload } = useApi<MediaPayload>(`/projects/${project.id}/media`);
  const { data: config, reload: reloadConfig } = useApi<MediaConfig>('/media/config');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState('');
  const [narrationDraft, setNarrationDraft] = useState('');
  const [durationDraft, setDurationDraft] = useState(6);
  const [dirty, setDirty] = useState(false);
  const [playerFailed, setPlayerFailed] = useState(false);

  const scenes = data?.scenes ?? [];
  const current = scenes.find((s) => s.id === selected) ?? scenes[0];
  const production = data?.production;
  const ready = production?.status === 'ready' && Boolean(data?.videoUrl);
  const job = data?.job ?? undefined;
  const rendering = job?.status === 'running' || production?.status === 'running';

  useEffect(() => {
    setPlayerFailed(false);
  }, [data?.videoUrl]);

  useEffect(() => {
    if (!current) return;
    setPromptDraft(current.prompt ?? '');
    setNarrationDraft(current.narration ?? '');
    setDurationDraft(current.durationSec ?? 6);
    setDirty(false);
  }, [current?.id, current?.image?.updatedAt, current?.audio?.updatedAt]);

  useEffect(() => {
    if (!selected && scenes.length) setSelected(scenes[0].id);
  }, [scenes.length, selected]);

  const stale = useMemo(() => {
    if (!ready || !production?.renderedAt) return false;
    const rendered = new Date(production.renderedAt).getTime();
    return scenes.some((s) => {
      const img = s.image?.updatedAt ? new Date(s.image.updatedAt).getTime() : 0;
      const aud = s.audio?.updatedAt ? new Date(s.audio.updatedAt).getTime() : 0;
      return Math.max(img, aud) > rendered;
    });
  }, [ready, production?.renderedAt, scenes]);

  const missingKey = config && !config.tts.resolved;

  async function act(key: string, fn: () => Promise<unknown>, message?: string) {
    setBusy(key);
    try {
      await fn();
      if (message) push(message, 'success');
      reload();
      reloadConfig();
      onProjectReload();
      refresh();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  }

  const generateImages = () => act('images', () => post(`/projects/${project.id}/media/images`, { onlyMissing: true }), 'Rendering scene visuals…');
  const generateVoice = () =>
    act('voice', () => post(`/projects/${project.id}/media/voice`, {}), missingKey ? 'Add a key to generate narration' : 'Generating narration…');
  const render = () => act('render', () => post(`/projects/${project.id}/media/render`, {}), 'Render queued — this runs scene by scene');
  const saveClip = () =>
    act(
      'save',
      () => patch(`/projects/${project.id}/scenes/${current?.id}`, { prompt: promptDraft, narration: narrationDraft, durationSec: durationDraft }),
      'Clip saved',
    );
  const regenerateImage = () =>
    act(
      'regen-image',
      () => post(`/projects/${project.id}/scenes/${current?.id}/regenerate`, { image: true, prompt: promptDraft, narration: narrationDraft }),
      'New take generated',
    );
  const regenerateVoice = () =>
    act(
      'regen-voice',
      () => post(`/projects/${project.id}/scenes/${current?.id}/regenerate`, { image: false, voice: true, prompt: promptDraft, narration: narrationDraft }),
      'Voice clip regenerated',
    );
  const move = (direction: 'up' | 'down') =>
    act('move', async () => {
      const res = await post<{ scenes: SceneMedia[] }>(`/projects/${project.id}/scenes/${current?.id}/move`, { direction });
      return res;
    });
  const remove = () =>
    act('delete', async () => {
      await del(`/projects/${project.id}/scenes/${current?.id}`);
      setSelected(null);
    }, 'Clip removed from the cut');
  const addScene = () =>
    act('add', async () => {
      const res = await post<{ scene: { id: string } }>(`/projects/${project.id}/scenes`, {
        afterId: current?.id,
        title: `New scene ${scenes.length + 1}`,
        durationSec: 6,
      });
      setSelected(res.scene.id);
    }, 'Scene added');

  const download = () =>
    act(
      'download',
      async () => {
        if (!data?.downloadUrl) throw new Error('Render the video first — there is no MP4 on disk yet.');
        const name = `${project.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'video'}.mp4`;
        await downloadFile(data.downloadUrl, name);
      },
      'MP4 saved to your downloads',
    );

  async function setOverride(patchBody: Record<string, unknown>) {
    await act('override', () => put(`/projects/${project.id}/media/settings`, patchBody));
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* ------------------------------------------------------------ studio header */}
      <Card
        title={
          <span className="row" style={{ gap: 8 }}>
            <Clapperboard size={15} /> Video studio
          </span>
        }
        subtitle="Scene-by-scene generation → real MP4 export. Every clip keeps its own prompt."
        right={
          <div className="row" style={{ gap: 6 }}>
            {ready ? <Pill tone={stale ? 'amber' : 'green'}>{stale ? 're-render needed' : 'export ready'}</Pill> : null}
            {rendering ? <Pill tone="violet">rendering</Pill> : null}
            {!config?.ffmpeg.available ? <Pill tone="red">ffmpeg missing</Pill> : null}
          </div>
        }
      >
        <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
          <Pill tone={config?.image?.gemini ? 'green' : 'neutral'}>
            <ImageIcon size={11} /> {providerLabel[data?.overrides.imageProvider ?? config?.image.resolved ?? 'local'] ?? 'Visuals'}
          </Pill>
          <Pill tone={config?.tts.resolved ? 'green' : 'amber'}>
            {config?.tts.resolved ? <Mic size={11} /> : <VolumeX size={11} />}{' '}
            {config?.tts.resolved ? providerLabel[config.tts.resolved] : 'no narration key'}
          </Pill>
          <Pill tone="neutral">
            <Film size={11} /> {data?.aspect ?? '16:9'}
          </Pill>
        </div>

        {missingKey && (
          <div className="notice" style={{ marginBottom: 12 }}>
            <Info size={15} />
            <div style={{ flex: 1 }}>
              <b>Narration needs a free provider key.</b> Add a Google AI Studio key (free tier) and this studio will voice every
              scene with Gemini TTS, then mix it into the MP4.{' '}
              <Link to="/settings" style={{ color: 'var(--accent)', fontWeight: 650 }}>
                Add key in Settings → Voice &amp; visuals
              </Link>
            </div>
          </div>
        )}
        {!config?.ffmpeg.available && (
          <div className="notice" style={{ marginBottom: 12 }}>
            <Info size={15} />
            <div>The server has no ffmpeg binary, so MP4 export is disabled. Install it with <code>npm install</code> (bundled installer) and restart.</div>
          </div>
        )}

        <div className="row wrap" style={{ gap: 8 }}>
          <Button icon={<ImageIcon size={14} />} onClick={generateImages} loading={busy === 'images'} disabled={rendering}>
            Generate visuals
          </Button>
          <Button
            icon={<Mic size={14} />}
            onClick={generateVoice}
            loading={busy === 'voice'}
            disabled={rendering || !config?.tts.resolved}
            title={config?.tts.resolved ? 'Generate narration for every scene' : 'Add a Google AI Studio (free) or OpenAI key to enable narration'}
          >
            Generate voiceover
          </Button>
          <Button
            variant="primary"
            icon={<Play size={14} />}
            onClick={render}
            loading={busy === 'render'}
            disabled={rendering || !config?.ffmpeg.available || scenes.length === 0}
            title={scenes.length === 0 ? 'Run the visuals stage first — there are no scenes to render' : 'Render every scene into one MP4'}
          >
            {ready ? 'Re-render video' : 'Render video'}
          </Button>
          {ready && data?.downloadUrl && (
            <Button icon={<Download size={14} />} onClick={download} loading={busy === 'download'}>
              Download MP4
            </Button>
          )}
          {ready && data?.captionsUrl && (
            <a className="btn btn-ghost" href={data.captionsUrl} download={`${project.id}.srt`}>
              .srt captions
            </a>
          )}
        </div>

        {rendering && (
          <div style={{ marginTop: 14 }}>
            <div className="row" style={{ gap: 8, justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{job?.currentStage ?? 'Working'}…</span>
              <span className="faint" style={{ fontSize: 11 }}>{job?.progress ?? 0}%</span>
            </div>
            <ProgressBar value={job?.progress ?? 0} />
            <div className="faint" style={{ fontSize: 11, marginTop: 6, minHeight: 15 }}>
              {job?.logs?.slice(-1)[0]?.msg}
            </div>
          </div>
        )}
        {production?.status === 'failed' && production.error && (
          <div className="notice" style={{ marginTop: 12, alignItems: 'flex-start' }}>
            <Info size={15} />
            <div style={{ flex: 1 }}>
              <b>Render failed.</b> {production.error}
            </div>
            <Button size="sm" variant="ghost" icon={<RefreshCw size={12} />} onClick={render} loading={busy === 'render'}>
              Retry
            </Button>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------ player */}
      <Card
        title="Final cut"
        subtitle={ready ? `${clock(production?.durationSec ?? 0)} · ${fmtSize(production?.sizeBytes)} · ${production?.providerSummary ?? ''}` : 'Render a cut to preview and download it here.'}
        right={ready ? <Pill tone="neutral">rendered {timeAgo(production?.renderedAt ?? '')}</Pill> : undefined}
      >
        {ready && data?.videoUrl ? (
          <div className="stack" style={{ gap: 10 }}>
            {playerFailed && (
              <div className="notice" style={{ marginBottom: 10 }}>
                <Info size={15} />
                <div style={{ flex: 1 }}>
                  The browser could not play this file inline. It is still a valid MP4 on disk — use{' '}
                  <b>Download</b> or <a href={data.videoUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>open it in a new tab</a>.
                </div>
              </div>
            )}
            <div className="video-shell">
              <video
                key={data.videoUrl}
                src={data.videoUrl}
                poster={data.posterUrl}
                controls
                preload="metadata"
                playsInline
                onError={() => setPlayerFailed(true)}
              />
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <Button size="sm" icon={<Download size={13} />} onClick={download} loading={busy === 'download'}>
                Download {project.format === 'short' ? 'short' : 'MP4'}
              </Button>
              <a className="btn btn-sm btn-ghost" href={data.videoUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={13} /> Open in browser
              </a>
              {data.downloadUrl && (
                <a className="btn btn-sm btn-ghost" href={data.downloadUrl} download>
                  Direct link
                </a>
              )}
              <span className="faint" style={{ fontSize: 11 }}>
                {production?.aspect} · H.264 + AAC · narration: {production?.withNarration ? 'included' : 'silent (no key)'}
              </span>
            </div>
          </div>
        ) : (
          <div className="empty" style={{ padding: 26 }}>
            <Film size={20} />
            <div style={{ fontWeight: 650, color: 'var(--text)' }}>No video yet</div>
            <div className="faint" style={{ fontSize: 12, maxWidth: 420, textAlign: 'center' }}>
              Generate the scene visuals, add a voice key for narration, then render. The export lands on your machine as a real .mp4.
            </div>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------ timeline */}
      <Card
        title="Timeline"
        subtitle={`${scenes.length} clips · drag-free reordering with the arrows · every clip has its own prompt and voice take`}
        right={
          <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={addScene} loading={busy === 'add'}>
            Add scene
          </Button>
        }
        bodyClass="tight"
      >
        {scenes.length === 0 ? (
          <Empty title="No scenes" text="Run the visuals stage first, then come back to edit the cut." />
        ) : (
          <div className="timeline">
            {scenes.map((scene) => {
              const active = current?.id === scene.id;
              return (
                <button key={scene.id} className={`clip ${active ? 'active' : ''}`} onClick={() => setSelected(scene.id)}>
                  <div className="clip-thumb">
                    {scene.image?.url ? (
                      <img src={scene.image.url} alt="" />
                    ) : (
                      <div className="clip-empty">
                        <Sparkles size={14} />
                        <span>no still</span>
                      </div>
                    )}
                    <span className="clip-index">{String(scene.index + 1).padStart(2, '0')}</span>
                    {scene.audio?.status === 'ready' ? (
                      <span className="clip-audio" title={`Narrated · ${scene.audio.voice ?? ''}`}>
                        <Mic size={10} />
                      </span>
                    ) : null}
                  </div>
                  <div className="clip-meta">
                    <b>{scene.title || `Scene ${scene.index + 1}`}</b>
                    <span>{scene.durationSec.toFixed(1)}s{scene.audio?.durationSec ? ` · voice ${scene.audio.durationSec.toFixed(1)}s` : ''}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------ clip editor */}
      {current && (
        <Card
          title={
            <span className="row" style={{ gap: 8 }}>
              <Wand2 size={15} /> Clip {String(current.index + 1).padStart(2, '0')} · {current.title}
            </span>
          }
          subtitle="Edit the prompt or script for this clip, then regenerate just this take. Nothing else changes."
          right={
            <div className="row" style={{ gap: 6 }}>
              <Button size="sm" variant="ghost" icon={<ArrowUp size={13} />} onClick={() => move('up')} disabled={current.index === 0 || busy === 'move'} />
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowDown size={13} />}
                onClick={() => move('down')}
                disabled={current.index === scenes.length - 1 || busy === 'move'}
              />
              <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={remove} loading={busy === 'delete'} />
            </div>
          }
        >
          <div className="grid g-2" style={{ alignItems: 'start' }}>
            <div className="stack" style={{ gap: 12 }}>
              <div className="clip-preview">
                {current.image?.url ? <img src={current.image.url} alt="" /> : <div className="clip-empty"><ImageIcon size={16} /><span>No image generated</span></div>}
                {current.image?.provider && (
                  <span className="clip-badge">
                    {providerLabel[current.image.provider] ?? current.image.provider}
                    {current.image.updatedAt ? ` · ${timeAgo(current.image.updatedAt)}` : ''}
                  </span>
                )}
              </div>
              {current.image?.status === 'error' && <div className="notice"><Info size={14} /><div>{current.image.error}</div></div>}
              {current.audio?.status === 'ready' && current.audio.url ? (
                <div className="row" style={{ gap: 8 }}>
                  <Mic size={13} className="faint" />
                  <audio src={current.audio.url} controls style={{ height: 30, flex: 1 }} />
                </div>
              ) : (
                <div className="faint" style={{ fontSize: 11.5 }}>
                  {current.audio?.status === 'error' ? current.audio.error : 'No voice take for this clip yet.'}
                </div>
              )}
              <div className="row" style={{ gap: 8 }}>
                <Button size="sm" icon={<RefreshCw size={13} />} onClick={regenerateImage} loading={busy === 'regen-image'}>
                  New visual from prompt
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Mic size={13} />}
                  onClick={regenerateVoice}
                  loading={busy === 'regen-voice'}
                  disabled={!config?.tts.resolved}
                >
                  Re-voice
                </Button>
              </div>
            </div>

            <div className="stack" style={{ gap: 12 }}>
              <div className="field">
                <label>
                  Image prompt
                  <span className="faint" style={{ marginLeft: 'auto', fontSize: 10 }}>
                    drives this clip only
                  </span>
                </label>
                <textarea
                  className="textarea"
                  rows={5}
                  value={promptDraft}
                  onChange={(e) => { setPromptDraft(e.target.value); setDirty(true); }}
                  placeholder="Describe the shot you want for this clip…"
                />
              </div>
              <div className="field">
                <label>Narration for this clip</label>
                <textarea
                  className="textarea"
                  rows={4}
                  value={narrationDraft}
                  onChange={(e) => { setNarrationDraft(e.target.value); setDirty(true); }}
                  placeholder="What the voiceover says over this shot…"
                />
              </div>
              <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
                <div className="field" style={{ width: 120 }}>
                  <label>Duration</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={90}
                    step={0.5}
                    value={durationDraft}
                    onChange={(e) => { setDurationDraft(Number(e.target.value)); setDirty(true); }}
                  />
                </div>
                <Button size="sm" onClick={saveClip} loading={busy === 'save'} disabled={!dirty}>
                  Save clip
                </Button>
                <span className="faint" style={{ fontSize: 11 }}>
                  Voice length wins if it runs longer.
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------------------ studio defaults */}
      <Card
        title={
          <span className="row" style={{ gap: 8 }}>
            <Settings2 size={15} /> Studio defaults for this project
          </span>
        }
        subtitle="Overrides apply to the whole cut — the settings page holds your keys."
      >
        <div className="grid g-3">
          <div className="field">
            <label>Visual source</label>
            <select
              className="select"
              value={data?.overrides.imageProvider ?? 'auto'}
              onChange={(e) => setOverride({ imageProvider: e.target.value })}
            >
              <option value="auto">Auto (best available)</option>
              <option value="gemini">Google AI Studio · Gemini image</option>
              <option value="openai">OpenAI · image</option>
              <option value="pollinations">Pollinations · free, no key</option>
              <option value="local">Studio art · offline</option>
            </select>
          </div>
          <div className="field">
            <label>Narration</label>
            <select className="select" value={data?.overrides.ttsProvider ?? 'auto'} onChange={(e) => setOverride({ ttsProvider: e.target.value })}>
              <option value="auto">Auto (best available)</option>
              <option value="gemini">Google · Gemini TTS</option>
              <option value="openai">OpenAI · TTS</option>
              <option value="elevenlabs">ElevenLabs</option>
              <option value="none">None · silent cut</option>
            </select>
          </div>
          <div className="field">
            <label>Voice</label>
            <select className="select" value={data?.overrides.voice ?? ''} onChange={(e) => setOverride({ voice: e.target.value })}>
              <option value="">Provider default</option>
              {(config?.voices ?? []).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Aspect</label>
            <select className="select" value={data?.aspect ?? '16:9'} onChange={(e) => setOverride({ aspect: e.target.value })}>
              <option value="16:9">16:9 · YouTube long-form</option>
              <option value="9:16">9:16 · Shorts</option>
            </select>
          </div>
          <div className="field">
            <label>Motion</label>
            <select
              className="select"
              value={data?.overrides.motion === false ? 'off' : 'on'}
              onChange={(e) => setOverride({ motion: e.target.value === 'on' })}
            >
              <option value="on">Ken Burns zoom on every still</option>
              <option value="off">Static stills</option>
            </select>
          </div>
          <div className="field">
            <label>Free keys</label>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {(Object.keys(config?.links ?? {}) as string[]).map((key) =>
                key === 'pollinations' ? null : (
                  <a key={key} href={config?.links?.[key]} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ height: 28, fontSize: 11.5, padding: '0 9px' }}>
                    {key === 'gemini' ? 'Google AI Studio' : key === 'openai' ? 'OpenAI' : 'ElevenLabs'} ↗
                  </a>
                ),
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
