// src/lib/users.ts — demo mode
import { DEMO_USER } from './mock-data';

export const USERS_ME_PATH = '/api/users/me';
export const USERS_ME_PASSWORD_PATH = '/api/users/me/password';

export type UserProfile = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

export type UpdateUserProfileInput = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
};

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

const DEMO_PROFILE: UserProfile = {
  id: DEMO_USER.id,
  email: DEMO_USER.email,
  firstName: DEMO_USER.firstName,
  lastName: DEMO_USER.lastName,
  phone: DEMO_USER.phone,
  avatarUrl: DEMO_USER.avatarUrl,
  createdAt: DEMO_USER.createdAt,
};

export function getUserProfile(_token: string): Promise<UserProfile> {
  return Promise.resolve(DEMO_PROFILE);
}

export function updateUserProfile(_token: string, _input: UpdateUserProfileInput): Promise<UserProfile> {
  return Promise.resolve(DEMO_PROFILE);
}

export function changePassword(_token: string, _input: ChangePasswordInput): Promise<void> {
  return Promise.resolve();
}
