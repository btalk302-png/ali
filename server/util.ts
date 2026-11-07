import crypto from 'node:crypto';

export function uid(prefix = ''): string {
  const raw = crypto.randomBytes(8).toString('hex');
  return `${prefix}${prefix ? '_' : ''}${raw}`;
}

export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic PRNG so demo content is stable per project + stage. */
export function rng(seed: string) {
  let a = hashSeed(seed) || 1;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(r: () => number, arr: T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

export function pickMany<T>(r: () => number, arr: T[], count: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (copy.length && out.length < count) {
    out.push(copy.splice(Math.floor(r() * copy.length), 1)[0]);
  }
  return out;
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export const nowIso = () => new Date().toISOString();

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function timecode(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const STOPWORDS = new Set(
  'a an the and or but if then than that this these those for to of in on at with from by as is are was were be been being it its you your we our they their he she his her i my me how what why when where who which not no do does did doing done can could should would will just about into over under more most very really so such own same too only also'.split(
    ' ',
  ),
);

export function keywords(topic: string, limit = 8): string[] {
  const words = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const uniq = [...new Set(words)];
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) bigrams.push(`${words[i]} ${words[i + 1]}`);
  return [...uniq.slice(0, limit), ...bigrams.slice(0, 3)].slice(0, limit + 3);
}

export function titleCase(input: string): string {
  const small = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'for', 'of', 'to', 'in', 'on', 'at', 'with', 'vs', 'is']);
  return input
    .split(' ')
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && small.has(lower)) return lower;
      if (/^[A-Z0-9]{2,}$/.test(w)) return w;
      return lower
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('-');
    })
    .join(' ');
}

export function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${round(n / 1_000_000, 1)}M`;
  if (n >= 1_000) return `${round(n / 1_000, 1)}K`;
  return String(Math.round(n));
}

/** Trim a paragraph down to a clean sentence-limited excerpt. */
export function excerpt(text: string, max = 240): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}
