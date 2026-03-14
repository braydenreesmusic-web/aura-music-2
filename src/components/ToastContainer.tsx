import React from 'react';
import { usePlayer } from '../store/PlayerContext';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = usePlayer();

  if (toasts.length === 0) return null;

  const icons = {
    success: <CheckCircle size={16} className="text-emerald-400 shrink-0" />,
    error: <AlertCircle size={16} className="text-red-400 shrink-0" />,
    info: <Info size={16} className="text-indigo-400 shrink-0" />,
  };

  const borders = {
    success: 'border-emerald-500/30',
    error: 'border-red-500/30',
    info: 'border-indigo-500/30',
  };

  return (
    <div className="fixed bottom-28 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 bg-zinc-900/95 backdrop-blur-md border ${borders[toast.type]} rounded-xl px-4 py-3 shadow-2xl animate-slide-in min-w-[280px]`}
        >
          {icons[toast.type]}
          <span className="text-sm text-zinc-200 flex-1">{toast.message}</span>
          <button onClick={() => dismissToast(toast.id)} className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};
