// src/lib/tasks.ts — demo mode
import { DEMO_TASKS } from './mock-data';

export const TASKS_PATH = '/api/tasks';

export type EntityType = 'CONTACT' | 'DEAL' | 'LEAD';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'WAITING' | 'DONE';

export type Task = {
  id: string;
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
  entityType: EntityType;
  entityId: string;
  title: string;
  description?: string;
  dueAt?: string | null;
  status?: TaskStatus;
  assigneeId?: string | null;
};

export type UpdateTaskInput = {
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  status?: TaskStatus;
  assigneeId?: string | null;
};

export function listTasks(_token: string, filters: TaskFilters = {}): Promise<TasksResponse> {
  let data = [...DEMO_TASKS] as Task[];
  if (filters.entityType) data = data.filter(t => t.entityType === filters.entityType);
  if (filters.entityId) data = data.filter(t => t.entityId === filters.entityId);
  if (filters.status) data = data.filter(t => t.status === filters.status);
  if (filters.completed !== undefined) {
    data = data.filter(t => filters.completed ? t.status === 'DONE' : t.status !== 'DONE');
  }
  return Promise.resolve({ data, total: data.length, page: filters.page ?? 1, limit: filters.limit ?? 20 });
}

export function createTask(_token: string, _input: CreateTaskInput): Promise<Task> {
  return Promise.resolve(DEMO_TASKS[0] as Task);
}

export function updateTask(_token: string, id: string, _input: UpdateTaskInput): Promise<Task> {
  return Promise.resolve((DEMO_TASKS.find(t => t.id === id) ?? DEMO_TASKS[0]) as Task);
}

export function updateTaskStatus(token: string, id: string, status: TaskStatus): Promise<Task> {
  return updateTask(token, id, { status });
}

export function completeTask(_token: string, _id: string): Promise<Task> {
  return Promise.resolve({ ...(DEMO_TASKS[0] as Task), status: 'DONE' as const, completedAt: new Date().toISOString() });
}

export function reopenTask(_token: string, _id: string): Promise<Task> {
  return Promise.resolve({ ...(DEMO_TASKS[0] as Task), status: 'TODO' as const, completedAt: null });
}
