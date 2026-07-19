import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { TaskCalendarView } from '../components/tasks/TaskCalendarView';
import { TaskDetailModal } from '../components/tasks/TaskDetailModal';
import { TaskKanbanView } from '../components/tasks/TaskKanbanView';
import { useAuth } from '../context/AuthContext';
import type { Contact } from '../lib/contacts';
import type { Deal } from '../lib/deals';
import type { HttpError } from '../lib/http';
import { listLeads, type Lead } from '../lib/leads';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';
import {
  completeTask,
  createTask,
  listTasks,
  reopenTask,
  updateTask,
  type CreateTaskInput,
  type EntityType,
  type Task,
  type TaskDueBucket,
  type TaskFilters,
  type TaskStatus,
  type TasksResponse,
} from '../lib/tasks';

type RequestError = {
  status: number;
  message: string;
};

type CompletedFilter = 'all' | 'open' | 'completed';
type AssigneeFilter = 'me' | 'all';
type EntityTypeFilter = 'all' | EntityType;
type StatusFilter = 'all' | TaskStatus;
type DueBucketFilter = 'all' | TaskDueBucket;
type LocalDueBucket = TaskDueBucket | 'completed';
type TaskViewMode = 'daily' | 'table' | 'kanban' | 'calendar';
type TaskSortKey = 'dueAt' | 'title' | 'lead' | 'assignee' | 'status';
type TaskSortDirection = 'asc' | 'desc';

type TaskFormState = {
  title: string;
  description: string;
  dueAt: string;
  assigneeId: string;
  entityType: EntityType;
  entityId: string;
};

const TASKS_PAGE_LIMIT = 100;
const CALENDAR_TASKS_LIMIT = 500;
const TASK_OPTIONS_LIMIT = 100;
const DEFAULT_COMPLETED_FILTER: CompletedFilter = 'open';
const DEFAULT_ASSIGNEE_FILTER: AssigneeFilter = 'me';
const DEFAULT_ENTITY_TYPE_FILTER: EntityTypeFilter = 'LEAD';
const DEFAULT_STATUS_FILTER: StatusFilter = 'all';
const DEFAULT_DUE_BUCKET_FILTER: DueBucketFilter = 'all';
const TASK_VIEW_STORAGE_KEY = 'alozix.tasks.view';
const ACTIVE_TASK_LEAD_STATUSES = new Set(['NEW', 'CONTACTED', 'FOLLOW_UP_NEEDED', 'QUALIFIED']);
const INITIAL_TASK_FORM: TaskFormState = {
  title: '',
  description: '',
  dueAt: '',
  assigneeId: '',
  entityType: 'LEAD',
  entityId: '',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  WAITING: 'Waiting',
  DONE: 'Done',
};

const ENTITY_LABELS: Record<EntityType, string> = {
  LEAD: 'Lead',
  CONTACT: 'Contact',
  DEAL: 'Deal',
};

const SECTION_LABELS: Record<LocalDueBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  upcoming: 'Upcoming',
  no_due_date: 'No due date',
  completed: 'Completed',
};

const OPEN_SECTION_ORDER: LocalDueBucket[] = ['overdue', 'today', 'upcoming', 'no_due_date'];

const QUICK_FILTER_CLASS =
  'rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2';

const SORT_LABELS: Record<TaskSortKey, string> = {
  dueAt: 'Due date',
  title: 'Task title',
  lead: 'Lead',
  assignee: 'Assignee',
  status: 'Status',
};

function formatTaskCount(count: number) {
  return count === 1 ? '1 task' : `${count} tasks`;
}

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

function getMembershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function joinOptionParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' - ');
}

function getContactOptionName(contact: Pick<Contact, 'firstName' | 'lastName' | 'email' | 'phone'>) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || contact.phone || 'Unnamed contact';
}

function getContactOptionLabel(contact: Contact) {
  return joinOptionParts([getContactOptionName(contact), contact.email, contact.phone]) || 'Unnamed contact';
}

function getLeadOptionName(lead: Lead) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || lead.phone || 'Unnamed lead';
}

function getLeadOptionLabel(lead: Lead) {
  return joinOptionParts([getLeadOptionName(lead), lead.email, lead.phone, lead.status]) || 'Unnamed lead';
}

function getDealOptionName(deal: Deal) {
  return `${deal.title} (${deal.status})`;
}

function getDealOptionLabel(deal: Deal) {
  return joinOptionParts([getDealOptionName(deal), deal.contact ? getContactOptionName(deal.contact) : undefined]);
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function toLocalDateTimeInput(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function getLocalDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isTaskCompleted(task: Task) {
  return task.status === 'DONE';
}

type DueStatus = {
  label: string;
  tone: 'overdue' | 'today' | 'future' | 'none' | 'completed';
};

function getDueStatus(task: Task): DueStatus {
  if (isTaskCompleted(task)) {
    return {
      label: task.completedAt ? `Completed ${formatShortDate(task.completedAt)}` : 'Completed',
      tone: 'completed',
    };
  }

  if (!task.dueAt) {
    return {
      label: 'No due date',
      tone: 'none',
    };
  }

  const dueDate = new Date(task.dueAt);
  if (Number.isNaN(dueDate.getTime())) {
    return {
      label: `Due ${task.dueAt}`,
      tone: 'future',
    };
  }

  const today = getLocalDayStart(new Date());
  const dueDay = getLocalDayStart(dueDate);
  const dayDifference = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

  if (dayDifference < 0) {
    const overdueDays = Math.abs(dayDifference);

    return {
      label: `Overdue by ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'}`,
      tone: 'overdue',
    };
  }

  if (dayDifference === 0) {
    return {
      label: 'Due today',
      tone: 'today',
    };
  }

  if (dayDifference === 1) {
    return {
      label: 'Due tomorrow',
      tone: 'future',
    };
  }

  return {
    label: `Due ${formatShortDate(task.dueAt)}`,
    tone: 'future',
  };
}

function getLocalDueBucket(task: Task): LocalDueBucket {
  if (isTaskCompleted(task)) {
    return 'completed';
  }

  if (!task.dueAt) {
    return 'no_due_date';
  }

  const dueDate = new Date(task.dueAt);
  if (Number.isNaN(dueDate.getTime())) {
    return 'upcoming';
  }

  const today = getLocalDayStart(new Date());
  const dueDay = getLocalDayStart(dueDate);

  if (dueDay.getTime() < today.getTime()) {
    return 'overdue';
  }

  if (dueDay.getTime() === today.getTime()) {
    return 'today';
  }

  return 'upcoming';
}

function buildCreateTaskInput(form: TaskFormState): CreateTaskInput {
  const input: CreateTaskInput = {
    entityType: 'LEAD',
    entityId: form.entityId,
    title: form.title.trim(),
  };

  const description = form.description.trim();

  if (description) {
    input.description = description;
  }

  if (form.dueAt) {
    input.dueAt = new Date(form.dueAt).toISOString();
  }

  if (form.assigneeId) {
    input.assigneeId = form.assigneeId;
  }

  return input;
}

function buildInitialTaskForm(assigneeId?: string): TaskFormState {
  return {
    ...INITIAL_TASK_FORM,
    assigneeId: assigneeId ?? '',
  };
}

function getEntityPluralLabel(entityType: EntityType) {
  return entityType === 'LEAD' ? 'leads' : entityType === 'CONTACT' ? 'contacts' : 'deals';
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function getRecordSearchText(entityType: EntityType, record: Lead | Contact | Deal) {
  if (entityType === 'LEAD') {
    const lead = record as Lead;
    return joinOptionParts([getLeadOptionLabel(lead), lead.source, lead.sourceDetail, lead.owner?.email]);
  }

  if (entityType === 'CONTACT') {
    const contact = record as Contact;
    return joinOptionParts([getContactOptionLabel(contact), contact.status, contact.owner?.email, contact.leadSource?.name]);
  }

  const deal = record as Deal;
  return joinOptionParts([getDealOptionLabel(deal), deal.pipeline?.name, deal.stage?.name, deal.owner?.email]);
}

function getRecordOptionLabel(entityType: EntityType, record: Lead | Contact | Deal) {
  if (entityType === 'LEAD') {
    return getLeadOptionLabel(record as Lead);
  }

  if (entityType === 'CONTACT') {
    return getContactOptionLabel(record as Contact);
  }

  return getDealOptionLabel(record as Deal);
}

function getRecordPickerMessage(
  entityType: EntityType,
  optionsLoading: boolean,
  optionCount: number,
  matchingCount: number,
  searchQuery: string,
) {
  const pluralLabel = getEntityPluralLabel(entityType);

  if (optionsLoading) {
    return `Loading ${pluralLabel}...`;
  }

  if (optionCount === 0) {
    return `No ${pluralLabel} loaded. Try changing the record type.`;
  }

  if (searchQuery.trim() && matchingCount === 0) {
    return `No matching ${pluralLabel}. Try changing the record type or search.`;
  }

  if (searchQuery.trim()) {
    return `Showing ${matchingCount} of ${optionCount} loaded ${pluralLabel}.`;
  }

  return `Showing up to the first ${TASK_OPTIONS_LIMIT} loaded ${pluralLabel}. Use search to filter this list.`;
}

function getCompletionFilterValue(filter: CompletedFilter) {
  if (filter === 'open') {
    return false;
  }

  if (filter === 'completed') {
    return true;
  }

  return undefined;
}

function getCalendarMonthRange(month: Date) {
  const from = new Date(month.getFullYear(), month.getMonth(), 1);
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function mergeUniqueTasks(primary: Task[], secondary: Task[]) {
  return Array.from(new Map([...primary, ...secondary].map((task) => [task.id, task])).values());
}

function getFilterSummary(
  completedFilter: CompletedFilter,
  assigneeFilter: AssigneeFilter,
  _entityTypeFilter: EntityTypeFilter,
  statusFilter: StatusFilter,
  dueBucketFilter: DueBucketFilter,
) {
  const assigneeLabel = assigneeFilter === 'me' ? 'My' : 'All visible';
  const completionLabel =
    completedFilter === 'open' ? 'open tasks' : completedFilter === 'completed' ? 'completed tasks' : 'tasks';
  const entityLabel = 'lead ';
  const statusLabel = statusFilter === 'all' ? '' : ` with status ${STATUS_LABELS[statusFilter].toLowerCase()}`;
  const dueLabel =
    dueBucketFilter === 'all'
      ? ''
      : dueBucketFilter === 'no_due_date'
        ? ' with no due date'
        : ` due ${SECTION_LABELS[dueBucketFilter].toLowerCase()}`;

  return `Showing ${assigneeLabel.toLowerCase()} ${entityLabel}${completionLabel}${statusLabel}${dueLabel}`;
}

function getTaskActionError(error: unknown) {
  const requestError = toRequestError(error, 'Could not update task.');

  if (requestError.status === 403) {
    return 'You do not have permission to update tasks.';
  }

  return requestError.message;
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

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' });
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
    return compareText(left, right);
  }

  if (Number.isNaN(leftTime)) {
    return 1;
  }

  if (Number.isNaN(rightTime)) {
    return -1;
  }

  return leftTime - rightTime;
}

function sortTasks(
  tasks: Task[],
  sortKey: TaskSortKey,
  sortDirection: TaskSortDirection,
  membershipsByUserId: Map<string, MembershipOption>,
  leadsById: Map<string, Lead>,
) {
  const direction = sortDirection === 'asc' ? 1 : -1;

  return [...tasks].sort((left, right) => {
    let result = 0;

    if (sortKey === 'dueAt') {
      result = compareNullableDates(left.dueAt, right.dueAt);
    } else if (sortKey === 'title') {
      result = compareText(left.title, right.title);
    } else if (sortKey === 'lead') {
      result = compareText(getTaskEntityLabel(left, new Map(), new Map(), leadsById), getTaskEntityLabel(right, new Map(), new Map(), leadsById));
    } else if (sortKey === 'assignee') {
      result = compareText(getTaskAssigneeLabel(left, membershipsByUserId), getTaskAssigneeLabel(right, membershipsByUserId));
    } else if (sortKey === 'status') {
      result = compareText(STATUS_LABELS[left.status], STATUS_LABELS[right.status]);
    }

    if (result === 0) {
      result = compareNullableDates(left.dueAt, right.dueAt) || compareNullableDates(right.createdAt, left.createdAt);
    }

    return result * direction;
  });
}

function getEntityClassName(entityType: EntityType) {
  if (entityType === 'LEAD') {
    return 'rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700';
  }

  if (entityType === 'DEAL') {
    return 'rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700';
  }

  return 'rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700';
}

function getDueClassName(dueStatus: DueStatus) {
  if (dueStatus.tone === 'overdue') {
    return 'rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700';
  }

  if (dueStatus.tone === 'today') {
    return 'rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800';
  }

  if (dueStatus.tone === 'completed') {
    return 'rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700';
  }

  return 'rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600';
}

function getStatusClassName(status: TaskStatus) {
  if (status === 'DONE') {
    return 'rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700';
  }

  if (status === 'IN_PROGRESS') {
    return 'rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700';
  }

  if (status === 'WAITING') {
    return 'rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800';
  }

  return 'rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700';
}

function groupTasks(tasks: Task[], completionFilter: CompletedFilter, dueBucketFilter: DueBucketFilter) {
  const groups = new Map<LocalDueBucket, Task[]>();
  const sectionOrder =
    completionFilter === 'completed'
      ? (['completed'] as LocalDueBucket[])
      : dueBucketFilter === 'all'
        ? [...OPEN_SECTION_ORDER]
        : ([dueBucketFilter] as LocalDueBucket[]);

  if (completionFilter === 'all' && dueBucketFilter === 'all') {
    sectionOrder.push('completed');
  }

  for (const task of tasks) {
    const bucket = getLocalDueBucket(task);
    if (!sectionOrder.includes(bucket)) {
      continue;
    }

    groups.set(bucket, [...(groups.get(bucket) ?? []), task]);
  }

  return sectionOrder.map((bucket) => ({
    bucket,
    label: SECTION_LABELS[bucket],
    tasks: groups.get(bucket) ?? [],
  }));
}

function getSectionHelper(bucket: LocalDueBucket, taskCount: number) {
  if (bucket === 'overdue') {
    return taskCount > 0 ? 'These need attention first.' : "No overdue tasks - you're caught up.";
  }

  if (bucket === 'today') {
    return taskCount > 0 ? 'Good place to focus after overdue work.' : "No tasks due today - you're caught up.";
  }

  if (bucket === 'upcoming') {
    return taskCount > 0 ? 'Coming next, so nothing gets missed.' : 'No upcoming tasks in this view.';
  }

  if (bucket === 'no_due_date') {
    return taskCount > 0 ? 'Useful follow-ups that are not scheduled yet.' : 'No unscheduled tasks in this view.';
  }

  return taskCount > 0 ? 'Recently finished work in this view.' : 'No completed tasks in this view.';
}

function hasActiveFilters(
  completedFilter: CompletedFilter,
  assigneeFilter: AssigneeFilter,
  entityTypeFilter: EntityTypeFilter,
  statusFilter: StatusFilter,
  dueBucketFilter: DueBucketFilter,
) {
  return (
    completedFilter !== DEFAULT_COMPLETED_FILTER ||
    assigneeFilter !== DEFAULT_ASSIGNEE_FILTER ||
    entityTypeFilter !== DEFAULT_ENTITY_TYPE_FILTER ||
    statusFilter !== DEFAULT_STATUS_FILTER ||
    dueBucketFilter !== DEFAULT_DUE_BUCKET_FILTER
  );
}

export function TasksPage() {
  const { accessToken, user } = useAuth();
  const [tasksData, setTasksData] = useState<TasksResponse | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<RequestError | null>(null);
  const [completedFilter, setCompletedFilter] = useState<CompletedFilter>(DEFAULT_COMPLETED_FILTER);
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>(DEFAULT_ASSIGNEE_FILTER);
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityTypeFilter>(DEFAULT_ENTITY_TYPE_FILTER);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(DEFAULT_STATUS_FILTER);
  const [dueBucketFilter, setDueBucketFilter] = useState<DueBucketFilter>(DEFAULT_DUE_BUCKET_FILTER);
  const [taskSearch, setTaskSearch] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    upcoming: false,
    no_due_date: false,
  });
  const [viewMode, setViewMode] = useState<TaskViewMode>(() => {
    if (typeof window === 'undefined') {
      return 'daily';
    }

    const storedViewMode = window.localStorage.getItem(TASK_VIEW_STORAGE_KEY);
    return storedViewMode === 'table' || storedViewMode === 'kanban' || storedViewMode === 'calendar' || storedViewMode === 'daily'
      ? storedViewMode
      : 'daily';
  });
  const [sortKey, setSortKey] = useState<TaskSortKey>('dueAt');
  const [sortDirection, setSortDirection] = useState<TaskSortDirection>('asc');
  const [page, setPage] = useState(1);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<TaskFormState>(INITIAL_TASK_FORM);
  const [recordSearch, setRecordSearch] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<RequestError | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionWarnings, setOptionWarnings] = useState<string[]>([]);
  const calendarRange = useMemo(() => getCalendarMonthRange(calendarMonth), [calendarMonth]);
  const baseTaskFilters = useMemo<Omit<TaskFilters, 'page' | 'limit' | 'from' | 'to' | 'dueBucket'>>(
    () => ({
      completed: getCompletionFilterValue(completedFilter),
      assigneeId: assigneeFilter === 'me' ? user?.id : undefined,
      entityType: 'LEAD',
      status: statusFilter === 'all' ? undefined : statusFilter,
    }),
    [assigneeFilter, completedFilter, statusFilter, user?.id],
  );

  const taskFilters = useMemo<TaskFilters>(
    () => {
      if (viewMode === 'calendar') {
        return {
          ...baseTaskFilters,
          dueBucket: dueBucketFilter === 'all' ? undefined : dueBucketFilter,
          page: 1,
          limit: CALENDAR_TASKS_LIMIT,
          ...(dueBucketFilter === 'no_due_date' ? {} : calendarRange),
        };
      }

      return {
        ...baseTaskFilters,
        dueBucket: dueBucketFilter === 'all' ? undefined : dueBucketFilter,
        page,
        limit: TASKS_PAGE_LIMIT,
      };
    },
    [baseTaskFilters, calendarRange, dueBucketFilter, page, viewMode],
  );
  const calendarNoDueFilters = useMemo<TaskFilters | null>(() => {
    if (viewMode !== 'calendar' || dueBucketFilter !== 'all') {
      return null;
    }

    return { ...baseTaskFilters, dueBucket: 'no_due_date', page: 1, limit: CALENDAR_TASKS_LIMIT };
  }, [baseTaskFilters, dueBucketFilter, viewMode]);

  const contactsById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const dealsById = useMemo(() => new Map(deals.map((deal) => [deal.id, deal])), [deals]);
  const leadsById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  const membershipsByUserId = useMemo(() => new Map(memberships.map((membership) => [membership.userId, membership])), [memberships]);
  const tasks = tasksData?.data ?? [];
  const normalizedTaskSearch = normalizeSearch(taskSearch);
  const visibleTasks = useMemo(() => {
    const activeLeadTasks = tasks.filter((task) => {
      const lead = leadsById.get(task.entityId);
      return !lead || ACTIVE_TASK_LEAD_STATUSES.has(lead.status);
    });

    if (!normalizedTaskSearch) {
      return activeLeadTasks;
    }

    return activeLeadTasks.filter((task) => {
      const lead = leadsById.get(task.entityId);
      const searchText = joinOptionParts([
        task.title,
        task.description,
        getTaskEntityLabel(task, contactsById, dealsById, leadsById),
        lead?.email,
        lead?.phone,
        lead?.source,
        lead?.sourceDetail,
      ]).toLowerCase();

      return searchText.includes(normalizedTaskSearch);
    });
  }, [contactsById, dealsById, leadsById, normalizedTaskSearch, tasks]);
  const totalTasks = tasksData?.total ?? tasks.length;
  const currentPage = tasksData?.page ?? page;
  const currentLimit = tasksData?.limit ?? TASKS_PAGE_LIMIT;
  const totalPages = Math.max(1, Math.ceil(totalTasks / currentLimit));
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage * currentLimit < totalTasks;
  const groupedTasks = useMemo(
    () => groupTasks(visibleTasks, completedFilter, dueBucketFilter),
    [completedFilter, dueBucketFilter, visibleTasks],
  );
  const sortedTasks = useMemo(
    () => sortTasks(visibleTasks, sortKey, sortDirection, membershipsByUserId, leadsById),
    [leadsById, membershipsByUserId, sortDirection, sortKey, visibleTasks],
  );
  const visibleBucketCounts = useMemo(() => {
    const counts: Record<LocalDueBucket, number> = {
      overdue: 0,
      today: 0,
      upcoming: 0,
      no_due_date: 0,
      completed: 0,
    };

    for (const task of visibleTasks) {
      counts[getLocalDueBucket(task)] += 1;
    }

    return counts;
  }, [visibleTasks]);
  const myDaySummary = useMemo(
    () => ({
      overdue: visibleBucketCounts.overdue,
      today: visibleBucketCounts.today,
      inProgress: visibleTasks.filter((task) => task.status === 'IN_PROGRESS').length,
      waiting: visibleTasks.filter((task) => task.status === 'WAITING').length,
    }),
    [visibleBucketCounts.overdue, visibleBucketCounts.today, visibleTasks],
  );
  const filterSummary = getFilterSummary(completedFilter, assigneeFilter, entityTypeFilter, statusFilter, dueBucketFilter);
  const currentUserMembership = useMemo(
    () => (user?.id ? memberships.find((membership) => membership.userId === user.id) : undefined),
    [memberships, user?.id],
  );

  useEffect(() => {
    if (!accessToken) {
      setContacts([]);
      setDeals([]);
      setLeads([]);
      setMemberships([]);
      setOptionsLoading(false);
      setOptionWarnings([]);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchOptions() {
      setOptionsLoading(true);
      setOptionWarnings([]);

      const [leadsResult, membershipsResult] = await Promise.allSettled([
        listLeads(token, { page: 1, limit: TASK_OPTIONS_LIMIT }),
        listMembershipOptions(token),
      ]);

      if (!active) {
        return;
      }

      const warnings: string[] = [];

      setContacts([]);
      setDeals([]);

      if (leadsResult.status === 'fulfilled') {
        setLeads(leadsResult.value.data);
      } else {
        setLeads([]);
        warnings.push('Lead options could not be loaded.');
      }

      if (membershipsResult.status === 'fulfilled') {
        setMemberships(membershipsResult.value);
      } else {
        setMemberships([]);
        warnings.push('Assignee options could not be loaded.');
      }

      setOptionWarnings(warnings);
      setOptionsLoading(false);
    }

    void fetchOptions();

    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!currentUserMembership) {
      return;
    }

    setForm((current) => (current.assigneeId ? current : { ...current, assigneeId: currentUserMembership.userId }));
  }, [currentUserMembership]);

  useEffect(() => {
    if (!accessToken || (assigneeFilter === 'me' && !user?.id)) {
      setTasksData(null);
      setTasksLoading(false);
      setTasksError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchTasks() {
      setTasksLoading(true);
      setTasksError(null);

      try {
        const [response, noDueDateResponse] = await Promise.all([
          listTasks(token, taskFilters),
          calendarNoDueFilters ? listTasks(token, calendarNoDueFilters) : Promise.resolve(null),
        ]);
        if (!active) {
          return;
        }

        setTasksData(
          noDueDateResponse
            ? {
                ...response,
                data: mergeUniqueTasks(response.data, noDueDateResponse.data),
                total: response.total + noDueDateResponse.total,
              }
            : response,
        );
      } catch (requestError) {
        if (!active) {
          return;
        }

        setTasksData(null);
        setTasksError(toRequestError(requestError, 'Could not load tasks.'));
      } finally {
        if (active) {
          setTasksLoading(false);
        }
      }
    }

    void fetchTasks();

    return () => {
      active = false;
    };
  }, [accessToken, assigneeFilter, calendarNoDueFilters, refreshKey, taskFilters, user?.id]);

  const refreshTasks = () => {
    setRefreshKey((current) => current + 1);
  };

  const handleViewModeChange = (nextViewMode: TaskViewMode) => {
    setViewMode(nextViewMode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TASK_VIEW_STORAGE_KEY, nextViewMode);
    }

    if (nextViewMode === 'kanban') {
      setCompletedFilter('open');
      setPage(1);
    }

    if (nextViewMode === 'calendar') {
      setPage(1);
    }
  };

  const resetCreateForm = () => {
    setForm(buildInitialTaskForm(currentUserMembership?.userId));
    setRecordSearch('');
    setCreateError(null);
  };

  const openCreateFormAt = (date: Date) => {
    const dueDate = new Date(date);
    dueDate.setHours(9, 0, 0, 0);
    setForm((current) => ({
      ...buildInitialTaskForm(currentUserMembership?.userId),
      entityId: current.entityId,
      dueAt: toLocalDateTimeInput(dueDate.toISOString()),
    }));
    setShowCreateForm(true);
    setCreateError(null);
    setCreateSuccess(null);
  };

  const handleResetFilters = () => {
    setCompletedFilter(DEFAULT_COMPLETED_FILTER);
    setAssigneeFilter(DEFAULT_ASSIGNEE_FILTER);
    setEntityTypeFilter(DEFAULT_ENTITY_TYPE_FILTER);
    setStatusFilter(DEFAULT_STATUS_FILTER);
    setDueBucketFilter(DEFAULT_DUE_BUCKET_FILTER);
    setTaskSearch('');
    setPage(1);
  };

  const applyQuickFilter = (
    nextFilters: Partial<{
      completedFilter: CompletedFilter;
      assigneeFilter: AssigneeFilter;
      entityTypeFilter: EntityTypeFilter;
      statusFilter: StatusFilter;
      dueBucketFilter: DueBucketFilter;
    }>,
  ) => {
    if (nextFilters.completedFilter) {
      setCompletedFilter(nextFilters.completedFilter);
    }

    if (nextFilters.assigneeFilter) {
      setAssigneeFilter(nextFilters.assigneeFilter);
    }

    if (nextFilters.statusFilter) {
      setStatusFilter(nextFilters.statusFilter);
    }

    if (nextFilters.dueBucketFilter) {
      setDueBucketFilter(nextFilters.dueBucketFilter);
    }

    setPage(1);
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setCreateError({
        status: 401,
        message: 'You need to sign in before creating tasks.',
      });
      return;
    }

    if (!form.title.trim()) {
      setCreateError({
        status: 422,
        message: 'Task title is required.',
      });
      return;
    }

    if (!form.entityId) {
      setCreateError({
        status: 422,
        message: 'Select a lead for this task.',
      });
      return;
    }

    setCreateLoading(true);
    setCreateError(null);
    setCreateSuccess(null);

    const createdTaskInput = buildCreateTaskInput(form);
    const createdTaskMayBeHidden =
      (assigneeFilter === 'me' && createdTaskInput.assigneeId !== user?.id) ||
      (statusFilter !== 'all' && statusFilter !== (createdTaskInput.status ?? 'TODO')) ||
      dueBucketFilter !== 'all' ||
      completedFilter === 'completed';

    try {
      await createTask(accessToken, createdTaskInput);
      resetCreateForm();
      setShowCreateForm(false);
      setPage(1);
      setCreateSuccess(
        createdTaskMayBeHidden
          ? 'Task created, but current filters may hide it. Switch to All visible or clear filters if you do not see it.'
          : 'Task created.',
      );
      refreshTasks();
    } catch (requestError) {
      const error = toRequestError(requestError, 'Could not create task.');
      setCreateError({
        status: error.status,
        message: error.status === 403 ? 'You do not have permission to create tasks.' : error.message,
      });
    } finally {
      setCreateLoading(false);
    }
  };

  const availableEntities = leads.filter((lead) => ACTIVE_TASK_LEAD_STATUSES.has(lead.status));
  const normalizedRecordSearch = normalizeSearch(recordSearch);
  const filteredEntities = availableEntities.filter((record) =>
    normalizedRecordSearch ? getRecordSearchText('LEAD', record).toLowerCase().includes(normalizedRecordSearch) : true,
  );
  const selectedEntity = availableEntities.find((record) => record.id === form.entityId);
  const recordOptions =
    selectedEntity && !filteredEntities.some((record) => record.id === selectedEntity.id)
      ? [selectedEntity, ...filteredEntities]
      : filteredEntities;
  const recordPickerMessage = getRecordPickerMessage(
    'LEAD',
    optionsLoading,
    availableEntities.length,
    filteredEntities.length,
    recordSearch,
  );
  const selectedTaskEntityLabel = selectedTask ? getTaskEntityLabel(selectedTask, contactsById, dealsById, leadsById) : '';
  const selectedTaskEntityPath = selectedTask ? getTaskEntityPath(selectedTask) : '';

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Tasks</h1>
            <p className="mt-1 text-sm text-gray-600">
              My Day and follow-up work for active lead management.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowCreateForm((current) => !current);
              setCreateError(null);
              setCreateSuccess(null);
            }}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            {showCreateForm ? 'Close Create Task' : 'Create Task'}
          </button>
        </div>

        <section className="rounded border border-gray-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Overdue</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{formatTaskCount(myDaySummary.overdue)}</p>
              <p className="mt-1 text-sm text-gray-600">
                {myDaySummary.overdue > 0 ? 'Start here first.' : "You're caught up."}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Due today</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{formatTaskCount(myDaySummary.today)}</p>
              <p className="mt-1 text-sm text-gray-600">
                {myDaySummary.today > 0 ? 'Due before the day ends.' : 'No tasks due today.'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">In progress</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{formatTaskCount(myDaySummary.inProgress)}</p>
              <p className="mt-1 text-sm text-gray-600">Currently being worked.</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Waiting</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{formatTaskCount(myDaySummary.waiting)}</p>
              <p className="mt-1 text-sm text-gray-600">Blocked on a reply or next step.</p>
            </div>
            <div className="sm:col-span-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Current view</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{formatTaskCount(totalTasks)}</p>
              <p className="mt-1 text-sm text-gray-600">{filterSummary}.</p>
            </div>
          </div>
        </section>

        <TaskViewSwitcher viewMode={viewMode} onChange={handleViewModeChange} />

        {showCreateForm ? (
          <section className="rounded border border-gray-200 bg-white p-5">
            <h2 className="text-base font-semibold text-gray-900">Create task</h2>
            {optionWarnings.length > 0 ? (
              <div className="mt-3 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                {optionWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
            <form className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" onSubmit={handleCreateSubmit}>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                Title
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  required
                />
              </label>
              <div className="flex flex-col gap-3 sm:col-span-2 xl:col-span-1">
                <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                  Search lead
                  <input
                    value={recordSearch}
                    onChange={(event) => {
                      setRecordSearch(event.target.value);
                      setCreateError(null);
                    }}
                    disabled={optionsLoading || availableEntities.length === 0}
                    placeholder="Search loaded leads"
                    className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                Lead
                <select
                  value={form.entityId}
                  onChange={(event) => setForm((current) => ({ ...current, entityId: event.target.value }))}
                  disabled={optionsLoading || recordOptions.length === 0}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                  required
                >
                  <option value="">
                    {optionsLoading
                      ? 'Loading leads...'
                      : 'Select a lead'}
                  </option>
                  {recordOptions.map((record) => (
                    <option key={record.id} value={record.id}>
                      {getRecordOptionLabel('LEAD', record)}
                    </option>
                  ))}
                </select>
                <p className="text-xs font-normal text-gray-500">{recordPickerMessage}</p>
              </label>
              </div>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                Due date and time
                <input
                  type="datetime-local"
                  value={form.dueAt}
                  onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                Assignee
                <select
                  value={form.assigneeId}
                  onChange={(event) => setForm((current) => ({ ...current, assigneeId: event.target.value }))}
                  disabled={optionsLoading || memberships.length === 0}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="">No assignee</option>
                  {memberships.map((membership) => (
                    <option key={membership.id} value={membership.userId}>
                      {getMembershipName(membership)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 sm:col-span-2 xl:col-span-3">
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  className="min-h-24 rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                />
              </label>
              <div className="sm:col-span-2 xl:col-span-3">
                {createError ? <p className="mb-3 text-sm text-red-700">{createError.message}</p> : null}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={createLoading || optionsLoading}
                    className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
                  >
                    {createLoading ? 'Creating...' : 'Create task'}
                  </button>
                  <button
                    type="button"
                    onClick={resetCreateForm}
                    disabled={createLoading}
                    className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </form>
          </section>
        ) : null}

        <section className="rounded border border-gray-200 bg-white px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Filter tasks</h2>
              <p className="mt-1 text-sm text-gray-600">{filterSummary}.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  applyQuickFilter({
                    completedFilter: 'open',
                    assigneeFilter: 'me',
                    statusFilter: 'all',
                    dueBucketFilter: 'all',
                  })
                }
                className={QUICK_FILTER_CLASS}
              >
                My tasks
              </button>
              <button
                type="button"
                onClick={() =>
                  applyQuickFilter({
                    completedFilter: 'open',
                    statusFilter: 'all',
                    dueBucketFilter: 'overdue',
                  })
                }
                className={QUICK_FILTER_CLASS}
              >
                Overdue
              </button>
              <button
                type="button"
                onClick={() =>
                  applyQuickFilter({
                    completedFilter: 'open',
                    statusFilter: 'all',
                    dueBucketFilter: 'today',
                  })
                }
                className={QUICK_FILTER_CLASS}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() =>
                  applyQuickFilter({
                    completedFilter: 'open',
                    statusFilter: 'IN_PROGRESS',
                    dueBucketFilter: 'all',
                  })
                }
                className={QUICK_FILTER_CLASS}
              >
                In progress
              </button>
            </div>
          </div>
          {createSuccess ? <p className="mt-3 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{createSuccess}</p> : null}
          {optionWarnings.length > 0 ? (
            <div className="mt-3 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              {optionWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,220px)_minmax(0,170px)_minmax(0,170px)_minmax(0,170px)_minmax(0,170px)_auto] xl:items-end">
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Lead search
              <input
                value={taskSearch}
                onChange={(event) => {
                  setTaskSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search title, lead, email, or phone"
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Completion
              <select
                value={completedFilter}
                onChange={(event) => {
                  const nextCompletedFilter = event.target.value as CompletedFilter;
                  setCompletedFilter(nextCompletedFilter);
                  if (nextCompletedFilter !== 'open' && viewMode === 'kanban') {
                    handleViewModeChange('table');
                  }
                  setPage(1);
                }}
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              >
                <option value="open">Open</option>
                <option value="completed">Completed</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Owner / Assignee
              <select
                value={assigneeFilter}
                onChange={(event) => {
                  setAssigneeFilter(event.target.value as AssigneeFilter);
                  setPage(1);
                }}
                className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              >
                <option value="me">My tasks</option>
                <option value="all">All visible tasks</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Status
              <select
                value={statusFilter}
                onChange={(event) => {
                  const nextStatusFilter = event.target.value as StatusFilter;
                  setStatusFilter(nextStatusFilter);
                  if (nextStatusFilter === 'DONE' && viewMode === 'kanban') {
                    handleViewModeChange('table');
                    setCompletedFilter('completed');
                  }
                  setPage(1);
                }}
                className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              >
                <option value="all">All statuses</option>
                <option value="TODO">To do</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="WAITING">Waiting</option>
                <option value="DONE">Done</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
              Due
              <select
                value={dueBucketFilter}
                onChange={(event) => {
                  setDueBucketFilter(event.target.value as DueBucketFilter);
                  setPage(1);
                }}
                className="rounded border border-gray-300 px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              >
                <option value="all">All</option>
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="upcoming">Upcoming</option>
                <option value="no_due_date">No due date</option>
              </select>
            </label>
            <div className="flex">
              <button
                type="button"
                onClick={handleResetFilters}
                className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                Reset filters
              </button>
            </div>
          </div>
          {hasActiveFilters(completedFilter, assigneeFilter, entityTypeFilter, statusFilter, dueBucketFilter) || taskSearch.trim() ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active filters</span>
              {taskSearch.trim() ? <FilterChip label={`Search: ${taskSearch.trim()}`} onRemove={() => setTaskSearch('')} /> : null}
              {assigneeFilter !== DEFAULT_ASSIGNEE_FILTER ? (
                <FilterChip label={assigneeFilter === 'all' ? 'Team tasks' : 'My tasks'} onRemove={() => setAssigneeFilter(DEFAULT_ASSIGNEE_FILTER)} />
              ) : null}
              {completedFilter !== DEFAULT_COMPLETED_FILTER ? (
                <FilterChip label={completedFilter === 'completed' ? 'Completed' : completedFilter === 'all' ? 'Open and completed' : 'Open'} onRemove={() => setCompletedFilter(DEFAULT_COMPLETED_FILTER)} />
              ) : null}
              {statusFilter !== DEFAULT_STATUS_FILTER ? <FilterChip label={STATUS_LABELS[statusFilter as TaskStatus]} onRemove={() => setStatusFilter(DEFAULT_STATUS_FILTER)} /> : null}
              {dueBucketFilter !== DEFAULT_DUE_BUCKET_FILTER ? <FilterChip label={SECTION_LABELS[dueBucketFilter as TaskDueBucket]} onRemove={() => setDueBucketFilter(DEFAULT_DUE_BUCKET_FILTER)} /> : null}
            </div>
          ) : null}
        </section>

        {tasksLoading ? <p className="rounded border border-gray-200 bg-white p-5 text-sm text-gray-700">Loading tasks...</p> : null}

        {!tasksLoading && tasksError ? (
          <div className="rounded border border-red-200 bg-white p-5">
            <h2 className="text-base font-semibold text-red-900">Could not load tasks</h2>
            <p className="mt-2 text-sm text-red-700">{tasksError.message}</p>
            <button
              type="button"
              onClick={refreshTasks}
              className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Retry
            </button>
          </div>
        ) : null}

        {!tasksLoading && !tasksError && visibleTasks.length === 0 && viewMode !== 'kanban' && viewMode !== 'calendar' ? (
          <EmptyTasksState
            assigneeFilter={assigneeFilter}
            entityTypeFilter={entityTypeFilter}
            dueBucketFilter={dueBucketFilter}
            hasFilters={hasActiveFilters(completedFilter, assigneeFilter, entityTypeFilter, statusFilter, dueBucketFilter)}
            onShowAll={() => {
              setAssigneeFilter('all');
              setPage(1);
            }}
            onCreate={() => setShowCreateForm(true)}
          />
        ) : null}

        {!tasksLoading && !tasksError && (visibleTasks.length > 0 || viewMode === 'kanban' || viewMode === 'calendar') ? (
          <>
            {viewMode === 'daily' ? (
              <div className="space-y-5">
                {groupedTasks.map((section) => {
                  if (section.bucket === 'overdue' && section.tasks.length === 0) {
                    return null;
                  }
                  const collapsible = section.bucket === 'upcoming' || section.bucket === 'no_due_date';
                  const collapsed = Boolean(collapsedSections[section.bucket]);

                  return (
                    <TaskSection
                      key={section.bucket}
                      label={section.label}
                      bucket={section.bucket}
                      tasks={section.tasks}
                      collapsed={collapsed}
                      collapsible={collapsible}
                      onToggleCollapsed={() => setCollapsedSections((current) => ({ ...current, [section.bucket]: !current[section.bucket] }))}
                    >
                      {!collapsed
                        ? section.tasks.map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              contactsById={contactsById}
                              dealsById={dealsById}
                              leadsById={leadsById}
                              membershipsByUserId={membershipsByUserId}
                              accessToken={accessToken}
                              onChanged={refreshTasks}
                              onOpenTask={setSelectedTask}
                            />
                          ))
                        : null}
                    </TaskSection>
                  );
                })}
              </div>
            ) : viewMode === 'table' ? (
              <TaskTableView
                tasks={sortedTasks}
                contactsById={contactsById}
                dealsById={dealsById}
                leadsById={leadsById}
                membershipsByUserId={membershipsByUserId}
                accessToken={accessToken}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSortKeyChange={setSortKey}
                onSortDirectionChange={setSortDirection}
                onChanged={refreshTasks}
                onOpenTask={setSelectedTask}
              />
            ) : viewMode === 'calendar' ? (
              <TaskCalendarView
                tasks={visibleTasks}
                currentMonth={calendarMonth}
                contactsById={contactsById}
                dealsById={dealsById}
                leadsById={leadsById}
                membershipsByUserId={membershipsByUserId}
                accessToken={accessToken}
                onMonthChange={setCalendarMonth}
                onChanged={refreshTasks}
                onOpenTask={setSelectedTask}
                onCreateTaskAt={openCreateFormAt}
              />
            ) : (
              <TaskKanbanView
                tasks={visibleTasks}
                contactsById={contactsById}
                dealsById={dealsById}
                leadsById={leadsById}
                membershipsByUserId={membershipsByUserId}
                accessToken={accessToken}
                onChanged={refreshTasks}
                onOpenTask={setSelectedTask}
              />
            )}
            {viewMode !== 'calendar' ? (
            <div className="flex flex-col gap-3 rounded border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!hasPreviousPage || tasksLoading}
                  className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!hasNextPage || tasksLoading}
                  className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  Next
                </button>
              </div>
            </div>
            ) : null}
          </>
        ) : null}
        {selectedTask ? (
          <TaskDetailModal
            task={selectedTask}
            memberships={memberships}
            entityLabel={selectedTaskEntityLabel}
            entityPath={selectedTaskEntityPath}
            onClose={() => setSelectedTask(null)}
            onSaved={(updatedTask) => {
              setSelectedTask(updatedTask);
              refreshTasks();
            }}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

type TaskViewSwitcherProps = {
  viewMode: TaskViewMode;
  onChange: (viewMode: TaskViewMode) => void;
};

function TaskViewSwitcher({ viewMode, onChange }: TaskViewSwitcherProps) {
  const options: Array<{ value: TaskViewMode; label: string }> = [
    { value: 'daily', label: 'My Day' },
    { value: 'table', label: 'Table' },
    { value: 'kanban', label: 'Kanban' },
    { value: 'calendar', label: 'Calendar' },
  ];

  return (
    <section className="rounded border border-gray-200 bg-white p-2">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = viewMode === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={
                active
                  ? 'rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2'
                  : 'rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2'
              }
              aria-pressed={active}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
      title={`Remove ${label}`}
    >
      {label} x
    </button>
  );
}

type TaskTableViewProps = {
  tasks: Task[];
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  accessToken: string | null;
  sortKey: TaskSortKey;
  sortDirection: TaskSortDirection;
  onSortKeyChange: (sortKey: TaskSortKey) => void;
  onSortDirectionChange: (sortDirection: TaskSortDirection) => void;
  onChanged: () => void;
  onOpenTask: (task: Task) => void;
};

function TaskTableView({
  tasks,
  contactsById,
  dealsById,
  leadsById,
  membershipsByUserId,
  accessToken,
  sortKey,
  sortDirection,
  onSortKeyChange,
  onSortDirectionChange,
  onChanged,
  onOpenTask,
}: TaskTableViewProps) {
  return (
    <section className="rounded border border-gray-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Table view</h2>
          <p className="mt-1 text-sm text-gray-600">{formatTaskCount(tasks.length)} on this page</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,150px)]">
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Sort by
            <select
              value={sortKey}
              onChange={(event) => onSortKeyChange(event.target.value as TaskSortKey)}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Direction
            <select
              value={sortDirection}
              onChange={(event) => onSortDirectionChange(event.target.value as TaskSortDirection)}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-normal text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        </div>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="px-4 py-3">Task</th>
              <th scope="col" className="px-4 py-3">Lead</th>
              <th scope="col" className="px-4 py-3">Assignee</th>
              <th scope="col" className="px-4 py-3">Due date</th>
              <th scope="col" className="px-4 py-3">Due status</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {tasks.map((task) => (
              <TaskTableRow
                key={task.id}
                task={task}
                contactsById={contactsById}
                dealsById={dealsById}
                leadsById={leadsById}
                membershipsByUserId={membershipsByUserId}
                accessToken={accessToken}
                onChanged={onChanged}
                onOpenTask={onOpenTask}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-4 lg:hidden">
        {tasks.map((task) => (
          <TaskTableMobileCard
            key={task.id}
            task={task}
            contactsById={contactsById}
            dealsById={dealsById}
            leadsById={leadsById}
            membershipsByUserId={membershipsByUserId}
            accessToken={accessToken}
            onChanged={onChanged}
            onOpenTask={onOpenTask}
          />
        ))}
      </div>
    </section>
  );
}

type TaskTableItemProps = {
  task: Task;
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  accessToken: string | null;
  onChanged: () => void;
  onOpenTask: (task: Task) => void;
};

function TaskTableRow({
  task,
  contactsById,
  dealsById,
  leadsById,
  membershipsByUserId,
  accessToken,
  onChanged,
  onOpenTask,
}: TaskTableItemProps) {
  const entityLabel = getTaskEntityLabel(task, contactsById, dealsById, leadsById);
  const entityPath = getTaskEntityPath(task);
  const dueStatus = getDueStatus(task);
  const completed = isTaskCompleted(task);

  return (
    <tr className={completed ? 'bg-gray-50 text-gray-600' : 'text-gray-900'}>
      <td className="max-w-xs px-4 py-3 align-top">
        <p className={completed ? 'font-medium text-gray-600' : 'font-medium text-gray-900'}>{task.title}</p>
      </td>
      <td className="max-w-xs px-4 py-3 align-top">
        <Link className="break-words font-medium underline decoration-gray-300 underline-offset-2 hover:text-gray-700" to={entityPath}>
          {entityLabel}
        </Link>
      </td>
      <td className="px-4 py-3 align-top text-gray-700">
        <InlineTaskAssigneeControl task={task} membershipsByUserId={membershipsByUserId} accessToken={accessToken} onChanged={onChanged} />
      </td>
      <td className="min-w-52 px-4 py-3 align-top text-gray-700">
        <InlineTaskDueControl task={task} accessToken={accessToken} onChanged={onChanged} />
      </td>
      <td className="px-4 py-3 align-top">
        <span className={getDueClassName(dueStatus)}>{dueStatus.label}</span>
      </td>
      <td className="px-4 py-3 align-top">
        <InlineTaskStatusControl task={task} accessToken={accessToken} onChanged={onChanged} />
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenTask(task)}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Details
          </button>
          <Link
            to={entityPath}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Open lead
          </Link>
          <TaskCompletionButton task={task} accessToken={accessToken} onChanged={onChanged} />
        </div>
      </td>
    </tr>
  );
}

function TaskTableMobileCard({
  task,
  contactsById,
  dealsById,
  leadsById,
  membershipsByUserId,
  accessToken,
  onChanged,
  onOpenTask,
}: TaskTableItemProps) {
  const entityLabel = getTaskEntityLabel(task, contactsById, dealsById, leadsById);
  const entityPath = getTaskEntityPath(task);
  const dueStatus = getDueStatus(task);
  const completed = isTaskCompleted(task);

  return (
    <article className={completed ? 'rounded border border-gray-200 bg-gray-50 p-4 text-gray-700' : 'rounded border border-gray-200 bg-white p-4'}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={getEntityClassName(task.entityType)}>Lead</span>
          <InlineTaskStatusControl task={task} accessToken={accessToken} onChanged={onChanged} />
        </div>
        <h3 className={completed ? 'text-base font-semibold text-gray-600' : 'text-base font-semibold text-gray-900'}>{task.title}</h3>
        <Link className="break-words text-sm font-medium underline decoration-gray-300 underline-offset-2 hover:text-gray-700" to={entityPath}>
          {entityLabel}
        </Link>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assignee</dt>
          <dd className="mt-1"><InlineTaskAssigneeControl task={task} membershipsByUserId={membershipsByUserId} accessToken={accessToken} onChanged={onChanged} /></dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Due date</dt>
          <dd className="mt-1"><InlineTaskDueControl task={task} accessToken={accessToken} onChanged={onChanged} /></dd>
        </div>
        <TaskMeta label="Due status" value={dueStatus.label} />
      </dl>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => onOpenTask(task)}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Details
        </button>
        <Link
          to={entityPath}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Open lead
        </Link>
        <TaskCompletionButton task={task} accessToken={accessToken} onChanged={onChanged} />
      </div>
    </article>
  );
}

type TaskCompletionButtonProps = {
  task: Task;
  accessToken: string | null;
  onChanged: () => void;
};

function TaskCompletionButton({ task, accessToken, onChanged }: TaskCompletionButtonProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const completed = isTaskCompleted(task);

  const runAction = async () => {
    if (!accessToken) {
      setActionError('You need to sign in before updating tasks.');
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      if (completed) {
        await reopenTask(accessToken, task.id);
      } else {
        await completeTask(accessToken, task.id);
      }

      onChanged();
    } catch (requestError) {
      setActionError(getTaskActionError(requestError));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={runAction}
        disabled={actionLoading}
        className={
          completed
            ? 'w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400'
            : 'w-full rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400'
        }
      >
        {actionLoading ? 'Updating...' : completed ? 'Reopen' : 'Complete'}
      </button>
      {actionError ? <p className="mt-2 text-sm text-red-700">{actionError}</p> : null}
    </div>
  );
}

type TaskMetaProps = {
  label: string;
  value: string;
};

function TaskMeta({ label, value }: TaskMetaProps) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-words text-gray-900">{value}</dd>
    </div>
  );
}

type EmptyTasksStateProps = {
  assigneeFilter: AssigneeFilter;
  entityTypeFilter: EntityTypeFilter;
  dueBucketFilter: DueBucketFilter;
  hasFilters: boolean;
  onShowAll: () => void;
  onCreate: () => void;
};

function EmptyTasksState({
  assigneeFilter,
  entityTypeFilter,
  dueBucketFilter,
  hasFilters,
  onShowAll,
  onCreate,
}: EmptyTasksStateProps) {
  const title =
    assigneeFilter === 'me'
      ? 'No tasks assigned to you'
      : entityTypeFilter === 'LEAD'
        ? 'No lead follow-up tasks yet'
        : dueBucketFilter === 'today'
          ? 'No tasks due today'
          : dueBucketFilter === 'overdue'
            ? 'No overdue tasks'
            : 'No tasks found';
  const message =
    assigneeFilter === 'me'
      ? 'Switch to All visible tasks to see team tasks.'
      : entityTypeFilter === 'LEAD'
        ? "Create one from a lead's detail page or here."
        : dueBucketFilter === 'today'
          ? 'No tasks due today.'
          : dueBucketFilter === 'overdue'
            ? "No overdue tasks - you're caught up."
          : hasFilters
            ? 'Try changing or resetting the filters.'
            : 'Create the first task to start tracking follow-up work.';

  return (
    <div className="rounded border border-gray-200 bg-white p-8 text-center">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm text-gray-600">{message}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {assigneeFilter === 'me' ? (
          <button
            type="button"
            onClick={onShowAll}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Show all visible
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCreate}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Create Task
        </button>
      </div>
    </div>
  );
}

type TaskSectionProps = {
  label: string;
  bucket: LocalDueBucket;
  tasks: Task[];
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  children: ReactNode;
};

function TaskSection({ label, bucket, tasks, collapsible = false, collapsed = false, onToggleCollapsed, children }: TaskSectionProps) {
  const helperText = getSectionHelper(bucket, tasks.length);

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 border-b border-gray-200 pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {label} - {formatTaskCount(tasks.length)}
          </h2>
          <p className="mt-1 text-sm text-gray-600">{helperText}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-fit rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">{tasks.length}</span>
          {collapsible ? (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              {collapsed ? 'Expand' : 'Collapse'}
            </button>
          ) : null}
        </div>
      </div>
      {collapsed ? null : tasks.length > 0 ? children : <p className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">{helperText}</p>}
    </section>
  );
}

function getCompactSelectClassName(status?: TaskStatus) {
  const tone = status ? getStatusClassName(status) : 'rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700';
  return `${tone} max-w-36 border-0 pr-6 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60`;
}

function InlineTaskStatusControl({
  task,
  accessToken,
  onChanged,
}: {
  task: Task;
  accessToken: string | null;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (nextStatus: TaskStatus) => {
    if (nextStatus === task.status || saving) {
      return;
    }

    if (!accessToken) {
      setError('Sign in before updating tasks.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateTask(accessToken, task.id, { status: nextStatus });
      onChanged();
    } catch (requestError) {
      setError(getTaskActionError(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1" onClick={(event) => event.stopPropagation()}>
      <select
        value={task.status}
        onChange={(event) => void handleChange(event.target.value as TaskStatus)}
        disabled={saving}
        aria-label={`Change status for ${task.title}`}
        className={getCompactSelectClassName(task.status)}
      >
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {saving && value === task.status ? 'Saving...' : label}
          </option>
        ))}
      </select>
      {error ? <p className="max-w-40 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

function InlineTaskAssigneeControl({
  task,
  membershipsByUserId,
  accessToken,
  onChanged,
}: {
  task: Task;
  membershipsByUserId: Map<string, MembershipOption>;
  accessToken: string | null;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberships = Array.from(membershipsByUserId.values());

  const handleChange = async (nextAssigneeId: string) => {
    const normalizedAssigneeId = nextAssigneeId || null;
    if (normalizedAssigneeId === task.assigneeId || saving) {
      return;
    }

    if (!accessToken) {
      setError('Sign in before updating tasks.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateTask(accessToken, task.id, { assigneeId: normalizedAssigneeId });
      onChanged();
    } catch (requestError) {
      setError(getTaskActionError(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1" onClick={(event) => event.stopPropagation()}>
      <select
        value={task.assigneeId ?? ''}
        onChange={(event) => void handleChange(event.target.value)}
        disabled={saving}
        aria-label={`Change assignee for ${task.title}`}
        className="max-w-40 rounded-full border-0 bg-gray-100 px-2 py-0.5 pr-6 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">{saving ? 'Saving...' : 'Unassigned'}</option>
        {memberships.map((membership) => (
          <option key={membership.id} value={membership.userId}>
            {getMembershipName(membership)}
          </option>
        ))}
      </select>
      {error ? <p className="max-w-40 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

function InlineTaskDueControl({ task, accessToken, onChanged }: { task: Task; accessToken: string | null; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(() => toLocalDateTimeInput(task.dueAt));

  useEffect(() => {
    setValue(toLocalDateTimeInput(task.dueAt));
  }, [task.dueAt]);

  const handleBlur = async () => {
    const nextDueAt = value ? new Date(value).toISOString() : null;
    if ((task.dueAt ?? null) === nextDueAt || saving) {
      return;
    }

    if (!accessToken) {
      setError('Sign in before updating tasks.');
      setValue(toLocalDateTimeInput(task.dueAt));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateTask(accessToken, task.id, { dueAt: nextDueAt });
      onChanged();
    } catch (requestError) {
      setValue(toLocalDateTimeInput(task.dueAt));
      setError(getTaskActionError(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1" onClick={(event) => event.stopPropagation()}>
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void handleBlur()}
        disabled={saving}
        aria-label={`Change due date for ${task.title}`}
        className="w-44 rounded-full border-0 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      />
      {saving ? <p className="text-xs text-gray-500">Saving...</p> : null}
      {error ? <p className="max-w-44 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

type TaskCardProps = {
  task: Task;
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  accessToken: string | null;
  onChanged: () => void;
  onOpenTask: (task: Task) => void;
};

function TaskCard({ task, contactsById, dealsById, leadsById, membershipsByUserId, accessToken, onChanged, onOpenTask }: TaskCardProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const contact = task.entityType === 'CONTACT' ? contactsById.get(task.entityId) : undefined;
  const deal = task.entityType === 'DEAL' ? dealsById.get(task.entityId) : undefined;
  const lead = task.entityType === 'LEAD' ? leadsById.get(task.entityId) : undefined;
  const membership = task.assigneeId ? membershipsByUserId.get(task.assigneeId) : undefined;
  const entityLabel =
    task.entitySummary?.displayName ??
    (contact ? getContactOptionName(contact) : deal ? getDealOptionName(deal) : lead ? getLeadOptionName(lead) : task.entityId);
  const entityPath =
    task.entityType === 'CONTACT'
      ? `/contacts/${task.entityId}`
      : task.entityType === 'DEAL'
        ? `/deals/${task.entityId}`
        : `/leads/${task.entityId}`;
  const assigneeLabel = task.assigneeSummary?.displayName ?? (membership ? getMembershipName(membership) : task.assigneeId ?? 'Unassigned');
  const completed = isTaskCompleted(task);
  const dueStatus = getDueStatus(task);
  const leadContext =
    task.entityType === 'LEAD'
      ? [task.entitySummary?.temperature, task.entitySummary?.status].filter(Boolean).join(' / ')
      : '';
  const openRecordLabel = 'Open lead';

  const runAction = async () => {
    if (!accessToken) {
      setActionError('You need to sign in before updating tasks.');
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      if (completed) {
        await reopenTask(accessToken, task.id);
      } else {
        await completeTask(accessToken, task.id);
      }

      onChanged();
    } catch (requestError) {
      setActionError(getTaskActionError(requestError));
    } finally {
      setActionLoading(false);
    }
  };

  const cardClassName = completed
    ? 'rounded border border-gray-200 bg-gray-50 p-4 text-gray-700'
    : dueStatus.tone === 'overdue'
      ? 'rounded border border-rose-200 bg-white p-4 shadow-sm shadow-rose-100/60'
      : 'rounded border border-gray-200 bg-white p-4';
  const titleClassName = completed ? 'text-lg font-semibold text-gray-600' : 'text-lg font-semibold text-gray-900';
  const statusClassName = completed
    ? 'rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700'
    : 'rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700';
  const entityClassName =
    task.entityType === 'LEAD'
      ? 'rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
      : task.entityType === 'DEAL'
        ? 'rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700'
        : 'rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700';
  const dueClassName =
    dueStatus.tone === 'overdue'
      ? 'rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700'
      : dueStatus.tone === 'today'
        ? 'rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800'
        : dueStatus.tone === 'completed'
          ? 'rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700'
          : 'rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600';

  return (
    <article className={cardClassName}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="space-y-2">
            <h3 className={titleClassName}>{task.title}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className={entityClassName}>Lead</span>
              <Link className={completed ? 'break-words text-sm text-gray-600 underline decoration-gray-300 underline-offset-2 hover:text-gray-700' : 'break-words text-sm font-medium text-gray-800 underline decoration-gray-300 underline-offset-2 hover:text-gray-700'} to={entityPath}>
                {entityLabel}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={dueClassName}>{dueStatus.label}</span>
              <span className={getStatusClassName(task.status)}>{STATUS_LABELS[task.status]}</span>
              <span className={statusClassName}>{completed ? 'Completed' : 'Open'}</span>
              <span className={completed ? 'text-sm text-gray-600' : 'text-sm text-gray-700'}>Assigned to {assigneeLabel}</span>
            </div>
            {leadContext ? <p className={completed ? 'text-sm text-gray-600' : 'text-sm text-gray-700'}>Lead context: {leadContext}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <InlineTaskStatusControl task={task} accessToken={accessToken} onChanged={onChanged} />
              <InlineTaskDueControl task={task} accessToken={accessToken} onChanged={onChanged} />
              <InlineTaskAssigneeControl task={task} membershipsByUserId={membershipsByUserId} accessToken={accessToken} onChanged={onChanged} />
            </div>
          </div>
          {task.description ? (
            <p className={completed ? 'mt-3 whitespace-pre-wrap text-sm text-gray-500' : 'mt-3 whitespace-pre-wrap text-sm text-gray-700'} style={{ maxHeight: '3.75rem', overflow: 'hidden' }}>
              {task.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
          <button
            type="button"
            onClick={() => onOpenTask(task)}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Details
          </button>
          <Link
            to={entityPath}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            {openRecordLabel}
          </Link>
          <button
            type="button"
            onClick={runAction}
            disabled={actionLoading}
            className={
              completed
                ? 'rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400'
                : 'rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400'
            }
          >
            {actionLoading ? 'Updating...' : completed ? 'Reopen' : 'Complete'}
          </button>
        </div>
      </div>
      {actionError ? <p className="mt-3 text-sm text-red-700">{actionError}</p> : null}
    </article>
  );
}
