import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, type Location } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { HttpError } from '../lib/http';

type LoginLocationState = {
  from?: Location;
};

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const state = location.state as LoginLocationState | null;
  const redirectTo = state?.from
    ? `${state.from.pathname}${state.from.search}${state.from.hash}`
    : '/dashboard';

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setIsSubmitting(true);

    try {
      await login({ email: email.trim(), password });
      navigate(redirectTo, { replace: true });
    } catch (caughtError) {
      const httpError = caughtError as HttpError;

      if (httpError.status === 401) {
        setError('Invalid email or password.');
      } else if (httpError.status === 0) {
        setError('Could not reach the server. Please check your connection.');
      } else {
        setError(httpError.message || 'Sign in failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <form className="w-full max-w-sm rounded border border-gray-200 bg-white p-6" onSubmit={handleSubmit}>
        <h1 className="text-2xl font-semibold text-gray-900">Login</h1>

        <label className="mt-6 block text-sm font-medium text-gray-700" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="email"
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />

        <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="current-password"
          className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-900"
          id="password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
        <Link className="mt-2 block text-right text-sm text-gray-600 underline" to="/forgot-password">
          Forgot password?
        </Link>

        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

        <button
          className="mt-6 w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
