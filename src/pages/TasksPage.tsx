import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ChevronDown, ListFilter, RotateCcw, Search } from 'lucide-react';
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

type CompletionFilter = 'open' | 'completed';
type AssigneeFilterValue = string;
type LocalDueBucket = TaskDueBucket | 'completed';
type TaskViewMode = 'daily' | 'table' | 'kanban' | 'calendar';
type TaskSortKey = 'dueAt' | 'title' | 'lead' | 'assignee' | 'status';
type TaskSortDirection = 'asc' | 'desc';
type TaskKpiId = 'overdue' | 'today' | 'inProgress' | 'waiting';
type TaskKpiTone = 'critical' | 'warning' | 'active' | 'neutral';
type TaskPresetId = 'MY_OPEN' | 'OVERDUE' | 'TODAY' | 'IN_PROGRESS' | 'WAITING' | 'ALL' | 'CUSTOM';
type TaskFilterMenu = 'assignee' | 'status' | 'due' | 'completion' | 'preset';

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
const UNASSIGNED_ASSIGNEE_VALUE = '__unassigned';
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

const TASK_KPI_COPY: Record<TaskKpiId, { title: string; modalTitle: string; empty: string }> = {
  overdue: {
    title: 'Overdue',
    modalTitle: 'Overdue Tasks',
    empty: 'No overdue tasks.',
  },
  today: {
    title: 'Due Today',
    modalTitle: 'Tasks Due Today',
    empty: 'No tasks are due today.',
  },
  inProgress: {
    title: 'In Progress',
    modalTitle: 'Tasks In Progress',
    empty: 'No tasks are currently in progress.',
  },
  waiting: {
    title: 'Waiting',
    modalTitle: 'Waiting Tasks',
    empty: 'No tasks are waiting.',
  },
};

const TASK_STATUS_OPTIONS: Array<{ label: string; value: TaskStatus }> = [
  { label: 'To do', value: 'TODO' },
  { label: 'In progress', value: 'IN_PROGRESS' },
  { label: 'Waiting', value: 'WAITING' },
  { label: 'Done', value: 'DONE' },
];

const TASK_DUE_OPTIONS: Array<{ label: string; value: TaskDueBucket }> = [
  { label: 'Overdue', value: 'overdue' },
  { label: 'Today', value: 'today' },
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'No due date', value: 'no_due_date' },
];

const TASK_COMPLETION_OPTIONS: Array<{ label: string; value: CompletionFilter }> = [
  { label: 'Open', value: 'open' },
  { label: 'Completed', value: 'completed' },
];

const TASK_PRESET_OPTIONS: Array<{ label: string; value: TaskPresetId }> = [
  { label: 'My Open Tasks', value: 'MY_OPEN' },
  { label: 'Overdue Tasks', value: 'OVERDUE' },
  { label: 'Due Today', value: 'TODAY' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Waiting', value: 'WAITING' },
  { label: 'All Tasks', value: 'ALL' },
  { label: 'Custom', value: 'CUSTOM' },
];

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

function groupTasks(tasks: Task[], selectedCompletionFilters: CompletionFilter[], selectedDueBuckets: TaskDueBucket[]) {
  const groups = new Map<LocalDueBucket, Task[]>();
  const completionSet = new Set(selectedCompletionFilters);
  const dueSet = new Set(selectedDueBuckets);
  const onlyCompleted = completionSet.size === 1 && completionSet.has('completed');
  const includeCompleted = completionSet.size === 0 || completionSet.has('completed');
  const sectionOrder =
    onlyCompleted
      ? (['completed'] as LocalDueBucket[])
      : dueSet.size === 0
        ? [...OPEN_SECTION_ORDER]
        : OPEN_SECTION_ORDER.filter((bucket) => dueSet.has(bucket as TaskDueBucket));

  if (!onlyCompleted && includeCompleted && dueSet.size === 0) {
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

function arraysEqual<T extends string>(left: T[], right: T[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

function selectedCountLabel(count: number) {
  return count > 0 ? String(count) : 'Any';
}

function getTaskPresetLabel(preset: TaskPresetId) {
  return TASK_PRESET_OPTIONS.find((option) => option.value === preset)?.label ?? 'Custom';
}

function getDueLabel(value: TaskDueBucket) {
  return TASK_DUE_OPTIONS.find((option) => option.value === value)?.label ?? SECTION_LABELS[value];
}

function getCompletionLabel(value: CompletionFilter) {
  return TASK_COMPLETION_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function getPresetFilters(preset: Exclude<TaskPresetId, 'CUSTOM'>, currentUserId?: string | null) {
  const myAssignees = currentUserId ? [currentUserId] : [];

  if (preset === 'MY_OPEN') {
    return {
      assigneeValues: myAssignees,
      statusFilters: [] as TaskStatus[],
      dueFilters: [] as TaskDueBucket[],
      completionFilters: ['open'] as CompletionFilter[],
    };
  }

  if (preset === 'OVERDUE') {
    return {
      assigneeValues: [] as AssigneeFilterValue[],
      statusFilters: [] as TaskStatus[],
      dueFilters: ['overdue'] as TaskDueBucket[],
      completionFilters: ['open'] as CompletionFilter[],
    };
  }

  if (preset === 'TODAY') {
    return {
      assigneeValues: [] as AssigneeFilterValue[],
      statusFilters: [] as TaskStatus[],
      dueFilters: ['today'] as TaskDueBucket[],
      completionFilters: ['open'] as CompletionFilter[],
    };
  }

  if (preset === 'IN_PROGRESS') {
    return {
      assigneeValues: [] as AssigneeFilterValue[],
      statusFilters: ['IN_PROGRESS'] as TaskStatus[],
      dueFilters: [] as TaskDueBucket[],
      completionFilters: [] as CompletionFilter[],
    };
  }

  if (preset === 'WAITING') {
    return {
      assigneeValues: [] as AssigneeFilterValue[],
      statusFilters: ['WAITING'] as TaskStatus[],
      dueFilters: [] as TaskDueBucket[],
      completionFilters: ['open'] as CompletionFilter[],
    };
  }

  return {
    assigneeValues: [] as AssigneeFilterValue[],
    statusFilters: [] as TaskStatus[],
    dueFilters: [] as TaskDueBucket[],
    completionFilters: [] as CompletionFilter[],
  };
}

function getMatchingPreset(
  assigneeValues: AssigneeFilterValue[],
  statusFilters: TaskStatus[],
  dueFilters: TaskDueBucket[],
  completionFilters: CompletionFilter[],
  currentUserId?: string | null,
): TaskPresetId {
  const presets: Array<Exclude<TaskPresetId, 'CUSTOM'>> = ['MY_OPEN', 'OVERDUE', 'TODAY', 'IN_PROGRESS', 'WAITING', 'ALL'];

  for (const preset of presets) {
    const filters = getPresetFilters(preset, currentUserId);
    if (
      arraysEqual(assigneeValues, filters.assigneeValues) &&
      arraysEqual(statusFilters, filters.statusFilters) &&
      arraysEqual(dueFilters, filters.dueFilters) &&
      arraysEqual(completionFilters, filters.completionFilters)
    ) {
      return preset;
    }
  }

  return 'CUSTOM';
}

function hasTaskFilterSelections(
  assigneeValues: AssigneeFilterValue[],
  statusFilters: TaskStatus[],
  dueFilters: TaskDueBucket[],
  completionFilters: CompletionFilter[],
) {
  return assigneeValues.length > 0 || statusFilters.length > 0 || dueFilters.length > 0 || completionFilters.length > 0;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function getTaskKpiHelper(id: TaskKpiId, count: number) {
  if (id === 'overdue') {
    return 'Start here first.';
  }

  if (id === 'today') {
    return count > 0 ? 'Scheduled for today.' : 'No tasks due today.';
  }

  if (id === 'inProgress') {
    return count > 0 ? 'Currently being worked.' : 'No tasks in progress.';
  }

  return count > 0 ? 'Blocked on a reply or next step.' : 'No tasks waiting.';
}

function getTaskKpiTone(id: TaskKpiId, count: number): TaskKpiTone {
  if (id === 'overdue') {
    return count > 0 ? 'critical' : 'neutral';
  }

  if (id === 'today') {
    return count > 0 ? 'warning' : 'neutral';
  }

  if (id === 'inProgress') {
    return count > 0 ? 'active' : 'neutral';
  }

  if (id === 'waiting') {
    return count > 0 ? 'warning' : 'neutral';
  }

  return 'neutral';
}

function getTaskKpiClassName(tone: TaskKpiTone) {
  const base =
    'block min-h-[100px] w-full rounded border px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2';

  if (tone === 'critical') {
    return `${base} border-red-200 bg-red-50 hover:border-red-300 hover:bg-red-100/60`;
  }

  if (tone === 'warning') {
    return `${base} border-amber-200 bg-amber-50 hover:border-amber-300 hover:bg-amber-100/60`;
  }

  if (tone === 'active') {
    return `${base} border-blue-200 bg-blue-50 hover:border-blue-300 hover:bg-blue-100/60`;
  }

  return `${base} border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50`;
}

function getTaskKpiAccentClassName(tone: TaskKpiTone) {
  if (tone === 'critical') return 'bg-red-600';
  if (tone === 'warning') return 'bg-amber-500';
  if (tone === 'active') return 'bg-blue-600';
  return 'bg-gray-300';
}

function getTaskKpiSubtitle(id: TaskKpiId, count: number) {
  if (count === 0) {
    if (id === 'overdue') return 'No overdue tasks';
    if (id === 'today') return 'No tasks due today';
    if (id === 'inProgress') return 'No tasks in progress';
    return 'No waiting tasks';
  }

  const taskWord = count === 1 ? 'task' : 'tasks';

  if (id === 'overdue') return `${formatNumber(count)} overdue ${taskWord}`;
  if (id === 'today') return `${formatNumber(count)} ${taskWord} due today`;
  if (id === 'inProgress') return `${formatNumber(count)} ${taskWord} in progress`;
  return `${formatNumber(count)} waiting ${taskWord}`;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

export function TasksPage() {
  const { accessToken, user } = useAuth();
  const [tasksData, setTasksData] = useState<TasksResponse | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<RequestError | null>(null);
  const [selectedAssigneeValues, setSelectedAssigneeValues] = useState<AssigneeFilterValue[]>(() => (user?.id ? [user.id] : []));
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<TaskStatus[]>([]);
  const [selectedDueFilters, setSelectedDueFilters] = useState<TaskDueBucket[]>([]);
  const [selectedCompletionFilters, setSelectedCompletionFilters] = useState<CompletionFilter[]>(['open']);
  const [taskSearch, setTaskSearch] = useState('');
  const [moreTaskFiltersOpen, setMoreTaskFiltersOpen] = useState(false);
  const [openTaskFilterMenu, setOpenTaskFilterMenu] = useState<TaskFilterMenu | null>(null);
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
  const [openTaskKpi, setOpenTaskKpi] = useState<TaskKpiId | null>(null);
  const taskKpiOpenerRef = useRef<HTMLButtonElement | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionWarnings, setOptionWarnings] = useState<string[]>([]);
  const taskFilters = useMemo<TaskFilters>(
    () => ({
      entityType: 'LEAD',
      page: 1,
      limit: CALENDAR_TASKS_LIMIT,
    }),
    [],
  );

  const contactsById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const dealsById = useMemo(() => new Map(deals.map((deal) => [deal.id, deal])), [deals]);
  const leadsById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  const membershipsByUserId = useMemo(() => new Map(memberships.map((membership) => [membership.userId, membership])), [memberships]);
  const tasks = tasksData?.data ?? [];
  const normalizedTaskSearch = normalizeSearch(taskSearch);
  const activeTaskPreset = getMatchingPreset(
    selectedAssigneeValues,
    selectedStatusFilters,
    selectedDueFilters,
    selectedCompletionFilters,
    user?.id,
  );
  const activeSecondaryFilterCount = selectedStatusFilters.length + selectedDueFilters.length + selectedCompletionFilters.length;
  const hasActiveTaskFilters = hasTaskFilterSelections(
    selectedAssigneeValues,
    selectedStatusFilters,
    selectedDueFilters,
    selectedCompletionFilters,
  );
  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      const lead = leadsById.get(task.entityId);
      if (lead && !ACTIVE_TASK_LEAD_STATUSES.has(lead.status)) return false;

      if (selectedAssigneeValues.length > 0) {
        const assigneeValue = task.assigneeId ?? UNASSIGNED_ASSIGNEE_VALUE;
        if (!selectedAssigneeValues.includes(assigneeValue)) return false;
      }

      if (selectedStatusFilters.length > 0 && !selectedStatusFilters.includes(task.status)) return false;

      if (selectedCompletionFilters.length > 0) {
        const completionValue: CompletionFilter = isTaskCompleted(task) ? 'completed' : 'open';
        if (!selectedCompletionFilters.includes(completionValue)) return false;
      }

      if (selectedDueFilters.length > 0 && !selectedDueFilters.includes(getLocalDueBucket(task) as TaskDueBucket)) return false;

      if (normalizedTaskSearch) {
        const searchText = joinOptionParts([
          task.title,
          task.description,
          getTaskEntityLabel(task, contactsById, dealsById, leadsById),
          lead?.email,
          lead?.phone,
          lead?.source,
          lead?.sourceDetail,
        ]).toLowerCase();

        if (!searchText.includes(normalizedTaskSearch)) return false;
      }

      return true;
    });
  }, [
    contactsById,
    dealsById,
    leadsById,
    normalizedTaskSearch,
    selectedAssigneeValues,
    selectedCompletionFilters,
    selectedDueFilters,
    selectedStatusFilters,
    tasks,
  ]);
  const totalTasks = visibleTasks.length;
  const currentPage = 1;
  const currentLimit = Math.max(totalTasks, TASKS_PAGE_LIMIT);
  const totalPages = 1;
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage * currentLimit < totalTasks;
  const groupedTasks = useMemo(
    () => groupTasks(visibleTasks, selectedCompletionFilters, selectedDueFilters),
    [selectedCompletionFilters, selectedDueFilters, visibleTasks],
  );
  const sortedTasks = useMemo(
    () => sortTasks(visibleTasks, sortKey, sortDirection, membershipsByUserId, leadsById),
    [leadsById, membershipsByUserId, sortDirection, sortKey, visibleTasks],
  );
  const unfilteredTaskKpiCollections = useMemo<Record<TaskKpiId, Task[]>>(
    () => ({
      overdue: tasks.filter((task) => getLocalDueBucket(task) === 'overdue'),
      today: tasks.filter((task) => getLocalDueBucket(task) === 'today'),
      inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS'),
      waiting: tasks.filter((task) => task.status === 'WAITING'),
    }),
    [tasks],
  );
  const currentUserMembership = useMemo(
    () => (user?.id ? memberships.find((membership) => membership.userId === user.id) : undefined),
    [memberships, user?.id],
  );
  const assigneeFilterOptions = useMemo(() => {
    const options: Array<{ label: string; value: AssigneeFilterValue }> = [];

    if (user?.id) {
      options.push({ label: 'Me', value: user.id });
    }

    for (const membership of memberships) {
      if (membership.userId === user?.id) continue;
      options.push({ label: getMembershipName(membership), value: membership.userId });
    }

    options.push({ label: 'Unassigned', value: UNASSIGNED_ASSIGNEE_VALUE });
    return options;
  }, [memberships, user?.id]);
  const assigneeFilterLabelsByValue = useMemo(
    () => new Map(assigneeFilterOptions.map((option) => [option.value, option.label])),
    [assigneeFilterOptions],
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
    if (!accessToken) {
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
        const response = await listTasks(token, taskFilters);
        if (!active) {
          return;
        }

        setTasksData(response);
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
  }, [accessToken, refreshKey, taskFilters]);

  const refreshTasks = () => {
    setRefreshKey((current) => current + 1);
  };

  const openTaskKpiModal = (kpi: TaskKpiId, opener: HTMLButtonElement) => {
    taskKpiOpenerRef.current = opener;
    setOpenTaskKpi(kpi);
  };

  const closeTaskKpiModal = () => {
    setOpenTaskKpi(null);
    window.setTimeout(() => taskKpiOpenerRef.current?.focus(), 0);
  };

  const handleViewModeChange = (nextViewMode: TaskViewMode) => {
    setViewMode(nextViewMode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TASK_VIEW_STORAGE_KEY, nextViewMode);
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

  const handleClearTaskFilters = () => {
    setSelectedAssigneeValues([]);
    setSelectedStatusFilters([]);
    setSelectedDueFilters([]);
    setSelectedCompletionFilters([]);
    setTaskSearch('');
    setOpenTaskFilterMenu(null);
    setPage(1);
  };

  const applyTaskPreset = (preset: TaskPresetId) => {
    if (preset === 'CUSTOM') {
      setOpenTaskFilterMenu(null);
      return;
    }

    const presetFilters = getPresetFilters(preset, user?.id);
    setSelectedAssigneeValues(presetFilters.assigneeValues);
    setSelectedStatusFilters(presetFilters.statusFilters);
    setSelectedDueFilters(presetFilters.dueFilters);
    setSelectedCompletionFilters(presetFilters.completionFilters);
    setOpenTaskFilterMenu(null);
    setPage(1);
  };

  const toggleAssigneeFilter = (value: AssigneeFilterValue) => {
    setSelectedAssigneeValues((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
    setPage(1);
  };

  const toggleStatusFilter = (value: TaskStatus) => {
    setSelectedStatusFilters((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
    setPage(1);
  };

  const toggleDueFilter = (value: TaskDueBucket) => {
    setSelectedDueFilters((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
    setPage(1);
  };

  const toggleCompletionFilter = (value: CompletionFilter) => {
    setSelectedCompletionFilters((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
    setPage(1);
  };

  const removeTaskFilter = (kind: 'assignee' | 'status' | 'due' | 'completion', value: string) => {
    if (kind === 'assignee') setSelectedAssigneeValues((current) => current.filter((item) => item !== value));
    if (kind === 'status') setSelectedStatusFilters((current) => current.filter((item) => item !== value));
    if (kind === 'due') setSelectedDueFilters((current) => current.filter((item) => item !== value));
    if (kind === 'completion') setSelectedCompletionFilters((current) => current.filter((item) => item !== value));
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
    const createdAssigneeValue = createdTaskInput.assigneeId ?? UNASSIGNED_ASSIGNEE_VALUE;
    const createdStatus = createdTaskInput.status ?? 'TODO';
    const createdCompletion: CompletionFilter = createdStatus === 'DONE' ? 'completed' : 'open';
    const createdTaskMayBeHidden =
      (selectedAssigneeValues.length > 0 && !selectedAssigneeValues.includes(createdAssigneeValue)) ||
      (selectedStatusFilters.length > 0 && !selectedStatusFilters.includes(createdStatus)) ||
      (selectedCompletionFilters.length > 0 && !selectedCompletionFilters.includes(createdCompletion)) ||
      selectedDueFilters.length > 0;

    try {
      await createTask(accessToken, createdTaskInput);
      resetCreateForm();
      setShowCreateForm(false);
      setPage(1);
      setCreateSuccess(
        createdTaskMayBeHidden
          ? 'Task created, but current filters may hide it. Clear filters if you do not see it.'
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

        <TaskKpiSummary
          collections={unfilteredTaskKpiCollections}
          onOpen={openTaskKpiModal}
        />

        <TaskFilterBar
          search={taskSearch}
          onSearchChange={(value) => {
            setTaskSearch(value);
            setPage(1);
          }}
          assigneeOptions={assigneeFilterOptions}
          selectedAssigneeValues={selectedAssigneeValues}
          selectedStatusFilters={selectedStatusFilters}
          selectedDueFilters={selectedDueFilters}
          selectedCompletionFilters={selectedCompletionFilters}
          activePreset={activeTaskPreset}
          activeSecondaryFilterCount={activeSecondaryFilterCount}
          moreFiltersOpen={moreTaskFiltersOpen}
          openMenu={openTaskFilterMenu}
          assigneeLabelsByValue={assigneeFilterLabelsByValue}
          onMoreFiltersToggle={() => setMoreTaskFiltersOpen((current) => !current)}
          onMenuToggle={(menu) => setOpenTaskFilterMenu((current) => (current === menu ? null : menu))}
          onAssigneeToggle={toggleAssigneeFilter}
          onStatusToggle={toggleStatusFilter}
          onDueToggle={toggleDueFilter}
          onCompletionToggle={toggleCompletionFilter}
          onPresetSelect={applyTaskPreset}
          onRemoveFilter={removeTaskFilter}
          onClear={handleClearTaskFilters}
        />

        <TaskViewToolbar viewMode={viewMode} taskCount={totalTasks} onChange={handleViewModeChange} />

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

        {createSuccess ? <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">{createSuccess}</p> : null}

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
            hasFilters={hasActiveTaskFilters || Boolean(taskSearch.trim())}
            onClear={handleClearTaskFilters}
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
        {openTaskKpi ? (
          <TaskKpiModal
            kpi={openTaskKpi}
            tasks={unfilteredTaskKpiCollections[openTaskKpi]}
            contactsById={contactsById}
            dealsById={dealsById}
            leadsById={leadsById}
            membershipsByUserId={membershipsByUserId}
            onClose={closeTaskKpiModal}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

type TaskKpiSummaryProps = {
  collections: Record<TaskKpiId, Task[]>;
  onOpen: (kpi: TaskKpiId, opener: HTMLButtonElement) => void;
};

function TaskKpiSummary({ collections, onOpen }: TaskKpiSummaryProps) {
  const items: TaskKpiId[] = ['overdue', 'today', 'inProgress', 'waiting'];

  return (
    <section aria-label="Task KPI summary">
      <div className="grid items-stretch gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
        {items.map((id) => {
          const count = collections[id].length;
          const copy = TASK_KPI_COPY[id];
          const tone = getTaskKpiTone(id, count);

          return (
            <button
              key={id}
              type="button"
              onClick={(event) => onOpen(id, event.currentTarget)}
              aria-label={`${copy.title}: ${formatTaskCount(count)}. Open ${copy.modalTitle.toLowerCase()}.`}
              className={getTaskKpiClassName(tone)}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">{copy.title}</span>
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${getTaskKpiAccentClassName(tone)}`} aria-hidden="true" />
              </span>
              <span className="mt-1.5 block text-2xl font-semibold leading-none text-gray-950">{formatNumber(count)}</span>
              <span className="mt-1.5 block text-xs leading-4 text-gray-600">{getTaskKpiHelper(id, count)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type TaskKpiModalProps = {
  kpi: TaskKpiId;
  tasks: Task[];
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  onClose: () => void;
};

function TaskKpiModal({
  kpi,
  tasks,
  contactsById,
  dealsById,
  leadsById,
  membershipsByUserId,
  onClose,
}: TaskKpiModalProps) {
  const copy = TASK_KPI_COPY[kpi];
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = `task-kpi-modal-${kpi}-title`;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

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
      aria-labelledby={titleId}
      onMouseDown={handleBackdropMouseDown}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 border-b border-gray-200 px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-gray-950">{copy.modalTitle}</h2>
              <p className="mt-1 text-sm text-gray-700">{getTaskKpiSubtitle(kpi, tasks.length)}</p>
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
        </div>

        <div className={['min-h-0 p-4 sm:px-5', tasks.length > 6 ? 'overflow-y-auto' : ''].join(' ')}>
          {tasks.length === 0 ? (
            <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{copy.empty}</p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <TaskKpiModalRow
                  key={task.id}
                  task={task}
                  contactsById={contactsById}
                  dealsById={dealsById}
                  leadsById={leadsById}
                  membershipsByUserId={membershipsByUserId}
                  onClose={onClose}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type TaskKpiModalRowProps = {
  task: Task;
  contactsById: Map<string, Contact>;
  dealsById: Map<string, Deal>;
  leadsById: Map<string, Lead>;
  membershipsByUserId: Map<string, MembershipOption>;
  onClose: () => void;
};

function TaskKpiModalRow({ task, contactsById, dealsById, leadsById, membershipsByUserId, onClose }: TaskKpiModalRowProps) {
  const entityLabel = getTaskEntityLabel(task, contactsById, dealsById, leadsById);
  const entityPath = getTaskEntityPath(task);
  const assigneeLabel = getTaskAssigneeLabel(task, membershipsByUserId);
  const dueStatus = getDueStatus(task);
  const priorityLabel = task.taskType === 'FOLLOW_UP' ? 'Follow-up' : null;

  return (
    <Link
      to={entityPath}
      onClick={onClose}
      className="group block rounded border border-gray-200 bg-white px-3 py-2.5 transition hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
      aria-label={`${task.title}. Open related ${ENTITY_LABELS[task.entityType].toLowerCase()} ${entityLabel}.`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={getEntityClassName(task.entityType)}>{ENTITY_LABELS[task.entityType]}</span>
            <span className={getDueClassName(dueStatus)}>{dueStatus.label}</span>
            <span className={getStatusClassName(task.status)}>{STATUS_LABELS[task.status]}</span>
            {priorityLabel ? <span className="rounded bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">{priorityLabel}</span> : null}
          </div>
          <h3 className="mt-2 break-words text-sm font-semibold text-gray-950">{task.title}</h3>
          <p className="mt-1 break-words text-sm text-gray-700">
            {ENTITY_LABELS[task.entityType]}: <span className="font-medium text-gray-900">{entityLabel}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
            {task.dueAt ? <span>Due {formatDateTime(task.dueAt)}</span> : null}
            <span>Assigned to {assigneeLabel}</span>
          </div>
        </div>
        <span className="mt-1 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-gray-700" aria-hidden="true">
          &rsaquo;
        </span>
      </div>
    </Link>
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

function TaskViewToolbar({ viewMode, taskCount, onChange }: TaskViewSwitcherProps & { taskCount: number }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <TaskViewSwitcher viewMode={viewMode} onChange={onChange} />
      <p className="px-2 text-sm text-gray-600">{formatTaskCount(taskCount)}</p>
    </div>
  );
}

type TaskFilterBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  assigneeOptions: Array<{ label: string; value: AssigneeFilterValue }>;
  selectedAssigneeValues: AssigneeFilterValue[];
  selectedStatusFilters: TaskStatus[];
  selectedDueFilters: TaskDueBucket[];
  selectedCompletionFilters: CompletionFilter[];
  activePreset: TaskPresetId;
  activeSecondaryFilterCount: number;
  moreFiltersOpen: boolean;
  openMenu: TaskFilterMenu | null;
  assigneeLabelsByValue: Map<string, string>;
  onMoreFiltersToggle: () => void;
  onMenuToggle: (menu: TaskFilterMenu) => void;
  onAssigneeToggle: (value: AssigneeFilterValue) => void;
  onStatusToggle: (value: TaskStatus) => void;
  onDueToggle: (value: TaskDueBucket) => void;
  onCompletionToggle: (value: CompletionFilter) => void;
  onPresetSelect: (value: TaskPresetId) => void;
  onRemoveFilter: (kind: 'assignee' | 'status' | 'due' | 'completion', value: string) => void;
  onClear: () => void;
};

function TaskFilterBar({
  search,
  onSearchChange,
  assigneeOptions,
  selectedAssigneeValues,
  selectedStatusFilters,
  selectedDueFilters,
  selectedCompletionFilters,
  activePreset,
  activeSecondaryFilterCount,
  moreFiltersOpen,
  openMenu,
  assigneeLabelsByValue,
  onMoreFiltersToggle,
  onMenuToggle,
  onAssigneeToggle,
  onStatusToggle,
  onDueToggle,
  onCompletionToggle,
  onPresetSelect,
  onRemoveFilter,
  onClear,
}: TaskFilterBarProps) {
  const hasSelections =
    selectedAssigneeValues.length > 0 ||
    selectedStatusFilters.length > 0 ||
    selectedDueFilters.length > 0 ||
    selectedCompletionFilters.length > 0;

  return (
    <section className="overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm" aria-label="Task filters">
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_minmax(220px,260px)_minmax(180px,220px)_auto] xl:items-center xl:px-6">
        <label className="relative block">
          <span className="sr-only">Search tasks</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search title, related lead, contact, email or phone..."
            className="h-12 w-full rounded-lg border border-gray-300 bg-white pl-12 pr-4 text-sm font-medium text-gray-900 shadow-sm placeholder:text-gray-500 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-100"
          />
        </label>

        <TaskFilterDropdown
          id="task-assignee-filter"
          title="Assignee"
          valueLabel={selectedCountLabel(selectedAssigneeValues.length)}
          open={openMenu === 'assignee'}
          onToggle={() => onMenuToggle('assignee')}
        >
          {assigneeOptions.map((option) => (
            <TaskFilterCheckbox
              key={option.value}
              label={option.label}
              checked={selectedAssigneeValues.includes(option.value)}
              onChange={() => onAssigneeToggle(option.value)}
            />
          ))}
        </TaskFilterDropdown>

        <button
          type="button"
          onClick={onMoreFiltersToggle}
          className="flex h-12 w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-100"
          aria-expanded={moreFiltersOpen}
          aria-controls="task-secondary-filters"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ListFilter className="h-5 w-5 shrink-0 text-gray-600" aria-hidden="true" />
            <span className="truncate">More filters</span>
            {activeSecondaryFilterCount > 0 ? <span className="text-gray-500">&middot; {activeSecondaryFilterCount}</span> : null}
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-gray-600 transition-transform ${moreFiltersOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onClear}
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-100"
        >
          <RotateCcw className="h-4 w-4 text-gray-600" aria-hidden="true" />
          Clear all
        </button>
      </div>

      {moreFiltersOpen ? (
        <div id="task-secondary-filters" className="border-t border-gray-200 p-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <TaskFilterDropdown
              id="task-status-filter"
              title="Status"
              valueLabel={selectedCountLabel(selectedStatusFilters.length)}
              open={openMenu === 'status'}
              onToggle={() => onMenuToggle('status')}
            >
              {TASK_STATUS_OPTIONS.map((option) => (
                <TaskFilterCheckbox
                  key={option.value}
                  label={option.label}
                  checked={selectedStatusFilters.includes(option.value)}
                  onChange={() => onStatusToggle(option.value)}
                />
              ))}
            </TaskFilterDropdown>

            <TaskFilterDropdown
              id="task-due-filter"
              title="Due"
              valueLabel={selectedCountLabel(selectedDueFilters.length)}
              open={openMenu === 'due'}
              onToggle={() => onMenuToggle('due')}
            >
              {TASK_DUE_OPTIONS.map((option) => (
                <TaskFilterCheckbox
                  key={option.value}
                  label={option.label}
                  checked={selectedDueFilters.includes(option.value)}
                  onChange={() => onDueToggle(option.value)}
                />
              ))}
            </TaskFilterDropdown>

            <TaskFilterDropdown
              id="task-completion-filter"
              title="Completion"
              valueLabel={selectedCountLabel(selectedCompletionFilters.length)}
              open={openMenu === 'completion'}
              onToggle={() => onMenuToggle('completion')}
            >
              {TASK_COMPLETION_OPTIONS.map((option) => (
                <TaskFilterCheckbox
                  key={option.value}
                  label={option.label}
                  checked={selectedCompletionFilters.includes(option.value)}
                  onChange={() => onCompletionToggle(option.value)}
                />
              ))}
            </TaskFilterDropdown>

            <TaskFilterDropdown
              id="task-preset-filter"
              title="Preset"
              valueLabel={getTaskPresetLabel(activePreset)}
              open={openMenu === 'preset'}
              onToggle={() => onMenuToggle('preset')}
            >
              {TASK_PRESET_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onPresetSelect(option.value)}
                  disabled={option.value === 'CUSTOM'}
                  className={[
                    'flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1 disabled:cursor-default disabled:opacity-70',
                    activePreset === option.value ? 'bg-gray-900 text-white' : 'text-gray-800 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {option.label}
                  {activePreset === option.value ? <span aria-hidden="true">&check;</span> : null}
                </button>
              ))}
            </TaskFilterDropdown>
          </div>
        </div>
      ) : null}

      {hasSelections ? (
        <div className="border-t border-gray-200 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <p className="shrink-0 text-sm font-semibold text-gray-900">Selected filters</p>
            <div className="flex flex-wrap items-center gap-2">
              {selectedAssigneeValues.map((value) => (
                <TaskSelectedFilterChip key={value} label={assigneeLabelsByValue.get(value) ?? 'Selected assignee'} onRemove={() => onRemoveFilter('assignee', value)} />
              ))}
              {selectedStatusFilters.map((value) => (
                <TaskSelectedFilterChip key={value} label={STATUS_LABELS[value]} onRemove={() => onRemoveFilter('status', value)} />
              ))}
              {selectedDueFilters.map((value) => (
                <TaskSelectedFilterChip key={value} label={getDueLabel(value)} tone={value === 'overdue' ? 'danger' : value === 'today' ? 'warm' : 'neutral'} onRemove={() => onRemoveFilter('due', value)} />
              ))}
              {selectedCompletionFilters.map((value) => (
                <TaskSelectedFilterChip key={value} label={getCompletionLabel(value)} onRemove={() => onRemoveFilter('completion', value)} />
              ))}
              <button
                type="button"
                onClick={onClear}
                className="h-9 rounded-lg px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TaskFilterDropdown({
  id,
  title,
  valueLabel,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  valueLabel: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        onToggle();
      }
    }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-100"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-haspopup="menu"
      >
        <span className="min-w-0 truncate">
          {title} <span className="text-gray-500">&middot;</span> <span className="text-gray-700">{valueLabel}</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div id={`${id}-menu`} className="absolute left-0 top-full z-30 mt-2 max-h-72 w-full min-w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg" role="menu">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function TaskFilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
      />
      <span>{label}</span>
    </label>
  );
}

function selectedPillClass(tone: 'neutral' | 'danger' | 'warm' = 'neutral') {
  if (tone === 'danger') return 'bg-red-50 text-red-700';
  if (tone === 'warm') return 'bg-amber-50 text-amber-800';
  return 'bg-gray-100 text-gray-800';
}

function TaskSelectedFilterChip({ label, tone = 'neutral', onRemove }: { label: string; tone?: 'neutral' | 'danger' | 'warm'; onRemove: () => void }) {
  return (
    <span className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold ${selectedPillClass(tone)}`}>
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-current hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1"
        aria-label={`Remove ${label} filter`}
      >
        x
      </button>
    </span>
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
  hasFilters: boolean;
  onClear: () => void;
  onCreate: () => void;
};

function EmptyTasksState({
  hasFilters,
  onClear,
  onCreate,
}: EmptyTasksStateProps) {
  const title = hasFilters ? 'No tasks match these filters' : 'No tasks found';
  const message = hasFilters ? 'Try changing or clearing your filters.' : 'Create the first task to start tracking follow-up work.';

  return (
    <div className="rounded border border-gray-200 bg-white p-8 text-center">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm text-gray-600">{message}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {hasFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Clear filters
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
