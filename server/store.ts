import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../shared/types.js';
import { DEFAULT_SETTINGS } from './defaults.js';

export { DEFAULT_SETTINGS };

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'store.json');

let db: Db;
let writeTimer: NodeJS.Timeout | null = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function emptyDb(): Db {
  return { version: 2, settings: structuredClone(DEFAULT_SETTINGS), projects: [], jobs: [], activity: [] };
}

function mergeSettings(saved: any): Db['settings'] {
  const next = structuredClone(DEFAULT_SETTINGS);
  if (!saved || typeof saved !== 'object') return next;
  next.channel = { ...next.channel, ...(saved.channel ?? {}) };
  next.brand = { ...next.brand, ...(saved.brand ?? {}) };
  next.research = { ...next.research, ...(saved.research ?? {}) };
  next.media = { ...next.media, ...(saved.media ?? {}) };
  if (Array.isArray(saved.providers) && saved.providers.length) {
    next.providers = next.providers.map((p) => {
      const match = saved.providers.find((s: any) => s.id === p.id);
      return match ? { ...p, apiKey: String(match.apiKey ?? ''), enabled: Boolean(match.enabled), model: match.model || p.model } : p;
    });
  }
  return next;
}

export function initStore(): Db {
  ensureDir();
  if (fs.existsSync(FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Db;
      db = {
        version: 2,
        projects: parsed.projects ?? [],
        jobs: parsed.jobs ?? [],
        activity: parsed.activity ?? [],
        settings: mergeSettings(parsed.settings),
      };
      return db;
    } catch (err) {
      console.error('[store] could not parse store.json — starting clean', err);
    }
  }
  db = emptyDb();
  persistNow();
  return db;
}

export function getDb(): Db {
  if (!db) initStore();
  return db;
}

export function save(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(persistNow, 120);
}

export function persistNow(): void {
  ensureDir();
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

export function resetStore(): Db {
  db = emptyDb();
  persistNow();
  return db;
}

export function logActivity(icon: string, text: string, opts: { projectId?: string; meta?: string } = {}) {
  const d = getDb();
  d.activity.unshift({
    id: `act_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    icon,
    text,
    meta: opts.meta,
    projectId: opts.projectId,
    at: new Date().toISOString(),
  });
  d.activity = d.activity.slice(0, 120);
  save();
}
