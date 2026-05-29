const rawApiOrigin = import.meta.env.VITE_API_ORIGIN?.trim();

function isLocalHost(hostname: string) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

function getDefaultApiOrigin() {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:3001';
  }

  if (isLocalHost(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }

  return window.location.origin;
}

function resolveApiOrigin() {
  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:3001';
  }

  // Deployed apps should always use same-origin so Vercel rewrites /api/* to Render.
  if (!isLocalHost(window.location.hostname)) {
    return window.location.origin;
  }

  // Local development can use VITE_API_ORIGIN when provided; otherwise fall back to port 3001.
  return rawApiOrigin || getDefaultApiOrigin();
}

export const API_ORIGIN = resolveApiOrigin().replace(/\/+$/, '');
export const API_BASE_URL = `${API_ORIGIN}/api`;

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function apiFetch(path: string, token: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? undefined);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(apiUrl(path), {
    ...init,
    headers,
  });
}

export async function handleApiResponse<T>(response: Response, logout?: () => void): Promise<T> {
  if (response.status === 401 || response.status === 403) {
    logout?.();
    const errorText = await response.text();
    throw new Error(errorText || 'Session expired. Please sign in again.');
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = 'API request failed';
    let errorData = null;

    if (errorText) {
      try {
        errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorMessage;
      } catch {
        errorMessage = errorText;
      }
    }
    
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    (error as any).data = errorData;
    throw error;
  }

  return response.json() as Promise<T>;
}
