import type { Beat, Project, Scene, Script, Seo, Settings, Strategy, ThumbnailConcept, Visuals } from '../shared/types.js';
import { aiComplete, parseJson, requireProvider } from './ai.js';
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

  const text = await aiComplete(settings, {
    system: 'You are a YouTube strategist working from real search evidence. Reply with JSON only. No hype, no invented statistics.',
    prompt,
    json: true,
    maxTokens: 1800,
  });
  const parsed = parseJson<{
    bigIdea?: string;
    hookAngle?: string;
    targetEmotion?: string;
    differentiators?: string[];
    outline?: { title?: string; purpose?: string; durationSec?: number }[];
    cta?: string;
  }>(text);

  const outline = (parsed.outline ?? [])
    .filter((o) => o.title)
    .map((o) => ({
      id: uid('sec'),
      title: String(o.title),
      purpose: String(o.purpose ?? ''),
      durationSec: clamp01(Math.round(Number(o.durationSec ?? targetSec / 6)), 10, 900),
    }));
  if (!outline.length) throw new Error('The model returned no outline. Try again or switch provider.');
  const sum = outline.reduce((s, o) => s + o.durationSec, 0);
  if (Math.abs(sum - targetSec) / targetSec > 0.25) {
    // normalise the plan so the runtime promise is respected
    const factor = targetSec / sum;
    outline.forEach((o) => (o.durationSec = Math.max(10, Math.round(o.durationSec * factor))));
  }

  return {
    bigIdea: parsed.bigIdea?.trim() || research.summary,
    hookAngle: parsed.hookAngle?.trim() || '',
    targetEmotion: parsed.targetEmotion?.trim() || 'curiosity',
    differentiators: (parsed.differentiators ?? []).filter(Boolean).slice(0, 5),
    outline,
    cta: parsed.cta?.trim() || '',
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

  const text = await aiComplete(settings, {
    system: 'You are a documentary scriptwriter for YouTube. Spoken language only, specific, no filler, no claims you cannot support.',
    prompt,
    json: true,
    maxTokens: 4000,
  });
  const parsed = parseJson<{
    hook?: string;
    intro?: string;
    beats?: { title?: string; narration?: string; bRollPrompt?: string; durationSec?: number }[];
    outro?: string;
    cta?: string;
  }>(text);

  const beats: Beat[] = (parsed.beats ?? [])
    .filter((b) => b.narration)
    .map((b, i) => ({
      id: uid('beat'),
      title: String(b.title || strategy.outline[i]?.title || `Beat ${i + 1}`),
      narration: String(b.narration).trim(),
      bRollPrompt: String(b.bRollPrompt || 'cinematic illustration of the idea, no text'),
      durationSec: Math.max(15, Math.round(Number(b.durationSec ?? (wordCount(String(b.narration)) / WPM) * 60))),
    }));
  if (beats.length < 3) throw new Error('The model returned too few beats. Try again.');

  const hook = (parsed.hook ?? beats[0].narration).trim();
  const intro = (parsed.intro ?? '').trim();
  const outro = (parsed.outro ?? '').trim();
  const cta = (parsed.cta ?? strategy.cta).trim();
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
  style?: string;
  palette?: string[];
  scenes?: { beatIndex?: number; title?: string; prompt?: string; composition?: string; transition?: string }[];
  thumbnails?: { headline?: string; subline?: string; composition?: string; variant?: string; palette?: string[] }[];
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

  const text = await aiComplete(settings, {
    system: 'You are an art director for YouTube. Concrete, shootable image prompts. Reply with JSON only.',
    prompt,
    json: true,
    maxTokens: 3000,
  });
  const parsed = parseJson<VisualAi>(text);

  const palette = (parsed.palette ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  const basePalette = PALETTES[project.style] ?? PALETTES.Cinematic;
  const finalPalette = palette.length >= 3 ? palette.slice(0, 3) : [...basePalette];

  const scenes: Scene[] = script.beats.map((beat, i) => {
    const match = parsed.scenes?.find((s) => s.beatIndex === i) ?? parsed.scenes?.[i];
    return {
      id: uid('sc'),
      beatId: beat.id,
      title: match?.title || beat.title,
      prompt: match?.prompt || beat.bRollPrompt,
      composition: match?.composition || 'cinematic medium shot, clean negative space',
      durationSec: beat.durationSec,
      transition: match?.transition || (i % 3 === 0 ? 'hard cut' : i % 3 === 1 ? 'slow crossfade' : 'whip pan'),
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
    const match = parsed.thumbnails?.find((t) => t.variant === variant) ?? parsed.thumbnails?.[i];
    const thumbPalette = (match?.palette ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
    return {
      id: uid('th'),
      headline: (match?.headline || headlineFallback || 'THE\nSYSTEM').toUpperCase().slice(0, 28),
      subline: (match?.subline || `${project.durationMin}-minute breakdown`).slice(0, 34),
      composition: match?.composition || 'subject left, type right, dark vignette',
      palette: (thumbPalette.length >= 3 ? thumbPalette.slice(0, 3) : finalPalette) as [string, string, string],
      variant,
    };
  });

  return {
    palette: [...finalPalette, '#FFFFFF'],
    style: parsed.style || `${project.style} · ${project.tone.toLowerCase()} tone`,
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

  const text = await aiComplete(settings, {
    system: 'You are a YouTube SEO editor. Write for humans first, then for the algorithm. Reply with JSON only.',
    prompt,
    json: true,
    maxTokens: 2000,
  });
  const parsed = parseJson<{
    titles?: { text?: string; reason?: string }[];
    description?: string;
    tags?: string[];
    hashtags?: string[];
    searchIntent?: string;
    ctrPrediction?: number;
  }>(text);

  const variants = (parsed.titles ?? [])
    .filter((t) => t.text)
    .map((t) => ({ text: String(t.text).trim(), ...scoreTitleLocal(String(t.text), research?.keyword ?? project.topic) }));
  const selected = research?.selectedTitle ?? script.title;
  const allTitles = [{ text: selected, ...scoreTitleLocal(selected, research?.keyword ?? project.topic) }, ...variants]
    .filter((t, i, arr) => arr.findIndex((x) => x.text.toLowerCase() === t.text.toLowerCase()) === i)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const tags = (parsed.tags ?? [])
    .map((t) => String(t).toLowerCase().replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 15);
  const hashtags = (parsed.hashtags ?? [])
    .map((t) => String(t).replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  const chapters = chapterTimeline(script, selected);
  const description = (parsed.description ?? '').trim();
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
    searchIntent: parsed.searchIntent?.trim() || '',
    ctrPrediction: clamp01(Number(parsed.ctrPrediction ?? 6), 1, 20),
    generatedBy: requireProvider(settings).label,
  };
}

