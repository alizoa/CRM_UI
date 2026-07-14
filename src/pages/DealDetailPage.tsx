import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EntityActivitiesPanel } from '../components/activities/EntityActivitiesPanel';
import { EntityAttachmentsPanel } from '../components/attachments/EntityAttachmentsPanel';
import { DealAttentionSignals, type DealAttentionSignal } from '../components/deals/DealAttentionSignals';
import { DealOverviewCard } from '../components/deals/DealOverviewCard';
import { RelatedContactCard } from '../components/deals/RelatedContactCard';
import { EntityNotesPanel } from '../components/notes/EntityNotesPanel';
import { EntityTasksPanel } from '../components/tasks/EntityTasksPanel';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { listActivities, type Activity } from '../lib/activities';
import { listContacts, type Contact } from '../lib/contacts';
import { getDeal, markDealLost, markDealWon, reopenDeal, updateDeal, type Deal, type UpdateDealInput } from '../lib/deals';
import type { HttpError } from '../lib/http';
import { listLeadSourceOptions, type LeadSourceOption } from '../lib/lead-sources';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';
import { listNotes } from '../lib/notes';
import { listTasks, type Task } from '../lib/tasks';

type RequestError = {
  status: number;
  message: string;
};

type DealFormState = {
  title: string;
  value: string;
  currency: string;
  expectedCloseAt: string;
  contactId: string;
  ownerId: string;
  leadSourceId: string;
};

type DealMemorySummary = {
  latestActivity: Activity | null;
  activityTotal: number;
  noteTotal: number;
  openTaskTotal: number;
  overdueTaskCount: number;
};

const DEAL_CONTACTS_LIMIT = 100;
const NO_RECENT_ACTIVITY_DAYS = 30;
const SUMMARY_TASK_LIMIT = 100;

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

function toSaveError(error: unknown) {
  const requestError = toRequestError(error, 'Could not update deal.');

  if (requestError.status === 403) {
    return {
      status: 403,
      message: 'You do not have permission to edit deals.',
    };
  }

  return requestError;
}

function toLifecycleError(error: unknown): RequestError {
  const requestError = toRequestError(error, 'Could not update deal lifecycle.');

  if (requestError.status === 403) {
    return {
      status: 403,
      message: 'You do not have permission to update deal lifecycle.',
    };
  }

  return requestError;
}

function formatDateInput(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
}

function getContactName(contact: Deal['contact']) {
  if (!contact) {
    return 'No contact';
  }

  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || 'Unnamed contact';
}

function getContactOptionName(contact: Contact) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || contact.phone || 'Unnamed contact';
}

function getOwnerName(deal: Deal) {
  if (!deal.owner) {
    return 'Not assigned';
  }

  return [deal.owner.firstName, deal.owner.lastName].filter(Boolean).join(' ') || deal.owner.email;
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

function hasDealValue(deal: Deal) {
  return deal.value !== null && deal.value !== undefined && deal.value !== '';
}

function buildAttentionSignals(deal: Deal, summary: DealMemorySummary): DealAttentionSignal[] {
  const signals: DealAttentionSignal[] = [];

  if (!deal.ownerId) {
    signals.push({
      label: 'No owner assigned',
      detail: 'Assign an owner so someone is clearly responsible for this deal.',
    });
  }

  if (!deal.contactId) {
    signals.push({
      label: 'No linked customer',
      detail: 'Link a customer so the deal has clear context and history.',
    });
  }

  if (summary.openTaskTotal === 0) {
    signals.push({
      label: 'Missing follow-up',
      detail: 'There is no open follow-up task connected to this deal.',
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
      detail: `No deal activity in the last ${NO_RECENT_ACTIVITY_DAYS} days.`,
    });
  }

  if (!hasDealValue(deal)) {
    signals.push({
      label: 'Missing deal value',
      detail: 'Add a value so the pipeline total is easier to understand.',
    });
  }

  if (deal.status === 'OPEN' && !deal.expectedCloseAt) {
    signals.push({
      label: 'Missing expected close date',
      detail: 'Add an expected close date to clarify timing.',
    });
  }

  if (summary.noteTotal === 0 && summary.activityTotal === 0) {
    signals.push({
      label: 'Thin deal context',
      detail: 'There are no notes or activity records connected to this deal yet.',
    });
  }

  return signals.slice(0, 5);
}

function getMembershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function getFormState(deal: Deal): DealFormState {
  return {
    title: deal.title,
    value: deal.value === null || deal.value === undefined ? '' : String(deal.value),
    currency: deal.currency,
    expectedCloseAt: formatDateInput(deal.expectedCloseAt),
    contactId: deal.contactId ?? '',
    ownerId: deal.ownerId ?? '',
    leadSourceId: deal.leadSourceId ?? '',
  };
}

function buildUpdateDealInput(form: DealFormState): UpdateDealInput {
  const value = form.value.trim();
  const expectedCloseAt = form.expectedCloseAt.trim();

  return {
    title: form.title.trim(),
    value: value ? value : null,
    currency: form.currency.trim().toUpperCase(),
    expectedCloseAt: expectedCloseAt || null,
    contactId: form.contactId || null,
    ownerId: form.ownerId || null,
    leadSourceId: form.leadSourceId || null,
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

export function DealDetailPage() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [form, setForm] = useState<DealFormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<RequestError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<RequestError | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSourceOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<RequestError | null>(null);
  const [summary, setSummary] = useState<DealMemorySummary>({
    latestActivity: null,
    activityTotal: 0,
    noteTotal: 0,
    openTaskTotal: 0,
    overdueTaskCount: 0,
  });
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<RequestError | null>(null);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);

  const refreshSummary = useCallback(() => {
    setSummaryRefreshKey((current) => current + 1);
  }, []);

  const fetchDeal = useCallback(async () => {
    if (!accessToken || !id) {
      setDeal(null);
      setForm(null);
      setLoading(false);
      setError(!id ? { status: 404, message: 'Deal not found.' } : null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await getDeal(accessToken, id);
      setDeal(response);
      setForm(getFormState(response));
    } catch (requestError) {
      setDeal(null);
      setForm(null);
      setError(toRequestError(requestError, 'Could not load deal.'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, id]);

  useEffect(() => {
    void fetchDeal();
  }, [fetchDeal]);

  useEffect(() => {
    if (!accessToken || !id) {
      setSummary({
        latestActivity: null,
        activityTotal: 0,
        noteTotal: 0,
        openTaskTotal: 0,
        overdueTaskCount: 0,
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
        const [activitiesResponse, tasksResponse, notesResponse] = await Promise.all([
          listActivities(token, { entityType: 'DEAL', entityId: id, page: 1, limit: 1 }),
          listTasks(token, { entityType: 'DEAL', entityId: id, completed: false, page: 1, limit: SUMMARY_TASK_LIMIT }),
          listNotes(token, { entityType: 'DEAL', entityId: id, page: 1, limit: 1 }),
        ]);

        if (!active) {
          return;
        }

        setSummary({
          latestActivity: activitiesResponse.data[0] ?? null,
          activityTotal: activitiesResponse.total,
          noteTotal: notesResponse.total,
          openTaskTotal: tasksResponse.total,
          overdueTaskCount: getOverdueTaskCount(tasksResponse.data),
        });
      } catch (requestError) {
        if (!active) {
          return;
        }

        setSummary({
          latestActivity: null,
          activityTotal: 0,
          noteTotal: 0,
          openTaskTotal: 0,
          overdueTaskCount: 0,
        });
        setSummaryError(toRequestError(requestError, 'Could not load deal memory summary.'));
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
      setContacts([]);
      setMemberships([]);
      setLeadSources([]);
      setOptionsLoading(false);
      setOptionsError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchOptions() {
      setOptionsLoading(true);
      setOptionsError(null);

      const [contactsResult, membershipsResult, leadSourcesResult] = await Promise.allSettled([
        listContacts(token, { page: 1, limit: DEAL_CONTACTS_LIMIT }),
        listMembershipOptions(token),
        listLeadSourceOptions(token),
      ]);

      if (!active) {
        return;
      }

      if (contactsResult.status === 'fulfilled') {
        setContacts(contactsResult.value.data);
      } else {
        setContacts([]);
      }

      if (membershipsResult.status === 'fulfilled') {
        setMemberships(membershipsResult.value);
      } else {
        setMemberships([]);
      }

      if (leadSourcesResult.status === 'fulfilled') {
        setLeadSources(leadSourcesResult.value);
      } else {
        setLeadSources([]);
      }

      if (contactsResult.status === 'rejected' || membershipsResult.status === 'rejected' || leadSourcesResult.status === 'rejected') {
        setOptionsError({
          status: 0,
          message: 'Some deal edit options could not be loaded.',
        });
      }

      setOptionsLoading(false);
    }

    void fetchOptions();

    return () => {
      active = false;
    };
  }, [accessToken]);

  const handleEdit = () => {
    if (!deal) {
      return;
    }

    setForm(getFormState(deal));
    setEditing(true);
    setSaveError(null);
    setSuccessMessage(null);
    setLifecycleError(null);
  };

  const handleCancel = () => {
    if (deal) {
      setForm(getFormState(deal));
    }

    setEditing(false);
    setSaveError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken || !id || !form) {
      setSaveError({
        status: 401,
        message: 'You need to sign in before updating deals.',
      });
      return;
    }

    if (!form.title.trim()) {
      setSaveError({
        status: 422,
        message: 'Deal title is required.',
      });
      return;
    }

    if (!form.currency.trim()) {
      setSaveError({
        status: 422,
        message: 'Currency is required.',
      });
      return;
    }

    setSaveLoading(true);
    setSaveError(null);
    setSuccessMessage(null);

    try {
      const response = await updateDeal(accessToken, id, buildUpdateDealInput(form));
      setDeal(response);
      setForm(getFormState(response));
      setEditing(false);
      setSuccessMessage('Deal updated.');
      refreshSummary();
    } catch (requestError) {
      setSaveError(toSaveError(requestError));
    } finally {
      setSaveLoading(false);
    }
  };

  const runLifecycleAction = async (action: (token: string, dealId: string) => Promise<Deal>, success: string, confirmMessage: string) => {
    if (!accessToken || !deal) {
      setLifecycleError({
        status: 401,
        message: 'You need to sign in before updating deal lifecycle.',
      });
      return;
    }

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setLifecycleLoading(true);
    setLifecycleError(null);
    setSuccessMessage(null);

    try {
      await action(accessToken, deal.id);
      const refreshedDeal = await getDeal(accessToken, deal.id);
      setDeal(refreshedDeal);
      setForm(getFormState(refreshedDeal));
      setEditing(false);
      setSuccessMessage(success);
      refreshSummary();
    } catch (requestError) {
      setLifecycleError(toLifecycleError(requestError));
    } finally {
      setLifecycleLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Link className="text-sm font-medium text-gray-700 underline" to="/deals">
          Back to Deals
        </Link>

        {loading ? <p className="rounded border border-gray-200 bg-white p-5 text-sm text-gray-700">Loading deal...</p> : null}

        {!loading && error ? (
          <div className="rounded border border-red-200 bg-white p-5">
            <h1 className="text-base font-semibold text-red-900">{error.status === 404 ? 'Deal not found' : 'Could not load deal'}</h1>
            <p className="mt-2 text-sm text-red-700">{error.message}</p>
            {error.status !== 404 ? (
              <button
                type="button"
                onClick={() => {
                  void fetchDeal();
                }}
                className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {!loading && !error && deal ? (
          <>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
              <DealOverviewCard
                deal={deal}
                editing={editing}
                lastActivityLabel={summaryLoading ? 'Checking latest activity...' : formatRelativeDate(summary.latestActivity?.createdAt)}
                lifecycleErrorMessage={lifecycleError?.message ?? null}
                lifecycleLoading={lifecycleLoading}
                onEdit={handleEdit}
                onMarkLost={() => {
                  void runLifecycleAction(markDealLost, 'Deal marked lost.', 'Mark this deal as lost?');
                }}
                onMarkWon={() => {
                  void runLifecycleAction(markDealWon, 'Deal marked won.', 'Mark this deal as won?');
                }}
                onReopen={() => {
                  void runLifecycleAction(reopenDeal, 'Deal reopened.', 'Reopen this deal?');
                }}
              />
              <DealAttentionSignals
                errorMessage={summaryError?.message ?? null}
                loading={summaryLoading}
                openTaskCount={summary.openTaskTotal}
                overdueTaskCount={summary.overdueTaskCount}
                signals={buildAttentionSignals(deal, summary)}
              />
            </div>

            {successMessage ? <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{successMessage}</p> : null}
            {optionsError ? <p className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">{optionsError.message}</p> : null}

            <RelatedContactCard contact={deal.contact ?? null} />

            {editing && form ? (
              <section className="rounded border border-gray-200 bg-white p-5">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Edit deal details</h2>
                  <p className="mt-1 text-sm text-gray-600">Update the deal record without changing pipeline lifecycle state.</p>
                </div>
                <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Title
                    <input
                      value={form.title}
                      onChange={(event) => setForm((current) => (current ? { ...current, title: event.target.value } : current))}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Value
                    <input
                      value={form.value}
                      onChange={(event) => setForm((current) => (current ? { ...current, value: event.target.value } : current))}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      inputMode="decimal"
                      placeholder="Optional"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Currency
                    <input
                      value={form.currency}
                      onChange={(event) => setForm((current) => (current ? { ...current, currency: event.target.value.toUpperCase().slice(0, 3) } : current))}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                      maxLength={3}
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Expected close date
                    <input
                      type="date"
                      value={form.expectedCloseAt}
                      onChange={(event) => setForm((current) => (current ? { ...current, expectedCloseAt: event.target.value } : current))}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Contact
                    <select
                      value={form.contactId}
                      onChange={(event) => setForm((current) => (current ? { ...current, contactId: event.target.value } : current))}
                      disabled={optionsLoading}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      <option value="">No contact</option>
                      {form.contactId && !contacts.some((contact) => contact.id === form.contactId) ? (
                        <option value={form.contactId}>{getContactName(deal.contact)}</option>
                      ) : null}
                      {contacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {getContactOptionName(contact)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                    Owner
                    <select
                      value={form.ownerId}
                      onChange={(event) => setForm((current) => (current ? { ...current, ownerId: event.target.value } : current))}
                      disabled={optionsLoading}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      <option value="">No owner</option>
                      {form.ownerId && !memberships.some((membership) => membership.userId === form.ownerId) ? (
                        <option value={form.ownerId}>{getOwnerName(deal)}</option>
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
                      disabled={optionsLoading}
                      className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      <option value="">No lead source</option>
                      {form.leadSourceId && !leadSources.some((leadSource) => leadSource.id === form.leadSourceId) ? (
                        <option value={form.leadSourceId}>{deal.leadSource?.name ?? 'Current lead source'}</option>
                      ) : null}
                      {leadSources.map((leadSource) => (
                        <option key={leadSource.id} value={leadSource.id}>
                          {leadSource.name}
                        </option>
                      ))}
                    </select>
                  </label>
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

        {!loading && !error && deal ? (
          <>
            <WorkActivityDivider />
            <div className="grid gap-6 xl:grid-cols-2">
              <EntityTasksPanel entityType="DEAL" entityId={deal.id} title="Tasks and follow-ups" onTasksChanged={refreshSummary} />
              <EntityNotesPanel entityType="DEAL" entityId={deal.id} title="Deal notes" onNotesChanged={refreshSummary} />
            </div>
            <EntityActivitiesPanel entityType="DEAL" entityId={deal.id} title="Recent deal activity" />
            <EntityAttachmentsPanel entityType="DEAL" entityId={deal.id} title="Deal attachments" />
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
