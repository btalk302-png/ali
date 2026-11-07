import { EventEmitter } from 'node:events';
import type { Job, Project, StageId, StageState, Settings } from '../shared/types.js';
import {
  evaluateQuality,
  generateResearch,
  generateScript,
  generateSeo,
  generateStrategy,
  generateVisuals,
  type Brief,
} from './content-engine.js';
import { aiComplete, isLive, parseJson } from './ai.js';
import { getDb, logActivity, save } from './store.js';
import { addDays, nowIso, round, timecode, uid, wordCount } from './util.js';
import { generateMetrics } from './analytics-engine.js';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

export const STAGE_ORDER: StageId[] = ['research', 'strategy', 'script', 'visuals', 'seo', 'quality', 'release'];

export const STAGE_LABELS: Record<StageId, string> = {
  research: 'Research',
  strategy: 'Strategy',
  script: 'Script',
  visuals: 'Visuals',
  seo: 'SEO & metadata',
  quality: 'Quality gate',
  release: 'Release plan',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function emptyStages(): Record<StageId, StageState> {
  return Object.fromEntries(STAGE_ORDER.map((id) => [id, { id, status: 'pending' }])) as Record<StageId, StageState>;
}

export interface CreateProjectInput {
  topic: string;
  niche?: string;
  audience?: string;
  tone?: string;
  format?: 'long' | 'short';
  durationMin?: number;
  style?: string;
  language?: string;
  runNow?: boolean;
}

export function briefFromProject(p: Project): Brief {
  return {
    topic: p.topic,
    niche: p.niche,
    audience: p.audience,
    tone: p.tone,
    format: p.format,
    durationMin: p.durationMin,
    style: p.style,
  };
}

export function createProject(input: CreateProjectInput): Project {
  const settings = getDb().settings;
  const topic = input.topic.trim();
  const project: Project = {
    id: uid('prj'),
    title: topic,
    topic,
    niche: input.niche?.trim() || settings.channel.niche,
    audience: input.audience?.trim() || settings.channel.audience,
    tone: input.tone || settings.brand.tone,
    format: input.format || 'long',
    durationMin: input.format === 'short' ? 1 : Number(input.durationMin) || 8,
    style: input.style || 'Cinematic',
    language: input.language || settings.channel.language,
    status: 'draft',
    stages: emptyStages(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    engine: isLive(settings) ? 'live' : 'demo',
  };
  getDb().projects.unshift(project);
  logActivity('sparkles', `New project created — ${topic}`, { projectId: project.id, meta: project.niche });
  save();
  return project;
}

async function researchStage(project: Project, settings: Settings, seed: string) {
  const simulated = generateResearch(briefFromProject(project), seed);
  if (!isLive(settings)) return simulated;
  const prompt = `Research a YouTube video for: "${project.topic}".
Niche: ${project.niche}. Audience: ${project.audience}. Format: ${project.format === 'short' ? 'a vertical Short (under 60s)' : project.durationMin + ' minute long-form'}.

Return STRICT JSON, no markdown:
{
  "summary": "3 sentence opportunity statement",
  "audienceInsights": ["4 specific observations"],
  "trendingAngles": [{"title": "...", "why": "...", "searchInterest": 0-100, "competition": "low|medium|high"}],
  "competitors": [{"channel": "...", "subscribers": "412K", "avgViews": "180K", "pattern": "..."}],
  "keywordClusters": [{"keyword": "...", "volume": 1000, "difficulty": 0-100, "intent": "informational|commercial|entertainment"}],
  "sources": [{"label": "...", "url": "..."}]
}
Sources must be real, verifiable search or explore URLs (YouTube search, Google Trends, Reddit search). Never invent article links.`;
  const text = await aiComplete(settings, {
    system: 'You are a rigorous YouTube research strategist. Evidence first, hype never. Reply with JSON only.',
    prompt,
    json: true,
    maxTokens: 2200,
  });
  const ai = parseJson<Partial<typeof simulated>>(text);
  return {
    ...simulated,
    ...ai,
    audienceInsights: ai.audienceInsights?.length ? ai.audienceInsights : simulated.audienceInsights,
    trendingAngles: ai.trendingAngles?.length ? ai.trendingAngles : simulated.trendingAngles,
    competitors: ai.competitors?.length ? ai.competitors : simulated.competitors,
    keywordClusters: ai.keywordClusters?.length ? ai.keywordClusters : simulated.keywordClusters,
    sources: ai.sources?.length ? ai.sources : simulated.sources,
    generatedBy: `live · ${settings.providers.find((p) => p.enabled && p.apiKey)?.label ?? 'provider'}`,
  };
}

async function strategyStage(project: Project, settings: Settings, seed: string) {
  const research = project.research!;
  const simulated = generateStrategy(briefFromProject(project), research, seed);
  if (!isLive(settings)) return simulated;
  const text = await aiComplete(settings, {
    system: 'You are a YouTube editorial strategist. Reply with JSON only.',
    prompt: `Build an editorial strategy for "${project.topic}" for ${project.audience}.
Research summary: ${research.summary}
Trending angles: ${research.trendingAngles.map((a) => a.title).join(' | ')}
Format: ${project.format === 'short' ? 'Short under 60 seconds' : project.durationMin + ' minutes'}.
Return STRICT JSON: {"bigIdea":"","hookAngle":"","targetEmotion":"","differentiators":["3 items"],"outline":[{"id":"b1","title":"","purpose":"","durationSec":0}],"cta":"","publishSlot":""}
The outline must total roughly ${project.format === 'short' ? 60 : project.durationMin * 60} seconds.`,
    json: true,
    maxTokens: 1600,
  });
  const ai = parseJson<Partial<typeof simulated>>(text);
  return {
    ...simulated,
    ...ai,
    differentiators: ai.differentiators?.length ? ai.differentiators : simulated.differentiators,
    outline: ai.outline?.length ? ai.outline : simulated.outline,
    generatedBy: 'live',
  };
}

async function scriptStage(project: Project, settings: Settings, seed: string) {
  const strategy = project.strategy!;
  const simulated = generateScript(briefFromProject(project), project.research!, strategy, seed);
  if (!isLive(settings)) return simulated;
  const text = await aiComplete(settings, {
    system: `You are a world-class YouTube scriptwriter. Voice: ${settings.brand.voice} Tone: ${project.tone}. Never use hype or unverifiable claims. Reply with JSON only.`,
    prompt: `Write the full narration for "${project.topic}" (${project.format === 'short' ? 'vertical short, under 60s' : project.durationMin + ' minutes, ~' + project.durationMin * 152 + ' words'}).
Audience: ${project.audience}
Big idea: ${strategy.bigIdea}
Hook angle: ${strategy.hookAngle}
Outline: ${strategy.outline.map((o) => `${o.title} (${o.durationSec}s)`).join(' | ')}
Return STRICT JSON:
{"title":"","hook":"first 2 sentences","intro":"","beats":[{"id":"b1","title":"","narration":"60-120 words of spoken narration","bRollPrompt":"one visual direction","durationSec":0}],"outro":"","cta":""}
Narration must be spoken-word ready: contractions, no stage directions, no markdown, no emojis.`,
    json: true,
    maxTokens: 4000,
  });
  const ai = parseJson<Partial<typeof simulated>>(text);
  const beats = (ai.beats ?? []).filter((b) => b.narration && b.narration.length > 20);
  const merged = {
    ...simulated,
    ...ai,
    beats: beats.length >= 3 ? beats : simulated.beats,
  } as typeof simulated;
  const fullText = merged.beats.map((b) => b.narration).join('\n\n') + '\n\n' + (merged.outro ?? '');
  const words = wordCount(fullText);
  return {
    ...merged,
    hook: merged.beats[0]?.narration ?? merged.hook,
    fullText,
    wordCount: words,
    estimatedDurationSec: Math.round((words / merged.wpm) * 60),
    generatedBy: 'live',
  };
}

async function visualsStage(project: Project, settings: Settings, seed: string) {
  const simulated = generateVisuals(briefFromProject(project), project.script!, seed);
  if (!isLive(settings)) return simulated;
  try {
    const text = await aiComplete(settings, {
      system: 'You are a video art director. Reply with JSON only.',
      prompt: `Create a shot list for this script. Topic: ${project.topic}. Visual style: ${project.style}.
Beats: ${project.script!.beats.map((b) => `${b.title}: ${b.bRollPrompt}`).join(' | ')}
Return STRICT JSON: {"style":"one line","palette":["#hex","#hex","#hex"],"scenes":[{"beatId":"match an input beat title","title":"","prompt":"detailed cinematic image prompt, 25-45 words, no text overlays","composition":"","durationSec":0,"transition":""}]}`,
      json: true,
      maxTokens: 1800,
    });
    const ai = parseJson<{ style?: string; palette?: string[]; scenes?: { beatId: string; title: string; prompt: string; composition: string; durationSec: number; transition: string }[] }>(text);
    if (!ai.scenes?.length) return simulated;
    const scenes = project.script!.beats.map((beat, i) => {
      const match = ai.scenes!.find((s) => s.title?.toLowerCase() === beat.title.toLowerCase()) ?? ai.scenes![i] ?? ai.scenes![0];
      return {
        id: uid('sc'),
        beatId: beat.id,
        title: beat.title,
        narration: beat.narration,
        prompt: match?.prompt ?? beat.bRollPrompt,
        composition: match?.composition ?? simulated.scenes[i]?.composition ?? 'Center-framed subject',
        durationSec: beat.durationSec,
        transition: match?.transition ?? 'hard cut',
      };
    });
    return {
      ...simulated,
      style: ai.style ?? simulated.style,
      palette: ai.palette?.length === 3 ? [...ai.palette, '#FFFFFF'] : simulated.palette,
      scenes,
      generatedBy: 'live',
    };
  } catch {
    return simulated;
  }
}

async function seoStage(project: Project, settings: Settings, seed: string) {
  const simulated = generateSeo(briefFromProject(project), project.script!, seed);
  if (!isLive(settings)) return simulated;
  const text = await aiComplete(settings, {
    system: 'You are a YouTube SEO and packaging specialist. Reply with JSON only.',
    prompt: `Package this video for search and browse.
Topic: ${project.topic}
Script: ${project.script!.fullText.slice(0, 4500)}
Chapters currently: ${simulated.chapters.map((c) => `${c.time} ${c.label}`).join(', ')}
Return STRICT JSON:
{"titles":[{"text":"under 62 chars","score":0-100,"reason":"why it earns the click"}],
 "selectedTitle":"",
 "description":"150-250 words, first 2 lines sell the video, then chapters block, then resources",
 "chapters":[{"time":"0:00","label":""}],
 "tags":["12-16 lowercase tags"],
 "hashtags":["#3"],
 "searchIntent":""}
No clickbait that the video cannot pay off.`,
    json: true,
    maxTokens: 2200,
  });
  const ai = parseJson<Partial<typeof simulated>>(text);
  const merged = { ...simulated, ...ai } as typeof simulated;
  const titles = ai.titles?.length ? ai.titles : simulated.titles;
  const tags = ai.tags?.length ? ai.tags : simulated.tags;
  const chapters = ai.chapters?.length ? ai.chapters : simulated.chapters;
  const maxScore = 25 + 25 + 20 + 20 + 10;
  const breakdown = [
    { label: 'Title', score: Math.round(Math.min(25, (titles[0]?.score ?? 60) / 4)), max: 25, note: 'Model-scored packaging potential' },
    { label: 'Description', score: merged.description.length > 700 ? 22 : 15, max: 25, note: `${merged.description.length} characters` },
    { label: 'Tags & hashtags', score: Math.min(20, Math.round(tags.length * 1.3)), max: 20, note: `${tags.length} tags` },
    { label: 'Chapters', score: chapters.length >= 4 ? 20 : 12, max: 20, note: `${chapters.length} chapters` },
    { label: 'Intent match', score: 9, max: 10, note: merged.searchIntent },
  ];
  const score = Math.round((breakdown.reduce((s, b) => s + b.score, 0) / maxScore) * 100);
  return {
    ...merged,
    titles,
    tags,
    chapters,
    breakdown,
    selectedTitle: merged.selectedTitle || titles[0]?.text || simulated.selectedTitle,
    score,
    generatedBy: 'live',
  };
}

function appendLog(job: Job, level: 'info' | 'success' | 'warn' | 'error', msg: string) {
  job.logs.push({ t: nowIso(), level, msg });
  if (job.logs.length > 200) job.logs.shift();
  bus.emit('update', { jobId: job.id });
}

export function nextPublishSlot(settings: Settings, from = new Date()): string {
  const cadenceDays = settings.automation.cadence === 'daily' ? 1 : settings.automation.cadence === 'weekly' ? 7 : 2;
  const taken = new Set(
    getDb()
      .projects.filter((p) => p.schedule?.publishAt)
      .map((p) => p.schedule!.publishAt.slice(0, 10)),
  );
  let candidate = addDays(from, cadenceDays);
  for (let i = 0; i < 30; i++) {
    const key = candidate.toISOString().slice(0, 10);
    if (!taken.has(key)) break;
    candidate = addDays(candidate, 1);
  }
  candidate.setUTCHours(settings.automation.publishHour, 0, 0, 0);
  return candidate.toISOString();
}

export async function executeStage(
  project: Project,
  stage: StageId,
  settings: Settings,
  job: Job,
  seed: string,
): Promise<void> {
  const stageState = project.stages[stage];
  stageState.status = 'running';
  stageState.startedAt = nowIso();
  stageState.message = isLive(settings) ? 'Calling model provider…' : 'Generating with the local demo engine…';
  project.status = 'generating';
  project.engine = isLive(settings) ? 'live' : 'demo';
  project.updatedAt = nowIso();
  const jobStage = job.stages.find((s) => s.id === stage);
  if (jobStage) jobStage.status = 'running';
  save();
  bus.emit('update', { jobId: job.id, projectId: project.id });

  if (!isLive(settings)) await sleep(420 + Math.random() * 520);

  try {
    switch (stage) {
      case 'research':
        project.research = await researchStage(project, settings, seed);
        stageState.message = `${project.research.trendingAngles.length} angles · ${project.research.keywordClusters.length} keywords`;
        break;
      case 'strategy':
        project.strategy = await strategyStage(project, settings, seed);
        stageState.message = `${project.strategy.outline.length} beats mapped`;
        break;
      case 'script':
        project.script = await scriptStage(project, settings, seed);
        project.title = project.script.title;
        stageState.message = `${project.script.wordCount} words · ${timecode(project.script.estimatedDurationSec)}`;
        break;
      case 'visuals':
        project.visuals = await visualsStage(project, settings, seed);
        stageState.message = `${project.visuals.scenes.length} scenes · ${project.visuals.thumbnails.length} thumbnails`;
        break;
      case 'seo':
        project.seo = await seoStage(project, settings, seed);
        stageState.message = `SEO ${project.seo.score}/100 · CTR ${project.seo.ctrPrediction}%`;
        break;
      case 'quality':
        project.quality = evaluateQuality(project);
        stageState.message = `${project.quality.score}/100 · ${project.quality.blockers.length} blockers`;
        break;
      case 'release':
        project.schedule = project.schedule ?? {
          publishAt: nextPublishSlot(settings),
          privacy: settings.automation.privacy,
          status: 'draft',
          timezone: settings.channel.timezone,
        };
        stageState.message = `Proposed for ${new Date(project.schedule.publishAt).toUTCString().slice(0, 16)}`;
        break;
    }
    stageState.status = 'done';
    stageState.endedAt = nowIso();
    if (jobStage) {
      jobStage.status = 'done';
      jobStage.message = stageState.message;
    }
    appendLog(job, 'success', `${STAGE_LABELS[stage]} complete — ${stageState.message}`);
  } catch (err) {
    stageState.status = 'failed';
    stageState.endedAt = nowIso();
    stageState.message = err instanceof Error ? err.message : 'Stage failed';
    if (jobStage) {
      jobStage.status = 'failed';
      jobStage.message = stageState.message;
    }
    appendLog(job, 'warn', `${STAGE_LABELS[stage]} failed — ${stageState.message}. Falling back to the demo engine.`);
    // Graceful fallback keeps the pipeline usable when a key is wrong or a model misbehaves.
    project.engine = 'demo';
    await executeStageLocalFallback(project, stage, seed);
    stageState.status = 'done';
    stageState.message = `${stageState.message} (fallback)`;
  }
  project.updatedAt = nowIso();
  save();
  bus.emit('update', { jobId: job.id, projectId: project.id });
}

async function executeStageLocalFallback(project: Project, stage: StageId, seed: string) {
  const brief = briefFromProject(project);
  switch (stage) {
    case 'research':
      project.research = generateResearch(brief, seed);
      break;
    case 'strategy':
      project.strategy = generateStrategy(brief, project.research!, seed);
      break;
    case 'script':
      project.script = generateScript(brief, project.research!, project.strategy!, seed);
      project.title = project.script.title;
      break;
    case 'visuals':
      project.visuals = generateVisuals(brief, project.script!, seed);
      break;
    case 'seo':
      project.seo = generateSeo(brief, project.script!, seed);
      break;
    case 'quality':
      project.quality = evaluateQuality(project);
      break;
    case 'release':
      project.schedule = project.schedule ?? {
        publishAt: nextPublishSlot(getDb().settings),
        privacy: getDb().settings.automation.privacy,
        status: 'draft',
        timezone: getDb().settings.channel.timezone,
      };
      break;
  }
}

export async function runPipeline(
  projectId: string,
  opts: { fromStage?: StageId; jobId?: string; chaptersPerMinute?: boolean } = {},
): Promise<Job> {
  const db = getDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('Project not found');
  const settings = db.settings;
  const startIndex = opts.fromStage ? STAGE_ORDER.indexOf(opts.fromStage) : STAGE_ORDER.findIndex((s) => project.stages[s].status !== 'done');
  const fromIndex = startIndex < 0 ? STAGE_ORDER.length : startIndex;

  const job: Job =
    (opts.jobId ? db.jobs.find((j) => j.id === opts.jobId) : undefined) ??
    ({
      id: uid('job'),
      projectId,
      kind: 'pipeline',
      status: 'running',
      progress: 0,
      stages: STAGE_ORDER.map((id) => ({ id, label: STAGE_LABELS[id], status: project.stages[id].status })),
      logs: [],
      createdAt: nowIso(),
    } satisfies Job);
  if (!db.jobs.find((j) => j.id === job.id)) db.jobs.unshift(job);
  job.status = 'running';
  job.error = undefined;
  db.jobs = [job, ...db.jobs.filter((j) => j.id !== job.id)].slice(0, 60);
  save();
  bus.emit('update', { jobId: job.id, projectId });

  appendLog(job, 'info', `Pipeline started for “${project.topic}”${isLive(settings) ? ' using live provider' : ' in demo mode'}`);

  for (let i = fromIndex; i < STAGE_ORDER.length; i++) {
    const stage = STAGE_ORDER[i];
    job.currentStage = STAGE_LABELS[stage];
    appendLog(job, 'info', `${STAGE_LABELS[stage]} started`);
    await executeStage(project, stage, settings, job, `${project.id}:${Date.now()}`);
    job.progress = Math.round(((i + 1) / STAGE_ORDER.length) * 100);
    bus.emit('update', { jobId: job.id, projectId });
  }

  job.status = 'done';
  job.currentStage = undefined;
  job.progress = 100;
  job.endedAt = nowIso();
  project.status = 'review';
  project.updatedAt = nowIso();
  appendLog(job, 'success', `Ready for review · quality ${project.quality?.score ?? '—'}/100`);
  logActivity('check', `“${project.title}” is ready for review`, {
    projectId,
    meta: `Quality ${project.quality?.score ?? '—'}/100`,
  });
  save();
  bus.emit('update', { jobId: job.id, projectId });
  return job;
}

export function startPipelineJob(projectId: string, opts: { fromStage?: StageId } = {}): Job {
  const db = getDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('Project not found');
  if (db.jobs.some((j) => j.projectId === projectId && j.status === 'running')) {
    throw new Error('A generation job is already running for this project');
  }
  const job: Job = {
    id: uid('job'),
    projectId,
    kind: 'pipeline',
    status: 'queued',
    progress: 0,
    stages: STAGE_ORDER.map((id) => ({ id, label: STAGE_LABELS[id], status: project.stages[id].status })),
    logs: [],
    createdAt: nowIso(),
  };
  db.jobs.unshift(job);
  project.status = 'generating';
  save();
  void runPipeline(projectId, { ...opts, jobId: job.id }).catch((err) => {
    const failedJob = db.jobs.find((j) => j.id === job.id);
    if (failedJob) {
      failedJob.status = 'failed';
      failedJob.error = err instanceof Error ? err.message : 'Unknown error';
      failedJob.endedAt = nowIso();
    }
    const p = db.projects.find((x) => x.id === projectId);
    if (p) p.status = 'failed';
    save();
    bus.emit('update', { jobId: job.id, projectId });
  });
  return job;
}

export function resetStage(project: Project, stage: StageId) {
  const idx = STAGE_ORDER.indexOf(stage);
  for (let i = idx; i < STAGE_ORDER.length; i++) {
    const id = STAGE_ORDER[i];
    project.stages[id] = { id, status: 'pending' };
  }
  project.quality = undefined;
  if (stage === 'research' || stage === 'strategy') {
    if (stage === 'research') project.strategy = undefined;
    if (stage === 'research' || stage === 'strategy') project.script = undefined;
  }
  if (['research', 'strategy', 'script'].includes(stage)) {
    project.visuals = undefined;
    project.seo = undefined;
  }
  if (stage === 'script') {
    project.visuals = undefined;
    project.seo = undefined;
  }
  if (['visuals', 'seo'].includes(stage)) {
    project.seo = stage === 'visuals' ? project.seo : undefined;
  }
  if (stage === 'release' && project.schedule?.status === 'queued') project.schedule = undefined;
  project.status = 'generating';
  project.updatedAt = nowIso();
}

export function approveProject(project: Project): { ok: boolean; error?: string } {
  const quality = evaluateQuality(project);
  project.quality = quality;
  if (quality.blockers.length) {
    save();
    return { ok: false, error: `Cannot approve: ${quality.blockers.join(', ')}` };
  }
  project.status = 'approved';
  project.approvedAt = nowIso();
  project.updatedAt = nowIso();
  if (!project.schedule) {
    project.schedule = {
      publishAt: nextPublishSlot(getDb().settings),
      privacy: getDb().settings.automation.privacy,
      status: 'draft',
      timezone: getDb().settings.channel.timezone,
    };
  }
  logActivity('check', `“${project.title}” approved`, {
    projectId: project.id,
    meta: `Scheduled ${new Date(project.schedule.publishAt).toUTCString().slice(0, 16)}`,
  });
  save();
  bus.emit('update', { projectId: project.id });
  return { ok: true };
}

export function scheduleProject(project: Project, publishAt: string, privacy: 'public' | 'unlisted' | 'private') {
  project.schedule = {
    publishAt,
    privacy,
    status: 'queued',
    timezone: getDb().settings.channel.timezone,
  };
  project.status = 'scheduled';
  project.updatedAt = nowIso();
  logActivity('calendar', `“${project.title}” queued for publishing`, {
    projectId: project.id,
    meta: new Date(publishAt).toUTCString().slice(0, 16),
  });
  save();
  bus.emit('update', { projectId: project.id });
}

export function publishProject(project: Project): void {
  project.status = 'published';
  project.publishedAt = nowIso();
  project.updatedAt = nowIso();
  project.schedule = {
    ...(project.schedule ?? { publishAt: nowIso(), privacy: 'private', timezone: getDb().settings.channel.timezone }),
    status: 'published',
    publishedAt: project.publishedAt,
    youtubeId: `DEMO-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
  };
  project.metrics = generateMetrics(project);
  project.stages.release = { ...project.stages.release, status: 'done' };
  logActivity('rocket', `“${project.title}” published (dry run)`, { projectId: project.id, meta: 'YouTube upload is simulated in demo mode' });
  save();
  bus.emit('update', { projectId: project.id });
}

export function recomputeProgress(project: Project): number {
  const done = STAGE_ORDER.filter((s) => project.stages[s].status === 'done').length;
  return Math.round((done / STAGE_ORDER.length) * 100);
}

export function summarizeProject(project: Project) {
  return {
    stageProgress: recomputeProgress(project),
    runtime: project.script ? timecode(project.script.estimatedDurationSec) : null,
    quality: project.quality?.score ?? null,
    seo: project.seo?.score ?? null,
    ctr: project.seo?.ctrPrediction ?? null,
  };
}

export function estimateProjectCost(project: Project): { label: string; value: number }[] {
  const narrationSec = project.script?.estimatedDurationSec ?? 0;
  const images = project.visuals?.scenes.length ?? 0;
  return [
    { label: 'Script tokens', value: round((project.script?.wordCount ?? 0) * 1.4) },
    { label: 'Narration seconds', value: narrationSec },
    { label: 'Generated stills', value: images },
    { label: 'Estimated spend (USD)', value: round(narrationSec * 0.0002 + images * 0.04, 2) },
  ];
}
