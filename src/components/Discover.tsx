import React, { useMemo, useState, useRef, useEffect } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { Search, Download, Loader2, CheckCircle2, XCircle, TrendingUp, Clock, Eye, Film, Music, Sparkles, Radio, ArrowRight, WifiOff, ServerCrash, Video, BookmarkPlus, Bookmark, PlayCircle } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { API_BASE, apiUrl } from '../utils/api';

const SAVED_SEARCHES_KEY = 'aura-discover-saved-searches-v1';

const TRENDING_TABS: Array<{ label: string; query: string }> = [
  { label: 'Global Hits', query: 'top hits 2026' },
  { label: 'Chill', query: 'chill lofi mix' },
  { label: 'Workout', query: 'workout music mix' },
  { label: 'Throwbacks', query: '2000s throwback songs' },
  { label: 'Indie', query: 'indie discoveries' },
];

interface SearchResult {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
  viewCount: string;
  publishedText: string;
  url: string;
}

interface DownloadProgress {
  videoId: string;
  type: 'audio' | 'both';
  progress: number;
  phase?: 'audio' | 'video' | 'metadata';
  status: 'downloading' | 'done' | 'error';
  filename?: string;
  error?: string;
}

const DiscoverContent: React.FC = () => {
  const { importDownloadedFile, importBothFiles, addToast, tracks } = usePlayer();
  const isOnline = useOnlineStatus();
  const libraryTracks = Array.isArray(tracks) ? tracks : [];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloads, setDownloads] = useState<Map<string, DownloadProgress>>(new Map());
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<string[]>([]);
  const [activeTrend, setActiveTrend] = useState<string | null>(null);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [serverReachable, setServerReachable] = useState(false);
  const [checkingServer, setCheckingServer] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const artistCounts = new Map<string, number>();
    for (const track of libraryTracks) {
      const a = track.artist || '';
      if (a && a !== 'Unknown Artist') {
        artistCounts.set(a, (artistCounts.get(a) || 0) + 1);
      }
    }
    const sorted = [...artistCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topArtists = sorted.slice(0, 8).map(([name]) => name);
    const suggestionQueries = topArtists.map((a) => `${a} new music`);
    setSuggestions(suggestionQueries.length > 0 ? suggestionQueries : [
      'top hits 2026',
      'new music',
      'chill vibes',
      'focus electronic',
      'late night jazz',
      'workout music',
    ]);
  }, [libraryTracks]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_SEARCHES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSavedSearches(parsed.filter((q): q is string => typeof q === 'string').slice(0, 12));
      }
    } catch {
      localStorage.removeItem(SAVED_SEARCHES_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(savedSearches.slice(0, 12)));
  }, [savedSearches]);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      if (!isOnline) {
        setServerReachable(false);
        return;
      }
      setCheckingServer(true);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(apiUrl('/health'), { signal: controller.signal });
        clearTimeout(timeout);
        if (!cancelled) setServerReachable(res.ok);
      } catch {
        if (!cancelled) setServerReachable(false);
      } finally {
        if (!cancelled) setCheckingServer(false);
      }
    };

    const onWindowFocus = () => {
      void probe();
    };

    void probe();
    const interval = window.setInterval(() => {
      void probe();
    }, 10000);
    window.addEventListener('focus', onWindowFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [isOnline]);

  const canUseDiscover = isOnline && serverReachable;

  const saveCurrentSearch = (searchTerm: string) => {
    const normalized = searchTerm.trim();
    if (!normalized) return;
    setSavedSearches((prev) => [normalized, ...prev.filter((q) => q.toLowerCase() !== normalized.toLowerCase())].slice(0, 12));
  };

  const removeSavedSearch = (searchTerm: string) => {
    setSavedSearches((prev) => prev.filter((q) => q !== searchTerm));
  };

  const buildRelatedQuery = (result: SearchResult) => {
    const titleHead = (result.title || '').split('|')[0].split('(')[0].trim();
    const channel = (result.channel || '').replace(/\s+-\s+Topic$/i, '').trim();
    if (channel && titleHead) return `${channel} ${titleHead} similar songs`;
    if (channel) return `${channel} essentials`;
    if (titleHead) return `${titleHead} similar tracks`;
    return 'related music tracks';
  };

  const curatedFromLibrary = useMemo(() => {
    const artistCounts = new Map<string, number>();
    for (const track of libraryTracks) {
      const artist = track.artist || '';
      if (!artist || artist === 'Unknown Artist') continue;
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    }
    return [...artistCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([artist, count]) => ({ artist, count }));
  }, [libraryTracks]);

  const handleSearch = async (searchQuery?: string) => {
    if (!canUseDiscover) {
      addToast?.('Discover is unavailable. Check internet and local server.', 'error');
      return;
    }
    const q = (searchQuery || query).trim();
    if (!q) return;
    setActiveTrend(TRENDING_TABS.find((tab) => tab.query.toLowerCase() === q.toLowerCase())?.label || null);
    setQuery(q);
    setLoading(true);
    setResults([]);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      console.error('Search error:', err);
      addToast?.('Search failed. Make sure the server is running.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (videoId: string, type: 'audio' | 'both', title: string) => {
    if (!canUseDiscover) {
      addToast?.('Downloads unavailable. Check internet and local server.', 'error');
      return;
    }
    const key = `${videoId}_${type}`;
    if (downloads.get(key)?.status === 'downloading') return;

    setDownloads((prev) => {
      const next = new Map(prev);
      next.set(key, { videoId, type, progress: 0, status: 'downloading' });
      return next;
    });

    try {
      const dlType = type === 'both' ? 'both' : 'audio';
      const res = await fetch(`${API_BASE}/download?videoId=${videoId}&type=${dlType}`);
      if (!res.ok) throw new Error('Download failed');
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.progress !== undefined && !data.done) {
              setDownloads((prev) => {
                const next = new Map(prev);
                next.set(key, { videoId, type, progress: data.progress, phase: data.phase, status: 'downloading' });
                return next;
              });
            }
            if (data.done) {
              setDownloads((prev) => {
                const next = new Map(prev);
                next.set(key, { videoId, type, progress: 100, status: 'done', filename: data.filename || data.audioFilename });
                return next;
              });
              const displayTitle = data.title || title;
              addToast?.(`Downloaded: ${displayTitle}`, 'success');

              // Import into library
              try {
                if (type === 'both' && data.audioFilename && data.videoFilename) {
                  await importBothFiles?.(data.audioFilename, data.videoFilename, {
                    title: data.title,
                    artist: data.artist,
                    album: data.album,
                    year: data.year,
                    trackNumber: data.trackNumber,
                    genre: data.genre,
                    coverUrl: data.coverUrl,
                    trackId: data.cloudTrack?.id,
                    remoteAudioUrl: data.cloudTrack?.remoteAudioUrl,
                    remoteVideoUrl: data.cloudTrack?.remoteVideoUrl,
                    isCloudTrack: data.cloudTrack?.isCloudTrack,
                  });
                } else if (data.filename) {
                  await importDownloadedFile?.(data.filename, false, {
                    title: data.title,
                    artist: data.artist,
                    album: data.album,
                    year: data.year,
                    trackNumber: data.trackNumber,
                    genre: data.genre,
                    coverUrl: data.coverUrl,
                    trackId: data.cloudTrack?.id,
                    remoteAudioUrl: data.cloudTrack?.remoteAudioUrl,
                    remoteVideoUrl: data.cloudTrack?.remoteVideoUrl,
                    isCloudTrack: data.cloudTrack?.isCloudTrack,
                  });
                }
              } catch (importErr) {
                console.error('Auto-import failed:', importErr);
              }
            }
            if (data.error) {
              setDownloads((prev) => {
                const next = new Map(prev);
                next.set(key, { videoId, type, progress: 0, status: 'error', error: data.error });
                return next;
              });
              addToast?.(`Download failed: ${data.error}`, 'error');
            }
          } catch { /* Ignore parse errors */ }
        }
      }
    } catch (err: any) {
      setDownloads((prev) => {
        const next = new Map(prev);
        next.set(key, { videoId, type, progress: 0, status: 'error', error: err.message });
        return next;
      });
      addToast?.('Download failed. Check server connection.', 'error');
    }
  };

  const getDownloadState = (videoId: string, type: 'audio' | 'both') => {
    return downloads.get(`${videoId}_${type}`);
  };

  const formatViews = (views: string) => {
    const n = parseInt(views || '0');
    if (isNaN(n)) return views;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const safeResults = (Array.isArray(results) ? results : []).filter(
    (row): row is SearchResult => Boolean(row && typeof row === 'object' && (row as SearchResult).videoId),
  );

  return (
    <div className="flex-1 bg-zinc-950 overflow-y-auto relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-28 -left-24 h-[28rem] w-[28rem] rounded-full blur-3xl bg-indigo-500/10" />
        <div className="absolute top-24 right-[-8rem] h-[24rem] w-[24rem] rounded-full blur-3xl bg-violet-500/10" />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/30 via-zinc-950/50 to-zinc-950" />
      </div>

      <div className="relative p-8 max-w-6xl mx-auto space-y-7">
        <section className="rounded-3xl border border-zinc-800/70 bg-zinc-900/40 backdrop-blur-xl p-7 md:p-10 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/70 text-zinc-300 text-xs font-medium mb-4">
                <Sparkles size={12} />
                Curated Discovery Room
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
                Discover like a showroom.
              </h1>
              <p className="mt-3 text-zinc-400 max-w-2xl">
                Search the web, preview culture-defining tracks, and add songs or full music videos to your library in one flow.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2.5 md:w-[360px]">
              <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/50 p-3 text-center">
                <Music size={15} className="mx-auto text-indigo-300 mb-1.5" />
                <div className="text-xs text-zinc-300">Audio</div>
              </div>
              <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/50 p-3 text-center">
                <Film size={15} className="mx-auto text-violet-300 mb-1.5" />
                <div className="text-xs text-zinc-300">Music Video</div>
              </div>
              <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/50 p-3 text-center">
                <Radio size={15} className="mx-auto text-cyan-300 mb-1.5" />
                <div className="text-xs text-zinc-300">Live Search</div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800/70 bg-zinc-900/30 p-5">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="text-zinc-400">Connection Status</span>
            <span className={`inline-flex items-center gap-1.5 ${canUseDiscover ? 'text-emerald-400' : 'text-amber-300'}`}>
              {!isOnline ? <WifiOff size={12} /> : !serverReachable ? <ServerCrash size={12} /> : <Sparkles size={12} />}
              {!isOnline ? 'Offline' : checkingServer ? 'Checking server…' : serverReachable ? 'Online + Server Ready' : 'Server Offline'}
            </span>
          </div>

          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Try: Daft Punk live, SZA new album, chill synthwave…"
              className="w-full bg-zinc-800/80 border border-zinc-700/50 rounded-2xl pl-11 pr-28 py-4 text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition"
            />
            <button
              onClick={() => handleSearch()}
              disabled={loading || !query.trim() || !canUseDiscover}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => saveCurrentSearch(query)}
              disabled={!query.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-zinc-800 border border-zinc-700/50 text-zinc-300 hover:text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {savedSearches.some((q) => q.toLowerCase() === query.trim().toLowerCase()) ? <Bookmark size={12} /> : <BookmarkPlus size={12} />}
              Save search
            </button>

            {savedSearches.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {savedSearches.slice(0, 6).map((saved) => (
                  <div key={saved} className="inline-flex items-center rounded-full border border-zinc-700/50 bg-zinc-800/60">
                    <button
                      onClick={() => handleSearch(saved)}
                      disabled={!canUseDiscover}
                      className="px-3 py-1.5 text-xs text-zinc-300 hover:text-white"
                    >
                      {saved}
                    </button>
                    <button
                      onClick={() => removeSavedSearch(saved)}
                      className="px-2 py-1.5 text-zinc-500 hover:text-red-400"
                      title="Remove saved search"
                    >
                      <XCircle size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Trending Tabs</p>
            <div className="flex items-center gap-2 flex-wrap">
              {TRENDING_TABS.map((tab) => (
                <button
                  key={tab.label}
                  onClick={() => handleSearch(tab.query)}
                  disabled={!canUseDiscover}
                  className={`px-3 py-1.5 rounded-full text-xs border transition ${
                    activeTrend === tab.label
                      ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300'
                      : 'border-zinc-700/50 bg-zinc-800/60 text-zinc-300 hover:text-white hover:bg-zinc-700/70'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {(!canUseDiscover && !checkingServer) && (
            <div className="mt-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Discover requires internet and the local API server (`npm run server`). Your local library still works fully offline.
            </div>
          )}
        </section>

        {safeResults.length === 0 && !loading && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/30 p-5">
              <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                <TrendingUp size={14} className="text-indigo-300" />
                Search Suggestions
              </h3>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSearch(s)}
                    disabled={!canUseDiscover}
                    className="px-3.5 py-2 bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/40 rounded-full text-sm text-zinc-300 hover:text-white transition-all disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800/70 bg-zinc-900/30 p-5">
              <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Radio size={14} className="text-violet-300" />
                From Your Library
              </h3>
              {curatedFromLibrary.length === 0 ? (
                <p className="text-sm text-zinc-500">Add more tracks to personalize discovery themes.</p>
              ) : (
                <div className="space-y-2.5">
                  {curatedFromLibrary.map((row) => (
                    <button
                      key={row.artist}
                      onClick={() => handleSearch(`${row.artist} essentials`) }
                      disabled={!canUseDiscover}
                      className="w-full flex items-center justify-between rounded-xl border border-zinc-700/40 bg-zinc-800/40 px-3 py-2.5 text-left hover:bg-zinc-800/70 transition disabled:opacity-40"
                    >
                      <div>
                        <div className="text-sm text-zinc-200 font-medium">{row.artist}</div>
                        <div className="text-[11px] text-zinc-500">{row.count} tracks in your library</div>
                      </div>
                      <ArrowRight size={14} className="text-zinc-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-zinc-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Searching the catalog…</span>
          </div>
        )}

        {safeResults.length > 0 && (
          <section className="space-y-3">
            <p className="text-xs text-zinc-500 mb-3">{safeResults.length} results</p>
            {safeResults.map((result, index) => {
              const audioState = getDownloadState(result.videoId, 'audio');
              const videoState = getDownloadState(result.videoId, 'both');
              const title = result.title || 'Untitled result';
              const videoId = result.videoId || `row-${index}`;

              return (
                <div
                  key={videoId}
                  className="flex flex-col md:flex-row gap-4 p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700 transition-all group"
                >
                  <div className="w-full md:w-56 h-32 md:h-32 rounded-xl overflow-hidden bg-zinc-800 shrink-0 relative">
                    {result.thumbnail ? (
                      <img src={result.thumbnail} alt={title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-700">
                        <Video size={24} />
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                      {result.duration || '0:00'}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-white line-clamp-2 mb-1">{title}</h3>
                    <p className="text-sm text-zinc-400 truncate mb-2">{result.channel || 'Unknown channel'}</p>
                    <div className="flex items-center gap-3 text-xs text-zinc-600">
                      {result.viewCount && (
                        <span className="flex items-center gap-1">
                          <Eye size={11} />
                          {formatViews(result.viewCount)}
                        </span>
                      )}
                      {result.publishedText && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {result.publishedText}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0 justify-center md:w-[160px]">
                    <button
                      onClick={() => {
                        setPreviewVideoId(videoId);
                        setPreviewTitle(title);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 hover:border-zinc-600 text-zinc-300 hover:text-white text-xs font-medium transition-all"
                    >
                      <PlayCircle size={13} />
                      Preview
                    </button>
                    <button
                      onClick={() => handleSearch(buildRelatedQuery(result))}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 hover:border-zinc-600 text-zinc-300 hover:text-white text-xs font-medium transition-all"
                    >
                      <TrendingUp size={13} />
                      Related
                    </button>
                    <DownloadButton
                      label="Song"
                      icon={<Music size={13} />}
                      state={audioState}
                      onClick={() => handleDownload(videoId, 'audio', title)}
                    />
                    <DownloadButton
                      label="Music Video"
                      icon={<Film size={13} />}
                      state={videoState}
                      onClick={() => handleDownload(videoId, 'both', title)}
                    />
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>

      {previewVideoId && (
        <div className="fixed inset-0 z-[220] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="text-sm font-semibold text-white truncate">Preview: {previewTitle || 'Track preview'}</div>
              <button
                onClick={() => {
                  setPreviewVideoId(null);
                  setPreviewTitle('');
                }}
                className="text-zinc-400 hover:text-white"
              >
                <XCircle size={18} />
              </button>
            </div>
            <div className="aspect-video bg-black">
              <iframe
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${previewVideoId}?autoplay=1&start=30`}
                title="Discover preview"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

type DiscoverBoundaryState = { hasError: boolean; message: string };

class DiscoverErrorBoundary extends React.Component<React.PropsWithChildren<Record<string, never>>, DiscoverBoundaryState> {
  declare props: React.PropsWithChildren<Record<string, never>>;
  state: DiscoverBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): DiscoverBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  componentDidCatch(error: unknown) {
    console.error('Discover crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 bg-zinc-950 overflow-y-auto">
          <div className="max-w-3xl mx-auto p-8">
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
              <h2 className="text-lg font-semibold text-red-300 mb-1">Discover crashed</h2>
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

export const Discover: React.FC = () => (
  <DiscoverErrorBoundary>
    <DiscoverContent />
  </DiscoverErrorBoundary>
);

// Download button sub-component
const DownloadButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  state?: DownloadProgress;
  onClick: () => void;
}> = ({ label, icon, state, onClick }) => {
  if (state?.status === 'done') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium">
        <CheckCircle2 size={13} />
        {label}
      </div>
    );
  }
  if (state?.status === 'error') {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-colors"
        title={state.error}
      >
        <XCircle size={13} />
        Retry
      </button>
    );
  }
  if (state?.status === 'downloading') {
    const phaseLabel = state.phase === 'audio' ? 'Audio' : state.phase === 'video' ? 'Video' : state.phase === 'metadata' ? 'Matching' : '';
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 text-xs font-medium min-w-[120px]">
        <Loader2 size={13} className="animate-spin shrink-0" />
        <div className="flex-1">
          <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            />
          </div>
        </div>
        <span className="text-[10px] tabular-nums whitespace-nowrap">{phaseLabel ? `${phaseLabel}` : `${Math.round(state.progress)}%`}</span>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 hover:border-zinc-600 text-zinc-300 hover:text-white text-xs font-medium transition-all"
    >
      <Download size={13} />
      {icon}
      {label}
    </button>
  );
};
