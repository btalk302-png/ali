# CreatorPilot — research-first YouTube pipeline

**Real title research → strategy → script → visuals → SEO → MP4 you can download.**

This is a deliberately small tool: one pipeline, no accounts, no dashboards, no fake data. It starts where every good video starts — with evidence about what is already working in your niche — and ends with a real `.mp4` on your disk.

> Built after a full teardown of [`darkzOGx/youtube-automation-agent`](https://github.com/darkzOGx/youtube-automation-agent). The analysis is in [ANALYSIS.md](ANALYSIS.md).

---

## What's inside

| Stage | What it actually does |
| --- | --- |
| **1 · Title research** | Pulls real top-performing videos from the **YouTube Data API v3** (views, channel, publish date, outliers by views/day), adds **Wikipedia** context and optional **Gemini search grounding**, measures which title patterns are winning, and writes titles grounded in that data. |
| **2 · Strategy** | Angle, big idea, hook, target emotion, differentiators and a timed outline sized to your runtime — built from the research, not from a template. |
| **3 · Script** | Spoken-word script: hook, intro, beats with narration + b-roll prompts, outro and CTA, with word count and runtime at 150 wpm. |
| **4 · Visuals** | One image prompt per beat plus four thumbnail concepts (bold / glow / editorial / minimal) rendered as real 1280×720 SVG. |
| **5 · SEO** | Six title variants with scores, description with chapters, 15 tags, hashtags and a deterministic score breakdown. |
| **6 · Quality check** | Automated checks against the actual artifacts: evidence attached, runtime drift, hook length, beat completeness, thumbnail contrast, title length, rendered MP4. |
| **7 · Production & export** | Scene images (Gemini / OpenAI / free Pollinations / offline studio art), per-scene narration (Gemini TTS, OpenAI, ElevenLabs), ffmpeg assembly into **H.264 + AAC MP4** with an `.srt` sidecar — streamed in-app and downloadable. |

After the pipeline there is a **clip timeline**: edit any scene's prompt or narration, regenerate just that take, reorder, delete, add — then re-render.

## Deliberately removed

No Google login, no email sign-up, no demo engine, no command center, no analytics dashboard, no audience studio, no learning loop, no autopilot, no simulated publishing.

There is no seeded sample data either. An empty workspace is an honest workspace — the tool only shows what it can verify.

## Setup

```bash
npm install
npm run serve      # http://localhost:3000
```

Then open **Settings** and add:

1. **AI provider** — Google Gemini is free-tier and covers research synthesis, strategy, script and SEO. (`Settings → AI providers`)
2. **YouTube Data API key** — free quota, 10,000 units/day. Create it in Google Cloud Console, enable *YouTube Data API v3*. (`Settings → Research data`)
3. Optional: **Google AI Studio key** for scene images + narration (`Settings → Voice & visuals`).

No key? The app says so plainly and every button explains what is missing. It never invents content.

`ffmpeg` and `sharp` ship as npm dependencies, so MP4 export works without a system install.

## When the server has no internet (preview sandboxes)

Hosted preview sandboxes usually block outbound traffic, so the server cannot call Gemini/OpenAI even with a valid key. Instead of failing, the app hands the exact request to your browser:

1. The stage stops with **“This server has no route to Google Gemini”** and a `relayKey` is attached to that stage.
2. Click **Fetch with my browser** — the browser sends that request using your stored key, then posts the provider's JSON back.
3. The answer is cached (by prompt hash, or by URL for plain GETs) so the stage resumes without touching the network again.
4. One click chains every request a stage needs: YouTube search → video statistics → Wikipedia → the model call. Research on a blocked server took 10 relayed requests in testing, finishing at 7/7 stages with real view counts and cited sources.

Relayed GETs cover the research data sources — `googleapis.com/youtube/v3/search`, `/videos` and Wikipedia — so title research works even when the server cannot reach YouTube.

Gemini's native endpoint allows this (CORS permits `content-type` + `x-goog-api-key`). Some providers, notably OpenAI, reject browser calls — switch the active provider if the relay reports a CORS block. For real work, running the app locally is still the better path.

## Verify your keys

```bash
npm run check:keys
```

Calls every saved provider once and prints latency plus the exact error — so a bad key, a wrong model id or a blocked network is obvious before you start a project. A sandbox/preview server without outbound internet will report `ECONNRESET` for every host; run it locally in that case.

## The flow

```
New video (topic)
   └─ Title research ──► pick a title ──► Strategy ──► Script ──► Visuals ──► SEO ──► Quality ──► Production (MP4)
```

Or start in **Title research**: research any keyword first, compare the real ranking videos and title patterns, then create the project from the title you picked — the research is carried over, no second API run.

## API

```
GET    /api/bootstrap                  channel, setup status, counts
GET    /api/projects                   pipeline list + stage states
POST   /api/projects                   { topic, title?, research?, format, durationMin }
GET    /api/projects/:id               project, active job, stage labels
PATCH  /api/projects/:id               title, selected title, beats, description
POST   /api/projects/:id/run           run/resume the pipeline
POST   /api/projects/:id/stage/:stage/regenerate
POST   /api/research                   { keyword } → real research payload
GET    /api/projects/:id/export        Markdown production package
GET    /api/projects/:id/thumbnail/:id.svg

GET    /api/projects/:id/media         scene assets, render state, job
POST   /api/projects/:id/media/images | voice | render
POST   /api/projects/:id/scenes/:sid/regenerate
PATCH  /api/projects/:id/scenes/:sid
POST   /api/projects/:id/scenes/:sid/move
GET    /api/projects/:id/video         stream (HTTP range)
GET    /api/projects/:id/download      MP4 attachment
GET    /api/projects/:id/captions      .srt

GET/PUT /api/settings                  keys, channel, research, media
GET    /api/events                     server-sent events
```

## Architecture

```
server/
  index.ts          Express API, SSE, static UI
  research.ts       YouTube Data API + Wikipedia + Gemini grounding + title patterns
  stages.ts         strategy / script / visuals / SEO prompts + validation
  quality.ts        deterministic artifact checks
  pipeline.ts       stage runner, checkpoints, export package
  ai.ts             OpenAI-compatible, Gemini, Anthropic adapters
  media/            providers, procedural art, ffmpeg render, captions
shared/types.ts     the contract between server and UI
src/
  pages/            Pipeline, TitleResearch, Workspace, Settings
  components/       shell, design system, new-video modal
```

## What is not faked

- **No generated research.** If YouTube data is unavailable, the Research tab says so; it does not fill the gap with invented numbers.
- **No demo content engine.** Without a provider key, stages fail with a specific message instead of producing placeholder copy.
- **Narration requires a TTS key.** Without one, the MP4 renders silent and is labelled silent in the player, the summary and the log.
- **Publishing is out of scope.** Export the MP4 and the package; the tool does not pretend to upload.
- **No login, no analytics, no telemetry.** Projects live in `data/store.json`, media in `data/media/`.

## Verification

- `npm run typecheck`, `npm run build`, `npm run smoke:ui` (25 headless render checks across Production, Settings, Title research and Workspace)
- Full pipeline exercised end-to-end against a local mock model: research → strategy → script → visuals → SEO → quality → images → MP4 → download (`200`, H.264/AAC, range streaming)
- Error paths: no key, research without YouTube key, provider failure

## License

MIT.
