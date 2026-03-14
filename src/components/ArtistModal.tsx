import React, { useState, useEffect, useMemo } from 'react';
import { X, MapPin, Calendar, Disc, Tag, Loader2, User } from 'lucide-react';
import { fetchArtistInfo, ArtistInfo } from '../services/artistInfo';
import { usePlayer } from '../store/PlayerContext';

interface ArtistModalProps {
  artistName: string;
  onClose: () => void;
}

export const ArtistModal: React.FC<ArtistModalProps> = ({ artistName, onClose }) => {
  const { tracks } = usePlayer();
  const [info, setInfo] = useState<ArtistInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const artistTracks = useMemo(
    () => tracks.filter((track) => track.artist.trim().toLowerCase() === artistName.trim().toLowerCase()),
    [artistName, tracks],
  );

  const fallbackImageUrl = useMemo(
    () => artistTracks.find((track) => track.coverUrl)?.coverUrl,
    [artistTracks],
  );

  const localNotableWorks = useMemo(() => {
    const albums = artistTracks
      .map((track) => track.album)
      .filter((album) => album && album !== 'Unknown Album');
    const titles = artistTracks.map((track) => track.title).filter(Boolean);
    return [...new Set([...albums, ...titles])].slice(0, 5);
  }, [artistTracks]);

  const notableWorks = localNotableWorks.length > 0 ? localNotableWorks : (info?.notableWorks || []);
  const displayImageUrl = info?.imageUrl || fallbackImageUrl;
  const infoCards = [
    info?.origin ? { label: 'Origin', value: info.origin, icon: MapPin } : null,
    info?.activeYears ? { label: 'Active', value: info.activeYears, icon: Calendar } : null,
    artistTracks.length > 0 ? { label: 'Tracks', value: String(artistTracks.length), icon: Disc } : null,
    artistTracks.length > 0
      ? {
          label: 'Albums',
          value: String(new Set(artistTracks.map((track) => track.album).filter((album) => album && album !== 'Unknown Album')).size),
          icon: Tag,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; icon: typeof MapPin }>;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchArtistInfo(artistName)
      .then((data) => {
        if (cancelled) return;
        if (data) setInfo(data);
        else setError('No info available for this artist.');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load artist info.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [artistName]);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[88vh] overflow-hidden animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header gradient */}
        <div className="h-36 bg-gradient-to-br from-indigo-600/40 via-purple-600/30 to-zinc-900 relative shrink-0">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/30 text-white/70 hover:text-white hover:bg-black/50 transition-colors backdrop-blur-sm"
          >
            <X size={16} />
          </button>
          <div className="absolute -bottom-10 left-6">
            {displayImageUrl ? (
              <img
                src={displayImageUrl}
                alt={artistName}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-zinc-900 shadow-xl bg-zinc-800"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-zinc-800 border-2 border-zinc-900 flex items-center justify-center shadow-xl">
                <User size={32} className="text-indigo-400" />
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pt-14 pb-6 overflow-y-auto min-h-0">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">{artistName}</h2>
              <p className="text-sm text-zinc-500">
                {artistTracks.length > 0
                  ? `${artistTracks.length} track${artistTracks.length !== 1 ? 's' : ''} in your library`
                  : 'Artist profile'}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="text-indigo-400 animate-spin" />
              <span className="ml-3 text-sm text-zinc-400">Looking up artist...</span>
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-zinc-500">{error}</p>
            </div>
          ) : info ? (
            <div className="space-y-6 mt-3">
              {displayImageUrl && (
                <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60">
                  <img src={displayImageUrl} alt={artistName} className="w-full h-64 object-cover" />
                </div>
              )}

              {infoCards.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {infoCards.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-800/60">
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-widest mb-1">
                        <Icon size={10} />
                        {label}
                      </div>
                      <p className="text-sm text-zinc-200 font-medium break-words">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
                  <User size={10} />
                  Biography
                </div>
                <div className="bg-zinc-950/60 border border-zinc-800/60 rounded-2xl p-4">
                  <p className="text-sm text-zinc-300 leading-7 whitespace-pre-line">{info.bio}</p>
                </div>
              </div>

              {info.genres.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
                    <Tag size={10} />
                    Genres
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {info.genres.map((genre) => (
                      <span
                        key={genre}
                        className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-lg text-xs font-medium"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notable works */}
              {notableWorks.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
                    <Disc size={10} />
                    {localNotableWorks.length > 0 ? 'In Your Library' : 'Notable Works'}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {notableWorks.map((work, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-zinc-300 bg-zinc-800/40 border border-zinc-800/40 rounded-xl px-3 py-2">
                        <span className="text-indigo-500/60 text-xs">●</span>
                        {work}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
