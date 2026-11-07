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
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}

export interface RelaySpec {
  key: string;
  providerId: string;
  providerLabel: string;
  request: RelayRequest;
  reason: string;
  createdAt: string;
}

const specs = new Map<string, RelaySpec>();
const completions = new Map<string, string>();
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
