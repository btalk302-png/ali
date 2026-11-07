import type { ProviderConfig, Settings } from '../shared/types.js';
import { cachedCompletion, registerSpec, rememberCompletion, relayKey, RelayNeeded, type RelayRequest } from './relay.js';
export { RelayNeeded };

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

/** Socket-level failure: no route from this machine to the provider. */
export class ProviderUnreachable extends Error {
  constructor(
    readonly label: string,
    readonly host: string,
    readonly code: string,
  ) {
    super(`Could not reach ${label} (${host}) from this server — ${code}.`);
  }
}

interface CompleteOpts {
  system: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
}

const isFlash = (model: string) => /flash/i.test(model);
const trimBase = (url: string) => url.replace(/\/$/, '');

/** The exact HTTP request for a provider. Used both server-side and by the browser relay. */
function buildRequest(provider: ProviderConfig, opts: CompleteOpts, relay: boolean): RelayRequest {
  const maxTokens = Math.max(opts.maxTokens ?? 4096, 2048);
  if (provider.id === 'gemini') {
    // Native endpoint + header auth: CORS-safe from a browser (no API key in the URL).
    const thinkingBudget = isFlash(provider.model) ? 0 : relay ? 128 : undefined;
    return {
      url: `${trimBase(provider.baseUrl)}/models/${encodeURIComponent(provider.model)}:generateContent`,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': provider.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: maxTokens,
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
          ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {}),
        },
      }),
    };
  }

  if (provider.id === 'anthropic') {
    return {
      url: `${trimBase(provider.baseUrl)}/messages`,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: provider.model, max_tokens: maxTokens, system: opts.system, messages: [{ role: 'user', content: opts.prompt }] }),
    };
  }

  return {
    url: `${trimBase(provider.baseUrl)}/chat/completions`,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${provider.apiKey}`,
      ...(provider.id === 'openrouter' ? { 'http-referer': 'http://localhost:3000', 'x-title': 'CreatorPilot Studio' } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.7,
      max_tokens: maxTokens,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
    }),
  };
}

/** Pulls the assistant text out of a provider response body. */
export function extractCompletion(providerId: string, data: unknown): string {
  const body = data as Record<string, any>;
  if (body?.error) {
    const message = typeof body.error === 'string' ? body.error : body.error?.message ?? JSON.stringify(body.error);
    throw new Error(`Provider error: ${String(message).slice(0, 300)}`);
  }

  if (providerId === 'gemini') {
    if (body?.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked this request (${body.promptFeedback.blockReason}). Try a different topic or reword the title.`);
    }
    const candidate = body?.candidates?.[0];
    const text = candidate?.content?.parts?.filter((p: any) => !p.thought).map((p: any) => p.text ?? '').join('') ?? '';
    if (!text) {
      throw new Error(
        candidate?.finishReason === 'MAX_TOKENS'
          ? 'Gemini ran out of output tokens before writing an answer. Try again, or pick a model with a larger output limit.'
          : candidate?.finishReason
            ? `Gemini stopped before writing an answer (${candidate.finishReason}).`
            : 'Gemini returned an empty completion. Try again.',
      );
    }
    return text;
  }

  if (providerId === 'anthropic') {
    const text = (body?.content ?? []).map((c: any) => c?.text ?? '').join('');
    if (!text) throw new Error('Anthropic returned an empty completion. Try again.');
    return text;
  }

  const choice = body?.choices?.[0];
  const text = choice?.message?.content;
  if (choice?.finish_reason === 'length') {
    throw new Error('The model ran out of output tokens (max_tokens). Run the stage again, or raise the output limit.');
  }
  if (!text) throw new Error('The model returned an empty completion. Try again.');
  return text;
}

/** Direct server-side call. Throws ProviderUnreachable when there is no route. */
async function send(provider: ProviderConfig, opts: CompleteOpts): Promise<string> {
  const request = buildRequest(provider, opts, false);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    let res: Response;
    try {
      res = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body, signal: opts.signal ?? controller.signal });
    } catch (err) {
      let host = request.url;
      try {
        host = new URL(request.url).host;
      } catch {
        /* keep raw */
      }
      const code = (err as { cause?: { code?: string } })?.cause?.code ?? (err instanceof Error ? err.message : 'network error');
      throw new ProviderUnreachable(provider.label, host, code);
    }

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      // Some OpenAI-compatible servers reject response_format; retry once without it.
      if (opts.json && res.status === 400 && /response_format|json_object/i.test(detail)) {
        return send(provider, { ...opts, json: false });
      }
      throw new Error(`${provider.label} ${res.status}: ${detail}`);
    }
    const data = await res.json();
    try {
      return extractCompletion(provider.id, data);
    } catch (err) {
      // Gemini Pro: thinking consumed the whole budget. Retry once with the minimum.
      if (provider.id === 'gemini' && !isFlash(provider.model) && err instanceof Error && /MAX_TOKENS|empty completion/.test(err.message)) {
        const retry = buildRequest(provider, opts, true);
        const retryRes = await fetch(retry.url, { method: 'POST', headers: retry.headers, body: retry.body, signal: controller.signal });
        if (!retryRes.ok) throw new Error(`Gemini ${retryRes.status}: ${(await retryRes.text()).slice(0, 300)}`);
        return extractCompletion(provider.id, await retryRes.json());
      }
      throw err;
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** Calls the configured text provider, using a browser-relayed completion when one was supplied. */
export async function aiComplete(settings: Settings, opts: CompleteOpts): Promise<string> {
  const provider = activeProvider(settings);
  if (!provider) throw new Error('No live provider configured');

  const key = relayKey([provider.id, provider.model, provider.baseUrl, opts.system, opts.prompt, Boolean(opts.json), opts.maxTokens ?? 4096]);
  const cached = cachedCompletion(key);
  if (cached) return cached;

  try {
    return await send(provider, opts);
  } catch (err) {
    if (err instanceof ProviderUnreachable) {
      const request = buildRequest(provider, opts, true);
      registerSpec({ key, kind: 'ai', providerId: provider.id, providerLabel: provider.label, request, reason: err.message, createdAt: new Date().toISOString() });
      throw new RelayNeeded(key, provider.label, request, err.message);
    }
    throw err;
  }
}

/** Stores the browser's provider response under the request hash the stage will reuse. */
export function submitRelay(providerId: string, key: string, response: unknown): string {
  const text = extractCompletion(providerId, response);
  rememberCompletion(key, text);
  return text;
}

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
      if (err instanceof RelayNeeded) throw err;
      // Transport/auth/quota errors will not fix themselves on a retry.
      if (err instanceof Error && !/JSON|parse|cut off|tokens/i.test(err.message)) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The model did not return usable JSON');
}

export async function testProvider(provider: ProviderConfig): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const started = Date.now();
  const settings = { providers: [{ ...provider, enabled: true }] } as unknown as Settings;
  try {
    const text = await aiComplete(settings, {
      system: 'You are a connectivity probe. Reply with exactly: ok',
      prompt: 'Reply with exactly: ok',
      maxTokens: 12,
    });
    return { ok: true, message: `Reached ${provider.label} (${provider.model}) — "${text.trim().slice(0, 40)}"`, latencyMs: Date.now() - started };
  } catch (err) {
    const message = err instanceof RelayNeeded ? err.reason : err instanceof Error ? err.message : 'Unknown provider error';
    return { ok: false, message, latencyMs: Date.now() - started };
  }
}
