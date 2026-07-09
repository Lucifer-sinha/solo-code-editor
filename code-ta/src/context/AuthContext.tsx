import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSocket } from '../utils/socket';
import { getApiUrl } from '../config/api';

export interface AuthContextType {
  user: any;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwt') || null);
  const [loading, setLoading] = useState(false);
  const socket = getSocket();

  useEffect(() => {
    console.log('AuthContext useEffect', { token, user });
    if (!token) {
      setUser(null);
      return;
    }
    fetch(getApiUrl('auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.username) setUser(data);
        else setUser(null);
      })
      .catch(() => setUser(null));
  }, [token]); // Only depend on token

  // Emit user-online event after login
  useEffect(() => {
    if (user?.username && user?.id) {
      console.log('[AuthContext] Emitting user-online for:', user.username, user.id);
      socket.emit('user-online', { username: user.username, userId: user.id });
    }
  }, [user, socket]);

  const login = async (username: string, password: string) => {
    setLoading(true);
    const res = await fetch(getApiUrl('auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('jwt', data.token);
    } else {
      throw new Error(data.error || 'Login failed');
    }
    setLoading(false);
  };

  const register = async (username: string, email: string, password: string) => {
    setLoading(true);
    const res = await fetch(getApiUrl('auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Register failed');
    setLoading(false);
    return true;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('jwt');
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
} 