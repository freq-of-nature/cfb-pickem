'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@/types';

interface AuthState {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  login: (firstName: string, lastName: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  register: (firstName: string, lastName: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  adminLogin: (username: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const stored = localStorage.getItem('cfb_session');
    if (stored) {
      try {
        const session = JSON.parse(stored);
        if (session.isAdmin) {
          setIsAdmin(true);
        } else {
          setUser(session.user);
        }
      } catch {
        localStorage.removeItem('cfb_session');
      }
    }
    setLoading(false);
  }, []);

  const login = async (firstName: string, lastName: string, pin: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, pin }),
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        setIsAdmin(false);
        localStorage.setItem('cfb_session', JSON.stringify({ user: data.user }));
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const register = async (firstName: string, lastName: string, pin: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, pin }),
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        setIsAdmin(false);
        localStorage.setItem('cfb_session', JSON.stringify({ user: data.user }));
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const adminLogin = async (username: string, pin: string) => {
    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin }),
      });
      const data = await res.json();
      if (data.success) {
        setIsAdmin(true);
        setUser(null);
        localStorage.setItem('cfb_session', JSON.stringify({ isAdmin: true }));
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch {
      return { success: false, error: 'Network error' };
    }
  };

  const logout = () => {
    setUser(null);
    setIsAdmin(false);
    localStorage.removeItem('cfb_session');
  };

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, login, register, adminLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
