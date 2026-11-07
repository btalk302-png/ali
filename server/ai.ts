import type { ProviderConfig, Settings } from '../shared/types.js';

const ENV_KEYS: Record<string, string | undefined> = {
  gemini: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY,
  deepseek: process.env.DEEPSEEK_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
};

export function resolveKey(provider: ProviderConfig): string {
  return provider.apiKey.trim() || (ENV_KEYS[provider.id] ?? '').trim();
}

export function activeProvider(settings: Settings): ProviderConfig | undefined {
  const provider = settings.providers.find((p) => p.enabled && resolveKey(p).length > 8 && p.kind === 'text');
  return provider ? { ...provider, apiKey: resolveKey(provider) } : undefined;
}

export function requireProvider(settings: Settings): ProviderConfig {
  const provider = activeProvider(settings);
  if (!provider) {
    throw new Error('No AI key configured. Add a Gemini, OpenAI or other provider key in Settings → AI providers, then run the stage again.');
  }
  return provider;
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
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    // Some OpenAI-compatible servers reject response_format; retry once without it.
    if (opts.json && res.status === 400 && /response_format|json_object/i.test(detail)) {
      return openaiCompatible(provider, { ...opts, json: false }, signal);
    }
    throw new Error(`${provider.label} ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const choice = data.choices?.[0];
  const text = choice?.message?.content;
  if (choice?.finish_reason === 'length') {
    throw new Error(`${provider.label} ran out of output tokens (max_tokens). Run the stage again or raise the model's output limit.`);
  }
  if (!text) throw new Error(`${provider.label} returned an empty completion`);
  return text;
}

const isFlash = (model: string) => /flash/i.test(model);

async function gemini(provider: ProviderConfig, opts: CompleteOpts, signal: AbortSignal): Promise<string> {
  // Flash models spend the output budget on "thinking" and return cut-off JSON;
  // Pro models cannot switch thinking off, so they keep their (larger) default.
  return geminiCall(provider, opts, signal, isFlash(provider.model) ? 0 : undefined);
}

async function geminiCall(
  provider: ProviderConfig,
  opts: CompleteOpts,
  signal: AbortSignal,
  thinkingBudget?: number,
): Promise<string> {
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
        maxOutputTokens: Math.max(opts.maxTokens ?? 4096, 2048),
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        // 2.5 Flash spends output budget on "thinking" and then returns cut-off JSON.
        ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    candidates?: {
      content?: { parts?: { text?: string; thought?: boolean }[] };
      finishReason?: string;
    }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked this request (${data.promptFeedback.blockReason}). Try a different topic or reword the title.`);
  }
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('');
  if (!text) {
    if (candidate?.finishReason === 'MAX_TOKENS' && thinkingBudget === undefined) {
      // Retry with the smallest thinking budget the model allows.
      return geminiCall(provider, opts, signal, isFlash(provider.model) ? 0 : 128);
    }
    throw new Error(
      candidate?.finishReason
        ? `Gemini stopped before writing an answer (${candidate.finishReason}). Try again, or pick a bigger model.`
        : 'Gemini returned an empty completion. Try again.',
    );
  }
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini ran out of output tokens and the answer was cut off. Run the stage again, or switch to a model with a larger output limit.');
  }
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
  const cleaned = text
    .replace(/^\uFEFF/, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const candidates: string[] = [cleaned];
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  for (const candidate of candidates) {
    for (const attempt of [candidate, candidate.replace(/,(\s*[}\]])/g, '$1')]) {
      try {
        return JSON.parse(attempt) as T;
      } catch {
        /* try the next shape */
      }
    }
  }
  const snippet = cleaned.slice(0, 160).replace(/\s+/g, ' ');
  throw new Error(`The model did not return usable JSON${snippet ? ` (it started with: "${snippet}…")` : ''}. Run the stage again.`);
}

/**
 * JSON-only completion: one corrective retry when the model answers with prose,
 * a truncated object or a fenced block that still will not parse.
 */
export async function aiJson<T>(settings: Settings, opts: CompleteOpts): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? opts.prompt
        : `${opts.prompt}\n\nYour previous answer could not be parsed as JSON. Reply with ONE valid JSON object and nothing else — no prose, no markdown fences.`;
    try {
      const text = await aiComplete(settings, { ...opts, prompt });
      return parseJson<T>(text);
    } catch (err) {
      lastError = err;
      // Transport/auth/quota errors will not fix themselves on a retry.
      if (err instanceof Error && !/JSON|parse|cut off|tokens/i.test(err.message)) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The model did not return usable JSON');
}

export async function testProvider(provider: ProviderConfig): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const started = Date.now();
  const settings = {
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
