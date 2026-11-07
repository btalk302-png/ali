/**
 * Clicks every control on every page and reports which ones do nothing.
 * Usage: npx tsx scripts/ui-audit.tsx
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/' });
const g: any = globalThis;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.EventSource = class { addEventListener() {} close() {} };
g.IS_REACT_ACT_ENVIRONMENT = true;
g.URL.createObjectURL = () => 'blob:mock';
g.URL.revokeObjectURL = () => {};
g.confirm = () => true;
g.localStorage = dom.window.localStorage;
Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollIntoView', { value: () => {}, writable: true });

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react-dom/test-utils');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { ToastProvider, LiveProvider } = await import('../src/lib/context.tsx');
const { DEFAULT_SETTINGS } = await import('../server/defaults.ts');

const now = new Date().toISOString();
const research = {
  keyword: 'youtube retention',
  queries: ['youtube retention'],
  summary: 'Most videos explain retention tactics without a system.',
  videos: [{ videoId: 'v1', title: 'Why retention dies at 30 seconds', channel: 'Creator Lab', views: 184200, publishedAt: now, url: 'https://youtube.com/watch?v=v1' }],
  sources: [{ label: 'YouTube search', url: 'https://youtube.com/results?q=x', kind: 'youtube' }, { label: 'Wikipedia — Audience retention', url: 'https://en.wikipedia.org/wiki/Audience_retention', kind: 'wikipedia' }],
  insights: ['Numbered titles win.'],
  opportunities: [{ title: 'Fix the first 30 seconds', why: 'gap', searchInterest: 72, competition: 'low' }],
  titles: [
    { text: 'Why Your Retention Dies at 30 Seconds', angle: 'Problem', why: 'names the failure', score: 91, source: 'ai' },
    { text: '3 Retention Checkpoints', angle: 'List', why: 'concrete', score: 84, source: 'pattern' },
  ],
  selectedTitle: 'Why Your Retention Dies at 30 Seconds',
  providers: ['YouTube Data API', 'Google Gemini'],
  generatedAt: now,
};
const strategy = {
  bigIdea: 'Retention is a sequencing problem.', hookAngle: 'Open on the second viewers leave.', targetEmotion: 'relief',
  differentiators: ['shows the curve'], cta: 'Download the sheet.',
  outline: [{ id: 'o1', title: 'The cliff', purpose: 'show it', durationSec: 240 }],
  generatedAt: now,
};
const script = {
  title: research.selectedTitle, hook: 'Your retention problem starts in the first sentence.', intro: 'I looked at a hundred curves.',
  beats: [{ id: 'b1', title: 'The cliff', narration: 'Most creators blame the edit, but the cause is order.', bRollPrompt: 'retention curve', durationSec: 240 }],
  outro: 'Retention is designed before you record.', cta: 'Download the sheet.', wordCount: 420, wpm: 150, estimatedDurationSec: 480,
  fullText: 'Your retention problem starts in the first sentence.', generatedBy: 'Google Gemini',
};
const scenes = [
  { id: 'sc1', beatId: 'b1', title: 'Cold open', prompt: 'wide shot of a server room', composition: 'centered', durationSec: 6, transition: 'cut', narration: 'Most creators get this wrong.' },
  { id: 'sc2', beatId: 'b1', title: 'The system', prompt: 'diagram of three layers', composition: 'centered', durationSec: 8, transition: 'cut', narration: 'Here is the system.' },
];
const visuals = {
  palette: ['#0A0D16', '#5B4BDB', '#F5B544', '#FFFFFF'], style: 'Dark editorial', scenes,
  thumbnails: ['bold', 'glow', 'editorial', 'minimal'].map((variant, i) => ({ id: `t${i}`, headline: '30 SECONDS', subline: 'retention', composition: 'type left', palette: ['#0A0D16', '#5B4BDB', '#F5B544'], variant })),
  selectedThumbnailId: 't0', generatedBy: 'Google Gemini',
};
const seo = {
  titles: [{ text: research.selectedTitle, score: 88, reason: 'ideal length' }], selectedTitle: research.selectedTitle,
  description: 'Description text with chapters.', chapters: [{ time: '00:00', label: 'Intro' }, { time: '02:00', label: 'The cliff' }],
  tags: ['retention', 'youtube'], hashtags: ['growth'], score: 77,
  breakdown: [{ label: 'Title', score: 18, max: 20, note: 'good' }], searchIntent: 'fix retention', ctrPrediction: 7.4, generatedBy: 'Google Gemini',
};
const quality = {
  score: 82, blockers: [],
  checks: [{ id: 'q1', label: 'Research evidence attached', status: 'pass', detail: '2 sources' }],
  reviewedAt: now,
};

const makeProject = (overrides: Record<string, unknown> = {}) => ({
  id: 'prj_test', title: research.selectedTitle, topic: 'youtube retention', niche: 'creator systems', audience: 'solo creators',
  tone: 'Analytical', format: 'long', durationMin: 8, style: 'Cinematic', language: 'English', status: 'review',
  stages: Object.fromEntries(['research', 'strategy', 'script', 'visuals', 'seo', 'quality', 'export'].map((s) => [s, { id: s, status: 'done' }])),
  research, strategy, script, visuals, seo, quality,
  createdAt: now, updatedAt: now, ...overrides,
});

const projectReady = makeProject({ production: { status: 'ready', videoFile: 'prj_test/final.mp4', durationSec: 480, sizeBytes: 4949805, renderedAt: now, aspect: '16:9', withNarration: true, providerSummary: 'gemini visuals · gemini' } });
const projectEmpty = makeProject({ id: 'prj_empty', status: 'draft', research: undefined, strategy: undefined, script: undefined, visuals: undefined, seo: undefined, quality: undefined, stages: Object.fromEntries(['research', 'strategy', 'script', 'visuals', 'seo', 'quality', 'export'].map((s) => [s, { id: s, status: 'pending' }])) });

const mediaFixture = {
  production: projectReady.production, job: null, aspect: '16:9', overrides: {},
  settings: { geminiVoice: 'Kore', defaultAspect: '16:9', geminiImageModel: 'gemini-2.5-flash-image', geminiTtsModel: 'gemini-2.5-flash-preview-tts' },
  scenes: scenes.map((s, i) => ({ ...s, index: i, image: { status: 'ready', url: `/api/projects/prj_test/media/scene-${s.id}.jpg`, provider: 'gemini', updatedAt: now }, audio: { status: 'ready', url: `/api/projects/prj_test/media/scene-${s.id}.mp3`, provider: 'gemini', durationSec: 6, updatedAt: now } })),
  videoUrl: '/api/projects/prj_test/video', downloadUrl: '/api/projects/prj_test/download', captionsUrl: '/api/projects/prj_test/captions', posterUrl: '/api/projects/prj_test/media/poster.jpg',
};

const configFixture = {
  image: { resolved: 'gemini', gemini: true, openai: false, pollinations: true },
  tts: { resolved: 'gemini', gemini: true, openai: false, elevenlabs: false },
  voices: ['Kore', 'Puck'], ffmpeg: { available: true, path: '/x/ffmpeg' },
  links: { gemini: 'https://aistudio.google.com/apikey' },
};

const row = (p: any, progress: number, production: any) => ({
  id: p.id, title: p.title, topic: p.topic, status: p.status, format: p.format, durationMin: p.durationMin, niche: p.niche,
  thumbnail: p.visuals?.thumbnails?.[0]?.id, progress, quality: p.quality?.score ?? null, titles: p.research?.titles.length ?? 0,
  videos: p.research?.videos.length ?? 0, runtimeSec: p.script?.estimatedDurationSec ?? null, production,
  updatedAt: p.updatedAt, createdAt: p.createdAt,
  stages: Object.fromEntries(Object.entries(p.stages).map(([k, v]: any) => [k, v.status])),
});
const listFixture = {
  items: [
    row(projectReady, 100, { status: 'ready', durationSec: 480 }),
    row(makeProject({ id: 'prj_draft', status: 'draft', title: 'Draft idea' }), 0, null),
    row(makeProject({ id: 'prj_run', status: 'generating', title: 'Running idea' }), 40, null),
  ],
  counts: { all: 3, draft: 1, generating: 1, review: 0, ready: 1, failed: 0 },
};

const calls: { method: string; url: string }[] = [];
const respond = (url: string, method: string) => {
  if (url.includes('/media/config')) return configFixture;
  if (url.includes('/media/settings')) return { ok: true };
  if (url.includes('/media')) return mediaFixture;
  if (url.match(/\/projects\/prj_empty$/)) return { project: projectEmpty, job: null, summary: { stageProgress: 0, production: 'idle' } };
  if (url.match(/\/projects\/prj_test$/)) return { project: projectReady, job: null, summary: { stageProgress: 100, quality: 82, runtime: '8:00', runtimeSec: 480, scenes: 2, titles: 2, videos: 1, production: 'ready' } };
  if (url.includes('/projects?')) return listFixture;
  if (url.includes('/bootstrap')) return { channel: { name: 'The Signal Lab' }, brand: {}, settings: { status: { ready: true, textProvider: 'Google Gemini', youtube: true, ffmpeg: true, imageProvider: 'gemini', ttsProvider: 'gemini' } }, counts: { projects: 3, running: 1, ready: 1, rendered: 1 }, activity: [] };
  if (url.includes('/settings')) return { settings: structuredClone(DEFAULT_SETTINGS) };
  if (url.includes('/research')) return { research };
  if (url.includes('/export')) return { filename: 'package.md', markdown: '# package' };
  if (url.includes('/relay/')) return { relay: { providerLabel: 'Wikipedia article', kind: 'http', request: { url: 'https://en.wikipedia.org/api/rest_v1/page/summary/X', method: 'GET', headers: {}, body: '' } } };
  if (url.includes('/run') || url.includes('/regenerate') || method !== 'GET') return { ok: true, job: { id: 'job1', status: 'running' } };
  return { ok: true };
};

g.fetch = async (input: any, init?: any) => {
  const url = String(input);
  const method = String(init?.method ?? 'GET').toUpperCase();
  calls.push({ method, url });
  const body = respond(url, method);
  return {
    ok: true, status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    blob: async () => new dom.window.Blob(['x'], { type: 'video/mp4' }),
    headers: { get: () => 'attachment; filename="video.mp4"' },
  };
};

const { App } = await import('../src/App.tsx');
// Audit the real shell (Layout nav, new-project modal, routes), not a bare page.
const wrap = (_node: any, entry = '/projects/prj_test') => React.createElement(MemoryRouter, { initialEntries: [entry] }, React.createElement(App));

const labelOf = (el: any) => {
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  const icon = el.getAttribute('aria-label') || el.getAttribute('title') || '';
  return (text || icon || '(icon button)').slice(0, 46);
};

const results: { page: string; control: string; kind: string; outcome: string }[] = [];

async function auditPage(name: string, node: any, entry = '/projects/prj_test', tabSelector?: string, tabLabel?: string) {
  // discover controls (optionally after switching a tab)
  const probe = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(probe);
  const probeRoot = createRoot(probe);
  await act(async () => { probeRoot.render(wrap(node, entry)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 220)); });
  if (tabSelector) {
    const tab = Array.from(probe.querySelectorAll(tabSelector)).find((el: any) => (el.textContent || '').includes(tabLabel!)) as any;
    await act(async () => { tab?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 150)); });
  }
  const controls = Array.from(probe.querySelectorAll('button, a')) as any[];
  const labels = controls.map((el) => ({
    label: labelOf(el),
    tag: el.tagName.toLowerCase(),
    href: el.getAttribute('href'),
    disabled: el.disabled,
    active:
      /(^|\s)(active|on)(\s|$)/.test(el.className || '') ||
      el.getAttribute('aria-pressed') === 'true' ||
      el.getAttribute('aria-selected') === 'true',
  }));
  await act(async () => { probeRoot.unmount(); });
  probe.remove();

  for (const info of labels) {
    const host = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(wrap(node, entry)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 220)); });
    if (tabSelector) {
      const tab = Array.from(host.querySelectorAll(tabSelector)).find((el: any) => (el.textContent || '').includes(tabLabel!)) as any;
      await act(async () => { tab?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 150)); });
    }
    const target = (Array.from(host.querySelectorAll('button, a')) as any[]).find((el) => labelOf(el) === info.label && el.tagName.toLowerCase() === info.tag);
    if (!target) { results.push({ page: name + (tabLabel ? ` · ${tabLabel}` : ''), control: info.label, kind: info.tag, outcome: 'NOT FOUND ON RERENDER' }); await act(async () => root.unmount()); host.remove(); continue; }

    if (info.tag === 'button' && info.disabled) {
      const hint = target.getAttribute('title') || '';
      results.push({ page: name + (tabLabel ? ` · ${tabLabel}` : ''), control: info.label, kind: info.tag, outcome: `disabled${hint ? ` — ${hint.slice(0, 40)}` : ' — NO EXPLANATION'}` });
      await act(async () => root.unmount()); host.remove(); continue;
    }
    if (info.active && info.tag === 'button') {
      results.push({ page: name + (tabLabel ? ` · ${tabLabel}` : ''), control: info.label, kind: 'tab', outcome: 'already active' });
      await act(async () => root.unmount()); host.remove(); continue;
    }
    if (info.tag === 'a') {
      const current = info.href === entry || (info.href && entry.startsWith(info.href));
      results.push({
        page: name + (tabLabel ? ` · ${tabLabel}` : ''),
        control: info.label,
        kind: 'link',
        outcome: !info.href ? 'link with NO href' : current ? 'link (current page)' : `link → ${info.href}`,
      });
      await act(async () => root.unmount()); host.remove(); continue;
    }

    if (false) {
      results.push({ page: name + (tabLabel ? ` · ${tabLabel}` : ''), control: info.label, kind: 'tab', outcome: 'already active' });
      await act(async () => root.unmount()); host.remove(); continue;
    }

    // Type into empty fields so validation does not mask the real handler.
    for (const field of Array.from(host.querySelectorAll('input.input, textarea.textarea')) as any[]) {
      if (!field.value) {
        const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
        await act(async () => { setter.call(field, 'youtube retention'); field.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
      }
    }

    const before = host.innerHTML;
    calls.length = 0;
    await act(async () => {
      target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 320));
    });
    const after = host.innerHTML;
    const outcome = calls.length
      ? `${calls[0].method} ${calls[0].url.replace('http://localhost:3000/api', '')}${calls.length > 1 ? ` (+${calls.length - 1})` : ''}`
      : after !== before
        ? 'UI change only (no request)'
        : 'DEAD — nothing happened';
    results.push({ page: name + (tabLabel ? ` · ${tabLabel}` : ''), control: info.label, kind: info.tag, outcome });
    await act(async () => root.unmount());
    host.remove();
  }
}

const { Pipeline } = await import('../src/pages/Pipeline.tsx');
const { Workspace } = await import('../src/pages/Workspace.tsx');
const { TitleResearch } = await import('../src/pages/TitleResearch.tsx');
const { SettingsPage } = await import('../src/pages/Settings.tsx');

await auditPage('Pipeline', React.createElement(Pipeline), '/projects');
await auditPage('Title research', React.createElement(TitleResearch), '/research');
for (const tab of ['Research', 'Strategy', 'Script', 'Visuals', 'SEO', 'Quality', 'Production']) {
  await auditPage('Workspace', React.createElement(Workspace), '/projects/prj_test', 'button.tab', tab);
}
await auditPage('Workspace (empty)', React.createElement(Workspace), '/projects/prj_empty');
for (const section of ['Channel', 'Brand voice', 'AI providers', 'Research data', 'Voice & visuals', 'Data']) {
  await auditPage('Settings', React.createElement(SettingsPage), '/settings', '.settings-nav button', section);
}

const dead = results.filter((r) => r.outcome.startsWith('DEAD') || r.outcome.includes('NOT FOUND') || r.outcome.includes('NO EXPLANATION') || r.outcome.includes('NO href'));
console.log('\n=== control audit ===');
for (const r of results) console.log(`${r.outcome.startsWith('DEAD') || r.outcome.includes('NOT FOUND') || r.outcome.includes('NO EXPLANATION') ? 'FAIL' : 'ok  '} ${r.page.padEnd(28)} ${r.control.padEnd(48)} ${r.outcome}`);
console.log(`\n${results.length} controls · ${dead.length} need attention`);
