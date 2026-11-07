import { useEffect, useState } from 'react';
import {
  Check,
  Database,
  Film,
  Image as ImageIcon,
  KeyRound,
  Mic,
  RefreshCw,
  Save,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Youtube,
  Zap,
} from 'lucide-react';
import type { Settings } from '../../shared/types';
import { post, put } from '../lib/api';
import { useApi, useToast } from '../lib/context';
import { Button, Card, Field, Pill, Toggle } from '../components/ui';

type ProviderRow = Settings['providers'][number] & { hasKey?: boolean };

/** Suggestions only — the field stays free text so a new model id never needs a release. */
const MODEL_SUGGESTIONS: Record<string, string[]> = {
  gemini: ['gemini-3.8-flash', 'gemini-3-pro', 'gemini-2.5-flash'],
  openai: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o'],
  openrouter: ['openai/gpt-4o-mini', 'google/gemini-3.8-flash', 'anthropic/claude-sonnet-4-5'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  anthropic: ['claude-sonnet-4-5', 'claude-opus-4-1'],
};
type SettingsForm = Omit<Settings, 'providers'> & { providers: ProviderRow[] };

const SECTIONS = [
  { id: 'channel', label: 'Channel' },
  { id: 'brand', label: 'Brand voice' },
  { id: 'providers', label: 'AI providers' },
  { id: 'research', label: 'Research data' },
  { id: 'media', label: 'Voice & visuals' },
  { id: 'data', label: 'Data' },
] as const;

interface MediaConfig {
  image: { resolved: string; gemini: boolean; openai: boolean; pollinations: boolean };
  tts: { resolved: string | null; gemini: boolean; openai: boolean; elevenlabs: boolean };
  voices: string[];
  ffmpeg: { available: boolean };
  links: Record<string, string>;
}

export function SettingsPage() {
  const { push } = useToast();
  const { data, loading, reload } = useApi<{ settings: SettingsForm }>('/settings');
  const { data: mediaConfig, reload: reloadMedia } = useApi<MediaConfig>('/media/config');
  const [section, setSection] = useState<(typeof SECTIONS)[number]['id']>('providers');
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [sectionFlash, setSectionFlash] = useState(false);
  const [tests, setTests] = useState<Record<string, { ok: boolean; message: string; latencyMs: number }>>({});

  useEffect(() => {
    if (data?.settings) setForm(structuredClone(data.settings));
  }, [data?.settings]);

  // The sidebar "Manage keys" link asks for a specific card when Settings is already open.
  useEffect(() => {
    const jump = (event: Event) => {
      const wanted = (event as CustomEvent<string>).detail;
      if (SECTIONS.some((s) => s.id === wanted)) {
        setSection(wanted as (typeof SECTIONS)[number]['id']);
        setSectionFlash(true);
        window.setTimeout(() => setSectionFlash(false), 1200);
        window.setTimeout(() => document.getElementById(`section-${wanted}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      }
    };
    window.addEventListener('cp-settings-section', jump);
    return () => window.removeEventListener('cp-settings-section', jump);
  }, []);

  const save = async () => {
    if (!form) return;
    setBusy('save');
    try {
      await put('/settings', {
        channel: form.channel,
        brand: form.brand,
        research: form.research,
        providers: form.providers,
        media: form.media,
      });
      push('Settings saved', 'success');
      reload();
      reloadMedia();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not save settings', 'error');
    } finally {
      setBusy(null);
    }
  };

  const test = async (kind: 'text' | 'image' | 'tts', provider: string) => {
    const key = `${kind}-${provider}`;
    setBusy(`test-${key}`);
    try {
      const res =
        kind === 'text'
          ? await post<{ ok: boolean; message: string; latencyMs: number }>(`/providers/${provider}/test`)
          : await post<{ ok: boolean; message: string; latencyMs: number }>('/media/test', { kind, provider });
      setTests((t) => ({ ...t, [key]: res }));
      push(res.ok ? `${res.message} · ${res.latencyMs} ms` : res.message, res.ok ? 'success' : 'error');
    } catch (err) {
      push(err instanceof Error ? err.message : 'Test failed', 'error');
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    setBusy('reset');
    try {
      await post('/reset');
      push('Workspace cleared', 'success');
      reload();
    } finally {
      setBusy(null);
    }
  };

  if (loading && !form) return <div className="skeleton" style={{ height: 460 }} />;
  if (!form) return null;

  const textProvider = form.providers.find((p) => p.enabled && (p.apiKey?.length ?? 0) > 8);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 7 }}>System</div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Keys, channel identity and media providers. Everything stays on this machine in <code>data/store.json</code>.</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={reload}>Reload</Button>
          <Button variant="primary" icon={<Save size={14} />} onClick={save} loading={busy === 'save'}>Save changes</Button>
        </div>
      </div>

      <div className="settings-grid">
        <div className="settings-nav">
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? 'on' : ''} onClick={() => setSection(s.id)}>{s.label}</button>
          ))}
        </div>

        <div
          className="stack"
          id={`section-${section}`}
          style={sectionFlash ? { outline: '2px solid rgba(124,107,255,0.65)', outlineOffset: 8, borderRadius: 16, transition: 'outline 0.2s' } : { transition: 'outline 0.2s' }}
        >
          {section === 'channel' && (
            <>
              <Card title="Channel profile" subtitle="Used in every prompt and package">
                <div className="grid g-2" style={{ gap: 14 }}>
                  <Field label="Channel name"><input className="input" value={form.channel.name} onChange={(e) => setForm({ ...form, channel: { ...form.channel, name: e.target.value } })} /></Field>
                  <Field label="Handle"><input className="input" value={form.channel.handle} onChange={(e) => setForm({ ...form, channel: { ...form.channel, handle: e.target.value } })} /></Field>
                  <Field label="Niche"><input className="input" value={form.channel.niche} onChange={(e) => setForm({ ...form, channel: { ...form.channel, niche: e.target.value } })} /></Field>
                  <Field label="Language"><input className="input" value={form.channel.language} onChange={(e) => setForm({ ...form, channel: { ...form.channel, language: e.target.value } })} /></Field>
                  <Field label="Timezone"><input className="input" value={form.channel.timezone} onChange={(e) => setForm({ ...form, channel: { ...form.channel, timezone: e.target.value } })} /></Field>
                </div>
                <div style={{ marginTop: 14 }}>
                  <Field label="Audience" hint="One sentence about who you serve. Shapes hooks, pacing and titles.">
                    <textarea className="textarea" rows={3} value={form.channel.audience} onChange={(e) => setForm({ ...form, channel: { ...form.channel, audience: e.target.value } })} />
                  </Field>
                </div>
              </Card>
              <Card title="Setup status" subtitle="What the pipeline can do right now">
                <div className="stack" style={{ gap: 8, fontSize: 12 }}>
                  <Row ok={Boolean(textProvider)} label="Text model" value={textProvider?.label ?? 'add a provider key'} />
                  <Row ok={Boolean(form.research.youtubeApiKey)} label="YouTube Data API" value={form.research.youtubeApiKey ? 'connected' : 'add a key for real research'} />
                  <Row ok={Boolean(mediaConfig?.image.resolved)} label="Image provider" value={mediaConfig?.image.resolved ?? 'local art'} />
                  <Row ok={Boolean(mediaConfig?.tts.resolved)} label="Narration" value={mediaConfig?.tts.resolved ?? 'silent (no TTS key)'} />
                  <Row ok={Boolean(mediaConfig?.ffmpeg.available)} label="MP4 export" value={mediaConfig?.ffmpeg.available ? 'ffmpeg bundled' : 'ffmpeg missing'} />
                </div>
              </Card>
            </>
          )}

          {section === 'brand' && (
            <Card title="Voice and tone" subtitle="Injected into research synthesis, strategy, script and SEO">
              <Field label="Brand voice" hint="Be specific: sentence length, energy, words to avoid.">
                <textarea className="textarea" rows={4} value={form.brand.voice} onChange={(e) => setForm({ ...form, brand: { ...form.brand, voice: e.target.value } })} />
              </Field>
              <div className="grid g-2" style={{ gap: 14, marginTop: 14 }}>
                <Field label="Default tone">
                  <select className="select" value={form.brand.tone} onChange={(e) => setForm({ ...form, brand: { ...form.brand, tone: e.target.value } })}>
                    {['Analytical', 'Friendly expert', 'High energy', 'Documentary', 'Story-driven'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Palette" hint="Used by thumbnails and scene art">
                  <div className="row" style={{ gap: 6 }}>
                    {form.brand.palette.map((c, i) => (
                      <input key={i} type="color" value={c} onChange={(e) => { const palette = [...form.brand.palette]; palette[i] = e.target.value; setForm({ ...form, brand: { ...form.brand, palette } }); }} style={{ width: 44, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
                    ))}
                  </div>
                </Field>
                <Field label="Banned words" hint="Comma separated">
                  <input className="input" value={form.brand.bannedWords.join(', ')} onChange={(e) => setForm({ ...form, brand: { ...form.brand, bannedWords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })} />
                </Field>
                <Field label="Signature words" hint="Comma separated">
                  <input className="input" value={form.brand.keywords.join(', ')} onChange={(e) => setForm({ ...form, brand: { ...form.brand, keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })} />
                </Field>
              </div>
            </Card>
          )}

          {section === 'providers' && (
            <Card title="AI providers" subtitle="One working text provider is enough. Gemini's free tier covers research synthesis, strategy, script and SEO.">
              <div className="stack" style={{ gap: 12 }}>
                {form.providers.map((p) => (
                  <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 13, padding: 13, background: 'rgba(255,255,255,0.02)' }}>
                    <div className="row" style={{ gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: 'rgba(124,107,255,0.14)', border: '1px solid rgba(124,107,255,0.28)' }}>
                        <Server size={13} style={{ color: 'var(--violet-2)' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.label}</div>
                        <div className="faint" style={{ fontSize: 10.5 }}>{p.baseUrl}</div>
                      </div>
                      {p.hasKey && <Pill tone="green">key saved</Pill>}
                      <Toggle checked={p.enabled} onChange={(v) => setForm({ ...form, providers: form.providers.map((x) => (x.id === p.id ? { ...x, enabled: v } : x)) })} />
                    </div>
                    <div className="grid g-2" style={{ gap: 10 }}>
                      <Field label="API key">
                        <input
                          className="input"
                          type="password"
                          placeholder={p.hasKey ? '•••••••• (leave to keep)' : 'paste key'}
                          value={p.apiKey?.includes('••') ? '' : p.apiKey}
                          onChange={(e) => setForm({ ...form, providers: form.providers.map((x) => (x.id === p.id ? { ...x, apiKey: e.target.value } : x)) })}
                        />
                      </Field>
                      <Field
                        label="Model"
                        hint={
                          <span>
                            Type any model id. Suggested: {(MODEL_SUGGESTIONS[p.id] ?? []).slice(0, 2).join(' · ')}
                          </span>
                        }
                      >
                        <input
                          className="input"
                          list={`models-${p.id}`}
                          value={p.model}
                          onChange={(e) => setForm({ ...form, providers: form.providers.map((x) => (x.id === p.id ? { ...x, model: e.target.value } : x)) })}
                        />
                        <datalist id={`models-${p.id}`}>
                          {(MODEL_SUGGESTIONS[p.id] ?? []).map((m) => <option key={m} value={m} />)}
                        </datalist>
                      </Field>
                    </div>
                    <div className="row" style={{ gap: 8, marginTop: 10 }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Zap size={13} />}
                        onClick={() => test('text', p.id)}
                        loading={busy === `test-text-${p.id}`}
                        disabled={!p.apiKey && !p.hasKey}
                        title={!p.apiKey && !p.hasKey ? 'Add an API key for this provider first, then save' : 'Call the provider once to verify the key'}
                      >
                        Test connection
                      </Button>
                      {tests[`text-${p.id}`] && (
                        <span className="faint" style={{ fontSize: 11, color: tests[`text-${p.id}`].ok ? 'var(--green)' : 'var(--red)' }}>
                          {tests[`text-${p.id}`].ok ? <Check size={11} /> : <X size={11} />} {tests[`text-${p.id}`].message}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="faint" style={{ fontSize: 11 }}>Save before testing — tests use the stored key.</div>
              </div>
            </Card>
          )}

          {section === 'research' && (
            <Card title="Research data" subtitle="Real YouTube results power step 1. Without a key the researcher can only use text-model knowledge and Wikipedia.">
              <div className="grid g-2" style={{ gap: 14 }}>
                <Field
                  label="YouTube Data API key"
                  hint={<span>Free quota: 10,000 units/day. Create one in <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer" style={{ color: 'var(--violet-2)' }}>Google Cloud Console</a> → enable “YouTube Data API v3”.</span>}
                >
                  <input
                    className="input"
                    type="password"
                    placeholder={form.research.youtubeApiKey?.includes('••') ? '•••••••• (saved)' : 'AIza…'}
                    value={form.research.youtubeApiKey?.includes('••') ? '' : form.research.youtubeApiKey}
                    onChange={(e) => setForm({ ...form, research: { ...form.research, youtubeApiKey: e.target.value } })}
                  />
                </Field>
                <Field label="Results per query" hint="Each search costs 100 quota units; details cost 1.">
                  <input
                    className="input"
                    type="number"
                    min={5}
                    max={50}
                    value={form.research.resultLimit}
                    onChange={(e) => setForm({ ...form, research: { ...form.research, resultLimit: Number(e.target.value) } })}
                  />
                </Field>
                <Field label="Region">
                  <input className="input" value={form.research.region} onChange={(e) => setForm({ ...form, research: { ...form.research, region: e.target.value.toUpperCase() } })} />
                </Field>
                <Field label="Search language">
                  <input className="input" value={form.research.language} onChange={(e) => setForm({ ...form, research: { ...form.research, language: e.target.value } })} />
                </Field>
              </div>
              <div className="note" style={{ marginTop: 14, fontSize: 11.5 }}>
                <Search size={13} style={{ color: 'var(--violet-2)' }} />
                <div>Research returns the real videos, the measured title patterns, Wikipedia context and — when Gemini is enabled — cited web grounding. Nothing is generated from a template.</div>
              </div>
            </Card>
          )}

          {section === 'media' && (
            <>
              <Card
                title="Free providers for video & voice"
                subtitle="One Google AI Studio key covers scene images and narration."
                right={<Pill tone={mediaConfig?.ffmpeg.available ? 'green' : 'red'}>{mediaConfig?.ffmpeg.available ? 'ffmpeg ready' : 'ffmpeg missing'}</Pill>}
              >
                <div className="stack" style={{ gap: 14 }}>
                  <div style={{ border: '1px solid rgba(124,107,255,0.24)', borderRadius: 13, padding: 14, background: 'rgba(124,107,255,0.05)' }}>
                    <div className="row" style={{ gap: 9, marginBottom: 10 }}>
                      <Sparkles size={14} style={{ color: 'var(--violet-2)' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 650 }}>Google AI Studio · Gemini</div>
                        <div className="faint" style={{ fontSize: 11 }}>Free tier: image generation + text-to-speech. One key for both.</div>
                      </div>
                      {mediaConfig?.image.gemini ? <Pill tone="green">connected</Pill> : <Pill tone="amber">key needed</Pill>}
                    </div>
                    <div className="grid g-2" style={{ gap: 12 }}>
                      <Field label="Google API key" hint={<span>Create one at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--violet-2)' }}>aistudio.google.com/apikey</a></span>}>
                        <input
                          className="input"
                          type="password"
                          placeholder={form.media.geminiApiKey?.includes('••') ? '•••••••• (saved)' : 'AIza…'}
                          value={form.media.geminiApiKey?.includes('••') ? '' : form.media.geminiApiKey}
                          onChange={(e) => setForm({ ...form, media: { ...form.media, geminiApiKey: e.target.value } })}
                        />
                      </Field>
                      <Field label="Narration voice">
                        <select className="select" value={form.media.geminiVoice} onChange={(e) => setForm({ ...form, media: { ...form.media, geminiVoice: e.target.value } })}>
                          {(mediaConfig?.voices ?? ['Kore', 'Puck']).map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </Field>
                      <Field label="Image model"><input className="input" value={form.media.geminiImageModel} onChange={(e) => setForm({ ...form, media: { ...form.media, geminiImageModel: e.target.value } })} /></Field>
                      <Field label="Speech model"><input className="input" value={form.media.geminiTtsModel} onChange={(e) => setForm({ ...form, media: { ...form.media, geminiTtsModel: e.target.value } })} /></Field>
                    </div>
                    <div className="row" style={{ gap: 8, marginTop: 12 }}>
                      <Button size="sm" variant="ghost" icon={<ImageIcon size={13} />} onClick={() => test('image', 'gemini')} loading={busy === 'test-image-gemini'}>Test image</Button>
                      <Button size="sm" variant="ghost" icon={<Mic size={13} />} onClick={() => test('tts', 'gemini')} loading={busy === 'test-tts-gemini'}>Test voice</Button>
                      <span className="faint" style={{ fontSize: 10.5 }}>Save first — tests use the stored key.</span>
                    </div>
                    {['image-gemini', 'tts-gemini'].map((k) => tests[k] ? (
                      <div key={k} style={{ fontSize: 11.5, marginTop: 6, color: tests[k].ok ? 'var(--green)' : 'var(--red)' }}>
                        {tests[k].ok ? <Check size={11} /> : <X size={11} />} {k.startsWith('image') ? 'Image' : 'Voice'}: {tests[k].message}
                      </div>
                    ) : null)}
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: 13, padding: 14 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>Pollinations · free image fallback</div>
                    <div className="faint" style={{ fontSize: 10.5, marginTop: 2 }}>No key. Used automatically when no Google/OpenAI key exists; if the network is down the renderer falls back to studio art.</div>
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: 13, padding: 14 }}>
                    <div className="row" style={{ gap: 9, marginBottom: 10 }}>
                      <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>OpenAI · optional</div>
                      {mediaConfig?.image.openai ? <Pill tone="green">connected</Pill> : null}
                    </div>
                    <div className="grid g-2" style={{ gap: 12 }}>
                      <Field label="OpenAI key">
                        <input className="input" type="password" placeholder={form.media.openaiApiKey?.includes('••') ? '•••••••• (saved)' : 'sk-…'} value={form.media.openaiApiKey?.includes('••') ? '' : form.media.openaiApiKey} onChange={(e) => setForm({ ...form, media: { ...form.media, openaiApiKey: e.target.value } })} />
                      </Field>
                      <Field label="Voice"><input className="input" value={form.media.openaiVoice} onChange={(e) => setForm({ ...form, media: { ...form.media, openaiVoice: e.target.value } })} /></Field>
                      <Field label="Image model"><input className="input" value={form.media.openaiImageModel} onChange={(e) => setForm({ ...form, media: { ...form.media, openaiImageModel: e.target.value } })} /></Field>
                      <Field label="Speech model"><input className="input" value={form.media.openaiTtsModel} onChange={(e) => setForm({ ...form, media: { ...form.media, openaiTtsModel: e.target.value } })} /></Field>
                    </div>
                  </div>

                  <div className="grid g-2" style={{ gap: 14 }}>
                    <Field label="Default visual source">
                      <select className="select" value={form.media.imageProvider} onChange={(e) => setForm({ ...form, media: { ...form.media, imageProvider: e.target.value as Settings['media']['imageProvider'] } })}>
                        <option value="auto">Auto — best available</option>
                        <option value="gemini">Google AI Studio</option>
                        <option value="openai">OpenAI</option>
                        <option value="pollinations">Pollinations (free)</option>
                        <option value="local">Studio art (offline)</option>
                      </select>
                    </Field>
                    <Field label="Default narration">
                      <select className="select" value={form.media.ttsProvider} onChange={(e) => setForm({ ...form, media: { ...form.media, ttsProvider: e.target.value as Settings['media']['ttsProvider'] } })}>
                        <option value="auto">Auto — best available</option>
                        <option value="gemini">Google Gemini TTS</option>
                        <option value="openai">OpenAI TTS</option>
                        <option value="elevenlabs">ElevenLabs</option>
                        <option value="none">None — silent cuts</option>
                      </select>
                    </Field>
                    <Field label="Default aspect">
                      <select className="select" value={form.media.defaultAspect} onChange={(e) => setForm({ ...form, media: { ...form.media, defaultAspect: e.target.value as '16:9' | '9:16' } })}>
                        <option value="16:9">16:9 · long-form</option>
                        <option value="9:16">9:16 · Shorts</option>
                      </select>
                    </Field>
                    <Field label="Motion">
                      <select className="select" value={form.media.motion ? 'on' : 'off'} onChange={(e) => setForm({ ...form, media: { ...form.media, motion: e.target.value === 'on' } })}>
                        <option value="on">Slow Ken Burns zoom</option>
                        <option value="off">Static frames</option>
                      </select>
                    </Field>
                  </div>
                </div>
              </Card>

              <Card title="What the renderer does" subtitle="Honest view of the pipeline">
                <div className="stack" style={{ gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                  <div className="row" style={{ gap: 7 }}><Film size={13} style={{ color: 'var(--violet-2)' }} />Each scene becomes a still (AI image or studio art) with its own editable prompt.</div>
                  <div className="row" style={{ gap: 7 }}><Mic size={13} style={{ color: 'var(--violet-2)' }} />Narration is synthesized per scene and mixed under the visuals.</div>
                  <div className="row" style={{ gap: 7 }}><KeyRound size={13} style={{ color: 'var(--violet-2)' }} />Keys never leave this machine and are sent only to the provider you pick.</div>
                  <div className="row" style={{ gap: 7 }}><ShieldCheck size={13} style={{ color: 'var(--green)' }} />Export is a real H.264/AAC MP4 with an .srt sidecar.</div>
                </div>
              </Card>
            </>
          )}

          {section === 'data' && (
            <Card title="Local data" subtitle="No accounts, no analytics, no telemetry">
              <div className="stack" style={{ gap: 10, fontSize: 12, color: 'var(--text-2)' }}>
                <div className="row" style={{ gap: 8 }}><Database size={14} />Projects, jobs and settings live in <code>data/store.json</code>.</div>
                <div className="row" style={{ gap: 8 }}><Film size={14} />Rendered media lives in <code>data/media/&lt;project&gt;/</code>.</div>
                <div className="row" style={{ gap: 8 }}><Youtube size={14} />Publishing is not wired — export the MP4 and upload it yourself.</div>
              </div>
              <div className="row wrap" style={{ gap: 8, marginTop: 16 }}>
                {confirmReset ? (
                  <>
                    <Button variant="danger" icon={<Trash2 size={14} />} onClick={reset} loading={busy === 'reset'}>
                      Yes, delete everything
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmReset(false)} disabled={busy === 'reset'}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button variant="danger" icon={<Trash2 size={14} />} onClick={reset}>
                    Clear all projects &amp; renders
                  </Button>
                )}
              </div>
              <div className="note warn" style={{ marginTop: 14, fontSize: 11.5 }}>
                <Trash2 size={13} />
                <div>This deletes every project, job and rendered file. Your settings and keys are kept.</div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: ok ? 'var(--green)' : 'var(--amber)', flex: 'none' }} />
      <span style={{ flex: 1, color: 'var(--text)' }}>{label}</span>
      <span className="faint" style={{ fontSize: 11 }}>{value}</span>
    </div>
  );
}
