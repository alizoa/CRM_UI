import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { OnboardingChecklist } from '../components/dashboard/OnboardingChecklist';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../hooks/useDashboard';
import type { DashboardSummary } from '../lib/dashboard';

type StatCardData = {
  label: string;
  formattedValue: string;
  helperText?: string;
  linkTo?: string;
  isZero?: boolean;
  important?: boolean;
};

type RecentActivity = DashboardSummary['activities']['recent'][number];

const EMPTY_VALUE = '—';
const ACTION_LABELS: Record<string, string> = {
  'Deal.created': 'Deal created',
  'Deal.updated': 'Deal updated',
  'Deal.moved': 'Deal moved',
  'Deal.won': 'Deal marked won',
  'Deal.lost': 'Deal marked lost',
  'Deal.reopened': 'Deal reopened',
  'Contact.created': 'Contact created',
  'Contact.updated': 'Contact updated',
  'Contact.archived': 'Contact archived',
  'Contact.restored': 'Contact restored',
  'Task.created': 'Task created',
  'Task.updated': 'Task updated',
  'Task.completed': 'Task completed',
  'Task.reopened': 'Task reopened',
  'Note.created': 'Note added',
};
const ENTITY_TYPE_LABELS: Record<string, string> = {
  CONTACT: 'Contact',
  DEAL: 'Deal',
  NOTE: 'Note',
  TASK: 'Task',
};

function formatCount(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0';
  }

  return new Intl.NumberFormat().format(value);
}

function formatOpenDealValue(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === '') {
    return EMPTY_VALUE;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue === 0) {
    return EMPTY_VALUE;
  }

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

function formatShortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function toTitleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getActionLabel(action: string) {
  const normalizedAction = action.trim();
  const mappedLabel = ACTION_LABELS[normalizedAction];
  if (mappedLabel) {
    return mappedLabel;
  }

  const readableAction = normalizedAction.replace(/[._-]+/g, ' ');

  return toTitleCase(readableAction) || 'Activity';
}

function getEntityTypeLabel(entityType: string) {
  const normalizedEntityType = entityType.trim().toUpperCase();
  const mappedLabel = ENTITY_TYPE_LABELS[normalizedEntityType];
  if (mappedLabel) {
    return mappedLabel;
  }

  return toTitleCase(entityType.replace(/[._-]+/g, ' ')) || 'Record';
}

function getActivityLink(activity: RecentActivity) {
  const entityType = activity.entityType.trim().toUpperCase();

  if (entityType === 'DEAL' && activity.entityId) {
    return `/deals/${activity.entityId}`;
  }

  if (entityType === 'CONTACT' && activity.entityId) {
    return `/contacts/${activity.entityId}`;
  }

  if (entityType === 'TASK') {
    return '/tasks';
  }

  return undefined;
}

function SkeletonCard() {
  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
      <div className="mt-3 h-8 w-20 animate-pulse rounded bg-gray-200" />
      <div className="mt-3 h-3 w-32 animate-pulse rounded bg-gray-100" />
    </div>
  );
}

function DashboardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function SkeletonSection({ title, count }: { title: string; count: number }) {
  return (
    <DashboardSection title={title}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </DashboardSection>
  );
}

function StatCard({ label, formattedValue, helperText, linkTo, isZero = false, important = false }: StatCardData) {
  const cardClassName = important
    ? 'block rounded border border-amber-200 bg-amber-50 p-4 hover:border-amber-300'
    : isZero
      ? 'block rounded border border-gray-200 bg-gray-50 p-4 hover:border-gray-300'
      : 'block rounded border border-gray-200 bg-white p-4 hover:border-gray-300';
  const valueClassName = isZero ? 'mt-3 break-words text-2xl font-semibold text-gray-500' : 'mt-3 break-words text-2xl font-semibold text-gray-900';
  const content = (
    <>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={valueClassName}>{formattedValue}</p>
      {helperText ? <p className="mt-2 text-xs text-gray-500">{helperText}</p> : null}
    </>
  );

  if (linkTo) {
    return (
      <Link className={cardClassName} to={linkTo}>
        {content}
      </Link>
    );
  }

  return <div className={cardClassName}>{content}</div>;
}

function RecentActivityList({ activities }: { activities: RecentActivity[] }) {
  const recentActivities = activities.slice(0, 5);

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-base font-semibold text-gray-900">Recent activity</h2>
      {recentActivities.length === 0 ? <p className="mt-3 text-sm text-gray-600">No recent activity yet.</p> : null}
      {recentActivities.length > 0 ? (
        <ul className="mt-3 divide-y divide-gray-100">
          {recentActivities.map((activity) => {
            const activityLink = getActivityLink(activity);
            const entityTypeLabel = getEntityTypeLabel(activity.entityType);
            const rowContent = (
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-gray-900">{getActionLabel(activity.action)}</p>
                  <p className="mt-1 break-words text-sm text-gray-600">
                    {activity.actorName || 'System'} · {entityTypeLabel}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-gray-500" dateTime={activity.createdAt}>
                  {formatShortDateTime(activity.createdAt)}
                </time>
              </div>
            );

            return (
              <li key={activity.id} className="py-3 first:pt-0 last:pb-0">
                {activityLink ? (
                  <Link className="block rounded px-2 py-2 -mx-2 -my-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2" to={activityLink}>
                    {rowContent}
                  </Link>
                ) : (
                  rowContent
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export function DashboardPage() {
  const { accessToken, logout } = useAuth();
  const { data, loading, error, refetch } = useDashboard(accessToken);

  useEffect(() => {
    if (error?.status === 401) {
      void logout();
    }
  }, [error?.status, logout]);

  const openDealValue = data ? formatOpenDealValue(data.deals.openValue) : EMPTY_VALUE;
  const salesStats: StatCardData[] = data
    ? [
        {
          label: 'Open Deals',
          formattedValue: formatCount(data.deals.openCount),
          helperText: 'Active pipeline opportunities',
          linkTo: '/deals',
          isZero: data.deals.openCount === 0,
        },
        {
          label: 'Open Deal Value',
          formattedValue: openDealValue,
          helperText: 'Total open deal value; no currency set',
          linkTo: '/deals',
          isZero: openDealValue === EMPTY_VALUE,
        },
        {
          label: 'Won Deals',
          formattedValue: formatCount(data.deals.wonCount),
          helperText: 'Closed won deals',
          linkTo: '/deals',
          isZero: data.deals.wonCount === 0,
        },
        {
          label: 'Lost Deals',
          formattedValue: formatCount(data.deals.lostCount),
          helperText: 'Closed lost deals',
          linkTo: '/deals',
          isZero: data.deals.lostCount === 0,
        },
      ]
    : [];
  const customerStats: StatCardData[] = data
    ? [
        {
          label: 'Prospects',
          formattedValue: formatCount(data.contacts.totalLeads),
          helperText: 'Contacts not yet marked as customers',
          linkTo: '/contacts',
          isZero: data.contacts.totalLeads === 0,
        },
        {
          label: 'Customers',
          formattedValue: formatCount(data.contacts.totalCustomers),
          helperText: 'Customer records',
          linkTo: '/contacts',
          isZero: data.contacts.totalCustomers === 0,
        },
        {
          label: 'Archived Contacts',
          formattedValue: formatCount(data.contacts.totalArchived),
          helperText: 'Inactive contact records',
          linkTo: '/contacts',
          isZero: data.contacts.totalArchived === 0,
        },
        {
          label: 'Lead Sources',
          formattedValue: formatCount(data.leadSources.summary.length),
          helperText: 'Configured source categories',
          linkTo: '/contacts',
          isZero: data.leadSources.summary.length === 0,
        },
      ]
    : [];
  const workStats: StatCardData[] = data
    ? [
        {
          label: 'Open Tasks',
          formattedValue: formatCount(data.tasks.openCount),
          helperText: 'Tasks still in progress',
          linkTo: '/tasks',
          isZero: data.tasks.openCount === 0,
        },
        {
          label: 'Due Today',
          formattedValue: formatCount(data.tasks.dueTodayCount),
          helperText: 'Needs attention today',
          linkTo: '/tasks',
          isZero: data.tasks.dueTodayCount === 0,
        },
        {
          label: 'Overdue Tasks',
          formattedValue: formatCount(data.tasks.overdueCount),
          helperText: data.tasks.overdueCount > 0 ? 'Past due work to review' : 'No overdue work',
          linkTo: '/tasks',
          isZero: data.tasks.overdueCount === 0,
          important: data.tasks.overdueCount > 0,
        },
        {
          label: 'Upcoming Tasks',
          formattedValue: formatCount(data.tasks.upcomingCount),
          helperText: 'Future open work',
          linkTo: '/tasks',
          isZero: data.tasks.upcomingCount === 0,
        },
      ]
    : [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600">Your business at a glance.</p>
          </div>
          <Link
            to="/today"
            className="inline-flex w-full items-center justify-center rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 sm:w-auto"
          >
            Open Today →
          </Link>
        </div>

        <OnboardingChecklist accessToken={accessToken} />

        {loading ? (
          <div className="space-y-6">
            <SkeletonSection title="Sales overview" count={4} />
            <SkeletonSection title="Customers" count={4} />
            <SkeletonSection title="Work" count={4} />
            <section className="rounded border border-gray-200 bg-white p-4">
              <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-10 animate-pulse rounded bg-gray-100" />
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="rounded border border-red-200 bg-white p-5">
            <h2 className="text-base font-semibold text-red-900">Could not load dashboard</h2>
            <p className="mt-2 text-sm text-red-700">{error.message}</p>
            <button
              type="button"
              onClick={() => {
                void refetch();
              }}
              className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Retry
            </button>
          </div>
        ) : null}

        {!loading && !error && data ? (
          <div className="space-y-6">
            <DashboardSection title="Sales overview">
              {salesStats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </DashboardSection>
            <DashboardSection title="Customers">
              {customerStats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </DashboardSection>
            <DashboardSection title="Work">
              {workStats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </DashboardSection>
            <RecentActivityList activities={data.activities.recent} />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
