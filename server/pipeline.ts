import { EventEmitter } from 'node:events';
import type { Job, Project, Research, Settings, StageId, StageState } from '../shared/types.js';
import { aiComplete, isLive, RelayNeeded, requireProvider } from './ai.js';
import { evaluateQuality } from './quality.js';
import { runResearch } from './research.js';
import { scriptStage, seoStage, strategyStage, visualsStage } from './stages.js';
import { getDb, logActivity, save } from './store.js';
import { nowIso, timecode, uid } from './util.js';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

export const STAGE_ORDER: StageId[] = ['research', 'strategy', 'script', 'visuals', 'seo', 'quality', 'export'];

export const STAGE_LABELS: Record<StageId, string> = {
  research: 'Title research',
  strategy: 'Strategy',
  script: 'Script',
  visuals: 'Visuals',
  seo: 'SEO',
  quality: 'Quality check',
  export: 'Export',
};

export function emptyStages(): Record<StageId, StageState> {
  return Object.fromEntries(STAGE_ORDER.map((id) => [id, { id, status: 'pending' }])) as Record<StageId, StageState>;
}

export interface CreateProjectInput {
  topic: string;
  title?: string;
  niche?: string;
  audience?: string;
  tone?: string;
  format?: 'long' | 'short';
  durationMin?: number;
  style?: string;
  language?: string;
  research?: Research;
}

export function createProject(input: CreateProjectInput): Project {
  const settings = getDb().settings;
  const topic = input.topic.trim();
  const research = input.research && input.research.keyword.toLowerCase() === topic.toLowerCase() ? input.research : undefined;
  const project: Project = {
    id: uid('prj'),
    title: input.title?.trim() || research?.selectedTitle || topic,
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
  };
  if (research) {
    project.research = { ...research, selectedTitle: project.title };
    project.stages.research = { ...project.stages.research, status: 'done', message: `${research.videos.length} videos · ${research.titles.length} titles`, endedAt: nowIso() };
  }
  getDb().projects.unshift(project);
  logActivity('sparkles', `New project — ${project.title}`, { projectId: project.id, meta: project.niche });
  save();
  return project;
}

function appendLog(job: Job, level: 'info' | 'success' | 'warn' | 'error', msg: string) {
  job.logs.push({ t: nowIso(), level, msg });
  if (job.logs.length > 250) job.logs.shift();
  bus.emit('update', { jobId: job.id });
}

export function recomputeProgress(project: Project): number {
  const done = STAGE_ORDER.filter((s) => project.stages[s].status === 'done').length;
  return Math.round((done / STAGE_ORDER.length) * 100);
}

async function executeStage(project: Project, stage: StageId, settings: Settings): Promise<string> {
  const state = project.stages[stage];
  state.status = 'running';
  state.startedAt = nowIso();
  state.message = 'Working…';
  delete state.relayKey;
  project.status = 'generating';
  project.updatedAt = nowIso();
  save();
  bus.emit('update', { projectId: project.id });

  let message = '';
  try {
    switch (stage) {
      case 'research': {
        const research = await runResearch(settings, { keyword: project.topic });
        if (project.research?.selectedTitle && project.research.keyword.toLowerCase() === research.keyword.toLowerCase()) {
          research.selectedTitle = project.research.selectedTitle;
          research.titles = [project.research.titles[0], ...research.titles].filter(Boolean) as Research['titles'];
        }
        project.research = research;
        if (project.research?.selectedTitle) project.title = project.research.selectedTitle;
        message = `${research.videos.length} videos · ${research.titles.length} title options`;
        break;
      }
      case 'strategy': {
        project.strategy = await strategyStage(project, settings);
        message = `${project.strategy.outline.length} sections · ${project.strategy.outline.reduce((s, o) => s + o.durationSec, 0)}s plan`;
        break;
      }
      case 'script': {
        project.script = await scriptStage(project, settings);
        message = `${project.script.wordCount} words · ${timecode(project.script.estimatedDurationSec)}`;
        if (project.research?.selectedTitle) {
          project.title = project.research.selectedTitle;
        } else if (project.script.title) {
          project.title = project.script.title;
        }
        break;
      }
      case 'visuals': {
        project.visuals = await visualsStage(project, settings);
        message = `${project.visuals.scenes.length} scenes · ${project.visuals.thumbnails.length} thumbnails`;
        break;
      }
      case 'seo': {
        project.seo = await seoStage(project, settings);
        message = `SEO ${project.seo.score}/100 · ${project.seo.tags.length} tags`;
        break;
      }
      case 'quality': {
        project.quality = evaluateQuality(project);
        message = `${project.quality.score}/100 · ${project.quality.blockers.length} blockers`;
        break;
      }
      case 'export': {
        if (!project.script) throw new Error('Nothing to export yet — run the script stage.');
        project.quality = evaluateQuality(project);
        message = project.quality.blockers.length
          ? `${project.quality.blockers.length} blocker(s) — fix before shipping`
          : 'Package ready to download';
        break;
      }
    }
    state.status = 'done';
    state.endedAt = nowIso();
    state.message = message;
    delete state.relayKey;
    return message;
  } catch (err) {
    state.status = 'failed';
    state.endedAt = nowIso();
    if (err instanceof RelayNeeded) {
      state.relayKey = err.key;
      // err.reason already names the label, host and socket error — pass it through untouched.
      state.message = `${err.reason}. Your browser can reach it — the app is fetching this request now.`;
    } else {
      state.message = err instanceof Error ? err.message : 'Stage failed';
    }
    throw err;
  } finally {
    save();
    bus.emit('update', { projectId: project.id });
  }
}

export async function runPipeline(projectId: string, opts: { fromStage?: StageId; jobId?: string } = {}): Promise<Job> {
  const db = getDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('Project not found');
  const settings = db.settings;
  const startIndex = opts.fromStage
    ? STAGE_ORDER.indexOf(opts.fromStage)
    : STAGE_ORDER.findIndex((s) => project.stages[s].status !== 'done');
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

  job.status = 'running';
  job.error = undefined;
  db.jobs = [job, ...db.jobs.filter((j) => j.id !== job.id)].slice(0, 60);
  save();
  bus.emit('update', { jobId: job.id, projectId });
  appendLog(job, 'info', `Pipeline started · ${isLive(settings) ? requireProvider(settings).label : 'no provider configured'}`);

  try {
    for (let i = fromIndex; i < STAGE_ORDER.length; i++) {
      const stage = STAGE_ORDER[i];
      const jobStage = job.stages.find((s) => s.id === stage);
      if (jobStage) jobStage.status = 'running';
      job.currentStage = STAGE_LABELS[stage];
      appendLog(job, 'info', `${STAGE_LABELS[stage]} started`);
      try {
        const message = await executeStage(project, stage, settings);
        if (jobStage) {
          jobStage.status = 'done';
          jobStage.message = message;
        }
        appendLog(job, 'success', `${STAGE_LABELS[stage]} — ${message}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Stage failed';
        if (jobStage) {
          jobStage.status = 'failed';
          jobStage.message = message;
        }
        appendLog(job, 'error', `${STAGE_LABELS[stage]} failed — ${message}`);
        throw new Error(`${STAGE_LABELS[stage]}: ${message}`);
      }
      job.progress = Math.round(((i + 1) / STAGE_ORDER.length) * 100);
      bus.emit('update', { jobId: job.id, projectId });
    }

    project.status = project.quality?.blockers.length ? 'review' : 'ready';
    project.updatedAt = nowIso();
    job.status = 'done';
    job.progress = 100;
    job.currentStage = undefined;
    job.endedAt = nowIso();
    appendLog(job, 'success', `Pipeline complete · quality ${project.quality?.score ?? '—'}/100`);
    logActivity('check', `“${project.title}” is ready`, { projectId, meta: `Quality ${project.quality?.score ?? '—'}/100` });
  } catch (err) {
    project.status = 'failed';
    project.updatedAt = nowIso();
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : 'Pipeline failed';
    job.endedAt = nowIso();
  }
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
  requireProvider(db.settings);
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
    console.error('[pipeline]', err);
  });
  return job;
}

/** Clears this stage and everything after it, so regeneration can't mix stale artefacts. */
export function resetStage(project: Project, stage: StageId) {
  const idx = STAGE_ORDER.indexOf(stage);
  for (let i = idx; i < STAGE_ORDER.length; i++) {
    const id = STAGE_ORDER[i];
    project.stages[id] = { id, status: 'pending' };
  }
  if (idx <= STAGE_ORDER.indexOf('research')) project.research = undefined;
  if (idx <= STAGE_ORDER.indexOf('strategy')) project.strategy = undefined;
  if (idx <= STAGE_ORDER.indexOf('script')) project.script = undefined;
  if (idx <= STAGE_ORDER.indexOf('script')) {
    project.visuals = undefined;
    project.seo = undefined;
  }
  if (idx <= STAGE_ORDER.indexOf('visuals')) project.visuals = undefined;
  if (idx <= STAGE_ORDER.indexOf('seo')) project.seo = undefined;
  project.quality = undefined;
  project.production = undefined;
  project.status = 'draft';
  project.updatedAt = nowIso();
}

export function summarizeProject(project: Project) {
  return {
    stageProgress: recomputeProgress(project),
    quality: project.quality?.score ?? null,
    runtime: project.script ? timecode(project.script.estimatedDurationSec) : null,
    runtimeSec: project.script?.estimatedDurationSec ?? null,
    scenes: project.visuals?.scenes.length ?? 0,
    titles: project.research?.titles.length ?? 0,
    researchVideos: project.research?.videos.length ?? 0,
    production: project.production?.status ?? 'idle',
  };
}

export function exportPackage(project: Project): { filename: string; markdown: string } {
  const r = project.research;
  const s = project.strategy;
  const sc = project.script;
  const seo = project.seo;
  const lines: string[] = [
    `# ${project.title}`,
    '',
    `- Topic: ${project.topic}`,
    `- Niche: ${project.niche}`,
    `- Audience: ${project.audience}`,
    `- Format: ${project.format === 'short' ? 'Short' : `${project.durationMin} min`}`,
    `- Quality: ${project.quality?.score ?? '—'}/100`,
    `- Rendered MP4: ${project.production?.status === 'ready' ? `${timecode(project.production.durationSec ?? 0)} ready to download` : 'not rendered yet'}`,
    '',
  ];
  if (r) {
    lines.push('## Research (real sources)', '', r.summary, '');
    if (r.videos.length) {
      lines.push('### Top performing videos', '');
      for (const v of r.videos.slice(0, 10)) lines.push(`- [${v.title}](${v.url}) — ${v.channel}, ${v.views.toLocaleString()} views`);
      lines.push('');
    }
    lines.push('### Title options', '');
    for (const t of r.titles.slice(0, 8)) lines.push(`- ${t.text} (${t.score}) — ${t.why}`);
    lines.push('', '### Sources', '');
    for (const src of r.sources) lines.push(`- [${src.label}](${src.url})`);
    lines.push('');
  }
  if (s) {
    lines.push('## Strategy', '', `**Big idea** ${s.bigIdea}`, '', `**Hook** ${s.hookAngle}`, '', `**Emotion** ${s.targetEmotion}`, '');
    lines.push('### Outline', '');
    s.outline.forEach((o, i) => lines.push(`${i + 1}. ${o.title} — ${o.purpose} (${o.durationSec}s)`));
    lines.push('', `**CTA** ${s.cta}`, '');
  }
  if (sc) {
    lines.push('## Script', '', `**Hook:** ${sc.hook}`, '');
    sc.beats.forEach((b, i) => lines.push(`### ${i + 1}. ${b.title} (${b.durationSec}s)`, '', b.narration, '', `*B-roll:* ${b.bRollPrompt}`, ''));
    lines.push(`**Outro:** ${sc.outro}`, '', `**CTA:** ${sc.cta}`, '');
  }
  if (seo) {
    lines.push('## SEO package', '', `**Description**`, '', seo.description, '', `**Tags:** ${seo.tags.join(', ')}`, '', `**Hashtags:** ${seo.hashtags.map((h) => `#${h}`).join(' ')}`, '');
  }
  if (project.quality) {
    lines.push('## Quality checks', '');
    for (const c of project.quality.checks) lines.push(`- ${c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌'} **${c.label}** — ${c.detail}`);
    lines.push('');
  }
  const filename = `${project.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 70) || 'video'}-package.md`;
  return { filename, markdown: lines.join('\n') };
}
