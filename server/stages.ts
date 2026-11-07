import type { Beat, Project, Scene, Script, Seo, Settings, Strategy, ThumbnailConcept, Visuals } from '../shared/types.js';
import { aiJson, requireProvider } from './ai.js';
import { keywordsOf } from './research.js';
import { nowIso, uid, wordCount } from './util.js';

const WPM = 150;

const PALETTES: Record<string, [string, string, string]> = {
  Cinematic: ['#0B0F1A', '#2B4F8A', '#F4C77B'],
  Neon: ['#0A0614', '#3B1E4E', '#FF7A59'],
  Editorial: ['#F6F1E8', '#1F2937', '#C2410C'],
  Minimal: ['#0E1116', '#334155', '#E2E8F0'],
};

const clamp01 = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** Coerces "1:30", "90s", "2 min", "1,5" or 90 into seconds. Returns 0 when unusable. */
function seconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return 0;
  const text = value.trim().toLowerCase().replace(',', '.');
  const clock = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(text);
  if (clock) {
    const parts = clock.slice(1).filter((x) => x !== undefined).map(Number);
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  }
  const match = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)?/.exec(text);
  if (!match) return 0;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return 0;
  return Math.round(/^(m|min|mins|minute|minutes)$/.test(match[2] ?? '') ? n * 60 : n);
}

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : fallback;

/** Array of phrases; accepts ["a b", {point:"c d"}] and a single comma/newline separated string. */
const strings = (value: unknown): string[] => {
  const flat = typeof value === 'string' ? value.split(/[\n,]+/) : value;
  return list<unknown>(flat)
    .map((item) => (typeof item === 'string' ? item : text((item as any)?.point ?? (item as any)?.text ?? (item as any)?.why)))
    .map((item) => item.trim())
    .filter(Boolean);
};

/** Tag-like values; accepts "#a #b", "a, b" or ["a","b"]. */
const tokens = (value: unknown): string[] => {
  const flat = typeof value === 'string' ? value.split(/[\s,]+/) : list<unknown>(value).flatMap((item) => (typeof item === 'string' ? item.split(/[\s,]+/) : [String(item)]));
  return flat.map((item) => item.trim().replace(/^#+/, '')).filter(Boolean);
};

export async function strategyStage(project: Project, settings: Settings): Promise<Strategy> {
  requireProvider(settings);
  const research = project.research;
  if (!research) throw new Error('Run the title research stage first.');

  const winning = research.videos
    .slice(0, 10)
    .map((v) => `- ${v.title} (${v.channel}, ${v.views.toLocaleString()} views)`)
    .join('\n');
  const targetSec = project.format === 'short' ? 55 : project.durationMin * 60;

  const prompt = `Build the strategy for a YouTube video.

CHOSEN TITLE: ${research.selectedTitle ?? research.titles[0]?.text ?? project.topic}
TOPIC: ${research.keyword}
NICHE: ${project.niche}
AUDIENCE: ${project.audience}
TONE: ${project.tone}. Channel voice: ${settings.brand.voice}
FORMAT: ${project.format === 'short' ? 'vertical Short, under 60s' : `${project.durationMin} minute long-form`}
TARGET LENGTH: ${targetSec} seconds

REAL RESEARCH SUMMARY:
${research.summary}

REAL INSIGHTS:
${research.insights.map((i) => `- ${i}`).join('\n')}

REAL WINNING VIDEOS:
${winning || '- none captured'}

Return STRICT JSON only:
{
  "bigIdea": "one sentence a viewer would repeat to a friend",
  "hookAngle": "the specific tension the first 10 seconds open with",
  "targetEmotion": "one word or short phrase",
  "differentiators": ["3 concrete ways this beats the videos above"],
  "outline": [{"title": "section", "purpose": "what it must accomplish", "durationSec": 0}],
  "cta": "one specific next step for the viewer"
}
Outline must sum to roughly ${targetSec} seconds with ${project.format === 'short' ? '3-4' : '6-8'} sections. Duration values are integers.`;

  const parsed = await aiJson<{
    bigIdea?: unknown;
    hookAngle?: unknown;
    hook?: unknown;
    targetEmotion?: unknown;
    emotion?: unknown;
    differentiators?: unknown;
    angles?: unknown;
    outline?: unknown;
    sections?: unknown;
    beats?: unknown;
    cta?: unknown;
    callToAction?: unknown;
  }>(settings, {
    system: 'You are a YouTube strategist working from real search evidence. Reply with JSON only. No hype, no invented statistics.',
    prompt,
    json: true,
    maxTokens: 3000,
  });

  const rawOutline = list<Record<string, unknown>>(parsed.outline ?? parsed.sections ?? parsed.beats);
  const outline = rawOutline
    .map((row, i) => {
      const title = text(row.title ?? row.section ?? row.name, `Section ${i + 1}`);
      const purpose = text(row.purpose ?? row.goal ?? row.description ?? row.detail);
      const durationSec = seconds(row.durationSec ?? row.duration ?? row.seconds ?? row.time ?? row.length);
      return { id: uid('sec'), title, purpose, durationSec };
    })
    .filter((row) => row.title.length > 0);
  if (!outline.length) {
    throw new Error('The model returned a strategy without an outline. Run the stage again, or switch to a different model in Settings.');
  }
  // Any missing/unparseable duration is filled proportionally, then the whole plan is scaled to the promised runtime.
  const known = outline.filter((o) => o.durationSec > 0).length;
  const fallback = Math.round(targetSec / Math.max(1, outline.length));
  outline.forEach((o) => { if (o.durationSec <= 0) o.durationSec = known ? fallback : fallback; });
  const sum = outline.reduce((acc, o) => acc + o.durationSec, 0);
  const factor = sum > 0 ? targetSec / sum : 1;
  if (Math.abs(sum - targetSec) / targetSec > 0.08 || known < outline.length) {
    outline.forEach((o) => (o.durationSec = clamp01(Math.round(o.durationSec * factor), 10, 900)));
  }

  return {
    bigIdea: text(parsed.bigIdea, research.summary),
    hookAngle: text(parsed.hookAngle ?? parsed.hook),
    targetEmotion: text(parsed.targetEmotion ?? parsed.emotion, 'curiosity'),
    differentiators: strings(parsed.differentiators ?? parsed.angles).slice(0, 5),
    outline,
    cta: text(parsed.cta ?? parsed.callToAction),
    generatedAt: nowIso(),
  };
}

export async function scriptStage(project: Project, settings: Settings): Promise<Script> {
  requireProvider(settings);
  const strategy = project.strategy;
  if (!strategy) throw new Error('Run the strategy stage first.');
  const research = project.research;
  const targetSec = project.format === 'short' ? 55 : project.durationMin * 60;
  const targetWords = Math.round((targetSec / 60) * WPM);

  const prompt = `Write the spoken script for this YouTube video.

TITLE: ${research?.selectedTitle ?? project.title}
BIG IDEA: ${strategy.bigIdea}
HOOK ANGLE: ${strategy.hookAngle}
AUDIENCE: ${project.audience}
TONE: ${project.tone}. Voice: ${settings.brand.voice}
BANNED WORDS: ${settings.brand.bannedWords.join(', ') || 'none'}
OUTLINE:
${strategy.outline.map((o, i) => `${i + 1}. ${o.title} — ${o.purpose} (${o.durationSec}s)`).join('\n')}
TARGET: ${targetWords} spoken words (${targetSec}s at ${WPM} wpm)

Return STRICT JSON only:
{
  "hook": "first 1-2 sentences, under 30 words",
  "intro": "2-3 sentences that promise the payoff",
  "beats": [{"title": "matches the outline", "narration": "spoken words only — no stage directions", "bRollPrompt": "one cinematic image prompt, 20-35 words, no text overlays", "durationSec": 0}],
  "outro": "2-3 sentences that land the takeaway",
  "cta": "one specific next step"
}
Every beat narration must be full sentences. Beat durations must sum to about ${targetSec} seconds.`;

  const parsed = await aiJson<{
    hook?: unknown;
    intro?: unknown;
    beats?: unknown;
    sections?: unknown;
    outro?: unknown;
    cta?: unknown;
    callToAction?: unknown;
  }>(settings, {
    system: 'You are a documentary scriptwriter for YouTube. Spoken language only, specific, no filler, no claims you cannot support.',
    prompt,
    json: true,
    maxTokens: 5000,
  });

  const beats: Beat[] = list<Record<string, unknown>>(parsed.beats ?? parsed.sections)
    .map((row, i) => {
      const narration = text(row.narration ?? row.script ?? row.text ?? row.line);
      if (!narration) return null;
      const prompt = text(row.bRollPrompt ?? row.broll ?? row.visual ?? row.visualPrompt, 'cinematic illustration of the idea, no text');
      const planned = seconds(row.durationSec ?? row.duration ?? row.seconds ?? row.time);
      return {
        id: uid('beat'),
        title: text(row.title ?? row.name, strategy.outline[i]?.title ?? `Beat ${i + 1}`),
        narration,
        bRollPrompt: prompt,
        durationSec: planned > 0 ? Math.max(5, planned) : Math.max(8, Math.round((wordCount(narration) / WPM) * 60)),
      } satisfies Beat;
    })
    .filter((b): b is Beat => Boolean(b));
  if (beats.length < 3) {
    throw new Error('The model returned a script with fewer than three beats. Run the stage again, or switch to a different model in Settings.');
  }

  const hook = text(parsed.hook, beats[0].narration);
  const intro = text(parsed.intro);
  const outro = text(parsed.outro);
  const cta = text(parsed.cta ?? parsed.callToAction, strategy.cta);
  const fullText = [hook, intro, ...beats.map((b) => b.narration), outro, cta].filter(Boolean).join('\n\n');
  const words = wordCount(fullText);

  return {
    title: research?.selectedTitle ?? project.title,
    hook,
    intro,
    beats,
    outro,
    cta,
    wordCount: words,
    wpm: WPM,
    estimatedDurationSec: Math.round((words / WPM) * 60),
    fullText,
    generatedBy: requireProvider(settings).label,
  };
}

interface VisualAi {
  style?: unknown;
  palette?: unknown;
  scenes?: { beatIndex?: number; title?: string; prompt?: string; composition?: string; transition?: string }[];
  thumbnails?: { headline?: string; subline?: string; composition?: string; variant?: string; palette?: string[] }[];
  [key: string]: unknown;
}

export async function visualsStage(project: Project, settings: Settings): Promise<Visuals> {
  requireProvider(settings);
  const script = project.script;
  if (!script) throw new Error('Run the script stage first.');

  const prompt = `Design the visual plan for this video.

TITLE: ${script.title}
STYLE: ${project.style}, ${project.tone.toLowerCase()} tone
CHANNEL PALETTE: ${settings.brand.palette.join(', ')}

BEATS:
${script.beats.map((b, i) => `${i}. ${b.title} — ${b.bRollPrompt}`).join('\n')}

Return STRICT JSON only:
{
  "style": "one line describing the visual language",
  "palette": ["#hex", "#hex", "#hex"],
  "scenes": [{"beatIndex": 0, "title": "scene name", "prompt": "detailed cinematic image prompt, 25-45 words, no text in image", "composition": "framing notes", "transition": "cut|crossfade|whip pan"}],
  "thumbnails": [{"headline": "2-4 words max, ALL CAPS", "subline": "3-5 words", "composition": "layout note", "variant": "bold|glow|editorial|minimal", "palette": ["#hex", "#hex", "#hex"]}]
}
Exactly ${script.beats.length} scenes (one per beat, same order) and 4 thumbnails using each variant once. Headlines must be 1-3 short words that read at 120px.`;

  const parsed = await aiJson<VisualAi>(settings, {
    system: 'You are an art director for YouTube. Concrete, shootable image prompts. Reply with JSON only.',
    prompt,
    json: true,
    maxTokens: 4000,
  });
  const aiScenes = list<NonNullable<VisualAi['scenes']>[number]>(parsed.scenes ?? (parsed as any).shots ?? (parsed as any).frames);
  const aiThumbs = list<NonNullable<VisualAi['thumbnails']>[number]>(parsed.thumbnails ?? (parsed as any).thumbs);
  const palette = list<string>(parsed.palette).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  const basePalette = PALETTES[project.style] ?? PALETTES.Cinematic;
  const finalPalette = palette.length >= 3 ? palette.slice(0, 3) : [...basePalette];

  const scenes: Scene[] = script.beats.map((beat, i) => {
    const match =
      aiScenes.find((row) => Number((row as any).beatIndex) === i) ??
      aiScenes[i] ??
      {};
    return {
      id: uid('sc'),
      beatId: beat.id,
      title: text((match as any).title, beat.title),
      prompt: text((match as any).prompt ?? (match as any).imagePrompt ?? (match as any).visual, beat.bRollPrompt),
      composition: text((match as any).composition, 'cinematic medium shot, clean negative space'),
      durationSec: beat.durationSec,
      transition: text((match as any).transition, i % 3 === 0 ? 'hard cut' : i % 3 === 1 ? 'slow crossfade' : 'whip pan'),
      narration: beat.narration,
    };
  });

  const variants: ThumbnailConcept['variant'][] = ['bold', 'glow', 'editorial', 'minimal'];
  const headlineFallback = (script.title.split(':')[0] || script.title)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .join('\n');
  const thumbnails: ThumbnailConcept[] = variants.map((variant, i) => {
    const match = aiThumbs.find((t) => String(t.variant).toLowerCase() === variant) ?? aiThumbs[i] ?? {};
    const thumbPalette = list<string>(match.palette).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
    return {
      id: uid('th'),
      headline: (text(match.headline, headlineFallback || 'THE\nSYSTEM')).toUpperCase().slice(0, 28),
      subline: text(match.subline, `${project.durationMin}-minute breakdown`).slice(0, 34),
      composition: text(match.composition, 'subject left, type right, dark vignette'),
      palette: (thumbPalette.length >= 3 ? thumbPalette.slice(0, 3) : finalPalette) as [string, string, string],
      variant,
    };
  });

  return {
    palette: [...finalPalette, '#FFFFFF'],
    style: text(parsed.style, `${project.style} · ${project.tone.toLowerCase()} tone`),
    scenes,
    thumbnails,
    selectedThumbnailId: thumbnails[0].id,
    generatedBy: requireProvider(settings).label,
  };
}

/* ------------------------------------------------------------------ seo */

function scoreTitleLocal(text: string, topic: string): { score: number; reason: string } {
  let score = 48;
  const reasons: string[] = [];
  if (text.length >= 32 && text.length <= 62) {
    score += 16;
    reasons.push('ideal length');
  } else if (text.length <= 72) {
    score += 6;
    reasons.push('a little outside the ideal length');
  } else {
    score -= 8;
    reasons.push('too long for mobile');
  }
  if (/\d/.test(text)) {
    score += 9;
    reasons.push('concrete number');
  }
  if (/\?$/.test(text.trim())) {
    score += 5;
    reasons.push('opens a question loop');
  }
  if (keywordsOf(topic).some((k) => text.toLowerCase().includes(k))) {
    score += 8;
    reasons.push('contains the search keyword');
  }
  return { score: Math.min(98, score), reason: reasons.join(' · ') || 'clear and literal' };
}

function chapterTimeline(script: Script | undefined, filmTitle: string): { time: string; label: string }[] {
  if (!script) return [];
  let elapsed = 0;
  const rows: { time: string; label: string }[] = [{ time: '00:00', label: filmTitle.slice(0, 60) }];
  for (const beat of script.beats) {
    elapsed += beat.durationSec;
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(Math.round(elapsed % 60)).padStart(2, '0');
    if (elapsed < 15) continue;
    rows.push({ time: `${mm}:${ss}`, label: beat.title.slice(0, 60) });
  }
  return rows;
}

export async function seoStage(project: Project, settings: Settings): Promise<Seo> {
  requireProvider(settings);
  const script = project.script;
  if (!script) throw new Error('Run the script stage first.');
  const research = project.research;

  const prompt = `Package this YouTube video for search and browse.

TITLE: ${script.title}
TOPIC: ${research?.keyword ?? project.topic}
SUMMARY: ${script.hook}
CHOSEN TITLE: ${research?.selectedTitle ?? script.title}
AUDIENCE: ${project.audience}
REAL RESEARCH KEYWORDS: ${(research?.insights ?? []).join(' | ')}
BANNED WORDS: ${settings.brand.bannedWords.join(', ') || 'none'}

Return STRICT JSON only:
{
  "titles": [{"text": "alternative title under 65 chars", "reason": "why it works"}],
  "description": "150-250 words: first 2 lines sell the video, then what the viewer learns, then a chapters block placeholder, then a soft CTA. No emojis in the first line.",
  "tags": ["15 lowercase search tags"],
  "hashtags": ["3 hashtags without #"],
  "searchIntent": "one sentence on what the searcher wants",
  "ctrPrediction": 0
}
Give 6 title variants including one that carries the exact keyword.`;

  const parsed = await aiJson<{
    titles?: unknown;
    alternativeTitles?: unknown;
    description?: unknown;
    tags?: unknown;
    hashtags?: unknown;
    searchIntent?: unknown;
    ctrPrediction?: unknown;
  }>(settings, {
    system: 'You are a YouTube SEO editor. Write for humans first, then for the algorithm. Reply with JSON only.',
    prompt,
    json: true,
    maxTokens: 3000,
  });

  const variants = list<Record<string, unknown>>(parsed.titles ?? parsed.alternativeTitles)
    .map((row) => {
      const value = text(row.text ?? row.title ?? (typeof row === 'string' ? row : ''));
      return value ? { text: value, ...scoreTitleLocal(value, research?.keyword ?? project.topic) } : null;
    })
    .filter((row): row is { text: string; score: number; reason: string } => Boolean(row));
  const selected = research?.selectedTitle ?? script.title;
  const allTitles = [{ text: selected, ...scoreTitleLocal(selected, research?.keyword ?? project.topic) }, ...variants]
    .filter((t, i, arr) => arr.findIndex((x) => x.text.toLowerCase() === t.text.toLowerCase()) === i)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const tags = tokens(parsed.tags)
    .map((t) => t.toLowerCase().replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 15);
  const hashtags = tokens(parsed.hashtags)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const chapters = chapterTimeline(script, selected);
  const description = text(parsed.description);
  const descWithChapters = chapters.length > 1 && !/chapters/i.test(description)
    ? `${description}\n\nChapters\n${chapters.map((c) => `${c.time} ${c.label}`).join('\n')}`
    : description;

  const breakdown = [
    { label: 'Title length & keyword', score: Math.min(20, Math.round((allTitles[0]?.score ?? 50) / 5)), max: 20, note: allTitles[0] ? `${allTitles[0].text.length} chars · ${allTitles[0].reason}` : 'No title' },
    { label: 'Description depth', score: Math.min(20, Math.round(descWithChapters.split(/\s+/).length / 12)), max: 20, note: `${descWithChapters.split(/\s+/).filter(Boolean).length} words` },
    { label: 'Chapters', score: chapters.length > 3 ? 20 : chapters.length > 1 ? 12 : 4, max: 20, note: `${chapters.length} chapter markers` },
    { label: 'Tags', score: Math.min(20, tags.length), max: 20, note: `${tags.length} tags` },
    { label: 'Hashtags', score: Math.min(20, hashtags.length * 6), max: 20, note: `${hashtags.length} hashtags` },
  ];
  const score = breakdown.reduce((s, b) => s + b.score, 0);

  return {
    titles: allTitles,
    selectedTitle: allTitles[0]?.text ?? selected,
    description: descWithChapters,
    chapters,
    tags,
    hashtags,
    score,
    breakdown,
    searchIntent: text(parsed.searchIntent),
    ctrPrediction: clamp01(Number(parsed.ctrPrediction ?? 6) || 6, 1, 20),
    generatedBy: requireProvider(settings).label,
  };
}

