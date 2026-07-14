import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { HttpError } from '../lib/http';
import { requestPasswordReset } from '../lib/password-reset';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSubmitted(true);
    } catch (caughtError) {
      const httpError = caughtError as HttpError;
      setError(
        httpError.status === 0
          ? 'Something went wrong. Please check your connection and try again.'
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm rounded border border-gray-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-gray-900">Forgot your password?</h1>
        {submitted ? (
          <>
            <p className="mt-4 text-sm text-gray-600">
              If that email address is in our system, you will receive a reset link shortly.
              Check your inbox.
            </p>
            <Link className="mt-6 inline-block text-sm font-medium text-gray-900 underline" to="/login">
              Back to login
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="mt-2 text-sm text-gray-500">
              Enter your email address and we will send you a password reset link.
            </p>
            <label className="mt-6 block text-sm font-medium text-gray-700" htmlFor="email">
              Email
            </label>
            <input
              autoComplete="email"
              autoFocus
              className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
            {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
            <button
              className="mt-6 w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? 'Sending...' : 'Send reset link'}
            </button>
            <Link className="mt-4 block text-center text-sm text-gray-600 underline" to="/login">
              Back to login
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
