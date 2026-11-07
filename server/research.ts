import type { Research, ResearchSource, ResearchVideo, Settings, TitleCandidate } from '../shared/types.js';
import { aiJson, RelayNeeded } from './ai.js';
import { getJson } from './remote.js';

/* ------------------------------------------------------------------ helpers */

const timeout = (ms: number) => AbortSignal.timeout(ms);

const STOP = new Set(
  'the a an and or for with that this your from into over under been every behind what when why how not you our their most just like about after before more than them they will have has can are was were its it of to on in at as is be or so do if'.split(' '),
);

export function keywordsOf(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w)),
    ),
  );
}

export function parseIsoDuration(iso: string): number | undefined {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  const [, d, h, min, s] = m;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

const daysSince = (iso: string) => Math.max(1, (Date.now() - new Date(iso).getTime()) / 86_400_000);

export const compact = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
};

const median = (nums: number[]): number => {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/* ------------------------------------------------------------------ YouTube Data API */

interface YtVideo {
  videoId: string;
  title: string;
  channel: string;
  views: number;
  publishedAt: string;
  durationSec?: number;
}

async function youtubeSearch(settings: Settings, query: string, limit: number): Promise<YtVideo[]> {
  const key = (settings.research.youtubeApiKey || process.env.YOUTUBE_API_KEY || '').trim();
  if (!key) throw new Error('Add a YouTube Data API key in Settings → Research to pull real search data.');
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: String(Math.min(50, limit)),
    order: 'viewCount',
    regionCode: settings.research.region || 'US',
    relevanceLanguage: settings.research.language || 'en',
    key,
  });
  const data = await getJson<{
    items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; publishedAt?: string } }[];
  }>(`https://www.googleapis.com/youtube/v3/search?${params}`, { label: 'YouTube search' });
  const items = (data.items ?? []).filter((i) => i.id?.videoId);
  if (!items.length) return [];
  const ids = items.map((i) => i.id!.videoId!).join(',');
  const detailParams = new URLSearchParams({ part: 'snippet,statistics,contentDetails', id: ids, key });
  const details = await getJson<{
    items?: {
      id?: string;
      snippet?: { title?: string; channelTitle?: string; publishedAt?: string };
      statistics?: { viewCount?: string };
      contentDetails?: { duration?: string };
    }[];
  }>(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`, { label: 'YouTube video details' });
  return (details.items ?? []).map((item) => ({
    videoId: item.id ?? '',
    title: item.snippet?.title ?? '',
    channel: item.snippet?.channelTitle ?? '',
    views: Number(item.statistics?.viewCount ?? 0),
    publishedAt: item.snippet?.publishedAt ?? '',
    durationSec: item.contentDetails?.duration ? parseIsoDuration(item.contentDetails.duration) : undefined,
  }));
}

/* ------------------------------------------------------------------ Wikipedia */

async function wikipediaContext(query: string): Promise<{ sources: ResearchSource[]; extract: string }> {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=2&format=json&origin=*`;
    const search = await getJson<{ query?: { search?: { title?: string }[] } }>(searchUrl, { label: 'Wikipedia search', timeoutMs: 15_000 });
    const titles = (search.query?.search ?? []).map((s) => s.title).filter(Boolean) as string[];
    const sources: ResearchSource[] = [];
    let extract = '';
    for (const title of titles.slice(0, 2)) {
      let summary: { extract?: string; content_urls?: { desktop?: { page?: string } } };
      try {
        summary = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
          label: 'Wikipedia article',
          timeoutMs: 15_000,
        });
      } catch (err) {
        if (err instanceof RelayNeeded) throw err;
        continue;
      }
      if (summary.extract) extract += `${summary.extract} `;
      const url = summary.content_urls?.desktop?.page;
      if (url) sources.push({ label: `Wikipedia — ${title}`, url, kind: 'wikipedia' });
    }
    return { sources, extract: extract.trim().slice(0, 1200) };
  } catch (err) {
    if (err instanceof RelayNeeded) throw err;
    return { sources: [], extract: '' };
  }
}

/* ------------------------------------------------------------------ Gemini grounding */

async function geminiGrounding(settings: Settings, query: string): Promise<{ sources: ResearchSource[]; notes: string }> {
  const gemini = settings.providers.find((p) => p.id === 'gemini' && p.enabled && p.apiKey.trim().length > 8);
  const key = gemini?.apiKey || settings.media.geminiApiKey;
  if (!key) return { sources: [], notes: '' };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(gemini?.model || 'gemini-3.8-flash')}:generateContent`,
      {
        method: 'POST',
        signal: timeout(45_000),
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Search the web for current, factual context about the YouTube topic "${query}". Give 4 concise bullet points covering: what viewers search for, what recent data or news matters, common misconceptions, and what a credible video must include. No hype.`,
                },
              ],
            },
          ],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
        }),
      },
    );
    if (!res.ok) return { sources: [], notes: '' };
    const data = (await res.json()) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
      }[];
    };
    const candidate = data.candidates?.[0];
    const notes = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
    const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    const seen = new Set<string>();
    const sources: ResearchSource[] = [];
    for (const chunk of chunks) {
      const uri = chunk.web?.uri;
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      let host = uri;
      try {
        host = new URL(uri).hostname.replace(/^www\./, '');
      } catch {
        /* keep raw */
      }
      sources.push({ label: `${chunk.web?.title ?? host}`.slice(0, 90), url: uri, kind: 'web' });
    }
    return { sources, notes };
  } catch {
    return { sources: [], notes: '' };
  }
}

/* ------------------------------------------------------------------ title patterns */

interface PatternStat {
  id: string;
  label: string;
  example: string;
  medianViews: number;
  count: number;
  lift: number;
}

const PATTERNS: { id: string; label: string; test: (title: string) => boolean; example: string }[] = [
  { id: 'number', label: 'Uses a number or list', test: (t) => /(^|\s)\d+(\s|$|,|\.)/.test(t), example: '3 steps, 7 mistakes' },
  { id: 'howto', label: 'Starts with How / Why / What', test: (t) => /^(how|why|what)\b/i.test(t), example: 'How X actually works' },
  { id: 'question', label: 'Asks a question', test: (t) => t.includes('?'), example: 'Is X still worth it?' },
  { id: 'year', label: 'Names the year', test: (t) => /\b(20\d\d)\b/.test(t), example: 'X in 2026' },
  { id: 'brackets', label: 'Adds a bracket or parenthesis', test: (t) => /[\[\]()]/.test(t), example: 'X (full breakdown)' },
  { id: 'contrast', label: 'Contrasts two things', test: (t) => /\bvs\.?\b|\bversus\b|\bwithout\b|\binstead\b/i.test(t), example: 'X vs Y' },
  { id: 'negative', label: 'Uses a stop / mistake angle', test: (t) => /\bstop\b|\bmistake|\bwrong|\bnever\b|\bavoid\b/i.test(t), example: 'Stop doing X' },
  { id: 'short', label: 'Under 45 characters', test: (t) => t.length < 45, example: 'Short, punchy titles' },
  { id: 'long', label: '55+ characters of keyword', test: (t) => t.length >= 55, example: 'Search-friendly keyword titles' },
];

export function analyseTitles(videos: ResearchVideo[]): PatternStat[] {
  if (!videos.length) return [];
  const perDay = videos.map((v) => v.views / daysSince(v.publishedAt));
  const baseline = median(perDay) || 1;
  return PATTERNS.map((pattern) => {
    const matched = videos.filter((v) => pattern.test(v.title));
    const rates = matched.map((v) => v.views / daysSince(v.publishedAt));
    return {
      id: pattern.id,
      label: pattern.label,
      example: matched[0]?.title ?? pattern.example,
      count: matched.length,
      medianViews: Math.round(median(matched.map((v) => v.views))),
      lift: Math.round((median(rates) / baseline) * 100 - 100),
    };
  })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.lift - a.lift);
}

function titleCandidatesFromPatterns(videos: ResearchVideo[], stats: PatternStat[], keyword: string): TitleCandidate[] {
  const keyPhrase = keyword
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
  const bestPatterns = stats.slice(0, 3).map((s) => s.id);
  const pool: TitleCandidate[] = [
    { text: `${keyPhrase}: What Actually Works`, angle: 'Clear promise', why: 'Plain-spoken promise, no hype — pairs with a keyword-first thumbnail.', score: 78, source: 'pattern' },
    { text: `The Real Reason ${keyPhrase} Stops Working`, angle: 'Problem-first', why: 'Negative framing reliably lifts CTR when the payoff is a fix.', score: 82, source: 'pattern' },
    { text: `Stop Doing ${keyPhrase} Like This`, angle: 'Mistake angle', why: 'Directive + mistake pattern shows up repeatedly in the winning set.', score: 80, source: 'pattern' },
    { text: `I Tested ${keyPhrase} for 30 Days — Here's the Data`, angle: 'Experiment proof', why: 'First-person data promise; strong for retention-led channels.', score: 79, source: 'pattern' },
    { text: `${keyPhrase}: A System, Not a Hack`, angle: 'Positioning', why: 'Differentiates from tutorial noise and sets the video up as a framework.', score: 76, source: 'pattern' },
    { text: `${keyPhrase} in ${new Date().getFullYear()}: The Honest Guide`, angle: 'Timely guide', why: 'Year tag plus "honest" signals freshness and trust.', score: 74, source: 'pattern' },
  ];
  return pool.map((candidate) => ({
    ...candidate,
    score: Math.min(95, candidate.score + (bestPatterns.length ? 2 : 0) + (videos.length >= 10 ? 3 : 0)),
  }));
}

/* ------------------------------------------------------------------ synthesis */

async function synthesise(
  settings: Settings,
  keyword: string,
  videos: ResearchVideo[],
  patternStats: PatternStat[],
  wikipediaExtract: string,
  groundingNotes: string,
): Promise<{ summary: string; insights: string[]; opportunities: Research['opportunities']; aiTitles: TitleCandidate[]; provider: string } | null> {
  const provider = settings.providers.find((p) => p.enabled && p.apiKey.trim().length > 8);
  if (!provider) return null;

  const evidenceLines = videos
    .slice(0, 18)
    .map((v) => `- ${v.title} | ${v.channel} | ${compact(v.views)} views | ${new Date(v.publishedAt).toISOString().slice(0, 10)}`)
    .join('\n');
  const patternLines = patternStats
    .slice(0, 6)
    .map((p) => `- ${p.label}: ${p.count} of ${videos.length} titles, median ${compact(p.medianViews)} views, ${p.lift >= 0 ? '+' : ''}${p.lift}% vs baseline`)
    .join('\n');

  const prompt = `You are a YouTube title researcher. Work ONLY from the real evidence below — never invent numbers, titles or channels.

TOPIC: ${keyword}

REAL TOP PERFORMING VIDEOS (YouTube Data API, sorted by views):
${evidenceLines || '(no video data available)'}

TITLE PATTERNS OBSERVED IN THAT DATA:
${patternLines || '(no pattern data)'}

${wikipediaExtract ? `WIKIPEDIA CONTEXT:\n${wikipediaExtract}\n` : ''}
${groundingNotes ? `LIVE WEB NOTES (search grounding):\n${groundingNotes}\n` : ''}

Return STRICT JSON only:
{
  "summary": "3 sentences on the real opportunity in this topic, referencing what the data shows",
  "insights": ["4 specific observations grounded in the titles/views above"],
  "opportunities": [{"title": "angle name, not a full title", "why": "evidence-backed reason", "searchInterest": 0-100, "competition": "low|medium|high"}],
  "titles": [{"text": "clickable title under 62 chars", "angle": "one or two words", "why": "what pattern or gap it exploits", "score": 0-100}]
}
Give exactly 8 titles. They must fit this channel: ${settings.channel.niche}. Audience: ${settings.channel.audience}. Tone: ${settings.brand.tone}. Avoid these words: ${settings.brand.bannedWords.join(', ')}.`;

  const parsed = await aiJson<{
    summary?: unknown;
    insights?: unknown;
    opportunities?: unknown;
    titles?: unknown;
    angles?: unknown;
  }>(settings, {
    system: 'Evidence-first YouTube researcher. You never fabricate data. Reply with JSON only.',
    prompt,
    json: true,
    maxTokens: 3600,
  });

  const rows = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
  const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : fallback);

  return {
    summary: str(parsed.summary),
    insights: rows<unknown>(parsed.insights)
      .map((item) => str(typeof item === 'string' ? item : (item as any)?.insight ?? (item as any)?.text))
      .filter(Boolean)
      .slice(0, 6),
    opportunities: rows<Record<string, unknown>>(parsed.opportunities ?? parsed.angles)
      .map((o) => ({
        title: str(o.title ?? o.angle),
        why: str(o.why ?? o.reason),
        searchInterest: Math.max(0, Math.min(100, Number(o.searchInterest ?? 50) || 50)),
        competition: (['low', 'medium', 'high'] as const).includes(str(o.competition).toLowerCase() as any)
          ? (str(o.competition).toLowerCase() as 'low' | 'medium' | 'high')
          : 'medium',
      }))
      .filter((o) => o.title.length > 0),
    aiTitles: rows<Record<string, unknown>>(parsed.titles)
      .map((t) => ({
        text: str(t.text ?? t.title).slice(0, 120),
        angle: str(t.angle, 'AI'),
        why: str(t.why ?? t.reason),
        score: Math.max(0, Math.min(100, Number(t.score ?? 70) || 70)),
        source: 'ai' as const,
      }))
      .filter((t) => t.text.length > 0),
    provider: provider.label,
  };
}

/* ------------------------------------------------------------------ entry point */

export async function runResearch(
  settings: Settings,
  input: { keyword: string; limit?: number },
): Promise<Research> {
  const keyword = input.keyword.trim();
  if (keyword.length < 3) throw new Error('Enter at least 3 characters to research.');
  const limit = Math.min(50, input.limit ?? settings.research.resultLimit ?? 25);

  const hasYouTube = (settings.research.youtubeApiKey || process.env.YOUTUBE_API_KEY || '').trim().length > 8;
  const hasText = settings.providers.some((p) => p.enabled && p.apiKey.trim().length > 8);
  if (!hasYouTube && !hasText) {
    throw new Error(
      'Real research needs a key. Add a YouTube Data API key (free quota) in Settings → Research, and/or a text provider key for analysis.',
    );
  }

  const queries = [keyword];
  if (/\b(how|guide|tutorial|best)\b/i.test(keyword) === false) queries.push(`${keyword} tutorial`);
  const providerNotes: string[] = [];

  let videos: ResearchVideo[] = [];
  const sources: ResearchSource[] = [];
  if (hasYouTube) {
    const merged = new Map<string, YtVideo>();
    for (const query of queries.slice(0, 2)) {
      for (const video of await youtubeSearch(settings, query, limit)) {
        if (!merged.has(video.videoId)) merged.set(video.videoId, video);
      }
    }
    const perDay = [...merged.values()].map((v) => v.views / daysSince(v.publishedAt));
    const baseline = median(perDay) || 1;
    videos = [...merged.values()]
      .sort((a, b) => b.views - a.views)
      .map((v) => ({
        videoId: v.videoId,
        title: v.title,
        channel: v.channel,
        views: v.views,
        publishedAt: v.publishedAt,
        durationSec: v.durationSec,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        outlier: v.views / daysSince(v.publishedAt) > baseline * 2.5,
      }));
    providerNotes.push('YouTube Data API');
    sources.push({ label: `YouTube search — ${keyword}`, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=CAMSAhAB`, kind: 'youtube' });
    sources.push(...videos.slice(0, 8).map((v) => ({ label: `${v.title} — ${v.channel}`, url: v.url, kind: 'youtube' as const })));
  }

  const wiki = await wikipediaContext(keyword);
  if (wiki.sources.length) {
    sources.push(...wiki.sources);
    providerNotes.push('Wikipedia');
  }

  const grounding = hasText ? await geminiGrounding(settings, keyword) : { sources: [], notes: '' };
  if (grounding.sources.length) {
    sources.push(...grounding.sources.slice(0, 6));
    providerNotes.push('Gemini search grounding');
  }

  const patternStats = analyseTitles(videos);
  let synthesis: Awaited<ReturnType<typeof synthesise>> = null;
  if (hasText) {
    try {
      synthesis = await synthesise(settings, keyword, videos, patternStats, wiki.extract, grounding.notes);
      if (synthesis) providerNotes.push(synthesis.provider);
    } catch (err) {
      // The browser relay is a hard stop: the stage must surface the relay request.
      if (err instanceof RelayNeeded) throw err;
      // Otherwise analysis is optional: the raw data below is still real and usable.
      providerNotes.push(`analysis failed (${err instanceof Error ? err.message.slice(0, 80) : 'error'})`);
    }
  }

  const patternTitles = titleCandidatesFromPatterns(videos, patternStats, keyword);
  const aiTitles = synthesis?.aiTitles ?? [];
  const titles = [...aiTitles, ...patternTitles]
    .sort((a, b) => b.score - a.score)
    .filter((c, i, all) => all.findIndex((x) => x.text.toLowerCase() === c.text.toLowerCase()) === i)
    .slice(0, 10);

  const topPattern = patternStats[0];
  const fastest = [...videos].sort((a, b) => b.views / daysSince(b.publishedAt) - a.views / daysSince(a.publishedAt))[0];
  const fallbackSummary = videos.length
    ? `Real search data for “${keyword}”: ${videos.length} videos analysed, median ${compact(median(videos.map((v) => v.views)))} views. ${
        topPattern ? `Titles that ${topPattern.label.toLowerCase()} perform ${topPattern.lift >= 0 ? 'better' : 'worse'} than the baseline (${topPattern.lift >= 0 ? '+' : ''}${topPattern.lift}%).` : ''
      }`
    : `Real sources for “${keyword}” were limited to background material. Add a YouTube Data API key to pull live view data.`;

  return {
    keyword,
    queries,
    summary: synthesis?.summary || fallbackSummary,
    videos,
    sources: sources.filter((s, i, all) => all.findIndex((x) => x.url === s.url) === i).slice(0, 14),
    insights: synthesis?.insights?.length ? synthesis.insights : patternStats.slice(0, 4).map((p) => `${p.label}: ${p.count} titles, median ${compact(p.medianViews)} views (${p.lift >= 0 ? '+' : ''}${p.lift}% vs baseline).`),
    opportunities: synthesis?.opportunities ?? [],
    titles,
    selectedTitle: titles[0]?.text,
    providers: Array.from(new Set(providerNotes)),
    generatedAt: new Date().toISOString(),
  };
}
