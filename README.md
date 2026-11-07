# CreatorPilot Studio

**The AI studio that runs a YouTube channel end to end — and waits for your approval before anything ships.**

CreatorPilot researches a topic, writes the strategy and a spoken-word script, designs a shot list and four real thumbnails, **generates scene visuals and narration, renders a downloadable MP4**, packages the SEO, scores the video against a quality gate, schedules it, and then learns from its own analytics. It runs locally, with your own API keys or with no keys at all.

> Built as a premium, self-hosted alternative to the excellent open-source [youtube-automation-agent](https://github.com/darkzOGx/youtube-automation-agent). The full teardown of that project — what it gets right, where it hurts, and what we changed — is in [ANALYSIS.md](ANALYSIS.md).

![Four thumbnail concepts rendered by the studio — bold, glow, editorial and minimal](docs/previews/thumbnail-variants.png)

*Real output: four vector thumbnail concepts generated for one project, readable at 120 px and downloadable as SVG.*

---

## Why it feels different

| | |
| --- | --- |
| **A real studio, not a CLI wrapper** | Command center, pipeline board, project workspace, calendar, analytics, audience inbox, learning loop. Nine surfaces, one design system. |
| **Seven-stage pipeline** | Research → Strategy → Script → Visuals → SEO → Quality gate → Release, each stage inspectable and individually regenerable. |
| **Human approval is structural** | Nothing publishes without the quality gate passing *and* two explicit attestations (facts, media rights). |
| **Real, usable artifacts** | 1,400-word scripts with beat timing, shot lists, descriptions with chapters, tags, thumbnails rendered as actual 1280×720 SVG, and a real H.264/AAC **MP4** with per-scene narration. |
| **Built-in video studio** | Scene timeline where each clip carries its own prompt and voice take. Regenerate one clip, reorder, delete, add — then re-render without touching the rest. |
| **Honest by default** | Demo engine is labelled everywhere. Live mode falls back gracefully. Publishing is explicitly a dry run until you wire OAuth. |
| **Local-first** | One JSON file on your disk. No telemetry, no accounts, no cloud. |

## Quick start

```bash
npm install
npm run serve          # builds the UI and starts the studio on :3000
```

Open **http://localhost:3000**. The workspace seeds itself with eight projects across every state, two published videos, real analytics, comments and learning proposals, so every screen is alive on first load.

On the first run the studio also builds a demo MP4 from studio art (about two minutes), so **Production** opens with a working player and a downloadable file. No keys or accounts needed for that first cut.

Development:

```bash
npm run dev            # Vite on :5173, proxying /api to :3000
npm start              # API + built UI on :3000
npm run typecheck
npm run build
npm run smoke:ui       # headless render check of the Production tab + media settings
```

Requires Node 18.17+ (tested on Node 22). No database, no cloud, no browser automation. `sharp` and `@ffmpeg-installer/ffmpeg` ship prebuilt binaries through npm — no manual ffmpeg install on supported platforms.

## The pipeline

| Stage | What the studio produces | Where you see it |
| --- | --- | --- |
| **Research** | Opportunity brief, audience insights, ranked angles with search interest, keyword clusters, competitor patterns, source links | Research tab |
| **Strategy** | Big idea, hook angle, target emotion, differentiators, timed outline, CTA, publish slot | Strategy tab |
| **Script** | Hook, 7–10 narrated beats with word counts and b-roll direction, outro and CTA, runtime at 152 wpm | Script tab, editable inline |
| **Visuals** | Scene-by-scene shot list, palette, compositions, transitions, four thumbnail concepts | Storyboard + Thumbnails |
| **SEO** | Six scored title variants, description with chapters, 16 tags, hashtags, CTR prediction, score breakdown | SEO tab |
| **Quality gate** | Eight automated checks, blockers, two human attestations | Quality gate |
| **Release** | Publish slot, privacy, pre-flight checklist, export package | Publish tab |

The **Production** tab sits between the quality gate and release: it turns the storyboard into media (images → narration → clips → MP4) and is where you edit the cut afterwards.

Every stage is checkpointed. Regenerating a stage invalidates everything downstream instead of silently mixing artifacts.

### Quality gate

Automated checks run against the actual artifacts — not vibes:

- Research evidence attached · runtime vs promise · opening-line length · beat completeness · visual plan · title length · thumbnail palette contrast · metadata completeness · explicit fact-review flag · CTA.

Warnings are advisory; failures are blockers. Approval is impossible while a blocker exists, and the two attestations (facts reviewed, rights cleared) are required before the Approve button unlocks.

### Live or demo

- **Demo engine (default)** — a deterministic local content engine. Every screen is fully functional; narration is explicitly labelled illustrative rather than researched.
- **Live mode** — add an OpenAI, Gemini, OpenRouter, DeepSeek or Anthropic key in **Settings → AI providers**, enable it, then flip the engine switch. Research, strategy, script and SEO call the model with strict JSON prompts and schema validation. Any failure falls back to the demo engine, so the pipeline never strands.

Keys live only in `data/store.json` on your machine.

## Thumbnails without an image model

The art director emits four concepts — `bold`, `glow`, `editorial`, `minimal` — and the server renders each as a real SVG at 1280×720 with measured type layout, safe margins, palette-aware contrast and channel branding. Download the SVG or copy the concept as a prompt for your own generator.


## Video studio: a real file, not a mockup

The Production tab runs an actual media pipeline on your machine:

1. **Visuals** — every scene gets a 16:9 (or 9:16) still. Provider order: your Google AI Studio key → OpenAI → [Pollinations](https://pollinations.ai) (free, no key) → a procedural studio-art renderer. If a remote call fails, that scene falls back to studio art instead of breaking the render.
2. **Voice** — each scene's narration is synthesised with Gemini TTS (free tier), OpenAI TTS or ElevenLabs. Clips are stored per scene and timed against the beat.
3. **Clips** — ffmpeg builds one clip per scene: 1280×720 / 720×1280, 30 fps, slow Ken Burns motion, narration padded to scene length.
4. **Assembly** — clips are concatenated into `final.mp4` with an `.srt` caption sidecar and a poster frame. Download it from the Production tab, the workspace header, or the pipeline board.

### Editing the cut

- Each clip keeps **its own image prompt and narration**, independently editable.
- **Regenerate visual**, **Re-voice**, **Save clip**, **move up/down**, **delete** — all scoped to that clip.
- Add a scene anywhere in the timeline; narration length automatically wins over the planned duration.
- Overrides per project: provider, voice, aspect (16:9 / 9:16), motion on/off.
- A "re-render needed" badge appears when a clip changed after the last render.

### Free keys that make it real

| Provider | What it powers | Free tier | Where to get a key |
| --- | --- | --- | --- |
| Google AI Studio (Gemini) | Scene images + narration voice | Yes | <https://aistudio.google.com/apikey> |
| Pollinations | Scene images | Yes, no key | <https://pollinations.ai> |
| OpenAI | Images (`gpt-image-1`) + TTS | Paid | <https://platform.openai.com/api-keys> |
| ElevenLabs | Narration voice | Limited free quota | <https://elevenlabs.io/app/settings/api-keys> |

Paste keys in **Settings → Voice & visuals**, hit *Test image* / *Test voice*, then open any project → **Production**. Without a narration key the studio still renders a fully downloadable video and labels it **silent** — it never pretends audio exists.

`ffmpeg` and `sharp` ship as npm dependencies (`@ffmpeg-installer/ffmpeg`, `sharp`), so `npm install` is enough on macOS, Linux and Windows.

## Analytics and learning

- 60 days of channel history, per-video daily series, CTR, AVD, watch hours, subscribers and estimated revenue.
- Audience-retention curve mapped onto scene boundaries, with per-scene drop analysis.
- A learning loop that only proposes moves backed by your own baseline, with approve/reject gates.
- Title A/B experiments with impression splits and a 95% confidence threshold before a winner can be adopted.
- An audience inbox that triages sentiment, themes and spam, drafts replies in your voice, and posts only after your approval.

## API

All routes are local and JSON. Highlights:

```
GET    /api/dashboard            KPIs, series, pipeline, activity
GET    /api/projects             list + counts
POST   /api/projects             create (optionally auto-run the pipeline)
GET    /api/projects/:id         project, active job, comments, cost estimate
PATCH  /api/projects/:id         title, description, beats, thumbnail
POST   /api/projects/:id/run     run/resume the pipeline
POST   /api/projects/:id/stage/:stage/regenerate
POST   /api/projects/:id/approve | reject | schedule | publish-now | duplicate
GET    /api/projects/:id/export  Markdown production package
GET    /api/projects/:id/thumbnail/:tid.svg
GET    /api/media/config         resolved image/voice providers, ffmpeg status, key links
GET    /api/projects/:id/media   scene assets, render state, URLs, latest media job
POST   /api/projects/:id/media/images | voice | render
PUT    /api/projects/:id/media/settings   provider, voice, aspect, motion overrides
POST   /api/projects/:id/scenes/:sid/regenerate   { image?, voice?, prompt?, narration? }
PATCH  /api/projects/:id/scenes/:sid   prompt, narration, duration
POST   /api/projects/:id/scenes/:sid/move | DELETE | POST /api/projects/:id/scenes
GET    /api/projects/:id/video   stream (HTTP range supported)
GET    /api/projects/:id/download  attachment MP4
GET    /api/projects/:id/captions  .srt sidecar
GET    /api/analytics            series, totals, per-video metrics
GET    /api/comments?filter=     audience inbox
POST   /api/comments/:id/draft | reply | quarantine
GET    /api/recommendations      learning loop + experiments
POST   /api/autopilot/run        plan and generate N episodes
PUT    /api/settings             channel, brand, providers, automation
GET    /api/events               server-sent events for live progress
```

## Architecture

```
server/
  index.ts              Express API, 30+ routes, SSE, dry-run publish queue
  pipeline.ts           seven-stage runner, job log, stage invalidation
  content-engine.ts     deterministic research/strategy/script/SEO + quality checks
  ai.ts                 OpenAI-compatible, Gemini and Anthropic adapters
  thumbnails.ts         SVG art director (measured layout, four variants)
  media/providers.ts    Gemini / OpenAI / Pollinations image + Gemini / OpenAI / ElevenLabs voice
  media/art.ts          procedural scene art fallback (SVG → PNG via sharp)
  media/service.ts      asset generation, per-scene jobs, ffmpeg clip render, concat, captions
  media/ffmpeg.ts       bundled binary resolution, duration probing, safe process runner
  analytics-engine.ts   metrics, retention curves, recommendations, experiments
  store.ts / seed.ts    atomic JSON persistence and demo dataset
shared/types.ts         the contract between server and UI
src/
  components/           shell, command palette, charts, design-system primitives
  pages/                dashboard, pipeline, workspace (+ ProductionTab video studio),
                        analytics, audience, insights, calendar, autopilot, settings
```

## What is intentionally not faked

- **Publishing is a dry run.** The project is marked published and analytics are generated, but nothing is uploaded. The governed OAuth/upload path is the next integration (see roadmap).
- **Narration needs a key.** With a Gemini (or OpenAI/ElevenLabs) key the audio is real and mixed into the MP4. Without one, the render is silent and labelled as silent in the player, the production summary and the job log.
- **Visuals are images, not video clips.** Scenes are stills with motion applied by ffmpeg. Text-to-video providers are not wired in; the studio will not claim otherwise.
- **Demo content is not researched.** It is labelled as such on the project, in the quality gate and in the activity log.

## Roadmap

1. YouTube Data API OAuth: real upload, thumbnails, playlists, scheduling.
2. Word-level subtitle burn-in and crossfade transitions between clips.
3. Text-to-video providers (Veo, Runway) behind the same clip interface.
4. Multi-channel workspaces and a team review queue.
5. Optional Postgres adapter for multi-user deployments.

## License

MIT. Built for legitimate content creation — follow YouTube's Terms of Service and Community Guidelines.
