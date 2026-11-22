// Client side: the backend is at /api on the same origin (nginx in
// production, the Next rewrite in dev), so the session cookie just goes along
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const messageOf = (body: any, fallback: string) => {
  const message = body?.message ?? body?.msg;
  if (Array.isArray(message)) return message.join('. ');
  return typeof message === 'string' && message ? message : fallback;
};

export async function apiFetch<T = any>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // not JSON
  }
  if (!res.ok) {
    if (res.status === 429) {
      throw new ApiError(429, 'Too many attempts, try again in a few minutes');
    }
    throw new ApiError(res.status, messageOf(body, `Something went wrong (${res.status})`));
  }
  return body as T;
}

export const swrFetcher = (path: string) => apiFetch(path);

// Only same-site paths, so ?next= can't send someone to another site. The URL
// parser decides, not a prefix check: browsers drop tabs and newlines while
// parsing, so "/\t/evil.com" would otherwise end up as "//evil.com"
const NEXT_BASE = 'https://next.invalid';
export const safeNext = (next?: string | null) => {
  if (!next?.startsWith('/')) {
    return '/dashboard';
  }
  try {
    const url = new URL(next, NEXT_BASE);
    return url.origin === NEXT_BASE ? url.pathname + url.search + url.hash : '/dashboard';
  } catch {
    return '/dashboard';
  }
};
