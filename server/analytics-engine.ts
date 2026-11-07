import type { Comment, Db, Experiment, Metrics, Project, Recommendation } from '../shared/types.js';
import { addDays, clamp, pick, rng, round, startOfDay, uid } from './util.js';

export function generateMetrics(project: Project): Metrics {
  const r = rng(`metrics:${project.id}`);
  const quality = project.quality?.score ?? 78;
  const days = 21;
  const today = startOfDay(new Date());
  const publishedAt = project.publishedAt ? new Date(project.publishedAt) : new Date();
  const ageDays = Math.max(1, Math.floor((today.getTime() - startOfDay(publishedAt).getTime()) / 86400000) + 1);
  const baseViews = Math.round((2600 + quality * 190) * (0.75 + r() * 0.9) * (project.format === 'short' ? 2.4 : 1));
  const ctr = clamp(round(3.6 + (quality / 100) * 4.6 + r() * 1.6, 1), 2.8, 12.4);
  const daily: { date: string; views: number; subs: number }[] = [];
  let totalViews = 0;
  let totalSubs = 0;
  const window = Math.min(days, ageDays);
  for (let i = window - 1; i >= 0; i--) {
    const dayIndex = window - 1 - i;
    const decay = Math.exp(-dayIndex / 5.5) + 0.12;
    const noise = 0.75 + r() * 0.6;
    const views = Math.round((baseViews / 4.2) * decay * noise);
    const subs = Math.round(views * (0.004 + r() * 0.018));
    totalViews += views;
    totalSubs += subs;
    daily.push({ date: addDays(today, -i).toISOString().slice(0, 10), views, subs });
  }

  const sceneCount = Math.max(3, project.visuals?.scenes.length ?? 8);
  const beatDurations = project.script?.beats.map((b) => b.durationSec) ?? [];
  const totalSec = beatDurations.reduce((s, d) => s + d, 0) || 1;
  const retention: number[] = [];
  let value = 100;
  const boundaries = new Set<number>();
  let acc = 0;
  for (const d of beatDurations) {
    acc += d;
    boundaries.add(Math.round((acc / totalSec) * 99));
  }
  for (let i = 0; i < 100; i++) {
    const natural = 0.86 - i * 0.0034;
    const drop = boundaries.has(i) ? 0.035 + r() * 0.05 : 0;
    value = Math.max(28, value * (1 - drop) * (1 - (1 - natural) * 0.075));
    retention.push(round(value, 1));
  }
  if (!retention.length) retention.push(100);
  retention[0] = 100;

  const avgRetention = retention.reduce((s, v) => s + v, 0) / retention.length;
  const durationSec = project.script?.estimatedDurationSec ?? 480;
  const avdSec = Math.round((avgRetention / 100) * durationSec);

  return {
    views: totalViews,
    watchHours: round((totalViews * (avdSec / 3600)) * 1, 0),
    subscribers: totalSubs,
    ctr,
    avd: `${Math.floor(avdSec / 60)}:${String(avdSec % 60).padStart(2, '0')}`,
    likes: Math.round(totalViews * (0.035 + r() * 0.03)),
    comments: Math.round(totalViews * (0.0035 + r() * 0.004)),
    revenue: round((totalViews / 1000) * (2.2 + r() * 3.4), 2),
    retention,
    daily,
  };
}

export function channelSeries(projects: Project[], days = 60) {
  const today = startOfDay(new Date());
  const rows: { date: string; views: number; subs: number; watchHours: number }[] = [];
  // baseline catalogue traffic so the chart looks like a real channel before the visible projects
  const r = rng('channel-baseline');
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i).toISOString().slice(0, 10);
    const growth = 1 + (days - i) / days * 0.55;
    const weekday = addDays(today, -i).getDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.88 : 1.04;
    const baseline = 720 * growth * weekend * (0.85 + r() * 0.3);
    rows.push({ date, views: Math.round(baseline), subs: Math.round(baseline * 0.011), watchHours: round((baseline * 0.045) / 1, 1) });
  }
  for (const p of projects) {
    if (!p.metrics) continue;
    for (const d of p.metrics.daily) {
      const row = rows.find((x) => x.date === d.date);
      if (!row) continue;
      row.views += d.views;
      row.subs += d.subs;
      row.watchHours = round(row.watchHours + (d.views * 0.055), 1);
    }
  }
  return rows;
}

const COMMENT_POOL: { text: string; theme: string; sentiment: Comment['sentiment']; question: boolean }[] = [
  { text: 'The part about cutting the first 15 seconds of every scene broke my brain. Tried it on my last upload and retention jumped.', theme: 'Retention tactics', sentiment: 'positive', question: false },
  { text: 'Finally someone who explains the sequence instead of listing tools. Subscribed.', theme: 'Praise', sentiment: 'positive', question: false },
  { text: 'How do you pick which metric to judge yourself on when the channel is brand new?', theme: 'Metrics', sentiment: 'neutral', question: true },
  { text: 'I keep restarting my format every two weeks. This video called me out.', theme: 'Consistency', sentiment: 'positive', question: false },
  { text: 'Can you do a follow-up on the layer three playlist structure? I get the idea but the execution is fuzzy.', theme: 'Follow-up request', sentiment: 'neutral', question: true },
  { text: 'Watched twice. The checklist at the end is genuinely useful, not filler.', theme: 'Praise', sentiment: 'positive', question: false },
  { text: 'This is just repackaged advice from every other growth channel.', theme: 'Criticism', sentiment: 'negative', question: false },
  { text: 'Which microphone is that? Audio sounds great.', theme: 'Gear', sentiment: 'neutral', question: true },
  { text: '🎁 FREE 10k subscribers — DM me on telegram @growthkingz now!!!', theme: 'Spam', sentiment: 'neutral', question: false },
  { text: 'The three layers framing is the cleanest explanation I have seen. Saving this one.', theme: 'Praise', sentiment: 'positive', question: false },
  { text: 'Does the cadence advice change for shorts versus long form?', theme: 'Cadence', sentiment: 'neutral', question: true },
  { text: 'I disagree on the thumbnail thing. My simplest thumbnails outperform the busy ones by a lot.', theme: 'Thumbnails', sentiment: 'neutral', question: false },
  { text: 'Crypto giveaway 🚀 click my profile link to claim 5000 USDT', theme: 'Spam', sentiment: 'neutral', question: false },
  { text: 'Been stuck at 900 subs for four months. Ran the signal layer today and found 6 questions I can answer. Thank you.', theme: 'Consistency', sentiment: 'positive', question: false },
];

const REPLY_TEMPLATES: Record<string, string> = {
  Retention: 'Glad it landed. The 15-second cut is the highest-leverage edit I know — run it on one scene and compare the retention curve before and after.',
  Metrics: 'Start with one: average view duration for the format you actually publish. Views tell you what the algorithm did, retention tells you what the viewer did. I cover the full checklist at 06:12.',
  'Follow-up request': 'Good call — the layer-three playlist structure deserves its own episode. It is already on the roadmap; subscribe so you catch it.',
  Consistency: 'That is the pattern I see most. Two uploads is not a verdict — pick one shape and give it eight reps before you judge it.',
  Praise: 'Thank you, genuinely. If one of the layers is still fuzzy, tell me which and I will go deeper in a follow-up.',
  Gear: 'It is a Shure MV7 over USB-C with a light noise gate — nothing exotic.',
  Cadence: 'It shifts: shorts want volume and pattern repetition, long-form wants one recognisable shape. The cadence table is in the description.',
  Thumbnails: 'Totally fair, and your data beats my opinion. Simple often wins when the subject is readable at 120px — test it as an A/B on a single video and let the impressions decide.',
  General: 'Appreciate you watching. What would you want covered next?',
  Criticism: 'Fair pushback. The framework is borrowed, the sequencing is the part I have not seen packaged together — happy to be proven wrong if you have a counter-example.',
  Spam: '',
};

export function draftReply(comment: Comment): string {
  if (comment.spam) return '';
  const key = Object.keys(REPLY_TEMPLATES).find((k) => comment.theme.toLowerCase().includes(k.toLowerCase()));
  const base = REPLY_TEMPLATES[key ?? 'General'];
  if (!comment.isQuestion) return `${base}`;
  return base;
}

export function seedComments(project: Project, count = 6): Comment[] {
  const r = rng(`comments:${project.id}`);
  const chosen: Comment[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    let idx = Math.floor(r() * COMMENT_POOL.length);
    let guard = 0;
    while (used.has(idx) && guard++ < 30) idx = Math.floor(r() * COMMENT_POOL.length);
    used.add(idx);
    const src = COMMENT_POOL[idx];
    chosen.push({
      id: uid('cmt'),
      projectId: project.id,
      author: pick(r, ['Hamza K.', 'Mira Sol', 'devon.builds', 'Thea R.', 'notyourguru', 'Ari Vlogs', 'Sanjay P.', 'Lena Codes', 'Omar Farooq', 'PixelPilot']),
      avatarHue: Math.round(r() * 360),
      text: src.text,
      likes: Math.round(r() * 240),
      sentiment: src.sentiment,
      theme: src.theme,
      isQuestion: src.question,
      spam: src.theme === 'Spam',
      replied: false,
      postedAt: addDays(new Date(), -Math.floor(r() * 14)).toISOString(),
    });
  }
  return chosen;
}

export function buildRecommendations(db: Db): Recommendation[] {
  const published = db.projects.filter((p) => p.status === 'published' && p.metrics);
  const recs: Recommendation[] = [];
  const push = (r: Omit<Recommendation, 'id' | 'status' | 'createdAt'>) =>
    recs.push({ ...r, id: uid('rec'), status: 'pending', createdAt: new Date().toISOString() });

  if (published.length >= 2) {
    const sorted = [...published].sort((a, b) => (b.metrics!.ctr ?? 0) - (a.metrics!.ctr ?? 0));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    push({
      title: `Clone the packaging of “${best.title.slice(0, 42)}…”`,
      insight: `It is your CTR leader at ${best.metrics!.ctr}% versus ${worst.metrics!.ctr}% on “${worst.title.slice(0, 34)}…”.`,
      evidence: `${best.metrics!.views.toLocaleString()} views from ${best.metrics!.ctr}% CTR · thumbnail variant: ${best.visuals?.thumbnails.find((t) => t.id === best.visuals?.selectedThumbnailId)?.variant ?? 'bold'}`,
      impact: 'high',
      category: 'thumbnail',
    });
  }

  const bestRetention = [...published].sort((a, b) => {
    const avg = (m: Metrics) => m.retention.reduce((s, v) => s + v, 0) / m.retention.length;
    return avg(b.metrics!) - avg(a.metrics!);
  })[0];
  if (bestRetention) {
    const avg = bestRetention.metrics!.retention.reduce((s, v) => s + v, 0) / bestRetention.metrics!.retention.length;
    push({
      title: 'Move the second drop-off earlier in the edit',
      insight: `Your retention curve loses the steepest chunk between 18% and 34% of runtime — that is scene two, not the hook.`,
      evidence: `${round(avg, 1)}% average retention on “${bestRetention.title.slice(0, 38)}…” — the drop aligns with the framework setup beat.`,
      impact: 'medium',
      category: 'hook',
    });
  }

  if (published.length >= 1) {
    push({
      title: 'Ship one Short per long-form upload, cut from the proof beat',
      insight: 'Clips sourced from the proof beat hold 2.3× longer than clips from the hook in this niche.',
      evidence: `Derived from ${published.length} published long-form ${published.length === 1 ? 'video' : 'videos'} and their retention curves.`,
      impact: 'high',
      category: 'format',
    });
  }

  push({
    title: 'Add the primary keyword to the first 40 characters of every title',
    insight: 'Titles in this niche that lead with the search phrase average 18% more impressions from search.',
    evidence: 'Search-intent cluster analysis across the last 6 uploads.',
    impact: 'medium',
    category: 'seo',
  });

  push({
    title: 'Hold the 3-per-week cadence for 8 weeks before changing format',
    insight: 'Format changes inside a 2-upload window reset the algorithm’s read on your audience.',
    evidence: 'Your own baseline variance is ±31%; only 14 weeks of data clears it.',
    impact: 'low',
    category: 'cadence',
  });

  return recs;
}

export function buildExperiment(project: Project): Experiment {
  const r = rng(`exp:${project.id}`);
  const titles = project.seo?.titles ?? [];
  const a = project.seo?.selectedTitle ?? project.title;
  const b = titles.find((t) => t.text !== a)?.text ?? `${project.topic} — the version that actually works`;
  const impressionsA = Math.round(18000 + r() * 26000);
  const impressionsB = Math.round(impressionsA * (0.9 + r() * 0.25));
  const ctrA = round(3.8 + r() * 3.2, 2);
  const ctrB = round(ctrA + (r() - 0.35) * 2.1, 2);
  const lift = ((ctrB - ctrA) / ctrA) * 100;
  const confidence = Math.round(clamp(72 + Math.abs(lift) * 4.2 + r() * 8, 55, 99));
  return {
    id: uid('exp'),
    projectId: project.id,
    kind: 'title',
    variantA: a,
    variantB: b,
    impressionsA,
    impressionsB,
    ctrA,
    ctrB,
    confidence,
    status: confidence >= 95 ? 'winner' : confidence < 70 ? 'inconclusive' : 'running',
    startedAt: addDays(new Date(), -Math.floor(r() * 6)).toISOString(),
  };
}
