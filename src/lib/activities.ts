// src/lib/activities.ts — demo mode
import type { EntityType } from './notes';

export const ACTIVITIES_PATH = '/api/activities';

export type Activity = {
  id: string;
  entityType: EntityType;
  entityId: string;
  actorId: string | null;
  action: string;
  payload: unknown;
  createdAt: string;
};

export type ActivityFilters = {
  entityType?: EntityType;
  entityId?: string;
  action?: string;
  page?: number;
  limit?: number;
};

export type ActivitiesResponse = {
  data: Activity[];
  total: number;
  page: number;
  limit: number;
};

const DEMO_ACTIVITY_DATA: Activity[] = [
  {
    id: 'act-001',
    entityType: 'CONTACT',
    entityId: 'cnt-001',
    actorId: 'usr-demo-1',
    action: 'NOTE_ADDED',
    payload: {},
    createdAt: '2024-09-02T10:00:00.000Z',
  },
  {
    id: 'act-002',
    entityType: 'DEAL',
    entityId: 'dea-001',
    actorId: 'usr-demo-1',
    action: 'STAGE_CHANGED',
    payload: {},
    createdAt: '2024-10-02T10:00:00.000Z',
  },
];

export function listActivities(_token: string, filters: ActivityFilters = {}): Promise<ActivitiesResponse> {
  let data = [...DEMO_ACTIVITY_DATA];
  if (filters.entityType) data = data.filter(a => a.entityType === filters.entityType);
  if (filters.entityId) data = data.filter(a => a.entityId === filters.entityId);
  return Promise.resolve({ data, total: data.length, page: filters.page ?? 1, limit: filters.limit ?? 20 });
}
