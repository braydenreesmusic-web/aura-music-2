import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { Track, Album, Playlist, getAllTracks, addTrack, deleteTrack, getAllAlbums, addAlbum, deleteAlbum as deleteAlbumDB, updateTrack as updateTrackDB, getAllPlaylists, addPlaylist as addPlaylistDB, deletePlaylist as deletePlaylistDB, updatePlaylist as updatePlaylistDB } from '../db';
import { audioPlayer } from '../services/AudioPlayer';
import { parseMetadata, getAudioDuration, fixStaleBlobCovers } from '../utils/metadata';
import { apiUrl } from '../utils/api';
import { accountSync, type CloudLibraryTrack } from '../services/accountSync';

export type SortMode = 'date' | 'title' | 'artist' | 'album' | 'duration';
export type ViewMode = 'all' | 'videos' | 'albums' | 'album-detail' | 'album-edit' | 'discover' | 'playlist-detail' | 'favorites' | 'recently-played' | 'insights';
export type RepeatMode = 'off' | 'all' | 'one';

const SESSION_KEY = 'aura-session-v1';

interface PersistedSession {
  queueIds: string[];
  currentTrackId: string | null;
  currentTime: number;
  isPlaying: boolean;
  viewMode: ViewMode;
  selectedAlbumId: string | null;
  selectedPlaylistId: string | null;
  searchQuery: string;
  sortMode: SortMode;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  showVideoInline: boolean;
  showLyrics: boolean;
}

interface CloudTrackSnapshot {
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
  remoteAudioUrl?: string;
  remoteVideoUrl?: string;
  isCloudTrack?: boolean;
  isDownloaded?: boolean;
}

interface CloudSnapshot {
  exportedAt: number;
  tracks: CloudTrackSnapshot[];
  albums: Album[];
  playlists: Playlist[];
  settings: Record<string, string | null>;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface PlayerContextType {
  tracks: Track[];
  albums: Album[];
  playlists: Playlist[];
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  queue: Track[];
  searchQuery: string;
  sortMode: SortMode;
  viewMode: ViewMode;
  filteredTracks: Track[];
  toasts: Toast[];
  isLoading: boolean;
  selectedAlbumId: string | null;
  selectedPlaylistId: string | null;
  playTrack: (track: Track) => void;
  togglePlayPause: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addFiles: (files: FileList | File[]) => Promise<void>;
  removeTrack: (id: string) => Promise<void>;
  updateTrack: (id: string, updates: Partial<Track>) => Promise<void>;
  removeAlbum: (id: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setSortMode: (mode: SortMode) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedAlbumId: (id: string | null) => void;
  setSelectedPlaylistId: (id: string | null) => void;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  dismissToast: (id: string) => void;
  playQueue: (tracks: Track[], startIndex?: number) => void;
  moveInQueue: (fromIndex: number, toIndex: number) => void;
  refreshTracks: () => Promise<void>;
  refreshAlbums: () => Promise<void>;
  refreshPlaylists: () => Promise<void>;
  importDownloadedFile: (filename: string, isVideo: boolean, serverMeta?: { title?: string; artist?: string; album?: string; year?: number; trackNumber?: number; genre?: string; coverUrl?: string }) => Promise<void>;
  importBothFiles: (audioFilename: string, videoFilename: string, serverMeta?: { title?: string; artist?: string; album?: string; year?: number; trackNumber?: number; genre?: string; coverUrl?: string; trackId?: string; remoteAudioUrl?: string; remoteVideoUrl?: string; isCloudTrack?: boolean }) => Promise<void>;
  showVideoInline: boolean;
  toggleVideoInline: () => void;
  videoUrl: string | null;
  toggleLike: (id: string) => Promise<void>;
  playNext: (track: Track) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  createPlaylist: (name: string) => Promise<string>;
  deletePlaylist: (id: string) => Promise<void>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  addToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  removeFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  sleepTimerMinutes: number | null;
  sleepTimerRemaining: number | null;
  setSleepTimer: (minutes: number | null) => void;
  showLyrics: boolean;
  setShowLyrics: (show: boolean) => void;
  likedCount: number;
  recentCount: number;
  videoCount: number;
  isOnline: boolean;
  downloadCloudTrack: (track: Track) => Promise<void>;
  applyCloudSnapshot: (snapshot: CloudSnapshot) => Promise<{ updatedTracks: number; importedAlbums: number; importedPlaylists: number }>;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within a PlayerProvider');
  return context;
};

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('aura-volume');
    return saved ? parseFloat(saved) : 0.7;
  });
  const [isShuffle, setIsShuffle] = useState(() => localStorage.getItem('aura-shuffle') === 'true');
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => (localStorage.getItem('aura-repeat-mode') as RepeatMode) || 'off');
  const [queue, setQueue] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(() => (localStorage.getItem('aura-sort') as SortMode) || 'date');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [showVideoInline, setShowVideoInline] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [authToken, setAuthToken] = useState<string | null>(() => accountSync.getToken());

  const shuffledQueueRef = useRef<Track[]>([]);
  const shuffleIndexRef = useRef(0);
  const historyRef = useRef<Track[]>([]);

  const [sleepTimerMinutes, setSleepTimerMinutesState] = useState<number | null>(null);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const audioUrlRef = useRef<string | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  const isHydratingSessionRef = useRef(true);

  const CLOUD_RESTORE_SETTING_KEYS = [
    'aura-volume',
    'aura-shuffle',
    'aura-repeat-mode',
    'aura-sort',
    'aura-session-v1',
    'aura-ui-session-v1',
    'aura-eq-gains',
    'aura-eq-preset',
  ] as const;

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const syncOnline = () => setIsOnline(window.navigator.onLine);
    const syncAuth = () => setAuthToken(accountSync.getToken());

    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    window.addEventListener(accountSync.authEventName, syncAuth as EventListener);

    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
      window.removeEventListener(accountSync.authEventName, syncAuth as EventListener);
    };
  }, []);

  const visibleTracks = React.useMemo(
    () => tracks.filter((track) => !track.isCloudTrack || track.isDownloaded || (isOnline && Boolean(authToken))),
    [tracks, isOnline, authToken],
  );

  const derivedTracks = React.useMemo(() => {
    const videos = visibleTracks.filter((t) => t.isVideo || t.hasVideo);
    const favorites = visibleTracks.filter((t) => t.liked);
    const recent = visibleTracks
      .filter((t) => t.lastPlayed)
      .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));

    return {
      videos,
      favorites,
      recent,
      counts: {
        videoCount: videos.length,
        likedCount: favorites.length,
        recentCount: recent.length,
      },
    };
  }, [visibleTracks]);

  const filteredTracks = React.useMemo(() => {
    let result =
      viewMode === 'videos'
        ? [...derivedTracks.videos]
        : viewMode === 'favorites'
          ? [...derivedTracks.favorites]
          : viewMode === 'recently-played'
            ? [...derivedTracks.recent]
            : [...visibleTracks];
    if (viewMode === 'playlist-detail' && selectedPlaylistId) {
      const pl = playlists.find((p) => p.id === selectedPlaylistId);
      if (pl) {
        const idSet = new Set(pl.trackIds);
        result = result.filter((t) => idSet.has(t.id));
        // Preserve playlist ordering
        result.sort((a, b) => pl.trackIds.indexOf(a.id) - pl.trackIds.indexOf(b.id));
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q)
      );
    }
    if (viewMode !== 'recently-played' && viewMode !== 'playlist-detail') {
      result.sort((a, b) => {
        switch (sortMode) {
          case 'title': return a.title.localeCompare(b.title);
          case 'artist': return a.artist.localeCompare(b.artist);
          case 'album': return a.album.localeCompare(b.album);
          case 'duration': return a.duration - b.duration;
          case 'date': default: return b.dateAdded - a.dateAdded;
        }
      });
    }
    return result;
  }, [visibleTracks, derivedTracks, searchQuery, sortMode, viewMode, selectedPlaylistId, playlists]);

  const loadTracks = async () => {
    let loadedTracks = await getAllTracks();
    loadedTracks = await fixStaleBlobCovers(loadedTracks);
    setTracks(loadedTracks);
    setQueue(loadedTracks);
  };

  const syncCloudLibrary = useCallback(async () => {
    if (!isOnline || !authToken) return;

    try {
      const remoteTracks = await accountSync.listCloudTracks();
      const existingTracks = await getAllTracks();
      const existingMap = new Map(existingTracks.map((track) => [track.id, track]));
      const remoteIds = new Set<string>();

      for (const remoteTrack of remoteTracks) {
        remoteIds.add(remoteTrack.id);
        const existing = existingMap.get(remoteTrack.id);
        await addTrack({
          ...existing,
          ...remoteTrack,
          file: existing?.file,
          videoFile: existing?.videoFile,
          isCloudTrack: true,
          isDownloaded: Boolean(existing?.file || existing?.isDownloaded),
          hasVideo: remoteTrack.hasVideo ?? Boolean(remoteTrack.remoteVideoUrl || existing?.videoFile || remoteTrack.isVideo),
        });
      }

      for (const existing of existingTracks) {
        if (existing.isCloudTrack && !existing.isDownloaded && !remoteIds.has(existing.id)) {
          await deleteTrack(existing.id);
        }
      }

      await loadTracks();
    } catch {
      // Local library remains available if cloud sync fails.
    }
  }, [authToken, isOnline]);

  useEffect(() => { loadTracks(); loadAlbums(); loadPlaylists(); }, []);
  useEffect(() => { void syncCloudLibrary(); }, [syncCloudLibrary]);

  useEffect(() => { localStorage.setItem('aura-volume', String(volume)); }, [volume]);
  useEffect(() => { localStorage.setItem('aura-shuffle', String(isShuffle)); }, [isShuffle]);
  useEffect(() => { localStorage.setItem('aura-repeat-mode', repeatMode); }, [repeatMode]);
  useEffect(() => { localStorage.setItem('aura-sort', sortMode); }, [sortMode]);

  const loadAlbums = async () => {
    const loadedAlbums = await getAllAlbums();
    setAlbums(loadedAlbums);
  };

  const loadPlaylists = async () => {
    const loadedPlaylists = await getAllPlaylists();
    setPlaylists(loadedPlaylists);
  };

  const refreshTracks = async () => { await loadTracks(); };
  const refreshAlbums = async () => { await loadAlbums(); };
  const refreshPlaylists = async () => { await loadPlaylists(); };

  const applyCloudSnapshot = async (snapshot: CloudSnapshot) => {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

    let updatedTracks = 0;

    for (const remoteTrack of snapshot.tracks || []) {
      const byId = tracks.find((t) => t.id === remoteTrack.id);
      const byLooseMatch = tracks.find(
        (t) =>
          normalize(t.title) === normalize(remoteTrack.title) &&
          normalize(t.artist) === normalize(remoteTrack.artist) &&
          Math.abs((t.duration || 0) - (remoteTrack.duration || 0)) <= 3,
      );

      const targetTrack = byId || byLooseMatch;
      if (!targetTrack) continue;

      await updateTrackDB(targetTrack.id, {
        title: remoteTrack.title,
        artist: remoteTrack.artist,
        album: remoteTrack.album,
        duration: remoteTrack.duration,
        coverUrl: remoteTrack.coverUrl,
        isVideo: remoteTrack.isVideo,
        dateAdded: remoteTrack.dateAdded,
        albumId: remoteTrack.albumId,
        trackNumber: remoteTrack.trackNumber,
        genre: remoteTrack.genre,
        lyrics: remoteTrack.lyrics,
        hasVideo: remoteTrack.hasVideo,
        liked: remoteTrack.liked,
        playCount: remoteTrack.playCount,
        lastPlayed: remoteTrack.lastPlayed,
        remoteAudioUrl: remoteTrack.remoteAudioUrl,
        remoteVideoUrl: remoteTrack.remoteVideoUrl,
        isCloudTrack: remoteTrack.isCloudTrack,
        isDownloaded: remoteTrack.isDownloaded ?? targetTrack.isDownloaded,
      });

      updatedTracks++;
    }

    for (const existingAlbum of albums) {
      if (!(snapshot.albums || []).some((incoming) => incoming.id === existingAlbum.id)) {
        await deleteAlbumDB(existingAlbum.id);
      }
    }
    for (const incomingAlbum of snapshot.albums || []) {
      await addAlbum(incomingAlbum);
    }

    for (const existingPlaylist of playlists) {
      if (!(snapshot.playlists || []).some((incoming) => incoming.id === existingPlaylist.id)) {
        await deletePlaylistDB(existingPlaylist.id);
      }
    }
    for (const incomingPlaylist of snapshot.playlists || []) {
      await addPlaylistDB(incomingPlaylist);
    }

    const settings = snapshot.settings || {};
    for (const key of CLOUD_RESTORE_SETTING_KEYS) {
      if (!(key in settings)) continue;
      const value = settings[key];
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }

    await Promise.all([loadTracks(), loadAlbums(), loadPlaylists()]);

    return {
      updatedTracks,
      importedAlbums: (snapshot.albums || []).length,
      importedPlaylists: (snapshot.playlists || []).length,
    };
  };

  const prepareTrackMedia = async (track: Track, shouldPlay: boolean, preferInlineVideo?: boolean) => {
    revokeOldUrls();

    const aUrl = track.file
      ? URL.createObjectURL(track.file)
      : track.remoteAudioUrl || track.remoteVideoUrl || null;
    if (!aUrl) {
      addToast(isOnline ? 'Track is not available yet.' : 'This cloud track needs internet or a local download.', 'error');
      return;
    }
    audioUrlRef.current = aUrl;

    const resolvedVideoUrl = track.videoFile
      ? URL.createObjectURL(track.videoFile)
      : (track.remoteVideoUrl || (track.isVideo ? aUrl : null));

    videoUrlRef.current = resolvedVideoUrl;
    setVideoUrl(resolvedVideoUrl);

    const shouldShowVideo = Boolean((preferInlineVideo ?? showVideoInline) && resolvedVideoUrl);
    const sourceUrl = shouldShowVideo && resolvedVideoUrl ? resolvedVideoUrl : aUrl;

    setShowVideoInline(shouldShowVideo);
    if (shouldPlay) {
      await audioPlayer.play(sourceUrl);
    } else {
      audioPlayer.initAudioContext();
      audioPlayer.element.src = sourceUrl;
      audioPlayer.element.load();
      audioPlayer.pause();
    }
  };

  useEffect(() => {
    if (!isHydratingSessionRef.current) return;
    if (tracks.length === 0) {
      isHydratingSessionRef.current = false;
      return;
    }

    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      isHydratingSessionRef.current = false;
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedSession;
      const trackMap = new Map<string, Track>(tracks.map((t) => [t.id, t]));
      const restoredQueue = (parsed.queueIds || []).map((id) => trackMap.get(id)).filter(Boolean) as Track[];
      if (restoredQueue.length > 0) {
        setQueue(restoredQueue);
      }

      if (parsed.viewMode) setViewMode(parsed.viewMode);
      setSelectedAlbumId(parsed.selectedAlbumId || null);
      setSelectedPlaylistId(parsed.selectedPlaylistId || null);
      setSearchQuery(parsed.searchQuery || '');
      if (parsed.sortMode) setSortMode(parsed.sortMode);
      setIsShuffle(Boolean(parsed.isShuffle));
      if (parsed.repeatMode) setRepeatMode(parsed.repeatMode);
      setShowLyrics(Boolean(parsed.showLyrics));

      if (parsed.currentTrackId) {
        const restoredTrack = trackMap.get(parsed.currentTrackId);
        if (restoredTrack) {
          setCurrentTrack(restoredTrack);
          void prepareTrackMedia(restoredTrack, false, parsed.showVideoInline);
          if (parsed.currentTime > 0) {
            const seekTime = parsed.currentTime;
            const onLoaded = () => {
              audioPlayer.element.currentTime = seekTime;
              setCurrentTime(seekTime);
              audioPlayer.element.removeEventListener('loadedmetadata', onLoaded);
            };
            audioPlayer.element.addEventListener('loadedmetadata', onLoaded);
          }
          if (parsed.isPlaying) {
            setTimeout(() => { void audioPlayer.resume(); }, 120);
          }
        }
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    } finally {
      isHydratingSessionRef.current = false;
    }
  }, [tracks]);

  useEffect(() => {
    if (isHydratingSessionRef.current) return;
    const payload: PersistedSession = {
      queueIds: queue.map((t) => t.id),
      currentTrackId: currentTrack?.id || null,
      currentTime,
      isPlaying,
      viewMode,
      selectedAlbumId,
      selectedPlaylistId,
      searchQuery,
      sortMode,
      isShuffle,
      repeatMode,
      showVideoInline,
      showLyrics,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  }, [
    queue,
    currentTrack?.id,
    currentTime,
    isPlaying,
    viewMode,
    selectedAlbumId,
    selectedPlaylistId,
    searchQuery,
    sortMode,
    isShuffle,
    repeatMode,
    showVideoInline,
    showLyrics,
  ]);

  useEffect(() => {
    if (isShuffle && queue.length > 0) {
      const shuffled: Track[] = shuffleArray(queue);
      if (currentTrack) {
        const idx = shuffled.findIndex((t: Track) => t.id === currentTrack.id);
        if (idx > 0) [shuffled[0], shuffled[idx]] = [shuffled[idx], shuffled[0]];
        shuffleIndexRef.current = 0;
      }
      shuffledQueueRef.current = shuffled;
    }
  }, [isShuffle, queue.length]);

  const updateTrackInDB = async (id: string, updates: Partial<Track>) => {
    await updateTrackDB(id, updates);
    setTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  useEffect(() => {
    const el = audioPlayer.element;
    const handleTimeUpdate = () => setCurrentTime(el.currentTime);
    const handleDurationChange = () => setDuration(el.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      if (currentTrack) {
        const newCount = (currentTrack.playCount || 0) + 1;
        updateTrackInDB(currentTrack.id, { playCount: newCount, lastPlayed: Date.now() });
      }
      if (repeatMode === 'one') {
        el.currentTime = 0;
        void audioPlayer.resume();
      } else {
        nextTrackInternal();
      }
    };
    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('durationchange', handleDurationChange);
    el.addEventListener('play', handlePlay);
    el.addEventListener('pause', handlePause);
    el.addEventListener('ended', handleEnded);
    return () => {
      el.removeEventListener('timeupdate', handleTimeUpdate);
      el.removeEventListener('durationchange', handleDurationChange);
      el.removeEventListener('play', handlePlay);
      el.removeEventListener('pause', handlePause);
      el.removeEventListener('ended', handleEnded);
    };
  }, [repeatMode, queue, currentTrack, isShuffle]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    const safeArtwork = currentTrack.coverUrl && !currentTrack.coverUrl.startsWith('blob:')
      ? [{ src: currentTrack.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
      : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork: safeArtwork,
    });
    navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
    navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    try {
      navigator.mediaSession.setActionHandler('seekto', (d) => { if (d.seekTime != null) seek(d.seekTime); });
    } catch { /* Safari may not support seekto */ }
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.code) {
        case 'Space': e.preventDefault(); togglePlayPause(); break;
        case 'ArrowRight':
          e.shiftKey ? nextTrack() : seek(Math.min(currentTime + 5, duration));
          break;
        case 'ArrowLeft':
          e.shiftKey ? prevTrack() : seek(Math.max(currentTime - 5, 0));
          break;
        case 'ArrowUp': e.preventDefault(); setVolume(Math.min(volume + 0.05, 1)); break;
        case 'ArrowDown': e.preventDefault(); setVolume(Math.max(volume - 0.05, 0)); break;
        case 'KeyM': setVolume(volume === 0 ? 0.7 : 0); break;
        case 'KeyL': if (currentTrack) toggleLike(currentTrack.id); break;
        case 'KeyR': if (!e.metaKey && !e.ctrlKey) cycleRepeat(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, duration, volume, isPlaying, currentTrack, queue, isShuffle, repeatMode]);

  useEffect(() => { audioPlayer.setVolume(volume); }, []);

  // Sleep timer
  const setSleepTimer = useCallback((minutes: number | null) => {
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    if (minutes === null) {
      setSleepTimerMinutesState(null);
      setSleepTimerRemaining(null);
      return;
    }
    setSleepTimerMinutesState(minutes);
    const endTime = Date.now() + minutes * 60 * 1000;
    setSleepTimerRemaining(minutes * 60);
    sleepTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setSleepTimerRemaining(remaining);
      if (remaining <= 0) {
        audioPlayer.pause();
        if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
        sleepTimerRef.current = null;
        setSleepTimerMinutesState(null);
        setSleepTimerRemaining(null);
      }
    }, 1000);
  }, []);

  useEffect(() => { return () => { if (sleepTimerRef.current) clearInterval(sleepTimerRef.current); }; }, []);

  const revokeOldUrls = () => {
    const prevAudio = audioUrlRef.current;
    const prevVideo = videoUrlRef.current;

    if (prevAudio?.startsWith('blob:')) {
      URL.revokeObjectURL(prevAudio);
    }
    if (prevVideo?.startsWith('blob:') && prevVideo !== prevAudio) {
      URL.revokeObjectURL(prevVideo);
    }

    audioUrlRef.current = null;
    videoUrlRef.current = null;
  };

  const playTrack = async (track: Track) => {
    if (!isOnline && !track.isDownloaded && !track.file) {
      addToast('This song is only in the cloud right now. Go online or download it first.', 'error');
      return;
    }
    if (currentTrack) {
      historyRef.current.push(currentTrack);
      if (historyRef.current.length > 100) historyRef.current.shift();
    }
    setCurrentTrack(track);
    await prepareTrackMedia(track, true, Boolean(track.videoFile || track.isVideo));

    updateTrackInDB(track.id, { lastPlayed: Date.now() });

    if (isShuffle) {
      const idx = shuffledQueueRef.current.findIndex(t => t.id === track.id);
      if (idx >= 0) shuffleIndexRef.current = idx;
    }
  };

  const toggleVideoInline = () => {
    if (!currentTrack) return;
    const next = !showVideoInline;
    setShowVideoInline(next);
    const wasPlaying = isPlaying;
    const time = audioPlayer.element.currentTime;
    if (next && videoUrlRef.current) {
      audioPlayer.play(videoUrlRef.current).then(() => {
        audioPlayer.element.currentTime = time;
        if (!wasPlaying) audioPlayer.pause();
      });
    } else if (!next && audioUrlRef.current) {
      audioPlayer.play(audioUrlRef.current).then(() => {
        audioPlayer.element.currentTime = time;
        if (!wasPlaying) audioPlayer.pause();
      });
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      audioPlayer.pause();
    } else {
      if (!currentTrack && queue.length > 0) playTrack(queue[0]);
      else void audioPlayer.resume();
    }
  };

  const nextTrackInternal = () => {
    if (!currentTrack || queue.length === 0) return;
    if (isShuffle) {
      shuffleIndexRef.current++;
      if (shuffleIndexRef.current >= shuffledQueueRef.current.length) {
        if (repeatMode === 'all') {
          shuffledQueueRef.current = shuffleArray(queue);
          shuffleIndexRef.current = 0;
        } else {
          audioPlayer.pause();
          return;
        }
      }
      playTrack(shuffledQueueRef.current[shuffleIndexRef.current]);
    } else {
      const currentIndex = queue.findIndex((t) => t.id === currentTrack.id);
      let nextIndex = currentIndex + 1;
      if (nextIndex >= queue.length) {
        if (repeatMode === 'all') nextIndex = 0;
        else { audioPlayer.pause(); return; }
      }
      playTrack(queue[nextIndex]);
    }
  };

  const nextTrack = () => nextTrackInternal();

  const filenameFromUrl = (url: string, fallback: string) => {
    try {
      const parsed = new URL(url, window.location.origin);
      return decodeURIComponent(parsed.pathname.split('/').pop() || fallback);
    } catch {
      return fallback;
    }
  };

  const downloadCloudTrack = async (track: Track) => {
    if (!track.remoteAudioUrl && !track.remoteVideoUrl) {
      addToast('This track does not have a cloud file to download yet.', 'error');
      return;
    }

    try {
      const audioSource = track.remoteAudioUrl || track.remoteVideoUrl;
      const audioRes = audioSource ? await fetch(audioSource) : null;
      if (!audioRes?.ok) throw new Error('Failed to fetch cloud audio');
      const audioBlob = await audioRes.blob();
      const audioFile = new File([audioBlob], filenameFromUrl(audioSource!, `${track.title}.mp3`), { type: track.isVideo ? 'video/mp4' : 'audio/mpeg' });

      let videoFile = track.videoFile;
      if (track.remoteVideoUrl) {
        const videoRes = await fetch(track.remoteVideoUrl);
        if (videoRes.ok) {
          const videoBlob = await videoRes.blob();
          videoFile = new File([videoBlob], filenameFromUrl(track.remoteVideoUrl, `${track.title}.mp4`), { type: 'video/mp4' });
        }
      }

      const downloadedTrack: Track = {
        ...track,
        file: audioFile,
        videoFile,
        isDownloaded: true,
        isCloudTrack: true,
        hasVideo: Boolean(videoFile || track.remoteVideoUrl || track.hasVideo || track.isVideo),
      };

      await addTrack(downloadedTrack);
      await loadTracks();
      if (currentTrack?.id === track.id) {
        setCurrentTrack(downloadedTrack);
      }
      addToast(`Downloaded "${track.title}" for offline playback`, 'success');
    } catch (error) {
      console.error('Cloud download failed:', error);
      addToast('Failed to download cloud track', 'error');
    }
  };

  const prevTrack = () => {
    if (!currentTrack || queue.length === 0) return;
    if (currentTime > 3) { seek(0); return; }
    if (historyRef.current.length > 0) {
      const prev = historyRef.current.pop()!;
      setCurrentTrack(prev);
      void prepareTrackMedia(prev, true, Boolean(prev.videoFile || prev.isVideo));
      return;
    }
    const prevIndex = queue.findIndex((t) => t.id === currentTrack.id) - 1;
    if (prevIndex >= 0) playTrack(queue[prevIndex]);
    else if (repeatMode === 'all') playTrack(queue[queue.length - 1]);
  };

  const seek = (time: number) => {
    audioPlayer.element.currentTime = time;
    setCurrentTime(time);
  };

  const setVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    audioPlayer.setVolume(clamped);
    setVolumeState(clamped);
  };

  const toggleShuffle = () => {
    const next = !isShuffle;
    setIsShuffle(next);
    if (next && queue.length > 0) {
      const shuffled: Track[] = shuffleArray(queue);
      if (currentTrack) {
        const idx = shuffled.findIndex((t: Track) => t.id === currentTrack.id);
        if (idx > 0) [shuffled[0], shuffled[idx]] = [shuffled[idx], shuffled[0]];
        shuffleIndexRef.current = 0;
      }
      shuffledQueueRef.current = shuffled;
    }
  };

  const cycleRepeat = () => {
    const modes: RepeatMode[] = ['off', 'all', 'one'];
    setRepeatMode(modes[(modes.indexOf(repeatMode) + 1) % modes.length]);
  };

  const toggleLike = async (id: string) => {
    const track = tracks.find(t => t.id === id);
    if (!track) return;
    const newLiked = !track.liked;
    await updateTrackInDB(id, { liked: newLiked });
    if (currentTrack?.id === id) setCurrentTrack(prev => prev ? { ...prev, liked: newLiked } : prev);
  };

  const playNext = (track: Track) => {
    if (!currentTrack) { playTrack(track); return; }
    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
    const newQueue = [...queue];
    const existingIdx = newQueue.findIndex(t => t.id === track.id);
    if (existingIdx >= 0) newQueue.splice(existingIdx, 1);
    const insertAt = currentIndex >= 0 ? currentIndex + 1 : 0;
    newQueue.splice(insertAt, 0, track);
    setQueue(newQueue);
    addToast(`"${track.title}" will play next`, 'info');
  };

  const addToQueue = (track: Track) => {
    setQueue(prev => [...prev, track]);
    addToast(`Added "${track.title}" to queue`, 'info');
  };

  const removeFromQueue = (index: number) => {
    setQueue(prev => { const n = [...prev]; n.splice(index, 1); return n; });
  };

  const createPlaylist = async (name: string): Promise<string> => {
    const id = crypto.randomUUID();
    await addPlaylistDB({ id, name, trackIds: [], dateCreated: Date.now() });
    await loadPlaylists();
    addToast(`Created playlist "${name}"`, 'success');
    return id;
  };

  const deletePlaylist = async (id: string) => {
    const p = playlists.find(pl => pl.id === id);
    await deletePlaylistDB(id);
    await loadPlaylists();
    if (p) addToast(`Deleted playlist "${p.name}"`, 'info');
  };

  const renamePlaylist = async (id: string, name: string) => {
    await updatePlaylistDB(id, { name });
    await loadPlaylists();
  };

  const addToPlaylist = async (playlistId: string, trackId: string) => {
    const p = playlists.find(pl => pl.id === playlistId);
    if (!p) return;
    if (p.trackIds.includes(trackId)) { addToast('Track already in playlist', 'info'); return; }
    await updatePlaylistDB(playlistId, { trackIds: [...p.trackIds, trackId] });
    await loadPlaylists();
    const track = tracks.find(t => t.id === trackId);
    addToast(`Added to "${p.name}"`, 'success');
  };

  const removeFromPlaylist = async (playlistId: string, trackId: string) => {
    const p = playlists.find(pl => pl.id === playlistId);
    if (!p) return;
    await updatePlaylistDB(playlistId, { trackIds: p.trackIds.filter(id => id !== trackId) });
    await loadPlaylists();
  };

  const addFiles = async (files: FileList | File[]) => {
    setIsLoading(true);
    let added = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) continue;
      const metadata = await parseMetadata(file);
      const dur = await getAudioDuration(file);
      const newTrack: Track = {
        id: crypto.randomUUID(), file, title: metadata.title, artist: metadata.artist,
        album: metadata.album, coverUrl: metadata.coverUrl, duration: dur,
        isVideo: file.type.startsWith('video/'), dateAdded: Date.now(), isDownloaded: true,
      };
      await addTrack(newTrack);
      added++;
    }
    await loadTracks();
    setIsLoading(false);
    if (added > 0) addToast(`Added ${added} track${added > 1 ? 's' : ''}`, 'success');
    else addToast('No supported files found', 'error');
  };

  const removeTrack = async (id: string) => {
    const track = tracks.find((t) => t.id === id);
    await deleteTrack(id);
    await loadTracks();
    if (currentTrack?.id === id) { audioPlayer.pause(); setCurrentTrack(null); }
    if (track) addToast(`Removed "${track.title}"`, 'info');
  };

  const updateTrack = async (id: string, updates: Partial<Track>) => {
    const track = tracks.find((t) => t.id === id);
    if (!track) return;
    const updatedTrack = { ...track, ...updates };
    await addTrack(updatedTrack);
    await loadTracks();
    if (currentTrack?.id === id) setCurrentTrack(updatedTrack);
  };

  const playQueue = (newQueue: Track[], startIndex = 0) => {
    setQueue(newQueue);
    if (isShuffle) {
      const shuffled: Track[] = shuffleArray(newQueue);
      if (startIndex < newQueue.length) {
        const target = newQueue[startIndex];
        const idx = shuffled.findIndex((t: Track) => t.id === target.id);
        if (idx > 0) [shuffled[0], shuffled[idx]] = [shuffled[idx], shuffled[0]];
        shuffleIndexRef.current = 0;
      }
      shuffledQueueRef.current = shuffled;
    }
    if (newQueue.length > 0 && startIndex < newQueue.length) playTrack(newQueue[startIndex]);
  };

  const moveInQueue = (fromIndex: number, toIndex: number) => {
    const newQueue = [...queue];
    const [item] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, item);
    setQueue(newQueue);
  };

  const removeAlbum = async (id: string) => {
    const album = albums.find((a) => a.id === id);
    await deleteAlbumDB(id);
    if (album) {
      for (const trackId of album.trackIds) {
        await updateTrackDB(trackId, { albumId: undefined, trackNumber: undefined });
      }
    }
    await loadAlbums();
    await loadTracks();
    if (album) addToast(`Removed album "${album.title}"`, 'info');
  };

  const importDownloadedFile = async (filename: string, isVideo: boolean, serverMeta?: { title?: string; artist?: string; album?: string; year?: number; trackNumber?: number; genre?: string; coverUrl?: string; trackId?: string; remoteAudioUrl?: string; remoteVideoUrl?: string; isCloudTrack?: boolean }) => {
    try {
      const res = await fetch(apiUrl(`/file/${encodeURIComponent(filename)}`));
      if (!res.ok) throw new Error('Failed to fetch file');
      const blob = await res.blob();
      const mimeType = isVideo ? 'video/mp4' : 'audio/mpeg';
      const file = new File([blob], filename, { type: mimeType });
      const fileMeta = await parseMetadata(file);
      const dur = await getAudioDuration(file);
      const title = serverMeta?.title || fileMeta.title;
      const artist = serverMeta?.artist || fileMeta.artist;
      const album = serverMeta?.album || fileMeta.album;
      const coverUrl = serverMeta?.coverUrl || fileMeta.coverUrl;

      if (isVideo) {
        const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const existingAudio = tracks.find(
          (t) => !t.isVideo && normalise(t.title) === normalise(title) && normalise(t.artist) === normalise(artist),
        );
        if (existingAudio) {
          const updatedTrack: Track = {
            ...existingAudio,
            id: serverMeta?.trackId || existingAudio.id,
            videoFile: file,
            hasVideo: true,
            isDownloaded: true,
            isCloudTrack: serverMeta?.isCloudTrack || existingAudio.isCloudTrack,
            remoteAudioUrl: serverMeta?.remoteAudioUrl || existingAudio.remoteAudioUrl,
            remoteVideoUrl: serverMeta?.remoteVideoUrl || existingAudio.remoteVideoUrl,
          };
          if (coverUrl && !existingAudio.coverUrl) updatedTrack.coverUrl = coverUrl;
          await addTrack(updatedTrack);
          await loadTracks();
          if (currentTrack?.id === existingAudio.id) setCurrentTrack(updatedTrack);
          addToast(`Video linked to "${existingAudio.title}"`, 'success');
          return;
        }
      }

      const newTrack: Track = {
        id: serverMeta?.trackId || crypto.randomUUID(), file, title, artist, album, coverUrl, duration: dur,
        isVideo, hasVideo: Boolean(isVideo || serverMeta?.remoteVideoUrl), dateAdded: Date.now(),
        genre: serverMeta?.genre, trackNumber: serverMeta?.trackNumber,
        isDownloaded: true,
        isCloudTrack: serverMeta?.isCloudTrack,
        remoteAudioUrl: serverMeta?.remoteAudioUrl,
        remoteVideoUrl: serverMeta?.remoteVideoUrl,
      };
      await addTrack(newTrack);
      await loadTracks();
      addToast(`Imported "${title}"`, 'success');
    } catch (err) {
      console.error('Import failed:', err);
      addToast('Failed to import downloaded file', 'error');
    }
  };

  const importBothFiles = async (audioFilename: string, videoFilename: string, serverMeta?: { title?: string; artist?: string; album?: string; year?: number; trackNumber?: number; genre?: string; coverUrl?: string; trackId?: string; remoteAudioUrl?: string; remoteVideoUrl?: string; isCloudTrack?: boolean }) => {
    try {
      const audioRes = await fetch(apiUrl(`/file/${encodeURIComponent(audioFilename)}`));
      if (!audioRes.ok) throw new Error('Failed to fetch audio file');
      const audioBlob = await audioRes.blob();
      const audioFile = new File([audioBlob], audioFilename, { type: 'audio/mpeg' });

      const videoRes = await fetch(apiUrl(`/file/${encodeURIComponent(videoFilename)}`));
      if (!videoRes.ok) throw new Error('Failed to fetch video file');
      const videoBlob = await videoRes.blob();
      const videoFile = new File([videoBlob], videoFilename, { type: 'video/mp4' });

      const fileMeta = await parseMetadata(audioFile);
      const dur = await getAudioDuration(audioFile);
      const title = serverMeta?.title || fileMeta.title;
      const artist = serverMeta?.artist || fileMeta.artist;
      const album = serverMeta?.album || fileMeta.album;
      const coverUrl = serverMeta?.coverUrl || fileMeta.coverUrl;

      const newTrack: Track = {
        id: serverMeta?.trackId || crypto.randomUUID(), file: audioFile, videoFile, title, artist, album, coverUrl,
        duration: dur, isVideo: false, hasVideo: true, dateAdded: Date.now(),
        genre: serverMeta?.genre, trackNumber: serverMeta?.trackNumber,
        isDownloaded: true,
        isCloudTrack: serverMeta?.isCloudTrack,
        remoteAudioUrl: serverMeta?.remoteAudioUrl,
        remoteVideoUrl: serverMeta?.remoteVideoUrl,
      };
      await addTrack(newTrack);
      await loadTracks();
      addToast(`Imported "${title}" with music video`, 'success');
    } catch (err) {
      console.error('Import both failed:', err);
      addToast('Failed to import downloaded files', 'error');
    }
  };

  return (
    <PlayerContext.Provider
      value={{
        tracks, albums, playlists, currentTrack, isPlaying, currentTime, duration, volume, isShuffle, repeatMode,
        queue, searchQuery, sortMode, viewMode, filteredTracks, toasts, isLoading, selectedAlbumId, selectedPlaylistId,
        playTrack, togglePlayPause, nextTrack, prevTrack, seek, setVolume,
        toggleShuffle, cycleRepeat, addFiles, removeTrack, updateTrack, removeAlbum,
        setSearchQuery, setSortMode, setViewMode, setSelectedAlbumId, setSelectedPlaylistId, addToast, dismissToast,
        playQueue, moveInQueue, refreshTracks, refreshAlbums, refreshPlaylists, importDownloadedFile, importBothFiles,
        showVideoInline, toggleVideoInline, videoUrl,
        toggleLike, playNext, addToQueue, removeFromQueue,
        createPlaylist, deletePlaylist, renamePlaylist, addToPlaylist, removeFromPlaylist,
        sleepTimerMinutes, sleepTimerRemaining, setSleepTimer,
        showLyrics, setShowLyrics,
        likedCount: derivedTracks.counts.likedCount,
        recentCount: derivedTracks.counts.recentCount,
        videoCount: derivedTracks.counts.videoCount,
        isOnline,
        downloadCloudTrack,
        applyCloudSnapshot,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};
