import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:3000/' });
const g: any = globalThis;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.EventSource = class {
  addEventListener() {}
  close() {}
  onerror: any = null;
};
g.IS_REACT_ACT_ENVIRONMENT = true;
const objectUrls: string[] = [];
g.URL.createObjectURL = (blob: any) => {
  objectUrls.push('blob:mock');
  return 'blob:mock';
};
g.URL.revokeObjectURL = () => {};
const fetchCalls: string[] = [];

const mediaFixture = {
  production: { status: 'ready', durationSec: 534.2, sizeBytes: 5552377, renderedAt: new Date(Date.now() - 600000).toISOString(), aspect: '16:9', withNarration: false, providerSummary: 'local visuals · silent' },
  job: { status: 'running', progress: 62, currentStage: 'Editing clip 4 of 10', logs: [{ t: '', level: 'info', msg: 'Clip 4 rendered' }] },
  aspect: '16:9',
  overrides: { voice: 'Puck' },
  settings: { geminiVoice: 'Kore', defaultAspect: '16:9', geminiImageModel: 'gemini-2.5-flash-image', geminiTtsModel: 'gemini-2.5-flash-preview-tts' },
  scenes: [
    { id: 'sc1', index: 0, title: 'Cold open', prompt: 'A wide shot of a server room', narration: 'Most creators get this wrong.', durationSec: 6,
      image: { status: 'ready', url: '/api/projects/prj_test/media/scene-sc1.jpg?v=1', provider: 'local', updatedAt: new Date().toISOString() },
      audio: { status: 'error', error: 'No narration provider configured.', updatedAt: new Date().toISOString() } },
    { id: 'sc2', index: 1, title: 'The system', prompt: 'Diagram of three layers', narration: 'Here is the system.', durationSec: 8,
      image: { status: 'ready', url: '/api/projects/prj_test/media/scene-sc2.jpg?v=1', provider: 'pollinations', updatedAt: new Date().toISOString() },
      audio: { status: 'ready', url: '/api/projects/prj_test/media/scene-sc2.mp3', provider: 'gemini', voice: 'Kore', durationSec: 7.4, updatedAt: new Date().toISOString() } },
  ],
  videoUrl: '/api/projects/prj_test/video',
  downloadUrl: '/api/projects/prj_test/download',
  captionsUrl: '/api/projects/prj_test/captions',
  posterUrl: '/api/projects/prj_test/media/poster.jpg',
};

const configFixture = {
  image: { resolved: 'pollinations', gemini: false, openai: false, pollinations: true },
  tts: { resolved: 'gemini', gemini: true, openai: false, elevenlabs: false },
  voices: ['Kore', 'Puck', 'Charon'],
  ffmpeg: { available: true, path: '/x/ffmpeg' },
  links: { gemini: 'https://aistudio.google.com/apikey', openai: 'https://openai.com', elevenlabs: 'https://elevenlabs.io', pollinations: 'https://pollinations.ai' },
};

g.fetch = async (input: any) => {
  const url = String(input);
  fetchCalls.push(url);
  const body = url.includes('/media/config')
    ? configFixture
    : url.includes('/download')
      ? { ok: true }
      : url.includes('/media')
        ? mediaFixture
        : { error: 'not found' };
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
    blob: async () => new dom.window.Blob(['fake-mp4-bytes'], { type: 'video/mp4' }),
    headers: { get: (name: string) => (name.toLowerCase() === 'content-disposition' ? 'attachment; filename="test-video.mp4"' : null) },
  };
};

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react-dom/test-utils');
const { MemoryRouter } = await import('react-router-dom');
const { ToastProvider, LiveProvider } = await import('../src/lib/context.tsx');
const { ProductionTab } = await import('../src/pages/ProductionTab.tsx');

const project = { id: 'prj_test', title: 'Test video', format: 'long', status: 'review' } as any;
const container = dom.window.document.getElementById('root')!;
const root = createRoot(container);
await act(async () => {
  root.render(
    React.createElement(MemoryRouter, null,
      React.createElement(ToastProvider, null,
        React.createElement(LiveProvider, null,
          React.createElement(ProductionTab, { project, onProjectReload: () => {} })))),
  );
});
await act(async () => { await new Promise((r) => setTimeout(r, 400)); });

// select the second clip and confirm the editor swaps to it
const clipButtons = Array.from(container.querySelectorAll('.clip')) as any[];
const secondClip = clipButtons.find((b) => (b.textContent || '').includes('The system'));
await act(async () => {
  secondClip?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
});
const text = container.textContent || '';
const promptValue = (container.querySelector('textarea') as any)?.value ?? '';
const checks: [string, boolean][] = [
  ['studio header', text.includes('Video studio')],
  ['timeline scenes', text.includes('Cold open') && text.includes('The system')],
  ['player', Boolean(container.querySelector('video'))],
  ['download button', text.includes('Download MP4')],
  ['clip editor', text.includes('Image prompt')],
  ['prompt textarea', Boolean(container.querySelector('textarea'))],
  ['prompt follows selected clip', promptValue.includes('Diagram of three layers')],
  ['voice audio', Boolean(container.querySelector('audio'))],
  ['render button', text.includes('Re-render video')],
  ['progress', text.includes('62%')],
  ['clip audio player', (container.querySelectorAll('audio').length >= 1)],
  ['regenerate buttons', text.includes('New visual from prompt') && text.includes('Re-voice')],
];
// download goes through fetch + blob (works inside the preview iframe, no popup/blank tab)
const downloadBtn = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Download MP4')) as any;
await act(async () => {
  downloadBtn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
});
checks.push(
  ['download: button rendered', Boolean(downloadBtn)],
  ['download: calls the mp4 endpoint', fetchCalls.some((u) => u.endsWith('/api/projects/prj_test/download'))],
  ['download: saves via blob url', objectUrls.length > 0],
  ['download: never opens a blank tab', !fetchCalls.some((u) => u.includes('undefined'))],
);

// ---------------------------------------------------------------- settings page
const { DEFAULT_SETTINGS } = await import('../server/defaults.ts');
const storeSettings = structuredClone(DEFAULT_SETTINGS);
g.fetch = async (input: any) => {
  const url = String(input);
  const body = url.includes('/media/config') ? configFixture : url.includes('/settings') ? { settings: storeSettings } : { error: 'not found' };
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
};

const { SettingsPage } = await import('../src/pages/Settings').then((m) => ({ SettingsPage: m.SettingsPage }));
const container2 = dom.window.document.createElement('div');
dom.window.document.body.appendChild(container2);
const root2 = createRoot(container2);
await act(async () => {
  root2.render(React.createElement(MemoryRouter, null, React.createElement(ToastProvider, null, React.createElement(LiveProvider, null, React.createElement(SettingsPage)))));
});
await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
const mediaNav = Array.from(container2.querySelectorAll('.settings-nav button')).find((b) => (b.textContent || '').includes('Voice & visuals')) as any;
await act(async () => {
  mediaNav?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
});
const settingsText = container2.textContent || '';
const settingsChecks: [string, boolean][] = [
  ['settings nav', Boolean(mediaNav)],
  ['free provider card', settingsText.includes('Free providers for video & voice')],
  ['gemini key field', Boolean(Array.from(container2.querySelectorAll('input[type=password]')).length)],
  ['default source select', settingsText.includes('Default visual source')],
  ['render explanation', settingsText.includes('What the renderer does')],
];
for (const [name, ok] of settingsChecks) console.log(`${ok ? 'PASS' : 'FAIL'} settings: ${name}`);
checks.push(...settingsChecks);


// ---------------------------------------------------------------- title research page
const researchFixture = {
  keyword: 'youtube retention',
  queries: ['youtube retention'],
  summary: 'Most videos explain retention tactics without sequencing. The gap is a measurable checkpoint system.',
  videos: [
    { videoId: 'abc123', title: 'Why retention dies at 30 seconds', channel: 'Creator Lab', views: 184200, publishedAt: '2025-06-01T00:00:00Z', url: 'https://youtube.com/watch?v=abc123', outlier: true },
    { videoId: 'def456', title: 'The retention curve explained', channel: 'Edit Better', views: 92100, publishedAt: '2025-08-11T00:00:00Z', url: 'https://youtube.com/watch?v=def456' },
  ],
  sources: [
    { label: 'YouTube search — youtube retention', url: 'https://youtube.com/results?search_query=youtube+retention', kind: 'youtube' },
    { label: 'Wikipedia — Audience retention', url: 'https://en.wikipedia.org/wiki/Audience_retention', kind: 'wikipedia' },
    { label: 'Creator Lab — retention study', url: 'https://example.com/study', kind: 'web' },
  ],
  insights: ['Numbered titles outperform in this set.', 'Nobody names the first 30 seconds.'],
  opportunities: [{ title: 'Fix the first 30 seconds', why: 'Underserved angle', searchInterest: 72, competition: 'low' }],
  titles: [
    { text: 'Why Your Retention Dies at 30 Seconds', angle: 'Problem', why: 'names the failure moment', score: 91, source: 'ai' },
    { text: '3 Retention Checkpoints That Actually Work', angle: 'List', why: 'concrete number', score: 84, source: 'pattern' },
  ],
  selectedTitle: 'Why Your Retention Dies at 30 Seconds',
  providers: ['YouTube Data API', 'OpenAI'],
  generatedAt: new Date().toISOString(),
};

const bootstrapFixture = {
  channel: { name: 'The Signal Lab', handle: '@thesignallab', niche: 'creator systems' },
  brand: { voice: 'calm', tone: 'Analytical' },
  settings: { status: { textProvider: 'OpenAI', youtube: true, ffmpeg: true, imageProvider: 'pollinations', ttsProvider: 'gemini', ready: true } },
  counts: { projects: 1, running: 0, ready: 1, rendered: 0 },
  activity: [],
};

g.fetch = async (input: any) => {
  const url = String(input);
  const body = url.includes('/media/config')
    ? configFixture
    : url.includes('/bootstrap')
      ? bootstrapFixture
      : /\/api\/research$/.test(url)
        ? { research: researchFixture }
        : { error: 'not found' };
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
};

const { TitleResearch } = await import('../src/pages/TitleResearch');
const container3 = dom.window.document.createElement('div');
dom.window.document.body.appendChild(container3);
const root3 = createRoot(container3);
await act(async () => {
  root3.render(React.createElement(MemoryRouter, null, React.createElement(ToastProvider, null, React.createElement(LiveProvider, null, React.createElement(TitleResearch)))));
});
await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
const searchInput = container3.querySelector('input.input') as any;
const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!;
await act(async () => {
  setter.call(searchInput, 'youtube retention');
  searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});
const researchBtn = Array.from(container3.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Research titles')) as any;
await act(async () => {
  researchBtn?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
});
const researchText = container3.textContent || '';
checks.push(
  ['research: input + action', Boolean(searchInput) && Boolean(researchBtn)],
  ['research: results render', researchText.includes('Opportunity read') && researchText.includes('Title options')],
  ['research: real video row', researchText.includes('Why retention dies at 30 seconds')],
  ['research: create project cta', researchText.includes('Create project')],
);

// ---------------------------------------------------------------- workspace
const now = new Date().toISOString();
const workspaceFixture = {
  project: {
    id: 'prj_test',
    title: 'Why Your Retention Dies at 30 Seconds',
    topic: 'youtube retention',
    niche: 'creator systems',
    audience: 'solo creators',
    tone: 'Analytical',
    format: 'long',
    durationMin: 8,
    style: 'Cinematic',
    language: 'English',
    status: 'review',
    stages: Object.fromEntries(['research', 'strategy', 'script', 'visuals', 'seo', 'quality', 'export'].map((s) => [s, { id: s, status: 'done' }])),
    research: researchFixture,
    strategy: {
      bigIdea: 'Retention is a sequencing problem.',
      hookAngle: 'Open on the exact second viewers leave.',
      targetEmotion: 'relief',
      differentiators: ['shows the curve', 'gives checkpoints'],
      outline: [{ id: 'o1', title: 'The cliff', purpose: 'show the drop', durationSec: 90 }, { id: 'o2', title: 'The fix', purpose: 'teach it', durationSec: 150 }],
      cta: 'Download the sheet.',
      generatedAt: now,
    },
    script: {
      title: 'Why Your Retention Dies at 30 Seconds',
      hook: 'Your retention problem starts in the first sentence.',
      intro: 'I looked at a hundred curves.',
      beats: [
        { id: 'b1', title: 'The cliff', narration: 'Most creators blame the edit. The real cause is order.', bRollPrompt: 'retention curve', durationSec: 90 },
        { id: 'b2', title: 'The fix', narration: 'Name the cost, then the cause, then the proof.', bRollPrompt: 'script edits', durationSec: 150 },
      ],
      outro: 'Retention is designed before you record.',
      cta: 'Download the sheet.',
      wordCount: 420,
      wpm: 150,
      estimatedDurationSec: 480,
      fullText: 'Your retention problem starts in the first sentence.',
      generatedBy: 'OpenAI',
    },
    visuals: { palette: ['#0A0D16', '#5B4BDB', '#F5B544', '#fff'], style: 'Dark editorial', scenes: mediaFixture.scenes.map((sc: any) => ({ ...sc, prompt: sc.prompt ?? 'scene', composition: 'center', transition: 'cut' })), thumbnails: [], selectedThumbnailId: undefined, generatedBy: 'OpenAI' },
    seo: {
      titles: [{ text: 'Why Your Retention Dies at 30 Seconds', score: 88, reason: 'ideal length' }],
      selectedTitle: 'Why Your Retention Dies at 30 Seconds',
      description: 'Description text.',
      chapters: [{ time: '00:00', label: 'Intro' }],
      tags: ['retention', 'youtube'],
      hashtags: ['youtube'],
      score: 77,
      breakdown: [{ label: 'Title', score: 18, max: 20, note: 'good' }],
      searchIntent: 'fix retention',
      ctrPrediction: 7.4,
      generatedBy: 'OpenAI',
    },
    quality: { score: 82, checks: [{ id: 'q1', label: 'Research evidence attached', status: 'pass', detail: '4 sources' }], blockers: [], reviewedAt: now },
    createdAt: now,
    updatedAt: now,
  },
  job: null,
  summary: { stageProgress: 100, quality: 82, runtime: '8:00', runtimeSec: 480, scenes: 2, titles: 2, videos: 2, production: 'idle' },
};

g.fetch = async (input: any) => {
  const url = String(input);
  const body = url.match(/\/api\/projects\/prj_test$/)
    ? workspaceFixture
    : url.includes('/media/config')
      ? configFixture
      : url.includes('/bootstrap')
        ? bootstrapFixture
        : { error: 'not found' };
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
};

const { Workspace } = await import('../src/pages/Workspace');
const { Routes, Route } = await import('react-router-dom');
const container4 = dom.window.document.createElement('div');
dom.window.document.body.appendChild(container4);
const root4 = createRoot(container4);
await act(async () => {
  root4.render(
    React.createElement(MemoryRouter, { initialEntries: ['/projects/prj_test'] },
      React.createElement(ToastProvider, null,
        React.createElement(LiveProvider, null,
          React.createElement(Routes, null,
            React.createElement(Route, { path: '/projects/:id', element: React.createElement(Workspace) }))))),
  );
});
await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
const workspaceText = container4.textContent || '';
const scriptTab = Array.from(container4.querySelectorAll('button.tab')).find((b) => (b.textContent || '').includes('Script')) as any;
await act(async () => {
  scriptTab?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 150));
});
const scriptText = container4.textContent || '';
checks.push(
  ['workspace: title + stages', workspaceText.includes('Why Your Retention Dies at 30 Seconds') && Boolean(container4.querySelectorAll('.stage-node').length >= 7)],
  ['workspace: research tab', workspaceText.includes('Opportunity read')],
  ['workspace: stage tabs', Boolean(scriptTab)],
  ['workspace: script tab content', scriptText.includes('The cliff') && scriptText.includes('Copy script')],
);

for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
const failed = checks.filter(([, ok]) => !ok).length;
console.log(failed === 0 ? '\nUI SMOKE OK (' + checks.length + ' checks)' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
