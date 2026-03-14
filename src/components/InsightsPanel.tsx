import React from 'react';
import type { Track } from '../db';
import { Flame, Clock3, BarChart3, Trophy, CalendarDays } from 'lucide-react';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ts: number) {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatMinutes(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hours}h ${rem}m`;
  }
  return `${mins}m`;
}

function formatSession(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export const InsightsPanel: React.FC<{ tracks: Track[] }> = ({ tracks }) => {
  const safeTracks = React.useMemo(() => (Array.isArray(tracks) ? tracks.filter(Boolean) : []), [tracks]);

  const [sessionStartedAt] = React.useState(() => Date.now());
  const [sessionElapsed, setSessionElapsed] = React.useState(0);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      setSessionElapsed(Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [sessionStartedAt]);

  const stats = React.useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * DAY_MS;

    const playedRecently = safeTracks.filter((track) => (track.lastPlayed || 0) >= weekAgo);
    const weeklyMinutes = playedRecently.reduce((acc, track) => {
      const plays = Math.max(1, track.playCount || 0);
      return acc + (track.duration || 0) * plays;
    }, 0);

    const topArtistMap = new Map<string, number>();
    const topTrackMap = new Map<string, { title: string; artist: string; score: number }>();

    for (const track of safeTracks) {
      const artist = (track.artist || 'Unknown Artist').trim();
      const title = (track.title || 'Unknown Track').trim();
      const recencyBoost = (track.lastPlayed || 0) >= weekAgo ? 2 : 1;
      const score = Math.max(1, track.playCount || 0) * recencyBoost;

      topArtistMap.set(artist, (topArtistMap.get(artist) || 0) + score);
      topTrackMap.set(track.id, { title, artist, score });
    }

    const topArtists = [...topArtistMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([artist, score]) => ({ artist, score }));

    const topTracks = [...topTrackMap.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const playedDays = new Set(
      safeTracks
        .map((track) => track.lastPlayed || 0)
        .filter((ts) => ts > 0)
        .map((ts) => startOfDay(ts)),
    );

    let streak = 0;
    let cursor = startOfDay(now);
    while (playedDays.has(cursor)) {
      streak++;
      cursor -= DAY_MS;
    }

    return {
      weeklyActiveTracks: playedRecently.length,
      weeklyMinutes,
      streak,
      topArtists,
      topTracks,
    };
  }, [safeTracks]);

  return (
    <section className="mb-6 grid grid-cols-1 xl:grid-cols-4 gap-3">
      <article className="rounded-2xl border border-zinc-700/50 bg-zinc-900/65 backdrop-blur-xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">Weekly Recap</div>
          <CalendarDays size={14} className="text-indigo-300" />
        </div>
        <div className="text-2xl font-bold text-white">{formatMinutes(stats.weeklyMinutes)}</div>
        <div className="text-xs text-zinc-400 mt-1">{stats.weeklyActiveTracks} active tracks this week</div>
      </article>

      <article className="rounded-2xl border border-zinc-700/50 bg-zinc-900/65 backdrop-blur-xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">Listening Streak</div>
          <Flame size={14} className="text-orange-300" />
        </div>
        <div className="text-2xl font-bold text-white">{stats.streak} day{stats.streak === 1 ? '' : 's'}</div>
        <div className="text-xs text-zinc-400 mt-1">Keep it alive with one play today</div>
      </article>

      <article className="rounded-2xl border border-zinc-700/50 bg-zinc-900/65 backdrop-blur-xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">Session Timer</div>
          <Clock3 size={14} className="text-cyan-300" />
        </div>
        <div className="text-2xl font-bold text-white">{formatSession(sessionElapsed)}</div>
        <div className="text-xs text-zinc-400 mt-1">Current listening session</div>
      </article>

      <article className="rounded-2xl border border-zinc-700/50 bg-zinc-900/65 backdrop-blur-xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">Top This Week</div>
          <Trophy size={14} className="text-emerald-300" />
        </div>
        <div className="space-y-2">
          {stats.topArtists.length > 0 ? (
            stats.topArtists.map((artist, index) => (
              <div key={artist.artist} className="flex items-center justify-between text-xs">
                <span className="text-zinc-200 truncate mr-2">#{index + 1} {artist.artist}</span>
                <span className="text-zinc-500">{artist.score}</span>
              </div>
            ))
          ) : (
            <div className="text-xs text-zinc-500">Play some music to unlock insights</div>
          )}
        </div>
      </article>

      <article className="xl:col-span-4 rounded-2xl border border-zinc-700/50 bg-zinc-900/55 backdrop-blur-xl p-4 shadow-xl">
        <div className="flex items-center gap-2 mb-3 text-[11px] uppercase tracking-widest text-zinc-500">
          <BarChart3 size={13} className="text-indigo-300" />
          Top Tracks Snapshot
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {stats.topTracks.length > 0 ? (
            stats.topTracks.map((track, index) => (
              <div key={`${track.title}-${track.artist}-${index}`} className="rounded-xl border border-zinc-700/40 bg-zinc-800/40 px-3 py-2.5">
                <div className="text-xs text-zinc-500">#{index + 1}</div>
                <div className="text-sm text-zinc-100 font-medium truncate">{track.title}</div>
                <div className="text-xs text-zinc-400 truncate">{track.artist}</div>
              </div>
            ))
          ) : (
            <div className="text-xs text-zinc-500">No track insights yet.</div>
          )}
        </div>
      </article>
    </section>
  );
};
