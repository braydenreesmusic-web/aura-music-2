import React, { useState, useEffect, useRef } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { Play, ListPlus, SkipForward, Heart, Tag, Trash2, Plus } from 'lucide-react';
import type { Track } from '../db';

interface ContextMenuProps {
  x: number;
  y: number;
  track: Track;
  onClose: () => void;
  onEditMetadata: (track: Track) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, track, onClose, onEditMetadata }) => {
  const { playTrack, playNext, addToQueue, toggleLike, removeTrack, playlists, addToPlaylist, createPlaylist } = usePlayer();
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position if menu would overflow viewport
  const [adjustedPos, setAdjustedPos] = useState({ x, y });
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const newX = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 8 : x;
      const newY = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 8 : y;
      setAdjustedPos({ x: newX, y: newY });
    }
  }, [x, y]);

  useEffect(() => {
    const handleClick = () => onClose();
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('click', handleClick); window.removeEventListener('keydown', handleKey); };
  }, [onClose]);

  const handleCreateAndAdd = async () => {
    if (!newPlaylistName.trim()) return;
    const id = await createPlaylist(newPlaylistName.trim());
    await addToPlaylist(id, track.id);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl py-1.5 min-w-[200px] animate-slide-up"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
      onClick={e => e.stopPropagation()}
    >
      <button
        onClick={() => { playTrack(track); onClose(); }}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <Play size={14} />
        Play
      </button>
      <button
        onClick={() => { playNext(track); onClose(); }}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <SkipForward size={14} />
        Play Next
      </button>
      <button
        onClick={() => { addToQueue(track); onClose(); }}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <ListPlus size={14} />
        Add to Queue
      </button>

      <div className="h-px bg-zinc-800 my-1" />

      {/* Add to Playlist submenu */}
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setShowPlaylists(!showPlaylists); }}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <Plus size={14} />
          Add to Playlist
          <span className="ml-auto text-zinc-500">›</span>
        </button>
        {showPlaylists && (
          <div className="absolute left-full top-0 ml-1 bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl py-1.5 min-w-[180px]">
            {playlists.length > 0 ? (
              playlists.map(pl => (
                <button
                  key={pl.id}
                  onClick={() => { addToPlaylist(pl.id, track.id); onClose(); }}
                  className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors truncate"
                >
                  {pl.name}
                </button>
              ))
            ) : null}
            <div className="h-px bg-zinc-800 my-1" />
            <div className="px-3 py-1.5">
              <input
                autoFocus
                value={newPlaylistName}
                onChange={e => setNewPlaylistName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateAndAdd(); }}
                placeholder="New playlist..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
                onClick={e => e.stopPropagation()}
              />
            </div>
          </div>
        )}
      </div>

      <div className="h-px bg-zinc-800 my-1" />

      <button
        onClick={() => { toggleLike(track.id); onClose(); }}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <Heart size={14} fill={track.liked ? 'currentColor' : 'none'} className={track.liked ? 'text-pink-500' : ''} />
        {track.liked ? 'Unlike' : 'Like'}
      </button>
      <button
        onClick={() => { onEditMetadata(track); onClose(); }}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <Tag size={14} />
        Edit Metadata
      </button>

      <div className="h-px bg-zinc-800 my-1" />

      <button
        onClick={() => { removeTrack(track.id); onClose(); }}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-zinc-800 transition-colors"
      >
        <Trash2 size={14} />
        Remove
      </button>
    </div>
  );
};
