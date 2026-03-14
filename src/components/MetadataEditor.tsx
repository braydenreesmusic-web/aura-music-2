import React, { useState, useRef, useEffect } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { Track, updateTrack } from '../db';
import { X, Save, Upload, Music, Tag, User, Disc3, Hash, FileText, Image } from 'lucide-react';

interface MetadataEditorProps {
  track: Track;
  onClose: () => void;
}

export const MetadataEditor: React.FC<MetadataEditorProps> = ({ track, onClose }) => {
  const { refreshTracks, addToast } = usePlayer();
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album);
  const [genre, setGenre] = useState(track.genre || '');
  const [trackNumber, setTrackNumber] = useState<number | ''>(track.trackNumber || '');
  const [lyrics, setLyrics] = useState(track.lyrics || '');
  const [coverUrl, setCoverUrl] = useState(track.coverUrl || '');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCoverUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTrack(track.id, {
        title: title.trim() || track.title,
        artist: artist.trim() || track.artist,
        album: album.trim() || track.album,
        genre: genre.trim() || undefined,
        trackNumber: trackNumber || undefined,
        lyrics: lyrics.trim() || undefined,
        coverUrl: coverUrl || track.coverUrl,
      });
      await refreshTracks?.();
      addToast?.('Metadata saved', 'success');
      onClose();
    } catch (err) {
      console.error('Failed to save metadata:', err);
      addToast?.('Failed to save metadata', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Tag size={18} className="text-indigo-400" />
            Edit Metadata
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Cover Art section */}
          <div className="flex items-center gap-4">
            <div
              className="w-24 h-24 rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700/50 cursor-pointer hover:border-indigo-500/50 transition-colors relative group shrink-0"
              onClick={() => fileInputRef.current?.click()}
            >
              {coverUrl ? (
                <>
                  <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Upload size={16} className="text-white" />
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600">
                  <Music size={32} />
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-400 mb-1">Cover Art</p>
              <p className="text-xs text-zinc-600">Click to upload or paste an image URL</p>
              <input
                type="text"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://..."
                className="mt-2 w-full bg-zinc-800 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition"
              />
            </div>
          </div>

          {/* Fields */}
          <Field icon={<Music size={14} />} label="Title" value={title} onChange={setTitle} />
          <Field icon={<User size={14} />} label="Artist" value={artist} onChange={setArtist} />
          <Field icon={<Disc3 size={14} />} label="Album" value={album} onChange={setAlbum} />

          <div className="grid grid-cols-2 gap-3">
            <Field icon={<Tag size={14} />} label="Genre" value={genre} onChange={setGenre} placeholder="e.g. Rock, Hip-Hop" />
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                <Hash size={14} />
                Track #
              </label>
              <input
                type="number"
                value={trackNumber}
                onChange={(e) => setTrackNumber(e.target.value ? parseInt(e.target.value) : '')}
                placeholder="1"
                min="1"
                className="w-full bg-zinc-800 border border-zinc-700/50 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition"
              />
            </div>
          </div>

          {/* Lyrics */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
              <FileText size={14} />
              Lyrics
            </label>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Paste lyrics here..."
              rows={4}
              className="w-full bg-zinc-800 border border-zinc-700/50 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition resize-y"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800/60">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Save size={14} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Reusable field component
const Field: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ icon, label, value, onChange, placeholder }) => (
  <div>
    <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
      {icon}
      {label}
    </label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder || `Enter ${label.toLowerCase()}`}
      className="w-full bg-zinc-800 border border-zinc-700/50 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition"
    />
  </div>
);
