// src/lib/memberships.ts — demo mode
import { DEMO_MEMBERSHIPS } from './mock-data';

export const MEMBERSHIPS_PATH = '/api/memberships';

export type MembershipRole = 'OWNER' | 'ADMIN' | 'AGENT' | 'VIEWER';

export type Membership = {
  id: string;
  userId: string;
  role: MembershipRole;
  isActive: boolean;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
};

export type MembershipOption = {
  id: string;
  userId: string;
  role: MembershipRole;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
};

export async function listMemberships(_token: string): Promise<Membership[]> {
  return DEMO_MEMBERSHIPS.map(m => ({
    id: m.id,
    userId: m.userId,
    role: m.role as MembershipRole,
    isActive: m.isActive,
    user: {
      id: m.user.id,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
    },
  }));
}

export async function updateMembershipRole(
  _token: string,
  _id: string,
  _role: Exclude<MembershipRole, 'OWNER'>,
): Promise<Membership> {
  return {
    id: DEMO_MEMBERSHIPS[0].id,
    userId: DEMO_MEMBERSHIPS[0].userId,
    role: DEMO_MEMBERSHIPS[0].role as MembershipRole,
    isActive: DEMO_MEMBERSHIPS[0].isActive,
    user: {
      id: DEMO_MEMBERSHIPS[0].user.id,
      email: DEMO_MEMBERSHIPS[0].user.email,
      firstName: DEMO_MEMBERSHIPS[0].user.firstName,
      lastName: DEMO_MEMBERSHIPS[0].user.lastName,
    },
  };
}

export function deactivateMembership(_token: string, _id: string): Promise<void> {
  return Promise.resolve();
}

export async function listMembershipOptions(_token: string): Promise<MembershipOption[]> {
  return DEMO_MEMBERSHIPS.map(m => ({
    id: m.id,
    userId: m.userId,
    role: m.role as MembershipRole,
    user: {
      id: m.user.id,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
    },
  }));
}
