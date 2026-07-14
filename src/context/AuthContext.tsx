// src/context/AuthContext.tsx
import { createContext, useContext, useState, type ReactNode } from 'react';
import { DEMO_USER } from '../lib/mock-data';

export type AuthUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
};

type LoginInput = {
  email: string;
  password: string;
};

type AuthContextValue = {
  accessToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  login: (input: LoginInput) => Promise<void>;
  loginWithTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user] = useState<AuthUser>(DEMO_USER);

  const value: AuthContextValue = {
    accessToken: 'demo-token',
    user,
    isAuthenticated: true,
    isBootstrapping: false,
    login: async () => {},
    loginWithTokens: async () => {},
    logout: async () => {},
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider.');
  return ctx;
}
