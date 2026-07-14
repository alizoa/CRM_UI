import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  COMPANY_TIMEZONES,
  getCompanySettings,
  updateCompanySettings,
  type CompanySettings,
} from '../../lib/company-settings';
import type { HttpError } from '../../lib/http';
import { listMemberships } from '../../lib/memberships';

type FormState = {
  name: string;
  timezone: string;
  businessHoursStart: string;
  businessHoursEnd: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  timezone: '',
  businessHoursStart: '',
  businessHoursEnd: '',
};

function toForm(settings: CompanySettings): FormState {
  return {
    name: settings.name,
    timezone: settings.timezone ?? '',
    businessHoursStart: settings.businessHoursStart ?? '',
    businessHoursEnd: settings.businessHoursEnd ?? '',
  };
}

function errorMessage(error: unknown, fallback: string) {
  const httpError = error as Partial<HttpError>;
  return typeof httpError?.message === 'string' ? httpError.message : fallback;
}

export function WorkspaceSettingsSection() {
  const { accessToken, user } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canSave, setCanSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      getCompanySettings(accessToken, controller.signal),
      listMemberships(accessToken),
    ])
      .then(([settings, memberships]) => {
        const nextForm = toForm(settings);
        const membership = memberships.find((item) => item.userId === user.id);
        setForm(nextForm);
        setInitialForm(nextForm);
        setCanSave(membership?.role === 'OWNER' || membership?.role === 'ADMIN');
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(requestError, 'Could not load workspace settings.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [accessToken, user]);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canSave || saving) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateCompanySettings(accessToken, {
        name: form.name,
        timezone: form.timezone || null,
        businessHoursStart: form.businessHoursStart || null,
        businessHoursEnd: form.businessHoursEnd || null,
      });
      const nextForm = toForm(updated);
      setForm(nextForm);
      setInitialForm(nextForm);
      setSuccess('Workspace settings saved.');
    } catch (requestError) {
      setError(errorMessage(requestError, 'Could not save workspace settings.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Workspace Settings</h2>
        <p className="mt-1 text-sm text-gray-600">Set the business identity and operating hours for this workspace.</p>
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-gray-500">Loading workspace settings…</p>
      ) : (
        <form className="mt-5 space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Business name
              <input
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 disabled:bg-gray-100"
                value={form.name}
                maxLength={100}
                required
                disabled={!canSave || saving}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              Timezone
              <select
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 disabled:bg-gray-100"
                value={form.timezone}
                disabled={!canSave || saving}
                onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
              >
                <option value="">Not set</option>
                {COMPANY_TIMEZONES.map((timezone) => (
                  <option key={timezone} value={timezone}>{timezone}</option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Opens at
              <input
                type="time"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 disabled:bg-gray-100"
                value={form.businessHoursStart}
                disabled={!canSave || saving}
                onChange={(event) => setForm((current) => ({ ...current, businessHoursStart: event.target.value }))}
              />
            </label>

            <label className="text-sm font-medium text-gray-700">
              Closes at
              <input
                type="time"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 disabled:bg-gray-100"
                value={form.businessHoursEnd}
                disabled={!canSave || saving}
                onChange={(event) => setForm((current) => ({ ...current, businessHoursEnd: event.target.value }))}
              />
            </label>
          </div>

          {!canSave && (
            <p className="text-sm text-gray-500">Only workspace admins can change these settings.</p>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
          {success && <p className="text-sm text-green-700">{success}</p>}

          {canSave && (
            <button
              type="submit"
              disabled={!isDirty || saving}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save workspace settings'}
            </button>
          )}
        </form>
      )}
    </section>
  );
}
