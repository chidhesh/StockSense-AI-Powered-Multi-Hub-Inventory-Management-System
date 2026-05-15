/* @refresh reset */
import { useEffect, useState, ReactNode, useCallback } from 'react';
import type { Profile } from '../types';
import { apiRequest, setAuthToken, getAuthToken } from '../lib/api';
import { AuthContext, type AuthUser } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFromToken = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest<{ user: AuthUser; profile: Profile }>('/api/auth/me');
      if (!data?.user?.id || !data?.profile?.id) {
        setAuthToken(null);
        setUser(null);
        setProfile(null);
      } else {
        setUser(data.user);
        setProfile(data.profile);
      }
    } catch {
      setAuthToken(null);
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFromToken();
  }, [loadFromToken]);

  const refreshProfile = async () => {
    if (!getAuthToken()) return;
    try {
      const data = await apiRequest<{ user: AuthUser; profile: Profile }>('/api/auth/me');
      if (!data?.user?.id || !data?.profile?.id) {
        setAuthToken(null);
        setUser(null);
        setProfile(null);
      } else {
        setUser(data.user);
        setProfile(data.profile);
      }
    } catch {
      setAuthToken(null);
      setUser(null);
      setProfile(null);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const data = await apiRequest<{ token: string; user: AuthUser; profile: Profile }>('/api/auth/login', {
        method: 'POST',
        json: { email, password },
      });
      setAuthToken(data.token);
      setUser(data.user);
      setProfile(data.profile);
      return { error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign in failed';
      return { error: new Error(msg) };
    }
  };

  const signUp = async (email: string, password: string, fullName: string, role: string, centerId?: string) => {
    try {
      await apiRequest('/api/auth/register', {
        method: 'POST',
        json: {
          email,
          password,
          full_name: fullName,
          role,
          center_id: centerId || null,
        },
      });
      return { error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Registration failed';
      return { error: new Error(msg) };
    }
  };

  const signOut = async () => {
    setAuthToken(null);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
