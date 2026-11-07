import type { Settings } from '../../shared/types.js';

export type ImageProviderId = 'gemini' | 'openai' | 'pollinations' | 'local';
export type TtsProviderId = 'gemini' | 'elevenlabs' | 'openai';

export const GEMINI_VOICES = [
  'Kore',
  'Puck',
  'Charon',
  'Fenrir',
  'Aoede',
  'Leda',
  'Orus',
  'Zephyr',
  'Callirrhoe',
  'Autonoe',
] as const;

export function geminiKey(settings: Settings): string {
  return (
    settings.media?.geminiApiKey?.trim() ||
    settings.providers.find((p) => p.id === 'gemini')?.apiKey?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    ''
  );
}

export function openaiKey(settings: Settings): string {
  return (
    settings.media?.openaiApiKey?.trim() ||
    settings.providers.find((p) => p.id === 'openai')?.apiKey?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    ''
  );
}

export function elevenLabsKey(settings: Settings): string {
  return settings.media?.elevenLabsApiKey?.trim() || process.env.ELEVENLABS_API_KEY?.trim() || '';
}

export function resolveImageProvider(settings: Settings, override?: string): ImageProviderId {
  const requested = override && override !== 'auto' ? override : settings.media?.imageProvider ?? 'auto';
  if (requested === 'local') return 'local';
  if (requested === 'gemini') return geminiKey(settings) ? 'gemini' : 'local';
  if (requested === 'openai') return openaiKey(settings) ? 'openai' : 'local';
  if (requested === 'pollinations') return 'pollinations';
  if (geminiKey(settings)) return 'gemini';
  if (openaiKey(settings)) return 'openai';
  // free, no-key option, with local procedural art as the offline fallback
  return 'pollinations';
}

export function resolveTtsProvider(settings: Settings, override?: string): TtsProviderId | null {
  const requested = override && override !== 'auto' ? override : settings.media?.ttsProvider ?? 'auto';
  if (requested === 'none') return null;
  if (requested === 'gemini') return geminiKey(settings) ? 'gemini' : null;
  if (requested === 'openai') return openaiKey(settings) ? 'openai' : null;
  if (requested === 'elevenlabs') return elevenLabsKey(settings) ? 'elevenlabs' : null;
  if (geminiKey(settings)) return 'gemini';
  if (openaiKey(settings)) return 'openai';
  if (elevenLabsKey(settings)) return 'elevenlabs';
  return null;
}

export function mediaReadiness(settings: Settings) {
  return {
    image: {
      resolved: resolveImageProvider(settings),
      gemini: Boolean(geminiKey(settings)),
      openai: Boolean(openaiKey(settings)),
      pollinations: true,
    },
    tts: {
      resolved: resolveTtsProvider(settings),
      gemini: Boolean(geminiKey(settings)),
      openai: Boolean(openaiKey(settings)),
      elevenlabs: Boolean(elevenLabsKey(settings)),
    },
    voices: GEMINI_VOICES,
  };
}

const timeout = (ms: number) => AbortSignal.timeout(ms);

async function postJson(url: string, body: unknown, headers: Record<string, string>, ms = 120_000) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: timeout(ms),
    });
  } catch (err) {
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      /* keep raw */
    }
    const code = (err as { cause?: { code?: string } })?.cause?.code ?? (err instanceof Error ? err.message : 'network error');
    throw new Error(`Could not reach ${host} from this server — ${code}. The renderer falls back to studio art when this happens.`);
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 400);
    throw new Error(`${res.status} ${text}`);
  }
  return res;
}

/* ------------------------------------------------------------------ images */

export async function generateImage(
  settings: Settings,
  prompt: string,
  opts: { provider: ImageProviderId; aspect: '16:9' | '9:16'; seed?: number },
): Promise<{ buffer: Buffer; provider: ImageProviderId }> {
  const clean = `${prompt}. Cinematic still, no on-screen text, no watermark, no logos, high detail, filmic lighting.`;

  if (opts.provider === 'gemini') {
    const key = geminiKey(settings);
    if (!key) throw new Error('No Google AI Studio key configured for images');
    const model = settings.media.geminiImageModel || 'gemini-2.5-flash-image';
    const res = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        contents: [{ role: 'user', parts: [{ text: clean }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      },
      { 'x-goog-api-key': key },
      180_000,
    );
    const data = (await res.json()) as { candidates?: { content?: { parts?: any[] } }[] };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData ?? part.inline_data;
      if (inline?.data) return { buffer: Buffer.from(inline.data, 'base64'), provider: 'gemini' };
    }
    throw new Error('Gemini returned no image data (check the model name and billing)');
  }

  if (opts.provider === 'openai') {
    const key = openaiKey(settings);
    if (!key) throw new Error('No OpenAI key configured for images');
    const res = await postJson(
      'https://api.openai.com/v1/images/generations',
      {
        model: settings.media.openaiImageModel || 'gpt-image-1',
        prompt: clean,
        size: opts.aspect === '9:16' ? '1024x1536' : '1536x1024',
        n: 1,
      },
      { authorization: `Bearer ${key}` },
      180_000,
    );
    const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const item = data.data?.[0];
    if (item?.b64_json) return { buffer: Buffer.from(item.b64_json, 'base64'), provider: 'openai' };
    if (item?.url) {
      const img = await fetch(item.url, { signal: timeout(60_000) });
      if (!img.ok) throw new Error('Could not download the generated image');
      return { buffer: Buffer.from(await img.arrayBuffer()), provider: 'openai' };
    }
    throw new Error('OpenAI returned no image data');
  }

  if (opts.provider === 'pollinations') {
    // Free, no-key image endpoint. Falls back to local art in the caller if unreachable.
    const width = opts.aspect === '16:9' ? 1280 : 720;
    const height = opts.aspect === '16:9' ? 720 : 1280;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(clean)}?width=${width}&height=${height}&nologo=true&seed=${opts.seed ?? 1}`;
    const res = await fetch(url, { signal: timeout(90_000) });
    if (!res.ok) throw new Error(`Pollinations ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) throw new Error(`Pollinations returned ${type || 'no content'}`);
    return { buffer: Buffer.from(await res.arrayBuffer()), provider: 'pollinations' };
  }

  throw new Error('Local art is rendered by the studio renderer, not this adapter');
}

/* ------------------------------------------------------------------ speech */

function pcmToWav(pcm: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function generateSpeech(
  settings: Settings,
  text: string,
  opts: { provider: TtsProviderId; voice?: string },
): Promise<{ buffer: Buffer; ext: 'mp3' | 'wav'; provider: TtsProviderId; voice: string }> {
  if (opts.provider === 'gemini') {
    const key = geminiKey(settings);
    if (!key) throw new Error('No Google AI Studio key configured for narration');
    const model = settings.media.geminiTtsModel || 'gemini-2.5-flash-preview-tts';
    const voice = opts.voice || settings.media.geminiVoice || 'Kore';
    const res = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      },
      { 'x-goog-api-key': key },
      180_000,
    );
    const data = (await res.json()) as { candidates?: { content?: { parts?: any[] } }[] };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData ?? part.inline_data;
      if (!inline?.data) continue;
      const buf = Buffer.from(inline.data, 'base64');
      const mime = String(inline.mimeType ?? inline.mime_type ?? '');
      if (/mp3|mpeg/.test(mime)) return { buffer: buf, ext: 'mp3', provider: 'gemini', voice };
      const rate = Number(mime.match(/rate=(\d+)/)?.[1] ?? 24000);
      return { buffer: pcmToWav(buf, rate, 1, 16), ext: 'wav', provider: 'gemini', voice };
    }
    throw new Error('Gemini returned no audio data');
  }

  if (opts.provider === 'openai') {
    const key = openaiKey(settings);
    if (!key) throw new Error('No OpenAI key configured for narration');
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: settings.media.openaiTtsModel || 'gpt-4o-mini-tts',
        voice: opts.voice || settings.media.openaiVoice || 'alloy',
        input: text,
        response_format: 'mp3',
      }),
      signal: timeout(180_000),
    });
    if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return { buffer: Buffer.from(await res.arrayBuffer()), ext: 'mp3', provider: 'openai', voice: opts.voice || settings.media.openaiVoice || 'alloy' };
  }

  if (opts.provider === 'elevenlabs') {
    const key = elevenLabsKey(settings);
    if (!key) throw new Error('No ElevenLabs key configured for narration');
    const voiceId = settings.media.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM';
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'xi-api-key': key },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
      }),
      signal: timeout(180_000),
    });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return { buffer: Buffer.from(await res.arrayBuffer()), ext: 'mp3', provider: 'elevenlabs', voice: voiceId };
  }

  throw new Error('Unknown narration provider');
}

/** Cheap connectivity probe used by the settings screen. */
export async function testMediaProvider(settings: Settings, kind: 'image' | 'tts', provider: string) {
  const started = Date.now();
  try {
    if (kind === 'image' && provider === 'gemini') {
      await generateImage(settings, 'a single soft studio light on a dark background', { provider: 'gemini', aspect: '16:9' });
    } else if (kind === 'image' && provider === 'openai') {
      await generateImage(settings, 'a single soft studio light on a dark background', { provider: 'openai', aspect: '16:9' });
    } else if (kind === 'image') {
      await generateImage(settings, 'a calm cinematic gradient', { provider: 'pollinations', aspect: '16:9' });
    } else {
      await generateSpeech(settings, 'This is a short narration test from CreatorPilot studio.', {
        provider: provider as TtsProviderId,
      });
    }
    return { ok: true, message: `${kind === 'image' ? 'Image' : 'Voice'} provider responded`, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Provider test failed', latencyMs: Date.now() - started };
  }
}
