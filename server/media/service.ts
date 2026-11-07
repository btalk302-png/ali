import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import sharp from 'sharp';
import type { Job, Project, Scene, Settings } from '../../shared/types.js';
import { getDb, save, logActivity } from '../store.js';
import { nowIso, uid, round, clamp } from '../util.js';
import { sceneArtSvg, artSeed } from './art.js';
import {
  generateImage,
  generateSpeech,
  resolveImageProvider,
  resolveTtsProvider,
  type ImageProviderId,
} from './providers.js';
import { runFfmpeg, probeDuration, ffmpegAvailable, FFMPEG } from './ffmpeg.js';

export const mediaBus = new EventEmitter();
mediaBus.setMaxListeners(20);

const MEDIA_ROOT = path.join(process.cwd(), 'data', 'media');
const FPS = 30;

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function projectDir(projectId: string): string {
  const dir = path.join(MEDIA_ROOT, projectId);
  ensureDir(dir);
  return dir;
}

export function absoluteMedia(relPath: string): string {
  const full = path.resolve(MEDIA_ROOT, relPath);
  if (!full.startsWith(path.resolve(MEDIA_ROOT))) throw new Error('Invalid media path');
  return full;
}

export function publicUrl(projectId: string, file?: string): string | undefined {
  if (!file) return undefined;
  const base = path.basename(file);
  return `/api/projects/${projectId}/media/${encodeURIComponent(base)}`;
}

export function aspectOf(project: Project, settings?: Settings): '16:9' | '9:16' {
  return project.media?.aspect ?? settings?.media?.defaultAspect ?? '16:9';
}

export function dimensions(aspect: '16:9' | '9:16') {
  return aspect === '16:9' ? { W: 1280, H: 720 } : { W: 720, H: 1280 };
}

export function sceneNarration(project: Project, scene: Scene): string {
  if (scene.narration && scene.narration.trim()) return scene.narration.trim();
  const beat = project.script?.beats.find((b) => b.id === scene.beatId);
  return (beat?.narration ?? '').trim();
}

function log(job: Job | undefined, level: 'info' | 'success' | 'warn' | 'error', msg: string) {
  if (!job) return;
  job.logs.push({ t: nowIso(), level, msg });
  if (job.logs.length > 300) job.logs.shift();
  mediaBus.emit('update', { jobId: job.id });
}

function setProgress(job: Job | undefined, progress: number, stage?: string) {
  if (!job) return;
  job.progress = clamp(Math.round(progress), 0, 100);
  if (stage) {
    job.currentStage = stage;
    const existing = job.stages.find((s) => s.id === stage);
    if (existing) existing.status = 'running';
  }
  mediaBus.emit('update', { jobId: job.id });
}

export function createMediaJob(projectId: string, label: string): Job {
  const job: Job = {
    id: uid('job'),
    projectId,
    kind: 'media',
    status: 'running',
    progress: 0,
    currentStage: label,
    stages: [{ id: 'media', label, status: 'running' }],
    logs: [],
    createdAt: nowIso(),
  };
  const db = getDb();
  db.jobs = [job, ...db.jobs].slice(0, 80);
  save();
  return job;
}

export function finishJob(job: Job, status: 'done' | 'failed', error?: string) {
  job.status = status;
  job.progress = status === 'done' ? 100 : job.progress;
  job.endedAt = nowIso();
  job.error = error;
  if (job.stages[0]) job.stages[0].status = status === 'done' ? 'done' : 'failed';
  save();
  mediaBus.emit('update', { jobId: job.id });
}

/* ------------------------------------------------------------------ images */

async function rasterizeLocalArt(project: Project, scene: Scene, index: number, aspect: '16:9' | '9:16'): Promise<Buffer> {
  const svg = sceneArtSvg(project, scene, index, aspect);
  const { W, H } = dimensions(aspect);
  return sharp(Buffer.from(svg)).resize(W, H, { fit: 'cover' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

export async function generateSceneImage(
  project: Project,
  scene: Scene,
  index: number,
  opts: { job?: Job; force?: boolean } = {},
): Promise<{ ok: boolean; provider: string; error?: string }> {
  const settings = getDb().settings;
  const aspect = aspectOf(project, settings);
  const dir = projectDir(project.id);
  const file = path.join(dir, `scene-${scene.id}.jpg`);
  const rel = path.relative(MEDIA_ROOT, file);
  const requested = resolveImageProvider(settings, project.media?.imageProvider);
  scene.image = { ...(scene.image ?? { status: 'pending' }), status: 'pending', updatedAt: nowIso(), provider: requested };

  const imagePrompt = [
    scene.prompt,
    project.visuals?.style,
    aspect === '9:16' ? 'vertical 9:16 composition, subject centred, safe margins for captions' : 'widescreen cinematic composition',
  ]
    .filter(Boolean)
    .join('. ');

  let provider: ImageProviderId | 'local' = requested;
  let buffer: Buffer;
  try {
    if (requested === 'local') throw new Error('local');
    const result = await generateImage(settings, imagePrompt, { provider: requested, aspect, seed: artSeed(project, scene) });
    buffer = await sharp(result.buffer).resize(dimensions(aspect).W, dimensions(aspect).H, { fit: 'cover', position: 'attention' }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    provider = result.provider;
  } catch (err) {
    if (requested !== 'local') {
      log(opts.job, 'warn', `${requested} image failed for scene ${index + 1} — using studio art instead (${err instanceof Error ? err.message.slice(0, 120) : 'error'})`);
    }
    buffer = await rasterizeLocalArt(project, scene, index, aspect);
    provider = requested === 'local' ? 'local' : 'local';
  }

  await fs.promises.writeFile(file, buffer);
  scene.image = {
    status: 'ready',
    file: rel,
    provider,
    prompt: imagePrompt,
    updatedAt: nowIso(),
  };
  save();
  return { ok: true, provider };
}

/* ------------------------------------------------------------------ speech */

export async function generateSceneSpeech(
  project: Project,
  scene: Scene,
  index: number,
  opts: { job?: Job } = {},
): Promise<{ ok: boolean; provider?: string; durationSec?: number; error?: string }> {
  const settings = getDb().settings;
  const provider = resolveTtsProvider(settings, project.media?.ttsProvider);
  const text = sceneNarration(project, scene);

  if (!provider) {
    scene.audio = { status: 'error', error: 'No narration provider configured. Add a free Google AI Studio key in Settings → Voice.', updatedAt: nowIso() };
    save();
    return { ok: false, error: scene.audio.error };
  }
  if (!text) {
    scene.audio = { status: 'error', error: 'Scene has no narration text to speak.', updatedAt: nowIso() };
    save();
    return { ok: false, error: scene.audio.error };
  }

  const voice = project.media?.voice || (provider === 'gemini' ? settings.media.geminiVoice : provider === 'openai' ? settings.media.openaiVoice : settings.media.elevenLabsVoiceId);
  const dir = projectDir(project.id);
  try {
    const result = await generateSpeech(settings, text, { provider, voice });
    const file = path.join(dir, `scene-${scene.id}.${result.ext}`);
    await fs.promises.writeFile(file, result.buffer);
    const duration = (await probeDuration(file)) ?? undefined;
    scene.audio = {
      status: 'ready',
      file: path.relative(MEDIA_ROOT, file),
      provider: result.provider,
      voice: result.voice,
      durationSec: duration ? round(duration, 2) : undefined,
      updatedAt: nowIso(),
    };
    save();
    log(opts.job, 'success', `Scene ${index + 1} narration · ${voice} · ${duration ? `${round(duration, 1)}s` : 'ready'}`);
    return { ok: true, provider: result.provider, durationSec: duration };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Narration failed';
    scene.audio = { status: 'error', error: message.slice(0, 300), provider, updatedAt: nowIso() };
    save();
    log(opts.job, 'warn', `Scene ${index + 1} narration failed — ${message.slice(0, 160)}`);
    return { ok: false, error: message };
  }
}

/* ------------------------------------------------------------------ bulk generation */

export async function generateAllImages(project: Project, job: Job, onlyMissing = false) {
  const scenes = project.visuals?.scenes ?? [];
  log(job, 'info', `Rendering ${scenes.length} scene images with ${resolveImageProvider(getDb().settings, project.media?.imageProvider)}`);
  let done = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (onlyMissing && scene.image?.status === 'ready' && scene.image.file && fs.existsSync(absoluteMedia(scene.image.file))) {
      done++;
      continue;
    }
    setProgress(job, (i / scenes.length) * 100, `Visual ${i + 1} of ${scenes.length}`);
    await generateSceneImage(project, scene, i, { job });
    done++;
    setProgress(job, (done / scenes.length) * 100);
    save();
  }
  project.updatedAt = nowIso();
  save();
  log(job, 'success', `${done} scene images ready`);
}

export async function generateAllSpeech(project: Project, job: Job) {
  const scenes = project.visuals?.scenes ?? [];
  const settings = getDb().settings;
  const provider = resolveTtsProvider(settings, project.media?.ttsProvider);
  if (!provider) {
    log(job, 'warn', 'No narration provider configured — skipping voiceover. Add a free Google AI Studio key in Settings → Voice.');
    return { generated: 0, skipped: true };
  }
  log(job, 'info', `Generating narration with ${provider}${project.media?.voice ? ` · ${project.media.voice}` : ''}`);
  let generated = 0;
  for (let i = 0; i < scenes.length; i++) {
    setProgress(job, (i / scenes.length) * 100, `Narration ${i + 1} of ${scenes.length}`);
    const res = await generateSceneSpeech(project, scenes[i], i, { job });
    if (res.ok) generated++;
    setProgress(job, ((i + 1) / scenes.length) * 100);
  }
  save();
  log(job, generated ? 'success' : 'warn', generated ? `${generated} narration clips ready` : 'No narration clips were produced');
  return { generated, skipped: false };
}

/* ------------------------------------------------------------------ video render */

/** Split narration into readable subtitle chunks (~16 words) that fit a 2-line cue. */
function captionChunks(text: string, wordsPerCue = 16): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerCue) {
    chunks.push(words.slice(i, i + wordsPerCue).join(' '));
  }
  return chunks;
}

function wrapCaption(text: string, maxChars = 74, maxLines = 2): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > maxChars) {
      if (line) lines.push(line.trim());
      line = word;
    } else {
      line = (line + ' ' + word).trim();
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line.trim());
  return lines.join('\n');
}

function srtTime(seconds: number): string {
  const ms = Math.round((seconds % 1) * 1000);
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

async function renderSceneClip(
  project: Project,
  scene: Scene,
  index: number,
  duration: number,
  aspect: '16:9' | '9:16',
  dir: string,
  motion: boolean,
): Promise<string> {
  const { W, H } = dimensions(aspect);
  const imagePath = scene.image?.file ? absoluteMedia(scene.image.file) : '';
  if (!imagePath || !fs.existsSync(imagePath)) throw new Error(`Scene ${index + 1} has no image`);
  const audioPath = scene.audio?.status === 'ready' && scene.audio.file ? absoluteMedia(scene.audio.file) : '';
  const clipPath = path.join(dir, `clip-${String(index + 1).padStart(2, '0')}.mp4`);
  const frames = Math.max(FPS, Math.round(duration * FPS));
  // 1.12x headroom is all the Ken Burns move needs — 4x cheaper than a 2x upscale.
  const scaleW = Math.round(W * 1.12 / 2) * 2;
  const scaleH = Math.round(H * 1.12 / 2) * 2;
  const zoom = motion
    ? `zoompan=z='min(zoom+0.0004,1.09)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS}`
    : `scale=${W}:${H},fps=${FPS}`;

  const args = ['-y', '-i', imagePath];
  if (audioPath) args.push('-i', audioPath);
  else args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');

  args.push(
    '-filter_complex',
    `[0:v]scale=${scaleW}:${scaleH}:force_original_aspect_ratio=increase,crop=${scaleW}:${scaleH},${zoom},format=yuv420p[v]`,
    '-map',
    '[v]',
    '-map',
    '1:a',
    '-af',
    'apad',
    '-t',
    duration.toFixed(2),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '21',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(FPS),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    clipPath,
  );
  await runFfmpeg(args);
  return clipPath;
}

export async function renderProject(project: Project, job: Job): Promise<void> {
  if (!ffmpegAvailable()) throw new Error('ffmpeg is not available on this machine');
  const settings = getDb().settings;
  const aspect = aspectOf(project, settings);
  const scenes = project.visuals?.scenes ?? [];
  if (scenes.length === 0) throw new Error('This project has no scenes to render');

  project.production = { status: 'running', aspect };
  save();
  log(job, 'info', `Render started · ${scenes.length} scenes · ${aspect} · ${ffmpegPathLabel()}`);

  // 1) images
  for (let i = 0; i < scenes.length; i++) {
    setProgress(job, (i / scenes.length) * 30, 'Scene visuals');
    const scene = scenes[i];
    if (!scene.image?.file || !fs.existsSync(absoluteMedia(scene.image.file))) {
      await generateSceneImage(project, scene, i, { job });
    }
  }
  save();

  // 2) narration (only when a provider exists)
  const tts = resolveTtsProvider(settings, project.media?.ttsProvider);
  if (tts) {
    const missing = scenes.filter((s) => s.audio?.status !== 'ready' || !s.audio.file);
    for (let i = 0; i < missing.length; i++) {
      setProgress(job, 30 + (i / Math.max(1, missing.length)) * 25, 'Narration');
      const idx = scenes.indexOf(missing[i]);
      await generateSceneSpeech(project, missing[i], idx, { job });
    }
  } else {
    log(job, 'warn', 'No narration provider — rendering a silent video. Add a free Google AI Studio key for voice.');
  }
  save();

  // 3) clips
  const dir = projectDir(project.id);
  const clipPaths: string[] = [];
  const durations: number[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const planned = scene.durationSec > 0 ? scene.durationSec : 6;
    const audioDur = scene.audio?.status === 'ready' ? scene.audio.durationSec ?? 0 : 0;
    const duration = clamp(Math.max(planned, audioDur + 0.35), 1.5, 90);
    durations.push(duration);
    setProgress(job, 55 + (i / scenes.length) * 40, `Editing clip ${i + 1} of ${scenes.length}`);
    log(job, 'info', `Clip ${i + 1} · ${duration.toFixed(1)}s${audioDur ? ` with narration (${audioDur.toFixed(1)}s)` : ''}`);
    const clip = await renderSceneClip(project, scene, i, duration, aspect, dir, settings.media.motion !== false);
    clipPaths.push(clip);
    setProgress(job, 55 + ((i + 1) / scenes.length) * 40);
  }

  // 4) concat
  setProgress(job, 96, 'Assembling final cut');
  const listFile = path.join(dir, 'clips.txt');
  fs.writeFileSync(listFile, clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  const videoAbs = path.join(dir, 'final.mp4');
  try {
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', videoAbs]);
  } catch {
    // re-encode fallback when copy concat refuses mixed streams
    await runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '21',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      videoAbs,
    ]);
  }

  // 5) captions + poster
  const srtPath = path.join(dir, 'captions.srt');
  let cursor = 0;
  let cueIndex = 0;
  const cues: string[] = [];
  scenes.forEach((scene, i) => {
    const text = sceneNarration(project, scene);
    const chunks = text ? captionChunks(text) : [];
    const words = Math.max(1, chunks.reduce((sum, chunk) => sum + chunk.split(' ').length, 0));
    const sceneDuration = durations[i] ?? 0;
    // a cue never escapes its own scene, and short scenes still get proportional time
    for (const chunk of chunks) {
      const share = (chunk.split(' ').length / words) * sceneDuration;
      cues.push(`${++cueIndex}\n${srtTime(cursor)} --> ${srtTime(cursor + share)}\n${wrapCaption(chunk)}\n`);
      cursor += share;
    }
    if (!chunks.length) cursor += sceneDuration;
  });
  fs.writeFileSync(srtPath, cues.join('\n'));

  const posterPath = path.join(dir, 'poster.jpg');
  try {
    await runFfmpeg(['-y', '-ss', '1', '-i', videoAbs, '-frames:v', '1', '-q:v', '3', posterPath], 60_000);
  } catch {
    if (scenes[0]?.image?.file) fs.copyFileSync(absoluteMedia(scenes[0].image.file), posterPath);
  }

  const stat = fs.statSync(videoAbs);
  const duration = await probeDuration(videoAbs);
  project.production = {
    status: 'ready',
    videoFile: path.relative(MEDIA_ROOT, videoAbs),
    captionsFile: path.relative(MEDIA_ROOT, srtPath),
    thumbnailFile: path.relative(MEDIA_ROOT, posterPath),
    durationSec: round(duration ?? durations.reduce((s, d) => s + d, 0), 1),
    sizeBytes: stat.size,
    renderedAt: nowIso(),
    aspect,
    withNarration: scenes.some((s) => s.audio?.status === 'ready'),
    providerSummary: `${scenes[0]?.image?.provider ?? 'local'} visuals · ${scenes.some((s) => s.audio?.status === 'ready') ? scenes[0]?.audio?.provider ?? 'voice' : 'silent'}`,
  };
  project.updatedAt = nowIso();
  save();
  log(job, 'success', `Final video ready · ${(stat.size / 1024 / 1024).toFixed(1)} MB · ${project.production.durationSec}s`);
  logActivity('film', `“${project.title}” rendered as MP4`, { projectId: project.id, meta: `${project.production.durationSec}s · ${aspect}` });
}

function ffmpegPathLabel(): string {
  return FFMPEG.includes('node_modules') ? 'bundled ffmpeg' : FFMPEG;
}

export function mediaPayload(project: Project) {
  const settings = getDb().settings;
  const db = getDb();
  const scenes = project.visuals?.scenes ?? [];
  return {
    production: project.production ?? { status: 'idle' },
    job: db.jobs.find((j) => j.projectId === project.id && j.kind === 'media') ?? null,
    settings: {
      ...getDb().settings.media,
      geminiApiKey: settings.media.geminiApiKey ? '•••• saved' : '',
      openaiApiKey: settings.media.openaiApiKey ? '•••• saved' : '',
      elevenLabsApiKey: settings.media.elevenLabsApiKey ? '•••• saved' : '',
    },
    overrides: project.media ?? {},
    aspect: aspectOf(project, settings),
    scenes: scenes.map((scene, index) => ({
      id: scene.id,
      index,
      title: scene.title,
      prompt: scene.prompt,
      narration: sceneNarration(project, scene),
      durationSec: scene.durationSec,
      image: scene.image
        ? { ...scene.image, url: scene.image.file ? `${publicUrl(project.id, scene.image.file)}?v=${encodeURIComponent(scene.image.updatedAt ?? '')}` : undefined }
        : undefined,
      audio: scene.audio
        ? { ...scene.audio, url: scene.audio.file ? `${publicUrl(project.id, scene.audio.file)}?v=${encodeURIComponent(scene.audio.updatedAt ?? '')}` : undefined }
        : undefined,
    })),
    videoUrl: project.production?.status === 'ready' && project.production.videoFile ? `/api/projects/${project.id}/video` : undefined,
    downloadUrl: project.production?.status === 'ready' ? `/api/projects/${project.id}/download` : undefined,
    captionsUrl: project.production?.status === 'ready' ? `/api/projects/${project.id}/captions` : undefined,
    posterUrl: project.production?.thumbnailFile ? `/api/projects/${project.id}/media/${encodeURIComponent(path.basename(project.production.thumbnailFile))}` : undefined,
  };
}
