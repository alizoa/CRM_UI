// src/lib/tasks.ts — demo mode
import { DEMO_TASKS } from './mock-data';

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

let demoTasks = DEMO_TASKS.map((task) => ({ ...task })) as Task[];

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

export function createTask(_token: string, input: CreateTaskInput): Promise<Task> {
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
  notifyTasksChanged();
  return Promise.resolve(task);
}

export function updateTask(_token: string, id: string, input: UpdateTaskInput): Promise<Task> {
  const index = demoTasks.findIndex(t => t.id === id);
  if (index < 0) return Promise.reject(Object.assign(new Error('Not found'), { status: 404 }));
  const current = demoTasks[index];
  const status = input.status ?? current.status;
  const next: Task = {
    ...current,
    ...input,
    status,
    completedAt: status === 'DONE' ? current.completedAt ?? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  };
  demoTasks = demoTasks.map((task) => (task.id === id ? next : task));
  notifyTasksChanged();
  return Promise.resolve(next);
}

export function updateTaskStatus(token: string, id: string, status: TaskStatus): Promise<Task> {
  return updateTask(token, id, { status });
}

export function completeTask(_token: string, _id: string): Promise<Task> {
  return updateTask(_token, _id, { status: 'DONE' });
}

export function reopenTask(_token: string, _id: string): Promise<Task> {
  return updateTask(_token, _id, { status: 'TODO' });
}
