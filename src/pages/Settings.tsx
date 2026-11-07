import { useEffect, useState } from 'react';
import { Check, Database, KeyRound, Palette, RefreshCw, Save, Server, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { useApi, useToast } from '../lib/context';
import { get, post, put } from '../lib/api';
import { Button, Card, Field, Pill, Toggle } from '../components/ui';
import type { Settings } from '../../shared/types';

type ProviderRow = Settings['providers'][number] & { hasKey?: boolean };
type SettingsForm = Omit<Settings, 'providers'> & { providers: ProviderRow[] };

const SECTIONS = [
  { id: 'channel', label: 'Channel' },
  { id: 'brand', label: 'Brand voice' },
  { id: 'providers', label: 'AI providers' },
  { id: 'data', label: 'Data & privacy' },
] as const;

export function SettingsPage() {
  const { push } = useToast();
  const { data, loading, reload } = useApi<{ settings: SettingsForm }>('/settings');
  const [section, setSection] = useState<(typeof SECTIONS)[number]['id']>('channel');
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, { ok: boolean; message: string; latencyMs: number }>>({});

  useEffect(() => {
    if (data?.settings) setForm(structuredClone(data.settings));
  }, [data?.settings]);

  const save = async (patchBody: Partial<Settings> = {}) => {
    if (!form) return;
    setBusy('save');
    try {
      await put('/settings', {
        channel: form.channel,
        brand: form.brand,
        automation: form.automation,
        demoMode: form.demoMode,
        providers: form.providers,
        ...patchBody,
      });
      push('Settings saved', 'success');
      reload();
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not save settings', 'error');
    } finally {
      setBusy(null);
    }
  };

  const test = async (id: string) => {
    setBusy(`test-${id}`);
    try {
      const res = await post<{ ok: boolean; message: string; latencyMs: number }>(`/providers/${id}/test`);
      setTests((t) => ({ ...t, [id]: res }));
      push(res.ok ? res.message : res.message, res.ok ? 'success' : 'error');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Test failed';
      setTests((t) => ({ ...t, [id]: { ok: false, message, latencyMs: 0 } }));
      push(message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!window.confirm('Reset the workspace to the demo dataset? All current projects and analytics will be replaced.')) return;
    setBusy('reset');
    try {
      await post('/demo/reset');
      push('Workspace reset to the demo dataset', 'success');
      reload();
    } finally {
      setBusy(null);
    }
  };

  const backup = async () => {
    setBusy('backup');
    try {
      const projects = await get<unknown>('/projects');
      const blob = new Blob([JSON.stringify(projects, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'creatorpilot-workspace.json';
      a.click();
      URL.revokeObjectURL(url);
      push('Workspace backup downloaded', 'success');
    } finally {
      setBusy(null);
    }
  };

  if (loading && !form) return <div className="skeleton" style={{ height: 460 }} />;
  if (!form) return null;

  const activeProvider = form.providers.find((p) => p.enabled && (p.apiKey?.length ?? 0) > 8);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ marginBottom: 7 }}>System</div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Channel identity, brand voice, model providers and local data. Everything lives on this machine.</p>
        </div>
        <div className="page-actions">
          <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={reload}>Reload</Button>
          <Button variant="primary" icon={<Save size={14} />} onClick={() => save()} loading={busy === 'save'}>Save changes</Button>
        </div>
      </div>

      <div className="settings-grid">
        <div className="settings-nav">
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? 'on' : ''} onClick={() => setSection(s.id)}>{s.label}</button>
          ))}
        </div>

        <div className="stack">
          {section === 'channel' && (
            <>
              <Card title="Channel profile" subtitle="Used everywhere the studio writes copy">
                <div className="grid g-2" style={{ gap: 14 }}>
                  <Field label="Channel name"><input className="input" value={form.channel.name} onChange={(e) => setForm({ ...form, channel: { ...form.channel, name: e.target.value } })} /></Field>
                  <Field label="Handle"><input className="input" value={form.channel.handle} onChange={(e) => setForm({ ...form, channel: { ...form.channel, handle: e.target.value } })} /></Field>
                  <Field label="Niche" hint="Shapes research angles and keyword clusters">
                    <input className="input" value={form.channel.niche} onChange={(e) => setForm({ ...form, channel: { ...form.channel, niche: e.target.value } })} />
                  </Field>
                  <Field label="Language"><input className="input" value={form.channel.language} onChange={(e) => setForm({ ...form, channel: { ...form.channel, language: e.target.value } })} /></Field>
                </div>
                <div style={{ marginTop: 14 }}>
                  <Field label="Audience" hint="One sentence about who you serve. Guides hooks, pacing and CTAs.">
                    <textarea className="textarea" rows={3} value={form.channel.audience} onChange={(e) => setForm({ ...form, channel: { ...form.channel, audience: e.target.value } })} />
                  </Field>
                </div>
                <div className="grid g-2" style={{ gap: 14, marginTop: 14 }}>
                  <Field label="Timezone"><input className="input" value={form.channel.timezone} onChange={(e) => setForm({ ...form, channel: { ...form.channel, timezone: e.target.value } })} /></Field>
                  <div className="field">
                    <label>Account</label>
                    <div className="row" style={{ padding: '8px 0' }}>
                      <Pill tone="green"><span className="bullet" />Studio Pro · local</Pill>
                      <span className="faint" style={{ fontSize: 11 }}>No credit card, no cloud</span>
                    </div>
                  </div>
                </div>
              </Card>

              <Card title="Studio engine" subtitle="Demo mode is fully functional without any keys">
                <Toggle
                  checked={form.demoMode}
                  onChange={(v) => setForm({ ...form, demoMode: v })}
                  label={form.demoMode ? 'Demo engine' : `Live provider${activeProvider ? ` · ${activeProvider.label}` : ' (none configured)'}`}
                  hint={
                    form.demoMode
                      ? 'Deterministic local content engine. Great for exploring the workflow; not researched facts.'
                      : 'Calls your configured provider for research, scripts and SEO. Falls back to the demo engine if a call fails.'
                  }
                />
                <div className="note" style={{ marginTop: 12, fontSize: 11.5 }}>
                  <Zap size={13} style={{ color: 'var(--violet-2)' }} />
                  <div>
                    Mode is currently <b>{form.demoMode ? 'demo' : 'live'}</b> and applies to new pipeline runs. Existing artifacts keep their original engine label.
                  </div>
                </div>
              </Card>
            </>
          )}

          {section === 'brand' && (
            <>
              <Card title="Voice and tone" subtitle="Injected into every script and SEO prompt">
                <Field label="Brand voice" hint="Be specific: sentence length, energy, words to avoid.">
                  <textarea className="textarea" rows={4} value={form.brand.voice} onChange={(e) => setForm({ ...form, brand: { ...form.brand, voice: e.target.value } })} />
                </Field>
                <div className="grid g-2" style={{ gap: 14, marginTop: 14 }}>
                  <Field label="Default tone">
                    <select className="select" value={form.brand.tone} onChange={(e) => setForm({ ...form, brand: { ...form.brand, tone: e.target.value } })}>
                      {['Analytical', 'Friendly expert', 'High energy', 'Documentary', 'Story-driven'].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Palette" hint="Used by the thumbnail designer">
                    <div className="row" style={{ gap: 6 }}>
                      {form.brand.palette.map((c, i) => (
                        <input
                          key={i}
                          type="color"
                          value={c}
                          onChange={(e) => {
                            const palette = [...form.brand.palette];
                            palette[i] = e.target.value;
                            setForm({ ...form, brand: { ...form.brand, palette } });
                          }}
                          style={{ width: 44, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                        />
                      ))}
                    </div>
                  </Field>
                </div>
                <div className="grid g-2" style={{ gap: 14, marginTop: 14 }}>
                  <Field label="Signature words" hint="Comma separated">
                    <input className="input" value={form.brand.keywords.join(', ')} onChange={(e) => setForm({ ...form, brand: { ...form.brand, keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })} />
                  </Field>
                  <Field label="Banned words" hint="Never appears in titles, scripts or descriptions">
                    <input className="input" value={form.brand.bannedWords.join(', ')} onChange={(e) => setForm({ ...form, brand: { ...form.brand, bannedWords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })} />
                  </Field>
                </div>
              </Card>

              <Card title="Thumbnail language">
                <div className="grid g-2" style={{ gap: 14 }}>
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>Do</div>
                    <div className="stack" style={{ gap: 6 }}>
                      {['One idea per frame', 'Readable at 120px', 'Face or object + 2–4 words', 'High contrast against YouTube dark and light'].map((d) => (
                        <div key={d} className="row" style={{ gap: 7, fontSize: 12, color: 'var(--text-2)' }}><Check size={12} style={{ color: 'var(--green)' }} />{d}</div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>Don't</div>
                    <div className="stack" style={{ gap: 6 }}>
                      {['Paragraphs of text', 'Low-contrast gradients', 'Fake urgency arrows', 'The same face in every frame'].map((d) => (
                        <div key={d} className="row" style={{ gap: 7, fontSize: 12, color: 'var(--text-2)' }}><span style={{ color: 'var(--red)' }}>×</span>{d}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </>
          )}

          {section === 'providers' && (
            <>
              <Card title="Model providers" subtitle="Bring your own key. One text provider is enough.">
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
                            placeholder={p.hasKey ? '•••••••• (leave to keep)' : 'sk-…'}
                            value={p.apiKey?.includes('••') ? '' : p.apiKey}
                            onChange={(e) => setForm({ ...form, providers: form.providers.map((x) => (x.id === p.id ? { ...x, apiKey: e.target.value } : x)) })}
                          />
                        </Field>
                        <Field label="Model">
                          <input className="input" value={p.model} onChange={(e) => setForm({ ...form, providers: form.providers.map((x) => (x.id === p.id ? { ...x, model: e.target.value } : x)) })} />
                        </Field>
                      </div>
                      <div className="row" style={{ gap: 8, marginTop: 9 }}>
                        <Button size="sm" variant="ghost" icon={<KeyRound size={12} />} onClick={() => test(p.id)} loading={busy === `test-${p.id}`} disabled={!p.hasKey && (p.apiKey?.length ?? 0) < 9}>
                          Test connection
                        </Button>
                        {tests[p.id] && (
                          <span className="row" style={{ gap: 6, fontSize: 10.5, color: tests[p.id].ok ? 'var(--green)' : 'var(--red)' }}>
                            {tests[p.id].ok ? <Check size={11} /> : <span>×</span>}
                            {tests[p.id].message.slice(0, 90)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="note" style={{ marginTop: 14, fontSize: 11.5 }}>
                  <ShieldCheck size={13} style={{ color: 'var(--violet-2)' }} />
                  <div>Keys are stored only in <code>data/store.json</code> on this machine. They are never sent anywhere except the provider you choose.</div>
                </div>
              </Card>
              <Card title="How live mode behaves">
                <div className="stack" style={{ gap: 9 }}>
                  {[
                    'Research, strategy, script and SEO call the first enabled provider with a valid key.',
                    'Every response is validated. A malformed or failed call falls back to the demo engine so the pipeline never strands.',
                    'Visuals, thumbnails and the quality gate always run locally — image generation is intentionally out of scope.',
                    'Publishing is a dry run until YouTube OAuth is wired in.',
                  ].map((t) => (
                    <div key={t} className="row" style={{ gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55 }}>
                      <Check size={12} style={{ color: 'var(--green)', marginTop: 3, flex: 'none' }} />
                      {t}
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {section === 'data' && (
            <>
              <Card title="Local workspace" subtitle="Everything is stored in data/store.json">
                <div className="grid g-3" style={{ gap: 12 }}>
                  <div className="row" style={{ gap: 9 }}>
                    <Database size={15} style={{ color: 'var(--violet-2)' }} />
                    <div><div style={{ fontSize: 12, fontWeight: 600 }}>Local-first</div><div className="faint" style={{ fontSize: 10.5 }}>No telemetry</div></div>
                  </div>
                  <div className="row" style={{ gap: 9 }}>
                    <Palette size={15} style={{ color: 'var(--cyan)' }} />
                    <div><div style={{ fontSize: 12, fontWeight: 600 }}>Vector thumbnails</div><div className="faint" style={{ fontSize: 10.5 }}>1280×720 SVG</div></div>
                  </div>
                  <div className="row" style={{ gap: 9 }}>
                    <ShieldCheck size={15} style={{ color: 'var(--green)' }} />
                    <div><div style={{ fontSize: 12, fontWeight: 600 }}>Human approval</div><div className="faint" style={{ fontSize: 10.5 }}>Always on by default</div></div>
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 8, marginTop: 16 }}>
                  <Button icon={<Database size={14} />} onClick={backup} loading={busy === 'backup'}>Download backup</Button>
                  <Button variant="danger" icon={<Trash2 size={14} />} onClick={reset} loading={busy === 'reset'}>Reset demo workspace</Button>
                </div>
                <div className="note warn" style={{ marginTop: 14, fontSize: 11.5 }}>
                  <Trash2 size={13} />
                  <div>Reset deletes every project, comment and job in this workspace and reseeds the demo dataset. Downloaded packages are not affected.</div>
                </div>
              </Card>

              <Card title="About this build">
                <div className="kv"><span>Version</span><b>CreatorPilot Studio 1.0.0</b></div>
                <div className="kv"><span>Engine</span><b>{form.demoMode ? 'Demo (local)' : 'Live provider'}</b></div>
                <div className="kv"><span>Storage</span><b>data/store.json</b></div>
                <div className="kv"><span>Uploads</span><b>Dry run</b></div>
                <div className="kv"><span>License</span><b>MIT</b></div>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
