import React, { useState, useRef, useEffect } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { Album, Track, addAlbum, updateTrack } from '../db';
import { ArrowLeft, Upload, Image, Plus, GripVertical, X, Save, Search, Music } from 'lucide-react';

export const AlbumEditor: React.FC = () => {
  const {
    selectedAlbumId, albums, tracks, setViewMode, setSelectedAlbumId,
    refreshTracks, refreshAlbums, addToast,
  } = usePlayer();

  const existingAlbum = albums.find((a) => a.id === selectedAlbumId);

  const [title, setTitle] = useState(existingAlbum?.title || '');
  const [artist, setArtist] = useState(existingAlbum?.artist || '');
  const [year, setYear] = useState<number | ''>(existingAlbum?.year || '');
  const [genre, setGenre] = useState(existingAlbum?.genre || '');
  const [coverUrl, setCoverUrl] = useState(existingAlbum?.coverUrl || '');
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>(existingAlbum?.trackIds || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedTracks = selectedTrackIds
    .map((id) => tracks.find((t) => t.id === id))
    .filter(Boolean) as Track[];

  const availableTracks = tracks.filter(
    (t) => !selectedTrackIds.includes(t.id) &&
      (searchQuery === '' ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.artist.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCoverUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCoverFromUrl = async () => {
    const url = window.prompt('Enter cover image URL:');
    if (url) setCoverUrl(url);
  };

  const addTrack = (track: Track) => {
    setSelectedTrackIds((prev) => [...prev, track.id]);
  };

  const removeTrack = (trackId: string) => {
    setSelectedTrackIds((prev) => prev.filter((id) => id !== trackId));
  };

  const moveTrack = (from: number, to: number) => {
    setSelectedTrackIds((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      addToast?.('Album title is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const albumData: Album = {
        id: existingAlbum?.id || crypto.randomUUID(),
        title: title.trim(),
        artist: artist.trim(),
        coverUrl,
        year: year || undefined,
        genre: genre || undefined,
        trackIds: selectedTrackIds,
        dateCreated: existingAlbum?.dateCreated || Date.now(),
      };

      const albumId = await addAlbum(albumData);

      // Update tracks with album association and track numbers
      for (let i = 0; i < selectedTrackIds.length; i++) {
        const t = tracks.find((tr) => tr.id === selectedTrackIds[i]);
        if (t) {
          await updateTrack(t.id, {
            albumId: albumId,
            trackNumber: i + 1,
            album: title.trim(),
            artist: artist.trim() || t.artist,
          });
        }
      }

      // Un-associate tracks that were removed
      if (existingAlbum) {
        const removedIds = existingAlbum.trackIds.filter((id) => !selectedTrackIds.includes(id));
        for (const id of removedIds) {
          await updateTrack(id, { albumId: undefined, trackNumber: undefined });
        }
      }

      await refreshTracks?.();
      await refreshAlbums?.();
      addToast?.(`Album "${title}" saved`, 'success');
      setViewMode('albums');
    } catch (err) {
      console.error('Error saving album:', err);
      addToast?.('Failed to save album', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 bg-zinc-950 overflow-y-auto">
      <div className="p-8 max-w-3xl mx-auto">
        {/* Header */}
        <button
          onClick={() => existingAlbum ? setViewMode('album-detail') : setViewMode('albums')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-2xl font-bold text-white mb-8">
          {existingAlbum ? 'Edit Album' : 'Create Album'}
        </h1>

        <div className="grid grid-cols-[200px_1fr] gap-8 mb-10">
          {/* Cover art */}
          <div>
            <div
              className="w-48 h-48 rounded-xl overflow-hidden bg-zinc-800 border-2 border-dashed border-zinc-700 hover:border-indigo-500/50 cursor-pointer transition-colors relative group"
              onClick={() => fileInputRef.current?.click()}
            >
              {coverUrl ? (
                <>
                  <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Upload size={24} className="text-white" />
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-2">
                  <Image size={32} />
                  <span className="text-xs">Upload Cover</span>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
            <button
              onClick={handleCoverFromUrl}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Or paste image URL
            </button>
          </div>

          {/* Metadata fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                Album Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter album title"
                className="w-full bg-zinc-800 border border-zinc-700/50 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                Artist
              </label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Enter artist name"
                className="w-full bg-zinc-800 border border-zinc-700/50 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                  Year
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : '')}
                  placeholder="2024"
                  min="1900"
                  max="2099"
                  className="w-full bg-zinc-800 border border-zinc-700/50 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                  Genre
                </label>
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="e.g. Hip-Hop, Rock"
                  className="w-full bg-zinc-800 border border-zinc-700/50 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Track selection */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Music size={18} />
            Tracks ({selectedTracks.length})
          </h2>

          {/* Selected tracks list */}
          {selectedTracks.length > 0 && (
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-3 mb-4 space-y-1">
              {selectedTracks.map((track, idx) => (
                <div
                  key={track.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-800/40 hover:bg-zinc-800/60 group transition-colors"
                >
                  <GripVertical size={14} className="text-zinc-600 cursor-grab" />
                  <span className="w-6 text-xs text-zinc-500 text-center tabular-nums">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{track.title}</p>
                    <p className="text-xs text-zinc-500 truncate">{track.artist}</p>
                  </div>
                  {/* Simple reorder buttons */}
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {idx > 0 && (
                      <button
                        onClick={() => moveTrack(idx, idx - 1)}
                        className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-700 text-xs"
                      >
                        ↑
                      </button>
                    )}
                    {idx < selectedTracks.length - 1 && (
                      <button
                        onClick={() => moveTrack(idx, idx + 1)}
                        className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-700 text-xs"
                      >
                        ↓
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => removeTrack(track.id)}
                    className="p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add tracks */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search your library to add tracks..."
                  className="w-full bg-zinc-800 border border-zinc-700/50 rounded-lg pl-9 pr-3.5 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition"
                />
              </div>
            </div>

            {(searchQuery || availableTracks.length < tracks.length) && (
              <div className="max-h-48 overflow-y-auto bg-zinc-900/50 border border-zinc-800/50 rounded-xl">
                {availableTracks.slice(0, 50).map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/40 transition-colors cursor-pointer border-b border-zinc-800/30 last:border-0"
                    onClick={() => addTrack(track)}
                  >
                    <Plus size={14} className="text-indigo-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{track.title}</p>
                      <p className="text-xs text-zinc-500 truncate">{track.artist}</p>
                    </div>
                    <span className="text-xs text-zinc-600 shrink-0">
                      {Math.floor(track.duration / 60)}:{Math.floor(track.duration % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                ))}
                {availableTracks.length === 0 && (
                  <p className="text-sm text-zinc-600 px-4 py-6 text-center">No matching tracks</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3 pt-4 border-t border-zinc-800/50">
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors"
          >
            <Save size={16} />
            {saving ? 'Saving...' : existingAlbum ? 'Save Changes' : 'Create Album'}
          </button>
          <button
            onClick={() => existingAlbum ? setViewMode('album-detail') : setViewMode('albums')}
            className="px-4 py-2.5 text-zinc-400 hover:text-white transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
