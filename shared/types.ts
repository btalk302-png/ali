export type StageId = 'research' | 'strategy' | 'script' | 'visuals' | 'seo' | 'quality' | 'export';
export type StageStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type ProjectStatus = 'draft' | 'generating' | 'review' | 'ready' | 'failed';

export interface StageState {
  id: StageId;
  status: StageStatus;
  startedAt?: string;
  endedAt?: string;
  message?: string;
}

/* ------------------------------------------------------------------ research */

export interface ResearchVideo {
  videoId: string;
  title: string;
  channel: string;
  views: number;
  publishedAt: string;
  durationSec?: number;
  url: string;
  outlier?: boolean;
}

export interface ResearchSource {
  label: string;
  url: string;
  kind: 'youtube' | 'wikipedia' | 'web';
}

export interface TitleCandidate {
  text: string;
  angle: string;
  why: string;
  score: number;
  source: 'pattern' | 'ai';
}

export interface ResearchOpportunity {
  title: string;
  why: string;
  searchInterest: number;
  competition: 'low' | 'medium' | 'high';
}

export interface Research {
  keyword: string;
  queries: string[];
  summary: string;
  videos: ResearchVideo[];
  sources: ResearchSource[];
  insights: string[];
  opportunities: ResearchOpportunity[];
  titles: TitleCandidate[];
  selectedTitle?: string;
  providers: string[];
  generatedAt: string;
}

/* ------------------------------------------------------------------ strategy */

export interface Strategy {
  bigIdea: string;
  hookAngle: string;
  targetEmotion: string;
  differentiators: string[];
  outline: { id: string; title: string; purpose: string; durationSec: number }[];
  cta: string;
  generatedAt: string;
}

/* ------------------------------------------------------------------ script */

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

/* ------------------------------------------------------------------ visuals */

export interface SceneImage {
  status: 'pending' | 'ready' | 'error';
  file?: string;
  provider?: string;
  prompt?: string;
  updatedAt?: string;
  error?: string;
}

export interface SceneAudio {
  status: 'pending' | 'ready' | 'error';
  file?: string;
  provider?: string;
  voice?: string;
  durationSec?: number;
  updatedAt?: string;
  error?: string;
}

export interface Scene {
  id: string;
  beatId: string;
  title: string;
  prompt: string;
  composition: string;
  durationSec: number;
  transition: string;
  narration?: string;
  locked?: boolean;
  image?: SceneImage;
  audio?: SceneAudio;
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

/* ------------------------------------------------------------------ seo */

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

/* ------------------------------------------------------------------ quality */

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

/* ------------------------------------------------------------------ production */

export interface Production {
  status: 'idle' | 'running' | 'ready' | 'failed';
  videoFile?: string;
  captionsFile?: string;
  thumbnailFile?: string;
  durationSec?: number;
  sizeBytes?: number;
  renderedAt?: string;
  aspect?: '16:9' | '9:16';
  withNarration?: boolean;
  providerSummary?: string;
  error?: string;
}

export interface ProjectMediaSettings {
  imageProvider?: 'auto' | 'local' | 'gemini' | 'openai' | 'pollinations';
  ttsProvider?: 'auto' | 'gemini' | 'elevenlabs' | 'openai' | 'none';
  voice?: string;
  aspect?: '16:9' | '9:16';
  motion?: boolean;
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
  createdAt: string;
  updatedAt: string;
  media?: ProjectMediaSettings;
  production?: Production;
}

/* ------------------------------------------------------------------ jobs */

export interface JobLog {
  t: string;
  level: 'info' | 'success' | 'warn' | 'error';
  msg: string;
}

export interface Job {
  id: string;
  projectId?: string;
  kind: 'pipeline' | 'media' | 'research';
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: number;
  currentStage?: string;
  stages: { id: string; label: string; status: StageStatus; message?: string }[];
  logs: JobLog[];
  error?: string;
  createdAt: string;
  endedAt?: string;
}

/* ------------------------------------------------------------------ settings */

export interface ProviderConfig {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
  kind: 'text';
}

export interface MediaSettings {
  imageProvider: 'auto' | 'local' | 'gemini' | 'openai' | 'pollinations';
  ttsProvider: 'auto' | 'gemini' | 'elevenlabs' | 'openai' | 'none';
  geminiApiKey: string;
  geminiImageModel: string;
  geminiTtsModel: string;
  geminiVoice: string;
  openaiApiKey: string;
  openaiImageModel: string;
  openaiTtsModel: string;
  openaiVoice: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  defaultAspect: '16:9' | '9:16';
  motion: boolean;
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
  research: {
    youtubeApiKey: string;
    region: string;
    language: string;
    resultLimit: number;
  };
  providers: ProviderConfig[];
  media: MediaSettings;
}

export interface ActivityItem {
  id: string;
  icon: string;
  text: string;
  meta?: string;
  projectId?: string;
  at: string;
}

export interface Db {
  version: number;
  settings: Settings;
  projects: Project[];
  jobs: Job[];
  activity: ActivityItem[];
}
