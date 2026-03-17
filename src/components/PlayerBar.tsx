import React, { useState, useRef, useCallback, useEffect } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1, Shuffle, Repeat, Repeat1, Maximize2, SlidersHorizontal, Music, Disc3, Video, VideoOff, Heart, Timer, Mic2 } from 'lucide-react';
import { ArtistModal } from './ArtistModal';
import { audioPlayer } from '../services/AudioPlayer';

export const PlayerBar: React.FC<{ onToggleEq: () => void; onToggleVideo: () => void; showEq: boolean }> = ({
  onToggleEq,
  onToggleVideo,
  showEq,
}) => {
  const {
    currentTrack, isPlaying, currentTime, duration, volume,
    isShuffle, repeatMode, togglePlayPause, nextTrack, prevTrack,
    seek, setVolume, toggleShuffle, cycleRepeat,
    showVideoInline, toggleVideoInline, videoUrl,
    toggleLike, sleepTimerRemaining, setSleepTimer,
    showLyrics, setShowLyrics,
  } = usePlayer();

  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [isVolDragging, setIsVolDragging] = useState(false);
  const [artistModalName, setArtistModalName] = useState<string | null>(null);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const volRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const hasVideo = !!(videoUrl && currentTrack);

  // Mount/unmount audioPlayer.element into the video container
  useEffect(() => {
    const container = videoContainerRef.current;
    if (!container) return;
    if (showVideoInline && hasVideo) {
      container.appendChild(audioPlayer.element);
      audioPlayer.element.style.width = '100%';
      audioPlayer.element.style.height = '100%';
      audioPlayer.element.style.objectFit = 'cover';
      audioPlayer.element.style.borderRadius = '0.5rem';
      audioPlayer.element.style.display = 'block';
    }
    return () => {
      if (audioPlayer.element.parentNode === container) {
        container.removeChild(audioPlayer.element);
        audioPlayer.element.style.display = '';
      }
    };
  }, [showVideoInline, hasVideo, currentTrack]);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSleepTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const calcProgress = useCallback((e: React.MouseEvent | MouseEvent, ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return 0;
    const rect = ref.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }, []);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    setIsDragging(true);
    const pos = calcProgress(e, progressRef);
    setDragTime(pos * duration);
    const handleMove = (ev: MouseEvent) => { setDragTime(calcProgress(ev, progressRef) * duration); };
    const handleUp = (ev: MouseEvent) => {
      seek(calcProgress(ev, progressRef) * duration);
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [duration, seek, calcProgress]);

  const handleProgressHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(pos * duration);
    setHoverX(e.clientX - rect.left);
  }, [duration]);

  const handleVolMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsVolDragging(true);
    setVolume(calcProgress(e, volRef));
    const handleMove = (ev: MouseEvent) => { setVolume(calcProgress(ev, volRef)); };
    const handleUp = () => {
      setIsVolDragging(false);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [setVolume, calcProgress]);

  const displayTime = isDragging ? dragTime : currentTime;
  const progressPercent = duration ? (displayTime / duration) * 100 : 0;
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const repeatIcon = repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />;
  const repeatActive = repeatMode !== 'off';

  const sleepOptions = [5, 10, 15, 30, 45, 60, 90, 120];

  return (
    <div className="playerbar-root h-[88px] bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800/50 flex items-center justify-between px-5 select-none">
      {/* Track Info */}
      <div className="playerbar-track flex items-center gap-3.5 w-[300px] min-w-[200px]">
        {currentTrack ? (
          <>
            <div className={`shrink-0 ${isPlaying ? 'animate-pulse-glow' : ''} rounded-lg relative group/cover`}>
              {showVideoInline && hasVideo ? (
                <div
                  ref={videoContainerRef}
                  className="w-[120px] h-[68px] rounded-lg shadow-lg bg-black cursor-pointer overflow-hidden"
                  onClick={toggleVideoInline}
                  title="Click to hide video"
                />
              ) : currentTrack.coverUrl ? (
                <img
                  src={currentTrack.coverUrl}
                  alt={currentTrack.album}
                  className="w-14 h-14 rounded-lg shadow-lg object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-zinc-800 flex items-center justify-center shadow-lg border border-zinc-700/50">
                  <Disc3 size={24} className={`text-zinc-600 ${isPlaying ? 'animate-spin-slow' : ''}`} />
                </div>
              )}
              {hasVideo && !showVideoInline && (
                <button
                  onClick={toggleVideoInline}
                  className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-opacity"
                  title="Show video"
                >
                  <Video size={18} className="text-white" />
                </button>
              )}
            </div>
            <div className="overflow-hidden flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-white truncate">{currentTrack.title}</div>
              </div>
              <button
                onClick={() => { if (currentTrack.artist && currentTrack.artist !== 'Unknown Artist') setArtistModalName(currentTrack.artist); }}
                className={`text-xs truncate block max-w-full text-left transition-colors ${
                  currentTrack.artist && currentTrack.artist !== 'Unknown Artist'
                    ? 'text-zinc-500 hover:text-indigo-400 hover:underline cursor-pointer'
                    : 'text-zinc-500 cursor-default'
                }`}
              >
                {currentTrack.artist}
              </button>
            </div>
            {/* Heart button */}
            <button
              onClick={() => toggleLike(currentTrack.id)}
              className={`shrink-0 p-1 rounded-md transition-all ${
                currentTrack.liked
                  ? 'text-pink-500 hover:text-pink-400'
                  : 'text-zinc-600 hover:text-pink-500'
              }`}
              title="Like (L)"
            >
              <Heart size={16} fill={currentTrack.liked ? 'currentColor' : 'none'} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 text-zinc-600">
            <div className="w-14 h-14 rounded-lg bg-zinc-800/50 flex items-center justify-center border border-zinc-800">
              <Music size={20} className="text-zinc-700" />
            </div>
            <span className="text-sm">No track selected</span>
          </div>
        )}
      </div>

      {/* Center Controls */}
      <div className="playerbar-center flex flex-col items-center justify-center flex-1 max-w-2xl px-4">
        <div className="playerbar-transport flex items-center gap-5 mb-2">
          <button
            onClick={toggleShuffle}
            className={`transition-colors p-1 rounded-md ${isShuffle ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-500 hover:text-white'}`}
            title="Shuffle (S)"
          >
            <Shuffle size={16} />
          </button>
          <button onClick={prevTrack} className="text-zinc-400 hover:text-white transition-colors p-1" title="Previous (Shift+←)">
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            onClick={togglePlayPause}
            className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-transform shadow-md"
            title="Play/Pause (Space)"
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
          </button>
          <button onClick={nextTrack} className="text-zinc-400 hover:text-white transition-colors p-1" title="Next (Shift+→)">
            <SkipForward size={20} fill="currentColor" />
          </button>
          <button
            onClick={cycleRepeat}
            className={`transition-colors p-1 rounded-md relative ${repeatActive ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-500 hover:text-white'}`}
            title={`Repeat: ${repeatMode} (R)`}
          >
            {repeatIcon}
            {repeatMode === 'all' && (
              <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-400" />
            )}
          </button>
        </div>

        {/* Progress bar */}
        <div className="playerbar-progress-row w-full flex items-center gap-3 text-[11px] text-zinc-500 font-mono tabular-nums">
          <span className="w-10 text-right">{formatTime(displayTime)}</span>
          <div
            className="flex-1 h-1 bg-zinc-800 rounded-full cursor-pointer relative group"
            ref={progressRef}
            onMouseDown={handleProgressMouseDown}
            onMouseMove={handleProgressHover}
            onMouseLeave={() => setHoverTime(null)}
          >
            <div
              className="absolute top-0 left-0 h-full bg-zinc-400 group-hover:bg-indigo-500 rounded-full transition-colors"
              style={{ width: `${progressPercent}%` }}
            />
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md transition-opacity ${
                isDragging ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'
              }`}
              style={{ left: `calc(${progressPercent}% - 6px)` }}
            />
            {/* Hover time tooltip */}
            {hoverTime !== null && !isDragging && (
              <div
                className="absolute -top-8 bg-zinc-800 text-zinc-200 text-[10px] px-2 py-0.5 rounded shadow-lg pointer-events-none whitespace-nowrap"
                style={{ left: `${hoverX}px`, transform: 'translateX(-50%)' }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>
          <span className="w-10">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="playerbar-right flex items-center justify-end gap-2 w-[320px] min-w-[220px]">
        {/* Lyrics */}
        {currentTrack?.lyrics && (
          <button
            onClick={() => setShowLyrics(!showLyrics)}
            className={`p-1.5 rounded-md transition-colors ${showLyrics ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-500 hover:text-white'}`}
            title="Lyrics"
          >
            <Mic2 size={16} />
          </button>
        )}

        {/* EQ */}
        <button
          onClick={onToggleEq}
          className={`p-1.5 rounded-md transition-colors ${showEq ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-500 hover:text-white'}`}
          title="Equalizer"
        >
          <SlidersHorizontal size={16} />
        </button>

        {/* Video controls */}
        {hasVideo && (
          <button
            onClick={toggleVideoInline}
            className={`p-1.5 rounded-md transition-colors ${showVideoInline ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-500 hover:text-white'}`}
            title={showVideoInline ? 'Hide video' : 'Show video'}
          >
            {showVideoInline ? <VideoOff size={16} /> : <Video size={16} />}
          </button>
        )}
        {hasVideo && (
          <button onClick={onToggleVideo} className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-md" title="Fullscreen Video">
            <Maximize2 size={16} />
          </button>
        )}

        {/* Sleep timer */}
        <div className="relative">
          <button
            onClick={() => setShowSleepMenu(!showSleepMenu)}
            className={`p-1.5 rounded-md transition-colors relative ${sleepTimerRemaining ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-500 hover:text-white'}`}
            title="Sleep timer"
          >
            <Timer size={16} />
            {sleepTimerRemaining && (
              <span className="absolute -top-1 -right-1 text-[8px] bg-indigo-600 text-white px-1 rounded-full leading-tight">
                {formatSleepTime(sleepTimerRemaining)}
              </span>
            )}
          </button>
          {showSleepMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSleepMenu(false)} />
              <div className="absolute bottom-full right-0 mb-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 py-1 min-w-[140px]">
                <div className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Sleep Timer</div>
                {sleepTimerRemaining && (
                  <button
                    onClick={() => { setSleepTimer(null); setShowSleepMenu(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-zinc-800 transition-colors"
                  >
                    Cancel Timer
                  </button>
                )}
                {sleepOptions.map(m => (
                  <button
                    key={m}
                    onClick={() => { setSleepTimer(m); setShowSleepMenu(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    {m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} min`}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Volume */}
        <div className="playerbar-volume flex items-center gap-2 w-28 group">
          <button
            onClick={() => setVolume(volume === 0 ? 0.7 : 0)}
            className="text-zinc-500 hover:text-white transition-colors shrink-0"
            title="Mute (M)"
          >
            <VolumeIcon size={16} />
          </button>
          <div
            className="flex-1 h-1 bg-zinc-800 rounded-full cursor-pointer relative group/vol"
            ref={volRef}
            onMouseDown={handleVolMouseDown}
          >
            <div
              className="absolute top-0 left-0 h-full bg-zinc-400 group-hover/vol:bg-indigo-500 rounded-full transition-colors"
              style={{ width: `${volume * 100}%` }}
            />
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-sm transition-opacity ${
                isVolDragging ? 'opacity-100' : 'opacity-0 group-hover/vol:opacity-100'
              }`}
              style={{ left: `calc(${volume * 100}% - 5px)` }}
            />
          </div>
        </div>
      </div>

      {/* Artist modal */}
      {artistModalName && <ArtistModal artistName={artistModalName} onClose={() => setArtistModalName(null)} />}
    </div>
  );
};
