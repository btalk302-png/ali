import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

function resolveFfmpeg(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  try {
    const installer = require('@ffmpeg-installer/ffmpeg') as { path: string };
    if (installer?.path && fs.existsSync(installer.path)) return installer.path;
  } catch {
    // optional dependency not installed — fall back to PATH
  }
  return 'ffmpeg';
}

export const FFMPEG = resolveFfmpeg();

export function ffmpegAvailable(): boolean {
  return Boolean(FFMPEG);
}

/** Runs ffmpeg and resolves with its stderr tail (useful for debugging render failures). */
export function runFfmpeg(args: string[], timeoutMs = 15 * 60_000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('ffmpeg timed out'));
    }, timeoutMs);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ code, stderr });
      else reject(new Error(`ffmpeg failed (${code}): ${stderr.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 500)}`));
    });
  });
}

/** Parse duration out of ffmpeg's banner — avoids needing a separate ffprobe binary. */
export async function probeDuration(file: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const child = spawn(FFMPEG, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let text = '';
    child.stderr.on('data', (c) => (text += String(c)));
    child.on('close', () => {
      const match = text.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (!match) return resolve(undefined);
      const [, h, m, s] = match;
      resolve(Number(h) * 3600 + Number(m) * 60 + Number(s));
    });
    child.on('error', () => resolve(undefined));
  });
}
