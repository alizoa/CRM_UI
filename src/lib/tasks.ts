// src/lib/tasks.ts — demo mode
import { ACTIVITY_COMMENT_MAX_LENGTH, recordActivity, type ActivityActorType, type ActivityChange, type ActivityChangeSource } from './activities';
import type { ChangeDocumentationAction } from './change-documentation-settings';
import { DEMO_MEMBERSHIPS, DEMO_TASKS } from './mock-data';

export const TASKS_PATH = '/api/tasks';
const TASKS_CHANGED_EVENT = 'alozix-demo-tasks-changed';

export type EntityType = 'CONTACT' | 'DEAL' | 'LEAD';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'WAITING' | 'DONE';
export type TaskType = 'FOLLOW_UP' | 'GENERAL';

export type Task = {
  id: string;
  taskType: TaskType;
  entityType: EntityType;
  entityId: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  status: TaskStatus;
  completedAt: string | null;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
  entitySummary?: {
    id: string;
    type: EntityType;
    displayName: string;
    status?: string | null;
    temperature?: string | null;
  } | null;
  assigneeSummary?: {
    id: string;
    displayName: string;
    email: string;
  } | null;
};

export type TaskDueBucket = 'overdue' | 'today' | 'upcoming' | 'no_due_date';

export type TaskFilters = {
  entityType?: EntityType;
  entityId?: string;
  assigneeId?: string;
  completed?: boolean;
  status?: TaskStatus;
  dueBucket?: TaskDueBucket;
  page?: number;
  from?: string;
  to?: string;
  limit?: number;
};

export type TasksResponse = {
  data: Task[];
  total: number;
  page: number;
  limit: number;
};

export type CreateTaskInput = {
  taskType?: TaskType;
  entityType: EntityType;
  entityId: string;
  title: string;
  description?: string;
  dueAt?: string | null;
  status?: TaskStatus;
  assigneeId?: string | null;
};

export type UpdateTaskInput = {
  taskType?: TaskType;
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  status?: TaskStatus;
  assigneeId?: string | null;
};

export type TaskMutationContext = {
  actorId?: string | null;
  actorDisplayName?: string;
  actorType?: ActivityActorType;
  source?: ActivityChangeSource;
  comment?: string | null;
};

export type TaskMutationUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
} | null;

export type TaskActivityAction =
  | 'task.created'
  | 'task.updated'
  | 'task.status_changed'
  | 'task.assigned'
  | 'task.rescheduled'
  | 'task.completed'
  | 'task.reopened';

export type TaskActivityPreview = {
  action: TaskActivityAction;
  changes: ActivityChange[];
  documentationActions: ChangeDocumentationAction[];
  isDirectLeadTask: boolean;
};

type TaskUpdateOptions = {
  action?: TaskActivityAction;
  documentationActions?: ChangeDocumentationAction[];
  allowCompletionTransition?: boolean;
};

let demoTasks = DEMO_TASKS.map((task) => ({ ...task })) as Task[];

const DETAIL_FIELDS: Array<keyof UpdateTaskInput> = ['taskType', 'title', 'description'];

function trimOptional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validateDocumentation(context: TaskMutationContext | undefined) {
  const comment = trimOptional(context?.comment);
  if (comment && comment.length > ACTIVITY_COMMENT_MAX_LENGTH) {
    throw Object.assign(new Error(`Comment cannot exceed ${ACTIVITY_COMMENT_MAX_LENGTH} characters.`), { status: 422 });
  }
  return { comment };
}

function isDirectLeadTask(task: Pick<Task, 'entityType' | 'entityId'>) {
  return task.entityType === 'LEAD' && Boolean(task.entityId.trim());
}

function getMembershipDisplayName(userId: string | null) {
  if (!userId) return 'Unassigned';
  const membership = DEMO_MEMBERSHIPS.find((item) => item.userId === userId);
  if (!membership) return 'Unknown user';
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function formatActivityDate(value: string | null | undefined) {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function normalizeComparable(value: unknown) {
  return value === undefined || value === '' ? null : value;
}

function valuesEqual(left: unknown, right: unknown) {
  return normalizeComparable(left) === normalizeComparable(right);
}

function taskFieldLabel(field: keyof Task | keyof UpdateTaskInput) {
  const labels: Partial<Record<keyof Task | keyof UpdateTaskInput, string>> = {
    taskType: 'Task type',
    title: 'Title',
    description: 'Description',
    dueAt: 'Due date',
    status: 'Status',
    assigneeId: 'Assignee',
  };
  return labels[field] ?? field;
}

function taskDisplayValue(field: keyof Task | keyof UpdateTaskInput, value: unknown) {
  if (field === 'assigneeId') return getMembershipDisplayName(value as string | null);
  if (field === 'dueAt') return formatActivityDate(value as string | null);
  if (value === null || value === undefined || value === '') return 'Not set';
  return value;
}

function buildTaskChange(field: keyof Task | keyof UpdateTaskInput, from: unknown, to: unknown): ActivityChange | null {
  if (valuesEqual(from, to)) return null;
  return {
    field,
    label: taskFieldLabel(field),
    from: taskDisplayValue(field, from),
    to: taskDisplayValue(field, to),
  };
}

function getTaskUpdateFields(input: UpdateTaskInput): Array<keyof Task | keyof UpdateTaskInput> {
  const fields: Array<keyof Task | keyof UpdateTaskInput> = [];
  if (input.status !== undefined) fields.push('status');
  if (input.assigneeId !== undefined) fields.push('assigneeId');
  if (input.dueAt !== undefined) fields.push('dueAt');
  for (const field of DETAIL_FIELDS) {
    if (input[field] !== undefined) fields.push(field);
  }
  return Array.from(new Set(fields));
}

function getDocumentationActionForField(field: string): ChangeDocumentationAction {
  if (field === 'status') return 'task.status_changed';
  if (field === 'assigneeId') return 'task.assignee_changed';
  if (field === 'dueAt') return 'task.due_date_changed';
  return 'task.detail_changed';
}

function uniqueDocumentationActions(changes: ActivityChange[]) {
  return Array.from(new Set(changes.map((change) => getDocumentationActionForField(change.field)))) as ChangeDocumentationAction[];
}

function classifyTaskUpdateAction(changes: ActivityChange[]): TaskActivityAction {
  if (changes.length === 1 && changes[0].field === 'status') return 'task.status_changed';
  if (changes.length === 1 && changes[0].field === 'assigneeId') return 'task.assigned';
  if (changes.length === 1 && changes[0].field === 'dueAt') return 'task.rescheduled';
  return 'task.updated';
}

function buildNextTask(current: Task, input: UpdateTaskInput, now: string): Task {
  const status = input.status ?? current.status;
  return {
    ...current,
    ...input,
    status,
    completedAt: status === 'DONE' ? current.completedAt ?? now : null,
    updatedAt: now,
  };
}

function diffTasks(current: Task, next: Task, fields: Array<keyof Task | keyof UpdateTaskInput>): ActivityChange[] {
  return fields.flatMap((field) => {
    const change = buildTaskChange(field, current[field as keyof Task], next[field as keyof Task]);
    return change ? [change] : [];
  });
}

function previewTaskUpdateInternal(task: Task, input: UpdateTaskInput, options: TaskUpdateOptions = {}): TaskActivityPreview {
  const next = buildNextTask(task, input, new Date().toISOString());
  const changes = diffTasks(task, next, getTaskUpdateFields(input));
  return {
    action: options.action ?? classifyTaskUpdateAction(changes),
    changes,
    documentationActions: options.documentationActions ?? uniqueDocumentationActions(changes),
    isDirectLeadTask: isDirectLeadTask(task),
  };
}

function validateCompletionTransition(current: Task, input: UpdateTaskInput, options: TaskUpdateOptions) {
  if (options.allowCompletionTransition) return;
  if (input.status === 'DONE') throw Object.assign(new Error('Use completeTask to complete a task.'), { status: 422 });
  if (current.status === 'DONE' && input.status !== undefined) {
    throw Object.assign(new Error('Use reopenTask to reopen a completed task.'), { status: 422 });
  }
}

function buildTaskCreatedChanges(task: Task): ActivityChange[] {
  const changes: ActivityChange[] = [
    { field: 'title', label: 'Title', from: 'Not set', to: task.title },
    { field: 'status', label: 'Status', from: 'Not set', to: task.status },
  ];
  for (const field of ['dueAt', 'assigneeId', 'description'] as const) {
    const change = buildTaskChange(field, null, task[field]);
    if (change) changes.push(change);
  }
  return changes;
}

export function buildTaskMutationContext(
  user: TaskMutationUser,
  source: ActivityChangeSource,
  documentation?: Pick<TaskMutationContext, 'comment'>,
): TaskMutationContext {
  return {
    actorId: user?.id ?? null,
    actorDisplayName: user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email : 'System',
    actorType: user ? 'USER' : 'SYSTEM',
    source,
    ...documentation,
  };
}

export function previewTaskUpdate(task: Task, input: UpdateTaskInput): TaskActivityPreview {
  return previewTaskUpdateInternal(task, input);
}

export function previewTaskStatusChange(task: Task, status: TaskStatus): TaskActivityPreview {
  return previewTaskUpdateInternal(task, { status });
}

export function previewTaskComplete(task: Task): TaskActivityPreview {
  return previewTaskUpdateInternal(task, { status: 'DONE' }, {
    action: 'task.completed',
    documentationActions: ['task.complete_reopen'],
    allowCompletionTransition: true,
  });
}

export function previewTaskReopen(task: Task): TaskActivityPreview {
  return previewTaskUpdateInternal(task, { status: 'TODO' }, {
    action: 'task.reopened',
    documentationActions: ['task.complete_reopen'],
    allowCompletionTransition: true,
  });
}

function maybeRecordTaskActivity(task: Task, action: TaskActivityAction, changes: ActivityChange[], context: TaskMutationContext, comment: string | null) {
  if (!isDirectLeadTask(task) || changes.length === 0) return;
  recordActivity({
    entityType: 'LEAD',
    entityId: task.entityId,
    relatedTaskId: task.id,
    action,
    changes,
    payload: { source: context.source ?? 'system' },
    comment,
    reason: null,
    actorId: context.actorId,
    actorType: context.actorType,
    actorDisplayName: context.actorDisplayName,
  });
}

function notifyTasksChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
  }
}

export function subscribeToTaskChanges(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(TASKS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(TASKS_CHANGED_EVENT, listener);
}

export function isOpenFollowUpTask(task: Task) {
  return task.entityType === 'LEAD'
    && task.taskType === 'FOLLOW_UP'
    && task.status !== 'DONE'
    && task.status !== ('CANCELLED' as TaskStatus)
    && Boolean(task.dueAt);
}

export function getNextFollowUpTask(leadId: string, tasks: Task[]): Task | null {
  return tasks
    .filter((task) => task.entityId === leadId && isOpenFollowUpTask(task))
    .sort((a, b) => {
      const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    })[0] ?? null;
}

export function getLeadNextFollowUpTask(leadId: string): Task | null {
  return getNextFollowUpTask(leadId, demoTasks);
}

export function getLeadNextFollowUp(leadId: string) {
  return getLeadNextFollowUpTask(leadId)?.dueAt ?? null;
}

export function listTasks(_token: string, filters: TaskFilters = {}): Promise<TasksResponse> {
  let data = [...demoTasks];
  if (filters.entityType) data = data.filter(t => t.entityType === filters.entityType);
  if (filters.entityId) data = data.filter(t => t.entityId === filters.entityId);
  if (filters.assigneeId) data = data.filter(t => t.assigneeId === filters.assigneeId);
  if (filters.status) data = data.filter(t => t.status === filters.status);
  if (filters.completed !== undefined) {
    data = data.filter(t => filters.completed ? t.status === 'DONE' : t.status !== 'DONE');
  }
  if (filters.dueBucket) {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(todayStart.getDate() + 1);

    data = data.filter((task) => {
      if (filters.dueBucket === 'no_due_date') return !task.dueAt;
      if (!task.dueAt) return false;

      const dueDate = new Date(task.dueAt);
      if (Number.isNaN(dueDate.getTime())) return filters.dueBucket === 'upcoming';

      if (filters.dueBucket === 'overdue') return dueDate < todayStart && task.status !== 'DONE';
      if (filters.dueBucket === 'today') return dueDate >= todayStart && dueDate < tomorrowStart;
      return dueDate >= tomorrowStart;
    });
  }
  if (filters.from) data = data.filter(t => t.dueAt && new Date(t.dueAt).getTime() >= new Date(filters.from ?? '').getTime());
  if (filters.to) data = data.filter(t => t.dueAt && new Date(t.dueAt).getTime() < new Date(filters.to ?? '').getTime());

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const total = data.length;
  const start = (page - 1) * limit;

  return Promise.resolve({ data: data.slice(start, start + limit), total, page, limit });
}

export function createTask(_token: string, input: CreateTaskInput, context: TaskMutationContext = {}): Promise<Task> {
  const documentation = validateDocumentation(context);
  const now = new Date().toISOString();
  const task: Task = {
    id: `tsk-demo-${Date.now()}`,
    taskType: input.taskType ?? 'GENERAL',
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title,
    description: input.description ?? null,
    dueAt: input.dueAt ?? null,
    status: input.status ?? 'TODO',
    completedAt: input.status === 'DONE' ? now : null,
    assigneeId: input.assigneeId ?? null,
    createdAt: now,
    updatedAt: now,
    entitySummary: null,
    assigneeSummary: null,
  };
  demoTasks = [task, ...demoTasks];
  maybeRecordTaskActivity(task, 'task.created', buildTaskCreatedChanges(task), context, documentation.comment);
  notifyTasksChanged();
  return Promise.resolve(task);
}

function applyTaskUpdate(_token: string, id: string, input: UpdateTaskInput, context: TaskMutationContext = {}, options: TaskUpdateOptions = {}): Promise<Task> {
  const index = demoTasks.findIndex(t => t.id === id);
  if (index < 0) return Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));
  const current = demoTasks[index];
  validateCompletionTransition(current, input, options);
  const documentation = validateDocumentation(context);
  const next = buildNextTask(current, input, new Date().toISOString());
  const preview = previewTaskUpdateInternal(current, input, options);
  if (preview.changes.length === 0) {
    return Promise.resolve(current);
  }
  demoTasks = demoTasks.map((task) => (task.id === id ? next : task));
  maybeRecordTaskActivity(next, preview.action, preview.changes, context, documentation.comment);
  notifyTasksChanged();
  return Promise.resolve(next);
}

export function updateTask(_token: string, id: string, input: UpdateTaskInput, context?: TaskMutationContext): Promise<Task> {
  return applyTaskUpdate(_token, id, input, context);
}

export function updateTaskStatus(token: string, id: string, status: TaskStatus, context?: TaskMutationContext): Promise<Task> {
  return updateTask(token, id, { status }, context);
}

export function completeTask(_token: string, _id: string, context?: TaskMutationContext): Promise<Task> {
  return applyTaskUpdate(_token, _id, { status: 'DONE' }, context, {
    action: 'task.completed',
    documentationActions: ['task.complete_reopen'],
    allowCompletionTransition: true,
  });
}

export function reopenTask(_token: string, _id: string, context?: TaskMutationContext): Promise<Task> {
  return applyTaskUpdate(_token, _id, { status: 'TODO' }, context, {
    action: 'task.reopened',
    documentationActions: ['task.complete_reopen'],
    allowCompletionTransition: true,
  });
}
