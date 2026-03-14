function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, '');
}

function getDefaultApiBase() {
  if (typeof window === 'undefined') return '/api';

  const { protocol, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:3001/api`;
  }

  return '/api';
}

export const API_BASE = stripTrailingSlash(import.meta.env.VITE_API_BASE_URL || getDefaultApiBase());

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}
