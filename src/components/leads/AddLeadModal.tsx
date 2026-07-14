import { useState, type FormEvent } from 'react';
import type {
  CreateLeadInput,
  LeadSourceChannel,
  LeadTemperature,
} from '../../lib/leads';
import type { LeadSourceOption } from '../../lib/lead-sources';
import type { MembershipOption } from '../../lib/memberships';

type AddLeadModalProps = {
  memberships: MembershipOption[];
  leadSources: LeadSourceOption[];
  loading: boolean;
  requestError: string | null;
  onClose: () => void;
  onCreate: (input: CreateLeadInput) => Promise<boolean>;
};

type FormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  source: LeadSourceChannel;
  leadSourceId: string;
  ownerId: string;
  nextFollowUpAt: string;
  temperature: LeadTemperature | '';
};

const INITIAL_FORM: FormState = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  source: 'MANUAL',
  leadSourceId: '',
  ownerId: '',
  nextFollowUpAt: '',
  temperature: '',
};

const SOURCES: Array<{ value: LeadSourceChannel; label: string }> = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'OTHER', label: 'Other' },
];

function clean(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function membershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ')
    || membership.user.email;
}

export function AddLeadModal({
  memberships,
  leadSources,
  loading,
  requestError,
  onClose,
  onCreate,
}: AddLeadModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const identity = [form.firstName, form.lastName, form.phone, form.email]
      .map((value) => value.trim());
    if (!identity.some(Boolean)) {
      setError('Add at least a name, phone number, or email.');
      return;
    }

    const input: CreateLeadInput = {
      ...(clean(form.firstName) ? { firstName: clean(form.firstName) } : {}),
      ...(clean(form.lastName) ? { lastName: clean(form.lastName) } : {}),
      ...(clean(form.phone) ? { phone: clean(form.phone) } : {}),
      ...(clean(form.email) ? { email: clean(form.email) } : {}),
      source: form.source,
      ...(form.leadSourceId ? { leadSourceId: form.leadSourceId } : {}),
      ...(form.ownerId ? { ownerId: form.ownerId } : {}),
      ...(form.nextFollowUpAt
        ? { nextFollowUpAt: new Date(form.nextFollowUpAt).toISOString() }
        : {}),
      ...(form.temperature ? { temperature: form.temperature } : {}),
    };

    if (await onCreate(input)) {
      onClose();
    }
  }

  const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 px-4 py-6">
      <div className="max-h-full w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Add lead</h2>
            <p className="mt-1 text-sm text-gray-500">Capture an early enquiry before it becomes a contact.</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:text-gray-300">
            Close
          </button>
        </div>

        {error || requestError ? (
          <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error ?? requestError}
          </p>
        ) : null}

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              First name
              <input autoFocus value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} className={inputClass} autoComplete="given-name" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Last name
              <input value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} className={inputClass} autoComplete="family-name" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Phone
              <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className={inputClass} autoComplete="tel" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Email
              <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={inputClass} autoComplete="email" />
            </label>
          </div>

          <button type="button" onClick={() => setShowMore((current) => !current)} className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
            {showMore ? 'Hide more details' : 'More details'}
          </button>

          {showMore ? (
            <div className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700">
                Source
                <select value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value as LeadSourceChannel }))} className={inputClass}>
                  {SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Temperature
                <select value={form.temperature} onChange={(event) => setForm((current) => ({ ...current, temperature: event.target.value as LeadTemperature | '' }))} className={inputClass}>
                  <option value="">Not set</option>
                  <option value="HOT">Hot</option>
                  <option value="WARM">Warm</option>
                  <option value="COLD">Cold</option>
                </select>
              </label>
              {memberships.length > 0 ? (
                <label className="block text-sm font-medium text-gray-700">
                  Owner
                  <select value={form.ownerId} onChange={(event) => setForm((current) => ({ ...current, ownerId: event.target.value }))} className={inputClass}>
                    <option value="">Unassigned</option>
                    {memberships.map((membership) => <option key={membership.id} value={membership.userId}>{membershipName(membership)}</option>)}
                  </select>
                </label>
              ) : null}
              {leadSources.length > 0 ? (
                <label className="block text-sm font-medium text-gray-700">
                  Lead source
                  <select value={form.leadSourceId} onChange={(event) => setForm((current) => ({ ...current, leadSourceId: event.target.value }))} className={inputClass}>
                    <option value="">Not set</option>
                    {leadSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
                Next follow-up
                <input type="datetime-local" value={form.nextFollowUpAt} onChange={(event) => setForm((current) => ({ ...current, nextFollowUpAt: event.target.value }))} className={inputClass} />
              </label>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={loading} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:text-gray-400">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-emerald-400">
              {loading ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
