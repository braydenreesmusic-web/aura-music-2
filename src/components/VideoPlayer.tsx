import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { audioPlayer } from '../services/AudioPlayer';
import { X, Maximize, Minimize, PictureInPicture2, Captions, CaptionsOff, Gauge, LayoutPanelTop, LayoutPanelLeft, LayoutTemplate } from 'lucide-react';

export const VideoPlayer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { currentTrack, videoUrl, showVideoInline, toggleVideoInline } = usePlayer();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPip, setIsPip] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [fitMode, setFitMode] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);

  const lyricLines = useMemo(() => {
    return (currentTrack?.lyrics || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, [currentTrack?.lyrics]);

  const activeLyric = useMemo(() => {
    if (!showSubtitles || lyricLines.length === 0) return '';
    const effectiveDuration = audioPlayer.element.duration || Math.max(currentTrack?.duration || 0, 1);
    if (!effectiveDuration || !Number.isFinite(effectiveDuration)) return lyricLines[0] || '';
    const segmentLength = effectiveDuration / lyricLines.length;
    const index = Math.min(lyricLines.length - 1, Math.max(0, Math.floor(currentTime / Math.max(segmentLength, 0.1))));
    return lyricLines[index] || '';
  }, [showSubtitles, lyricLines, currentTime, currentTrack?.duration]);

  // Make sure we're playing the video source when fullscreen opens
  useEffect(() => {
    if (!showVideoInline && videoUrl) {
      toggleVideoInline(); // switch to video source
    }
  }, []);

  useEffect(() => {
    if (containerRef.current && audioPlayer.element) {
      audioPlayer.element.style.width = '100%';
      audioPlayer.element.style.height = '100%';
      audioPlayer.element.style.objectFit = fitMode;
      audioPlayer.element.style.borderRadius = '0';
      audioPlayer.element.style.display = 'block';
      containerRef.current.appendChild(audioPlayer.element);
    }
    return () => {
      if (audioPlayer.element.parentNode === containerRef.current) {
        containerRef.current!.removeChild(audioPlayer.element);
        audioPlayer.element.style.display = '';
      }
    };
  }, []);

  useEffect(() => {
    audioPlayer.element.style.objectFit = fitMode;
  }, [fitMode]);

  useEffect(() => {
    const onTime = () => setCurrentTime(audioPlayer.element.currentTime || 0);
    audioPlayer.element.addEventListener('timeupdate', onTime);
    return () => audioPlayer.element.removeEventListener('timeupdate', onTime);
  }, []);

  useEffect(() => {
    audioPlayer.element.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const onPiPEnter = () => setIsPip(true);
    const onPiPLeave = () => setIsPip(false);
    audioPlayer.element.addEventListener('enterpictureinpicture', onPiPEnter as EventListener);
    audioPlayer.element.addEventListener('leavepictureinpicture', onPiPLeave as EventListener);
    return () => {
      audioPlayer.element.removeEventListener('enterpictureinpicture', onPiPEnter as EventListener);
      audioPlayer.element.removeEventListener('leavepictureinpicture', onPiPLeave as EventListener);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const togglePiP = async () => {
    try {
      if ('pictureInPictureEnabled' in document && document.pictureInPictureEnabled) {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await audioPlayer.element.requestPictureInPicture();
        }
        return;
      }
      const webkitElement = audioPlayer.element as HTMLVideoElement & { webkitSupportsPresentationMode?: (mode: string) => boolean; webkitSetPresentationMode?: (mode: 'inline' | 'picture-in-picture' | 'fullscreen') => void; };
      if (webkitElement.webkitSupportsPresentationMode?.('picture-in-picture')) {
        webkitElement.webkitSetPresentationMode?.(isPip ? 'inline' : 'picture-in-picture');
        setIsPip((prev) => !prev);
      }
    } catch {
      // Ignore unsupported PiP errors
    }
  };

  if (!currentTrack || !videoUrl) {
    return null;
  }

  return (
    <div className="absolute inset-0 bg-black z-40 flex flex-col overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.22),transparent_40%),radial-gradient(circle_at_80%_30%,rgba(168,85,247,0.2),transparent_45%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.14),transparent_50%)] pointer-events-none" />

      <div className="absolute top-0 left-0 right-0 p-5 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex justify-between items-start z-50">
        <div className="max-w-[70%]">
          <div className="text-[11px] uppercase tracking-[0.22em] text-indigo-300/90 mb-1">Cinematic Mode</div>
          <h2 className="text-white font-semibold text-lg truncate">{currentTrack.title}</h2>
          <p className="text-zinc-300/80 text-sm truncate">{currentTrack.artist}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSubtitles((prev) => !prev)}
            className={`p-2 rounded-xl transition-colors ${showSubtitles ? 'bg-indigo-500/25 text-indigo-200' : 'bg-zinc-800/70 text-zinc-300 hover:text-white'}`}
            title="Toggle subtitles"
          >
            {showSubtitles ? <Captions size={18} /> : <CaptionsOff size={18} />}
          </button>
          <button
            onClick={togglePiP}
            className={`p-2 rounded-xl transition-colors ${isPip ? 'bg-indigo-500/25 text-indigo-200' : 'bg-zinc-800/70 text-zinc-300 hover:text-white'}`}
            title="Picture in Picture"
          >
            <PictureInPicture2 size={18} />
          </button>
          <button onClick={toggleFullscreen} className="p-2 rounded-xl bg-zinc-800/70 text-zinc-300 hover:text-white transition-colors" title="Toggle fullscreen">
            {document.fullscreenElement ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
          <button onClick={onClose} className="p-2 rounded-xl bg-zinc-800/70 text-zinc-300 hover:text-red-300 transition-colors" title="Close">
            <X size={20} />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 w-full h-full flex items-center justify-center" />

      {showSubtitles && activeLyric && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 max-w-3xl px-6 py-3 rounded-2xl border border-white/20 bg-black/55 backdrop-blur-md text-center shadow-2xl">
          <p className="text-white text-base md:text-lg font-medium leading-relaxed">{activeLyric}</p>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-50">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-700/60 bg-zinc-900/70 backdrop-blur-lg px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 text-xs text-zinc-300 bg-zinc-800/70 border border-zinc-700/60 rounded-xl px-3 py-1.5">
            <Gauge size={14} />
            Speed
          </div>
          {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
            <button
              key={rate}
              onClick={() => setPlaybackRate(rate)}
              className={`px-3 py-1.5 text-xs rounded-xl border transition-colors ${
                playbackRate === rate
                  ? 'bg-indigo-500/20 text-indigo-200 border-indigo-400/50'
                  : 'bg-zinc-800/70 text-zinc-300 border-zinc-700/60 hover:text-white hover:bg-zinc-700/70'
              }`}
            >
              {rate}x
            </button>
          ))}

          <div className="ml-auto inline-flex items-center gap-1.5">
            <button
              onClick={() => setFitMode('contain')}
              className={`p-2 rounded-lg border ${fitMode === 'contain' ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-200' : 'border-zinc-700/60 bg-zinc-800/70 text-zinc-300'}`}
              title="Fit contain"
            >
              <LayoutPanelTop size={15} />
            </button>
            <button
              onClick={() => setFitMode('cover')}
              className={`p-2 rounded-lg border ${fitMode === 'cover' ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-200' : 'border-zinc-700/60 bg-zinc-800/70 text-zinc-300'}`}
              title="Fit cover"
            >
              <LayoutPanelLeft size={15} />
            </button>
            <button
              onClick={() => setFitMode('fill')}
              className={`p-2 rounded-lg border ${fitMode === 'fill' ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-200' : 'border-zinc-700/60 bg-zinc-800/70 text-zinc-300'}`}
              title="Fit fill"
            >
              <LayoutTemplate size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
