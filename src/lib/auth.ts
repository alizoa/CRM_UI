// src/lib/auth.ts
import { DEMO_USER } from './mock-data';

export const AUTH_LOGIN_PATH = '/api/auth/login';
export const AUTH_LOGOUT_PATH = '/api/auth/logout';
export const AUTH_ME_PATH = '/api/auth/me';
export const AUTH_REFRESH_PATH = '/api/auth/refresh';

export type AuthUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
};

export async function loginRequest(_email: string, _password: string): Promise<{ accessToken: string; refreshToken: string }> {
  return { accessToken: 'demo-token', refreshToken: 'demo-refresh' };
}

export async function getCurrentUserRequest(_token: string): Promise<AuthUser> {
  return DEMO_USER;
}

export async function refreshRequest(_refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  return { accessToken: 'demo-token', refreshToken: 'demo-refresh' };
}

export async function logoutRequest(_token: string, _refreshToken: string): Promise<void> {}
