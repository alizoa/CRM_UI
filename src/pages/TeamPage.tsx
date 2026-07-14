import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import {
  deactivateMembership,
  listMemberships,
  updateMembershipRole,
  type Membership,
  type MembershipRole,
} from '../lib/memberships';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  type Invitation,
  type InvitationRole,
} from '../lib/invitations';
import type { HttpError } from '../lib/http';

type RequestError = {
  status: number;
  message: string;
};

function toRequestError(error: unknown, fallback: string): RequestError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const httpError = error as HttpError;
    return {
      status: httpError.status,
      message: getFriendlyMessage(httpError.status, httpError.message || fallback),
    };
  }
  return { status: 0, message: fallback };
}

function getFriendlyMessage(status: number, fallback: string): string {
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 409) return 'This person is already a team member or has a pending invitation.';
  if (status === 404) return 'This record no longer exists.';
  return fallback;
}

function memberDisplayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const parts = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return parts.length > 0 ? parts : user.email;
}

function roleBadgeClass(role: MembershipRole | InvitationRole): string {
  if (role === 'OWNER') return 'bg-purple-100 text-purple-800';
  if (role === 'ADMIN') return 'bg-blue-100 text-blue-800';
  if (role === 'AGENT') return 'bg-emerald-100 text-emerald-800';
  return 'bg-gray-100 text-gray-700';
}

function roleLabel(role: MembershipRole | InvitationRole): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

const ASSIGNABLE_ROLES: { value: InvitationRole; label: string; description: string }[] = [
  { value: 'ADMIN', label: 'Admin', description: 'Can manage team, settings, and all records' },
  { value: 'AGENT', label: 'Agent', description: 'Can work contacts, orders, and tasks' },
  { value: 'VIEWER', label: 'Viewer', description: 'Read-only access to all records' },
];

export function TeamPage() {
  const { accessToken, user } = useAuth();

  const [members, setMembers] = useState<Membership[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<RequestError | null>(null);
  const [actionError, setActionError] = useState<RequestError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InvitationRole>('AGENT');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<RequestError | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // In-flight IDs
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const currentMembership = members.find((m) => m.userId === user?.id);
  const isManager =
    currentMembership?.role === 'OWNER' || currentMembership?.role === 'ADMIN';

  const fetchData = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [membersData, invitationsData] = await Promise.all([
        listMemberships(accessToken),
        listInvitations(accessToken),
      ]);
      setMembers(membersData);
      setInvitations(invitationsData);
    } catch (err) {
      setError(toRequestError(err, 'Could not load team data. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  function openInviteModal() {
    setInviteEmail('');
    setInviteRole('AGENT');
    setInviteError(null);
    setCreatedToken(null);
    setCreatedEmail(null);
    setCopied(false);
    setShowInviteModal(true);
  }

  function closeInviteModal() {
    setShowInviteModal(false);
    setCreatedToken(null);
    setCreatedEmail(null);
  }

  async function handleInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accessToken) return;

    const trimmedEmail = inviteEmail.trim();
    if (!trimmedEmail) {
      setInviteError({ status: 0, message: 'Email is required.' });
      return;
    }

    setInviting(true);
    setInviteError(null);

    try {
      const result = await createInvitation(accessToken, {
        email: trimmedEmail,
        role: inviteRole,
      });
      setCreatedToken(result.token);
      setCreatedEmail(result.email);
      setCopied(false);
      // Refresh invitation list in background
      listInvitations(accessToken)
        .then(setInvitations)
        .catch(() => undefined);
    } catch (err) {
      setInviteError(toRequestError(err, 'Could not send invitation. Please try again.'));
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(membershipId: string, newRole: InvitationRole) {
    if (!accessToken) return;
    setChangingRoleId(membershipId);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const updated = await updateMembershipRole(accessToken, membershipId, newRole);
      setMembers((prev) =>
        prev.map((m) => (m.id === membershipId ? { ...m, role: updated.role } : m)),
      );
      setSuccessMessage('Role updated.');
    } catch (err) {
      setActionError(toRequestError(err, 'Could not update role. Please try again.'));
    } finally {
      setChangingRoleId(null);
    }
  }

  async function handleDeactivate(membership: Membership) {
    if (!accessToken) return;
    const name = memberDisplayName(membership.user);
    if (!window.confirm(`Remove ${name} from the team? They will lose access immediately.`)) return;
    setDeactivatingId(membership.id);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await deactivateMembership(accessToken, membership.id);
      setMembers((prev) => prev.filter((m) => m.id !== membership.id));
      setSuccessMessage(`${name} has been removed from the team.`);
    } catch (err) {
      setActionError(toRequestError(err, 'Could not remove member. Please try again.'));
    } finally {
      setDeactivatingId(null);
    }
  }

  async function handleRevoke(invitation: Invitation) {
    if (!accessToken) return;
    if (!window.confirm(`Revoke the invitation for ${invitation.email}?`)) return;
    setRevokingId(invitation.id);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await revokeInvitation(accessToken, invitation.id);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitation.id));
      setSuccessMessage(`Invitation for ${invitation.email} has been revoked.`);
    } catch (err) {
      setActionError(toRequestError(err, 'Could not revoke invitation. Please try again.'));
    } finally {
      setRevokingId(null);
    }
  }

  function buildInviteLink(token: string): string {
    return `${window.location.origin}/accept-invite?token=${token}`;
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — user can copy manually
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Team</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage your team members and pending invitations.
            </p>
          </div>
          {isManager && (
            <button
              className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              disabled={loading}
              onClick={openInviteModal}
              type="button"
            >
              Invite member
            </button>
          )}
        </div>

        {/* Read-only notice for non-managers */}
        {!loading && currentMembership && !isManager && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            You have view-only access to team management. Contact an Admin or Owner to make changes.
          </div>
        )}

        {/* Load error */}
        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error.message}
          </div>
        )}

        {/* Action error */}
        {actionError && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
            {actionError.message}
          </div>
        )}

        {/* Success */}
        {successMessage && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {successMessage}
          </div>
        )}

        {/* Members section */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Members</h2>
          </div>

          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">Loading team...</div>
          ) : members.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">No members found.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {members.map((member) => {
                const isCurrentUser = member.userId === user?.id;
                const isOwner = member.role === 'OWNER';
                const canAct = isManager && !isCurrentUser && !isOwner;

                return (
                  <div
                    className={[
                      'flex items-center gap-4 px-5 py-3',
                      isCurrentUser ? 'bg-gray-50/60' : '',
                    ].join(' ')}
                    key={member.id}
                  >
                    {/* Avatar initials */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700 select-none">
                      {(
                        member.user.firstName?.[0] ?? member.user.email[0]
                      ).toUpperCase()}
                    </div>

                    {/* Name + email */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-gray-900">
                          {memberDisplayName(member.user)}
                        </span>
                        {isCurrentUser && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-600">
                            You
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-gray-500">{member.user.email}</p>
                    </div>

                    {/* Role badge or selector */}
                    <div className="shrink-0">
                      {canAct ? (
                        <select
                          aria-label="Change role"
                          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700 disabled:opacity-50"
                          disabled={changingRoleId === member.id}
                          onChange={(e) => {
                            void handleRoleChange(member.id, e.target.value as InvitationRole);
                          }}
                          value={member.role}
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={[
                            'rounded px-2 py-0.5 text-xs font-semibold',
                            roleBadgeClass(member.role),
                          ].join(' ')}
                        >
                          {roleLabel(member.role)}
                        </span>
                      )}
                    </div>

                    {/* Remove button */}
                    <div className="w-20 shrink-0 text-right">
                      {canAct && (
                        <button
                          className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
                          disabled={deactivatingId === member.id}
                          onClick={() => void handleDeactivate(member)}
                          type="button"
                        >
                          {deactivatingId === member.id ? 'Removing…' : 'Remove'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Pending invitations */}
        {!loading && invitations.length > 0 && (
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Pending Invitations</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {invitations.map((inv) => (
                <div className="flex items-center gap-4 px-5 py-3" key={inv.id}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{inv.email}</p>
                    <p className="text-xs text-gray-500">
                      Invited {formatDate(inv.createdAt)} · Expires {formatDate(inv.expiresAt)}
                    </p>
                  </div>
                  <span
                    className={[
                      'shrink-0 rounded px-2 py-0.5 text-xs font-semibold',
                      roleBadgeClass(inv.role),
                    ].join(' ')}
                  >
                    {roleLabel(inv.role)}
                  </span>
                  <div className="w-20 shrink-0 text-right">
                    {isManager && (
                      <button
                        className="text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
                        disabled={revokingId === inv.id}
                        onClick={() => void handleRevoke(inv)}
                        type="button"
                      >
                        {revokingId === inv.id ? 'Revoking…' : 'Revoke'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Invite modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Invite team member</h2>
            </div>

            {createdToken ? (
              /* Post-invite: show one-time link */
              <div className="space-y-4 px-6 py-5">
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Invitation created for <strong>{createdEmail}</strong>. Copy the link below and
                  share it — it is shown only once and will expire.
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Invite link
                  </label>
                  <div className="flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700"
                      onFocus={(e) => e.currentTarget.select()}
                      readOnly
                      value={buildInviteLink(createdToken)}
                    />
                    <button
                      className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                      onClick={() => void copyToClipboard(buildInviteLink(createdToken))}
                      type="button"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    This link will not be shown again after you close this dialog.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    onClick={() => {
                      setCreatedToken(null);
                      setCreatedEmail(null);
                      setInviteEmail('');
                      setInviteRole('AGENT');
                    }}
                    type="button"
                  >
                    Invite another
                  </button>
                  <button
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    onClick={closeInviteModal}
                    type="button"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Invite form */
              <form onSubmit={(e) => void handleInvite(e)}>
                <div className="space-y-4 px-6 py-5">
                  {inviteError && (
                    <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
                      {inviteError.message}
                    </div>
                  )}
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-semibold text-gray-700"
                      htmlFor="invite-email"
                    >
                      Email address
                    </label>
                    <input
                      autoComplete="off"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none disabled:bg-gray-50"
                      disabled={inviting}
                      id="invite-email"
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@example.com"
                      required
                      type="email"
                      value={inviteEmail}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1.5 block text-xs font-semibold text-gray-700"
                      htmlFor="invite-role"
                    >
                      Role
                    </label>
                    <select
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none disabled:bg-gray-50"
                      disabled={inviting}
                      id="invite-role"
                      onChange={(e) => setInviteRole(e.target.value as InvitationRole)}
                      value={inviteRole}
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      {ASSIGNABLE_ROLES.find((r) => r.value === inviteRole)?.description}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
                  <button
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    disabled={inviting}
                    onClick={closeInviteModal}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    disabled={inviting}
                    type="submit"
                  >
                    {inviting ? 'Sending…' : 'Send invite'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
