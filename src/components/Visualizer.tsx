import React, { useEffect, useRef } from 'react';
import { audioPlayer } from '../services/AudioPlayer';
import { usePlayer } from '../store/PlayerContext';

export const Visualizer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isPlaying } = usePlayer();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);

      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;

      if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        ctx.scale(dpr, dpr);
      }

      const width = displayWidth;
      const height = displayHeight;

      ctx.clearRect(0, 0, width, height);

      const analyser = audioPlayer.analyser;
      if (!analyser) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      // Draw smooth gradient bars
      const barCount = 48;
      const gap = 2;
      const barWidth = (width - gap * (barCount - 1)) / barCount;

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const value = dataArray[dataIndex] / 255;
        const barHeight = Math.max(2, value * height * 0.85);

        const x = i * (barWidth + gap);
        const y = height - barHeight;

        // Gradient from indigo to purple
        const gradient = ctx.createLinearGradient(x, height, x, y);
        const hue = 240 + (i / barCount) * 30; // indigo to violet
        gradient.addColorStop(0, `hsla(${hue}, 70%, 55%, 0.6)`);
        gradient.addColorStop(1, `hsla(${hue + 20}, 80%, 70%, 0.3)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        const radius = Math.min(barWidth / 2, 3);
        ctx.roundRect(x, y, barWidth, barHeight, [radius, radius, 0, 0]);
        ctx.fill();
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-28 opacity-30 pointer-events-none"
    />
  );
};
