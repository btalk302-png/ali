/**
 * Browser relay: the app usually runs where it can reach the model provider.
 * Inside a sandbox/preview the server has no outbound internet, but the user's
 * browser does. When a direct call fails at the socket level we hand the exact
 * request to the UI, the browser performs it, and posts the provider's JSON
 * back. The completion is cached under the same request hash so re-running the
 * stage uses it without touching the network again.
 */
import { createHash } from 'node:crypto';

export interface RelayRequest {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body: string;
}

/** A stage needs the browser to make one HTTP call on its behalf. */
export class RelayNeeded extends Error {
  constructor(
    readonly key: string,
    readonly providerLabel: string,
    readonly request: RelayRequest,
    readonly reason: string,
  ) {
    super(`This server has no route to ${providerLabel}. Use “Fetch with my browser” to finish the stage.`);
  }
}

export interface RelaySpec {
  key: string;
  /** 'ai' → provider completion (posted as provider JSON); 'http' → plain JSON GET */
  kind: 'ai' | 'http';
  providerId: string;
  providerLabel: string;
  request: RelayRequest;
  reason: string;
  createdAt: string;
}

const specs = new Map<string, RelaySpec>();
const completions = new Map<string, string>();
const httpResponses = new Map<string, unknown>();
const TTL_MS = 30 * 60 * 1000;

export function relayKey(parts: unknown[]): string {
  return createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

export function registerSpec(spec: RelaySpec): void {
  specs.set(spec.key, spec);
  prune();
}

export function getSpec(key: string): RelaySpec | undefined {
  const spec = specs.get(key);
  if (!spec) return undefined;
  if (Date.now() - new Date(spec.createdAt).getTime() > TTL_MS) {
    specs.delete(key);
    return undefined;
  }
  return spec;
}

export function rememberCompletion(key: string, text: string): void {
  completions.set(key, text);
}

export function cachedCompletion(key: string): string | undefined {
  return completions.get(key);
}

export function clearRelay(key: string): void {
  specs.delete(key);
}

/** Cached JSON body for a relayed GET, keyed by the URL that was fetched. */
export function rememberHttp(url: string, data: unknown): void {
  httpResponses.set(url, data);
  if (httpResponses.size > 60) {
    const first = httpResponses.keys().next();
    if (!first.done) httpResponses.delete(first.value);
  }
}

export function cachedHttp(url: string): unknown {
  return httpResponses.get(url);
}

function prune() {
  const now = Date.now();
  for (const [key, spec] of specs) {
    if (now - new Date(spec.createdAt).getTime() > TTL_MS) specs.delete(key);
  }
  if (completions.size > 120) {
    // keep memory bounded; completions are only useful for an immediate retry
    const excess = completions.size - 120;
    let i = 0;
    for (const key of completions.keys()) {
      if (i++ >= excess) break;
      completions.delete(key);
    }
  }
}
