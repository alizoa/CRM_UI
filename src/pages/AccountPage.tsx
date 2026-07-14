import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import type { HttpError } from '../lib/http';
import {
  changePassword,
  getUserProfile,
  updateUserProfile,
  type UpdateUserProfileInput,
  type UserProfile,
} from '../lib/users';

type AccountFormState = {
  firstName: string;
  lastName: string;
  phone: string;
};

type PasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type RequestError = {
  status: number;
  message: string;
};

function toRequestError(error: unknown, fallback: string): RequestError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const httpError = error as HttpError;

    return {
      status: httpError.status,
      message: httpError.message || fallback,
    };
  }

  return {
    status: 0,
    message: fallback,
  };
}

function getFormState(profile: UserProfile): AccountFormState {
  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    phone: profile.phone ?? '',
  };
}

function getUpdateInput(form: AccountFormState): UpdateUserProfileInput {
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const phone = form.phone.trim();
  const input: UpdateUserProfileInput = {};

  if (firstName) {
    input.firstName = firstName;
  }

  if (lastName) {
    input.lastName = lastName;
  }

  input.phone = phone || null;

  return input;
}

const EMPTY_PASSWORD_FORM: PasswordFormState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export function AccountPage() {
  const { accessToken } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<AccountFormState>({ firstName: '', lastName: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<RequestError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(EMPTY_PASSWORD_FORM);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<RequestError | null>(null);
  const [passwordSuccessMessage, setPasswordSuccessMessage] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!accessToken) {
      setProfile(null);
      setForm({ firstName: '', lastName: '', phone: '' });
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await getUserProfile(accessToken);
      setProfile(response);
      setForm(getFormState(response));
    } catch (requestError) {
      setProfile(null);
      setForm({ firstName: '', lastName: '', phone: '' });
      setError(toRequestError(requestError, 'Could not load your account profile.'));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setSaveError({
        status: 401,
        message: 'You need to sign in before updating your account.',
      });
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSuccessMessage(null);

    try {
      const response = await updateUserProfile(accessToken, getUpdateInput(form));
      setProfile(response);
      setForm(getFormState(response));
      setSuccessMessage('Account profile updated.');
    } catch (requestError) {
      setSaveError(toRequestError(requestError, 'Could not update your account profile.'));
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccessMessage(null);

    if (!accessToken) {
      setPasswordError({
        status: 401,
        message: 'You need to sign in before changing your password.',
      });
      return;
    }

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError({ status: 0, message: 'All password fields are required.' });
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError({ status: 0, message: 'New password must be at least 8 characters.' });
      return;
    }

    if (passwordForm.newPassword.length > 72) {
      setPasswordError({ status: 0, message: 'New password must be 72 characters or fewer.' });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError({ status: 0, message: 'New password and confirmation must match.' });
      return;
    }

    setChangingPassword(true);

    try {
      await changePassword(accessToken, {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm(EMPTY_PASSWORD_FORM);
      setPasswordSuccessMessage('Password changed successfully.');
    } catch (requestError) {
      setPasswordError(toRequestError(requestError, 'Could not change your password.'));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Account</h1>
          <p className="mt-1 text-sm text-gray-600">Manage the name shown on your notes and activities.</p>
        </div>

        {loading ? <p className="rounded border border-gray-200 bg-white p-5 text-sm text-gray-700">Loading account...</p> : null}

        {!loading && error ? (
          <div className="rounded border border-red-200 bg-white p-5">
            <h2 className="text-base font-semibold text-red-900">Could not load account</h2>
            <p className="mt-2 text-sm text-red-700">{error.message}</p>
            <button
              type="button"
              onClick={() => {
                void fetchProfile();
              }}
              className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Retry
            </button>
          </div>
        ) : null}

        {!loading && !error && profile ? (
          <>
            <section className="rounded border border-gray-200 bg-white p-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Profile</h2>
              <p className="mt-1 text-sm text-gray-600">Update your personal display name.</p>
            </div>

            {successMessage ? <p className="mt-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{successMessage}</p> : null}

            <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 sm:col-span-2">
                Email
                <input
                  type="email"
                  value={profile.email}
                  readOnly
                  className="rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-normal text-gray-600"
                  autoComplete="email"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                First name
                <input
                  value={form.firstName}
                  onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  autoComplete="given-name"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                Last name
                <input
                  value={form.lastName}
                  onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  autoComplete="family-name"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 sm:col-span-2">
                Phone
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  maxLength={32}
                  placeholder="Your phone number (optional)"
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  autoComplete="tel"
                />
                <span className="text-xs font-normal text-gray-500">Personal account phone, not a customer contact number.</span>
              </label>
              <div className="sm:col-span-2">
                {saveError ? <p className="mb-3 text-sm text-red-700">{saveError.message}</p> : null}
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
            </section>

            <section className="rounded border border-gray-200 bg-white p-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Change password</h2>
                <p className="mt-1 text-sm text-gray-600">Use 8 to 72 characters for your new password.</p>
              </div>

              {passwordSuccessMessage ? (
                <p className="mt-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  {passwordSuccessMessage}
                </p>
              ) : null}

              <form className="mt-6 grid max-w-xl gap-4" onSubmit={handlePasswordSubmit}>
                <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                  Current password
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))
                    }
                    required
                    autoComplete="current-password"
                    className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                  New password
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
                    }
                    minLength={8}
                    maxLength={72}
                    required
                    autoComplete="new-password"
                    className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                  Confirm new password
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                    }
                    minLength={8}
                    maxLength={72}
                    required
                    autoComplete="new-password"
                    className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                </label>
                <div>
                  {passwordError ? <p className="mb-3 text-sm text-red-700">{passwordError.message}</p> : null}
                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
                  >
                    {changingPassword ? 'Changing password...' : 'Change password'}
                  </button>
                </div>
              </form>
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
