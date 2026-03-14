import React from 'react';
import { usePlayer } from '../store/PlayerContext';
import { InsightsPanel } from './InsightsPanel';
import { ArrowLeft, Sparkles } from 'lucide-react';

export const InsightsPage: React.FC = () => {
  const { tracks, setViewMode } = usePlayer();

  return (
    <div className="flex-1 overflow-y-auto relative">
      <div className="relative p-8 max-w-7xl mx-auto">
        <button
          onClick={() => setViewMode('all')}
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-5 transition-colors"
        >
          <ArrowLeft size={15} />
          Back to Library
        </button>

        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/70 text-zinc-300 text-xs font-medium mb-3">
              <Sparkles size={12} />
              Insights Dashboard
            </div>
            <h1 className="text-5xl font-extrabold text-white tracking-tight mb-1.5 drop-shadow-lg">Your Listening Intelligence</h1>
            <p className="text-zinc-400 text-sm">Stats, streaks, and top picks—beautifully summarized.</p>
          </div>
        </div>

        <InsightsPanel tracks={tracks} />
      </div>
    </div>
  );
};
