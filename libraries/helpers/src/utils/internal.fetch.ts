// Server-side only: how Next.js pages reach the backend on the same machine
// (BACKEND_INTERNAL_URL), never through the public internet
export const internalFetch = (url: string, options: RequestInit = {}) => {
  return fetch(`${process.env.BACKEND_INTERNAL_URL}${url}`, {
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  });
};
