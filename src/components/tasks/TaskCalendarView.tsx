import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addLocalDays,
  formatWeekRangeLabel,
  getLocalDayKey,
  getLocalDayStart,
  getLocalWeekDays,
} from '../../lib/calendar-date-helpers';
import type { Contact } from '../../lib/contacts';
import type { Deal } from '../../lib/deals';
import type { Lead } from '../../lib/leads';
import type { MembershipOption } from '../../lib/memberships';
import { updateTask, type EntityType, type Task, type TaskStatus } from '../../lib/tasks';

const ENTITY_LABELS: Record<EntityType, string> = {
  LEAD: 'Lead',
  CONTACT: 'Contact',
  DEAL: 'Deal',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  WAITING: 'Waiting',
  DONE: 'Done',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_RESCHEDULE_HOUR = 9;
const DAY_KEY_PREFIX = 'calendar-day:';
const VISIBLE_TASKS_PER_DAY = 3;
const NO_DUE_DATE_PANEL_STORAGE_KEY = 'alozix.tasks.calendar.noDueDatePanel';
type CalendarViewMode = 'month' | 'week' | 'agenda';

function getContactOptionName(contact: Contact) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || contact.phone || 'Unnamed contact';
}

function getLeadOptionName(lead: Lead) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || lead.phone || 'Unnamed lead';
}

function getDealOptionName(deal: Deal) {
  return `${deal.title} (${deal.status})`;
}

function getMembershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
}

function formatCalendarHeader(date: Date, viewMode: CalendarViewMode) {
  if (viewMode === 'week') {
    return formatWeekRangeLabel(date);
  }

  return formatMonthLabel(date);
}

function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

function formatDueTime(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || (date.getHours() === 0 && date.getMinutes() === 0)) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function getMonthGridDays(month: Date) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function getNextMonth(month: Date, offset: number) {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1);
}

function isTaskCompleted(task: Task) {
  return task.status === 'DONE';
}

function getTaskEntityPath(task: Task) {
  if (task.entityType === 'CONTACT') {
    return `/contacts/${task.entityId}`;
  }

  if (task.entityType === 'DEAL') {
    return `/deals/${task.entityId}`;
  }

  return `/leads/${task.entityId}`;
}

function getTaskEntityLabel(
  task: Task,
  contactsById: Map<string, Contact>,
  dealsById: Map<string, Deal>,
  leadsById: Map<string, Lead>,
) {
  const contact = task.entityType === 'CONTACT' ? contactsById.get(task.entityId) : undefined;
  const deal = task.entityType === 'DEAL' ? dealsById.get(task.entityId) : undefined;
  const lead = task.entityType === 'LEAD' ? leadsById.get(task.entityId) : undefined;

  return (
    task.entitySummary?.displayName ??
    (contact ? getContactOptionName(contact) : deal ? getDealOptionName(deal) : lead ? getLeadOptionName(lead) : task.entityId)
  );
}

function getTaskAssigneeLabel(task: Task, membershipsByUserId: Map<string, MembershipOption>) {
  const membership = task.assigneeId ? membershipsByUserId.get(task.assigneeId) : undefined;
  return task.assigneeSummary?.displayName ?? (membership ? getMembershipName(membership) : task.assigneeId ?? 'Unassigned');
}

function getEntityClassName(entityType: EntityType) {
  if (entityType === 'LEAD') {
    return 'rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700';
  }

  if (entityType === 'DEAL') {
    return 'rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700';
  }

  return 'rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700';
}

function getStatusDotClassName(status: TaskStatus) {
  if (status === 'DONE') {
    return 'bg-green-500';
  }

  if (status === 'IN_PROGRESS') {
    return 'bg-blue-500';
  }

  if (status === 'WAITING') {
    return 'bg-amber-500';
  }

  return 'bg-gray-400';
}

function getTaskActionError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '');
    if (message) {
      return message;
    }
  }

  return 'Could not update task.';
}

function compareNullableDates(left: string | null, right: string | null) {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return left.localeCompare(right);
  }

  if (Number.isNaN(leftTime)) {
    return 1;
  }

  if (Number.isNaN(rightTime)) {
    return -1;
  }

  return leftTime - rightTime;
}

function sortCalendarTasks(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    const dueComparison = compareNullableDates(left.dueAt, right.dueAt);
    if (dueComparison !== 0) {
      return dueComparison;
    }

    return compareNullableDates(right.createdAt, left.createdAt);
  });
}

function getInitialNoDueDatePanelCollapsed() {
  if (typeof window === 'undefined') {
    return true;
  }

  const storedPreference = window.localStorage.getItem(NO_DUE_DATE_PANEL_STORAGE_KEY);
  if (storedPreference === 'collapsed') {
    return true;
  }

  if (storedPreference === 'expanded') {
    return false;
  }

  return window.matchMedia('(max-width: 1023px)').matches;
}

function hasStoredNoDueDatePanelPreference() {
  return typeof window !== 'undefined' && window.localStorage.getItem(NO_DUE_DATE_PANEL_STORAGE_KEY) !== null;
}

function buildRescheduledDueAt(task: Task, targetDayKey: string) {
  const [year, month, day] = targetDayKey.split('-').map(Number);
  const previousDueAt = task.dueAt ? new Date(task.dueAt) : null;
  const hasValidPreviousDueAt = previousDueAt !== null && !Number.isNaN(previousDueAt.getTime());
  const nextDueAt = new Date(year, month - 1, day, DEFAULT_RESCHEDULE_HOUR, 0, 0, 0);

  if (hasValidPreviousDueAt) {
    nextDueAt.setHours(previousDueAt.getHours(), previousDueAt.getMinutes(), previousDueAt.getSeconds(), previousDueAt.getMilliseconds());
  }

  return nextDueAt.toISOString();
}

type TaskCalendarViewProps = {
  tasks: Task[];
  currentMonth: Date;
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  accessToken: string | null;
  onMonthChange: (month: Date) => void;
  onChanged: () => void;
  onOpenTask: (task: Task) => void;
  onCreateTaskAt?: (date: Date) => void;
};

export function TaskCalendarView({
  tasks,
  currentMonth,
  contactsById,
  dealsById,
  leadsById,
  membershipsByUserId,
  accessToken,
  onMonthChange,
  onChanged,
  onOpenTask,
  onCreateTaskAt,
}: TaskCalendarViewProps) {
  const [localTasks, setLocalTasks] = useState(tasks);
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>('month');
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const [noDueDatePanelCollapsed, setNoDueDatePanelCollapsed] = useState(getInitialNoDueDatePanelCollapsed);
  const [hasNoDueDatePanelPreference, setHasNoDueDatePanelPreference] = useState(hasStoredNoDueDatePanelPreference);
  const [actionError, setActionError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const gridDays = useMemo(() => getMonthGridDays(currentMonth), [currentMonth]);
  const weekDays = useMemo(() => getLocalWeekDays(currentMonth), [currentMonth]);
  const todayKey = getLocalDayKey(new Date());
  const noDueDateTasks = useMemo(() => sortCalendarTasks(localTasks.filter((task) => !task.dueAt)), [localTasks]);
  useEffect(() => {
    if (hasNoDueDatePanelPreference) {
      return;
    }

    if (noDueDateTasks.length === 0) {
      setNoDueDatePanelCollapsed(true);
      return;
    }

    if (typeof window !== 'undefined' && !window.matchMedia('(max-width: 1023px)').matches) {
      setNoDueDatePanelCollapsed(false);
    }
  }, [hasNoDueDatePanelPreference, noDueDateTasks.length]);
  const tasksByDay = useMemo(() => {
    const groups = new Map<string, Task[]>();

    for (const task of localTasks) {
      if (!task.dueAt) {
        continue;
      }

      const dueDate = new Date(task.dueAt);
      if (Number.isNaN(dueDate.getTime())) {
        continue;
      }

      const dayKey = getLocalDayKey(dueDate);
      groups.set(dayKey, [...(groups.get(dayKey) ?? []), task]);
    }

    for (const [dayKey, dayTasks] of groups) {
      groups.set(dayKey, sortCalendarTasks(dayTasks));
    }

    return groups;
  }, [localTasks]);
  const overdueTasks = useMemo(() => {
    const todayStart = getLocalDayStart(new Date());
    return localTasks.filter((task) => {
      if (!task.dueAt || isTaskCompleted(task)) {
        return false;
      }

      const dueDate = new Date(task.dueAt);
      return !Number.isNaN(dueDate.getTime()) && getLocalDayStart(dueDate).getTime() < todayStart.getTime();
    });
  }, [localTasks]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const taskId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : '';
    const targetDayKey = overId.startsWith(DAY_KEY_PREFIX) ? overId.slice(DAY_KEY_PREFIX.length) : '';
    const task = localTasks.find((current) => current.id === taskId);

    if (!task || !targetDayKey) {
      return;
    }

    if (!accessToken) {
      setActionError('You need to sign in before updating tasks.');
      return;
    }

    const previousDayKey = task.dueAt ? getLocalDayKey(new Date(task.dueAt)) : null;
    if (previousDayKey === targetDayKey) {
      return;
    }

    const previousTasks = localTasks;
    const nextDueAt = buildRescheduledDueAt(task, targetDayKey);
    setActionError(null);
    setSavingTaskId(task.id);
    setLocalTasks((current) => current.map((currentTask) => (currentTask.id === task.id ? { ...currentTask, dueAt: nextDueAt } : currentTask)));

    try {
      await updateTask(accessToken, task.id, { dueAt: nextDueAt });
      onChanged();
    } catch (error) {
      setLocalTasks(previousTasks);
      setActionError(getTaskActionError(error));
    } finally {
      setSavingTaskId(null);
    }
  };

  const handleNoDueDatePanelToggle = () => {
    setNoDueDatePanelCollapsed((current) => {
      const nextCollapsed = !current;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(NO_DUE_DATE_PANEL_STORAGE_KEY, nextCollapsed ? 'collapsed' : 'expanded');
      }
      return nextCollapsed;
    });
    setHasNoDueDatePanelPreference(true);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded border border-gray-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{formatCalendarHeader(currentMonth, calendarViewMode)}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {overdueTasks.length > 0 ? `${overdueTasks.length} overdue ${overdueTasks.length === 1 ? 'task' : 'tasks'} in this view.` : 'No overdue tasks in this view.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded border border-gray-300 bg-white p-0.5">
            {(['month', 'week', 'agenda'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCalendarViewMode(mode)}
                className={
                  calendarViewMode === mode
                    ? 'rounded bg-gray-900 px-3 py-1.5 text-sm font-medium capitalize text-white focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2'
                    : 'rounded px-3 py-1.5 text-sm font-medium capitalize text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2'
                }
              >
                {mode}
              </button>
            ))}
          </div>
          <CalendarNavButton onClick={() => onMonthChange(calendarViewMode === 'week' ? addLocalDays(currentMonth, -7) : getNextMonth(currentMonth, -1))}>Previous</CalendarNavButton>
          <CalendarNavButton onClick={() => onMonthChange(new Date())}>Today</CalendarNavButton>
          <CalendarNavButton onClick={() => onMonthChange(calendarViewMode === 'week' ? addLocalDays(currentMonth, 7) : getNextMonth(currentMonth, 1))}>Next</CalendarNavButton>
        </div>
      </div>

      {actionError ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div> : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className={noDueDatePanelCollapsed ? 'grid gap-4' : 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]'}>
          {calendarViewMode === 'agenda' ? (
            <CalendarAgendaList
              days={gridDays.filter((day) => day.getMonth() === currentMonth.getMonth())}
              tasksByDay={tasksByDay}
              contactsById={contactsById}
              dealsById={dealsById}
              leadsById={leadsById}
              membershipsByUserId={membershipsByUserId}
              savingTaskId={savingTaskId}
              onOpenTask={onOpenTask}
            />
          ) : (
          <div className="hidden overflow-x-auto rounded border border-gray-200 bg-white lg:block">
            <div className="grid min-w-[1050px] grid-cols-7 border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {WEEKDAY_LABELS.map((weekday) => (
                <div key={weekday} className="px-3 py-2">{weekday}</div>
              ))}
            </div>
            <div className="grid min-w-[1050px] grid-cols-7">
              {(calendarViewMode === 'week' ? weekDays : gridDays).map((day) => {
                const dayKey = getLocalDayKey(day);
                const dayTasks = tasksByDay.get(dayKey) ?? [];
                const visibleTasks = expandedDayKey === dayKey ? dayTasks : dayTasks.slice(0, VISIBLE_TASKS_PER_DAY);
                const hiddenCount = dayTasks.length - visibleTasks.length;

                return (
                  <TaskCalendarDayCell
                    key={dayKey}
                    day={day}
                    dayKey={dayKey}
                    todayKey={todayKey}
                    inCurrentMonth={day.getMonth() === currentMonth.getMonth()}
                    tasks={visibleTasks}
                    hiddenCount={hiddenCount}
                    savingTaskId={savingTaskId}
                    contactsById={contactsById}
                    dealsById={dealsById}
                    leadsById={leadsById}
                    membershipsByUserId={membershipsByUserId}
                    onToggleExpanded={() => setExpandedDayKey((current) => (current === dayKey ? null : dayKey))}
                    onOpenTask={onOpenTask}
                    onCreateTaskAt={onCreateTaskAt}
                  />
                );
              })}
            </div>
          </div>
          )}
          <MobileCalendarAgenda
            gridDays={gridDays}
            tasksByDay={tasksByDay}
            currentMonth={currentMonth}
            contactsById={contactsById}
            dealsById={dealsById}
            leadsById={leadsById}
            membershipsByUserId={membershipsByUserId}
            savingTaskId={savingTaskId}
            onOpenTask={onOpenTask}
          />

          <NoDueDatePanel
            tasks={noDueDateTasks}
            contactsById={contactsById}
            dealsById={dealsById}
            leadsById={leadsById}
            membershipsByUserId={membershipsByUserId}
            savingTaskId={savingTaskId}
            onOpenTask={onOpenTask}
            collapsed={noDueDatePanelCollapsed}
            onToggleCollapsed={handleNoDueDatePanelToggle}
          />
        </div>
      </DndContext>
    </section>
  );
}

function CalendarNavButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
    >
      {children}
    </button>
  );
}

type CalendarTaskProps = {
  task: Task;
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  saving: boolean;
  onOpenTask: (task: Task) => void;
};

function TaskCalendarDayCell({
  day,
  dayKey,
  todayKey,
  inCurrentMonth,
  tasks,
  hiddenCount,
  savingTaskId,
  contactsById,
  dealsById,
  leadsById,
  membershipsByUserId,
  onToggleExpanded,
  onOpenTask,
  onCreateTaskAt,
}: {
  day: Date;
  dayKey: string;
  todayKey: string;
  inCurrentMonth: boolean;
  tasks: Task[];
  hiddenCount: number;
  savingTaskId: string | null;
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  onToggleExpanded: () => void;
  onOpenTask: (task: Task) => void;
  onCreateTaskAt?: (date: Date) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${DAY_KEY_PREFIX}${dayKey}` });

  return (
    <section
      ref={setNodeRef}
      className={[
        'min-h-40 border-b border-r border-gray-200 p-2',
        inCurrentMonth ? 'bg-white' : 'bg-gray-50 text-gray-400',
        isOver ? 'ring-2 ring-inset ring-gray-900' : '',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            dayKey === todayKey
              ? 'flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white'
              : 'text-xs font-semibold text-gray-700'
          }
        >
          {day.getDate()}
        </span>
        {tasks.length > 0 ? (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">{tasks.length}</span>
        ) : null}
      </div>
      <div className="mt-2 space-y-2">
        {tasks.map((task) => (
          <CalendarTaskCard
            key={task.id}
            task={task}
            contactsById={contactsById}
            dealsById={dealsById}
            leadsById={leadsById}
            membershipsByUserId={membershipsByUserId}
            saving={savingTaskId === task.id}
            onOpenTask={onOpenTask}
          />
        ))}
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={onToggleExpanded}
            className="text-xs font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
          >
            +{hiddenCount} more
          </button>
        ) : null}
        {tasks.length === 0 && onCreateTaskAt ? (
          <button
            type="button"
            onClick={() => onCreateTaskAt(day)}
            className="rounded border border-dashed border-gray-300 px-2 py-1 text-left text-xs font-medium text-gray-500 hover:border-gray-500 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Add task
          </button>
        ) : null}
      </div>
    </section>
  );
}

function CalendarAgendaList({
  days,
  tasksByDay,
  contactsById,
  dealsById,
  leadsById,
  membershipsByUserId,
  savingTaskId,
  onOpenTask,
}: {
  days: Date[];
  tasksByDay: Map<string, Task[]>;
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  savingTaskId: string | null;
  onOpenTask: (task: Task) => void;
}) {
  const daysWithTasks = days.filter((day) => (tasksByDay.get(getLocalDayKey(day)) ?? []).length > 0);

  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <div className="space-y-3">
        {daysWithTasks.length > 0 ? (
          daysWithTasks.map((day) => {
            const dayKey = getLocalDayKey(day);
            const dayTasks = tasksByDay.get(dayKey) ?? [];

            return (
              <section key={dayKey} className="border-b border-gray-100 pb-3 last:border-b-0 last:pb-0">
                <h3 className="text-sm font-semibold text-gray-900">{formatDayLabel(day)}</h3>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {dayTasks.map((task) => (
                    <MobileCalendarTask
                      key={task.id}
                      task={task}
                      contactsById={contactsById}
                      dealsById={dealsById}
                      leadsById={leadsById}
                      membershipsByUserId={membershipsByUserId}
                      saving={savingTaskId === task.id}
                      onOpenTask={onOpenTask}
                    />
                  ))}
                </div>
              </section>
            );
          })
        ) : (
          <p className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No dated tasks in this agenda.</p>
        )}
      </div>
    </div>
  );
}

function CalendarTaskCard({ task, contactsById, dealsById, leadsById, membershipsByUserId, saving, onOpenTask }: CalendarTaskProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const entityLabel = getTaskEntityLabel(task, contactsById, dealsById, leadsById);
  const assigneeLabel = getTaskAssigneeLabel(task, membershipsByUserId);
  const dueTime = formatDueTime(task.dueAt);
  const style = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={[
        'rounded border border-gray-200 bg-white p-2 text-gray-900 shadow-sm',
        isTaskCompleted(task) ? 'bg-gray-50 text-gray-600' : '',
        isDragging ? 'z-10 opacity-80 shadow-md' : '',
        saving ? 'opacity-60' : '',
      ].join(' ')}
    >
      <button
        type="button"
        className="flex w-full cursor-grab items-start gap-2 text-left focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <span className={['mt-1 h-2 w-2 shrink-0 rounded-full', getStatusDotClassName(task.status)].join(' ')} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold">{task.title}</span>
          {dueTime ? <span className="mt-0.5 block text-[11px] text-gray-600">{dueTime}</span> : null}
        </span>
      </button>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className={getEntityClassName(task.entityType)}>{ENTITY_LABELS[task.entityType]}</span>
        <button
          type="button"
          onClick={() => onOpenTask(task)}
          className="truncate text-[11px] font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
        >
          {entityLabel}
        </button>
      </div>
      <p className="mt-1 truncate text-[11px] text-gray-500">
        {STATUS_LABELS[task.status]} - {assigneeLabel}
      </p>
    </article>
  );
}

function MobileCalendarAgenda({
  gridDays,
  tasksByDay,
  currentMonth,
  contactsById,
  dealsById,
  leadsById,
  membershipsByUserId,
  savingTaskId,
  onOpenTask,
}: {
  gridDays: Date[];
  tasksByDay: Map<string, Task[]>;
  currentMonth: Date;
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  savingTaskId: string | null;
  onOpenTask: (task: Task) => void;
}) {
  const daysWithTasks = gridDays.filter(
    (day) => day.getMonth() === currentMonth.getMonth() && (tasksByDay.get(getLocalDayKey(day)) ?? []).length > 0,
  );

  return (
    <div className="space-y-3 lg:hidden">
      {daysWithTasks.length > 0 ? (
        daysWithTasks.map((day) => {
          const dayKey = getLocalDayKey(day);
          const dayTasks = tasksByDay.get(dayKey) ?? [];

          return (
            <section key={dayKey} className="rounded border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900">{formatDayLabel(day)}</h3>
              <div className="mt-3 space-y-2">
                {dayTasks.map((task) => (
                  <MobileCalendarTask
                    key={task.id}
                    task={task}
                    contactsById={contactsById}
                    dealsById={dealsById}
                    leadsById={leadsById}
                    membershipsByUserId={membershipsByUserId}
                    saving={savingTaskId === task.id}
                    onOpenTask={onOpenTask}
                  />
                ))}
              </div>
            </section>
          );
        })
      ) : (
        <p className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
          No dated tasks in this month for the current filters.
        </p>
      )}
    </div>
  );
}

function MobileCalendarTask({ task, contactsById, dealsById, leadsById, membershipsByUserId, saving, onOpenTask }: CalendarTaskProps) {
  const entityLabel = getTaskEntityLabel(task, contactsById, dealsById, leadsById);
  const entityPath = getTaskEntityPath(task);
  const assigneeLabel = getTaskAssigneeLabel(task, membershipsByUserId);
  const dueTime = formatDueTime(task.dueAt);

  return (
    <article className={['rounded border border-gray-200 bg-white p-3', saving ? 'opacity-60' : ''].join(' ')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={getEntityClassName(task.entityType)}>{ENTITY_LABELS[task.entityType]}</span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">{STATUS_LABELS[task.status]}</span>
        {dueTime ? <span className="text-xs text-gray-600">{dueTime}</span> : null}
      </div>
      <h4 className="mt-2 text-sm font-semibold text-gray-900">{task.title}</h4>
      <Link
        className="mt-1 block break-words text-sm font-medium text-gray-800 underline decoration-gray-300 underline-offset-2 hover:text-gray-700"
        to={entityPath}
      >
        {entityLabel}
      </Link>
      <p className="mt-1 text-sm text-gray-600">Assigned to {assigneeLabel}</p>
      <button
        type="button"
        onClick={() => onOpenTask(task)}
        className="mt-3 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
      >
        Details
      </button>
    </article>
  );
}

function NoDueDatePanel({
  tasks,
  contactsById,
  dealsById,
  leadsById,
  membershipsByUserId,
  savingTaskId,
  onOpenTask,
  collapsed,
  onToggleCollapsed,
}: {
  tasks: Task[];
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  savingTaskId: string | null;
  onOpenTask: (task: Task) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const panelContentId = 'task-calendar-no-due-date-panel';

  return (
    <aside className="rounded border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls={panelContentId}
        className="flex w-full items-center justify-between gap-3 rounded px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900">No due date</span>
          <span className="mt-0.5 block text-xs text-gray-600">{tasks.length === 1 ? '1 unscheduled task' : `${tasks.length} unscheduled tasks`}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">{tasks.length}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={['h-4 w-4 text-gray-500 transition-transform', collapsed ? '' : 'rotate-180'].join(' ')}
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </button>
      {!collapsed ? (
        <div id={panelContentId} className="border-t border-gray-200 p-4">
          <p className="text-sm text-gray-600">Drag these onto a day on desktop or open the task to set a date.</p>
          <div className="mt-3 space-y-2">
            {tasks.length > 0 ? (
              tasks.map((task) => (
                <CalendarTaskCard
                  key={task.id}
                  task={task}
                  contactsById={contactsById}
                  dealsById={dealsById}
                  leadsById={leadsById}
                  membershipsByUserId={membershipsByUserId}
                  saving={savingTaskId === task.id}
                  onOpenTask={onOpenTask}
                />
              ))
            ) : (
              <p className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">No unscheduled tasks in this view.</p>
            )}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
