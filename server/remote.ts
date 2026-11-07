import { cachedHttp, registerSpec, relayKey, RelayNeeded, rememberHttp } from './relay.js';

/**
 * JSON GET that survives a server with no outbound internet: the first attempt
 * is a normal fetch, and a socket failure becomes a RelayNeeded with the exact
 * URL so the browser can fetch it and post the body back.
 */
export async function getJson<T>(url: string, opts: { label?: string; timeoutMs?: number } = {}): Promise<T> {
  const cached = cachedHttp(url);
  if (cached !== undefined) return cached as T;

  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep raw */
  }
  const label = opts.label ?? host;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000) });
  } catch (err) {
    const code = (err as { cause?: { code?: string } })?.cause?.code ?? (err instanceof Error ? err.message : 'network error');
    const key = relayKey(['http', url]);
    const request = { url, method: 'GET' as const, headers: {}, body: '' };
    registerSpec({
      key,
      kind: 'http',
      providerId: 'http',
      providerLabel: label,
      request,
      reason: `${label} is unreachable from this server (${code})`,
      createdAt: new Date().toISOString(),
    });
    throw new RelayNeeded(key, label, request, `${label} is unreachable from this server (${code})`);
  }

  if (!res.ok) {
    throw new Error(`${label} answered ${res.status}: ${(await res.text()).slice(0, 240)}`);
  }
  const data = (await res.json()) as T;
  rememberHttp(url, data);
  return data;
}
