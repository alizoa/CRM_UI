import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { HttpError } from '../lib/http';
import { resetPassword } from '../lib/password-reset';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [state, setState] = useState<'form' | 'success' | 'invalid'>('form');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(token!, password);
      setState('success');
    } catch (caughtError) {
      const httpError = caughtError as HttpError;
      if (httpError.status === 400) {
        setState('invalid');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token || state === 'invalid') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-sm rounded border border-gray-200 bg-white p-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Invalid reset link</h1>
          <p className="mt-2 text-sm text-gray-500">
            This reset link is invalid or has expired. Please request a new one.
          </p>
          <Link className="mt-6 inline-block text-sm font-medium text-gray-900 underline" to="/forgot-password">
            Request a new link
          </Link>
        </div>
      </main>
    );
  }

  if (state === 'success') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-sm rounded border border-gray-200 bg-white p-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Password reset</h1>
          <p className="mt-2 text-sm text-gray-600">
            Your password has been reset. You can now log in.
          </p>
          <Link className="mt-6 inline-block text-sm font-medium text-gray-900 underline" to="/login">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <form className="w-full max-w-sm rounded border border-gray-200 bg-white p-6" onSubmit={handleSubmit}>
        <h1 className="text-2xl font-semibold text-gray-900">Choose a new password</h1>
        <label className="mt-6 block text-sm font-medium text-gray-700" htmlFor="password">
          New password
        </label>
        <input
          autoComplete="new-password"
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
          id="password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
        <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="confirmPassword">
          Confirm password
        </label>
        <input
          autoComplete="new-password"
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
          id="confirmPassword"
          onChange={(event) => setConfirmPassword(event.target.value)}
          type="password"
          value={confirmPassword}
        />
        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        <button
          className="mt-6 w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Resetting...' : 'Reset password'}
        </button>
      </form>
    </main>
  );
}
