import React from 'react';
import { audioPlayer } from '../services/AudioPlayer';

const FALLBACK_A = '99,102,241';
const FALLBACK_B = '139,92,246';

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function shiftColor(rgb: [number, number, number], shift: number): string {
  const [r, g, b] = rgb;
  return `${clampChannel(r + shift)},${clampChannel(g + shift)},${clampChannel(b + shift)}`;
}

export const NowPlayingBackdrop: React.FC<{ coverUrl?: string; className?: string }> = ({ coverUrl, className }) => {
  const [baseColor, setBaseColor] = React.useState<string>(FALLBACK_A);
  const [accentColor, setAccentColor] = React.useState<string>(FALLBACK_B);
  const [energy, setEnergy] = React.useState(0.18);

  React.useEffect(() => {
    if (!coverUrl) {
      setBaseColor(FALLBACK_A);
      setAccentColor(FALLBACK_B);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.src = coverUrl;

    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        let red = 0;
        let green = 0;
        let blue = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 32) continue;
          red += data[i];
          green += data[i + 1];
          blue += data[i + 2];
          count++;
        }

        if (count === 0) return;
        const rgb: [number, number, number] = [red / count, green / count, blue / count];
        setBaseColor(shiftColor(rgb, -26));
        setAccentColor(shiftColor(rgb, 34));
      } catch {
        setBaseColor(FALLBACK_A);
        setAccentColor(FALLBACK_B);
      }
    };

    img.onerror = () => {
      if (cancelled) return;
      setBaseColor(FALLBACK_A);
      setAccentColor(FALLBACK_B);
    };

    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  React.useEffect(() => {
    let rafId = 0;
    let smoothed = 0.16;

    const loop = () => {
      const analyser = audioPlayer.analyser;
      if (analyser) {
        const buffer = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(buffer);

        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          const normalized = (buffer[i] - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / buffer.length);
        const target = Math.min(1, rms * 4.6 + 0.12);
        smoothed = smoothed * 0.88 + target * 0.12;
      } else {
        smoothed = smoothed * 0.92 + 0.18 * 0.08;
      }

      setEnergy(smoothed);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const driftA = 6 + energy * 14;
  const driftB = 8 + energy * 18;
  const opacityA = 0.18 + energy * 0.18;
  const opacityB = 0.14 + energy * 0.16;

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className || ''}`}>
      <div
        className="absolute -top-28 -left-20 h-[24rem] w-[24rem] rounded-full blur-3xl animate-[spin_26s_linear_infinite]"
        style={{
          background: `radial-gradient(circle, rgba(${baseColor},${opacityA}) 0%, rgba(${baseColor},0) 70%)`,
          transform: `translate3d(0, ${driftA}px, 0) scale(${1 + energy * 0.04})`,
        }}
      />
      <div
        className="absolute top-10 right-[-6rem] h-[22rem] w-[22rem] rounded-full blur-3xl animate-[spin_32s_linear_infinite_reverse]"
        style={{
          background: `radial-gradient(circle, rgba(${accentColor},${opacityB}) 0%, rgba(${accentColor},0) 72%)`,
          transform: `translate3d(0, ${-driftB}px, 0) scale(${1 + energy * 0.05})`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(${baseColor},0.10) 0%, rgba(9,9,11,0.12) 55%, rgba(9,9,11,0.56) 100%)`,
        }}
      />
    </div>
  );
};
