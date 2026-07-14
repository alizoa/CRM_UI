// src/lib/invitations.ts — demo mode

export const INVITATIONS_PATH = '/api/invitations';

export type InvitationRole = 'ADMIN' | 'AGENT' | 'VIEWER';

export type Invitation = {
  id: string;
  email: string;
  role: InvitationRole;
  expiresAt: string;
  createdAt: string;
};

export type InvitationWithToken = Invitation & {
  token: string;
};

export type CreateInvitationInput = {
  email: string;
  role: InvitationRole;
};

export async function createInvitation(
  _token: string,
  input: CreateInvitationInput,
): Promise<InvitationWithToken> {
  return {
    id: 'inv-demo-001',
    email: input.email,
    role: input.role,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    token: 'demo-invite-token',
  };
}

export async function listInvitations(_token: string): Promise<Invitation[]> {
  return [];
}

export function revokeInvitation(_token: string, _id: string): Promise<void> {
  return Promise.resolve();
}

export type AcceptInvitationInput = {
  token: string;
  firstName: string;
  lastName?: string;
  password: string;
};

export type AcceptInvitationResult = {
  accessToken: string;
  refreshToken: string;
};

export function acceptInvitation(_input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
  return Promise.resolve({ accessToken: 'demo-token', refreshToken: 'demo-refresh' });
}
