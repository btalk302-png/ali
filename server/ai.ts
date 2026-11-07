import type { ProviderConfig, Settings } from '../shared/types.js';

export function activeProvider(settings: Settings): ProviderConfig | undefined {
  if (settings.demoMode) return undefined;
  return settings.providers.find((p) => p.enabled && p.apiKey.trim().length > 8 && p.kind === 'text');
}

export function isLive(settings: Settings): boolean {
  return Boolean(activeProvider(settings));
}

interface CompleteOpts {
  system: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** Calls the configured text provider. Throws on any transport or shape error. */
export async function aiComplete(settings: Settings, opts: CompleteOpts): Promise<string> {
  const provider = activeProvider(settings);
  if (!provider) throw new Error('No live provider configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    if (provider.id === 'gemini') return await gemini(provider, opts, controller.signal);
    if (provider.id === 'anthropic') return await anthropic(provider, opts, controller.signal);
    return await openaiCompatible(provider, opts, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function openaiCompatible(provider: ProviderConfig, opts: CompleteOpts, signal: AbortSignal): Promise<string> {
  const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${provider.apiKey}`,
      ...(provider.id === 'openrouter' ? { 'http-referer': 'http://localhost:3000', 'x-title': 'CreatorPilot Studio' } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.7,
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${provider.label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${provider.label} returned an empty completion`);
  return text;
}

async function gemini(provider: ProviderConfig, opts: CompleteOpts, signal: AbortSignal): Promise<string> {
  const url = `${provider.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: opts.maxTokens ?? 4096,
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new Error('Gemini returned an empty completion');
  return text;
}

async function anthropic(provider: ProviderConfig, opts: CompleteOpts, signal: AbortSignal): Promise<string> {
  const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/messages`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: [{ role: 'user', content: opts.prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { content?: { text?: string }[] };
  const text = data.content?.map((c) => c.text ?? '').join('');
  if (!text) throw new Error('Anthropic returned an empty completion');
  return text;
}

/** Best-effort JSON extraction from a model response. */
export function parseJson<T = Record<string, unknown>>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error('Model response was not valid JSON');
  }
}

export async function testProvider(provider: ProviderConfig): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const started = Date.now();
  const settings = {
    demoMode: false,
    providers: [{ ...provider, enabled: true }],
  } as unknown as Settings;
  try {
    const text = await aiComplete(settings, {
      system: 'You are a connectivity probe. Reply with exactly: ok',
      prompt: 'Reply with exactly: ok',
      maxTokens: 12,
    });
    return { ok: true, message: `Reached ${provider.label} (${provider.model}) — "${text.trim().slice(0, 40)}"`, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown provider error', latencyMs: Date.now() - started };
  }
}
