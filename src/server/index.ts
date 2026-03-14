import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { searchYouTube, getVideoInfo } from './youtube';
import { downloadMedia, hasCookies } from './downloader';
import { matchMetadata } from './metadataMatch';

const app = express();
const PORT = Number(process.env.PORT || 3001);

/** Safely create a directory, returning true on success. */
function ensureDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Verify writable by touching a tmp file
    const probe = path.join(dir, '.write-test');
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function resolveDatabasePath(): string {
  const candidates: string[] = [];

  if (process.env.DB_PATH) {
    candidates.push(path.resolve(process.env.DB_PATH));
  }
  candidates.push(path.join(process.cwd(), 'server-data.sqlite'));
  candidates.push('/tmp/aura-server-data.sqlite');

  for (const candidate of candidates) {
    const dir = path.dirname(candidate);
    if (ensureDir(dir)) {
      console.log(`[db] Using database at ${candidate}`);
      return candidate;
    }
    console.warn(`[db] Cannot write to ${dir}, trying next fallback…`);
  }

  // Last resort — should always succeed
  const lastResort = '/tmp/aura-server-data.sqlite';
  console.warn(`[db] All paths failed, using ${lastResort}`);
  return lastResort;
}

function resolveDownloadDir(): string {
  const candidates: string[] = [];

  if (process.env.DOWNLOAD_DIR) {
    candidates.push(path.resolve(process.env.DOWNLOAD_DIR));
  }
  candidates.push(path.join(process.cwd(), 'downloads'));
  candidates.push('/tmp/aura-downloads');

  for (const dir of candidates) {
    if (ensureDir(dir)) {
      console.log(`[downloads] Using ${dir}`);
      return dir;
    }
    console.warn(`[downloads] Cannot write to ${dir}, trying next…`);
  }

  const lastResort = '/tmp/aura-downloads';
  console.warn(`[downloads] All paths failed, using ${lastResort}`);
  return lastResort;
}

const DB_PATH = resolveDatabasePath();
const DOWNLOAD_DIR = resolveDownloadDir();
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    user_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS cloud_tracks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT NOT NULL,
    duration REAL NOT NULL,
    cover_url TEXT,
    is_video INTEGER NOT NULL,
    date_added INTEGER NOT NULL,
    album_id TEXT,
    track_number INTEGER,
    genre TEXT,
    lyrics TEXT,
    has_video INTEGER,
    liked INTEGER,
    play_count INTEGER,
    last_played INTEGER,
    audio_filename TEXT,
    video_filename TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_cloud_tracks_user ON cloud_tracks(user_id, date_added DESC);`);

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use('/downloads', express.static(DOWNLOAD_DIR));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now(), ytCookies: hasCookies });
});

function hashPassword(password: string, salt: string) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function issueToken() {
  return crypto.randomBytes(32).toString('hex');
}

function authUserId(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const row = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token) as { user_id: string } | undefined;
  return row?.user_id || null;
}

type StoredCloudTrackRow = {
  id: string;
  user_id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover_url: string | null;
  is_video: number;
  date_added: number;
  album_id: string | null;
  track_number: number | null;
  genre: string | null;
  lyrics: string | null;
  has_video: number | null;
  liked: number | null;
  play_count: number | null;
  last_played: number | null;
  audio_filename: string | null;
  video_filename: string | null;
};

function fileUrlFor(filename: string | null) {
  return filename ? `/api/file/${encodeURIComponent(filename)}` : null;
}

function serializeCloudTrack(row: StoredCloudTrackRow) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    duration: row.duration,
    coverUrl: row.cover_url || undefined,
    isVideo: Boolean(row.is_video),
    dateAdded: row.date_added,
    albumId: row.album_id || undefined,
    trackNumber: row.track_number || undefined,
    genre: row.genre || undefined,
    lyrics: row.lyrics || undefined,
    hasVideo: Boolean(row.has_video),
    liked: Boolean(row.liked),
    playCount: row.play_count || 0,
    lastPlayed: row.last_played || 0,
    isCloudTrack: true,
    isDownloaded: false,
    remoteAudioUrl: fileUrlFor(row.audio_filename) || fileUrlFor(row.video_filename) || undefined,
    remoteVideoUrl: fileUrlFor(row.video_filename) || (row.is_video ? fileUrlFor(row.audio_filename) || undefined : undefined),
  };
}

function upsertCloudTrack(userId: string, payload: {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  coverUrl?: string;
  isVideo: boolean;
  dateAdded: number;
  albumId?: string;
  trackNumber?: number;
  genre?: string;
  lyrics?: string;
  hasVideo?: boolean;
  liked?: boolean;
  playCount?: number;
  lastPlayed?: number;
  audioFilename?: string;
  videoFilename?: string;
}) {
  db.prepare(`
    INSERT INTO cloud_tracks (
      id, user_id, title, artist, album, duration, cover_url, is_video, date_added,
      album_id, track_number, genre, lyrics, has_video, liked, play_count, last_played,
      audio_filename, video_filename
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      artist = excluded.artist,
      album = excluded.album,
      duration = excluded.duration,
      cover_url = excluded.cover_url,
      is_video = excluded.is_video,
      date_added = excluded.date_added,
      album_id = excluded.album_id,
      track_number = excluded.track_number,
      genre = excluded.genre,
      lyrics = excluded.lyrics,
      has_video = excluded.has_video,
      liked = excluded.liked,
      play_count = excluded.play_count,
      last_played = excluded.last_played,
      audio_filename = excluded.audio_filename,
      video_filename = excluded.video_filename
  `).run(
    payload.id,
    userId,
    payload.title,
    payload.artist,
    payload.album,
    payload.duration,
    payload.coverUrl || null,
    payload.isVideo ? 1 : 0,
    payload.dateAdded,
    payload.albumId || null,
    payload.trackNumber || null,
    payload.genre || null,
    payload.lyrics || null,
    payload.hasVideo ? 1 : 0,
    payload.liked ? 1 : 0,
    payload.playCount || 0,
    payload.lastPlayed || 0,
    payload.audioFilename || null,
    payload.videoFilename || null,
  );

  const row = db.prepare('SELECT * FROM cloud_tracks WHERE id = ?').get(payload.id) as StoredCloudTrackRow;
  return serializeCloudTrack(row);
}

// Auth
app.post('/api/auth/register', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Email and password (min 6 chars) are required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
  if (existing) return res.status(409).json({ error: 'Account already exists' });

  const id = crypto.randomUUID();
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  db.prepare('INSERT INTO users (id, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, passwordHash, salt, Date.now());

  const token = issueToken();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, id, Date.now());

  res.json({ token, user: { id, email } });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT id, email, password_hash, salt FROM users WHERE email = ?').get(email) as
    | { id: string; email: string; password_hash: string; salt: string }
    | undefined;

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const candidate = hashPassword(password, user.salt);
  if (candidate !== user.password_hash) return res.status(401).json({ error: 'Invalid credentials' });

  const token = issueToken();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, user.id, Date.now());
  res.json({ token, user: { id: user.id, email: user.email } });
});

app.get('/api/auth/me', (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId) as { id: string; email: string } | undefined;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.json({ ok: true });
});

// Cloud snapshot sync (metadata/settings, local media files remain on device)
app.post('/api/sync/push', (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const payload = req.body?.payload;
  if (!payload) return res.status(400).json({ error: 'Missing payload' });

  db.prepare(`
    INSERT INTO snapshots (user_id, payload, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `).run(userId, JSON.stringify(payload), Date.now());

  res.json({ ok: true, updatedAt: Date.now() });
});

app.get('/api/sync/pull', (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const row = db.prepare('SELECT payload, updated_at FROM snapshots WHERE user_id = ?').get(userId) as
    | { payload: string; updated_at: number }
    | undefined;
  if (!row) return res.json({ payload: null, updatedAt: null });
  try {
    return res.json({ payload: JSON.parse(row.payload), updatedAt: row.updated_at });
  } catch {
    return res.json({ payload: null, updatedAt: row.updated_at });
  }
});

app.get('/api/library/tracks', (req, res) => {
  const userId = authUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const rows = db.prepare('SELECT * FROM cloud_tracks WHERE user_id = ? ORDER BY date_added DESC').all(userId) as StoredCloudTrackRow[];
  res.json({ tracks: rows.map(serializeCloudTrack) });
});

// Search YouTube
app.get('/api/search', async (req, res) => {
  const query = req.query.q as string;
  if (!query) return res.status(400).json({ error: 'Missing query parameter "q"' });
  try {
    const results = await searchYouTube(query);
    res.json({ results });
  } catch (err: any) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message || 'Search failed' });
  }
});

// Get video info
app.get('/api/info', async (req, res) => {
  const url = req.query.url as string;
  if (!url) return res.status(400).json({ error: 'Missing query parameter "url"' });
  try {
    const info = await getVideoInfo(url);
    res.json(info);
  } catch (err: any) {
    console.error('Info error:', err);
    res.status(500).json({ error: err.message || 'Failed to get video info' });
  }
});

// Download audio or video — streams progress via SSE
app.get('/api/download', async (req, res) => {
  const userId = authUserId(req);
  const videoId = req.query.videoId as string;
  const rawUrl = req.query.url as string;
  const format = (req.query.type as string) || (req.query.format as string) || 'audio';
  const url = rawUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
  if (!url) return res.status(400).json({ error: 'Missing query parameter "videoId" or "url"' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // If type=both, download audio first then video, and return both filenames
    if (format === 'both') {
      // Phase 1: download audio (0–45%)
      res.write(`data: ${JSON.stringify({ progress: 0, phase: 'audio' })}\n\n`);
      const audioResult = await downloadMedia(url, 'audio', DOWNLOAD_DIR, (p) => {
        res.write(`data: ${JSON.stringify({ progress: Math.round(p * 0.45), phase: 'audio' })}\n\n`);
      });

      // Phase 2: download video (45–90%)
      res.write(`data: ${JSON.stringify({ progress: 45, phase: 'video' })}\n\n`);
      const videoResult = await downloadMedia(url, 'video', DOWNLOAD_DIR, (p) => {
        res.write(`data: ${JSON.stringify({ progress: 45 + Math.round(p * 0.45), phase: 'video' })}\n\n`);
      });

      // Phase 3: match metadata (90–100%)
      res.write(`data: ${JSON.stringify({ progress: 92, phase: 'metadata' })}\n\n`);
      let metadata;
      try {
        metadata = await matchMetadata(audioResult.title, audioResult.artist, audioResult.duration);
      } catch {
        metadata = { title: audioResult.title, artist: audioResult.artist, album: 'Unknown Album' };
      }

      const cloudTrack = userId
        ? upsertCloudTrack(userId, {
            id: crypto.randomUUID(),
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album || 'Unknown Album',
            duration: audioResult.duration,
            coverUrl: metadata.coverUrl,
            isVideo: false,
            dateAdded: Date.now(),
            trackNumber: metadata.trackNumber,
            genre: metadata.genre,
            hasVideo: true,
            audioFilename: audioResult.filename,
            videoFilename: videoResult.filename,
          })
        : null;

      res.write(`data: ${JSON.stringify({
        done: true,
        audioFilename: audioResult.filename,
        videoFilename: videoResult.filename,
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album || 'Unknown Album',
        year: metadata.year,
        trackNumber: metadata.trackNumber,
        genre: metadata.genre,
        coverUrl: metadata.coverUrl,
        cloudTrack,
      })}\n\n`);
    } else {
      // Single download (audio or video only)
      const result = await downloadMedia(url, format as 'audio' | 'video', DOWNLOAD_DIR, (progress) => {
        res.write(`data: ${JSON.stringify({ progress })}\n\n`);
      });

      // Match to clean music metadata (MusicBrainz + Cover Art Archive)
      res.write(`data: ${JSON.stringify({ progress: 100, status: 'matching metadata...' })}\n\n`);
      let metadata;
      try {
        metadata = await matchMetadata(result.title, result.artist, result.duration);
      } catch {
        metadata = { title: result.title, artist: result.artist, album: 'Unknown Album' };
      }

      const cloudTrack = userId
        ? upsertCloudTrack(userId, {
            id: crypto.randomUUID(),
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album || 'Unknown Album',
            duration: result.duration,
            coverUrl: metadata.coverUrl,
            isVideo: format === 'video',
            dateAdded: Date.now(),
            trackNumber: metadata.trackNumber,
            genre: metadata.genre,
            hasVideo: format === 'video',
            audioFilename: format === 'video' ? undefined : result.filename,
            videoFilename: format === 'video' ? result.filename : undefined,
          })
        : null;

      res.write(`data: ${JSON.stringify({
        done: true,
        filename: result.filename,
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album || 'Unknown Album',
        year: metadata.year,
        trackNumber: metadata.trackNumber,
        genre: metadata.genre,
        coverUrl: metadata.coverUrl,
        cloudTrack,
      })}\n\n`);
    }
  } catch (err: any) {
    console.error('Download error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'Download failed' })}\n\n`);
  }
  res.end();
});

// Serve downloaded file for client to fetch
app.get('/api/file/:filename', (req, res) => {
  const filePath = path.join(DOWNLOAD_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// Delete downloaded file after import
app.delete('/api/file/:filename', (req, res) => {
  const filePath = path.join(DOWNLOAD_DIR, req.params.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`🎵 reesr server running on port ${PORT}`);
});
