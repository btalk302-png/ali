export type StageId = 'research' | 'strategy' | 'script' | 'visuals' | 'seo' | 'quality' | 'release';
export type StageStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type ProjectStatus =
  | 'draft'
  | 'generating'
  | 'review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'failed';

export interface StageState {
  id: StageId;
  status: StageStatus;
  startedAt?: string;
  endedAt?: string;
  message?: string;
}

export interface TrendingAngle {
  title: string;
  why: string;
  searchInterest: number;
  competition: 'low' | 'medium' | 'high';
}

export interface Competitor {
  channel: string;
  subscribers: string;
  avgViews: string;
  pattern: string;
}

export interface KeywordCluster {
  keyword: string;
  volume: number;
  difficulty: number;
  intent: 'informational' | 'commercial' | 'entertainment';
}

export interface Research {
  summary: string;
  audienceInsights: string[];
  trendingAngles: TrendingAngle[];
  competitors: Competitor[];
  keywordClusters: KeywordCluster[];
  sources: { label: string; url: string }[];
  generatedBy: string;
}

export interface Strategy {
  bigIdea: string;
  hookAngle: string;
  targetEmotion: string;
  differentiators: string[];
  outline: { id: string; title: string; purpose: string; durationSec: number }[];
  cta: string;
  publishSlot: string;
}

export interface Beat {
  id: string;
  title: string;
  narration: string;
  bRollPrompt: string;
  durationSec: number;
  emphasis?: string;
}

export interface Script {
  title: string;
  hook: string;
  intro: string;
  beats: Beat[];
  outro: string;
  cta: string;
  wordCount: number;
  wpm: number;
  estimatedDurationSec: number;
  fullText: string;
  generatedBy: string;
}

export interface Scene {
  id: string;
  beatId: string;
  title: string;
  prompt: string;
  composition: string;
  durationSec: number;
  transition: string;
}

export interface ThumbnailConcept {
  id: string;
  headline: string;
  subline: string;
  composition: string;
  palette: [string, string, string];
  variant: 'bold' | 'glow' | 'editorial' | 'minimal';
}

export interface Visuals {
  palette: string[];
  style: string;
  scenes: Scene[];
  thumbnails: ThumbnailConcept[];
  selectedThumbnailId?: string;
  generatedBy: string;
}

export interface TitleVariant {
  text: string;
  score: number;
  reason: string;
}

export interface SeoBreakdown {
  label: string;
  score: number;
  max: number;
  note: string;
}

export interface Seo {
  titles: TitleVariant[];
  selectedTitle: string;
  description: string;
  chapters: { time: string; label: string }[];
  tags: string[];
  hashtags: string[];
  score: number;
  breakdown: SeoBreakdown[];
  searchIntent: string;
  ctrPrediction: number;
  generatedBy: string;
}

export interface QualityCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  fix?: string;
}

export interface Quality {
  score: number;
  checks: QualityCheck[];
  blockers: string[];
  reviewedAt: string;
}

export interface Metrics {
  views: number;
  watchHours: number;
  subscribers: number;
  ctr: number;
  avd: string;
  likes: number;
  comments: number;
  revenue: number;
  retention: number[];
  daily: { date: string; views: number; subs: number }[];
}

export interface Schedule {
  publishAt: string;
  privacy: 'public' | 'unlisted' | 'private';
  status: 'draft' | 'queued' | 'published';
  timezone: string;
  publishedAt?: string;
  youtubeId?: string;
}

export interface Project {
  id: string;
  title: string;
  topic: string;
  niche: string;
  audience: string;
  tone: string;
  format: 'long' | 'short';
  durationMin: number;
  style: string;
  language: string;
  status: ProjectStatus;
  stages: Record<StageId, StageState>;
  research?: Research;
  strategy?: Strategy;
  script?: Script;
  visuals?: Visuals;
  seo?: Seo;
  quality?: Quality;
  schedule?: Schedule;
  metrics?: Metrics;
  approvedAt?: string;
  publishedAt?: string;
  rejectionNote?: string;
  createdAt: string;
  updatedAt: string;
  engine: 'demo' | 'live';
}

export interface JobLog {
  t: string;
  level: 'info' | 'success' | 'warn' | 'error';
  msg: string;
}

export interface Job {
  id: string;
  projectId?: string;
  kind: 'pipeline' | 'autopilot' | 'analytics' | 'engagement';
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: number;
  currentStage?: string;
  stages: { id: string; label: string; status: StageStatus; message?: string }[];
  logs: JobLog[];
  error?: string;
  createdAt: string;
  endedAt?: string;
}

export interface Comment {
  id: string;
  projectId: string;
  author: string;
  avatarHue: number;
  text: string;
  likes: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  theme: string;
  isQuestion: boolean;
  spam: boolean;
  replied: boolean;
  replyDraft?: string;
  postedAt: string;
}

export interface Recommendation {
  id: string;
  title: string;
  insight: string;
  evidence: string;
  impact: 'high' | 'medium' | 'low';
  category: 'format' | 'hook' | 'thumbnail' | 'seo' | 'cadence' | 'audience';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface Experiment {
  id: string;
  projectId: string;
  kind: 'title' | 'thumbnail';
  variantA: string;
  variantB: string;
  impressionsA: number;
  impressionsB: number;
  ctrA: number;
  ctrB: number;
  confidence: number;
  status: 'running' | 'winner' | 'inconclusive';
  startedAt: string;
}

export interface ActivityItem {
  id: string;
  projectId?: string;
  icon: string;
  text: string;
  meta?: string;
  createdAt: string;
}

export interface ProviderConfig {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
  kind: 'text' | 'image';
}

export interface Settings {
  channel: {
    name: string;
    handle: string;
    niche: string;
    audience: string;
    language: string;
    timezone: string;
  };
  brand: {
    voice: string;
    tone: string;
    palette: string[];
    keywords: string[];
    bannedWords: string[];
  };
  automation: {
    enabled: boolean;
    cadence: 'daily' | '3-per-week' | 'weekly';
    publishHour: number;
    privacy: 'public' | 'unlisted' | 'private';
    autoApprove: boolean;
    pillars: string[];
    mandate: string;
    guardrails: string;
  };
  providers: ProviderConfig[];
  demoMode: boolean;
}

export interface Db {
  projects: Project[];
  jobs: Job[];
  comments: Comment[];
  recommendations: Recommendation[];
  experiments: Experiment[];
  activity: ActivityItem[];
  settings: Settings;
}
