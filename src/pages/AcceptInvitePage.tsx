import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { acceptInvitation } from '../lib/invitations';
import type { HttpError } from '../lib/http';

function friendlyError(err: HttpError): string {
  if (err.status === 0) {
    return 'Could not reach the server. Please check your connection.';
  }
  if (err.status === 404) {
    return 'This invite link is invalid or has been revoked.';
  }
  if (err.status === 409) {
    const msg = err.message.toLowerCase();
    if (msg.includes('already been accepted')) {
      return 'This invitation has already been used.';
    }
    if (msg.includes('already a member')) {
      return 'You are already a member of this workspace.';
    }
    return 'This invitation is no longer valid.';
  }
  if (err.status === 400) {
    const msg = err.message.toLowerCase();
    if (msg.includes('expired')) {
      return 'This invitation has expired. Please ask for a new one.';
    }
    if (msg.includes('password')) {
      return err.message;
    }
    return err.message || 'Invalid request.';
  }
  return 'Something went wrong. Please try again.';
}

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { loginWithTokens } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-sm rounded border border-gray-200 bg-white p-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Invalid invite link</h1>
          <p className="mt-2 text-sm text-gray-500">
            This link is missing a token. Please use the invite link you received.
          </p>
        </div>
      </main>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await acceptInvitation({
        token: token!,
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        password,
      });

      await loginWithTokens(result.accessToken, result.refreshToken);
      setSucceeded(true);
      setTimeout(() => navigate('/dashboard', { replace: true }), 800);
    } catch (caughtError) {
      setError(friendlyError(caughtError as HttpError));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (succeeded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-sm rounded border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm font-medium text-green-700">Welcome aboard! Redirecting...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <form
        className="w-full max-w-sm rounded border border-gray-200 bg-white p-6"
        onSubmit={handleSubmit}
      >
        <h1 className="text-2xl font-semibold text-gray-900">Accept your invitation</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create your account to join this company workspace.
        </p>

        <label className="mt-6 block text-sm font-medium text-gray-700" htmlFor="firstName">
          First name
        </label>
        <input
          autoComplete="given-name"
          autoFocus
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
          id="firstName"
          name="firstName"
          onChange={(e) => setFirstName(e.target.value)}
          type="text"
          value={firstName}
        />

        <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="lastName">
          Last name <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          autoComplete="family-name"
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
          id="lastName"
          name="lastName"
          onChange={(e) => setLastName(e.target.value)}
          type="text"
          value={lastName}
        />

        <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="new-password"
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
          id="password"
          name="password"
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          value={password}
        />
        <p className="mt-1 text-xs text-gray-400">Minimum 8 characters.</p>

        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

        <button
          className="mt-6 w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Setting up your account...' : 'Accept invitation'}
        </button>
      </form>
    </main>
  );
}
