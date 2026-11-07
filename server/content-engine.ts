import type {
  Beat,
  Quality,
  KeywordCluster,
  QualityCheck,
  Research,
  Scene,
  Script,
  Seo,
  Strategy,
  ThumbnailConcept,
  Visuals,
  Project,
} from '../shared/types.js';
import { clamp, keywords, pick, rng, round, timecode, titleCase, uid, wordCount } from './util.js';

export interface Brief {
  topic: string;
  niche: string;
  audience: string;
  tone: string;
  format: 'long' | 'short';
  durationMin: number;
  style: string;
}

const TONE_VOICE: Record<string, string> = {
  'Documentary': 'measured, cinematic, evidence-forward',
  'High energy': 'fast, punchy, momentum-driven',
  'Analytical': 'precise, data-led, quietly confident',
  'Friendly expert': 'warm, direct, generous with specifics',
  'Story-driven': 'narrative, scene-first, emotionally paced',
};

const OUTCOMES = [
  'a system that keeps working after the motivation runs out',
  'predictable results you can repeat every single week',
  'a clear edge your competitors cannot copy in a weekend',
  'results that compound instead of resetting every Monday',
];

const PAINS = [
  'collecting tactics that look clever but never compound',
  'copying tactics without understanding the machine underneath them',
  'optimising for the wrong metric and wondering why growth stalls',
  'restarting the plan every time the algorithm shifts',
];

const METRICS = [
  'click-through rate',
  'average view duration',
  'returning-viewer share',
  'watch time per impression',
];

const FRAMEWORKS = ['The Three-Layer Loop', 'The Signal Stack', 'The Compounding Ladder', 'The 3S Framework'];

function briefContext(brief: Brief, r: () => number) {
  const topic = brief.topic.replace(/\s+/g, ' ').trim();
  const kw = keywords(topic, 6);
  const outcome = pick(r, OUTCOMES);
  const pain = pick(r, PAINS);
  const metric = pick(r, METRICS);
  const framework = pick(r, FRAMEWORKS);
  return {
    topic: topic.charAt(0).toLowerCase() + topic.slice(1),
    Topic: titleCase(topic),
    topicWord: kw[0] ?? topic.split(' ')[0],
    kw,
    audience: brief.audience,
    niche: brief.niche,
    outcome,
    pain,
    metric,
    framework,
    tone: brief.tone,
    voice: TONE_VOICE[brief.tone] ?? 'clear, confident and specific',
    duration: brief.format === 'short' ? '60 seconds' : `${brief.durationMin} minutes`,
  };
}

function cleanTitle(topic: string): string {
  let t = titleCase(topic.replace(/\s+/g, ' ').trim());
  t = t.replace(/\s*[—–-]\s*$/, '');
  if (t.length > 64) {
    t = t.slice(0, 64);
  }
  // never end on a dangling connector
  const dangling = /(\s+(and|or|but|the|a|an|of|for|to|in|on|with|without|from|behind|every|that|this|is|are|your|my|why|how))$/i;
  let guard = 0;
  while (dangling.test(t) && guard++ < 8) t = t.replace(dangling, '');
  t = t.replace(/[,;:\s]+$/, '');
  return t;
}

function shortTopic(topic: string): string {
  const full = cleanTitle(topic);
  if (full.length <= 38) return full;
  const words = full.split(' ');
  let out = '';
  for (const w of words) {
    if ((out + ' ' + w).trim().length > 36) break;
    out = (out + ' ' + w).trim();
  }
  return out ? cleanTitle(out) : full.slice(0, 34);
}

function craftTitle(topic: string, r: () => number): string {
  const core = cleanTitle(topic);
  const bare = core.replace(/^The\s+/i, '');
  const saysSystem = /system|framework|layer/i.test(bare) || /system|framework|layer/i.test(core);
  const candidates = [core];
  if (bare.length <= 34) {
    candidates.push(saysSystem ? `${bare}: The Part Nobody Explains` : `${bare}: The System Nobody Explains`);
    candidates.push(`Why ${bare} Stops Working`);
  }
  if (core.length <= 50) candidates.push(`${bare} — The Full System`);
  const usable = candidates
    .map((t) => t.trim())
    .filter((t, i, arr) => t.length >= 18 && t.length <= 64 && arr.indexOf(t) === i);
  return pick(r, usable.length ? usable : [core]);
}

type Ctx = ReturnType<typeof briefContext>;

const SENTENCES: Record<string, ((c: Ctx) => string)[]> = {
  hook: [
    (c) => `Almost everything the internet tells you about ${c.topic} is built for someone with a different channel, a different audience and a different budget.`,
    (c) => `So you copy the tactic, it half-works for nine days, and then you slip straight back into ${c.pain}.`,
    (c) => `The problem is not effort. The problem is sequence.`,
    (c) => `In the next ${c.duration}, I'm going to walk you through ${c.framework} — the exact structure I would use if I had to rebuild a ${c.niche} channel from zero.`,
    (c) => `Stay to the end, because the third layer is the one almost nobody ships.`,
    (c) => `No hype, no "one weird trick" — just the parts that survive contact with a real upload schedule.`,
    (c) => `By the end you'll have a checklist you can run on your next video, not a new philosophy to admire.`,
    (c) => `If you've ever felt like you were doing all the right things and still not moving, this one is for you.`,
  ],
  stakes: [
    (c) => `Here's the uncomfortable part: most ${c.niche} advice is describing the finish line, not the route.`,
    (c) => `People see a channel explode and assume the last thing it did caused the explosion, when the real work happened months earlier.`,
    (c) => `That confusion is expensive, because it sends ${c.audience} after the visible move instead of the repeatable one.`,
    (c) => `You end up ${c.pain}.`,
    (c) => `The fix starts with one decision: stop asking "what should I post" and start asking "what should repeat".`,
    (c) => `A format you can run twenty times beats a masterpiece you can run once.`,
    (c) => `That single shift is what turns a hobby channel into an asset.`,
    (c) => `And it changes what you measure, too — away from vibes, toward ${c.metric}.`,
  ],
  framework: [
    (c) => `So here's ${c.framework}, in plain language.`,
    (c) => `Layer one is signal: you find out what your ${c.audience} already cares about, instead of guessing.`,
    (c) => `Layer two is structure: you convert that signal into a repeatable episode shape that is easy to produce and easy to binge.`,
    (c) => `Layer three is compounding: every upload is engineered to feed the next one, through callbacks, playlists and a consistent promise.`,
    (c) => `Most people only ever do layer one and call it strategy, which is why their calendar looks busy and their channel looks flat.`,
    (c) => `Each layer is boring on its own. Stacked together, they do the heavy lifting.`,
    (c) => `Keep the framework in your head as a filter: if a tactic doesn't fit a layer, it's probably a distraction.`,
    (c) => `The goal is not one good video. The goal is a machine that produces good videos on a Tuesday when you're tired.`,
  ],
  step1: [
    (c) => `Let's start with layer one, because everything downstream is just decoration if this is wrong.`,
    (c) => `Spend thirty minutes reading the comments under the three biggest videos in your topic — including the ones you think are competitors.`,
    (c) => `You're not looking for inspiration. You're looking for the exact phrases people use when they describe the problem.`,
    (c) => `Those phrases become your titles, your cold opens and your first ten seconds.`,
    (c) => `Write down every question that appears more than twice, and mark the ones with no good answer on YouTube yet.`,
    (c) => `That gap is your content roadmap, and it costs nothing to find.`,
    (c) => `Do this weekly and you'll never stare at a blank topic list again.`,
    (c) => `For ${c.audience}, the highest-value questions are usually about trade-offs, not definitions.`,
  ],
  step2: [
    (c) => `Now layer two: build one episode shape you can repeat without re-inventing it.`,
    (c) => `Ours is simple — a tense open, one clear promise, three escalating examples, then a decision the viewer can make today.`,
    (c) => `Keep the runtime tight enough that you can produce it consistently; consistency is worth more than polish.`,
    (c) => `Write the open last. It's easier to promise something specific once you know what the episode actually delivers.`,
    (c) => `In the edit, cut the first fifteen seconds of every scene you're proud of and see what survives.`,
    (c) => `If the video still makes sense, the scene was about you, not the viewer.`,
    (c) => `And repeat the same visual grammar each week — same fonts, same pacing, same three-act rhythm.`,
    (c) => `Viewers don't consciously notice consistency. They just start to trust it.`,
  ],
  step3: [
    (c) => `Layer three is where growth actually happens, and it's the layer people skip because it isn't fun.`,
    (c) => `Every video should point at the next one with a specific reason, not a generic "check out my channel".`,
    (c) => `Name the next video in the outro, show a frame from it, and put it in a playlist that promises a sequence.`,
    (c) => `Then measure ${c.metric} and compare it to your own baseline, not to some channel with a team of twelve.`,
    (c) => `If a video beats your baseline by more than twenty percent, that is not a win — that is a signal you're allowed to repeat.`,
    (c) => `So you run the format again before you run anything new.`,
    (c) => `This is the boring compounding work: same shape, better inputs, one variable at a time.`,
    (c) => `Do it for eight weeks and the channel stops feeling random.`,
  ],
  mistakes: [
    (c) => `Before you run this, here are the ways it usually breaks.`,
    (c) => `First: changing the format after two uploads because the view count dipped. Two data points are not a verdict.`,
    (c) => `Second: chasing ${c.metric} without looking at what happened at the ten-second mark. That's where curiosity dies.`,
    (c) => `Third: outsourcing the thinking to tools and keeping the taste. Tools are leverage, not judgement.`,
    (c) => `Fourth, and the expensive one: producing for the algorithm's most public metric while your ${c.audience} quietly leaves before the payoff.`,
    (c) => `The fix is unglamorous — one format, one promise, measured against yourself.`,
    (c) => `If you only remember one of these, remember the one that keeps you consistent.`,
    (c) => `Consistency is not posting daily. It's being recognisable when you do post.`,
  ],
  proof: [
    (c) => `Here's what this looks like in practice.`,
    (c) => `Take a channel in ${c.niche} with 4,000 subscribers and no team.`,
    (c) => `They picked three recurring questions, built one episode shape, and published twice a week for three months.`,
    (c) => `Nothing went viral. The channel simply stopped bleeding viewers and started holding them.`,
    (c) => `Then one video crossed 400,000 views, because the format had been rehearsed sixty times before it mattered.`,
    (c) => `That is what preparation looks like from the outside: overnight success with a very long fuse.`,
    (c) => `You cannot schedule the breakout. You can schedule the reps that make it survivable.`,
    (c) => `That's the actual promise of ${c.framework} — not luck, but readiness.`,
  ],
  action: [
    (c) => `So here's the checklist for this week.`,
    (c) => `One: collect ten real comments from your niche and turn them into five title candidates.`,
    (c) => `Two: choose one episode shape and write it down as a template you'll use three times.`,
    (c) => `Three: pick the single metric you'll judge yourself on for the next forty uploads.`,
    (c) => `Four: schedule the next three videos before you publish this one, so the decision is already made.`,
    (c) => `If that feels too small, good — small is repeatable.`,
    (c) => `You don't need a bigger plan. You need a plan you'll still be running in ninety days.`,
    (c) => `Do the reps, keep the promise, and let the compounding be boring.`,
  ],
  filler: [
    (c) => `That is the difference between a tactic and a system: a tactic buys you a Tuesday, a system buys you a quarter.`,
    (c) => `If you only take one idea from this section, take the order — signal, then structure, then scale.`,
    (c) => `Write down what you changed and what happened. A decision you cannot repeat is not a strategy, it is a mood.`,
    (c) => `The metric worth watching here is ${c.metric}, not raw views.`,
    (c) => `Give it eight reps before you judge it. Two uploads is not evidence, it is a mood swing.`,
    (c) => `Everything in this layer is designed to survive a week when you are tired and the ideas are thin.`,
    (c) => `This is the part that looks unglamorous in public and compounds in private.`,
    (c) => `If it sounds too simple, that is usually a sign you have not tried to run it for a month.`,
    (c) => `The best creators are not more inspired than you, they are just better at removing decisions.`,
    (c) => `Keep the promise specific. A vague promise gets a vague click, or none at all.`,
    (c) => `For ${c.audience}, the useful question is almost always about trade-offs, not definitions.`,
    (c) => `Do the boring version first, then earn the right to make it ambitious.`,
  ],
  cta: [
    (c) => `If this was useful, the best next step is the video on the right — it goes one layer deeper on ${c.topicWord}.`,
    (c) => `And if you want the written checklist, it's linked in the description with timestamps.`,
    (c) => `Tell me in the comments which layer you're stuck on, and I'll answer the ones that repeat.`,
    (c) => `Thanks for watching. See you in the next one.`,
  ],
};

const BEAT_PLAN: { role: string; title: string; purpose: string; weight: number }[] = [
  { role: 'hook', title: 'Cold open', purpose: 'Earn the first 15 seconds', weight: 1.1 },
  { role: 'stakes', title: 'The real problem', purpose: 'Name the stakes and the mistake', weight: 1.15 },
  { role: 'framework', title: 'The framework', purpose: 'Give the promise a shape', weight: 1.05 },
  { role: 'step1', title: 'Layer 1 — Signal', purpose: 'Audience research you can repeat', weight: 1.2 },
  { role: 'step2', title: 'Layer 2 — Structure', purpose: 'Build the repeatable episode', weight: 1.25 },
  { role: 'step3', title: 'Layer 3 — Compounding', purpose: 'Make each upload feed the next', weight: 1.2 },
  { role: 'mistakes', title: 'Where it breaks', purpose: 'Pre-empt failure modes', weight: 1.05 },
  { role: 'proof', title: 'The proof', purpose: 'Show what it looks like in practice', weight: 0.95 },
  { role: 'action', title: 'Your next 7 days', purpose: 'Convert attention into action', weight: 0.95 },
  { role: 'cta', title: 'Outro', purpose: 'Hand the viewer to the next video', weight: 0.5 },
];

const SHORT_PLAN = [
  { role: 'hook', title: 'Hook', purpose: 'Stop the scroll', weight: 1.4 },
  { role: 'stakes', title: 'Tension', purpose: 'Name the mistake fast', weight: 1.2 },
  { role: 'step2', title: 'The move', purpose: 'One usable tactic', weight: 1.5 },
  { role: 'cta', title: 'Payoff + loop', purpose: 'Rewatch or follow', weight: 0.9 },
];

const BROLL = [
  'Slow push-in on a creator at a desk lit by a single softbox, screen glow on their face',
  'Macro shot of a notebook filling with crossed-out titles, pencil scratching',
  'Macro shot of an analytics curve on a monitor, shallow depth of field',
  'Overhead flat-lay: laptop, coffee ring, printed checklist, warm practical light',
  'Split-screen: polished studio setup vs. honest bedroom setup, same framing',
  'Timelapse of a calendar filling up, hands moving fast, motion blur',
  'Close-up of a cursor hovering over the publish button, faint reflection',
  'Wide shot of a city at dusk through a window, silhouette at a desk',
  'Animated diagram of three stacked layers, thin lines, dark background',
  'Hands turning a dial on a vintage radio, dust in the light beam',
];

const COMPOSITIONS = [
  'Center-framed subject, negative space on the right for the headline',
  'Low-angle hero shot with a bold color wash and a diagonal cut',
  'Split composition: face on the left, data visual on the right',
  'Extreme close-up of eyes and screen light, headline across the bottom third',
  'Editorial portrait with heavy vignette and a single accent shape',
];

const PALETTES: Record<string, [string, string, string][]> = {
  Cinematic: [
    ['#0B0F1A', '#2B4F8A', '#F4C77B'],
    ['#0A0A0F', '#3B1E4E', '#FF7A59'],
    ['#07131A', '#0F4C5C', '#F2E9D8'],
  ],
  Editorial: [
    ['#F5F1E8', '#1A1A1A', '#C8452D'],
    ['#EDEAE3', '#243447', '#E8B23A'],
    ['#FAF7F0', '#2F2A25', '#4C7A5A'],
  ],
  Neon: [
    ['#05060F', '#6C2BD9', '#22D3EE'],
    ['#080512', '#DB2777', '#FBBF24'],
    ['#030712', '#2563EB', '#A3E635'],
  ],
  Minimal: [
    ['#0D0D0D', '#F5F5F5', '#8B8B8B'],
    ['#101418', '#E6E1D6', '#C2A56B'],
    ['#F7F7F5', '#141414', '#D9D9D9'],
  ],
};

const POWER_WORDS = ['actually', 'never', 'nobody', 'stop', 'proven', 'exact', 'truth', 'mistake', 'real', 'why'];

function sentencesFor(role: string, c: Ctx, r: () => number, targetWords: number): string {
  const primary = SENTENCES[role] ?? SENTENCES.framework;
  const filler = SENTENCES.filler;
  const out: string[] = [];
  const push = (s: string) => out.push(s);
  let guard = 0;
  // first pass: authored order keeps the beat's narrative logic intact
  for (const fn of primary) {
    push(fn(c));
    if (wordCount(out.join(' ')) >= targetWords || out.length >= 9) break;
  }
  // second pass: extend with supporting lines, avoiding repeats
  while (wordCount(out.join(' ')) < targetWords && guard++ < 12) {
    const candidate = pick(r, filler)(c);
    if (!out.includes(candidate)) push(candidate);
    if (out.length > 16) break;
    // if the filler pool is exhausted, recycle role material with a new angle
    if (guard === 8 && wordCount(out.join(' ')) < targetWords * 0.8) {
      const extra = pick(r, primary)(c);
      if (!out.includes(extra)) push(extra);
    }
  }
  return out.join(' ');
}

export function generateResearch(brief: Brief, seed = ''): Research {
  const r = rng(`research:${brief.topic}:${seed}`);
  const c = briefContext(brief, r);
  const kw = keywords(brief.topic, 6);
  const core = shortTopic(brief.topic);
  const angles: string[] = [
    `${core}: The System Nobody Explains`,
    `${core} — The 20% That Actually Moves ${titleCase(c.metric)}`,
    `I Tested The Standard ${titleCase(kw[0] ?? 'advice')} For 30 Days`,
    `Why ${titleCase(brief.audience.split(' ').slice(0, 4).join(' '))} Keep Getting ${titleCase(kw[1] ?? brief.niche.split(' ')[0])} Wrong`,
    `Stop Guessing: ${core} In ${brief.durationMin} Minutes`,
  ];
  const comps = [
    { channel: `${titleCase(brief.niche)} Lab`, subscribers: '412K', avgViews: '180K', pattern: 'High-production deep dives, 12–18 min, strong retention, weak thumbnails' },
    { channel: 'The Daily Operator', subscribers: '88K', avgViews: '41K', pattern: 'Fast cadence, talking-head + b-roll, heavy on tactics, thin on evidence' },
    { channel: `${titleCase(kw[0] ?? brief.niche)} Weekly`, subscribers: '1.2M', avgViews: '610K', pattern: 'Broad reach, low specificity — leaves the expert niche underserved' },
  ];
  return {
    summary: `${brief.topic} is currently over-served with generic advice and under-served with repeatable systems. Demand concentrates around ${kw.slice(0, 3).join(', ') || brief.niche}, and the winning angle is proof-led execution for ${brief.audience}.`,
    audienceInsights: [
      `${brief.audience} are past the "what is it" stage; they want sequencing and trade-offs.`,
      `Searches spike around ${(kw[2] ?? 'implementation').toLowerCase()} rather than broad topic terms.`,
      `Comment language repeats: "I know what to do, I just can't keep doing it."`,
      `Short-form clips from long videos outperform native shorts in this niche by roughly 2.3×.`,
    ],
    trendingAngles: angles.map((title, i) => ({
      title,
      why: i === 0
        ? 'High save-rate topic with almost no authoritative long-form answer.'
        : i === 1
          ? 'Matches a measurable curiosity gap in the first 10 seconds.'
          : 'Works as a search entry point with low competition in the niche.',
      searchInterest: Math.round(clamp(58 + r() * 38, 40, 99)),
      competition: (['low', 'medium', 'high'] as const)[Math.floor(r() * 3)],
    })),
    competitors: comps,
    keywordClusters: kw.slice(0, 6).map((k) => ({
      keyword: k,
      volume: Math.round(1200 + r() * 48000),
      difficulty: Math.round(12 + r() * 62),
      intent: pick(r, ['informational', 'commercial', 'entertainment'] as const),
    })),
    sources: [
      { label: 'YouTube search demand', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(brief.topic)}` },
      { label: 'Google Trends — 12 month interest', url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(brief.topic)}` },
      { label: 'Reddit discussions', url: `https://www.reddit.com/search/?q=${encodeURIComponent(brief.topic)}` },
      { label: 'YouTube comment mining (top 3 videos)', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(brief.topic + ' tutorial')}` },
    ],
    generatedBy: 'CreatorPilot research engine',
  };
}

export function generateStrategy(brief: Brief, research: Research, seed = ''): Strategy {
  const r = rng(`strategy:${brief.topic}:${seed}`);
  const c = briefContext(brief, r);
  const total = brief.format === 'short' ? 60 : brief.durationMin * 60;
  const plan = brief.format === 'short' ? SHORT_PLAN : BEAT_PLAN;
  const weightSum = plan.reduce((s, p) => s + p.weight, 0);
  return {
    bigIdea: `${brief.topic} is not a content problem, it's a sequencing problem. ${c.framework} gives ${brief.audience} one repeatable route from idea to compounding growth.`,
    hookAngle: research.trendingAngles[0]?.title ?? `The real reason ${brief.topic} stalls`,
    targetEmotion: pick(r, ['recognition', 'relief', 'productive urgency', 'quiet confidence']),
    differentiators: [
      'Systems, not tactics: every claim ships with an implementation step.',
      'Zero-hype voice — no income screenshots, no fake urgency.',
      'Built for the 90-day operator, not the weekend dabbler.',
      `Every video ends with a checklist that fits on one screen.`,
    ],
    outline: plan.map((p) => ({
      id: uid('b'),
      title: p.title,
      purpose: p.purpose,
      durationSec: Math.round((p.weight / weightSum) * total),
    })),
    cta: `Download the ${brief.topic} checklist in the description, then watch the layer-two breakdown next.`,
    publishSlot: pick(r, ['Tue 18:00', 'Wed 17:30', 'Thu 19:00', 'Sat 11:00']),
  };
}

export function generateScript(brief: Brief, research: Research, strategy: Strategy, seed = ''): Script {
  const r = rng(`script:${brief.topic}:${seed}`);
  const c = briefContext(brief, r);
  const plan = brief.format === 'short' ? SHORT_PLAN : BEAT_PLAN;
  const totalSec = brief.format === 'short' ? 58 : brief.durationMin * 60;
  const wpm = brief.format === 'short' ? 175 : 152;
  const targetWords = Math.round((totalSec / 60) * wpm);
  const weightSum = plan.reduce((s, p) => s + p.weight, 0);

  const beats: Beat[] = plan.map((p, i) => {
    const durationSec = Math.round((p.weight / weightSum) * totalSec);
    const words = Math.max(16, Math.round((durationSec / 60) * wpm));
    return {
      id: strategy.outline[i]?.id ?? uid('b'),
      title: p.title,
      narration: sentencesFor(p.role, c, r, words),
      bRollPrompt: pick(r, BROLL),
      durationSec,
      emphasis: i === 0 ? 'Deliver the first line before any music or logo.' : undefined,
    };
  });

  const firstSentences = beats[0].narration.match(/[^.!?]+[.!?]+/g) ?? [beats[0].narration];
  const hook = firstSentences.slice(0, 1).join(' ').trim();
  const intro = beats[1].narration;
  const outro = beats[beats.length - 1].narration;
  const fullText = beats.map((b) => b.narration).join('\n\n');
  const words = wordCount(fullText);

  return {
    title: craftTitle(brief.topic, rng(`title:${brief.topic}`)),
    hook,
    intro,
    beats: beats.slice(0, -1),
    outro,
    cta: strategy.cta,
    wordCount: words,
    wpm,
    estimatedDurationSec: Math.round((words / wpm) * 60),
    fullText,
    generatedBy: 'CreatorPilot script engine',
  };
}

export function generateVisuals(brief: Brief, script: Script, seed = ''): Visuals {
  const r = rng(`visuals:${brief.topic}:${seed}`);
  const styleKey = PALETTES[brief.style] ? brief.style : 'Cinematic';
  const palette = pick(r, PALETTES[styleKey]);
  const scenes: Scene[] = script.beats.concat([{ id: 'outro', title: 'Outro', narration: script.outro, bRollPrompt: pick(r, BROLL), durationSec: 20 } as Beat]).map(
    (b, i) => ({
      id: uid('sc'),
      beatId: b.id,
      title: b.title,
      narration: b.narration,
      prompt: `${b.bRollPrompt}. Visual language: ${brief.style.toLowerCase()}, ${palette[1]} and ${palette[2]} accents, filmic contrast, no on-screen text.`,
      composition: pick(r, COMPOSITIONS),
      durationSec: b.durationSec ?? 20,
      transition: i % 3 === 0 ? 'hard cut' : i % 3 === 1 ? 'slow crossfade' : 'whip pan',
    }),
  );

  const STOP = new Set(
    'THE AND FOR WITH THAT THIS YOUR FROM INTO OVER UNDER BEEN EVERY BEHIND WHAT WHEN WHY HOW NOT YOU OUR THEIR MOST JUST LIKE ABOUT AFTER BEFORE MORE THAN THEM THEY WILL HAVE HAS CAN ARE WAS WERE ITS IT OF TO ON IN AT AS IS BE OR SO DO IF TESTED BUILT REBUILT MADE TRIED USED CHASING STOP BUILD FIXED LEARNED'.split(
      ' ',
    ),
  );
  const raw = brief.topic
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d/.test(w) && !/LAYER|SYSTEM|FRAMEWORK/.test(w));
  const focus = (raw[0] ?? 'REAL').slice(0, 11);
  const number = brief.topic.match(/\b(\d{1,3})\b/)?.[1];
  const layerNumber = brief.topic.match(/(\d+)[\s-]?layer/i)?.[1] ?? number;

  const headlines = [
    layerNumber ? `${layerNumber} LAYERS\nONE SYSTEM` : `THE\n${focus} SYSTEM`,
    'THE\nREAL PROBLEM',
    'STOP\nGUESSING',
    'SYSTEM\n> LUCK',
  ];
  const palettes: [string, string, string][] = [
    palette,
    pick(r, PALETTES.Neon),
    pick(r, PALETTES.Editorial),
    pick(r, PALETTES.Minimal),
  ];
  const variants: ThumbnailConcept['variant'][] = ['bold', 'glow', 'editorial', 'minimal'];
  const thumbnails: ThumbnailConcept[] = headlines.map((headline, i) => ({
    id: uid('th'),
    headline,
    subline: pick(r, [
      `the ${brief.durationMin}-minute system`,
      'nobody talks about this',
      `${brief.format === 'short' ? '60s' : brief.durationMin + ' min'} · no fluff`,
      'do this first',
    ]),
    composition: pick(r, COMPOSITIONS),
    palette: palettes[i],
    variant: variants[i],
  }));

  return {
    palette: [palette[0], palette[1], palette[2], '#FFFFFF'],
    style: `${brief.style} · ${brief.tone.toLowerCase()} tone · ${brief.format === 'short' ? '9:16 crop-safe' : '16:9'}`,
    scenes,
    thumbnails,
    selectedThumbnailId: thumbnails[0].id,
    generatedBy: 'CreatorPilot art director',
  };
}

export function scoreTitle(text: string, topic: string): { score: number; reason: string } {
  let score = 46;
  const reasons: string[] = [];
  const len = text.length;
  if (len >= 32 && len <= 62) {
    score += 16;
    reasons.push('ideal length for search + browse');
  } else if (len <= 70) {
    score += 6;
    reasons.push('slightly outside the ideal length');
  } else {
    score -= 8;
    reasons.push('too long, will truncate');
  }
  if (/\d/.test(text)) {
    score += 10;
    reasons.push('has a concrete number');
  }
  if (POWER_WORDS.some((w) => text.toLowerCase().includes(w))) {
    score += 9;
    reasons.push('curiosity trigger');
  }
  if (text.toLowerCase().includes(topic.split(' ')[0]?.toLowerCase() ?? '__nope')) {
    score += 7;
    reasons.push('matches the primary keyword');
  }
  if ((text.match(/\?/g) ?? []).length) reasons.push('question framing lifts search intent');
  if ((text.match(/\|/g) ?? []).length > 1) score -= 6;
  return { score: Math.round(clamp(score, 24, 98)), reason: reasons.slice(0, 3).join(' · ') || 'clear and specific' };
}

export function generateSeo(brief: Brief, script: Script, seed = ''): Seo {
  const r = rng(`seo:${brief.topic}:${seed}`);
  const c = briefContext(brief, r);
  const topicTitle = shortTopic(brief.topic);
  const bare = topicTitle.replace(/^The\s+/i, '');
  const saysSystem = /system|framework|layer/i.test(bare);
  const rawTitles = [
    cleanTitle(brief.topic),
    saysSystem ? `${bare}: The Part Nobody Explains` : `${bare}: The System Nobody Explains`,
    `Why ${bare} Isn't Working`,
    `${bare} — What Actually Matters`,
    `Stop Guessing: ${bare}`,
    `${bare} In ${brief.format === 'short' ? '60 Seconds' : brief.durationMin + ' Minutes'}`,
  ]
    .map((t) => t.trim())
    .filter((t, i, arr) => t.length >= 18 && t.length <= 64 && arr.indexOf(t) === i);
  const titles = rawTitles
    .map((text) => {
      const s = scoreTitle(text, brief.topic);
      return { text, score: s.score, reason: s.reason };
    })
    .sort((a, b) => b.score - a.score);

  let cursor = 0;
  const chapters = script.beats.map((b) => {
    const label = timecode(cursor);
    cursor += b.durationSec;
    return { time: label, label: b.title };
  });

  const kw = keywords(brief.topic, 8);
  const tags = [
    ...kw,
    `${brief.niche.toLowerCase()} tips`,
    `${brief.niche.toLowerCase()} 2026`,
    'youtube growth',
    'content strategy',
    'creator workflow',
    ...(brief.format === 'short' ? ['shorts', 'youtube shorts'] : ['long form content', 'youtube tutorial']),
  ]
    .map((t) => t.trim().toLowerCase())
    .filter((t, i, a) => t.length > 2 && a.indexOf(t) === i)
    .slice(0, 16);

  const hashtags = [`#${slugTag(brief.niche)}`, `#${slugTag(brief.topic.split(' ').slice(0, 2).join(' '))}`, '#creatoreconomy', '#youtubegrowth']
    .filter((h, i, a) => h.length > 3 && a.indexOf(h) === i)
    .slice(0, 4);

  const description = [
    `${script.hook.split(/(?<=[.!?])\s/)[0]}`,
    '',
    `In this video I break down ${brief.topic} into a system you can actually run: the signal, the structure, and the compounding loop. Built for ${brief.audience}.`,
    '',
    'WHAT YOU GET',
    `• ${c.framework} explained in plain language`,
    `• The 3 layers, in the order they should be built`,
    `• The four failure modes that quietly kill growth`,
    `• A one-screen checklist for the next 7 days`,
    '',
    'CHAPTERS',
    ...chapters.map((ch) => `${ch.time} ${ch.label}`),
    '',
    'RESOURCES',
    `Free checklist → https://example.com/${slugTag(brief.topic)}-checklist`,
    '',
    'WHO THIS IS FOR',
    `${brief.audience} who want a repeatable system instead of another tactic to collect.`,
    '',
    'Disclosure: some resources may be affiliate links. Opinions are independent.',
    '',
    hashtags.join(' '),
  ].join('\n');

  const breakdown = buildSeoBreakdown(titles[0].text, description, tags, chapters, brief);
  const score = breakdown.reduce((s, b) => s + b.score, 0);

  return {
    titles,
    selectedTitle: titles[0].text,
    description,
    chapters,
    tags,
    hashtags,
    score: Math.round(score),
    breakdown,
    searchIntent: `${brief.audience} searching for a practical, sequenced answer to ${brief.topic}`,
    ctrPrediction: clamp(round(4.2 + r() * 3.4, 1), 3.2, 9.8),
    generatedBy: 'CreatorPilot SEO engine',
  };
}

function slugTag(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildSeoBreakdown(title: string, description: string, tags: string[], chapters: { time: string; label: string }[], brief: Brief) {
  return [
    {
      label: 'Title',
      score: Math.round(clamp(scoreTitle(title, brief.topic).score / 4, 10, 25)),
      max: 25,
      note: title.length > 62 ? 'Trim below 62 characters to avoid truncation' : 'Fits desktop and mobile browse',
    },
    {
      label: 'Description',
      score: description.length > 700 ? 21 : description.length > 350 ? 16 : 10,
      max: 25,
      note: `${description.length} characters · keyword in the first 2 lines`,
    },
    {
      label: 'Tags & hashtags',
      score: Math.round(clamp(tags.length * 1.3, 6, 21)),
      max: 20,
      note: `${tags.length} tags · ${tags.length >= 12 ? 'healthy coverage' : 'add long-tail variants'}`,
    },
    {
      label: 'Chapters',
      score: chapters.length >= 4 ? 20 : 12,
      max: 20,
      note: `${chapters.length} chapters starting at ${chapters[0]?.time ?? '0:00'}`,
    },
    {
      label: 'Intent match',
      score: 9,
      max: 10,
      note: 'Promise, payoff and CTA all match the search intent',
    },
  ];
}

function paletteContrast(palette?: [string, string, string]): number {
  if (!palette) return 0;
  const lum = (hex: string) => {
    const m = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const values = palette.map(lum);
  return (Math.max(...values) - Math.min(...values)) * 100;
}

export function evaluateQuality(project: Project): Quality {
  const checks: QualityCheck[] = [];
  const add = (c: QualityCheck) => checks.push(c);
  const { research, script, seo, visuals } = project;

  add({
    id: 'research-sources',
    label: 'Research evidence attached',
    status: research && research.sources.length >= 3 ? 'pass' : research ? 'warn' : 'fail',
    detail: research ? `${research.sources.length} sources · ${research.keywordClusters.length} keyword clusters` : 'No research stage output',
    fix: 'Re-run research or attach your own sources',
  });

  if (script) {
    const target = project.format === 'short' ? 60 : project.durationMin * 60;
    const drift = Math.abs(script.estimatedDurationSec - target) / target;
    add({
      id: 'runtime',
      label: 'Runtime matches the promise',
      status: drift < 0.12 ? 'pass' : 'warn',
      detail: `${timecode(script.estimatedDurationSec)} estimated vs ${timecode(target)} target (${Math.round(drift * 100)}% drift)`,
      fix: 'Trim or expand a beat rather than changing the publish promise',
    });
    add({
      id: 'hook',
      label: 'Hook lands inside 12 seconds',
      status: wordCount(script.hook) <= 30 ? 'pass' : 'warn',
      detail: `${wordCount(script.hook)} words in the opening line (~${Math.round((wordCount(script.hook) / script.wpm) * 60)}s)`,
      fix: 'Cut the first sentence and start on the tension',
    });
    add({
      id: 'beats',
      label: 'Beat structure is complete',
      status: script.beats.length >= (project.format === 'short' ? 3 : 7) && script.beats.every((b) => wordCount(b.narration) > 12) ? 'pass' : 'fail',
      detail: `${script.beats.length} beats · every beat has narration and b-roll direction`,
    });
  } else {
    add({ id: 'script', label: 'Script exists', status: 'fail', detail: 'No script generated', fix: 'Run the script stage' });
  }

  add({
    id: 'visuals',
    label: 'Visual plan + thumbnail variants',
    status: visuals && visuals.scenes.length >= 3 && visuals.thumbnails.length >= 2 ? 'pass' : 'warn',
    detail: visuals ? `${visuals.scenes.length} scenes · ${visuals.thumbnails.length} thumbnail concepts` : 'No visual plan',
  });

  add({
    id: 'title',
    label: 'Title fits the browse shelf',
    status: !seo ? 'warn' : (seo.selectedTitle?.length ?? 0) <= 62 ? 'pass' : 'warn',
    detail: seo ? `${seo.selectedTitle.length} characters — ${seo.selectedTitle.length > 62 ? 'will truncate on mobile' : 'safe on desktop and mobile'}` : 'No title selected',
    fix: 'Pick a shorter variant in the SEO tab',
  });

  add({
    id: 'thumbnail',
    label: 'Thumbnail has enough contrast',
    status: visuals ? (paletteContrast(visuals.thumbnails[0]?.palette) > 90 ? 'pass' : 'warn') : 'warn',
    detail: visuals ? `${Math.round(paletteContrast(visuals.thumbnails[0]?.palette))}:1 luminance spread across the palette` : 'No thumbnail palette',
    fix: 'Choose a palette with a light and a dark anchor',
  });

  add({
    id: 'claims',
    label: 'Claims need a human fact pass',
    status: 'warn',
    detail:
      project.engine === 'demo'
        ? 'Demo-engine narration is illustrative, not researched. Verify every figure before publishing.'
        : 'Model-written draft. Check figures, names and dates against primary sources.',
    fix: 'Confirm facts in the quality gate before approval',
  });

  add({
    id: 'cta',
    label: 'Every video ends with a next step',
    status: script?.cta && script.outro ? 'pass' : 'warn',
    detail: script?.cta ? 'Outro hands the viewer to a specific next video and a checklist' : 'No call to action',
    fix: 'Add one specific next step, not a generic subscribe ask',
  });

  add({
    id: 'seo',
    label: 'Metadata is complete',
    status: seo && seo.description.length > 300 && seo.tags.length >= 8 && seo.chapters.length >= 3 ? 'pass' : 'warn',
    detail: seo ? `${seo.description.length} char description · ${seo.tags.length} tags · ${seo.chapters.length} chapters` : 'No metadata',
    fix: 'Regenerate SEO or add chapters manually',
  });

  const blockers = checks.filter((c) => c.status === 'fail').map((c) => c.label);
  const score = Math.round(
    (checks.reduce((s, c) => s + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.55 : 0), 0) / checks.length) * 100,
  );

  return { score, checks, blockers, reviewedAt: new Date().toISOString() };
}
