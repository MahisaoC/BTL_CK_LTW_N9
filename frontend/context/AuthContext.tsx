import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  auth,
  clearGmailAccessToken,
  connectGmailWithPopup,
  getGmailAccessToken,
} from '../utils/firebase';
import type { User } from '../types/travel';
import { apiRequest, getStoredToken, setStoredToken } from '../utils/api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  serverMailerReady: boolean;
  login: (identifier: string, password: string) => Promise<User>;
  loginWithGoogle: () => Promise<User>;
  ensureGmailTokenForEmailSend: (forcePopup?: boolean) => Promise<string>;
  register: (payload: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    homeCity?: string;
    bio?: string;
    verificationCode: string;
  }) => Promise<User>;
  logout: () => void;
  updateCurrentUser: (nextUser: User) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [serverMailerReady, setServerMailerReady] = useState<boolean>(true);

  useEffect(() => {
    apiRequest<{ ready: boolean }>('/api/auth/mailer-status')
      .then((res) => setServerMailerReady(res.ready ?? true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          const gmailToken = getGmailAccessToken();
          const data = await apiRequest<{ user: User; token: string }>(
            '/api/auth/firebase',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({
                idToken,
                gmailAccessToken: gmailToken || undefined,
              }),
            }
          );
          if (data.token) {
            setStoredToken(data.token);
          }
          setUser(data.user);
        } catch {
          if (getStoredToken()) {
            try {
              const me = await apiRequest<{ user: User }>('/api/auth/me');
              setUser(me.user);
            } catch {
              setStoredToken(null);
              setUser(null);
            }
          }
        } finally {
          setLoading(false);
        }
      } else if (getStoredToken()) {
        try {
          const me = await apiRequest<{ user: User }>('/api/auth/me');
          setUser(me.user);
        } catch {
          setStoredToken(null);
          setUser(null);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (identifier: string, password: string): Promise<User> => {
    const data = await apiRequest<{ user: User; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    setStoredToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<User> => {
    const { idToken, accessToken } = await connectGmailWithPopup();

    const data = await apiRequest<{ user: User; token: string }>('/api/auth/firebase', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ idToken, gmailAccessToken: accessToken }),
    });
    setStoredToken(data.token || idToken);
    setUser(data.user);
    return data.user;
  }, []);

  // Không bao giờ bật popup bắt người dùng đăng nhập Gmail khi bấm Gửi mã OTP (luôn gửi trực tiếp từ email hệ thống luhanhvietltw@gmail.com ở Backend)
  const ensureGmailTokenForEmailSend = useCallback(async (): Promise<string> => {
    return '';
  }, []);

  const register = useCallback(
    async (payload: {
      fullName: string;
      username: string;
      email: string;
      password: string;
      homeCity?: string;
      bio?: string;
      verificationCode: string;
    }): Promise<User> => {
      const data = await apiRequest<{ user: User; token: string }>(
        '/api/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      setStoredToken(data.token);
      setUser(data.user);
      return data.user;
    },
    []
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    clearGmailAccessToken();
    setUser(null);
    signOut(auth).catch(() => {});
  }, []);

  const updateCurrentUser = useCallback((nextUser: User) => {
    setUser(nextUser);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        serverMailerReady,
        login,
        loginWithGoogle,
        ensureGmailTokenForEmailSend,
        register,
        logout,
        updateCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
