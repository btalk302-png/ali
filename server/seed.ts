import type { Db, Project, StageId, StageStatus } from '../shared/types.js';
import {
  evaluateQuality,
  generateResearch,
  generateScript,
  generateSeo,
  generateStrategy,
  generateVisuals,
  type Brief,
} from './content-engine.js';
import { DEFAULT_SETTINGS } from './defaults.js';
import { addDays, nowIso, uid } from './util.js';
import { buildExperiment, buildRecommendations, generateMetrics, seedComments } from './analytics-engine.js';

const STAGES: StageId[] = ['research', 'strategy', 'script', 'visuals', 'seo', 'quality', 'release'];

interface SeedSpec {
  topic: string;
  format: 'long' | 'short';
  durationMin: number;
  tone: string;
  style: string;
  status: Project['status'];
  publishedDaysAgo?: number;
  scheduledInDays?: number;
  stageCount?: number;
  qualityOverrides?: Partial<Project['quality']>;
}

const SPECS: SeedSpec[] = [
  {
    topic: 'The 3-layer system behind every channel that compounds',
    format: 'long',
    durationMin: 9,
    tone: 'Analytical',
    style: 'Cinematic',
    status: 'published',
    publishedDaysAgo: 12,
  },
  {
    topic: 'I tested 7 AI video tools so you do not have to',
    format: 'long',
    durationMin: 11,
    tone: 'Friendly expert',
    style: 'Editorial',
    status: 'published',
    publishedDaysAgo: 5,
  },
  {
    topic: 'Retention is a design problem, not an editing problem',
    format: 'long',
    durationMin: 8,
    tone: 'Analytical',
    style: 'Neon',
    status: 'scheduled',
    scheduledInDays: 2,
  },
  {
    topic: 'The creator stack nobody talks about',
    format: 'long',
    durationMin: 7,
    tone: 'Friendly expert',
    style: 'Cinematic',
    status: 'approved',
    scheduledInDays: 4,
  },
  {
    topic: 'Stop chasing trends and build a format instead',
    format: 'long',
    durationMin: 10,
    tone: 'High energy',
    style: 'Cinematic',
    status: 'review',
  },
  {
    topic: 'Why your AI workflow keeps breaking',
    format: 'short',
    durationMin: 1,
    tone: 'High energy',
    style: 'Neon',
    status: 'review',
  },
  {
    topic: 'The 90-day channel rebuild',
    format: 'long',
    durationMin: 12,
    tone: 'Documentary',
    style: 'Cinematic',
    status: 'generating',
    stageCount: 3,
  },
  {
    topic: 'What 100 thumbnails taught me about curiosity',
    format: 'long',
    durationMin: 8,
    tone: 'Analytical',
    style: 'Editorial',
    status: 'draft',
    stageCount: 0,
  },
];

function buildProject(spec: SeedSpec, index: number): Project {
  const settings = DEFAULT_SETTINGS;
  const brief: Brief = {
    topic: spec.topic,
    niche: settings.channel.niche,
    audience: settings.channel.audience,
    tone: spec.tone,
    format: spec.format,
    durationMin: spec.durationMin,
    style: spec.style,
  };
  const id = `prj_seed${String(index + 1).padStart(2, '0')}`;
  const createdAt = addDays(new Date(), -(20 - index * 2)).toISOString();
  const seed = `seed-${id}`;
  const stageCount = spec.stageCount ?? STAGES.length;

  const stages = Object.fromEntries(
    STAGES.map((stageId, i) => [
      stageId,
      {
        id: stageId,
        status: (spec.status === 'draft' ? 'pending' : i < stageCount ? 'done' : 'pending') as StageStatus,
        startedAt: i < stageCount ? createdAt : undefined,
        endedAt: i < stageCount ? createdAt : undefined,
      },
    ]),
  ) as Project['stages'];

  const project: Project = {
    id,
    title: spec.topic,
    topic: spec.topic,
    niche: settings.channel.niche,
    audience: settings.channel.audience,
    tone: spec.tone,
    format: spec.format,
    durationMin: spec.format === 'short' ? 1 : spec.durationMin,
    style: spec.style,
    language: 'English',
    status: spec.status,
    stages,
    createdAt,
    updatedAt: createdAt,
    engine: 'demo',
  };

  if (stageCount >= 1) project.research = generateResearch(brief, seed);
  if (stageCount >= 2) project.strategy = generateStrategy(brief, project.research!, seed);
  if (stageCount >= 3) {
    project.script = generateScript(brief, project.research!, project.strategy!, seed);
    project.title = project.script.title;
  }
  if (stageCount >= 4) project.visuals = generateVisuals(brief, project.script!, seed);
  if (stageCount >= 5) project.seo = generateSeo(brief, project.script!, seed);
  if (stageCount >= 6) project.quality = evaluateQuality(project);
  if (stageCount >= 7) {
    if (spec.status === 'published') {
      project.publishedAt = addDays(new Date(), -(spec.publishedDaysAgo ?? 7)).toISOString();
      project.schedule = {
        publishAt: project.publishedAt,
        privacy: 'public',
        status: 'published',
        timezone: settings.channel.timezone,
        publishedAt: project.publishedAt,
        youtubeId: `DEMO-${project.id.slice(-5).toUpperCase()}`,
      };
      project.metrics = generateMetrics({ ...project, publishedAt: project.publishedAt });
    } else {
      project.schedule = {
        publishAt: addDays(new Date(), spec.scheduledInDays ?? 3).toISOString(),
        privacy: 'private',
        status: spec.status === 'scheduled' || spec.status === 'approved' ? 'queued' : 'draft',
        timezone: settings.channel.timezone,
      };
    }
  }
  if (spec.status === 'approved') project.approvedAt = addDays(new Date(), -1).toISOString();
  return project;
}

export function seedDatabase(): Db {
  const projects = SPECS.map(buildProject);

  const published = projects.filter((p) => p.status === 'published');
  const comments = published.flatMap((p) => seedComments(p, p.id.endsWith('01') ? 8 : 6));
  // a couple of replied threads for realism
  comments.slice(0, 2).forEach((c) => {
    c.replied = true;
    c.replyDraft = 'Appreciate you watching — the checklist link is in the description, and layer three is where most people stop early.';
  });

  const db: Db = {
    projects,
    jobs: [
      {
        id: uid('job'),
        projectId: projects[0].id,
        kind: 'pipeline',
        status: 'done',
        progress: 100,
        stages: STAGES.map((id) => ({ id, label: id, status: 'done' })),
        logs: [
          { t: addDays(new Date(), -12).toISOString(), level: 'info', msg: 'Pipeline started' },
          { t: addDays(new Date(), -12).toISOString(), level: 'success', msg: 'Ready for review · quality 92/100' },
          { t: addDays(new Date(), -12).toISOString(), level: 'success', msg: 'Published to the queue after manual approval' },
        ],
        createdAt: addDays(new Date(), -12).toISOString(),
        endedAt: addDays(new Date(), -12).toISOString(),
      },
    ],
    comments,
    recommendations: [],
    experiments: [],
    activity: [
      { id: uid('act'), icon: 'rocket', text: '“I tested 7 AI video tools so you do not have to” published', meta: '5 days ago · 41.2K views on day one', createdAt: addDays(new Date(), -5).toISOString() },
      { id: uid('act'), icon: 'trending', text: 'CTR up 18% versus your 30-day baseline', meta: 'Thumbnail variant B is winning', createdAt: addDays(new Date(), -3).toISOString() },
      { id: uid('act'), icon: 'message', text: 'Audience requested a follow-up on playlist structure', meta: '6 comments · same theme', createdAt: addDays(new Date(), -2).toISOString() },
      { id: uid('act'), icon: 'calendar', text: '“Retention is a design problem” queued', meta: 'Publishes in 2 days', createdAt: addDays(new Date(), -1).toISOString() },
      { id: uid('act'), icon: 'check', text: '“The creator stack nobody talks about” approved', meta: 'Quality 88/100', createdAt: addDays(new Date(), -1).toISOString() },
    ],
    settings: structuredClone(DEFAULT_SETTINGS),
  };

  db.recommendations = buildRecommendations(db);
  db.experiments = published.map((p) => buildExperiment(p));
  return db;
}
