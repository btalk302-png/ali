import fs from 'node:fs';
import path from 'node:path';
import type { Db, Settings } from '../shared/types.js';
import { seedDatabase } from './seed.js';
import { DEFAULT_SETTINGS } from './defaults.js';

export { DEFAULT_SETTINGS };

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'store.json');

let db: Db;
let writeTimer: NodeJS.Timeout | null = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function initStore(): Db {
  ensureDir();
  if (fs.existsSync(FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Db;
      db = {
        projects: parsed.projects ?? [],
        jobs: parsed.jobs ?? [],
        comments: parsed.comments ?? [],
        recommendations: parsed.recommendations ?? [],
        experiments: parsed.experiments ?? [],
        activity: parsed.activity ?? [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      };
      // harden settings shape after upgrades
      db.settings.channel = { ...DEFAULT_SETTINGS.channel, ...db.settings.channel };
      db.settings.brand = { ...DEFAULT_SETTINGS.brand, ...db.settings.brand };
      db.settings.automation = { ...DEFAULT_SETTINGS.automation, ...db.settings.automation };
      db.settings.media = { ...DEFAULT_SETTINGS.media, ...(db.settings.media ?? {}) };
      if (!Array.isArray(db.settings.providers) || db.settings.providers.length === 0) {
        db.settings.providers = DEFAULT_SETTINGS.providers;
      }
      return db;
    } catch (err) {
      console.error('[store] could not parse store.json, reseeding', err);
    }
  }
  db = seedDatabase();
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
  db = seedDatabase();
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
    createdAt: new Date().toISOString(),
  });
  d.activity = d.activity.slice(0, 120);
  save();
}
