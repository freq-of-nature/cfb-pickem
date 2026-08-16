'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const { user, isAdmin, loading, login, register, adminLogin } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'register' | 'admin'>('login');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [pin, setPin] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already logged in
  if (!loading && user) {
    router.push('/picks');
    return null;
  }
  if (!loading && isAdmin) {
    router.push('/admin');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    let result;

    if (mode === 'admin') {
      result = await adminLogin(username, pin);
      if (result.success) {
        router.push('/admin');
      }
    } else if (mode === 'register') {
      result = await register(firstName, lastName, pin);
      if (result.success) {
        router.push('/picks');
      }
    } else {
      result = await login(firstName, lastName, pin);
      if (result.success) {
        router.push('/picks');
      }
    }

    if (result && !result.success) {
      setError(result.error || 'Something went wrong');
    }

    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">🏈 CFB Pick&apos;em</h1>
          <p className="text-gray-400">Pick against the spread. Compete with friends.</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          {/* Mode Tabs */}
          <div className="flex rounded-lg bg-gray-800 p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'login' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'register' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Register
            </button>
            <button
              onClick={() => { setMode('admin'); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'admin' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Admin
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'admin' ? (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
                  placeholder="Admin username"
                  required
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
                    placeholder="John"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
                    placeholder="Smith"
                    required
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                {mode === 'admin' ? 'Admin PIN' : '4-Digit PIN'}
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setPin(val);
                }}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 tracking-[0.5em] text-center text-lg"
                placeholder="• • • •"
                inputMode="numeric"
                maxLength={4}
                required
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm text-center bg-red-400/10 py-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || pin.length < 4}
              className="w-full py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? 'Loading...'
                : mode === 'register'
                ? 'Create Account'
                : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
