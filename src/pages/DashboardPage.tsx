import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { OnboardingChecklist } from '../components/dashboard/OnboardingChecklist';
import { useAuth } from '../context/AuthContext';
import { useDashboard } from '../hooks/useDashboard';
import { DASHBOARD_LEAD_ATTENTION_REASONS, countAttentionReason } from '../lib/dashboard';
import type { DashboardLeadAttentionReasonId, DashboardLeadStatus, DashboardLeadTemperature, DashboardSummary } from '../lib/dashboard';

type LeadStatusRow = DashboardSummary['leadStatus'][number];
type LeadTemperatureRow = DashboardSummary['leadTemperature'][number];
type LeadSourceRow = DashboardSummary['leadSources'][number];
type OwnerWorkloadRow = DashboardSummary['ownership'][number];
type RecentLeadActivity = DashboardSummary['activities']['recent'][number];
type KeyMetricId = 'newLeads' | 'needsAttention' | 'followUpsDueToday' | 'overdueFollowUps';
type KeyMetricDetail = DashboardSummary['keyMetricDetails'][KeyMetricId][number];
type AttentionBreakdownItem = {
  id: DashboardLeadAttentionReasonId;
  label: string;
  count: number;
  tone: 'warning' | 'critical';
};
type AttentionFilterId = 'all' | DashboardLeadAttentionReasonId;
type DonutSegment = {
  id: string;
  label: string;
  count: number;
  color: string;
};
type DonutLegendItem = DonutSegment & {
  percent: string;
};

const KEY_METRIC_MODAL_COPY: Record<KeyMetricId, { title: string; empty: string }> = {
  newLeads: {
    title: 'New Leads',
    empty: 'No new leads are waiting right now.',
  },
  needsAttention: {
    title: 'Leads Needing Attention',
    empty: 'No lead attention items right now.',
  },
  followUpsDueToday: {
    title: 'Follow-ups Due Today',
    empty: 'No lead follow-up tasks are due today.',
  },
  overdueFollowUps: {
    title: 'Overdue Follow-ups',
    empty: 'No overdue lead follow-up tasks right now.',
  },
};

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

function getMetricToneClassName(tone: 'default' | 'warning' | 'critical') {
  if (tone === 'critical') {
    return 'border-red-200 bg-red-50 hover:border-red-300 hover:bg-red-100/60';
  }

  if (tone === 'warning') {
    return 'border-amber-200 bg-amber-50 hover:border-amber-300 hover:bg-amber-100/60';
  }

  return 'border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50';
}

function getWorkToneClassName(tone: 'critical' | 'warning' | 'neutral' | 'positive') {
  if (tone === 'critical') return 'border-red-200 bg-red-50 text-red-800';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (tone === 'positive') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return 'border-gray-200 bg-gray-50 text-gray-700';
}

function getStatusColor(status: DashboardLeadStatus) {
  const colors: Record<DashboardLeadStatus, string> = {
    NEW: '#3b82f6',
    CONTACTED: '#8b5cf6',
    FOLLOW_UP_NEEDED: '#f59e0b',
    QUALIFIED: '#10b981',
    WON: '#86efac',
    LOST: '#cbd5e1',
  };

  return colors[status];
}

function getTemperatureColor(temperature: DashboardLeadTemperature) {
  const colors: Record<DashboardLeadTemperature, string> = {
    HOT: '#ef4444',
    WARM: '#f59e0b',
    COLD: '#3b82f6',
    NOT_SET: '#d1d5db',
  };

  return colors[temperature];
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
  tone = 'default',
  onOpen,
}: {
  label: string;
  value: number;
  helper: string;
  tone?: 'default' | 'warning' | 'critical';
  onOpen: (opener: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => onOpen(event.currentTarget)}
      aria-label={`${label}: ${formatCount(value)}. Open details.`}
      className={[
        'block w-full cursor-pointer rounded border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2',
        getMetricToneClassName(tone),
      ].join(' ')}
    >
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="mt-2 text-3xl font-semibold leading-none text-gray-950">{formatCount(value)}</p>
      <p className="mt-2 text-xs text-gray-600">{value > 0 ? helper : 'Nothing waiting here.'}</p>
    </button>
  );
}

function KeyMetrics({ data }: { data: DashboardSummary }) {
  const [openMetric, setOpenMetric] = useState<KeyMetricId | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const openModal = (metric: KeyMetricId, opener: HTMLButtonElement) => {
    openerRef.current = opener;
    setOpenMetric(metric);
  };
  const closeModal = () => {
    setOpenMetric(null);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  };

  return (
    <section aria-labelledby="key-metrics-title" className="space-y-3">
      <div>
        <h2 id="key-metrics-title" className="text-base font-semibold text-gray-900">Needs attention</h2>
        <p className="mt-1 text-sm text-gray-600">The fastest read on lead work that may need action now.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KeyMetricCard
          label="New Leads"
          value={data.keyMetrics.newLeadsCount}
          helper="Awaiting first action."
          onOpen={(opener) => openModal('newLeads', opener)}
        />
        <KeyMetricCard
          label="Leads Needing Attention"
          value={data.keyMetrics.needsAttentionCount}
          helper="Unique leads with issues."
          tone={data.keyMetrics.needsAttentionCount > 0 ? 'warning' : 'default'}
          onOpen={(opener) => openModal('needsAttention', opener)}
        />
        <KeyMetricCard
          label="Follow-ups Due Today"
          value={data.keyMetrics.followUpsDueTodayCount}
          helper="Scheduled for today."
          tone={data.keyMetrics.followUpsDueTodayCount > 0 ? 'warning' : 'default'}
          onOpen={(opener) => openModal('followUpsDueToday', opener)}
        />
        <KeyMetricCard
          label="Overdue Follow-ups"
          value={data.keyMetrics.overdueFollowUpsCount}
          helper="Past due date."
          tone={data.keyMetrics.overdueFollowUpsCount > 0 ? 'critical' : 'default'}
          onOpen={(opener) => openModal('overdueFollowUps', opener)}
        />
      </div>

      {openMetric ? (
        <KeyMetricModal
          metric={openMetric}
          items={data.keyMetricDetails[openMetric]}
          onClose={closeModal}
        />
      ) : null}
    </section>
  );
}

function metricItemToneClassName(tone: KeyMetricDetail['tone']) {
  if (tone === 'critical') return 'border-red-200 bg-red-50 text-red-800';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-gray-200 bg-gray-50 text-gray-700';
}

function getAttentionBreakdown(items: KeyMetricDetail[]): AttentionBreakdownItem[] {
  return DASHBOARD_LEAD_ATTENTION_REASONS.map((reason) => ({
    ...reason,
    count: countAttentionReason(items, reason.id),
  }));
}

const ATTENTION_FILTER_LABELS: Record<DashboardLeadAttentionReasonId, string> = {
  OVERDUE_FOLLOW_UP: 'Overdue',
  FOLLOW_UP_DUE_TODAY: 'Due today',
  UNASSIGNED_LEAD: 'Unassigned',
  NO_ACTIVE_FOLLOW_UP: 'No follow-up',
  HOT_LEAD_WITHOUT_OPEN_TASK: 'Hot without tasks',
};

function getMetricSubtitle(metric: KeyMetricId, count: number) {
  if (metric === 'needsAttention') {
    return `${formatCount(count)} ${count === 1 ? 'lead requires' : 'leads require'} attention.`;
  }

  if (metric === 'newLeads') {
    return `${formatCount(count)} new ${count === 1 ? 'lead is' : 'leads are'} waiting.`;
  }

  if (metric === 'followUpsDueToday') {
    return `${formatCount(count)} ${count === 1 ? 'follow-up is' : 'follow-ups are'} due today.`;
  }

  return `${formatCount(count)} overdue ${count === 1 ? 'follow-up needs' : 'follow-ups need'} attention.`;
}

function attentionFilterToneClassName(tone: AttentionBreakdownItem['tone'] | 'neutral', selected: boolean) {
  if (tone === 'critical') {
    return selected
      ? 'border-red-500 bg-red-100 text-red-900 ring-2 ring-red-200'
      : 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100/70';
  }

  if (tone === 'warning') {
    return selected
      ? 'border-amber-500 bg-amber-100 text-amber-900 ring-2 ring-amber-200'
      : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100/70';
  }

  return selected
    ? 'border-gray-600 bg-gray-100 text-gray-950 ring-2 ring-gray-200'
    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50';
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

function KeyMetricModal({
  metric,
  items,
  onClose,
}: {
  metric: KeyMetricId;
  items: KeyMetricDetail[];
  onClose: () => void;
}) {
  const copy = KEY_METRIC_MODAL_COPY[metric];
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<AttentionFilterId>('all');
  const attentionBreakdown = metric === 'needsAttention' ? getAttentionBreakdown(items).filter((item) => item.count > 0) : [];
  const selectedFilterAvailable = selectedFilter === 'all' || attentionBreakdown.some((item) => item.id === selectedFilter);
  const visibleItems = metric === 'needsAttention' && selectedFilter !== 'all'
    ? items.filter((item) => item.reasons?.some((reason) => reason.id === selectedFilter))
    : items;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!selectedFilterAvailable) {
      setSelectedFilter('all');
    }
  }, [selectedFilterAvailable]);

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab' || !dialogRef.current) return;

    const focusableElements = getFocusableElements(dialogRef.current);
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 px-3 py-4 sm:px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="key-metric-modal-title"
      onMouseDown={handleBackdropMouseDown}
      onKeyDown={handleKeyDown}
    >
      <div ref={dialogRef} className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="shrink-0 border-b border-gray-200 px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="key-metric-modal-title" className="text-lg font-semibold text-gray-950">{copy.title}</h3>
            <p className="mt-1 text-sm text-gray-700">{getMetricSubtitle(metric, items.length)}</p>
            {metric === 'needsAttention' ? (
              <p className="mt-0.5 text-xs text-gray-500">A lead may have more than one reason.</p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Close
          </button>
          </div>

          {attentionBreakdown.length > 0 ? (
            <div className="mt-3 grid gap-2 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              <button
                type="button"
                aria-pressed={selectedFilter === 'all'}
                onClick={() => setSelectedFilter('all')}
                className={['rounded border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2', attentionFilterToneClassName('neutral', selectedFilter === 'all')].join(' ')}
              >
                <span className="block text-xs font-medium">All leads</span>
                <span className="mt-1 block text-xl font-semibold leading-none">{formatCount(items.length)}</span>
              </button>
              {attentionBreakdown.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selectedFilter === item.id}
                  onClick={() => setSelectedFilter(item.id)}
                  className={['rounded border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2', attentionFilterToneClassName(item.tone, selectedFilter === item.id)].join(' ')}
                >
                  <span className="block text-xs font-medium">{ATTENTION_FILTER_LABELS[item.id]}</span>
                  <span className="mt-1 block text-xl font-semibold leading-none">{formatCount(item.count)}</span>
                </button>
              ))}
            </div>
          ) : null}

          {metric === 'needsAttention' && selectedFilter !== 'all' ? (
            <p className="mt-3 text-xs text-gray-600">
              Showing {formatCount(visibleItems.length)} of {formatCount(items.length)} leads
            </p>
          ) : null}
        </div>

        <div className={['min-h-0 p-4 sm:px-5', visibleItems.length > 0 ? 'overflow-y-auto' : ''].join(' ')}>
          {items.length === 0 ? (
            <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{copy.empty}</p>
          ) : (
            <div className="space-y-2">
              {visibleItems.map((item) => (
                <Link
                  key={item.id}
                  to={item.href}
                  onClick={onClose}
                  className="block rounded border border-gray-200 bg-white px-3 py-2.5 transition hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-950">{item.title}</p>
                      <p className="mt-0.5 text-xs text-gray-600">{item.subtitle}</p>
                      {item.dueAt ? <p className="mt-0.5 text-xs text-gray-500">Due {formatShortDateTime(item.dueAt)}</p> : null}
                    </div>
                    <span className="flex shrink-0 items-center gap-2 sm:justify-end">
                      {item.reasons ? (
                        <span className="flex flex-wrap gap-1.5 sm:justify-end">
                          {item.reasons.map((reason) => (
                            <span key={reason.id} className={['rounded-full border px-2.5 py-1 text-xs font-semibold', metricItemToneClassName(reason.tone)].join(' ')}>
                              {reason.label}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className={['rounded-full border px-2.5 py-1 text-xs font-semibold', metricItemToneClassName(item.tone)].join(' ')}>
                          {item.detail}
                        </span>
                      )}
                      <span className="text-lg leading-none text-gray-400" aria-hidden="true">&rsaquo;</span>
                      </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function buildDonutPaths(segments: DonutSegment[], total: number) {
  let offset = 25;

  return segments.map((segment) => {
    const dash = total > 0 ? (segment.count / total) * 100 : 0;
    const path = { ...segment, dash, offset };
    offset -= dash;
    return path;
  });
}

function DonutChart({
  segments,
  total,
  label,
}: {
  segments: DonutSegment[];
  total: number;
  label: string;
}) {
  const paths = buildDonutPaths(segments.filter((segment) => segment.count > 0), total);
  const legendItems: DonutLegendItem[] = segments.map((segment) => ({
    ...segment,
    percent: formatPercent(segment.count, total),
  }));

  return (
    <div className="grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center">
      <div className="relative mx-auto h-24 w-24" role="img" aria-label={label}>
        <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="#f3f4f6" strokeWidth="6" />
          {paths.map((segment) => (
            <circle
              key={segment.id}
              cx="21"
              cy="21"
              r="15.9155"
              fill="transparent"
              stroke={segment.color}
              strokeWidth="6"
              strokeDasharray={`${segment.dash} ${100 - segment.dash}`}
              strokeDashoffset={segment.offset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-semibold leading-none text-gray-950">{formatCount(total)}</span>
          <span className="mt-1 text-xs font-medium leading-none text-gray-500">Leads</span>
        </div>
      </div>
      <ul className="min-w-0 space-y-1.5">
        {legendItems.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-start gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
              <span className="break-words font-medium leading-snug text-gray-900">{item.label}</span>
            </span>
            <span className="shrink-0 text-xs text-gray-600">{formatCount(item.count)} - {item.percent}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LeadPipelinePanel({ rows }: { rows: LeadStatusRow[] }) {
  const totalLeads = rows.reduce((total, row) => total + row.count, 0);
  const distributionLabel = `Lead status distribution: ${rows.map((row) => `${row.label} ${formatCount(row.count)} ${formatPercent(row.count, totalLeads)}`).join(', ')}`;

  return (
    <DashboardCard className="p-3 xl:col-span-2">
      <h3 className="text-base font-semibold text-gray-900">Pipeline</h3>

      <div className="mt-3 overflow-hidden rounded bg-gray-100" role="img" aria-label={distributionLabel}>
        <div className="flex h-5 w-full">
          {rows.map((row) => (
            <div
              key={row.status}
              className="h-full"
              style={{
                width: totalLeads > 0 ? `${(row.count / totalLeads) * 100}%` : '0%',
                backgroundColor: getStatusColor(row.status),
                opacity: row.active ? 1 : 0.72,
              }}
              title={`${row.label}: ${formatCount(row.count)} (${formatPercent(row.count, totalLeads)} of all leads)`}
            />
          ))}
        </div>
      </div>

      <ul className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.status} className={['flex items-start justify-between gap-3 text-sm', row.active ? '' : 'text-gray-600'].join(' ')}>
            <span className="flex min-w-0 items-start gap-2">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getStatusColor(row.status), opacity: row.active ? 1 : 0.72 }} aria-hidden="true" />
              <span className="break-words font-medium leading-snug text-gray-900">{row.label}</span>
            </span>
            <span className="shrink-0 text-xs text-gray-600">{formatCount(row.count)} - {formatPercent(row.count, totalLeads)}</span>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}

function LeadTemperaturePanel({ rows }: { rows: LeadTemperatureRow[] }) {
  const totalLeads = rows.reduce((total, row) => total + row.count, 0);
  const segments = rows.map((row) => ({
    id: row.temperature,
    label: row.label,
    count: row.count,
    color: getTemperatureColor(row.temperature),
  }));

  return (
    <DashboardCard className="p-3">
      <h3 className="text-base font-semibold text-gray-900">Temperature</h3>
      {totalLeads === 0 ? (
        <p className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">No lead temperature data yet.</p>
      ) : (
        <div className="mt-3">
          <DonutChart
            segments={segments}
            total={totalLeads}
            label={`Lead temperature chart: ${segments.map((segment) => `${segment.label} ${formatCount(segment.count)} ${formatPercent(segment.count, totalLeads)}`).join(', ')}`}
          />
        </div>
      )}
    </DashboardCard>
  );
}

function FollowUpSummary({ followUps }: { followUps: DashboardSummary['followUps'] }) {
  const items = [
    { label: 'Upcoming follow-ups', value: followUps.upcomingCount, helper: 'Coming next', tone: 'neutral' as const, href: '/tasks' },
    { label: 'Completed follow-ups this week', value: followUps.completedThisWeekCount, helper: 'Recently finished', tone: 'positive' as const, href: '/tasks' },
  ];

  return (
    <DashboardCard className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Follow-up Summary</h2>
          <p className="mt-1 text-sm text-gray-600">What is next and recently finished.</p>
        </div>
        <Link className="text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900" to="/tasks">
          Open Tasks
        </Link>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {items.map((item) => (
          <Link
            key={item.label}
            to={item.href}
            className={['rounded border px-3 py-2.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2', getWorkToneClassName(item.tone)].join(' ')}
          >
            <p className="text-sm font-medium">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold leading-none">{formatCount(item.value)}</p>
            <p className="mt-1 text-xs">{item.value === 0 ? 'Nothing waiting here.' : item.helper}</p>
          </Link>
        ))}
      </div>
    </DashboardCard>
  );
}

const SOURCE_COLORS = ['#374151', '#475569', '#2563eb', '#0f766e', '#a16207'];

function getTopSourceSegments(rows: LeadSourceRow[]): DonutSegment[] {
  const topSources = rows.slice(0, 4).map((row, index) => ({
    id: row.source,
    label: row.label,
    count: row.count,
    color: SOURCE_COLORS[index],
  }));
  const otherCount = rows.slice(4).reduce((total, row) => total + row.count, 0);

  if (otherCount <= 0) return topSources;

  return [
    ...topSources,
    {
      id: 'other',
      label: 'Other',
      count: otherCount,
      color: SOURCE_COLORS[4],
    },
  ];
}

function LeadSourcesPanel({ rows }: { rows: LeadSourceRow[] }) {
  const totalLeads = rows.reduce((total, row) => total + row.count, 0);
  const segments = getTopSourceSegments(rows);

  return (
    <DashboardCard className="p-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">Sources</h3>
      </div>
      {totalLeads === 0 ? (
        <p className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">No lead sources yet.</p>
      ) : (
        <div className="mt-3">
          <DonutChart
            segments={segments}
            total={totalLeads}
            label={`Lead sources chart: ${segments.map((segment) => `${segment.label} ${formatCount(segment.count)} ${formatPercent(segment.count, totalLeads)}`).join(', ')}`}
          />
        </div>
      )}
    </DashboardCard>
  );
}

function LeadOverview({ data }: { data: DashboardSummary }) {
  return (
    <section aria-labelledby="lead-overview-title" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="lead-overview-title" className="text-base font-semibold text-gray-900">Lead Overview</h2>
          <p className="mt-1 text-sm text-gray-600">Where leads are, how urgent they are, and where they came from.</p>
        </div>
        <Link className="text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2" to="/leads">
          Open Leads
        </Link>
      </div>
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LeadPipelinePanel rows={data.leadStatus} />
        <LeadTemperaturePanel rows={data.leadTemperature} />
        <LeadSourcesPanel rows={data.leadSources} />
      </div>
    </section>
  );
}

function LeadOwnership({ rows }: { rows: OwnerWorkloadRow[] }) {
  return (
    <DashboardCard className="self-start p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Lead Ownership</h2>
        </div>
        <Link className="text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900" to="/leads">
          Open Leads
        </Link>
      </div>
      <div className="mt-3 divide-y divide-gray-100">
        {rows.map((row) => (
          <div key={row.ownerId ?? 'unassigned'} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
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

function RecentLeadActivityList({ activities }: { activities: RecentLeadActivity[] }) {
  const recentActivities = activities.slice(0, 3);

  return (
    <DashboardCard className="p-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Recent Lead Activity</h2>
        <Link className="text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900" to="/leads">
          View all
        </Link>
      </div>
      {recentActivities.length === 0 ? <p className="mt-3 text-sm text-gray-600">No recent lead activity yet.</p> : null}
      {recentActivities.length > 0 ? (
        <ul className="mt-2 divide-y divide-gray-100">
          {recentActivities.map((activity) => (
            <li key={activity.id} className="py-2 first:pt-0 last:pb-0">
              <Link className="-mx-2 -my-1.5 block rounded px-2 py-1.5 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2" to={`/leads/${activity.leadId}`}>
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-gray-900">{activity.description}</p>
                    <p className="mt-0.5 break-words text-sm text-gray-600">{activity.leadName}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{activity.actorName}</p>
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

            <LeadOverview data={data} />

            <div className="grid gap-4 xl:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.25fr)]">
              <FollowUpSummary followUps={data.followUps} />
              <RecentLeadActivityList activities={data.activities.recent} />
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(320px,0.7fr)]">
              <LeadOwnership rows={data.ownership} />
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
