import React, { useState, useEffect } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { Album, Track } from '../db';
import { ArrowLeft, Play, Pause, Clock, Disc3, Music, Download, Edit3, Plus } from 'lucide-react';

const MB_BASE = 'https://musicbrainz.org/ws/2';
const UA = 'reesr/1.0.0 (local-music-player)';

interface MBTrack {
  title: string;
  position: number;
  length: number | null;
  id: string;
}

export const AlbumDetail: React.FC = () => {
  const {
    selectedAlbumId, albums, tracks, currentTrack, isPlaying,
    playTrack, playQueue, togglePlayPause, setViewMode, setSelectedAlbumId, addToast,
  } = usePlayer();

  const safeAlbums = Array.isArray(albums) ? albums.filter(Boolean) : [];
  const safeTracks = Array.isArray(tracks) ? tracks.filter(Boolean) : [];

  const album = safeAlbums.find((a) => a.id === selectedAlbumId);
  const albumTracks = safeTracks
    .filter((t) => t.albumId === album?.id)
    .sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0));

  const [mbTracks, setMbTracks] = useState<MBTrack[]>([]);
  const [loadingMb, setLoadingMb] = useState(false);

  useEffect(() => {
    if (!album) return;
    fetchAlbumTracklist(album.title, album.artist);
  }, [album?.id]);

  const fetchAlbumTracklist = async (albumTitle: string, artist: string) => {
    setLoadingMb(true);
    try {
      const searchRes = await fetch(
        `${MB_BASE}/release/?query=release:${encodeURIComponent(albumTitle)}+artist:${encodeURIComponent(artist)}&limit=1&fmt=json`,
        { headers: { 'User-Agent': UA, Accept: 'application/json' } }
      );
      if (!searchRes.ok) return;
      const searchData = await searchRes.json();
      const release = searchData.releases?.[0];
      if (!release) return;

      const detailRes = await fetch(
        `${MB_BASE}/release/${release.id}?inc=recordings&fmt=json`,
        { headers: { 'User-Agent': UA, Accept: 'application/json' } }
      );
      if (!detailRes.ok) return;
      const detailData = await detailRes.json();
      const media = detailData.media?.[0];
      if (!media?.tracks) return;

      setMbTracks(
        media.tracks.map((t: any) => ({
          title: t.title,
          position: t.position,
          length: t.length,
          id: t.recording?.id || t.id,
        }))
      );
    } catch {
      // Silently fail — MusicBrainz lookup is optional
    } finally {
      setLoadingMb(false);
    }
  };

  const formatTime = (ms: number | null) => {
    if (!ms) return '--:--';
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    if (isNaN(seconds) || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!album) {
    return (
      <div className="flex-1 bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">Album not found</p>
      </div>
    );
  }

  const totalDuration = albumTracks.reduce((acc, t) => acc + (Number(t.duration) || 0), 0);
  const isAlbumPlaying = albumTracks.some((t) => t.id === currentTrack?.id) && isPlaying;
  const safeLower = (value: unknown) => String(value || '').toLowerCase();

  // Merge local tracks with MusicBrainz tracklist
  const mergedTracks = mbTracks.length > 0
    ? mbTracks.map((mbt) => {
        const localTrack = albumTracks.find(
          (t) => safeLower(t.title).includes(safeLower(mbt.title)) || safeLower(mbt.title).includes(safeLower(t.title))
        );
        return { mb: mbt, local: localTrack || null };
      })
    : albumTracks.map((t, i) => ({ mb: null, local: t as Track | null, position: i + 1 }));

  return (
    <div className="flex-1 bg-zinc-950 overflow-y-auto relative">
      <div className="absolute top-0 left-0 right-0 h-80 bg-gradient-to-b from-indigo-950/40 via-purple-950/20 to-zinc-950 pointer-events-none" />
      <div className="relative p-8">
        {/* Back button */}
        <button
          onClick={() => setViewMode('albums')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Albums
        </button>

        {/* Album header */}
        <div className="flex items-end gap-6 mb-8">
          <div className="w-48 h-48 rounded-xl overflow-hidden bg-zinc-800 shadow-2xl shrink-0">
            {album.coverUrl ? (
              <img src={album.coverUrl} alt={album.title || 'Album cover'} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-900/30 to-zinc-900">
                <Music size={64} className="text-zinc-700" />
              </div>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Album</p>
            <h1 className="text-4xl font-extrabold text-white mb-2">{album.title || 'Untitled Album'}</h1>
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="font-medium text-white">{album.artist || 'Unknown Artist'}</span>
              {album.year && <><span>·</span><span>{album.year}</span></>}
              <span>·</span>
              <span>{albumTracks.length} track{albumTracks.length !== 1 ? 's' : ''}</span>
              {totalDuration > 0 && (
                <>
                  <span>·</span>
                  <span>{Math.floor(totalDuration / 60)} min</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => albumTracks.length > 0 ? playQueue(albumTracks) : null}
            className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-all hover:scale-105 shadow-lg"
          >
            {isAlbumPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-0.5" />}
          </button>
          <button
            onClick={() => { setSelectedAlbumId(album.id); setViewMode('album-edit'); }}
            className="p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors border border-zinc-700/50"
            title="Edit Album"
          >
            <Edit3 size={16} />
          </button>
        </div>

        {/* Tracklist */}
        <div className="w-full">
          <div className="grid grid-cols-[40px_1fr_80px_60px] gap-4 px-4 py-2.5 border-b border-zinc-800/60 text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">
            <div className="text-center">#</div>
            <div>Title</div>
            <div className="text-right">Status</div>
            <div className="flex items-center justify-end"><Clock size={13} /></div>
          </div>

          <div className="mt-1">
            {mergedTracks.map((item, index) => {
              const position = item.mb?.position || (item as any).position || index + 1;
              const title = item.mb?.title || item.local?.title || 'Unknown';
              const isLocal = !!item.local;
              const isCurrent = item.local && currentTrack?.id === item.local.id;
              const duration = item.local ? formatDuration(item.local.duration) : formatTime(item.mb?.length || null);

              return (
                <div
                  key={item.mb?.id || item.local?.id || index}
                  className={`grid grid-cols-[40px_1fr_80px_60px] gap-4 px-4 py-3 rounded-lg items-center transition-all cursor-pointer group ${
                    isCurrent
                      ? 'bg-indigo-500/10 border border-indigo-500/20'
                      : isLocal
                        ? 'hover:bg-zinc-800/40 border border-transparent'
                        : 'hover:bg-zinc-800/20 border border-transparent opacity-60'
                  }`}
                  onDoubleClick={() => item.local && playTrack(item.local)}
                >
                  <div className="text-center text-zinc-500 flex items-center justify-center">
                    {isCurrent && isPlaying ? (
                      <div className="flex items-end gap-[2px] h-3.5">
                        <div className="w-[3px] bg-indigo-500 rounded-full animate-bounce" style={{ height: '40%', animationDelay: '0ms' }} />
                        <div className="w-[3px] bg-indigo-500 rounded-full animate-bounce" style={{ height: '70%', animationDelay: '150ms' }} />
                        <div className="w-[3px] bg-indigo-500 rounded-full animate-bounce" style={{ height: '50%', animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      <span className="text-xs tabular-nums">{position}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className={`text-sm font-medium truncate ${isCurrent ? 'text-indigo-400' : isLocal ? 'text-white' : 'text-zinc-400'}`}>
                      {title}
                    </div>
                    {item.local && (
                      <div className="text-xs text-zinc-500 truncate">{item.local.artist}</div>
                    )}
                  </div>
                  <div className="text-right">
                    {isLocal ? (
                      <span className="text-[10px] uppercase tracking-wider text-emerald-500/80 bg-emerald-500/10 px-2 py-0.5 rounded-md font-medium">
                        Downloaded
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-zinc-600 bg-zinc-800/60 px-2 py-0.5 rounded-md font-medium">
                        Not Downloaded
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 tabular-nums text-right">{duration}</div>
                </div>
              );
            })}
          </div>
        </div>

        {loadingMb && (
          <div className="mt-4 flex items-center gap-2 text-zinc-500 text-sm">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            Loading full tracklist from MusicBrainz...
          </div>
        )}
      </div>
    </div>
  );
};
