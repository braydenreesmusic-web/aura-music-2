/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { PlayerProvider, usePlayer } from './store/PlayerContext';
import { Sidebar } from './components/Sidebar';
import { MainContent } from './components/MainContent';
import { PlayerBar } from './components/PlayerBar';
import { Equalizer } from './components/Equalizer';
import { VideoPlayer } from './components/VideoPlayer';
import { ToastContainer } from './components/ToastContainer';
import { AuthModal } from './components/AuthModal';
import { accountSync, isUnauthorizedError, type AccountUser } from './services/accountSync';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { Upload, UserRound, Sparkles, Moon, Sun, Palette, CloudUpload, CloudDownload, LogOut, BarChart3 } from 'lucide-react';
import { audioPlayer } from './services/AudioPlayer';

const UI_SESSION_KEY = 'aura-ui-session-v1';
const THEME_MODE_KEY = 'aura-theme-mode-v1';
const DYNAMIC_ACCENT_KEY = 'aura-dynamic-accent-v1';
const LIBRARY_AMBIENT_KEY = 'aura-library-ambient-v1';
const ACCOUNT_MENU_TAB_KEY = 'aura-account-menu-tab-v1';

interface UiSessionState {
  showEq: boolean;
  showVideo: boolean;
  showQueue: boolean;
}

function MediaElementHost() {
  const { showVideoInline, videoUrl } = usePlayer();
  const hostRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Only host the element when video is NOT being shown inline
    // (PlayerBar or VideoPlayer will host it when video is active)
    if (!showVideoInline || !videoUrl) {
      if (audioPlayer.element.parentNode !== host) {
        host.appendChild(audioPlayer.element);
      }
      audioPlayer.element.style.display = 'none';
    }

    return () => {
      if (audioPlayer.element.parentNode === host) {
        host.removeChild(audioPlayer.element);
      }
    };
  }, [showVideoInline, videoUrl]);

  return <div ref={hostRef} aria-hidden="true" />;
}

function AppInner() {
  const [showEq, setShowEq] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [dynamicAccent, setDynamicAccent] = useState(true);
  const [libraryAmbientEnabled, setLibraryAmbientEnabled] = useState(true);
  const [accentRgb, setAccentRgb] = useState<[number, number, number]>([99, 102, 241]);
  const [videoAccentRgb, setVideoAccentRgb] = useState<[number, number, number]>([99, 102, 241]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<'account' | 'appearance'>('account');
  const [user, setUser] = useState<AccountUser | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const isOnline = useOnlineStatus();
  const { addFiles, videoUrl, currentTrack, tracks, albums, playlists, addToast, applyCloudSnapshot, setViewMode, showVideoInline } = usePlayer();

  React.useEffect(() => {
    const raw = localStorage.getItem(UI_SESSION_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as UiSessionState;
      setShowEq(Boolean(parsed.showEq));
      setShowVideo(Boolean(parsed.showVideo));
      setShowQueue(Boolean(parsed.showQueue));
    } catch {
      localStorage.removeItem(UI_SESSION_KEY);
    }
  }, []);

  React.useEffect(() => {
    const payload: UiSessionState = { showEq, showVideo, showQueue };
    localStorage.setItem(UI_SESSION_KEY, JSON.stringify(payload));
  }, [showEq, showVideo, showQueue]);

  React.useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_MODE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setThemeMode(savedTheme);
    }
    const savedDynamic = localStorage.getItem(DYNAMIC_ACCENT_KEY);
    if (savedDynamic === 'true' || savedDynamic === 'false') {
      setDynamicAccent(savedDynamic === 'true');
    }
    const savedLibraryAmbient = localStorage.getItem(LIBRARY_AMBIENT_KEY);
    if (savedLibraryAmbient === 'true' || savedLibraryAmbient === 'false') {
      setLibraryAmbientEnabled(savedLibraryAmbient === 'true');
    }
    const savedTab = localStorage.getItem(ACCOUNT_MENU_TAB_KEY);
    if (savedTab === 'appearance' || savedTab === 'account') {
      setMenuTab(savedTab);
    }
  }, []);

  React.useEffect(() => {
    if (!accountSync.getToken()) return;
    accountSync.me().then(setUser).catch((err) => {
      if (isUnauthorizedError(err)) {
        accountSync.clearToken();
        setUser(null);
      }
    });
  }, []);

  React.useEffect(() => {
    localStorage.setItem(THEME_MODE_KEY, themeMode);
  }, [themeMode]);

  React.useEffect(() => {
    localStorage.setItem(DYNAMIC_ACCENT_KEY, String(dynamicAccent));
  }, [dynamicAccent]);

  React.useEffect(() => {
    localStorage.setItem(LIBRARY_AMBIENT_KEY, String(libraryAmbientEnabled));
  }, [libraryAmbientEnabled]);

  React.useEffect(() => {
    localStorage.setItem(ACCOUNT_MENU_TAB_KEY, menuTab);
  }, [menuTab]);

  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = themeMode;
  }, [themeMode]);

  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--aura-accent-rgb', `${accentRgb[0]} ${accentRgb[1]} ${accentRgb[2]}`);
  }, [accentRgb]);

  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--aura-video-rgb', `${videoAccentRgb[0]} ${videoAccentRgb[1]} ${videoAccentRgb[2]}`);
  }, [videoAccentRgb]);

  React.useEffect(() => {
    if (!dynamicAccent) return;
    const coverUrl = currentTrack?.coverUrl;
    if (!coverUrl) return;

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';

    image.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = 64;
        canvas.height = 64;
        context.drawImage(image, 0, 0, 64, 64);

        const { data } = context.getImageData(0, 0, 64, 64);
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;

        for (let index = 0; index < data.length; index += 16) {
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;
          if (saturation < 0.2) continue;
          red += r;
          green += g;
          blue += b;
          count++;
        }

        if (count > 0) {
          setAccentRgb([
            Math.max(70, Math.min(220, Math.round(red / count))),
            Math.max(70, Math.min(220, Math.round(green / count))),
            Math.max(70, Math.min(220, Math.round(blue / count))),
          ]);
        }
      } catch {
        // Ignore extraction failures for tainted images
      }
    };

    image.src = coverUrl;
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.coverUrl, dynamicAccent]);

  React.useEffect(() => {
    if (!showVideoInline || !videoUrl) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    canvas.width = 48;
    canvas.height = 48;

    const timer = window.setInterval(() => {
      try {
        if (!audioPlayer.element.videoWidth || !audioPlayer.element.videoHeight) return;
        context.drawImage(audioPlayer.element, 0, 0, 48, 48);
        const { data } = context.getImageData(0, 0, 48, 48);
        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;

        for (let index = 0; index < data.length; index += 24) {
          red += data[index];
          green += data[index + 1];
          blue += data[index + 2];
          count++;
        }

        if (count > 0) {
          setVideoAccentRgb([
            Math.max(60, Math.min(225, Math.round(red / count))),
            Math.max(60, Math.min(225, Math.round(green / count))),
            Math.max(60, Math.min(225, Math.round(blue / count))),
          ]);
        }
      } catch {
        // Some frames may fail during seek/load
      }
    }, 1200);

    return () => window.clearInterval(timer);
  }, [showVideoInline, videoUrl]);

  const buildSnapshot = React.useCallback(() => {
    const settingsKeys = [
      'aura-volume',
      'aura-shuffle',
      'aura-repeat-mode',
      'aura-sort',
      'aura-session-v1',
      'aura-ui-session-v1',
      'aura-eq-gains',
      'aura-eq-preset',
      THEME_MODE_KEY,
      DYNAMIC_ACCENT_KEY,
      LIBRARY_AMBIENT_KEY,
    ];

    const settings = Object.fromEntries(settingsKeys.map((key) => [key, localStorage.getItem(key)]));
    const cloudTracks = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: t.duration,
      coverUrl: t.coverUrl,
      isVideo: t.isVideo,
      dateAdded: t.dateAdded,
      albumId: t.albumId,
      trackNumber: t.trackNumber,
      genre: t.genre,
      lyrics: t.lyrics,
      hasVideo: t.hasVideo,
      liked: t.liked,
      playCount: t.playCount,
      lastPlayed: t.lastPlayed,
    }));

    return {
      exportedAt: Date.now(),
      tracks: cloudTracks,
      albums,
      playlists,
      settings,
    };
  }, [tracks, albums, playlists]);

  const pushCloudSnapshot = async () => {
    if (!user) return;
    if (!isOnline) {
      addToast('Offline: cannot sync now', 'error');
      return;
    }
    setSyncing(true);
    try {
      await accountSync.pushSnapshot(buildSnapshot());
      addToast('Cloud sync complete', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const pullCloudSnapshot = async () => {
    if (!user) return;
    if (!isOnline) {
      addToast('Offline: cannot restore now', 'error');
      return;
    }
    setSyncing(true);
    try {
      const data = await accountSync.pullSnapshot();
      if (!data.payload) {
        addToast('No cloud backup found', 'info');
        return;
      }
      const result = await applyCloudSnapshot(data.payload);
      addToast(
        `Restored ${result.updatedTracks} tracks, ${result.importedAlbums} albums, ${result.importedPlaylists} playlists`,
        'success',
      );
      addToast('Reload to fully apply restored settings', 'info');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Restore failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const signOut = async () => {
    await accountSync.logout();
    setUser(null);
    addToast('Signed out', 'info');
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const items = e.dataTransfer.items;
    const files: File[] = [];

    const traverseEntry = async (entry: FileSystemEntry): Promise<void> => {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve) => (entry as FileSystemFileEntry).file(resolve));
        if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
          files.push(file);
        }
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const entries = await new Promise<FileSystemEntry[]>((resolve) => reader.readEntries(resolve));
        for (const child of entries) {
          await traverseEntry(child);
        }
      }
    };

    if (items) {
      const entries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
      for (const entry of entries) {
        await traverseEntry(entry);
      }
    }

    if (files.length === 0) {
      // Fallback for simple file drops
      const dt = e.dataTransfer.files;
      if (dt.length > 0) await addFiles(dt);
    } else {
      await addFiles(files);
    }
  }, [addFiles]);

  return (
    <div
      className="aura-shell flex flex-col h-screen w-full overflow-hidden font-sans"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="pointer-events-none fixed inset-0 aura-accent-wash" />
      <div className={`pointer-events-none fixed inset-0 aura-video-wash transition-opacity duration-500 ${showVideoInline && videoUrl ? 'opacity-100' : 'opacity-0'}`} />

      {/* Drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 bg-indigo-600/20 backdrop-blur-sm z-[100] flex items-center justify-center pointer-events-none">
          <div className="bg-zinc-900/90 border-2 border-dashed border-indigo-500 rounded-3xl p-16 flex flex-col items-center gap-4 shadow-2xl">
            <Upload size={64} className="text-indigo-400 animate-bounce" />
            <p className="text-2xl font-bold text-white">Drop files or folders here</p>
            <p className="text-zinc-400">Audio & video files will be added to your library</p>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative z-10">
        <MediaElementHost />
        <Sidebar onToggleQueue={() => setShowQueue(!showQueue)} showQueue={showQueue} />
        <MainContent libraryAmbientEnabled={libraryAmbientEnabled} />
        {showEq && <Equalizer onClose={() => setShowEq(false)} />}
        {showVideo && videoUrl && <VideoPlayer onClose={() => setShowVideo(false)} />}

        <div className="absolute top-4 right-4 z-[120]">
          <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/75 backdrop-blur-xl p-2 shadow-2xl min-w-[320px]">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => { setMenuOpen(true); setMenuTab('account'); }}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${menuTab === 'account' ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/40' : 'bg-zinc-800/70 text-zinc-300 hover:text-white'}`}
              >
                <UserRound size={13} />
                Account
              </button>
              <button
                onClick={() => { setMenuOpen(true); setMenuTab('appearance'); }}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${menuTab === 'appearance' ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/40' : 'bg-zinc-800/70 text-zinc-300 hover:text-white'}`}
              >
                <Sparkles size={13} />
                Appearance
              </button>
            </div>

            {menuOpen && menuTab === 'account' && (
              <div className="space-y-2 p-1">
                <div className="rounded-xl bg-zinc-800/70 border border-zinc-700/50 px-3 py-2 text-xs text-zinc-300 flex items-center justify-between">
                  <span className="truncate mr-2">{user ? user.email : 'Local mode (not signed in)'}</span>
                  <span className={isOnline ? 'text-emerald-400' : 'text-amber-400'}>{isOnline ? 'Online' : 'Offline'}</span>
                </div>

                {!user ? (
                  <button
                    onClick={() => setShowAuth(true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
                  >
                    <UserRound size={14} />
                    Sign in
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={pushCloudSnapshot}
                      disabled={syncing || !isOnline}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-50 text-xs"
                    >
                      <CloudUpload size={13} /> Save
                    </button>
                    <button
                      onClick={pullCloudSnapshot}
                      disabled={syncing || !isOnline}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-50 text-xs"
                    >
                      <CloudDownload size={13} /> Load
                    </button>
                    <button
                      onClick={() => { setViewMode('insights'); setMenuOpen(false); }}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs"
                    >
                      <BarChart3 size={13} /> Stats Page
                    </button>
                    <button
                      onClick={signOut}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-red-300 text-xs"
                    >
                      <LogOut size={13} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            )}

            {menuOpen && menuTab === 'appearance' && (
              <div className="space-y-2 p-1">
                <button
                  onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm"
                >
                  {themeMode === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                  {themeMode === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
                </button>
                <button
                  onClick={() => setDynamicAccent((prev) => !prev)}
                  className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm ${dynamicAccent ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/40' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'}`}
                >
                  <Palette size={14} />
                  Dynamic Accent {dynamicAccent ? 'On' : 'Off'}
                </button>
                <button
                  onClick={() => setLibraryAmbientEnabled((prev) => !prev)}
                  className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm ${libraryAmbientEnabled ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/40' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'}`}
                >
                  <Sparkles size={14} />
                  Library Ambient {libraryAmbientEnabled ? 'On' : 'Off'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="relative z-10">
        <PlayerBar
          onToggleEq={() => setShowEq(!showEq)}
          onToggleVideo={() => setShowVideo(!showVideo)}
          showEq={showEq}
        />
      </div>
      <ToastContainer />

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSignedIn={(nextUser) => {
            setUser(nextUser);
            setShowAuth(false);
            addToast(`Signed in as ${nextUser.email}`, 'success');
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <PlayerProvider>
      <AppInner />
    </PlayerProvider>
  );
}
