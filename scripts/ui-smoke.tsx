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
  const body = url.includes('/media/config') ? configFixture : url.includes('/media') ? mediaFixture : { error: 'not found' };
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
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
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
// ---------------------------------------------------------------- settings page
const storeSettings = (await import('../data/store.json', { with: { type: 'json' } })).default.settings;
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

const failed = checks.filter(([, ok]) => !ok).length;
console.log(failed === 0 ? '\nUI SMOKE OK' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
