import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import type { Project, Settings, StageId } from '../shared/types.js';
import { getDb, initStore, logActivity, resetStore, save } from './store.js';
import {
  STAGE_LABELS,
  STAGE_ORDER,
  bus,
  createProject,
  emptyStages,
  exportPackage,
  resetStage,
  runPipeline,
  startPipelineJob,
  summarizeProject,
} from './pipeline.js';
import { runResearch } from './research.js';
import { evaluateQuality } from './quality.js';
import { thumbnailSvg } from './thumbnails.js';
import { testProvider } from './ai.js';
import { clamp, round, slug } from './util.js';
import {
  absoluteMedia,
  createMediaJob,
  finishJob,
  generateAllImages,
  generateAllSpeech,
  generateSceneImage,
  generateSceneSpeech,
  mediaPayload,
  mediaBus,
  projectDir,
  renderProject,
} from './media/service.js';
import { mediaReadiness, testMediaProvider } from './media/providers.js';
import { ffmpegAvailable, FFMPEG } from './media/ffmpeg.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const MASK = '••••••••';

initStore();
const app = express();
app.use(express.json({ limit: '8mb' }));

function publicSettings(s: Settings) {
  const maskKey = (key: string) => (key ? `${MASK}${key.slice(-4)}` : '');
  const readiness = mediaReadiness(s);
  const textProvider = s.providers.find((p) => p.enabled && p.apiKey.trim().length > 8);
  return {
    ...s,
    research: { ...s.research, youtubeApiKey: maskKey(s.research.youtubeApiKey) },
    media: {
      ...s.media,
      geminiApiKey: maskKey(s.media.geminiApiKey),
      openaiApiKey: maskKey(s.media.openaiApiKey),
      elevenLabsApiKey: maskKey(s.media.elevenLabsApiKey),
    },
    providers: s.providers.map((p) => ({
      ...p,
      apiKey: p.apiKey ? `${MASK}${p.apiKey.slice(-4)}` : '',
      hasKey: Boolean(p.apiKey),
    })),
    status: {
      textProvider: textProvider ? textProvider.label : null,
      youtube: Boolean(s.research.youtubeApiKey || process.env.YOUTUBE_API_KEY),
      ffmpeg: ffmpegAvailable(),
      imageProvider: readiness.image.resolved,
      ttsProvider: readiness.tts.resolved,
      ready: Boolean(textProvider) && ffmpegAvailable(),
    },
  };
}

function findProject(id: string): Project | undefined {
  return getDb().projects.find((p) => p.id === id);
}

function projectRow(p: Project) {
  return {
    id: p.id,
    title: p.title,
    topic: p.topic,
    status: p.status,
    format: p.format,
    durationMin: p.durationMin,
    niche: p.niche,
    thumbnail: p.visuals?.selectedThumbnailId ?? p.visuals?.thumbnails[0]?.id,
    progress: summarizeProject(p).stageProgress,
    quality: p.quality?.score ?? null,
    titles: p.research?.titles.length ?? 0,
    videos: p.research?.videos.length ?? 0,
    runtimeSec: p.script?.estimatedDurationSec ?? null,
    production: p.production?.status === 'ready' ? { status: 'ready', durationSec: p.production.durationSec ?? 0 } : null,
    updatedAt: p.updatedAt,
    createdAt: p.createdAt,
    stages: Object.fromEntries(STAGE_ORDER.map((s) => [s, p.stages[s].status])),
  };
}

/* ------------------------------------------------------------------ bootstrap */
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, ffmpeg: ffmpegAvailable(), projects: getDb().projects.length, time: new Date().toISOString() }),
);

app.get('/api/bootstrap', (_req, res) => {
  const db = getDb();
  res.json({
    channel: db.settings.channel,
    brand: db.settings.brand,
    settings: publicSettings(db.settings),
    counts: {
      projects: db.projects.length,
      running: db.projects.filter((p) => p.status === 'generating').length,
      ready: db.projects.filter((p) => p.status === 'ready').length,
      rendered: db.projects.filter((p) => p.production?.status === 'ready').length,
    },
    activity: db.activity.slice(0, 8),
  });
});

/* ------------------------------------------------------------------ projects */
app.get('/api/projects', (req, res) => {
  const db = getDb();
  const status = String(req.query.status ?? 'all');
  const q = String(req.query.q ?? '').toLowerCase();
  let items = db.projects;
  if (status !== 'all') items = items.filter((p) => p.status === status);
  if (q) items = items.filter((p) => `${p.title} ${p.topic} ${p.niche}`.toLowerCase().includes(q));
  res.json({
    items: items.map(projectRow),
    counts: {
      all: db.projects.length,
      draft: db.projects.filter((p) => p.status === 'draft').length,
      generating: db.projects.filter((p) => p.status === 'generating').length,
      review: db.projects.filter((p) => p.status === 'review').length,
      ready: db.projects.filter((p) => p.status === 'ready').length,
      failed: db.projects.filter((p) => p.status === 'failed').length,
    },
  });
});

app.post('/api/projects', (req, res) => {
  const body = req.body ?? {};
  const topic = String(body.topic ?? '').trim();
  if (topic.length < 3) return res.status(400).json({ error: 'Give the project a topic of at least 3 characters.' });
  try {
    const project = createProject({
      topic,
      title: body.title,
      niche: body.niche,
      audience: body.audience,
      tone: body.tone,
      format: body.format,
      durationMin: body.durationMin,
      style: body.style,
      research: body.research,
    });
    res.status(201).json({ project, summary: summarizeProject(project) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Could not create project' });
  }
});

app.get('/api/projects/:id', (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const db = getDb();
  res.json({
    project: p,
    job: db.jobs.find((j) => j.projectId === p.id && j.status === 'running') ?? db.jobs.find((j) => j.projectId === p.id) ?? null,
    summary: summarizeProject(p),
    stages: STAGE_ORDER.map((id) => ({ ...p.stages[id], id, label: STAGE_LABELS[id] })),
  });
});

app.patch('/api/projects/:id', (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const body = req.body ?? {};
  if (typeof body.title === 'string' && body.title.trim()) {
    p.title = body.title.trim();
    if (p.seo) p.seo.selectedTitle = p.title;
  }
  if (typeof body.topic === 'string' && body.topic.trim()) p.topic = body.topic.trim();
  if (body.format === 'long' || body.format === 'short') p.format = body.format;
  if (typeof body.durationMin === 'number') p.durationMin = Math.max(1, Math.min(60, Math.round(body.durationMin)));
  if (body.selectedTitle && p.research) {
    p.research.selectedTitle = String(body.selectedTitle);
    p.title = String(body.selectedTitle);
    if (p.seo) p.seo.selectedTitle = p.title;
    if (p.script) p.script.title = p.title;
  }
  if (body.beats && p.script) {
    p.script.beats = body.beats;
    p.script.fullText = [p.script.hook, p.script.intro, ...p.script.beats.map((b: any) => b.narration), p.script.outro, p.script.cta].filter(Boolean).join('\n\n');
    p.script.wordCount = p.script.fullText.trim().split(/\s+/).filter(Boolean).length;
    p.script.estimatedDurationSec = Math.round((p.script.wordCount / p.script.wpm) * 60);
    p.quality = evaluateQuality(p);
  }
  if (body.seo) {
    p.seo = { ...(p.seo ?? ({} as any)), ...body.seo };
  }
  if (body.selectedThumbnailId && p.visuals) p.visuals.selectedThumbnailId = String(body.selectedThumbnailId);
  p.updatedAt = new Date().toISOString();
  save();
  bus.emit('update', { projectId: p.id });
  res.json({ project: p, summary: summarizeProject(p) });
});

app.delete('/api/projects/:id', (req, res) => {
  const db = getDb();
  const before = db.projects.length;
  db.projects = db.projects.filter((p) => p.id !== req.params.id);
  db.jobs = db.jobs.filter((j) => j.projectId !== req.params.id);
  try {
    fs.rmSync(path.join(process.cwd(), 'data', 'media', req.params.id), { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  save();
  res.json({ deleted: before !== db.projects.length });
});

app.post('/api/projects/:id/run', (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const fromStage = req.body?.fromStage as StageId | undefined;
  if (fromStage && !STAGE_ORDER.includes(fromStage)) return res.status(400).json({ error: 'Unknown stage' });
  try {
    const job = startPipelineJob(p.id, fromStage ? { fromStage } : {});
    res.status(202).json({ job });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Could not start job' });
  }
});

app.post('/api/projects/:id/stage/:stage/regenerate', (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const stage = req.params.stage as StageId;
  if (!STAGE_ORDER.includes(stage)) return res.status(400).json({ error: 'Unknown stage' });
  if (getDb().jobs.some((j) => j.projectId === p.id && j.status === 'running')) {
    return res.status(409).json({ error: 'A job is already running for this project' });
  }
  try {
    resetStage(p, stage);
    save();
    const job = startPipelineJob(p.id, { fromStage: stage });
    res.status(202).json({ job });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Could not regenerate stage' });
  }
});

app.get('/api/projects/:id/export', (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  res.json(exportPackage(p));
});

app.get('/api/projects/:id/thumbnail/:tid.svg', (req, res) => {
  const p = findProject(req.params.id);
  if (!p?.visuals) return res.status(404).send('Not found');
  const concept = p.visuals.thumbnails.find((t) => t.id === req.params.tid);
  if (!concept) return res.status(404).send('Not found');
  const episode = String(getDb().projects.findIndex((x) => x.id === p.id) + 1).padStart(2, '0');
  res.type('image/svg+xml').send(thumbnailSvg(concept, { channel: getDb().settings.channel.name, episode }));
});

/* ------------------------------------------------------------------ title research */
app.post('/api/research', async (req, res) => {
  const keyword = String(req.body?.keyword ?? '').trim();
  if (keyword.length < 3) return res.status(400).json({ error: 'Enter at least 3 characters.' });
  try {
    const research = await runResearch(getDb().settings, { keyword, limit: req.body?.limit });
    logActivity('search', `Researched “${keyword}”`, { meta: `${research.videos.length} videos · ${research.sources.length} sources` });
    res.json({ research });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Research failed' });
  }
});
// ---------------------------------------------------------------- media studio (images, voice, video)
function mediaProject(req: express.Request, res: express.Response): Project | undefined {
  const project = findProject(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return undefined;
  }
  return project;
}

function startMediaJob(project: Project, label: string, fn: (job: ReturnType<typeof createMediaJob>) => Promise<unknown>) {
  const running = getDb().jobs.find((j) => j.projectId === project.id && j.kind === 'media' && j.status === 'running');
  if (running) throw new Error('A media job is already running for this project.');
  const job = createMediaJob(project.id, label);
  void (async () => {
    try {
      await fn(job);
      finishJob(job, 'done');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Media job failed';
      finishJob(job, 'failed', message);
      if (project.production) {
        project.production.status = 'failed';
        project.production.error = message;
        save();
      }
      console.error('[media]', message);
    }
    bus.emit('update', { projectId: project.id });
  })();
  return job;
}

app.get('/api/media/config', (_req, res) => {
  const settings = getDb().settings;
  const readiness = mediaReadiness(settings);
  res.json({
    ...readiness,
    ffmpeg: { available: ffmpegAvailable(), path: FFMPEG },
    providers: {
      images: ['gemini', 'openai', 'pollinations', 'local'],
      tts: ['gemini', 'openai', 'elevenlabs', 'none'],
    },
    links: {
      gemini: 'https://aistudio.google.com/apikey',
      openai: 'https://platform.openai.com/api-keys',
      elevenlabs: 'https://elevenlabs.io/app/settings/api-keys',
      pollinations: 'https://pollinations.ai',
    },
  });
});

app.get('/api/projects/:id/media', (req, res) => {
  const project = mediaProject(req, res);
  if (!project) return;
  res.json(mediaPayload(project));
});

app.put('/api/projects/:id/media/settings', (req, res) => {
  const project = mediaProject(req, res);
  if (!project) return;
  const body = req.body ?? {};
  const next = { ...(project.media ?? {}) };
  if (['auto', 'local', 'gemini', 'openai', 'pollinations'].includes(body.imageProvider)) next.imageProvider = body.imageProvider;
  if (['auto', 'gemini', 'elevenlabs', 'openai', 'none'].includes(body.ttsProvider)) next.ttsProvider = body.ttsProvider;
  if (typeof body.voice === 'string') next.voice = body.voice;
  if (body.aspect === '16:9' || body.aspect === '9:16') next.aspect = body.aspect;
  if (typeof body.motion === 'boolean') next.motion = body.motion;
  project.media = next;
  project.updatedAt = new Date().toISOString();
  save();
  bus.emit('update', { projectId: project.id });
  res.json({ project, media: mediaPayload(project) });
});

app.post('/api/projects/:id/media/images', (req, res) => {
  const project = mediaProject(req, res);
  if (!project) return;
  const onlyMissing = req.body?.onlyMissing !== false;
  try {
    const job = startMediaJob(project, 'Generating visuals', (j) => generateAllImages(project, j, onlyMissing));
    res.status(202).json({ job });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Could not start job' });
  }
});

app.post('/api/projects/:id/media/voice', (req, res) => {
  const project = mediaProject(req, res);
  if (!project) return;
  try {
    const job = startMediaJob(project, 'Generating narration', (j) => generateAllSpeech(project, j));
    res.status(202).json({ job });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Could not start job' });
  }
});

app.post('/api/projects/:id/media/render', (req, res) => {
  const project = mediaProject(req, res);
  if (!project) return;
  if (!ffmpegAvailable()) return res.status(503).json({ error: 'ffmpeg is not installed on this server.' });
  try {
    const job = startMediaJob(project, 'Rendering video', (j) => renderProject(project, j));
    res.status(202).json({ job });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Could not start render' });
  }
});

app.post('/api/media/test', async (req, res) => {
  const { kind, provider } = req.body ?? {};
  if (kind !== 'image' && kind !== 'tts') return res.status(400).json({ error: 'kind must be image or tts' });
  const result = await testMediaProvider(getDb().settings, kind, String(provider ?? ''));
  res.status(result.ok ? 200 : 502).json(result);
});

app.post('/api/projects/:id/scenes/:sceneId/regenerate', async (req, res) => {
  const project = mediaProject(req, res);
  if (!project) return;
  const scenes = project.visuals?.scenes ?? [];
  const index = scenes.findIndex((s) => s.id === req.params.sceneId);
  if (index < 0) return res.status(404).json({ error: 'Scene not found' });
  const scene = scenes[index];
  const body = req.body ?? {};
  if (typeof body.prompt === 'string' && body.prompt.trim()) scene.prompt = body.prompt.trim();
  if (typeof body.narration === 'string') scene.narration = body.narration.trim();
  const wantImage = body.image !== false;
  const wantVoice = body.voice === true;
  try {
    const image = wantImage ? await generateSceneImage(project, scene, index, { force: true }) : undefined;
    const voice = wantVoice ? await generateSceneSpeech(project, scene, index, {}) : undefined;
    project.updatedAt = new Date().toISOString();
    save();
    bus.emit('update', { projectId: project.id });
    res.json({ scene: mediaPayload(project).scenes[index], image, voice });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Regeneration failed' });
  }
});

app.patch('/api/projects/:id/scenes/:sceneId', (req, res) => {
  const project = mediaProject(req, res);
  if (!project) return;
  const scenes = project.visuals?.scenes ?? [];
  const scene = scenes.find((s) => s.id === req.params.sceneId);
  if (!scene) return res.status(404).json({ error: 'Scene not found' });
  const body = req.body ?? {};
  if (typeof body.prompt === 'string' && body.prompt.trim()) scene.prompt = body.prompt.trim();
  if (typeof body.narration === 'string') scene.narration = body.narration.trim();
  if (typeof body.title === 'string' && body.title.trim()) scene.title = body.title.trim();
  if (typeof body.durationSec === 'number') scene.durationSec = clamp(round(body.durationSec, 1), 1, 90);
  project.updatedAt = new Date().toISOString();
  save();
  bus.emit('update', { projectId: project.id });
  res.json({ scenes: mediaPayload(project).scenes });
});

app.post('/api/projects/:id/scenes/:sceneId/move', (req, res) => {
  const project = mediaProject(req, res);
  if (!project) return;
  const scenes = project.visuals?.scenes ?? [];
  const index = scenes.findIndex((s) => s.id === req.params.sceneId);
  if (index < 0) return res.status(404).json({ error: 'Scene not found' });
  const dir = req.body?.direction === 'up' ? -1 : 1;
  const target = index + dir;
  if (target < 0 || target >= scenes.length) return res.status(400).json({ error: 'Cannot move further' });
  const [moved] = scenes.splice(index, 1);
  scenes.splice(target, 0, moved);
  project.visuals!.scenes = scenes;
  project.updatedAt = new Date().toISOString();
  save();
  bus.emit('update', { projectId: project.id });
  res.json({ scenes: mediaPayload(project).scenes });
});

app.delete('/api/projects/:id/scenes/:sceneId', (req, res) => {
  const project = mediaProject(req, res);
  if (!project) return;
  const scenes = project.visuals?.scenes ?? [];
  if (scenes.length <= 1) return res.status(400).json({ error: 'Keep at least one scene in the cut.' });
  const scene = scenes.find((s) => s.id === req.params.sceneId);
  if (!scene) return res.status(404).json({ error: 'Scene not found' });
  project.visuals!.scenes = scenes.filter((s) => s.id !== scene.id);
  project.updatedAt = new Date().toISOString();
  save();
  bus.emit('update', { projectId: project.id });
  res.json({ scenes: mediaPayload(project).scenes });
});

app.post('/api/projects/:id/scenes', (req, res) => {
  const project = mediaProject(req, res);
  if (!project || !project.visuals) return res.status(400).json({ error: 'Project has no storyboard yet' });
  const scenes = project.visuals.scenes;
  const body = req.body ?? {};
  const afterId = typeof body.afterId === 'string' ? body.afterId : undefined;
  const at = afterId ? scenes.findIndex((s) => s.id === afterId) + 1 : scenes.length;
  const scene = {
    id: `scene-${Math.random().toString(36).slice(2, 8)}`,
    beatId: scenes[Math.max(0, at - 1)]?.beatId ?? '',
    title: String(body.title ?? 'New scene'),
    prompt: String(body.prompt ?? project.visuals.style),
    composition: String(body.composition ?? 'cinematic medium shot, clean negative space'),
    durationSec: clamp(Number(body.durationSec ?? 6), 1, 90),
    transition: 'cut',
    narration: String(body.narration ?? ''),
  };
  scenes.splice(at, 0, scene);
  project.updatedAt = new Date().toISOString();
  save();
  bus.emit('update', { projectId: project.id });
  res.status(201).json({ scene, scenes: mediaPayload(project).scenes });
});

function sendMediaFile(req: express.Request, res: express.Response, file: string, downloadAs?: string) {
  const project = findProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const dir = projectDir(project.id);
  const abs = path.join(dir, path.basename(file));
  if (!abs.startsWith(dir) || !fs.existsSync(abs)) return res.status(404).json({ error: 'File not ready yet' });
  if (downloadAs) return res.download(abs, downloadAs);
  res.sendFile(abs, { headers: { 'cache-control': 'public, max-age=60' } });
}

app.get('/api/projects/:id/media/:file', (req, res) => {
  sendMediaFile(req, res, req.params.file);
});

app.get('/api/projects/:id/video', (req, res) => {
  const project = findProject(req.params.id);
  if (!project?.production?.videoFile) return res.status(404).json({ error: 'No render yet' });
  sendMediaFile(req, res, project.production.videoFile);
});

app.get('/api/projects/:id/download', (req, res) => {
  const project = findProject(req.params.id);
  if (!project?.production?.videoFile) return res.status(404).json({ error: 'Render the video first' });
  const name = `${slug(project.title || 'creatorpilot-video') || 'creatorpilot-video'}.mp4`;
  logActivity('download', `Downloaded “${project.title}” MP4`, { projectId: project.id });
  sendMediaFile(req, res, project.production.videoFile, name);
});

app.get('/api/projects/:id/captions', (req, res) => {
  const project = findProject(req.params.id);
  if (!project?.production?.captionsFile) return res.status(404).json({ error: 'No captions yet' });
  const abs = absoluteMedia(project.production.captionsFile);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'No captions yet' });
  res.type('text/plain').setHeader('content-disposition', `attachment; filename="${project.id}.srt"`);
  res.send(fs.readFileSync(abs, 'utf8'));
});

// ---------------------------------------------------------------- settings & providers

/* ------------------------------------------------------------------ settings */
app.get('/api/settings', (_req, res) => res.json({ settings: publicSettings(getDb().settings) }));

app.put('/api/settings', (req, res) => {
  const db = getDb();
  const incoming = req.body ?? {};
  if (incoming.channel) db.settings.channel = { ...db.settings.channel, ...incoming.channel };
  if (incoming.brand) db.settings.brand = { ...db.settings.brand, ...incoming.brand };
  if (incoming.research) {
    const next = { ...db.settings.research };
    for (const [key, value] of Object.entries(incoming.research)) {
      if (typeof value === 'string' && value.includes(MASK)) continue;
      if (key === 'youtubeApiKey' && typeof value === 'string') next.youtubeApiKey = value.trim();
      else if (key === 'region' && typeof value === 'string') next.region = value;
      else if (key === 'language' && typeof value === 'string') next.language = value;
      else if (key === 'resultLimit' && typeof value === 'number') next.resultLimit = Math.max(5, Math.min(50, Math.round(value)));
    }
    db.settings.research = next;
  }
  if (incoming.media) {
    const next: any = { ...db.settings.media };
    for (const [key, value] of Object.entries(incoming.media)) {
      if (typeof value === 'string' && value.includes(MASK)) continue;
      if (value !== undefined) next[key] = value;
    }
    db.settings.media = next;
  }
  if (Array.isArray(incoming.providers)) {
    db.settings.providers = db.settings.providers.map((existing) => {
      const match = incoming.providers.find((p: any) => p.id === existing.id);
      if (!match) return existing;
      const apiKey = typeof match.apiKey === 'string' && match.apiKey.includes(MASK) ? existing.apiKey : String(match.apiKey ?? '');
      return { ...existing, apiKey, enabled: Boolean(match.enabled), model: String(match.model ?? existing.model), baseUrl: String(match.baseUrl ?? existing.baseUrl) };
    });
  }
  save();
  logActivity('settings', 'Settings updated');
  res.json({ settings: publicSettings(db.settings) });
});

app.post('/api/providers/:id/test', async (req, res) => {
  const provider = getDb().settings.providers.find((p) => p.id === req.params.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });
  if (!provider.apiKey) return res.status(400).json({ error: 'Add an API key before testing.' });
  const result = await testProvider(provider);
  res.status(result.ok ? 200 : 502).json(result);
});

/* ------------------------------------------------------------------ reset */
app.post('/api/reset', (_req, res) => {
  resetStore();
  try {
    fs.rmSync(path.join(process.cwd(), 'data', 'media'), { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  bus.emit('update', {});
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ jobs & events */
app.get('/api/jobs', (_req, res) => res.json({ jobs: getDb().jobs }));

app.get('/api/jobs/:id', (req, res) => {
  const job = getDb().jobs.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job });
});

mediaBus.on('update', (payload: any) => bus.emit('job', payload));

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write('event: hello\ndata: {}\n\n');
  const onUpdate = () => res.write(`event: update\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
  const onJob = () => res.write(`event: job\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
  bus.on('update', onUpdate);
  bus.on('job', onJob);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(keepAlive);
    bus.off('update', onUpdate);
    bus.off('job', onJob);
  });
});

/* ------------------------------------------------------------------ static */
const dist = path.join(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => res.type('text/plain').send('API running. Build the UI with `npm run build`.'));
}

app.listen(PORT, HOST, () => {
  console.log(`\n  CreatorPilot → http://localhost:${PORT}\n  host ${HOST} · ${getDb().projects.length} projects · ${getDb().settings.providers.some((p) => p.apiKey) ? 'key found' : 'no AI key yet'}\n`);
});
