import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import type { HttpError } from '../lib/http';
import {
  getNextBestActions,
  getWorklistSummary,
  type NextBestAction,
  type NextBestActionsResponse,
  type WorklistContactItem,
  type WorklistDealItem,
  type WorklistLeadItem,
  type WorklistSummaryResponse,
  type WorklistTaskItem,
} from '../lib/worklist';

type RequestError = {
  status: number;
  message: string;
};

type SummaryCardData = {
  label: string;
  tone: 'active' | 'calm' | 'default' | 'urgent';
  value: number;
};

type WorklistSectionKey =
  | 'overdueTasks'
  | 'dueTodayTasks'
  | 'contactsMissingOwner'
  | 'newLeadsWithoutOwner'
  | 'contactsMissingContactMethod'
  | 'dealsMissingOwner'
  | 'dealsMissingCloseDate'
  | 'dealsMissingValue'
  | 'dealsMissingContact';

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

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function getContactName(contact: WorklistContactItem) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || contact.phone || 'Unnamed contact';
}

function getTaskAction(task: WorklistTaskItem) {
  if (task.entityType === 'CONTACT') {
    return { label: 'Open contact', href: `/contacts/${task.entityId}` };
  }

  if (task.entityType === 'DEAL') {
    return { label: 'Open deal', href: `/deals/${task.entityId}` };
  }

  if (task.entityType === 'LEAD') {
    return { label: 'Open lead', href: `/leads/${task.entityId}` };
  }

  return { label: 'View task', href: '/tasks' };
}

function SummaryCard({ label, tone, value }: SummaryCardData) {
  const hasValue = value > 0;
  const classes = hasValue
    ? tone === 'urgent'
      ? 'border-red-200 bg-red-50'
      : tone === 'active'
        ? 'border-blue-200 bg-blue-50'
        : 'border-gray-300 bg-white shadow-sm'
    : 'border-gray-200 bg-gray-50';
  const valueClass = hasValue ? (tone === 'urgent' ? 'text-red-800' : 'text-gray-950') : 'text-gray-400';

  return (
    <div className={`rounded border p-4 ${classes}`}>
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function TypeBadge({ label }: { label: 'TASK' | 'CONTACT' | 'DEAL' | 'LEAD' }) {
  const displayLabel = label === 'TASK' ? 'Task' : label === 'CONTACT' ? 'Contact' : label === 'LEAD' ? 'Lead' : 'Deal';

  return <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{displayLabel}</span>;
}

function EmptySection({ message }: { message: string }) {
  return <p className="rounded border border-dashed border-gray-200 bg-white p-4 text-sm text-gray-500">{message}</p>;
}

export function WorklistPage() {
  const { accessToken, logout } = useAuth();
  const [data, setData] = useState<WorklistSummaryResponse | null>(null);
  const [nextActions, setNextActions] = useState<NextBestActionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [nextActionsLoading, setNextActionsLoading] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [nextActionsError, setNextActionsError] = useState<RequestError | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!accessToken) {
      setData(null);
      setNextActions(null);
      setLoading(false);
      setNextActionsLoading(false);
      setError(null);
      setNextActionsError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchWorklist() {
      setLoading(true);
      setError(null);

      try {
        const response = await getWorklistSummary(token);
        if (!active) {
          return;
        }

        setData(response);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setData(null);
        setError(toRequestError(requestError, 'Could not load today\'s worklist.'));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void fetchWorklist();

    return () => {
      active = false;
    };
  }, [accessToken, refreshKey]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchNextActions() {
      setNextActionsLoading(true);
      setNextActionsError(null);

      try {
        const response = await getNextBestActions(token);
        if (!active) {
          return;
        }

        setNextActions(response);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setNextActions(null);
        setNextActionsError(toRequestError(requestError, 'Could not load suggested actions.'));
      } finally {
        if (active) {
          setNextActionsLoading(false);
        }
      }
    }

    void fetchNextActions();

    return () => {
      active = false;
    };
  }, [accessToken, refreshKey]);

  useEffect(() => {
    if (error?.status === 401 || nextActionsError?.status === 401) {
      void logout();
    }
  }, [error?.status, logout, nextActionsError?.status]);

  const summaryCards = useMemo<SummaryCardData[]>(() => {
    if (!data) {
      return [];
    }

    const dealAttentionCount =
      data.summary.dealsMissingOwnerCount +
      data.summary.dealsMissingCloseDateCount +
      data.summary.dealsMissingValueCount;
    const leadLossSignalsCount =
      data.summary.newLeadsWithoutOwnerCount +
      data.summary.contactsMissingContactMethodCount +
      data.summary.dealsMissingContactCount;

    return [
      { label: 'Overdue tasks', tone: 'urgent', value: data.summary.overdueTasksCount },
      { label: 'Due today', tone: 'active', value: data.summary.dueTodayTasksCount },
      { label: 'Contacts need owner', tone: 'default', value: data.summary.contactsMissingOwnerCount },
      { label: 'Deals need review', tone: 'default', value: dealAttentionCount },
      { label: 'Leads at risk', tone: 'default', value: leadLossSignalsCount },
    ];
  }, [data]);

  const hasItems = data ? data.summary.totalAttentionItems > 0 : false;
  const hasSuggestedActions = (nextActions?.actions ?? []).length > 0;
  const showAllClearState = data && !hasItems && !hasSuggestedActions && !nextActionsLoading && !nextActionsError;

  function toggleSection(sectionKey: WorklistSectionKey) {
    setExpandedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Today</h1>
            <p className="mt-1 text-sm text-gray-600">Here's what needs your attention today.</p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((current) => current + 1)}
            disabled={loading || nextActionsLoading}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {loading || nextActionsLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="rounded border border-gray-200 bg-white p-4">
                <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                <div className="mt-3 h-8 w-14 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : null}

        {!loading && error ? (
          <div className="rounded border border-red-200 bg-white p-5">
            <h2 className="text-base font-semibold text-red-900">Could not load Today</h2>
            <p className="mt-2 text-sm text-red-700">{error.message}</p>
            <button
              type="button"
              onClick={() => setRefreshKey((current) => current + 1)}
              className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Retry
            </button>
          </div>
        ) : null}

        {!loading && !error && data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {summaryCards.map((card) => (
                <SummaryCard key={card.label} label={card.label} tone={card.tone} value={card.value} />
              ))}
            </div>

            <SuggestedActionsSection
              actions={nextActions?.actions ?? []}
              error={nextActionsError}
              loading={nextActionsLoading}
              onRetry={() => setRefreshKey((current) => current + 1)}
              showAllClearState={Boolean(showAllClearState)}
            />

            {hasItems ? (
              <div className="grid gap-6 xl:grid-cols-2">
                {data.overdueTasks.length > 0 ? (
                  <CollapsibleWorklistSection
                    count={data.overdueTasks.length}
                    expanded={Boolean(expandedSections.overdueTasks)}
                    onToggle={() => toggleSection('overdueTasks')}
                    title="Overdue tasks"
                  >
                    {data.overdueTasks.map((task) => (
                      <TaskItem key={task.id} task={task} reason={`Overdue since ${formatDate(task.dueAt)}`} />
                    ))}
                  </CollapsibleWorklistSection>
                ) : null}

                {data.dueTodayTasks.length > 0 ? (
                  <CollapsibleWorklistSection
                    count={data.dueTodayTasks.length}
                    expanded={Boolean(expandedSections.dueTodayTasks)}
                    onToggle={() => toggleSection('dueTodayTasks')}
                    title="Due today"
                  >
                    {data.dueTodayTasks.map((task) => (
                      <TaskItem key={task.id} task={task} reason="Due today" />
                    ))}
                  </CollapsibleWorklistSection>
                ) : null}

                {data.newLeadsWithoutOwner.length > 0 ? (
                  <CollapsibleWorklistSection
                    count={data.newLeadsWithoutOwner.length}
                    expanded={Boolean(expandedSections.newLeadsWithoutOwner)}
                    onToggle={() => toggleSection('newLeadsWithoutOwner')}
                    title="Unassigned leads"
                  >
                    {data.newLeadsWithoutOwner.map((lead) => (
                      <LeadItem key={lead.id} lead={lead} reason="Active lead - no one assigned yet" />
                    ))}
                  </CollapsibleWorklistSection>
                ) : null}

                {data.contactsMissingOwner.length > 0 ? (
                  <CollapsibleWorklistSection
                    count={data.contactsMissingOwner.length}
                    expanded={Boolean(expandedSections.contactsMissingOwner)}
                    onToggle={() => toggleSection('contactsMissingOwner')}
                    title="Contacts without an owner"
                  >
                    {data.contactsMissingOwner.map((contact) => (
                      <ContactItem key={contact.id} contact={contact} />
                    ))}
                  </CollapsibleWorklistSection>
                ) : null}

                {data.dealsMissingOwner.length > 0 ? (
                  <CollapsibleWorklistSection
                    count={data.dealsMissingOwner.length}
                    expanded={Boolean(expandedSections.dealsMissingOwner)}
                    onToggle={() => toggleSection('dealsMissingOwner')}
                    title="Deals without an owner"
                  >
                    {data.dealsMissingOwner.map((deal) => (
                      <DealItem key={deal.id} deal={deal} reason="No one is handling this deal" />
                    ))}
                  </CollapsibleWorklistSection>
                ) : null}

                {data.dealsMissingContact.length > 0 ? (
                  <CollapsibleWorklistSection
                    count={data.dealsMissingContact.length}
                    expanded={Boolean(expandedSections.dealsMissingContact)}
                    onToggle={() => toggleSection('dealsMissingContact')}
                    title="Deals without linked customer"
                  >
                    {data.dealsMissingContact.map((deal) => (
                      <DealItem key={deal.id} deal={deal} reason="No customer linked to this deal" />
                    ))}
                  </CollapsibleWorklistSection>
                ) : null}

                {data.dealsMissingCloseDate.length > 0 ? (
                  <CollapsibleWorklistSection
                    count={data.dealsMissingCloseDate.length}
                    expanded={Boolean(expandedSections.dealsMissingCloseDate)}
                    onToggle={() => toggleSection('dealsMissingCloseDate')}
                    title="Deals without a close date"
                  >
                    {data.dealsMissingCloseDate.map((deal) => (
                      <DealItem key={deal.id} deal={deal} reason="Close date not set" />
                    ))}
                  </CollapsibleWorklistSection>
                ) : null}

                {data.dealsMissingValue.length > 0 ? (
                  <CollapsibleWorklistSection
                    count={data.dealsMissingValue.length}
                    expanded={Boolean(expandedSections.dealsMissingValue)}
                    onToggle={() => toggleSection('dealsMissingValue')}
                    title="Deals without a value"
                  >
                    {data.dealsMissingValue.map((deal) => (
                      <DealItem key={deal.id} deal={deal} reason="Deal value not set" />
                    ))}
                  </CollapsibleWorklistSection>
                ) : null}

                {data.contactsMissingContactMethod.length > 0 ? (
                  <CollapsibleWorklistSection
                    count={data.contactsMissingContactMethod.length}
                    expanded={Boolean(expandedSections.contactsMissingContactMethod)}
                    onToggle={() => toggleSection('contactsMissingContactMethod')}
                    title="Contacts missing contact info"
                  >
                    {data.contactsMissingContactMethod.map((contact) => (
                      <ContactItem key={contact.id} contact={contact} reason="Contact details are missing" />
                    ))}
                  </CollapsibleWorklistSection>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function WorklistSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function CollapsibleWorklistSection({
  children,
  count,
  expanded,
  onToggle,
  title,
}: {
  children: ReactNode;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 rounded border border-gray-200 bg-white px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        aria-expanded={expanded}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-gray-900" aria-hidden="true" />
          <span className="min-w-0 break-words text-base font-semibold text-gray-900">
            {title} ({count})
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-gray-500">{expanded ? 'Collapse' : 'Expand'}</span>
      </button>
      {expanded ? <div className="space-y-3">{children}</div> : null}
    </section>
  );
}

function SuggestedActionsSection({
  actions,
  error,
  loading,
  onRetry,
  showAllClearState,
}: {
  actions: NextBestAction[];
  error: RequestError | null;
  loading: boolean;
  onRetry: () => void;
  showAllClearState: boolean;
}) {
  return (
    <WorklistSection title="What to do today">
      {loading ? (
        <div className="rounded border border-gray-200 bg-white p-5">
          <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
          <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded bg-gray-200" />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="rounded border border-red-200 bg-white p-5">
          <p className="text-sm font-medium text-red-900">Could not load suggested actions</p>
          <p className="mt-2 text-sm text-red-700">{error.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && actions.length === 0 && showAllClearState ? (
        <div className="rounded border border-green-200 bg-green-50 p-8 text-center">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-semibold text-green-700">OK</div>
          <h2 className="mt-3 text-base font-semibold text-gray-900">You're all caught up</h2>
          <p className="mt-2 text-sm text-gray-600">No follow-ups, overdue tasks, or data issues need attention right now.</p>
        </div>
      ) : null}

      {!loading && !error && actions.length === 0 && !showAllClearState ? <EmptySection message="No suggested actions right now." /> : null}

      {!loading && !error && actions.length > 0 ? (
        <div className="grid gap-3">
          {actions.map((action) => (
            <SuggestedActionItem key={action.id} action={action} />
          ))}
        </div>
      ) : null}
    </WorklistSection>
  );
}

function SuggestedActionItem({ action }: { action: NextBestAction }) {
  const linkLabel =
    action.entityType === 'CONTACT'
      ? 'Open contact'
      : action.entityType === 'DEAL'
        ? 'Open deal'
        : action.entityType === 'LEAD'
          ? 'Open lead'
          : 'Open tasks';

  return (
    <article className="rounded border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge label={action.entityType} />
            <PriorityBadge priority={action.priority} />
            <h3 className="break-words text-base font-semibold text-gray-900">{action.title}</h3>
          </div>
          <p className="mt-2 text-sm text-gray-700">{action.reason}</p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <Meta label="Related to" value={action.entityTitle} />
            {typeof action.daysWaiting === 'number' ? <Meta label="Waiting" value={`${action.daysWaiting} days`} /> : null}
          </dl>
        </div>
        <Link className="w-full rounded bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 sm:w-auto" to={action.linkTo}>
          {linkLabel}
        </Link>
      </div>
    </article>
  );
}

function PriorityBadge({ priority }: { priority: NextBestAction['priority'] }) {
  const classes =
    priority === 'HIGH'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : priority === 'MEDIUM'
        ? 'border-blue-200 bg-blue-50 text-blue-800'
        : 'border-gray-200 bg-gray-50 text-gray-700';

  const label = priority === 'HIGH' ? 'Do first' : priority === 'MEDIUM' ? 'Review today' : 'When you have time';

  return <span className={`rounded border px-2 py-1 text-xs font-semibold ${classes}`}>{label}</span>;
}

function TaskItem({ task, reason }: { task: WorklistTaskItem; reason: string }) {
  const action = getTaskAction(task);
  const contextLabel = task.entityType === 'CONTACT' ? 'Contact task' : task.entityType === 'LEAD' ? 'Lead follow-up' : 'Deal task';

  return (
    <article className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge label="TASK" />
            <h3 className="break-words text-base font-semibold text-gray-900">{task.title}</h3>
          </div>
          <p className="mt-2 text-sm text-gray-700">{reason}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Meta label="Context" value={contextLabel} />
            <Meta label="Assignee" value={task.assigneeName ?? task.assigneeId ?? 'Unassigned'} />
            <Meta label="Created" value={formatDate(task.createdAt)} />
          </dl>
        </div>
        <Link className="w-full rounded bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 sm:w-auto" to={action.href}>
          {action.label}
        </Link>
      </div>
    </article>
  );
}

function LeadItem({ lead, reason }: { lead: WorklistLeadItem; reason: string }) {
  return (
    <article className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge label="LEAD" />
            <h3 className="break-words text-base font-semibold text-gray-900">{getContactName(lead)}</h3>
          </div>
          <p className="mt-2 text-sm text-gray-700">{reason}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Meta label="Temperature" value={lead.temperature ?? 'Not set'} />
            <Meta label="Next follow-up" value={formatDate(lead.nextFollowUpAt)} />
            <Meta label="Created" value={formatDate(lead.createdAt)} />
          </dl>
        </div>
        <Link className="w-full rounded bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 sm:w-auto" to={`/leads/${lead.id}`}>
          Open lead
        </Link>
      </div>
    </article>
  );
}

function ContactItem({ contact, reason = 'No one is handling this contact' }: { contact: WorklistContactItem; reason?: string }) {
  return (
    <article className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge label="CONTACT" />
            <h3 className="break-words text-base font-semibold text-gray-900">{getContactName(contact)}</h3>
          </div>
          <p className="mt-2 text-sm text-gray-700">{reason}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Meta label="Created" value={formatDate(contact.createdAt)} />
            <Meta label="Status" value={contact.status} />
          </dl>
        </div>
        <Link className="w-full rounded bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 sm:w-auto" to={`/contacts/${contact.id}`}>
          Open contact
        </Link>
      </div>
    </article>
  );
}

function DealItem({ deal, reason }: { deal: WorklistDealItem; reason: string }) {
  return (
    <article className="rounded border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge label="DEAL" />
            <h3 className="break-words text-base font-semibold text-gray-900">{deal.title}</h3>
          </div>
          <p className="mt-2 text-sm text-gray-700">{reason}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Meta label="Value" value={deal.value ? `${deal.value} ${deal.currency ?? ''}`.trim() : '-'} />
            <Meta label="Expected close" value={formatDate(deal.expectedCloseAt)} />
            <Meta label="Owner" value={deal.ownerName ?? deal.ownerId ?? 'Unassigned'} />
            <Meta label="Related contact" value={deal.contactName ?? deal.contactId ?? '-'} />
            <Meta label="Created" value={formatDate(deal.createdAt)} />
          </dl>
        </div>
        <Link className="w-full rounded bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 sm:w-auto" to={`/deals/${deal.id}`}>
          Open deal
        </Link>
      </div>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-gray-900">{value}</dd>
    </div>
  );
}
