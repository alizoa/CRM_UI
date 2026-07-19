import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { OnboardingChecklist } from '../components/dashboard/OnboardingChecklist';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../hooks/useDashboard';
import type { DashboardLeadStatus, DashboardLeadTemperature, DashboardSummary } from '../lib/dashboard';

type AttentionItem = DashboardSummary['attention'][number];
type LeadStatusRow = DashboardSummary['leadStatus'][number];
type LeadTemperatureRow = DashboardSummary['leadTemperature'][number];
type LeadSourceRow = DashboardSummary['leadSources'][number];
type OwnerWorkloadRow = DashboardSummary['ownership'][number];
type RecentLeadActivity = DashboardSummary['activities']['recent'][number];

function formatCount(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0';
  }

  return new Intl.NumberFormat().format(value);
}

function formatPercent(count: number, total: number) {
  if (total <= 0) {
    return '0%';
  }

  return `${Math.round((count / total) * 100)}%`;
}

function getBarWidth(count: number, total: number) {
  if (count <= 0 || total <= 0) {
    return '0%';
  }

  return `${Math.max(8, Math.round((count / total) * 100))}%`;
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

function getAttentionToneClassName(tone: AttentionItem['tone']) {
  if (tone === 'critical') {
    return 'border-red-200 bg-red-50 text-red-800';
  }

  if (tone === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }

  if (tone === 'positive') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }

  return 'border-gray-200 bg-gray-50 text-gray-700';
}

function getMetricToneClassName(tone: 'default' | 'warning' | 'critical') {
  if (tone === 'critical') {
    return 'border-red-200 bg-red-50 hover:border-red-300';
  }

  if (tone === 'warning') {
    return 'border-amber-200 bg-amber-50 hover:border-amber-300';
  }

  return 'border-gray-200 bg-white hover:border-gray-400';
}

function getStatusBarClassName(status: DashboardLeadStatus) {
  const classNames: Record<DashboardLeadStatus, string> = {
    NEW: 'bg-blue-500',
    CONTACTED: 'bg-violet-500',
    FOLLOW_UP_NEEDED: 'bg-amber-500',
    QUALIFIED: 'bg-emerald-500',
    WON: 'bg-green-500',
    LOST: 'bg-gray-400',
  };

  return classNames[status];
}

function getTemperatureBarClassName(temperature: DashboardLeadTemperature) {
  const classNames: Record<DashboardLeadTemperature, string> = {
    HOT: 'bg-red-500',
    WARM: 'bg-amber-500',
    COLD: 'bg-blue-500',
    NOT_SET: 'bg-gray-300',
  };

  return classNames[temperature];
}

function DashboardCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={['rounded border border-gray-200 bg-white p-4', className].join(' ')}>{children}</section>;
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

function HeaderActions() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Link
        to="/today"
        className="inline-flex items-center justify-center rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
      >
        Open Today
      </Link>
      <div className="flex flex-wrap gap-2">
        <Link className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2" to="/leads">
          Add lead
        </Link>
        <Link className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2" to="/tasks">
          Add task
        </Link>
      </div>
    </div>
  );
}

function KeyMetricCard({
  label,
  value,
  helper,
  href,
  tone = 'default',
}: {
  label: string;
  value: number;
  helper: string;
  href: string;
  tone?: 'default' | 'warning' | 'critical';
}) {
  return (
    <Link
      className={[
        'block rounded border p-4 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2',
        getMetricToneClassName(tone),
      ].join(' ')}
      to={href}
    >
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-gray-950">{formatCount(value)}</p>
      <p className="mt-2 text-sm text-gray-600">{value > 0 ? helper : 'Nothing waiting here.'}</p>
      <p className="mt-3 text-sm font-medium text-gray-800">Open</p>
    </Link>
  );
}

function KeyMetrics({ data }: { data: DashboardSummary }) {
  return (
    <section aria-labelledby="key-metrics-title" className="space-y-3">
      <h2 id="key-metrics-title" className="text-base font-semibold text-gray-900">Key lead metrics</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KeyMetricCard
          label="New Leads"
          value={data.keyMetrics.newLeadsCount}
          helper="Fresh leads waiting for first action."
          href="/leads"
        />
        <KeyMetricCard
          label="Leads Needing Attention"
          value={data.keyMetrics.needsAttentionCount}
          helper="Lead follow-ups, ownership gaps, and active follow-up statuses."
          href="/leads"
          tone={data.keyMetrics.needsAttentionCount > 0 ? 'warning' : 'default'}
        />
        <KeyMetricCard
          label="Follow-ups Due Today"
          value={data.keyMetrics.followUpsDueTodayCount}
          helper="Lead follow-up work scheduled for today."
          href="/today"
          tone={data.keyMetrics.followUpsDueTodayCount > 0 ? 'warning' : 'default'}
        />
        <KeyMetricCard
          label="Overdue Follow-ups"
          value={data.keyMetrics.overdueFollowUpsCount}
          helper="Lead follow-up tasks past their due date."
          href="/tasks"
          tone={data.keyMetrics.overdueFollowUpsCount > 0 ? 'critical' : 'default'}
        />
      </div>
    </section>
  );
}

function AttentionNeeded({ items }: { items: AttentionItem[] }) {
  const visibleItems = items.filter((item) => item.count > 0);

  return (
    <DashboardCard>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Attention Needed</h2>
          <p className="mt-1 text-sm text-gray-600">Lead-specific work that can slow down progress.</p>
        </div>
        <Link className="text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900" to="/today">
          Open Today
        </Link>
      </div>
      {visibleItems.length === 0 ? (
        <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">No lead attention items right now.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {visibleItems.map((item) => (
            <Link key={item.id} to={item.href} className="block rounded border border-gray-200 bg-white p-3 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">
              <div className="flex items-start gap-3">
                <span className={['mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold', getAttentionToneClassName(item.tone)].join(' ')}>
                  {formatCount(item.count)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900">{item.title}</span>
                  <span className="mt-1 block text-sm text-gray-600">{item.description}</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

function LeadPipelineOverview({ rows }: { rows: LeadStatusRow[] }) {
  const activeTotal = rows.filter((row) => row.active).reduce((total, row) => total + row.count, 0);
  const totalLeads = rows.reduce((total, row) => total + row.count, 0);

  return (
    <DashboardCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Lead Pipeline Overview</h2>
          <p className="mt-1 text-sm text-gray-600">Active lifecycle distribution, with closed outcomes muted for context.</p>
        </div>
        <Link className="text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900" to="/leads">
          Open Leads
        </Link>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const denominator = row.active ? activeTotal : totalLeads;
          const percent = formatPercent(row.count, denominator);
          const width = getBarWidth(row.count, denominator);

          return (
            <div key={row.status} className={row.active ? undefined : 'opacity-70'}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{row.label}</p>
                  <p className="text-xs text-gray-500">{row.active ? `${percent} of active leads` : `${percent} of all leads`}</p>
                </div>
                <p className="shrink-0 text-gray-600">{formatCount(row.count)}</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded bg-gray-100">
                <div className={['h-full rounded', getStatusBarClassName(row.status)].join(' ')} style={{ width }} />
              </div>
            </div>
          );
        })}
      </div>
    </DashboardCard>
  );
}

function LeadTemperatureOverview({ rows }: { rows: LeadTemperatureRow[] }) {
  const totalLeads = rows.reduce((total, row) => total + row.count, 0);

  return (
    <DashboardCard>
      <h2 className="text-base font-semibold text-gray-900">Lead Temperature</h2>
      <p className="mt-1 text-sm text-gray-600">A quick read on lead urgency and quality.</p>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.temperature}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-medium text-gray-900">{row.label}</p>
              <p className="text-gray-600">{formatCount(row.count)} - {formatPercent(row.count, totalLeads)}</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded bg-gray-100">
              <div className={['h-full rounded', getTemperatureBarClassName(row.temperature)].join(' ')} style={{ width: getBarWidth(row.count, totalLeads) }} />
            </div>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

function TodaysLeadWork({ followUps }: { followUps: DashboardSummary['followUps'] }) {
  const items = [
    { label: 'Overdue follow-ups', value: followUps.overdueCount, helper: 'Handle first', tone: 'critical' as const, href: '/tasks' },
    { label: 'Follow-ups due today', value: followUps.dueTodayCount, helper: 'Scheduled for today', tone: 'warning' as const, href: '/today' },
    { label: 'Upcoming follow-ups', value: followUps.upcomingCount, helper: 'Coming next', tone: 'neutral' as const, href: '/tasks' },
    { label: 'Completed follow-ups this week', value: followUps.completedThisWeekCount, helper: 'Recently finished', tone: 'positive' as const, href: '/tasks' },
  ];

  return (
    <DashboardCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Today's Lead Work</h2>
          <p className="mt-1 text-sm text-gray-600">Follow-up work tied to leads.</p>
        </div>
        <Link className="text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900" to="/tasks">
          Open Tasks
        </Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.label}
            to={item.href}
            className={['rounded border p-3 hover:bg-white focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2', getAttentionToneClassName(item.tone)].join(' ')}
          >
            <p className="text-sm font-medium">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold">{formatCount(item.value)}</p>
            <p className="mt-1 text-xs">{item.value === 0 ? 'Nothing waiting here.' : item.helper}</p>
          </Link>
        ))}
      </div>
    </DashboardCard>
  );
}

function LeadSourceOverview({ rows }: { rows: LeadSourceRow[] }) {
  const totalLeads = rows.reduce((total, row) => total + row.count, 0);

  return (
    <DashboardCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Lead Sources</h2>
          <p className="mt-1 text-sm text-gray-600">Where the current demo leads came from.</p>
        </div>
        <Link className="text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900" to="/leads">
          Open Leads
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">No lead sources yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.source}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <p className="font-medium text-gray-900">{row.label}</p>
                <p className="text-gray-600">{formatCount(row.count)} - {formatPercent(row.count, totalLeads)}</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded bg-gray-100">
                <div className="h-full rounded bg-gray-700" style={{ width: getBarWidth(row.count, totalLeads) }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

function LeadOwnership({ rows }: { rows: OwnerWorkloadRow[] }) {
  return (
    <DashboardCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Lead Ownership</h2>
          <p className="mt-1 text-sm text-gray-600">Active lead workload by owner.</p>
        </div>
        <Link className="text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900" to="/leads">
          Open Leads
        </Link>
      </div>
      <div className="mt-4 divide-y divide-gray-100">
        {rows.map((row) => (
          <div key={row.ownerId ?? 'unassigned'} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{row.ownerName}</p>
              <p className="mt-1 text-xs text-gray-500">{formatCount(row.activeLeadsCount)} active leads</p>
            </div>
            <span className={['shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium', row.needsAttentionCount > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'].join(' ')}>
              {formatCount(row.needsAttentionCount)} need attention
            </span>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

function LeadOutcomes({ conversion }: { conversion: DashboardSummary['conversion'] }) {
  const items = [
    { label: 'Active leads', value: conversion.activeCount, href: '/leads' },
    { label: 'Won leads', value: conversion.wonCount, href: '/leads?status=WON' },
    { label: 'Lost leads', value: conversion.lostCount, href: '/leads?status=LOST' },
  ];

  return (
    <DashboardCard>
      <h2 className="text-base font-semibold text-gray-900">Lead Outcomes</h2>
      <p className="mt-1 text-sm text-gray-600">Closed outcomes are visible without turning the dashboard into post-sale management.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
        {items.map((item) => (
          <Link key={item.label} to={item.href} className="rounded border border-gray-200 bg-white p-3 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">
            <p className="text-sm font-medium text-gray-600">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCount(item.value)}</p>
          </Link>
        ))}
      </div>
    </DashboardCard>
  );
}

function RecentLeadActivityList({ activities }: { activities: RecentLeadActivity[] }) {
  const recentActivities = activities.slice(0, 5);

  return (
    <DashboardCard>
      <h2 className="text-base font-semibold text-gray-900">Recent Lead Activity</h2>
      {recentActivities.length === 0 ? <p className="mt-3 text-sm text-gray-600">No recent lead activity yet.</p> : null}
      {recentActivities.length > 0 ? (
        <ul className="mt-3 divide-y divide-gray-100">
          {recentActivities.map((activity) => (
            <li key={activity.id} className="py-3 first:pt-0 last:pb-0">
              <Link className="-mx-2 -my-2 block rounded px-2 py-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2" to={`/leads/${activity.leadId}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-gray-900">{activity.description}</p>
                    <p className="mt-1 break-words text-sm text-gray-600">{activity.leadName}</p>
                    <p className="mt-1 text-xs text-gray-500">{activity.actorName}</p>
                  </div>
                  <time className="shrink-0 text-xs text-gray-500" dateTime={activity.createdAt}>
                    {formatShortDateTime(activity.createdAt)}
                  </time>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </DashboardCard>
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

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-600">Your lead activity, follow-ups, and pipeline at a glance.</p>
          </div>
          <HeaderActions />
        </div>

        <OnboardingChecklist accessToken={accessToken} />

        {loading ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
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
            <KeyMetrics data={data} />

            <div className="grid gap-4 xl:grid-cols-2">
              <AttentionNeeded items={data.attention} />
              <LeadPipelineOverview rows={data.leadStatus} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <TodaysLeadWork followUps={data.followUps} />
              <RecentLeadActivityList activities={data.activities.recent} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <LeadTemperatureOverview rows={data.leadTemperature} />
              <LeadSourceOverview rows={data.leadSources} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
              <LeadOwnership rows={data.ownership} />
              <LeadOutcomes conversion={data.conversion} />
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
