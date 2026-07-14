import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { EntityActivitiesPanel } from '../components/activities/EntityActivitiesPanel';
import { EntityAttachmentsPanel } from '../components/attachments/EntityAttachmentsPanel';
import { AttentionSignals, type AttentionSignal } from '../components/contacts/AttentionSignals';
import { CustomerOverviewCard } from '../components/contacts/CustomerOverviewCard';
import { RelatedDealsPanel } from '../components/contacts/RelatedDealsPanel';
import { EntityNotesPanel } from '../components/notes/EntityNotesPanel';
import { ContactOrdersPanel } from '../components/orders/ContactOrdersPanel';
import { EntityTasksPanel } from '../components/tasks/EntityTasksPanel';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { listActivities, type Activity } from '../lib/activities';
import {
  archiveContact,
  deleteContact,
  getContact,
  restoreContact,
  updateContact,
  type Contact,
  type ContactStatus,
  type UpdateContactInput,
} from '../lib/contacts';
import { listDeals, type Deal } from '../lib/deals';
import type { HttpError } from '../lib/http';
import { listLeadSourceOptions, type LeadSourceOption } from '../lib/lead-sources';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';
import { listTagOptions, type TagOption } from '../lib/tags';
import { listTasks, type Task } from '../lib/tasks';

type ContactFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: Exclude<ContactStatus, 'ARCHIVED'>;
  ownerId: string;
  leadSourceId: string;
  selectedTagIds: string[];
};

type RequestError = {
  status: number;
  message: string;
};

type MemorySummary = {
  latestActivity: Activity | null;
  openTaskTotal: number;
  overdueTaskCount: number;
  relatedDeals: Deal[];
  relatedDealTotal: number;
};

const NO_RECENT_ACTIVITY_DAYS = 30;
const SUMMARY_TASK_LIMIT = 100;
const RELATED_DEALS_LIMIT = 5;

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

function toLifecycleError(error: unknown, fallback: string): RequestError {
  const requestError = toRequestError(error, fallback);

  if (requestError.status === 403) {
    return {
      status: 403,
      message: 'You do not have permission to manage contact lifecycle actions.',
    };
  }

  return requestError;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatRelativeDate(value: string | null | undefined) {
  if (!value) {
    return 'No activity yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return `Last activity: ${value}`;
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return 'Last activity: Today';
  }

  if (diffDays === 1) {
    return 'Last activity: Yesterday';
  }

  if (diffDays < 30) {
    return `Last activity: ${diffDays} days ago`;
  }

  return `Last activity: ${date.toLocaleDateString()}`;
}

function isRecentActivity(activity: Activity | null) {
  if (!activity) {
    return false;
  }

  const date = new Date(activity.createdAt);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const threshold = new Date();
  threshold.setDate(threshold.getDate() - NO_RECENT_ACTIVITY_DAYS);
  return date >= threshold;
}

function getOverdueTaskCount(tasks: Task[]) {
  const now = new Date();

  return tasks.filter((task) => {
    if (task.completedAt || !task.dueAt) {
      return false;
    }

    const dueAt = new Date(task.dueAt);
    return !Number.isNaN(dueAt.getTime()) && dueAt < now;
  }).length;
}

function buildAttentionSignals(contact: Contact, summary: MemorySummary): AttentionSignal[] {
  const signals: AttentionSignal[] = [];

  if (!contact.ownerId) {
    signals.push({
      label: 'No owner assigned',
      detail: 'Assign an owner so someone is clearly responsible for follow-up.',
    });
  }

  if (summary.openTaskTotal === 0) {
    signals.push({
      label: 'Missing follow-up',
      detail: 'There is no open follow-up task connected to this customer.',
    });
  }

  if (summary.overdueTaskCount > 0) {
    signals.push({
      label: 'Overdue task',
      detail: summary.overdueTaskCount === 1 ? '1 open task is overdue.' : `${summary.overdueTaskCount} open tasks are overdue.`,
    });
  }

  if (!isRecentActivity(summary.latestActivity)) {
    signals.push({
      label: 'No recent activity',
      detail: `No contact activity in the last ${NO_RECENT_ACTIVITY_DAYS} days.`,
    });
  }

  if (summary.relatedDealTotal === 0) {
    signals.push({
      label: 'No related deal',
      detail: 'There are no deals connected to this customer yet.',
    });
  }

  if (!contact.leadSourceId) {
    signals.push({
      label: 'Missing lead source',
      detail: 'Add a lead source to preserve where this customer came from.',
    });
  }

  if (!contact.email && !contact.phone) {
    signals.push({
      label: 'Missing contact method',
      detail: 'Add an email or phone number so the team knows how to reach them.',
    });
  }

  return signals.slice(0, 5);
}

function getOwnerName(contact: Contact) {
  if (!contact.owner) {
    return 'Not assigned';
  }

  return [contact.owner.firstName, contact.owner.lastName].filter(Boolean).join(' ') || contact.owner.email;
}

function getMembershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function getFormState(contact: Contact): ContactFormState {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    status: contact.status === 'CUSTOMER' ? 'CUSTOMER' : 'PROSPECT',
    ownerId: contact.ownerId ?? '',
    leadSourceId: contact.leadSourceId ?? '',
    selectedTagIds: contact.tags.map((tag) => tag.tagId),
  };
}

function WorkActivityDivider() {
  return (
    <div className="flex items-center gap-3 pt-2">
      <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500">Work & Activity</h2>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

export function ContactDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const conversionSuccess = (
    location.state as { conversionSuccess?: string } | null
  )?.conversionSuccess ?? null;
  const [contact, setContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactFormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<RequestError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(conversionSuccess);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSourceOption[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<RequestError | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<RequestError | null>(null);
  const [summary, setSummary] = useState<MemorySummary>({
    latestActivity: null,
    openTaskTotal: 0,
    overdueTaskCount: 0,
    relatedDeals: [],
    relatedDealTotal: 0,
  });
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<RequestError | null>(null);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);

  const refreshSummary = useCallback(() => {
    setSummaryRefreshKey((current) => current + 1);
  }, []);

  const fetchContact = useCallback(async () => {
    if (!accessToken || !id) {
      setContact(null);
      setForm(null);
      setLoading(false);
      setError(
        !id
          ? {
              status: 404,
              message: 'Contact not found.',
            }
          : null,
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await getContact(accessToken, id);
      setContact(response);
      setForm(getFormState(response));
    } catch (requestError) {
      setContact(null);
      setForm(null);
      setError(toRequestError(requestError, 'Could not load contact.'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, id]);

  useEffect(() => {
    void fetchContact();
  }, [fetchContact]);

  useEffect(() => {
    if (!accessToken || !id) {
      setSummary({
        latestActivity: null,
        openTaskTotal: 0,
        overdueTaskCount: 0,
        relatedDeals: [],
        relatedDealTotal: 0,
      });
      setSummaryLoading(false);
      setSummaryError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchSummary() {
      setSummaryLoading(true);
      setSummaryError(null);

      try {
        const [activitiesResponse, tasksResponse, dealsResponse] = await Promise.all([
          listActivities(token, { entityType: 'CONTACT', entityId: id, page: 1, limit: 1 }),
          listTasks(token, { entityType: 'CONTACT', entityId: id, completed: false, page: 1, limit: SUMMARY_TASK_LIMIT }),
          listDeals(token, { contactId: id, page: 1, limit: RELATED_DEALS_LIMIT }),
        ]);

        if (!active) {
          return;
        }

        setSummary({
          latestActivity: activitiesResponse.data[0] ?? null,
          openTaskTotal: tasksResponse.total,
          overdueTaskCount: getOverdueTaskCount(tasksResponse.data),
          relatedDeals: dealsResponse.data,
          relatedDealTotal: dealsResponse.total,
        });
      } catch (requestError) {
        if (!active) {
          return;
        }

        setSummary({
          latestActivity: null,
          openTaskTotal: 0,
          overdueTaskCount: 0,
          relatedDeals: [],
          relatedDealTotal: 0,
        });
        setSummaryError(toRequestError(requestError, 'Could not load customer memory summary.'));
      } finally {
        if (active) {
          setSummaryLoading(false);
        }
      }
    }

    void fetchSummary();

    return () => {
      active = false;
    };
  }, [accessToken, id, summaryRefreshKey]);

  useEffect(() => {
    if (!accessToken) {
      setMemberships([]);
      setLeadSources([]);
      setTags([]);
      setOptionsLoading(false);
      setOptionsError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchOptions() {
      setOptionsLoading(true);
      setOptionsError(null);

      try {
        const [membershipOptions, leadSourceOptions, tagOptions] = await Promise.all([
          listMembershipOptions(token),
          listLeadSourceOptions(token),
          listTagOptions(token),
        ]);

        if (!active) {
          return;
        }

        setMemberships(membershipOptions);
        setLeadSources(leadSourceOptions);
        setTags(tagOptions);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setMemberships([]);
        setLeadSources([]);
        setTags([]);
        setOptionsError(toRequestError(requestError, 'Could not load contact edit options.'));
      } finally {
        if (active) {
          setOptionsLoading(false);
        }
      }
    }

    void fetchOptions();

    return () => {
      active = false;
    };
  }, [accessToken]);

  const handleEdit = () => {
    if (!contact) {
      return;
    }

    setForm(getFormState(contact));
    setEditing(true);
    setSaveError(null);
    setSuccessMessage(null);
    setLifecycleError(null);
  };

  const handleCancel = () => {
    if (contact) {
      setForm(getFormState(contact));
    }

    setEditing(false);
    setSaveError(null);
  };

  const handleTagToggle = (tagId: string) => {
    setForm((current) => {
      if (!current) {
        return current;
      }

      const selectedTagIds = current.selectedTagIds.includes(tagId)
        ? current.selectedTagIds.filter((selectedTagId) => selectedTagId !== tagId)
        : [...current.selectedTagIds, tagId];

      return {
        ...current,
        selectedTagIds,
      };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken || !id || !form) {
      setSaveError({
        status: 401,
        message: 'You need to sign in before updating contacts.',
      });
      return;
    }

    const firstName = form.firstName.trim();
    if (!firstName) {
      setSaveError({
        status: 422,
        message: 'First name is required.',
      });
      return;
    }

    const input: UpdateContactInput = {
      firstName,
      lastName: emptyToNull(form.lastName),
      email: emptyToNull(form.email),
      phone: emptyToNull(form.phone),
      status: form.status,
      ownerId: form.ownerId || null,
      leadSourceId: form.leadSourceId || null,
      tagIds: form.selectedTagIds,
    };

    setSaveLoading(true);
    setSaveError(null);
    setSuccessMessage(null);

    try {
      const response = await updateContact(accessToken, id, input);
      setContact(response);
      setForm(getFormState(response));
      setEditing(false);
      setSuccessMessage('Contact updated.');
      refreshSummary();
    } catch (requestError) {
      setSaveError(toRequestError(requestError, 'Could not update contact.'));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!accessToken || !contact) {
      setLifecycleError({
        status: 401,
        message: 'You need to sign in before managing contact lifecycle actions.',
      });
      return;
    }

    if (!window.confirm('Archive this contact? They will be marked as archived.')) {
      return;
    }

    setLifecycleLoading(true);
    setLifecycleError(null);
    setSuccessMessage(null);

    try {
      const response = await archiveContact(accessToken, contact.id);
      setContact(response);
      setForm(getFormState(response));
      setSuccessMessage('Contact archived.');
      refreshSummary();
    } catch (requestError) {
      setLifecycleError(toLifecycleError(requestError, 'Could not archive contact.'));
    } finally {
      setLifecycleLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!accessToken || !contact) {
      setLifecycleError({
        status: 401,
        message: 'You need to sign in before managing contact lifecycle actions.',
      });
      return;
    }

    if (!window.confirm('Restore as prospect?')) {
      return;
    }

    setLifecycleLoading(true);
    setLifecycleError(null);
    setSuccessMessage(null);

    try {
      const response = await restoreContact(accessToken, contact.id);
      setContact(response);
      setForm(getFormState(response));
      setSuccessMessage('Contact restored as a prospect.');
      refreshSummary();
    } catch (requestError) {
      setLifecycleError(toLifecycleError(requestError, 'Could not restore contact.'));
    } finally {
      setLifecycleLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!accessToken || !contact) {
      setLifecycleError({
        status: 401,
        message: 'You need to sign in before managing contact lifecycle actions.',
      });
      return;
    }

    if (!window.confirm('Delete this contact? It will be removed from the active contacts list.')) {
      return;
    }

    setLifecycleLoading(true);
    setLifecycleError(null);
    setSuccessMessage(null);

    try {
      await deleteContact(accessToken, contact.id);
      navigate('/contacts');
    } catch (requestError) {
      setLifecycleError(toLifecycleError(requestError, 'Could not delete contact.'));
      setLifecycleLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Link className="text-sm font-medium text-gray-700 underline" to="/contacts">
          Back to Contacts
        </Link>

        {loading ? <p className="rounded border border-gray-200 bg-white p-5 text-sm text-gray-700">Loading contact...</p> : null}

        {!loading && error ? (
          <div className="rounded border border-red-200 bg-white p-5">
            <h1 className="text-base font-semibold text-red-900">{error.status === 404 ? 'Contact not found' : 'Could not load contact'}</h1>
            <p className="mt-2 text-sm text-red-700">{error.message}</p>
            {error.status !== 404 ? (
              <button
                type="button"
                onClick={() => {
                  void fetchContact();
                }}
                className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {!loading && !error && contact ? (
          <>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
              <CustomerOverviewCard
                contact={contact}
                editing={editing}
                lastActivityLabel={summaryLoading ? 'Checking latest activity...' : formatRelativeDate(summary.latestActivity?.createdAt)}
                lifecycleLoading={lifecycleLoading}
                onArchive={() => {
                  void handleArchive();
                }}
                onDelete={() => {
                  void handleDelete();
                }}
                onEdit={handleEdit}
                onRestore={() => {
                  void handleRestore();
                }}
              />
              <AttentionSignals
                loading={summaryLoading}
                errorMessage={summaryError?.message ?? null}
                openTaskCount={summary.openTaskTotal}
                overdueTaskCount={summary.overdueTaskCount}
                signals={buildAttentionSignals(contact, summary)}
              />
            </div>

            {successMessage ? <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{successMessage}</p> : null}
            {optionsError ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{optionsError.message}</p> : null}
            {lifecycleError ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{lifecycleError.message}</p> : null}

            {editing && form ? (
              <section className="rounded border border-gray-200 bg-white p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Edit customer details</h2>
                    <p className="mt-1 text-sm text-gray-600">Owner, lead source, tags, and contact methods.</p>
                  </div>
                </div>
                <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    First name
                    <input
                      value={form.firstName}
                      onChange={(event) => setForm((current) => (current ? { ...current, firstName: event.target.value } : current))}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      autoComplete="given-name"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Last name
                    <input
                      value={form.lastName}
                      onChange={(event) => setForm((current) => (current ? { ...current, lastName: event.target.value } : current))}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      autoComplete="family-name"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Email
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm((current) => (current ? { ...current, email: event.target.value } : current))}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      autoComplete="email"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Phone
                    <input
                      value={form.phone}
                      onChange={(event) => setForm((current) => (current ? { ...current, phone: event.target.value } : current))}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      autoComplete="tel"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Status
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? { ...current, status: event.target.value as ContactFormState['status'] }
                            : current,
                        )
                      }
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    >
                      <option value="PROSPECT">Prospect</option>
                      <option value="CUSTOMER">Customer</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Owner
                    <select
                      value={form.ownerId}
                      onChange={(event) => setForm((current) => (current ? { ...current, ownerId: event.target.value } : current))}
                      disabled={optionsLoading || Boolean(optionsError)}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      <option value="">No owner</option>
                      {form.ownerId && !memberships.some((membership) => membership.userId === form.ownerId) ? (
                        <option value={form.ownerId}>{getOwnerName(contact)}</option>
                      ) : null}
                      {memberships.map((membership) => (
                        <option key={membership.id} value={membership.userId}>
                          {getMembershipName(membership)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Lead source
                    <select
                      value={form.leadSourceId}
                      onChange={(event) => setForm((current) => (current ? { ...current, leadSourceId: event.target.value } : current))}
                      disabled={optionsLoading || Boolean(optionsError)}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      <option value="">No lead source</option>
                      {form.leadSourceId && !leadSources.some((leadSource) => leadSource.id === form.leadSourceId) ? (
                        <option value={form.leadSourceId}>{contact.leadSource?.name ?? 'Current lead source'}</option>
                      ) : null}
                      {leadSources.map((leadSource) => (
                        <option key={leadSource.id} value={leadSource.id}>
                          {leadSource.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="sm:col-span-2">
                    <legend className="text-sm font-medium text-gray-700">Tags</legend>
                    {tags.length > 0 ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {tags.map((tag) => (
                          <label
                            key={tag.id}
                            className="flex items-center gap-2 rounded border border-gray-200 px-3 py-2 text-sm font-normal text-gray-800"
                          >
                            <input
                              type="checkbox"
                              checked={form.selectedTagIds.includes(tag.id)}
                              onChange={() => handleTagToggle(tag.id)}
                              disabled={optionsLoading || Boolean(optionsError)}
                              className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 disabled:cursor-not-allowed"
                            />
                            {tag.color ? <span className="h-3 w-3 rounded-full border border-gray-200" style={{ backgroundColor: tag.color }} /> : null}
                            <span>{tag.name}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                        {optionsLoading ? 'Loading tags...' : 'No tags available.'}
                      </p>
                    )}
                  </fieldset>
                  <div className="sm:col-span-2">
                    {saveError ? <p className="mb-3 text-sm text-red-700">{saveError.message}</p> : null}
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        disabled={saveLoading}
                        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
                      >
                        {saveLoading ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={saveLoading}
                        className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </form>
              </section>
            ) : null}
          </>
        ) : null}

        {!loading && !error && contact ? (
          <>
            <RelatedDealsPanel
              deals={summary.relatedDeals}
              errorMessage={summaryError?.message ?? null}
              loading={summaryLoading}
              total={summary.relatedDealTotal}
              onRetry={refreshSummary}
            />
            <ContactOrdersPanel contactId={contact.id} />
            <WorkActivityDivider />
            <div className="grid gap-6 xl:grid-cols-2">
              <EntityTasksPanel entityType="CONTACT" entityId={contact.id} title="Tasks and follow-ups" onTasksChanged={refreshSummary} />
              <EntityNotesPanel entityType="CONTACT" entityId={contact.id} title="Customer notes" />
            </div>
            <EntityActivitiesPanel entityType="CONTACT" entityId={contact.id} title="Recent customer activity" />
            <EntityAttachmentsPanel entityType="CONTACT" entityId={contact.id} title="Contact attachments" />
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

