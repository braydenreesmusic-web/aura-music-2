import React, { useState, useEffect, useRef } from 'react';
import { audioPlayer } from '../services/AudioPlayer';
import { X, ChevronDown, RotateCcw } from 'lucide-react';

const FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Bass: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  Treble: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
  'V-Shape': [6, 5, 3, 0, -2, -2, 0, 3, 5, 6],
  Vocal: [-2, -1, 0, 3, 5, 5, 3, 1, 0, -1],
  Rock: [5, 4, 2, 0, -1, 0, 2, 4, 5, 5],
  Electronic: [5, 4, 1, 0, -2, 0, 1, 3, 5, 4],
  'Late Night': [3, 2, 1, 0, -1, -1, 0, 1, 2, 2],
};

// Mini EQ curve canvas
const EqCurve: React.FC<{ gains: number[] }> = ({ gains }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Draw zero line
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw curve
    const points = gains.map((g, i) => ({
      x: (i / (gains.length - 1)) * w,
      y: h / 2 - (g / 12) * (h / 2) * 0.85,
    }));

    // Fill area
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.15)');
    gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.15)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.15)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    for (let i = 0; i < points.length; i++) {
      if (i === 0) ctx.lineTo(points[i].x, points[i].y);
      else {
        const prev = points[i - 1];
        const cpx = (prev.x + points[i].x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, points[i].y, points[i].x, points[i].y);
      }
    }
    ctx.lineTo(w, h / 2);
    ctx.closePath();
    ctx.fill();

    // Stroke curve
    const lineGrad = ctx.createLinearGradient(0, 0, w, 0);
    lineGrad.addColorStop(0, '#6366f1');
    lineGrad.addColorStop(0.5, '#8b5cf6');
    lineGrad.addColorStop(1, '#6366f1');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (i === 0) ctx.moveTo(points[i].x, points[i].y);
      else {
        const prev = points[i - 1];
        const cpx = (prev.x + points[i].x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, points[i].y, points[i].x, points[i].y);
      }
    }
    ctx.stroke();

    // Draw dots
    points.forEach((p) => {
      ctx.fillStyle = '#818cf8';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [gains]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
};

export const Equalizer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [gains, setGains] = useState<number[]>(FREQUENCIES.map(() => 0));
  const [activePreset, setActivePreset] = useState<string>('Flat');
  const [showPresets, setShowPresets] = useState(false);

  useEffect(() => {
    // Restore from localStorage if available, otherwise from audio player
    const saved = localStorage.getItem('aura-eq-gains');
    const savedPreset = localStorage.getItem('aura-eq-preset');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as number[];
        if (Array.isArray(parsed) && parsed.length === FREQUENCIES.length) {
          setGains(parsed);
          parsed.forEach((v, i) => audioPlayer.setEqBand(i, v));
          setActivePreset(savedPreset || 'Custom');
          return;
        }
      } catch {}
    }
    const currentGains = FREQUENCIES.map((_, i) => audioPlayer.getEqBand(i));
    setGains(currentGains);
    const matched = Object.entries(PRESETS).find(([_, values]) =>
      values.every((v, i) => Math.abs(v - currentGains[i]) < 0.5)
    );
    if (matched) setActivePreset(matched[0]);
    else setActivePreset('Custom');
  }, []);

  const handleGainChange = (index: number, value: number) => {
    const newGains = [...gains];
    newGains[index] = value;
    setGains(newGains);
    audioPlayer.setEqBand(index, value);
    setActivePreset('Custom');
    localStorage.setItem('aura-eq-gains', JSON.stringify(newGains));
    localStorage.setItem('aura-eq-preset', 'Custom');
  };

  const applyPreset = (name: string) => {
    const values = PRESETS[name];
    if (!values) return;
    setGains([...values]);
    values.forEach((v, i) => audioPlayer.setEqBand(i, v));
    setActivePreset(name);
    setShowPresets(false);
    localStorage.setItem('aura-eq-gains', JSON.stringify(values));
    localStorage.setItem('aura-eq-preset', name);
  };

  const formatFreq = (freq: number) => (freq >= 1000 ? `${freq / 1000}k` : `${freq}`);

  return (
    <div className="absolute top-0 right-0 h-full w-[340px] bg-zinc-950/95 backdrop-blur-xl border-l border-zinc-800/50 flex flex-col shadow-2xl z-50 animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h2 className="text-base font-bold text-white">Equalizer</h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">Shape your sound</p>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-zinc-800">
          <X size={16} />
        </button>
      </div>

      {/* Preset selector */}
      <div className="relative px-5 mb-3">
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="w-full flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-300 hover:border-zinc-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${activePreset === 'Custom' ? 'bg-amber-400' : 'bg-indigo-400'}`} />
            <span className="font-medium text-[13px]">{activePreset}</span>
          </div>
          <ChevronDown size={14} className={`text-zinc-500 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
        </button>
        {showPresets && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowPresets(false)} />
            <div className="absolute left-5 right-5 top-full mt-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 py-1 max-h-64 overflow-y-auto">
              {Object.keys(PRESETS).map((name) => (
                <button
                  key={name}
                  onClick={() => applyPreset(name)}
                  className={`w-full text-left px-3.5 py-2 text-[13px] transition-colors flex items-center gap-2 ${
                    activePreset === name ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${activePreset === name ? 'bg-indigo-400' : 'bg-zinc-700'}`} />
                  {name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Curve visualization */}
      <div className="px-5 mb-2">
        <div className="h-20 bg-zinc-900/60 rounded-xl border border-zinc-800/40 p-2 overflow-hidden">
          <EqCurve gains={gains} />
        </div>
      </div>

      {/* dB labels on left */}
      <div className="flex-1 px-5 flex flex-col min-h-0 overflow-hidden">
        <div className="flex gap-0 flex-1 min-h-0">
          {/* dB scale */}
          <div className="flex flex-col justify-between text-[9px] text-zinc-600 font-mono pr-1.5 py-1 shrink-0 w-7">
            <span>+12</span>
            <span className="text-zinc-700">0</span>
            <span>-12</span>
          </div>

          {/* Sliders */}
          <div className="flex-1 flex justify-between gap-px">
            {FREQUENCIES.map((freq, index) => {
              const gain = gains[index];
              const percent = ((gain + 12) / 24) * 100;
              const isPositive = gain > 0;
              const isNegative = gain < 0;

              return (
                <div key={freq} className="flex flex-col items-center flex-1 min-w-0 gap-1">
                  {/* Gain value */}
                  <div className={`text-[9px] font-mono tabular-nums h-3.5 flex items-center ${
                    isPositive ? 'text-indigo-400' : isNegative ? 'text-amber-400/70' : 'text-zinc-600'
                  }`}>
                    {gain > 0 ? '+' : ''}{gain.toFixed(0)}
                  </div>

                  {/* Slider track with visual bar */}
                  <div className="flex-1 relative w-full flex justify-center min-h-[140px]">
                    {/* Background bar showing gain visually */}
                    <div className="absolute inset-x-0 top-0 bottom-0 flex items-center justify-center">
                      <div className="w-[6px] h-full bg-zinc-900 rounded-full relative overflow-hidden">
                        {/* Zero line */}
                        <div className="absolute left-0 right-0 top-1/2 h-px bg-zinc-700" />
                        {/* Fill */}
                        {gain !== 0 && (
                          <div
                            className={`absolute left-0 right-0 transition-all duration-150 rounded-full ${
                              isPositive ? 'bg-indigo-500/40' : 'bg-amber-500/30'
                            }`}
                            style={{
                              top: isPositive ? `${100 - percent}%` : '50%',
                              bottom: isPositive ? '50%' : `${percent}%`,
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="0.5"
                      value={gain}
                      onChange={(e) => handleGainChange(index, parseFloat(e.target.value))}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120px] h-1.5 rounded-full appearance-none cursor-pointer -rotate-90 eq-slider"
                      style={{
                        background: `linear-gradient(to right, #6366f1 ${percent}%, #1c1c22 ${percent}%)`,
                      }}
                    />
                  </div>

                  {/* Frequency label */}
                  <div className="text-[9px] text-zinc-500 font-medium">{formatFreq(freq)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="px-5 py-4 border-t border-zinc-800/50">
        <button
          onClick={() => applyPreset('Flat')}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors text-[13px] font-medium"
        >
          <RotateCcw size={13} />
          Reset to Flat
        </button>
      </div>
    </div>
  );
};
