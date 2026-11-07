import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import type { Project, Settings, StageId } from '../shared/types.js';
import { getDb, initStore, logActivity, resetStore, save } from './store.js';
import { STAGE_LABELS, STAGE_ORDER, approveProject, bus, createProject, publishProject, runPipeline, scheduleProject, startPipelineJob, nextPublishSlot, resetStage, estimateProjectCost } from './pipeline.js';
import { buildExperiment, buildRecommendations, channelSeries, draftReply, generateMetrics } from './analytics-engine.js';
import { thumbnailSvg } from './thumbnails.js';
import { testProvider } from './ai.js';
import { addDays, clamp, round, slug, timecode } from './util.js';
import { evaluateQuality } from './content-engine.js';
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
  sceneNarration,
} from './media/service.js';
import { mediaReadiness, testMediaProvider } from './media/providers.js';
import { ffmpegAvailable, FFMPEG } from './media/ffmpeg.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const MASK = '••••••••';

initStore();
const app = express();
app.use(express.json({ limit: '4mb' }));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function publicSettings(s: Settings) {
  const maskKey = (key: string) => (key ? `${MASK}${key.slice(-4)}` : '');
  return {
    ...s,
    media: {
      ...s.media,
      geminiApiKey: maskKey(s.media.geminiApiKey),
      openaiApiKey: maskKey(s.media.openaiApiKey),
      elevenLabsApiKey: maskKey(s.media.elevenLabsApiKey),
    },
    mediaStatus: {
      gemini: Boolean(s.media.geminiApiKey),
      openai: Boolean(s.media.openaiApiKey),
      elevenlabs: Boolean(s.media.elevenLabsApiKey),
      ffmpeg: ffmpegAvailable(),
      imageProvider: mediaReadiness(s).image.resolved,
      ttsProvider: mediaReadiness(s).tts.resolved,
    },
    providers: s.providers.map((p) => ({
      ...p,
      apiKey: p.apiKey ? `${MASK}${p.apiKey.slice(-4)}` : '',
      hasKey: Boolean(p.apiKey),
    })),
  };
}

function findProject(id: string): Project | undefined {
  return getDb().projects.find((p) => p.id === id);
}

function dashboardPayload() {
  const db = getDb();
  const series = channelSeries(db.projects, 60);
  const last28 = series.slice(-28);
  const prev28 = series.slice(-56, -28);
  const sum = (rows: typeof series, key: 'views' | 'subs' | 'watchHours') => rows.reduce((s, r) => s + r[key], 0);
  const viewsNow = sum(last28, 'views');
  const viewsPrev = sum(prev28, 'views') || 1;
  const published = db.projects.filter((p) => p.status === 'published');
  const avgCtr = published.length ? round(published.reduce((s, p) => s + (p.metrics?.ctr ?? 0), 0) / published.length, 2) : 0;
  const avgRetention = published.length
    ? round(
        published.reduce((s, p) => {
          const m = p.metrics;
          if (!m) return s;
          return s + m.retention.reduce((a, b) => a + b, 0) / m.retention.length;
        }, 0) / published.length,
        1,
      )
    : 0;

  const stages = {
    generating: db.projects.filter((p) => p.status === 'generating').length,
    review: db.projects.filter((p) => p.status === 'review').length,
    approved: db.projects.filter((p) => p.status === 'approved').length,
    scheduled: db.projects.filter((p) => p.status === 'scheduled').length,
    published: published.length,
    draft: db.projects.filter((p) => p.status === 'draft' || p.status === 'failed').length,
  };

  return {
    channel: db.settings.channel,
    automation: db.settings.automation,
    demoMode: db.settings.demoMode,
    kpis: {
      views: viewsNow,
      viewsDelta: round(((viewsNow - viewsPrev) / viewsPrev) * 100, 1),
      watchHours: Math.round(sum(last28, 'watchHours')),
      subs: sum(last28, 'subs'),
      subsDelta: round(((sum(last28, 'subs') - sum(prev28, 'subs')) / (sum(prev28, 'subs') || 1)) * 100, 1),
      ctr: avgCtr,
      retention: avgRetention,
      published: published.length,
      inProduction: db.projects.filter((p) => ['generating', 'review', 'approved', 'scheduled'].includes(p.status)).length,
    },
    series: series.slice(-30),
    stages,
    pipeline: db.projects
      .filter((p) => ['generating', 'review', 'approved', 'scheduled', 'draft'].includes(p.status))
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        format: p.format,
        topic: p.topic,
        stages: p.stages,
        quality: p.quality?.score ?? null,
        updatedAt: p.updatedAt,
        schedule: p.schedule,
      })),
    upcoming: db.projects
      .filter((p) => p.schedule && ['approved', 'scheduled'].includes(p.status))
      .sort((a, b) => (a.schedule!.publishAt < b.schedule!.publishAt ? -1 : 1))
      .slice(0, 5)
      .map((p) => ({ id: p.id, title: p.title, schedule: p.schedule, quality: p.quality?.score ?? null })),
    topVideos: published
      .sort((a, b) => (b.metrics?.views ?? 0) - (a.metrics?.views ?? 0))
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        title: p.title,
        thumbnail: p.visuals?.selectedThumbnailId,
        views: p.metrics?.views ?? 0,
        ctr: p.metrics?.ctr ?? 0,
        avd: p.metrics?.avd ?? '—',
        subs: p.metrics?.subscribers ?? 0,
        spark: p.metrics?.daily.map((d) => d.views) ?? [],
      })),
    activity: db.activity.slice(0, 8),
    jobs: db.jobs.slice(0, 5),
    recommendations: db.recommendations.filter((r) => r.status === 'pending').slice(0, 3),
    commentsNeedingAttention: db.comments.filter((c) => !c.replied && !c.spam).length,
    spamQuarantined: db.comments.filter((c) => c.spam).length,
    experiments: db.experiments,
  };
}

// ---------------------------------------------------------------- bootstrap & dashboard
app.get('/api/bootstrap', (_req, res) => {
  const db = getDb();
  res.json({
    channel: db.settings.channel,
    automation: db.settings.automation,
    demoMode: db.settings.demoMode,
    settings: publicSettings(db.settings),
    counts: {
      projects: db.projects.length,
      review: db.projects.filter((p) => p.status === 'review').length,
      pendingComments: db.comments.filter((c) => !c.replied && !c.spam).length,
      recommendations: db.recommendations.filter((r) => r.status === 'pending').length,
    },
  });
});

app.get('/api/dashboard', (_req, res) => res.json(dashboardPayload()));

// ---------------------------------------------------------------- projects
app.get('/api/projects', (req, res) => {
  const db = getDb();
  const status = String(req.query.status ?? 'all');
  const q = String(req.query.q ?? '').toLowerCase();
  let items = db.projects;
  if (status !== 'all') items = items.filter((p) => p.status === status);
  if (q) items = items.filter((p) => `${p.title} ${p.topic} ${p.niche}`.toLowerCase().includes(q));
  res.json({
    items: items.map((p) => ({
      id: p.id,
      title: p.title,
      topic: p.topic,
      status: p.status,
      format: p.format,
      durationMin: p.durationMin,
      niche: p.niche,
      tone: p.tone,
      style: p.style,
      thumbnail: p.visuals?.selectedThumbnailId ?? p.visuals?.thumbnails[0]?.id,
      progress: Math.round((STAGE_ORDER.filter((s) => p.stages[s].status === 'done').length / STAGE_ORDER.length) * 100),
      quality: p.quality?.score ?? null,
      seo: p.seo?.score ?? null,
      schedule: p.schedule,
      metrics: p.metrics ? { views: p.metrics.views, ctr: p.metrics.ctr, avd: p.metrics.avd, subs: p.metrics.subscribers } : null,
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
      engine: p.engine,
      production: p.production?.status === 'ready' && p.production.videoFile
        ? { status: p.production.status, durationSec: p.production.durationSec ?? 0 }
        : null,
    })),
    counts: {
      all: db.projects.length,
      generating: db.projects.filter((p) => p.status === 'generating').length,
      review: db.projects.filter((p) => p.status === 'review').length,
      approved: db.projects.filter((p) => p.status === 'approved').length,
      scheduled: db.projects.filter((p) => p.status === 'scheduled').length,
      published: db.projects.filter((p) => p.status === 'published').length,
      draft: db.projects.filter((p) => p.status === 'draft').length,
    },
  });
});

app.post('/api/projects', (req, res) => {
  const { topic, niche, audience, tone, format, durationMin, style, autoRun } = req.body ?? {};
  if (!topic || String(topic).trim().length < 4) {
    return res.status(400).json({ error: 'Give the project a topic of at least 4 characters.' });
  }
  const project = createProject({ topic: String(topic), niche, audience, tone, format, durationMin, style });
  if (autoRun !== false) startPipelineJob(project.id);
  res.status(201).json({ project });
});

app.get('/api/projects/:id', (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const db = getDb();
  res.json({
    project: p,
    job: db.jobs.find((j) => j.projectId === p.id && j.status === 'running') ?? db.jobs.find((j) => j.projectId === p.id),
    comments: db.comments.filter((c) => c.projectId === p.id),
    estimates: estimateProjectCost(p),
    scheduledAfter: nextPublishSlot(db.settings),
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
  if (typeof body.topic === 'string') p.topic = body.topic;
  if (typeof body.niche === 'string') p.niche = body.niche;
  if (typeof body.audience === 'string') p.audience = body.audience;
  if (typeof body.tone === 'string') p.tone = body.tone;
  if (typeof body.style === 'string') p.style = body.style;
  if (body.format === 'long' || body.format === 'short') p.format = body.format;
  if (typeof body.durationMin === 'number') p.durationMin = clamp(Math.round(body.durationMin), 1, 60);
  if (body.seo) {
    p.seo = { ...(p.seo ?? ({} as any)), ...body.seo };
    if (p.seo) p.seo.selectedTitle = body.seo.selectedTitle ?? p.seo.titles?.[0]?.text ?? p.title;
  }
  if (body.selectedThumbnailId && p.visuals) {
    p.visuals.selectedThumbnailId = body.selectedThumbnailId;
    p.visuals.thumbnails = p.visuals.thumbnails.map((t) => ({ ...t }));
  }
  if (body.script) {
    p.script = { ...(p.script as any), ...body.script };
  }
  if (body.beats && p.script) {
    p.script.beats = body.beats;
    p.script.fullText = p.script.beats.map((b) => b.narration).join('\n\n') + '\n\n' + p.script.outro;
    p.script.wordCount = p.script.fullText.trim().split(/\s+/).filter(Boolean).length;
    p.script.estimatedDurationSec = Math.round((p.script.wordCount / p.script.wpm) * 60);
    p.quality = evaluateQuality(p);
  }
  p.updatedAt = new Date().toISOString();
  save();
  bus.emit('update', { projectId: p.id });
  res.json({ project: p });
});

app.delete('/api/projects/:id', (req, res) => {
  const db = getDb();
  const before = db.projects.length;
  db.projects = db.projects.filter((p) => p.id !== req.params.id);
  db.comments = db.comments.filter((c) => c.projectId !== req.params.id);
  db.jobs = db.jobs.filter((j) => j.projectId !== req.params.id);
  try {
    fs.rmSync(path.join(process.cwd(), 'data', 'media', req.params.id), { recursive: true, force: true });
  } catch {
    // best effort
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
  if (['approved', 'scheduled', 'published'].includes(p.status)) {
    return res.status(409).json({ error: 'This project is locked after approval. Duplicate it to iterate.' });
  }
  resetStage(p, stage);
  save();
  try {
    const job = startPipelineJob(p.id, { fromStage: stage });
    res.status(202).json({ job });
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : 'Could not regenerate' });
  }
});

app.post('/api/projects/:id/approve', (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const result = approveProject(p);
  if (!result.ok) return res.status(409).json({ error: result.error, quality: p.quality });
  res.json({ project: p });
});

app.post('/api/projects/:id/reject', (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  p.status = 'review';
  p.approvedAt = undefined;
  p.schedule = p.schedule ? { ...p.schedule, status: 'draft' } : undefined;
  const note = String(req.body?.note ?? '');
  if (note) p.rejectionNote = note;
  p.updatedAt = new Date().toISOString();
  logActivity('undo', `Changes requested on “${p.title}”`, { projectId: p.id, meta: note || undefined });
  save();
  bus.emit('update', { projectId: p.id });
  res.json({ project: p });
});

app.post('/api/projects/:id/schedule', (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  if (!['approved', 'scheduled'].includes(p.status)) {
    return res.status(409).json({ error: 'Approve the project before scheduling it.' });
  }
  const publishAt = String(req.body?.publishAt ?? '');
  if (Number.isNaN(new Date(publishAt).getTime())) return res.status(400).json({ error: 'Choose a valid publish time.' });
  const privacy = (req.body?.privacy ?? 'private') as 'public' | 'unlisted' | 'private';
  scheduleProject(p, new Date(publishAt).toISOString(), privacy);
  res.json({ project: p });
});

app.post('/api/projects/:id/publish-now', (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  if (!['approved', 'scheduled'].includes(p.status)) {
    return res.status(409).json({ error: 'Only approved or scheduled projects can publish.' });
  }
  publishProject(p);
  res.json({ project: p, note: 'YouTube upload simulated — connect OAuth in a production deployment.' });
});

app.post('/api/projects/:id/duplicate', (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const copy: Project = JSON.parse(JSON.stringify(p));
  copy.id = `prj_${Math.random().toString(36).slice(2, 10)}`;
  copy.title = `${p.title} (v2)`;
  copy.status = 'review';
  copy.approvedAt = undefined;
  copy.publishedAt = undefined;
  copy.metrics = undefined;
  copy.schedule = undefined;
  copy.createdAt = new Date().toISOString();
  copy.updatedAt = copy.createdAt;
  if (copy.script) copy.script.title = copy.title;
  getDb().projects.unshift(copy);
  save();
  res.status(201).json({ project: copy });
});

app.get('/api/projects/:id/thumbnail/:tid.svg', (req, res) => {
  const p = findProject(req.params.id);
  const t = p?.visuals?.thumbnails.find((x) => x.id === req.params.tid);
  if (!p || !t) return res.status(404).send('Not found');
  const settings = getDb().settings;
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=300').send(
    thumbnailSvg(t, {
      channel: settings.channel.name,
      episode: String(getDb().projects.findIndex((x) => x.id === p.id) + 1).padStart(2, '0'),
    }),
  );
});

app.get('/api/projects/:id/export', (req, res) => {
  const p = findProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const scenes = p.visuals?.scenes ?? [];
  const lines = [
    `# ${p.seo?.selectedTitle ?? p.title}`,
    '',
    `**Format:** ${p.format === 'short' ? 'Short (9:16)' : `Long-form (${p.durationMin} min)`} · **Tone:** ${p.tone} · **Style:** ${p.style}`,
    `**Runtime:** ${timecode(p.script?.estimatedDurationSec ?? 0)} · **Words:** ${p.script?.wordCount ?? 0} · **Quality:** ${p.quality?.score ?? '—'}/100 · **SEO:** ${p.seo?.score ?? '—'}/100`,
    '',
    '## Publish package',
    '',
    `**Title:** ${p.seo?.selectedTitle ?? p.title}`,
    '',
    '**Description**',
    '```',
    p.seo?.description ?? '',
    '```',
    '',
    `**Tags:** ${(p.seo?.tags ?? []).join(', ')}`,
    '',
    `**Hashtags:** ${(p.seo?.hashtags ?? []).join(' ')}`,
    '',
    '## Script',
    '',
    p.script ? p.script.beats.map((b) => `### ${b.title} — ${timecode(b.durationSec)}\n\n${b.narration}\n`).join('\n') : '_No script generated yet._',
    '',
    `### Outro\n\n${p.script?.outro ?? ''}`,
    '',
    '## Shot list',
    '',
    ...scenes.map((s, i) => `${i + 1}. **${s.title}** (${timecode(s.durationSec)}) — ${s.prompt}\n   _Composition:_ ${s.composition} · _Transition:_ ${s.transition}`),
    '',
    '## Quality gate',
    '',
    ...(p.quality?.checks ?? []).map((c) => `- ${c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌'} **${c.label}** — ${c.detail}`),
    '',
    `Generated by CreatorPilot Studio · engine: ${p.engine} · ${new Date().toISOString()}`,
  ];
  res.json({
    filename: `${slug(p.title) || 'createrpilot-package'}.md`,
    markdown: lines.join('\n'),
    project: p,
  });
});

// ---------------------------------------------------------------- jobs & events
app.get('/api/jobs', (_req, res) => res.json({ jobs: getDb().jobs }));
app.get('/api/jobs/:id', (req, res) => {
  const job = getDb().jobs.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job });
});

mediaBus.on('update', (payload: any) => {
  bus.emit('job', payload);
});

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: hello\ndata: {"ok":true}\n\n`);
  const handler = (payload: unknown) => {
    res.write(`event: update\ndata: ${JSON.stringify(payload)}\n\n`);
  };
  bus.on('update', handler);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off('update', handler);
  });
});

// ---------------------------------------------------------------- analytics
app.get('/api/analytics', (_req, res) => {
  const db = getDb();
  const series = channelSeries(db.projects, 60);
  const published = db.projects.filter((p) => p.status === 'published' && p.metrics);
  const totalViews = published.reduce((s, p) => s + (p.metrics?.views ?? 0), 0);
  const totalWatch = round(published.reduce((s, p) => s + (p.metrics?.watchHours ?? 0), 0), 0);
  const totalSubs = published.reduce((s, p) => s + (p.metrics?.subscribers ?? 0), 0);
  res.json({
    series,
    totals: {
      views: totalViews,
      watchHours: totalWatch,
      subscribers: totalSubs,
      videos: published.length,
      revenue: round(published.reduce((s, p) => s + (p.metrics?.revenue ?? 0), 0), 2),
      avgCtr: published.length ? round(published.reduce((s, p) => s + (p.metrics?.ctr ?? 0), 0) / published.length, 2) : 0,
    },
    videos: published
      .map((p) => ({
        id: p.id,
        title: p.title,
        thumbnail: p.visuals?.selectedThumbnailId,
        format: p.format,
        publishedAt: p.publishedAt,
        metrics: p.metrics,
        duration: timecode(p.script?.estimatedDurationSec ?? 0),
        scenes: p.visuals?.scenes.map((s) => ({ id: s.id, title: s.title, durationSec: s.durationSec })) ?? [],
      }))
      .sort((a, b) => (a.publishedAt ?? '') < (b.publishedAt ?? '') ? 1 : -1),
    demographics: [
      { label: '18–24', value: 14 },
      { label: '25–34', value: 41 },
      { label: '35–44', value: 26 },
      { label: '45–54', value: 12 },
      { label: '55+', value: 7 },
    ],
    trafficSources: [
      { label: 'Browse features', value: 38 },
      { label: 'Suggested videos', value: 29 },
      { label: 'YouTube search', value: 19 },
      { label: 'External', value: 9 },
      { label: 'Shorts feed', value: 5 },
    ],
  });
});

// ---------------------------------------------------------------- audience
app.get('/api/comments', (req, res) => {
  const db = getDb();
  const filter = String(req.query.filter ?? 'all');
  const projectId = String(req.query.projectId ?? '');
  let items = db.comments;
  if (projectId) items = items.filter((c) => c.projectId === projectId);
  if (filter === 'questions') items = items.filter((c) => c.isQuestion && !c.spam);
  if (filter === 'pending') items = items.filter((c) => !c.replied && !c.spam);
  if (filter === 'spam') items = items.filter((c) => c.spam);
  if (filter === 'positive') items = items.filter((c) => c.sentiment === 'positive');
  res.json({
    items: items.map((c) => ({
      ...c,
      video: db.projects.find((p) => p.id === c.projectId)?.title ?? 'Unknown video',
      thumbnail: db.projects.find((p) => p.id === c.projectId)?.visuals?.selectedThumbnailId,
    })),
    counts: {
      all: db.comments.length,
      pending: db.comments.filter((c) => !c.replied && !c.spam).length,
      questions: db.comments.filter((c) => c.isQuestion && !c.spam).length,
      spam: db.comments.filter((c) => c.spam).length,
      replied: db.comments.filter((c) => c.replied).length,
      positive: db.comments.filter((c) => c.sentiment === 'positive').length,
    },
    ideas: [
      { title: 'The playlist architecture that makes bingeing automatic', evidence: '6 comments across 2 videos', status: 'pending' },
      { title: 'Which retention metric should a new channel optimise first?', evidence: '4 comments', status: 'pending' },
      { title: 'A realistic AI tool stack under $40/month', evidence: '3 comments', status: 'approved' },
    ],
  });
});

app.post('/api/comments/:id/draft', (req, res) => {
  const c = getDb().comments.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Comment not found' });
  c.replyDraft = draftReply(c);
  save();
  res.json({ comment: c });
});

app.post('/api/comments/:id/reply', (req, res) => {
  const db = getDb();
  const c = db.comments.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Comment not found' });
  if (c.spam) return res.status(409).json({ error: 'Spam is quarantined and cannot be replied to.' });
  c.replyDraft = String(req.body?.text ?? c.replyDraft ?? '');
  if (!c.replyDraft.trim()) return res.status(400).json({ error: 'Write or draft a reply first.' });
  c.replied = true;
  logActivity('message', `Reply posted to ${c.author}`, { meta: 'Simulated in demo mode' });
  save();
  bus.emit('update', {});
  res.json({ comment: c, note: 'Reply marked as posted (dry run).' });
});

app.post('/api/comments/:id/quarantine', (req, res) => {
  const c = getDb().comments.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Comment not found' });
  c.spam = !c.spam;
  save();
  res.json({ comment: c });
});

// ---------------------------------------------------------------- learning
app.get('/api/recommendations', (_req, res) => {
  const db = getDb();
  res.json({ items: db.recommendations, experiments: db.experiments });
});

app.post('/api/recommendations/refresh', (_req, res) => {
  const db = getDb();
  const fresh = buildRecommendations(db);
  const existingTitles = new Set(db.recommendations.map((r) => r.title));
  db.recommendations = [...fresh.filter((r) => !existingTitles.has(r.title)), ...db.recommendations];
  logActivity('brain', 'Learning loop refreshed from latest analytics');
  save();
  res.json({ items: db.recommendations });
});

app.post('/api/recommendations/:id/decision', (req, res) => {
  const r = getDb().recommendations.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Recommendation not found' });
  const decision = String(req.body?.decision ?? '');
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'decision must be approve or reject' });
  r.status = decision === 'approve' ? 'approved' : 'rejected';
  logActivity(decision === 'approve' ? 'check' : 'x', `${decision === 'approve' ? 'Approved' : 'Rejected'} learning: ${r.title}`);
  save();
  res.json({ recommendation: r });
});

app.post('/api/experiments', (req, res) => {
  const p = findProject(String(req.body?.projectId ?? ''));
  if (!p) return res.status(404).json({ error: 'Project not found' });
  const exp = buildExperiment(p);
  getDb().experiments.unshift(exp);
  logActivity('flask', `Title experiment started on “${p.title.slice(0, 40)}…”`);
  save();
  res.status(201).json({ experiment: exp });
});

app.post('/api/experiments/:id/decide', (req, res) => {
  const exp = getDb().experiments.find((e) => e.id === req.params.id);
  if (!exp) return res.status(404).json({ error: 'Experiment not found' });
  const winner = req.body?.winner === 'B' ? 'B' : 'A';
  const p = findProject(exp.projectId);
  if (p && winner === 'B') {
    p.title = exp.variantB;
    if (p.seo) p.seo.selectedTitle = exp.variantB;
  }
  exp.status = 'winner';
  logActivity('flask', `Variant ${winner} adopted for “${(p?.title ?? exp.variantA).slice(0, 40)}…”`);
  save();
  res.json({ experiment: exp });
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
app.get('/api/settings', (_req, res) => res.json({ settings: publicSettings(getDb().settings) }));

app.put('/api/settings', (req, res) => {
  const db = getDb();
  const incoming = req.body ?? {};
  if (incoming.channel) db.settings.channel = { ...db.settings.channel, ...incoming.channel };
  if (incoming.brand) db.settings.brand = { ...db.settings.brand, ...incoming.brand };
  if (incoming.automation) db.settings.automation = { ...db.settings.automation, ...incoming.automation };
  if (incoming.media) {
    const next: any = { ...db.settings.media };
    for (const [key, value] of Object.entries(incoming.media)) {
      if (typeof value === 'string' && value.includes(MASK)) continue;
      if (typeof value === 'string' && value.trim() === '' && ['geminiApiKey', 'openaiApiKey', 'elevenLabsApiKey'].includes(key)) {
        next[key] = '';
        continue;
      }
      if (value !== undefined) next[key] = value;
    }
    db.settings.media = next;
  }
  if (typeof incoming.demoMode === 'boolean') db.settings.demoMode = incoming.demoMode;
  if (Array.isArray(incoming.providers)) {
    db.settings.providers = incoming.providers.map((p: any) => {
      const existing = db.settings.providers.find((x) => x.id === p.id);
      const apiKey = typeof p.apiKey === 'string' && p.apiKey.includes(MASK) ? existing?.apiKey ?? '' : String(p.apiKey ?? '');
      return { ...(existing ?? { kind: 'text', enabled: false, baseUrl: '', model: '' }), ...p, apiKey };
    });
  }
  save();
  logActivity('settings', 'Studio settings updated');
  res.json({ settings: publicSettings(db.settings) });
});

app.post('/api/providers/:id/test', async (req, res) => {
  const provider = getDb().settings.providers.find((p) => p.id === req.params.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });
  if (!provider.apiKey) return res.status(400).json({ error: 'Add an API key before testing.' });
  const result = await testProvider(provider);
  res.status(result.ok ? 200 : 502).json(result);
});

app.post('/api/demo/reset', (_req, res) => {
  resetStore();
  try {
    fs.rmSync(path.join(process.cwd(), 'data', 'media'), { recursive: true, force: true });
  } catch {
    // best effort
  }
  bus.emit('update', {});
  res.json({ ok: true });
  setTimeout(() => void prepareDemoCut(), 400);
});

// ---------------------------------------------------------------- autopilot
let autopilotRunning = false;

app.get('/api/autopilot', (_req, res) => {
  const db = getDb();
  res.json({
    running: autopilotRunning,
    settings: db.settings.automation,
    mandate: db.settings.automation.mandate,
    queue: db.projects.filter((p) => p.status === 'generating').map((p) => ({ id: p.id, title: p.title })),
    recentRuns: db.jobs.filter((j) => j.kind === 'pipeline').slice(0, 6),
  });
});

app.post('/api/autopilot/run', (req, res) => {
  if (autopilotRunning) return res.status(409).json({ error: 'Autopilot is already running.' });
  const db = getDb();
  const count = clamp(Number(req.body?.count ?? 2), 1, 3);
  const pillars = (req.body?.pillars as string[] | undefined)?.length
    ? (req.body.pillars as string[])
    : db.settings.automation.pillars;
  const topics = Array.from({ length: count }, (_, i) => {
    const pillar = pillars[i % pillars.length] ?? 'Creator systems';
    return `${pillar}: the repeatable system behind it`;
  });
  const projects = topics.map((topic) =>
    createProject({ topic, durationMin: 8 + Math.floor(Math.random() * 4), format: 'long' }),
  );
  autopilotRunning = true;
  logActivity('bot', `Autopilot queued ${projects.length} episodes`, { meta: 'Sequential pipeline run' });
  void (async () => {
    try {
      for (const p of projects) {
        await runPipeline(p.id);
        await sleep(700);
      }
    } catch (err) {
      console.error('[autopilot]', err);
    } finally {
      autopilotRunning = false;
      bus.emit('update', {});
    }
  })();
  res.status(202).json({ started: true, projects: projects.map((p) => ({ id: p.id, topic: p.topic })) });
});

// ---------------------------------------------------------------- misc
app.get('/api/health', (_req, res) => res.json({ ok: true, mode: getDb().settings.demoMode ? 'demo' : 'live', time: new Date().toISOString() }));

// ---------------------------------------------------------------- static frontend
const dist = path.join(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) =>
    res.type('text/plain').send('CreatorPilot API is running. Build the UI with `npm run build`, then reload.'),
  );
}

// publish anything that has come due (dry run)
setInterval(() => {
  const db = getDb();
  const due = db.projects.filter(
    (p) => p.status === 'scheduled' && p.schedule?.status === 'queued' && new Date(p.schedule.publishAt).getTime() <= Date.now(),
  );
  for (const p of due) {
    publishProject(p);
    console.log(`[queue] published (dry run): ${p.title}`);
  }
}, 60_000);

app.listen(PORT, HOST, () => {
  console.log(`\n  CreatorPilot Studio ready → http://localhost:${PORT}\n  host ${HOST} · ${getDb().settings.demoMode ? 'demo engine' : 'live provider'} · ${getDb().projects.length} projects loaded\n`);
  setTimeout(() => void prepareDemoCut(), 1200);
});

/**
 * First boot has no rendered media. Build one real MP4 from studio art so the
 * Production tab opens with a working player + download instead of an empty state.
 */
async function prepareDemoCut() {
  if (!ffmpegAvailable()) {
    console.log('[media] ffmpeg unavailable — MP4 export disabled');
    return;
  }
  const mediaRoot = path.join(process.cwd(), 'data', 'media');
  if (fs.existsSync(mediaRoot) && fs.readdirSync(mediaRoot).length > 0) return;
  const candidate = getDb().projects.find((p) => (p.visuals?.scenes?.length ?? 0) > 0);
  if (!candidate) return;
  console.log(`[media] building a demo cut for ${candidate.id} (${candidate.title})`);
  const job = createMediaJob(candidate.id, 'Preparing demo cut');
  try {
    await renderProject(candidate, job);
    finishJob(job, 'done');
    console.log('[media] demo cut ready');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Demo render failed';
    console.error('[media] demo render failed:', message);
    finishJob(job, 'failed', message);
  }
  bus.emit('update', { projectId: candidate.id });
}
