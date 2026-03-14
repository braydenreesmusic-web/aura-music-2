import React from 'react';
import { X, Loader2 } from 'lucide-react';
import { accountSync, type AccountUser } from '../services/accountSync';

export const AuthModal: React.FC<{
  onClose: () => void;
  onSignedIn: (user: AccountUser) => void;
}> = ({ onClose, onSignedIn }) => {
  const [mode, setMode] = React.useState<'login' | 'register'>('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = mode === 'login'
        ? await accountSync.login(email, password)
        : await accountSync.register(email, password);
      onSignedIn(user);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to authenticate';
      if (message.toLowerCase().includes('invalid credentials')) {
        setError('Invalid email/password. If backend redeployed on free hosting, your account may have reset — try Create Account again.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md mx-4 bg-zinc-900 border border-zinc-700/50 rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
          <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-zinc-200 rounded-lg hover:bg-zinc-800">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50"
          />

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-2">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading || !email || !password}
            className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : null}
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          <button
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="w-full text-xs text-zinc-400 hover:text-zinc-200"
          >
            {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};
