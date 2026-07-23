import type { ActivityChange } from './activities';

export type ChangeSummaryItem = {
  field: string;
  label: string;
  from: string;
  to: string;
};

const EMPTY_DISPLAY_VALUE = 'Not set';

const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  FOLLOW_UP_NEEDED: 'Follow-up Needed',
  LOST: 'Lost',
  WON: 'Won',
};

const LEAD_TEMPERATURE_LABELS: Record<string, string> = {
  HOT: 'Hot',
  WARM: 'Warm',
  COLD: 'Cold',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  WAITING: 'Waiting',
  DONE: 'Done',
};

export function formatEmptyActivityValue(value: unknown, fallback = EMPTY_DISPLAY_VALUE): string {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string' && !value.trim()) {
    return fallback;
  }

  return String(value);
}

export function formatBooleanActivityValue(value: boolean): string {
  return value ? 'Yes' : 'No';
}

export function formatDateActivityValue(value: string | Date | null | undefined): string {
  if (!value) {
    return EMPTY_DISPLAY_VALUE;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatEmptyActivityValue(value);
  }

  return date.toLocaleString();
}

export function formatKnownActivityValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return EMPTY_DISPLAY_VALUE;
  }

  if (typeof value === 'boolean') {
    return formatBooleanActivityValue(value);
  }

  if (typeof value === 'string') {
    if (field === 'status') {
      return LEAD_STATUS_LABELS[value] ?? TASK_STATUS_LABELS[value] ?? formatEmptyActivityValue(value);
    }

    if (field === 'temperature') {
      return LEAD_TEMPERATURE_LABELS[value] ?? formatEmptyActivityValue(value);
    }

    if (field.toLowerCase().endsWith('at') || field.toLowerCase().includes('date')) {
      return formatDateActivityValue(value);
    }

    return formatEmptyActivityValue(value);
  }

  if (typeof value === 'number') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function humanizeActivityField(field: string): string {
  const labels: Record<string, string> = {
    assigneeId: 'Assignee',
    dueAt: 'Due date',
    leadSourceId: 'Lead source',
    nextFollowUpAt: 'Next follow-up',
    ownerId: 'Owner',
  };

  if (labels[field]) {
    return labels[field];
  }

  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function buildChangeSummaryItem(change: ActivityChange): ChangeSummaryItem {
  return {
    field: change.field,
    label: change.label || humanizeActivityField(change.field),
    from: formatKnownActivityValue(change.field, change.from),
    to: formatKnownActivityValue(change.field, change.to),
  };
}

export function buildChangeSummaryItems(changes: ActivityChange[] | null | undefined): ChangeSummaryItem[] {
  return changes?.map(buildChangeSummaryItem) ?? [];
}
