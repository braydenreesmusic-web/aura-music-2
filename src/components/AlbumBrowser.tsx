import React, { useState } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { Album } from '../db';
import { Plus, Disc3, Play, MoreHorizontal, Trash2, Edit3, Music } from 'lucide-react';

export const AlbumBrowser: React.FC = () => {
  const { albums, tracks, playQueue, setViewMode, setSelectedAlbumId, addToast, removeAlbum } = usePlayer();
  const [contextMenu, setContextMenu] = useState<{ albumId: string; x: number; y: number } | null>(null);
  const safeAlbums = Array.isArray(albums) ? albums.filter(Boolean) : [];
  const safeTracks = Array.isArray(tracks) ? tracks.filter(Boolean) : [];

  const getAlbumTracks = (album: Album) =>
    safeTracks.filter((t) => t.albumId === album.id).sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));

  const handlePlayAlbum = (album: Album) => {
    const albumTracks = getAlbumTracks(album);
    if (albumTracks.length > 0) playQueue(albumTracks);
    else addToast('No downloaded tracks in this album', 'info');
  };

  const handleOpenAlbum = (album: Album) => {
    setSelectedAlbumId(album.id);
    setViewMode('album-detail');
  };

  const handleCreateAlbum = () => {
    setSelectedAlbumId('new');
    setViewMode('album-edit');
  };

  return (
    <div className="flex-1 bg-zinc-950 overflow-y-auto relative">
      <div className="absolute top-0 left-0 right-0 h-72 bg-gradient-to-b from-purple-950/30 via-purple-950/10 to-zinc-950 pointer-events-none" />
      <div className="relative p-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-5xl font-extrabold text-white tracking-tight mb-1.5 drop-shadow-lg">Albums</h1>
            <p className="text-zinc-400 text-sm">
              {safeAlbums.length} album{safeAlbums.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={handleCreateAlbum}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl font-medium transition-colors text-sm"
          >
            <Plus size={16} />
            Create Album
          </button>
        </div>

        {safeAlbums.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
            <div className="w-24 h-24 rounded-2xl bg-zinc-900 flex items-center justify-center mb-6 border border-zinc-800">
              <Disc3 size={40} className="opacity-40" />
            </div>
            <p className="text-xl font-semibold text-zinc-400 mb-2">No albums yet</p>
            <p className="text-sm text-zinc-600 mb-6 text-center max-w-sm">
              Create an album to organize your tracks, or import music with matching album tags.
            </p>
            <button
              onClick={handleCreateAlbum}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-medium transition-colors"
            >
              <Plus size={18} />
              Create Album
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {safeAlbums.map((album) => {
              const albumTracks = getAlbumTracks(album);
              const albumTitle = album.title || 'Untitled Album';
              const albumArtist = album.artist || 'Unknown Artist';
              return (
                <div
                  key={album.id || albumTitle}
                  className="group relative bg-zinc-900/50 hover:bg-zinc-800/60 rounded-xl p-3 transition-all cursor-pointer border border-transparent hover:border-zinc-700/50"
                  onClick={() => handleOpenAlbum(album)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ albumId: album.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  <div className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-zinc-800 shadow-lg">
                    {album.coverUrl ? (
                      <img src={album.coverUrl} alt={albumTitle} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-900/30 to-zinc-900">
                        <Music size={48} className="text-zinc-700" />
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePlayAlbum(album); }}
                      className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all hover:scale-110 hover:bg-indigo-500"
                    >
                      <Play size={18} fill="currentColor" className="ml-0.5" />
                    </button>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{albumTitle}</div>
                    <div className="text-xs text-zinc-500 truncate mt-0.5">
                      {albumArtist} · {albumTracks.length} track{albumTracks.length !== 1 ? 's' : ''}
                    </div>
                    {album.year && <div className="text-[10px] text-zinc-600 mt-0.5">{album.year}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-[201] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                setSelectedAlbumId(contextMenu.albumId);
                setViewMode('album-edit');
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <Edit3 size={14} />
              Edit Album
            </button>
            <button
              onClick={() => {
                const album = safeAlbums.find((a) => a.id === contextMenu.albumId);
                if (album) handlePlayAlbum(album);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <Play size={14} />
              Play Album
            </button>
            <button
              onClick={async () => {
                await removeAlbum(contextMenu.albumId);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-800 transition-colors"
            >
              <Trash2 size={14} />
              Delete Album
            </button>
          </div>
        </>
      )}
    </div>
  );
};
