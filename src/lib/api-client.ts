'use client';

import { Auth } from 'firebase/auth';

// 1. Force the URL to the default if process.env fails in the static build
const DEFAULT_BASE_URL = 'https://asia-southeast1-unified-booker.cloudfunctions.net/api';

const getBaseUrl = () => {
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  return DEFAULT_BASE_URL;
};

const API_BASE_URL = getBaseUrl();
const REQUEST_TIMEOUT_MS = 15_000; // Increased slightly for desktop latency
const GET_CACHE_TTL_MS = 45_000;
const TOKEN_CACHE_TTL_MS = 55_000;

// ... (keep your getCache, inflightRequests, tokenCache, and getRequestKey functions exactly as they are)

async function getAuthToken(auth?: Auth) {
  const user = auth?.currentUser;
  if (!user) return null;

  const cacheKey = user.uid;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  try {
    // 2. Added forceRefresh to ensure desktop sessions don't get "stuck"
    const token = await user.getIdToken(true); 
    tokenCache.set(cacheKey, { token, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
    return token;
  } catch (e) {
    console.error('Auth token refresh failed:', e);
    return null;
  }
}

async function fetchFromApi<T>(path: string, options: RequestInit = {}, auth?: Auth): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const requestKey = getRequestKey(path, options);

  // 3. Robust URL handling
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const requestPromise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const token = await getAuthToken(auth);
      const headers = new Headers(options.headers || {});
      headers.set('Content-Type', 'application/json');
      if (token) headers.set('Authorization', `Bearer ${token}`);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        // 4. Improved error handling to stop the app from crashing on bad responses
        const errorText = await response.text().catch(() => 'Unknown Error');
        console.error(`API Error [${response.status}]:`, errorText);
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      if (response.status === 204) return null as unknown as T;
      return (await response.json()) as T;
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new Error('Request timed out. Check your internet connection.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  })();

  return requestPromise as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, auth?: Auth) => fetchFromApi<T>(path, { method: 'GET' }, auth),
  post: <T>(path: string, data: unknown, auth?: Auth) => fetchFromApi<T>(path, { method: 'POST', body: JSON.stringify(data) }, auth),
  put: <T>(path: string, data: unknown, auth?: Auth) => fetchFromApi<T>(path, { method: 'PUT', body: JSON.stringify(data) }, auth),
  delete: <T>(path: string, auth?: Auth) => fetchFromApi<T>(path, { method: 'DELETE' }, auth),
  invalidateAll: () => clearGetCache(),
};