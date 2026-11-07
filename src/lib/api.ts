export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text };
  }
  if (!res.ok) {
    const message = (body as { error?: string })?.error ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const patch = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });
