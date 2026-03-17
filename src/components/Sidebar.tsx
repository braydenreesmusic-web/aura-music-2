import React, { useRef, useState } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { Music, Video, PlusCircle, Library, ListMusic, Download, FolderOpen, Disc3, Play, Pause, X, Compass, Heart, Clock, Plus, Trash2, Pencil } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export const Sidebar: React.FC<{
  onToggleQueue: () => void;
  showQueue: boolean;
}> = ({ onToggleQueue, showQueue }) => {
  const {
    addFiles, currentTrack, isPlaying, togglePlayPause, queue, playTrack, viewMode, setViewMode,
    tracks, albums, playlists, createPlaylist, deletePlaylist, renamePlaylist,
    setSelectedPlaylistId, playQueue, removeFromQueue,
    likedCount, recentCount, videoCount,
  } = usePlayer();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { isInstallable, promptInstall } = useInstallPrompt();
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleAddMusic = () => fileInputRef.current?.click();
  const handleAddFolder = () => folderInputRef.current?.click();
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await addFiles(e.target.files);
    e.target.value = '';
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    await createPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
    setShowNewPlaylist(false);
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await renamePlaylist(id, editName.trim());
    setEditingPlaylistId(null);
    setEditName('');
  };

  return (
    <div className="w-72 bg-zinc-900/80 backdrop-blur-sm h-full flex flex-col border-r border-zinc-800/50 sidebar-desktop">
      {/* Logo */}
      <div className="p-6 pb-4">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Music size={18} className="text-white" />
          </div>
          reesr
        </h1>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 space-y-5">
        <div>
          <h2 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-2 px-3">Library</h2>
          <ul className="space-y-0.5">
            <li>
              <button
                onClick={() => setViewMode('all')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                  viewMode === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <Library size={18} />
                All Tracks
                <span className="ml-auto text-xs text-zinc-500 tabular-nums">{tracks.length}</span>
              </button>
            </li>
            {likedCount > 0 && (
              <li>
                <button
                  onClick={() => setViewMode('favorites')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                    viewMode === 'favorites' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <Heart size={18} className={viewMode === 'favorites' ? 'text-pink-500' : ''} />
                  Favorites
                  <span className="ml-auto text-xs text-zinc-500 tabular-nums">{likedCount}</span>
                </button>
              </li>
            )}
            {recentCount > 0 && (
              <li>
                <button
                  onClick={() => setViewMode('recently-played')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                    viewMode === 'recently-played' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <Clock size={18} />
                  Recently Played
                </button>
              </li>
            )}
            {videoCount > 0 && (
              <li>
                <button
                  onClick={() => setViewMode('videos')}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                    viewMode === 'videos' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <Video size={18} />
                  Videos
                  <span className="ml-auto text-xs text-zinc-500 tabular-nums">{videoCount}</span>
                </button>
              </li>
            )}
            <li>
              <button
                onClick={() => setViewMode('albums')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                  viewMode === 'albums' || viewMode === 'album-detail' || viewMode === 'album-edit'
                    ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <Disc3 size={18} />
                Albums
                <span className="ml-auto text-xs text-zinc-500 tabular-nums">{albums.length}</span>
              </button>
            </li>
            <li>
              <button
                onClick={() => setViewMode('discover')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                  viewMode === 'discover' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <Compass size={18} />
                Discover
              </button>
            </li>
          </ul>
        </div>

        {/* Playlists */}
        <div>
          <div className="flex items-center justify-between mb-2 px-3">
            <h2 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Playlists</h2>
            <button
              onClick={() => setShowNewPlaylist(true)}
              className="text-zinc-500 hover:text-white transition-colors"
              title="New playlist"
            >
              <Plus size={14} />
            </button>
          </div>
          {showNewPlaylist && (
            <div className="flex items-center gap-1.5 px-3 mb-2">
              <input
                autoFocus
                value={newPlaylistName}
                onChange={e => setNewPlaylistName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreatePlaylist(); if (e.key === 'Escape') setShowNewPlaylist(false); }}
                placeholder="Playlist name..."
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
              />
              <button onClick={handleCreatePlaylist} className="text-indigo-400 hover:text-indigo-300 p-1"><PlusCircle size={14} /></button>
              <button onClick={() => setShowNewPlaylist(false)} className="text-zinc-500 hover:text-zinc-300 p-1"><X size={14} /></button>
            </div>
          )}
          <ul className="space-y-0.5">
            {playlists.map(pl => (
              <li key={pl.id} className="relative group">
                {editingPlaylistId === pl.id ? (
                  <div className="flex items-center gap-1.5 px-3 py-1">
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(pl.id); if (e.key === 'Escape') setEditingPlaylistId(null); }}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                    />
                    <button onClick={() => handleRename(pl.id)} className="text-indigo-400 text-xs">Save</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setSelectedPlaylistId(pl.id); setViewMode('playlist-detail'); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                      viewMode === 'playlist-detail' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                    }`}
                  >
                    <ListMusic size={18} />
                    <span className="truncate flex-1 text-left">{pl.name}</span>
                    <span className="text-xs text-zinc-500 tabular-nums">{pl.trackIds.length}</span>
                  </button>
                )}
                {/* Context actions */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex gap-0.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingPlaylistId(pl.id); setEditName(pl.name); }}
                    className="p-1 text-zinc-500 hover:text-white rounded"
                    title="Rename"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePlaylist(pl.id); }}
                    className="p-1 text-zinc-500 hover:text-red-400 rounded"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Queue section */}
        <div>
          <h2 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-2 px-3">Queue</h2>
          <button
            onClick={onToggleQueue}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
              showQueue ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            <ListMusic size={18} />
            Up Next
            <span className="ml-auto text-xs text-zinc-500 tabular-nums">{queue.length}</span>
          </button>

          {showQueue && queue.length > 0 && (
            <div className="mt-2 max-h-64 overflow-y-auto space-y-0.5 px-1">
              {queue.slice(0, 50).map((track, i) => {
                const isCurrent = currentTrack?.id === track.id;
                return (
                  <div
                    key={`${track.id}-${i}`}
                    className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors group/q ${
                      isCurrent ? 'bg-indigo-600/20 text-indigo-300' : 'hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <button onClick={() => playTrack(track)} className="flex items-center gap-2.5 flex-1 min-w-0">
                      {track.coverUrl ? (
                        <img src={track.coverUrl} className="w-8 h-8 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center shrink-0">
                          <Disc3 size={14} className={isCurrent && isPlaying ? 'animate-spin-slow text-indigo-400' : 'text-zinc-600'} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs font-medium truncate ${isCurrent ? 'text-indigo-300' : 'text-zinc-300'}`}>{track.title}</div>
                        <div className="text-[10px] text-zinc-500 truncate">{track.artist}</div>
                      </div>
                    </button>
                    {isCurrent && isPlaying ? (
                      <div className="shrink-0 flex items-end gap-[2px] h-3">
                        <div className="w-[2px] bg-indigo-400 rounded-full animate-bounce" style={{ height: '60%', animationDelay: '0ms' }} />
                        <div className="w-[2px] bg-indigo-400 rounded-full animate-bounce" style={{ height: '100%', animationDelay: '150ms' }} />
                        <div className="w-[2px] bg-indigo-400 rounded-full animate-bounce" style={{ height: '40%', animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      <button
                        onClick={() => removeFromQueue(i)}
                        className="shrink-0 opacity-0 group-hover/q:opacity-100 text-zinc-500 hover:text-red-400 p-0.5"
                        title="Remove from queue"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Now Playing mini card */}
        {currentTrack && (
          <div className="mx-1">
            <h2 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-2 px-2">Now Playing</h2>
            <div className="bg-zinc-800/60 rounded-xl p-3 space-y-3">
              <div className="aspect-square w-full rounded-lg overflow-hidden bg-zinc-900 shadow-lg">
                {currentTrack.coverUrl ? (
                  <img src={currentTrack.coverUrl} alt={currentTrack.album} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-900/30 to-zinc-900">
                    <Disc3 size={64} className={`text-zinc-700 ${isPlaying ? 'animate-spin-slow' : ''}`} />
                  </div>
                )}
              </div>
              <div className="space-y-0.5 px-0.5">
                <div className="text-sm font-semibold text-white truncate">{currentTrack.title}</div>
                <div className="text-xs text-zinc-400 truncate">{currentTrack.artist}</div>
                {currentTrack.playCount ? (
                  <div className="text-[10px] text-zinc-600">{currentTrack.playCount} play{currentTrack.playCount !== 1 ? 's' : ''}</div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="p-3 border-t border-zinc-800/50 space-y-2">
        {isInstallable && (
          <button
            onClick={promptInstall}
            className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white py-2.5 px-4 rounded-xl font-medium transition-colors border border-zinc-700/50 text-sm"
          >
            <Download size={16} />
            Install App
          </button>
        )}
        <input type="file" multiple accept="audio/*,video/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
        <input
          type="file"
          multiple
          accept="audio/*,video/*"
          className="hidden"
          ref={folderInputRef}
          onChange={handleFileChange}
          {...({ webkitdirectory: '', directory: '' } as any)}
        />
        <div className="flex gap-2">
          <button
            onClick={handleAddMusic}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 px-3 rounded-xl font-medium transition-colors text-sm"
          >
            <PlusCircle size={16} />
            Add Files
          </button>
          <button
            onClick={handleAddFolder}
            className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white py-2.5 px-3 rounded-xl font-medium transition-colors border border-zinc-700/50 text-sm"
            title="Add Folder"
          >
            <FolderOpen size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
