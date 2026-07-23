// src/lib/activities.ts - demo mode
import { DEMO_ACTIVITIES } from './mock-data';
import type { EntityType } from './notes';

export const ACTIVITIES_PATH = '/api/activities';
const ACTIVITIES_CHANGED_EVENT = 'alozix-demo-activities-changed';
export const ACTIVITY_COMMENT_MAX_LENGTH = 300;

export type ActivityActorType = 'USER' | 'AUTOMATION' | 'SYSTEM';
export type ActivityKind = 'CHANGE' | 'COMMENT';

export type ActivityChange = {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
};

export type Activity = {
  id: string;
  entityType: EntityType;
  entityId: string;
  actorId: string | null;
  actorType: ActivityActorType;
  actorDisplayName: string;
  kind: ActivityKind;
  action: string;
  payload: unknown;
  changes: ActivityChange[] | null;
  comment: string | null;
  reason: string | null;
  parentActivityId: string | null;
  relatedTaskId: string | null;
  companyId: string;
  createdAt: string;
  editedAt: string | null;
};

export type ActivityFilters = {
  entityType?: EntityType;
  entityId?: string;
  action?: string;
  kind?: ActivityKind;
  page?: number;
  limit?: number;
};

export type ActivitiesResponse = {
  data: Activity[];
  total: number;
  page: number;
  limit: number;
};

export type ActivityActorInput = {
  actorId?: string | null;
  actorType?: ActivityActorType;
  actorDisplayName?: string;
};

export type RecordActivityInput = ActivityActorInput & {
  entityType: EntityType;
  entityId: string;
  action: string;
  payload?: unknown;
  changes?: ActivityChange[] | null;
  comment?: string | null;
  reason?: string | null;
  relatedTaskId?: string | null;
  companyId?: string;
  createdAt?: string;
};

export type CreateCommentOptions = ActivityActorInput & {
  parentActivityId?: string | null;
  relatedTaskId?: string | null;
  companyId?: string;
  createdAt?: string;
};

let activitySequence = Date.now();
let demoActivities = DEMO_ACTIVITIES.map(normalizeActivity);

function cloneChange(change: ActivityChange): ActivityChange {
  return { ...change };
}

function cloneActivity(activity: Activity): Activity {
  return {
    ...activity,
    changes: activity.changes ? activity.changes.map(cloneChange) : null,
    payload: clonePayload(activity.payload),
  };
}

function clonePayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(payload);
    } catch {
      return payload;
    }
  }

  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return payload;
  }
}

function nextActivityId() {
  activitySequence += 1;
  return `act-demo-${activitySequence}`;
}

function defaultActorDisplayName(actorType: ActivityActorType, actorId: string | null) {
  if (actorType === 'AUTOMATION') return 'Automation';
  if (actorType === 'SYSTEM') return 'System';
  return actorId ? 'Demo User' : 'System';
}

function normalizeActor(input: ActivityActorInput) {
  const actorType = input.actorType ?? (input.actorId === null ? 'SYSTEM' : 'USER');
  const actorId = actorType === 'USER' ? input.actorId ?? 'usr-demo-1' : null;
  const actorDisplayName = input.actorDisplayName?.trim() || defaultActorDisplayName(actorType, actorId);

  return { actorId, actorType, actorDisplayName };
}

function normalizeActivity(rawActivity: Activity): Activity {
  const actor = normalizeActor(rawActivity);
  const kind = rawActivity.kind ?? 'CHANGE';
  const changes = rawActivity.changes ?? getChangesFromPayload(rawActivity.payload);
  const parentActivityId = kind === 'COMMENT' ? rawActivity.parentActivityId ?? null : null;

  return {
    ...rawActivity,
    actorId: actor.actorId,
    actorType: actor.actorType,
    actorDisplayName: actor.actorDisplayName,
    kind,
    payload: clonePayload(rawActivity.payload ?? {}),
    changes: changes ? changes.map(cloneChange) : null,
    comment: rawActivity.comment ?? null,
    reason: rawActivity.reason ?? null,
    parentActivityId,
    relatedTaskId: rawActivity.relatedTaskId ?? null,
    companyId: rawActivity.companyId ?? 'cmp-demo',
    editedAt: rawActivity.editedAt ?? null,
  };
}

function getChangesFromPayload(payload: unknown): ActivityChange[] | null {
  if (!payload || typeof payload !== 'object' || !('changes' in payload)) {
    return null;
  }

  const changes = (payload as { changes?: unknown }).changes;
  if (!Array.isArray(changes)) {
    return null;
  }

  return changes.flatMap((change) => {
    if (!change || typeof change !== 'object') {
      return [];
    }

    const candidate = change as Partial<ActivityChange>;
    if (typeof candidate.field !== 'string' || typeof candidate.label !== 'string') {
      return [];
    }

    return [{
      field: candidate.field,
      label: candidate.label,
      from: candidate.from,
      to: candidate.to,
    }];
  });
}

function notifyActivitiesChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ACTIVITIES_CHANGED_EVENT));
  }
}

export function subscribeToActivityChanges(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(ACTIVITIES_CHANGED_EVENT, listener);
  return () => window.removeEventListener(ACTIVITIES_CHANGED_EVENT, listener);
}

export function listActivities(_token: string, filters: ActivityFilters = {}): Promise<ActivitiesResponse> {
  let data = demoActivities.map(cloneActivity);
  if (filters.entityType) data = data.filter((activity) => activity.entityType === filters.entityType);
  if (filters.entityId) data = data.filter((activity) => activity.entityId === filters.entityId);
  if (filters.action) data = data.filter((activity) => activity.action === filters.action);
  if (filters.kind) data = data.filter((activity) => activity.kind === filters.kind);

  data = data.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const total = data.length;
  const start = (page - 1) * limit;

  return Promise.resolve({ data: data.slice(start, start + limit), total, page, limit });
}

export function recordActivity(input: RecordActivityInput): Activity {
  const actor = normalizeActor(input);
  const changes = input.changes ? input.changes.map(cloneChange) : null;
  const payload = input.payload ?? (changes ? { changes } : {});
  const activity: Activity = {
    id: nextActivityId(),
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: actor.actorId,
    actorType: actor.actorType,
    actorDisplayName: actor.actorDisplayName,
    kind: 'CHANGE',
    action: input.action,
    payload: clonePayload(payload),
    changes,
    comment: trimOptional(input.comment),
    reason: trimOptional(input.reason),
    parentActivityId: null,
    relatedTaskId: input.relatedTaskId ?? null,
    companyId: input.companyId ?? 'cmp-demo',
    createdAt: input.createdAt ?? new Date().toISOString(),
    editedAt: null,
  };

  demoActivities = [activity, ...demoActivities];
  notifyActivitiesChanged();
  return cloneActivity(activity);
}

export function createComment(entityType: EntityType, entityId: string, body: string, options: CreateCommentOptions = {}): Activity {
  const comment = body.trim();
  if (!comment) {
    throw new Error('Comment cannot be empty.');
  }

  if (comment.length > ACTIVITY_COMMENT_MAX_LENGTH) {
    throw new Error(`Comment cannot exceed ${ACTIVITY_COMMENT_MAX_LENGTH} characters.`);
  }

  const parentActivityId = options.parentActivityId ?? null;
  const parentActivity = parentActivityId ? demoActivities.find((activity) => activity.id === parentActivityId) : null;

  if (parentActivityId) {
    if (!parentActivity) {
      throw new Error('Parent activity was not found.');
    }

    if (parentActivity.kind !== 'CHANGE') {
      throw new Error('Comments can only be linked to change activities.');
    }

    if (parentActivity.entityType !== entityType || parentActivity.entityId !== entityId) {
      throw new Error('Linked comments must belong to the same entity as their parent activity.');
    }
  }

  const actor = normalizeActor(options);
  const activity: Activity = {
    id: nextActivityId(),
    entityType,
    entityId,
    actorId: actor.actorId,
    actorType: actor.actorType,
    actorDisplayName: actor.actorDisplayName,
    kind: 'COMMENT',
    action: 'comment.created',
    payload: {},
    changes: null,
    comment,
    reason: null,
    parentActivityId,
    relatedTaskId: options.relatedTaskId ?? parentActivity?.relatedTaskId ?? null,
    companyId: options.companyId ?? parentActivity?.companyId ?? 'cmp-demo',
    createdAt: options.createdAt ?? new Date().toISOString(),
    editedAt: null,
  };

  demoActivities = [activity, ...demoActivities];
  notifyActivitiesChanged();
  return cloneActivity(activity);
}

function trimOptional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
