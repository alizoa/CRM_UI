import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  RefreshCw,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import type { HttpError } from '../lib/http';
import { listLeads, type Lead } from '../lib/leads';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';
import {
  completeTask,
  listTasks,
  subscribeToTaskChanges,
  updateTask,
  type Task,
} from '../lib/tasks';

type RequestError = {
  status: number;
  message: string;
};

type TodaySectionKey = 'overdue' | 'today' | 'upcoming' | 'completed';
type UpcomingGroup = {
  key: string;
  label: string;
  tasks: LeadAgendaTask[];
};

type LeadAgendaTask = {
  task: Task;
  lead: Lead;
  leadName: string;
  assigneeName: string;
};

type RescheduleState = {
  item: LeadAgendaTask;
  returnFocusTo: HTMLElement | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SECTION_EMPTY_COPY: Record<TodaySectionKey, string> = {
  overdue: 'No overdue tasks.',
  today: 'No tasks are due today.',
  upcoming: 'No Lead tasks are due in the next seven days.',
  completed: 'No tasks completed today.',
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

function getLocalDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getValidDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatHeaderDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function formatDateGroup(date: Date, tomorrowStart: Date) {
  if (getLocalDayStart(date).getTime() === tomorrowStart.getTime()) {
    return 'Tomorrow';
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function formatDueTime(value: string | null) {
  const date = getValidDate(value);
  if (!date) {
    return 'Any time';
  }

  if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0) {
    return 'Any time';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function toLocalDateInput(value: string | null | undefined) {
  const date = getValidDate(value);
  if (!date) {
    return '';
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function toLocalTimeInput(value: string | null | undefined) {
  const date = getValidDate(value);
  if (!date || (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0)) {
    return '';
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(11, 16);
}

function buildLocalDueAt(dateValue: string, timeValue: string) {
  if (!dateValue) {
    return null;
  }

  const localValue = timeValue ? `${dateValue}T${timeValue}` : `${dateValue}T00:00`;
  return new Date(localValue).toISOString();
}

function getLeadName(lead: Lead) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || lead.phone || 'Unnamed lead';
}

function getMembershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function getAssigneeName(task: Task, membershipsByUserId: Map<string, MembershipOption>) {
  const membership = task.assigneeId ? membershipsByUserId.get(task.assigneeId) : undefined;
  return task.assigneeSummary?.displayName ?? (membership ? getMembershipName(membership) : task.assigneeId ?? 'Unassigned');
}

function getOverdueLabel(task: Task, todayStart: Date) {
  const dueDate = getValidDate(task.dueAt);
  if (!dueDate) {
    return 'Overdue';
  }

  const dueStart = getLocalDayStart(dueDate);
  const days = Math.max(1, Math.round((todayStart.getTime() - dueStart.getTime()) / DAY_MS));
  return `${days} ${days === 1 ? 'day' : 'days'} overdue`;
}

function compareNullableDueTimes(left: Task, right: Task) {
  const leftDate = getValidDate(left.dueAt);
  const rightDate = getValidDate(right.dueAt);
  const leftHasTime = Boolean(leftDate && (leftDate.getHours() !== 0 || leftDate.getMinutes() !== 0 || leftDate.getSeconds() !== 0));
  const rightHasTime = Boolean(rightDate && (rightDate.getHours() !== 0 || rightDate.getMinutes() !== 0 || rightDate.getSeconds() !== 0));

  if (leftHasTime !== rightHasTime) {
    return leftHasTime ? -1 : 1;
  }

  return (leftDate?.getTime() ?? Number.POSITIVE_INFINITY) - (rightDate?.getTime() ?? Number.POSITIVE_INFINITY);
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => !element.hasAttribute('disabled'));
}

export function WorklistPage() {
  const { accessToken, logout } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Record<TodaySectionKey, boolean>>({
    overdue: true,
    today: true,
    upcoming: true,
    completed: false,
  });
  const [expandedDateGroups, setExpandedDateGroups] = useState<Record<string, boolean>>({});
  const [rescheduleState, setRescheduleState] = useState<RescheduleState | null>(null);
  const sectionRefs = useRef<Record<TodaySectionKey, HTMLElement | null>>({
    overdue: null,
    today: null,
    upcoming: null,
    completed: null,
  });
  const today = useMemo(() => new Date(), [refreshKey, tasks]);
  const todayStart = useMemo(() => getLocalDayStart(today), [today]);
  const tomorrowStart = useMemo(() => addLocalDays(todayStart, 1), [todayStart]);
  const nextSevenEnd = useMemo(() => addLocalDays(todayStart, 8), [todayStart]);

  const loadTodayData = () => {
    setRefreshKey((current) => current + 1);
  };

  useEffect(() => {
    if (!accessToken) {
      setTasks([]);
      setLeads([]);
      setMemberships([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const [tasksResponse, leadsResponse, membershipOptions] = await Promise.all([
          listTasks(token, { limit: 500 }),
          listLeads(token, { includeAll: true, limit: 500 }),
          listMembershipOptions(token),
        ]);

        if (!active) {
          return;
        }

        setTasks(tasksResponse.data);
        setLeads(leadsResponse.data);
        setMemberships(membershipOptions);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setTasks([]);
        setLeads([]);
        setMemberships([]);
        setError(toRequestError(requestError, 'Could not load today\'s agenda.'));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void fetchData();

    return () => {
      active = false;
    };
  }, [accessToken, refreshKey]);

  useEffect(() => {
    return subscribeToTaskChanges(loadTodayData);
  }, []);

  useEffect(() => {
    if (error?.status === 401) {
      void logout();
    }
  }, [error?.status, logout]);

  const agenda = useMemo(() => {
    const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
    const membershipsByUserId = new Map(memberships.map((membership) => [membership.userId, membership]));
    const leadTasks: LeadAgendaTask[] = tasks
      .filter((task) => task.entityType === 'LEAD')
      .map((task) => {
        const lead = leadsById.get(task.entityId);
        if (!lead) {
          return null;
        }

        return {
          task,
          lead,
          leadName: getLeadName(lead),
          assigneeName: getAssigneeName(task, membershipsByUserId),
        };
      })
      .filter((item): item is LeadAgendaTask => Boolean(item));

    const openTasks = leadTasks.filter(({ task }) => task.status !== 'DONE');
    const completedToday = leadTasks
      .filter(({ task }) => {
        if (task.status !== 'DONE') {
          return false;
        }

        const completedAt = getValidDate(task.completedAt);
        return Boolean(completedAt && completedAt >= todayStart && completedAt < tomorrowStart);
      })
      .sort((left, right) => (getValidDate(right.task.completedAt)?.getTime() ?? 0) - (getValidDate(left.task.completedAt)?.getTime() ?? 0));

    const overdue = openTasks
      .filter(({ task }) => {
        const dueDate = getValidDate(task.dueAt);
        return Boolean(dueDate && dueDate < todayStart);
      })
      .sort((left, right) => {
        const leftTime = getValidDate(left.task.dueAt)?.getTime() ?? 0;
        const rightTime = getValidDate(right.task.dueAt)?.getTime() ?? 0;
        return leftTime - rightTime || left.task.title.localeCompare(right.task.title);
      });

    const dueToday = openTasks
      .filter(({ task }) => {
        const dueDate = getValidDate(task.dueAt);
        return Boolean(dueDate && dueDate >= todayStart && dueDate < tomorrowStart);
      })
      .sort((left, right) => compareNullableDueTimes(left.task, right.task) || left.task.title.localeCompare(right.task.title));

    const upcomingTasks = openTasks
      .filter(({ task }) => {
        const dueDate = getValidDate(task.dueAt);
        return Boolean(dueDate && dueDate >= tomorrowStart && dueDate < nextSevenEnd);
      })
      .sort((left, right) => compareNullableDueTimes(left.task, right.task) || left.task.title.localeCompare(right.task.title));

    const groupsMap = new Map<string, UpcomingGroup>();
    for (const item of upcomingTasks) {
      const dueDate = getValidDate(item.task.dueAt);
      if (!dueDate) {
        continue;
      }

      const groupStart = getLocalDayStart(dueDate);
      const key = groupStart.toISOString();
      const currentGroup = groupsMap.get(key);
      if (currentGroup) {
        currentGroup.tasks.push(item);
      } else {
        groupsMap.set(key, {
          key,
          label: formatDateGroup(groupStart, tomorrowStart),
          tasks: [item],
        });
      }
    }

    const upcomingGroups = Array.from(groupsMap.values()).sort((left, right) => new Date(left.key).getTime() - new Date(right.key).getTime());

    return {
      overdue,
      dueToday,
      upcomingGroups,
      upcomingCount: upcomingTasks.length,
      completedToday,
    };
  }, [leads, memberships, nextSevenEnd, tasks, todayStart, tomorrowStart]);

  useEffect(() => {
    setExpandedSections((current) => ({
      ...current,
      overdue: agenda.overdue.length > 0 ? true : current.overdue,
    }));
  }, [agenda.overdue.length]);

  useEffect(() => {
    setExpandedDateGroups((current) => {
      const next = { ...current };
      for (const [index, group] of agenda.upcomingGroups.entries()) {
        if (next[group.key] === undefined) {
          next[group.key] = index === 0 && group.label === 'Tomorrow';
        }
      }

      return next;
    });
  }, [agenda.upcomingGroups]);

  const activeItemCount = agenda.overdue.length + agenda.dueToday.length + agenda.upcomingCount;
  const allCaughtUp = !loading && !error && activeItemCount === 0;

  function focusSection(section: TodaySectionKey) {
    setExpandedSections((current) => ({ ...current, [section]: true }));
    window.setTimeout(() => {
      const element = sectionRefs.current[section];
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      element?.focus();
    }, 0);
  }

  function toggleSection(section: TodaySectionKey) {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function toggleDateGroup(groupKey: string) {
    setExpandedDateGroups((current) => ({ ...current, [groupKey]: !current[groupKey] }));
  }

  async function handleComplete(item: LeadAgendaTask) {
    if (!accessToken) {
      setError({ status: 401, message: 'You need to sign in before updating tasks.' });
      return;
    }

    try {
      await completeTask(accessToken, item.task.id);
      loadTodayData();
    } catch (requestError) {
      setError(toRequestError(requestError, 'Could not complete task.'));
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-950">Today</h1>
            <p className="mt-2 text-base text-gray-600">{formatHeaderDate(today)} · Your task agenda</p>
          </div>
          <button
            type="button"
            onClick={loadTodayData}
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading ? <LoadingKpis /> : null}

        {!loading && error ? (
          <div className="rounded border border-red-200 bg-white p-5">
            <h2 className="text-base font-semibold text-red-900">Could not load Today</h2>
            <p className="mt-2 text-sm text-red-700">{error.message}</p>
            <button
              type="button"
              onClick={loadTodayData}
              className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Retry
            </button>
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <KpiCard
                count={agenda.overdue.length}
                helper="Tasks past their due date"
                icon={<AlertCircle className="h-6 w-6" aria-hidden="true" />}
                label="Overdue"
                onClick={() => focusSection('overdue')}
                tone="overdue"
              />
              <KpiCard
                count={agenda.dueToday.length}
                helper="Tasks due today"
                icon={<Calendar className="h-6 w-6" aria-hidden="true" />}
                label="Due Today"
                onClick={() => focusSection('today')}
                tone="today"
              />
              <KpiCard
                count={agenda.upcomingCount}
                helper="Tasks due this week"
                icon={<Clock3 className="h-6 w-6" aria-hidden="true" />}
                label="Next 7 Days"
                onClick={() => focusSection('upcoming')}
                tone="upcoming"
              />
            </div>

            {allCaughtUp ? (
              <div className="rounded border border-green-200 bg-green-50 p-5 text-sm font-medium text-green-800">You're all caught up.</div>
            ) : null}

            <div className="space-y-4">
              <AgendaSection
                accent="red"
                count={agenda.overdue.length}
                emptyMessage={SECTION_EMPTY_COPY.overdue}
                expanded={expandedSections.overdue}
                icon={<AlertCircle className="h-5 w-5" aria-hidden="true" />}
                id="today-overdue-section"
                onToggle={() => toggleSection('overdue')}
                sectionRef={(element) => {
                  sectionRefs.current.overdue = element;
                }}
                title="Overdue"
              >
                {agenda.overdue.map((item) => (
                  <TaskRow
                    key={item.task.id}
                    item={item}
                    metaLabel={getOverdueLabel(item.task, todayStart)}
                    metaTone="overdue"
                    onComplete={() => void handleComplete(item)}
                    onReschedule={(button) => setRescheduleState({ item, returnFocusTo: button })}
                  />
                ))}
              </AgendaSection>

              <AgendaSection
                accent="blue"
                count={agenda.dueToday.length}
                emptyMessage={SECTION_EMPTY_COPY.today}
                expanded={expandedSections.today}
                icon={<Calendar className="h-5 w-5" aria-hidden="true" />}
                id="today-due-section"
                onToggle={() => toggleSection('today')}
                sectionRef={(element) => {
                  sectionRefs.current.today = element;
                }}
                title="Due Today"
              >
                {agenda.dueToday.map((item) => (
                  <TaskRow
                    key={item.task.id}
                    item={item}
                    metaLabel={formatDueTime(item.task.dueAt)}
                    metaTone="today"
                    onComplete={() => void handleComplete(item)}
                    onReschedule={(button) => setRescheduleState({ item, returnFocusTo: button })}
                  />
                ))}
              </AgendaSection>

              <AgendaSection
                accent="gray"
                count={agenda.upcomingCount}
                emptyMessage={SECTION_EMPTY_COPY.upcoming}
                expanded={expandedSections.upcoming}
                icon={<Clock3 className="h-5 w-5" aria-hidden="true" />}
                id="today-upcoming-section"
                onToggle={() => toggleSection('upcoming')}
                sectionRef={(element) => {
                  sectionRefs.current.upcoming = element;
                }}
                title="Coming Up · Next 7 Days"
              >
                <div className="space-y-3 p-4">
                  {agenda.upcomingGroups.map((group) => (
                    <div key={group.key} className="overflow-hidden rounded border border-gray-200">
                      <button
                        type="button"
                        onClick={() => toggleDateGroup(group.key)}
                        aria-controls={`today-date-group-${group.key}`}
                        aria-expanded={Boolean(expandedDateGroups[group.key])}
                        className="flex w-full items-center gap-3 bg-white px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-inset"
                      >
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-gray-700 transition-transform ${expandedDateGroups[group.key] ? '' : '-rotate-90'}`}
                          aria-hidden="true"
                        />
                        <Calendar className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                        <span className="text-sm font-semibold text-gray-950">
                          {group.label} ({group.tasks.length})
                        </span>
                      </button>
                      {expandedDateGroups[group.key] ? (
                        <div id={`today-date-group-${group.key}`} className="divide-y divide-gray-200">
                          {group.tasks.map((item) => (
                            <TaskRow
                              key={item.task.id}
                              item={item}
                              metaLabel={formatDueTime(item.task.dueAt)}
                              metaTone="upcoming"
                              onComplete={() => void handleComplete(item)}
                              onReschedule={(button) => setRescheduleState({ item, returnFocusTo: button })}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </AgendaSection>

              <AgendaSection
                accent="gray"
                count={agenda.completedToday.length}
                emptyMessage={SECTION_EMPTY_COPY.completed}
                expanded={expandedSections.completed}
                icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
                id="today-completed-section"
                onToggle={() => toggleSection('completed')}
                sectionRef={(element) => {
                  sectionRefs.current.completed = element;
                }}
                title="Completed Today"
              >
                {agenda.completedToday.map((item) => (
                  <TaskRow
                    key={item.task.id}
                    completed
                    item={item}
                    metaLabel={item.task.completedAt ? `Completed ${formatDueTime(item.task.completedAt)}` : 'Completed'}
                    metaTone="completed"
                    onComplete={() => undefined}
                    onReschedule={() => undefined}
                  />
                ))}
              </AgendaSection>
            </div>
          </>
        ) : null}
      </div>

      {rescheduleState ? (
        <RescheduleModal
          accessToken={accessToken}
          state={rescheduleState}
          onClose={() => {
            const returnFocusTo = rescheduleState.returnFocusTo;
            setRescheduleState(null);
            window.setTimeout(() => returnFocusTo?.focus(), 0);
          }}
          onSaved={() => {
            const returnFocusTo = rescheduleState.returnFocusTo;
            setRescheduleState(null);
            loadTodayData();
            window.setTimeout(() => returnFocusTo?.focus(), 0);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function LoadingKpis() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="min-h-[112px] rounded border border-gray-200 bg-white p-5">
          <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
          <div className="mt-3 h-8 w-12 animate-pulse rounded bg-gray-200" />
          <div className="mt-3 h-4 w-40 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

function KpiCard({
  count,
  helper,
  icon,
  label,
  onClick,
  tone,
}: {
  count: number;
  helper: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone: 'overdue' | 'today' | 'upcoming';
}) {
  const hasCount = count > 0;
  const classes =
    tone === 'overdue' && hasCount
      ? 'border-red-200 bg-red-50/70 text-red-700'
      : tone === 'today' && hasCount
        ? 'border-blue-200 bg-blue-50/70 text-blue-700'
        : 'border-gray-200 bg-white text-gray-600';
  const iconClasses =
    tone === 'overdue' && hasCount
      ? 'bg-red-100 text-red-700'
      : tone === 'today' && hasCount
        ? 'bg-blue-100 text-blue-700'
        : 'bg-gray-100 text-gray-600';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[112px] rounded border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 ${classes}`}
    >
      <span className="flex items-center gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconClasses}`}>{icon}</span>
        <span>
          <span className="block text-sm font-semibold">{label}</span>
          <span className="mt-1 block text-3xl font-semibold text-gray-950">{count}</span>
          <span className="mt-1 block text-sm text-gray-600">{helper}</span>
        </span>
      </span>
    </button>
  );
}

function AgendaSection({
  accent,
  children,
  count,
  emptyMessage,
  expanded,
  icon,
  id,
  onToggle,
  sectionRef,
  title,
}: {
  accent: 'red' | 'blue' | 'gray';
  children: ReactNode;
  count: number;
  emptyMessage: string;
  expanded: boolean;
  icon: ReactNode;
  id: string;
  onToggle: () => void;
  sectionRef: (element: HTMLElement | null) => void;
  title: string;
}) {
  const accentClass = accent === 'red' ? 'border-l-red-500' : accent === 'blue' ? 'border-l-blue-500' : 'border-l-gray-300';
  const iconClass = accent === 'red' ? 'text-red-700' : accent === 'blue' ? 'text-blue-700' : 'text-gray-600';

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      className={`overflow-hidden rounded border border-l-2 border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 ${accentClass}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-controls={id}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-inset"
      >
        <ChevronDown className={`h-5 w-5 shrink-0 text-gray-800 transition-transform ${expanded ? '' : '-rotate-90'}`} aria-hidden="true" />
        <span className={iconClass}>{icon}</span>
        <span className="min-w-0 text-base font-semibold text-gray-950">
          {title} ({count})
        </span>
      </button>
      {expanded ? (
        <div id={id} className={count > 0 ? 'divide-y divide-gray-200' : 'border-t border-gray-200'}>
          {count > 0 ? children : <p className="p-5 text-sm text-gray-600">{emptyMessage}</p>}
        </div>
      ) : null}
    </section>
  );
}

function TaskRow({
  completed = false,
  item,
  metaLabel,
  metaTone,
  onComplete,
  onReschedule,
}: {
  completed?: boolean;
  item: LeadAgendaTask;
  metaLabel: string;
  metaTone: 'overdue' | 'today' | 'upcoming' | 'completed';
  onComplete: () => void;
  onReschedule: (button: HTMLElement) => void;
}) {
  const metaClass =
    metaTone === 'overdue'
      ? 'border-red-200 bg-red-50 text-red-700'
      : metaTone === 'today'
        ? 'text-blue-700'
        : metaTone === 'completed'
          ? 'text-gray-500'
          : 'text-gray-700';

  return (
    <article className={`px-5 py-4 ${completed ? 'bg-gray-50 text-gray-600' : 'bg-white'}`}>
      <div className="grid gap-3 xl:grid-cols-[minmax(240px,1.2fr)_auto_minmax(220px,0.9fr)_auto] xl:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`h-5 w-5 shrink-0 rounded-full ${metaTone === 'overdue' ? 'bg-red-600' : metaTone === 'today' ? 'bg-blue-600' : 'bg-gray-400'}`} aria-hidden="true" />
          <h3 className={`min-w-0 break-words text-base font-semibold ${completed ? 'text-gray-600' : 'text-gray-950'}`}>{item.task.title}</h3>
          <span className="shrink-0 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700">Lead</span>
        </div>
        <span className={`w-fit rounded border px-3 py-1 text-sm font-medium ${metaClass}`}>{metaLabel}</span>
        <div className="min-w-0 text-sm text-gray-600">
          <span className="break-words font-medium text-gray-700">{item.leadName}</span>
          <span className="px-2 text-gray-400">·</span>
          <span className="break-words">{item.assigneeName}</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end xl:shrink-0">
          {!completed ? (
            <>
              <button
                type="button"
                onClick={(event) => onReschedule(event.currentTarget)}
                className="inline-flex items-center justify-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                aria-label={`Reschedule ${item.task.title}`}
              >
                <Calendar className="h-4 w-4" aria-hidden="true" />
                Reschedule
              </button>
              <button
                type="button"
                onClick={onComplete}
                className="inline-flex items-center justify-center gap-2 rounded border border-green-300 bg-white px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                aria-label={`Complete ${item.task.title}`}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Complete
              </button>
            </>
          ) : null}
          <Link
            to={`/leads/${item.lead.id}`}
            className="rounded bg-gray-950 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            aria-label={`Open lead ${item.leadName}`}
          >
            Open lead
          </Link>
        </div>
      </div>
    </article>
  );
}

function RescheduleModal({
  accessToken,
  onClose,
  onSaved,
  state,
}: {
  accessToken: string | null;
  onClose: () => void;
  onSaved: () => void;
  state: RescheduleState;
}) {
  const [dateValue, setDateValue] = useState(() => toLocalDateInput(state.item.task.dueAt));
  const [timeValue, setTimeValue] = useState(() => toLocalTimeInput(state.item.task.dueAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<RequestError | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getFocusableElements(dialogRef.current);
    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      setError({ status: 401, message: 'You need to sign in before updating tasks.' });
      return;
    }

    const nextDueAt = buildLocalDueAt(dateValue, timeValue);
    if (!nextDueAt) {
      setError({ status: 422, message: 'Choose a due date.' });
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateTask(accessToken, state.item.task.id, { dueAt: nextDueAt });
      onSaved();
    } catch (requestError) {
      setError(toRequestError(requestError, 'Could not reschedule task.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/50 p-4" role="presentation" onKeyDown={handleKeyDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-task-title"
        className="mx-auto my-20 max-w-md rounded border border-gray-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 id="reschedule-task-title" className="text-lg font-semibold text-gray-950">Reschedule task</h2>
            <p className="mt-1 text-sm text-gray-600">{state.item.task.title}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Close
          </button>
        </div>
        <form className="space-y-4 p-5" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Due date
            <input
              type="date"
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-950 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Time
            <input
              type="time"
              value={timeValue}
              onChange={(event) => setTimeValue(event.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-950 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </label>
          {error ? <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error.message}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-gray-950 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
