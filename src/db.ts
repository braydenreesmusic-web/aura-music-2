import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Track {
  id: string;
  file?: File;
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
  /** Optional companion video file for audio tracks */
  videoFile?: File;
  /** Whether a video version is available (either isVideo or has videoFile) */
  hasVideo?: boolean;
  /** Whether track is liked/favorited */
  liked?: boolean;
  /** Number of times played to completion */
  playCount?: number;
  /** Timestamp of last play */
  lastPlayed?: number;
  /** Remote audio URL for online cloud playback */
  remoteAudioUrl?: string;
  /** Remote video URL for online cloud playback */
  remoteVideoUrl?: string;
  /** Whether track belongs to cloud library */
  isCloudTrack?: boolean;
  /** Whether an offline local copy exists on this device */
  isDownloaded?: boolean;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  coverUrl?: string;
  year?: number;
  genre?: string;
  trackIds: string[];
  dateCreated: number;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  coverUrl?: string;
  dateCreated: number;
}

interface MusicDB extends DBSchema {
  tracks: {
    key: string;
    value: Track;
    indexes: { 'by-date': number; 'by-album': string };
  };
  albums: {
    key: string;
    value: Album;
    indexes: { 'by-date': number; 'by-artist': string };
  };
  playlists: {
    key: string;
    value: Playlist;
    indexes: { 'by-date': number };
  };
}

let dbPromise: Promise<IDBPDatabase<MusicDB>>;

const DB_NAME = 'aura-music';
const DB_VERSION = 4;

function migrateToV1(db: IDBPDatabase<MusicDB>) {
  if (!db.objectStoreNames.contains('tracks')) {
    const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
    trackStore.createIndex('by-date', 'dateAdded');
  }
}

function migrateToV2(db: IDBPDatabase<MusicDB>) {
  if (!db.objectStoreNames.contains('albums')) {
    const albumStore = db.createObjectStore('albums', { keyPath: 'id' });
    albumStore.createIndex('by-date', 'dateCreated');
    albumStore.createIndex('by-artist', 'artist');
  }
  if (!db.objectStoreNames.contains('playlists')) {
    const playlistStore = db.createObjectStore('playlists', { keyPath: 'id' });
    playlistStore.createIndex('by-date', 'dateCreated');
  }
}

function migrateToV3(db: IDBPDatabase<MusicDB>, tx: any) {
  if (!db.objectStoreNames.contains('tracks')) return;
  const trackStore = tx?.objectStore('tracks');
  if (!trackStore) return;

  if (!trackStore.indexNames.contains('by-album')) {
    trackStore.createIndex('by-album', 'album');
  }

  const request = trackStore.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const value = cursor.value as Track;
    let changed = false;

    if (value.liked === undefined) {
      value.liked = false;
      changed = true;
    }
    if (value.playCount === undefined) {
      value.playCount = 0;
      changed = true;
    }
    if (value.lastPlayed === undefined) {
      value.lastPlayed = 0;
      changed = true;
    }
    if (value.hasVideo === undefined) {
      value.hasVideo = Boolean(value.videoFile) || Boolean(value.isVideo);
      changed = true;
    }

    if (changed) {
      cursor.update(value);
    }
    cursor.continue();
  };
}

function migrateToV4(db: IDBPDatabase<MusicDB>, tx: any) {
  if (!db.objectStoreNames.contains('tracks')) return;
  const trackStore = tx?.objectStore('tracks');
  if (!trackStore) return;

  const request = trackStore.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const value = cursor.value as Track;
    let changed = false;

    if (value.isCloudTrack === undefined) {
      value.isCloudTrack = false;
      changed = true;
    }
    if (value.isDownloaded === undefined) {
      value.isDownloaded = Boolean(value.file);
      changed = true;
    }

    if (changed) {
      cursor.update(value);
    }
    cursor.continue();
  };
}

export function initDB() {
  if (!dbPromise) {
    dbPromise = openDB<MusicDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) migrateToV1(db);
        if (oldVersion < 2) migrateToV2(db);
        if (oldVersion < 3) migrateToV3(db, transaction);
        if (oldVersion < 4) migrateToV4(db, transaction);
      },
    });
  }
  return dbPromise;
}

// ── Track CRUD ──
export async function addTrack(track: Track) {
  const db = await initDB();
  await db.put('tracks', track);
}

export async function getAllTracks() {
  const db = await initDB();
  const tracks = await db.getAllFromIndex('tracks', 'by-date');
  return tracks.reverse();
}

export async function deleteTrack(id: string) {
  const db = await initDB();
  await db.delete('tracks', id);
}

export async function getTrack(id: string) {
  const db = await initDB();
  return db.get('tracks', id);
}

export async function updateTrack(id: string, updates: Partial<Omit<Track, 'id'>>) {
  const db = await initDB();
  const track = await db.get('tracks', id);
  if (!track) return;
  Object.assign(track, updates);
  await db.put('tracks', track);
  return track;
}

// ── Album CRUD ──
export async function addAlbum(album: Album): Promise<string> {
  const db = await initDB();
  await db.put('albums', album);
  return album.id;
}

export async function getAllAlbums() {
  const db = await initDB();
  const albums = await db.getAllFromIndex('albums', 'by-date');
  return albums.reverse();
}

export async function getAlbum(id: string) {
  const db = await initDB();
  return db.get('albums', id);
}

export async function deleteAlbum(id: string) {
  const db = await initDB();
  await db.delete('albums', id);
}

// ── Playlist CRUD ──
export async function addPlaylist(playlist: Playlist) {
  const db = await initDB();
  await db.put('playlists', playlist);
}

export async function getAllPlaylists() {
  const db = await initDB();
  const playlists = await db.getAllFromIndex('playlists', 'by-date');
  return playlists.reverse();
}

export async function deletePlaylist(id: string) {
  const db = await initDB();
  await db.delete('playlists', id);
}

export async function getPlaylist(id: string) {
  const db = await initDB();
  return db.get('playlists', id);
}

export async function updatePlaylist(id: string, updates: Partial<Omit<Playlist, 'id'>>) {
  const db = await initDB();
  const playlist = await db.get('playlists', id);
  if (!playlist) return;
  Object.assign(playlist, updates);
  await db.put('playlists', playlist);
  return playlist;
}

// ── Helpers ──
export async function getTracksByAlbum(albumId: string): Promise<Track[]> {
  const all = await getAllTracks();
  return all
    .filter((t) => t.albumId === albumId)
    .sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));
}

export async function autoGroupAlbums(): Promise<number> {
  const tracks = await getAllTracks();
  const albumMap = new Map<string, Track[]>();
  let created = 0;

  for (const track of tracks) {
    if (!track.album || track.album === 'Unknown Album' || track.albumId) continue;
    const key = `${track.artist}:::${track.album}`;
    if (!albumMap.has(key)) albumMap.set(key, []);
    albumMap.get(key)!.push(track);
  }

  for (const [, groupTracks] of albumMap) {
    if (groupTracks.length < 2) continue;
    const first = groupTracks[0];
    const albumId = crypto.randomUUID();
    const album: Album = {
      id: albumId,
      title: first.album,
      artist: first.artist,
      coverUrl: first.coverUrl,
      genre: first.genre,
      trackIds: groupTracks.map((t) => t.id),
      dateCreated: Date.now(),
    };
    await addAlbum(album);
    for (const track of groupTracks) {
      track.albumId = albumId;
      await addTrack(track);
    }
    created++;
  }
  return created;
}
