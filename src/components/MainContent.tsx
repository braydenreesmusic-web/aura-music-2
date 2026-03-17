import React, { useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePlayer } from '../store/PlayerContext';
import type { SortMode } from '../store/PlayerContext';
import { Play, Pause, Clock, Music, Sparkles, Search, ArrowUpDown, ChevronDown, Upload, Disc3, X, Tag, Heart, CloudDownload, CheckCircle } from 'lucide-react';
import { Visualizer } from './Visualizer';
import { NowPlayingBackdrop } from './NowPlayingBackdrop';
import { enrichMetadata } from '../services/metadataEnricher';
import { ArtistModal } from './ArtistModal';
import { AlbumBrowser } from './AlbumBrowser';
import { AlbumDetail } from './AlbumDetail';
import { AlbumEditor } from './AlbumEditor';
import { Discover } from './Discover';
import { MetadataEditor } from './MetadataEditor';
import { ContextMenu } from './ContextMenu';
import { InsightsPage } from './InsightsPage';
import type { Track } from '../db';
import { audioPlayer } from '../services/AudioPlayer';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'date', label: 'Date Added' },
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
  { value: 'duration', label: 'Duration' },
];

export const MainContent: React.FC<{ libraryAmbientEnabled?: boolean }> = ({ libraryAmbientEnabled = true }) => {
  const {
    tracks, currentTrack, isPlaying, playTrack, removeTrack, togglePlayPause, updateTrack,
    filteredTracks, searchQuery, setSearchQuery, sortMode, setSortMode, addFiles, isLoading, viewMode,
    playlists, selectedPlaylistId, toggleLike, removeFromPlaylist,
    showVideoInline, videoUrl,
    isOnline, downloadCloudTrack,
  } = usePlayer();

  const [showOfflineOnly, setShowOfflineOnly] = useState(false);

  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [artistModalName, setArtistModalName] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; track: Track } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listParentRef = useRef<HTMLDivElement>(null);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEnrich = async (e: React.MouseEvent, track: any) => {
    e.stopPropagation();
    setEnrichingId(track.id);
    try {
      const updates = await enrichMetadata(track);
      if (Object.keys(updates).length > 0) await updateTrack(track.id, updates);
    } catch {}
    setEnrichingId(null);
  };

  // Filter for offline-available tracks if toggled
  const displayedTracks = showOfflineOnly
    ? filteredTracks.filter((t) => !t.isCloudTrack || t.isDownloaded)
    : filteredTracks;

  const totalDuration = displayedTracks.reduce((acc, t) => acc + t.duration, 0);
  const formatTotalTime = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    if (hours > 0) return `${hours} hr ${mins} min`;
    return `${mins} min`;
  };

  const heading = viewMode === 'videos' ? 'Videos'
    : viewMode === 'favorites' ? 'Favorites'
    : viewMode === 'recently-played' ? 'Recently Played'
    : viewMode === 'playlist-detail'
      ? playlists.find((p) => p.id === selectedPlaylistId)?.name || 'Playlist'
      : 'Your Library';
  const isLibraryAmbientActive = Boolean(libraryAmbientEnabled && showVideoInline && videoUrl);

  const handleContextMenu = (e: React.MouseEvent, track: Track) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, track });
  };

  const rowVirtualizer = useVirtualizer({
    count: filteredTracks.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 62,
    overscan: 8,
  });

  // Route to specialized views (after hooks to keep hook ordering stable)
  if (viewMode === 'albums') {
    return (
      <RouteErrorBoundary viewName="Albums">
        <AlbumBrowser />
      </RouteErrorBoundary>
    );
  }
  if (viewMode === 'album-detail') {
    return (
      <RouteErrorBoundary viewName="Album Detail">
        <AlbumDetail />
      </RouteErrorBoundary>
    );
  }
  if (viewMode === 'album-edit') {
    return (
      <RouteErrorBoundary viewName="Album Editor">
        <AlbumEditor />
      </RouteErrorBoundary>
    );
  }
  if (viewMode === 'discover') {
    return (
      <RouteErrorBoundary viewName="Discover">
        <Discover />
      </RouteErrorBoundary>
    );
  }
  if (viewMode === 'insights') {
    return (
      <RouteErrorBoundary viewName="Insights">
        <InsightsPage />
      </RouteErrorBoundary>
    );
  }

  return (
    <div className={`maincontent-root flex-1 overflow-y-auto relative ${isLibraryAmbientActive ? 'bg-zinc-950/80' : 'bg-zinc-950'}`}>
      <LibraryVideoAmbient active={isLibraryAmbientActive} videoUrl={videoUrl} />
      {!isLibraryAmbientActive && <NowPlayingBackdrop coverUrl={currentTrack?.coverUrl} className="h-96" />}

      <div className="relative z-10 p-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-5xl font-extrabold text-white tracking-tight mb-1.5 drop-shadow-lg">{heading}</h1>
            <p className="text-zinc-400 text-sm">
              {filteredTracks.length} track{filteredTracks.length !== 1 ? 's' : ''}
              {filteredTracks.length > 0 && ` · ${formatTotalTime(totalDuration)}`}
            </p>
          </div>
          <div className="w-1/3 max-w-xs">
            <Visualizer />
          </div>
        </div>

        {/* Search, Sort, and Offline Filter bar */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search tracks, artists, albums..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
            >
              <ArrowUpDown size={14} />
              {SORT_OPTIONS.find((s) => s.value === sortMode)?.label}
              <ChevronDown size={14} />
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 py-1 min-w-[160px]">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortMode(opt.value); setShowSortMenu(false); }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        sortMode === opt.value ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {/* Offline filter toggle */}
          <button
            onClick={() => setShowOfflineOnly((v) => !v)}
            className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${showOfflineOnly ? 'bg-indigo-500/10 border-indigo-400 text-indigo-300' : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'}`}
            title="Show only offline-available tracks"
          >
            <CheckCircle size={14} className={showOfflineOnly ? 'text-emerald-400' : 'text-zinc-500'} />
            Offline Only
          </button>
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-indigo-300">Adding tracks to your library...</span>
          </div>
        )}

        {/* Empty state */}
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 text-zinc-500">
            <div className="w-24 h-24 rounded-2xl bg-zinc-900 flex items-center justify-center mb-6 border border-zinc-800">
              <Music size={40} className="opacity-40" />
            </div>
            <p className="text-xl font-semibold text-zinc-400 mb-2">No music yet</p>
            <p className="text-sm text-zinc-600 mb-6 text-center max-w-sm">
              Drag and drop files or folders here, or click below to add music from your computer.
            </p>
            <input type="file" multiple accept="audio/*,video/*" className="hidden" ref={fileInputRef} onChange={(e) => { if (e.target.files) addFiles(e.target.files); }} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-medium transition-colors"
            >
              <Upload size={18} />
              Choose Files
            </button>
          </div>
        ) : displayedTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
            <Search size={32} className="opacity-40 mb-3" />
            <p className="text-lg font-medium text-zinc-400">No matching tracks</p>
            <p className="text-sm text-zinc-600">Try a different search term</p>
          </div>
        ) : (
          <div className="w-full">
            {/* Column headers */}
            <div className="grid grid-cols-[40px_1fr_1fr_64px_80px] gap-4 px-4 py-2.5 border-b border-zinc-800/60 text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">
              <div className="text-center">#</div>
              <div>Title</div>
              <div>Album</div>
              <div className="flex items-center justify-end"><Clock size={13} /></div>
              <div></div>
            </div>

            {/* Track list */}
            <div ref={listParentRef} className="tracklist-scroll mt-1 max-h-[calc(100vh-20.5rem)] overflow-y-auto">
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                {rowVirtualizer.getVirtualItems()
                  .filter((virtualRow) => displayedTracks[virtualRow.index])
                  .map((virtualRow) => {
                    const track = displayedTracks[virtualRow.index];
                    if (!track) return null;
                    const index = virtualRow.index;
                    const isCurrent = currentTrack?.id === track.id;
                    const isHovered = hoveredTrack === track.id;

                    return (
                    <div
                      key={`${track.id}-${index}`}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      onMouseEnter={() => setHoveredTrack(track.id)}
                      onMouseLeave={() => setHoveredTrack(null)}
                      className={`track-row grid grid-cols-[40px_1fr_1fr_64px_80px] gap-4 px-4 py-2.5 rounded-lg items-center transition-all duration-150 group cursor-default ${
                        isCurrent
                          ? 'bg-indigo-500/10 border border-indigo-500/20'
                          : 'hover:bg-zinc-800/40 border border-transparent'
                      }`}
                      onDoubleClick={() => playTrack(track)}
                      onContextMenu={(e) => handleContextMenu(e, track)}
                    >
                    {/* Track number / play button */}
                    <div className="text-center text-zinc-500 flex items-center justify-center">
                      {isHovered || (isCurrent && isPlaying) ? (
                        <button
                          onClick={() => (isCurrent ? togglePlayPause() : playTrack(track))}
                          className="text-white hover:text-indigo-400 focus:outline-none transition-colors"
                        >
                          {isCurrent && isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                        </button>
                      ) : isCurrent ? (
                        <div className="flex items-end gap-[2px] h-3.5">
                          <div className="w-[3px] bg-indigo-500 rounded-full" style={{ height: '40%' }} />
                          <div className="w-[3px] bg-indigo-500 rounded-full" style={{ height: '70%' }} />
                          <div className="w-[3px] bg-indigo-500 rounded-full" style={{ height: '50%' }} />
                        </div>
                      ) : (
                        <span className="text-xs tabular-nums">{index + 1}</span>
                      )}
                    </div>

                    {/* Title + artist + offline/cloud status */}
                    <div className="flex items-center gap-3 overflow-hidden">
                      {track.coverUrl ? (
                        <img src={track.coverUrl} alt={track.album} className="w-10 h-10 rounded-md object-cover shadow-sm shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-zinc-800 flex items-center justify-center text-zinc-600 shadow-sm shrink-0">
                          <Disc3 size={18} className={isCurrent && isPlaying ? 'animate-spin-slow' : ''} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className={`flex items-center gap-1 text-sm font-medium truncate ${isCurrent ? 'text-indigo-400' : 'text-white'}`}>
                          {track.title}
                          {track.isDownloaded && (
                            <CheckCircle size={14} className="ml-1 text-emerald-400" title="Available offline" />
                          )}
                          {track.isCloudTrack && !track.isDownloaded && (
                            <CloudDownload size={14} className="ml-1 text-zinc-400" title="Cloud only" />
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (track.artist && track.artist !== 'Unknown Artist') setArtistModalName(track.artist); }}
                          className={`text-xs truncate text-left transition-colors ${
                            track.artist && track.artist !== 'Unknown Artist'
                              ? 'text-zinc-500 hover:text-indigo-400 hover:underline cursor-pointer'
                              : 'text-zinc-500 cursor-default'
                          }`}
                        >
                          {track.artist}
                        </button>
                      </div>
                    </div>

                    {/* Album */}
                    <div className="text-sm text-zinc-500 truncate">{track.album}</div>

                    {/* Duration */}
                    <div className="text-xs text-zinc-500 tabular-nums text-right">{formatTime(track.duration)}</div>

                    {/* Actions */}
                    <div className="track-actions flex items-center justify-end gap-1.5">
                      {track.isCloudTrack && !track.isDownloaded && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isOnline) return;
                            void downloadCloudTrack(track);
                          }}
                          disabled={!isOnline}
                          className="p-1.5 rounded-md text-zinc-600 hover:text-emerald-400 hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title={isOnline ? 'Download for offline' : 'Go online to download'}
                        >
                          <CloudDownload size={14} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLike(track.id); }}
                        className={`p-1.5 rounded-md transition-colors ${
                          track.liked ? 'text-pink-500' : 'text-zinc-600 hover:text-pink-400 hover:bg-zinc-800'
                        }`}
                        title={track.liked ? 'Unlike' : 'Like'}
                      >
                        <Heart size={14} fill={track.liked ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingTrack(track); }}
                        className="p-1.5 rounded-md text-zinc-600 hover:text-indigo-400 hover:bg-zinc-800 transition-colors"
                        title="Edit metadata"
                      >
                        <Tag size={14} />
                      </button>
                      <button
                        onClick={(e) => handleEnrich(e, track)}
                        className={`p-1.5 rounded-md transition-colors ${
                          enrichingId === track.id
                            ? 'text-indigo-400 animate-pulse'
                            : 'text-zinc-600 hover:text-indigo-400 hover:bg-zinc-800'
                        }`}
                        title="Enrich metadata with AI"
                        disabled={enrichingId === track.id}
                      >
                        <Sparkles size={14} />
                      </button>
                    </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Keyboard shortcut hint */}
        {tracks.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[10px] text-zinc-600 uppercase tracking-widest">
            <span><kbd className="px-1.5 py-0.5 bg-zinc-900 rounded text-zinc-500 border border-zinc-800 font-mono text-[9px]">Space</kbd> play/pause</span>
            <span><kbd className="px-1.5 py-0.5 bg-zinc-900 rounded text-zinc-500 border border-zinc-800 font-mono text-[9px]">←→</kbd> seek</span>
            <span><kbd className="px-1.5 py-0.5 bg-zinc-900 rounded text-zinc-500 border border-zinc-800 font-mono text-[9px]">Shift+←→</kbd> prev/next</span>
            <span><kbd className="px-1.5 py-0.5 bg-zinc-900 rounded text-zinc-500 border border-zinc-800 font-mono text-[9px]">↑↓</kbd> volume</span>
            <span><kbd className="px-1.5 py-0.5 bg-zinc-900 rounded text-zinc-500 border border-zinc-800 font-mono text-[9px]">M</kbd> mute</span>
            <span><kbd className="px-1.5 py-0.5 bg-zinc-900 rounded text-zinc-500 border border-zinc-800 font-mono text-[9px]">L</kbd> like</span>
            <span><kbd className="px-1.5 py-0.5 bg-zinc-900 rounded text-zinc-500 border border-zinc-800 font-mono text-[9px]">R</kbd> repeat</span>
            <span className="text-zinc-700">Right-click for more actions</span>
          </div>
        )}
      </div>

      {/* Artist info modal */}
      {artistModalName && (
        <ArtistModal artistName={artistModalName} onClose={() => setArtistModalName(null)} />
      )}

      {/* Metadata editor modal */}
      {editingTrack && (
        <MetadataEditor track={editingTrack} onClose={() => setEditingTrack(null)} />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          track={contextMenu.track}
          onClose={() => setContextMenu(null)}
          onEditMetadata={(track) => setEditingTrack(track)}
        />
      )}
    </div>
  );
};

type RouteErrorBoundaryProps = React.PropsWithChildren<{ viewName: string }>;
type RouteErrorBoundaryState = { hasError: boolean; message: string };

class RouteErrorBoundary extends React.Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  declare props: RouteErrorBoundaryProps;
  state: RouteErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  componentDidCatch(error: unknown) {
    console.error(`${this.props.viewName} route crashed:`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 bg-zinc-950 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-8">
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
              <h2 className="text-lg font-semibold text-red-300 mb-1">{this.props.viewName} crashed</h2>
              <p className="text-sm text-zinc-300">Try refreshing the app. Your library and player are still safe.</p>
              <p className="mt-2 text-xs text-red-200/80 font-mono break-all">{this.state.message}</p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const LibraryVideoAmbient: React.FC<{ active: boolean; videoUrl: string | null }> = ({ active, videoUrl }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!videoUrl) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      return;
    }

    if (video.src !== videoUrl) {
      video.src = videoUrl;
      video.load();
    }
  }, [videoUrl]);

  React.useEffect(() => {
    const ambient = videoRef.current;
    const source = audioPlayer.element;
    if (!ambient || !active || !videoUrl) {
      ambient?.pause();
      return;
    }

    const sync = () => {
      ambient.playbackRate = source.playbackRate || 1;
      const drift = Math.abs((ambient.currentTime || 0) - (source.currentTime || 0));
      if (drift > 0.35) {
        ambient.currentTime = source.currentTime || 0;
      }
      if (source.paused) {
        ambient.pause();
      } else {
        void ambient.play().catch(() => {
          // Ignore interruption errors
        });
      }
    };

    const events: Array<keyof HTMLMediaElementEventMap> = [
      'play',
      'pause',
      'timeupdate',
      'seeked',
      'seeking',
      'ratechange',
      'loadedmetadata',
    ];

    sync();
    const timer = window.setInterval(sync, 320);
    events.forEach((eventName) => source.addEventListener(eventName, sync));

    return () => {
      window.clearInterval(timer);
      events.forEach((eventName) => source.removeEventListener(eventName, sync));
      ambient.pause();
    };
  }, [active, videoUrl]);

  return (
    <div className={`pointer-events-none absolute inset-0 z-0 overflow-hidden transition-opacity duration-700 ${active ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true">
      <video ref={videoRef} className="aura-library-video-ambient" muted playsInline preload="auto" />
      <div className="aura-library-video-depth" />
      <div className="aura-library-video-mask" />
      <div className="aura-library-video-sheen" />
    </div>
  );
};
