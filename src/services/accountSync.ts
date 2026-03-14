import type { Album, Playlist, Track } from '../db';
import { apiUrl } from '../utils/api';

const TOKEN_KEY = 'aura-auth-token';
const AUTH_EVENT = 'aura-auth-changed';

export class AccountSyncError extends Error {
  status?: number;
  code?: 'NETWORK' | 'HTTP';

  constructor(message: string, options?: { status?: number; code?: 'NETWORK' | 'HTTP' }) {
    super(message);
    this.name = 'AccountSyncError';
    this.status = options?.status;
    this.code = options?.code;
  }
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof AccountSyncError && (error.status === 401 || error.status === 403);
}

export interface AccountUser {
  id: string;
  email: string;
}

export interface CloudSnapshot {
  exportedAt: number;
  tracks: Array<
    Pick<Track, 'id' | 'title' | 'artist' | 'album' | 'duration' | 'coverUrl' | 'isVideo' | 'dateAdded' | 'albumId' | 'trackNumber' | 'genre' | 'lyrics' | 'hasVideo' | 'liked' | 'playCount' | 'lastPlayed'>
  >;
  albums: Album[];
  playlists: Playlist[];
  settings: Record<string, string | null>;
}

export type CloudLibraryTrack = Pick<Track, 'id' | 'title' | 'artist' | 'album' | 'duration' | 'coverUrl' | 'isVideo' | 'dateAdded' | 'albumId' | 'trackNumber' | 'genre' | 'lyrics' | 'hasVideo' | 'liked' | 'playCount' | 'lastPlayed' | 'remoteAudioUrl' | 'remoteVideoUrl' | 'isCloudTrack' | 'isDownloaded'>;

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { token } }));
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new AccountSyncError('Cannot reach account server. Start it with: npm run server', { code: 'NETWORK' });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AccountSyncError(data?.error || `Request failed (${res.status})`, {
      code: 'HTTP',
      status: res.status,
    });
  }
  return data as T;
}

export const accountSync = {
  getToken,
  authEventName: AUTH_EVENT,
  clearToken: () => setToken(null),

  async register(email: string, password: string) {
    const data = await request<{ token: string; user: AccountUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    return data.user;
  },

  async login(email: string, password: string) {
    const data = await request<{ token: string; user: AccountUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    return data.user;
  },

  async logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      setToken(null);
    }
  },

  async me() {
    const data = await request<{ user: AccountUser }>('/auth/me');
    return data.user;
  },

  async pushSnapshot(payload: CloudSnapshot) {
    return request<{ ok: boolean; updatedAt: number }>('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ payload }),
    });
  },

  async pullSnapshot() {
    return request<{ payload: CloudSnapshot | null; updatedAt: number | null }>('/sync/pull');
  },

  async listCloudTracks() {
    const data = await request<{ tracks: CloudLibraryTrack[] }>('/library/tracks');
    return Array.isArray(data.tracks) ? data.tracks : [];
  },
};
