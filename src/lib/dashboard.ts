// src/lib/dashboard.ts - lead-management demo summary
import { DEMO_MEMBERSHIPS } from './mock-data';
import { listLeads, type Lead } from './leads';
import { isOpenFollowUpTask, listTasks, type Task } from './tasks';

export type DashboardLeadStatus = 'NEW' | 'CONTACTED' | 'FOLLOW_UP_NEEDED' | 'QUALIFIED' | 'WON' | 'LOST';
export type DashboardLeadTemperature = 'HOT' | 'WARM' | 'COLD' | 'NOT_SET';
export type DashboardLeadAttentionReasonId =
  | 'OVERDUE_FOLLOW_UP'
  | 'FOLLOW_UP_DUE_TODAY'
  | 'UNASSIGNED_LEAD'
  | 'NO_ACTIVE_FOLLOW_UP'
  | 'HOT_LEAD_WITHOUT_OPEN_TASK';

export type DashboardSummary = {
  keyMetrics: {
    newLeadsCount: number;
    needsAttentionCount: number;
    followUpsDueTodayCount: number;
    overdueFollowUpsCount: number;
    hotLeadsCount: number;
    unassignedLeadsCount: number;
  };
  keyMetricDetails: {
    newLeads: DashboardMetricItem[];
    needsAttention: DashboardMetricItem[];
    followUpsDueToday: DashboardMetricItem[];
    overdueFollowUps: DashboardMetricItem[];
  };
  leadStatus: Array<{
    status: DashboardLeadStatus;
    label: string;
    count: number;
    active: boolean;
  }>;
  leadTemperature: Array<{
    temperature: DashboardLeadTemperature;
    label: string;
    count: number;
  }>;
  leadSources: Array<{
    source: string;
    label: string;
    count: number;
  }>;
  ownership: Array<{
    ownerId: string | null;
    ownerName: string;
    activeLeadsCount: number;
    needsAttentionCount: number;
  }>;
  followUps: {
    overdueCount: number;
    dueTodayCount: number;
    upcomingCount: number;
    completedThisWeekCount: number;
  };
  conversion: {
    activeCount: number;
    wonCount: number;
    lostCount: number;
  };
  activities: {
    recent: Array<{
      id: string;
      leadId: string;
      leadName: string;
      description: string;
      actorName: string;
      createdAt: string;
    }>;
  };
};

export type DashboardMetricItem = {
  id: string;
  kind: 'lead' | 'task' | 'lead_attention';
  title: string;
  subtitle: string;
  detail: string;
  href: string;
  leadId?: string;
  dueAt?: string | null;
  tone?: 'default' | 'warning' | 'critical';
  reasons?: DashboardLeadAttentionReason[];
};

export type DashboardLeadAttentionReason = {
  id: DashboardLeadAttentionReasonId;
  label: string;
  tone: 'warning' | 'critical';
  taskId?: string;
  dueAt?: string | null;
};

export const DASHBOARD_LEAD_ATTENTION_REASONS: Array<Pick<DashboardLeadAttentionReason, 'id' | 'label' | 'tone'>> = [
  { id: 'OVERDUE_FOLLOW_UP', label: 'Overdue follow-up', tone: 'critical' },
  { id: 'FOLLOW_UP_DUE_TODAY', label: 'Follow-up due today', tone: 'warning' },
  { id: 'UNASSIGNED_LEAD', label: 'Unassigned', tone: 'warning' },
  { id: 'NO_ACTIVE_FOLLOW_UP', label: 'No active follow-up', tone: 'warning' },
  { id: 'HOT_LEAD_WITHOUT_OPEN_TASK', label: 'Hot lead without open tasks', tone: 'warning' },
];

const ACTIVE_STATUSES: DashboardLeadStatus[] = ['NEW', 'CONTACTED', 'FOLLOW_UP_NEEDED', 'QUALIFIED'];
const STATUS_LABELS: Record<DashboardLeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  FOLLOW_UP_NEEDED: 'Follow-up Needed',
  QUALIFIED: 'Qualified',
  WON: 'Won',
  LOST: 'Lost',
};
const TEMPERATURE_LABELS: Record<DashboardLeadTemperature, string> = {
  HOT: 'Hot',
  WARM: 'Warm',
  COLD: 'Cold',
  NOT_SET: 'Not set',
};

function leadName(lead: Lead) {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || lead.phone || 'Unnamed lead';
}

function sourceLabel(source: string) {
  return source
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getLocalDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isLeadTask(task: Task) {
  return task.entityType === 'LEAD';
}

function isOpenTask(task: Task) {
  return String(task.status) !== 'DONE';
}

function getDueBucket(task: Task) {
  if (!task.dueAt) {
    return 'none';
  }

  const dueDate = new Date(task.dueAt);
  if (Number.isNaN(dueDate.getTime())) {
    return 'upcoming';
  }

  const todayStart = getLocalDayStart(new Date());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);

  if (dueDate < todayStart) {
    return 'overdue';
  }

  if (dueDate < tomorrowStart) {
    return 'today';
  }

  return 'upcoming';
}

function leadOwnerName(lead: Lead) {
  if (!lead.owner) return 'Unassigned';
  return [lead.owner.firstName, lead.owner.lastName].filter(Boolean).join(' ') || lead.owner.email;
}

function leadMetricItem(lead: Lead, detail: string, tone: DashboardMetricItem['tone'] = 'default'): DashboardMetricItem {
  return {
    id: `lead-${lead.id}-${detail.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    kind: 'lead',
    title: leadName(lead),
    subtitle: `${STATUS_LABELS[lead.status]} lead`,
    detail,
    href: `/leads/${lead.id}`,
    leadId: lead.id,
    tone,
  };
}

function taskMetricItem(
  task: Task,
  lead: Lead | undefined,
  detail: string,
  tone: DashboardMetricItem['tone'],
): DashboardMetricItem {
  return {
    id: `task-${task.id}-${detail.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    kind: 'task',
    title: task.title,
    subtitle: lead ? leadName(lead) : 'Lead follow-up task',
    detail,
    href: lead ? `/leads/${lead.id}` : '/tasks',
    leadId: lead?.id,
    dueAt: task.dueAt,
    tone,
  };
}

function attentionReason(id: DashboardLeadAttentionReasonId, overrides: Partial<DashboardLeadAttentionReason> = {}): DashboardLeadAttentionReason {
  const definition = DASHBOARD_LEAD_ATTENTION_REASONS.find((reason) => reason.id === id);
  return {
    id,
    label: definition?.label ?? id,
    tone: definition?.tone ?? 'warning',
    ...overrides,
  };
}

function selectLeadAttentionItems(activeLeads: Lead[], leadTasks: Task[]): DashboardMetricItem[] {
  const openLeadTasks = leadTasks.filter(isOpenTask);
  const openFollowUpTasks = leadTasks.filter(isOpenFollowUpTask);
  const followUpTasksByLead = new Map<string, Task[]>();
  const openTasksByLead = new Map<string, Task[]>();

  for (const task of openFollowUpTasks) {
    followUpTasksByLead.set(task.entityId, [...(followUpTasksByLead.get(task.entityId) ?? []), task]);
  }

  for (const task of openLeadTasks) {
    openTasksByLead.set(task.entityId, [...(openTasksByLead.get(task.entityId) ?? []), task]);
  }

  return activeLeads.flatMap((lead) => {
    const reasons: DashboardLeadAttentionReason[] = [];
    const followUpTasks = followUpTasksByLead.get(lead.id) ?? [];
    const openTasks = openTasksByLead.get(lead.id) ?? [];

    if (followUpTasks.some((task) => getDueBucket(task) === 'overdue')) {
      const task = followUpTasks.find((item) => getDueBucket(item) === 'overdue');
      reasons.push(attentionReason('OVERDUE_FOLLOW_UP', {
        taskId: task?.id,
        dueAt: task?.dueAt,
      }));
    }

    if (followUpTasks.some((task) => getDueBucket(task) === 'today')) {
      const task = followUpTasks.find((item) => getDueBucket(item) === 'today');
      reasons.push(attentionReason('FOLLOW_UP_DUE_TODAY', {
        taskId: task?.id,
        dueAt: task?.dueAt,
      }));
    }

    if (!lead.ownerId) {
      reasons.push(attentionReason('UNASSIGNED_LEAD'));
    }

    if (followUpTasks.length === 0) {
      reasons.push(attentionReason('NO_ACTIVE_FOLLOW_UP'));
    }

    if (lead.temperature === 'HOT' && openTasks.length === 0) {
      reasons.push(attentionReason('HOT_LEAD_WITHOUT_OPEN_TASK'));
    }

    if (reasons.length === 0) return [];

    return [{
      id: `lead-attention-${lead.id}`,
      kind: 'lead_attention' as const,
      title: leadName(lead),
      subtitle: `${STATUS_LABELS[lead.status]} lead`,
      detail: reasons.map((reason) => reason.label).join(', '),
      href: `/leads/${lead.id}`,
      leadId: lead.id,
      tone: reasons.some((reason) => reason.tone === 'critical') ? 'critical' as const : 'warning' as const,
      reasons,
    }];
  });
}

export function countAttentionReason(items: DashboardMetricItem[], reasonId: DashboardLeadAttentionReasonId) {
  return items.filter((item) => item.reasons?.some((reason) => reason.id === reasonId)).length;
}

async function buildDashboardSummary(token: string): Promise<DashboardSummary> {
  const [leadResponse, taskResponse] = await Promise.all([
    listLeads(token, { page: 1, limit: 500, includeAll: true }),
    listTasks(token, { entityType: 'LEAD', page: 1, limit: 500 }),
  ]);
  const leads = leadResponse.data;
  const tasks = taskResponse.data;
  const activeLeads = leads.filter((lead) => ACTIVE_STATUSES.includes(lead.status));
  const leadTasks = tasks.filter(isLeadTask);
  const openLeadTasks = leadTasks.filter(isOpenTask);
  const openFollowUpTasks = leadTasks.filter(isOpenFollowUpTask);
  const overdueFollowUps = openFollowUpTasks.filter((task) => getDueBucket(task) === 'overdue');
  const dueTodayFollowUps = openFollowUpTasks.filter((task) => getDueBucket(task) === 'today');
  const upcomingFollowUps = openLeadTasks.filter((task) => getDueBucket(task) === 'upcoming');
  const completedLeadTasks = leadTasks.filter((task) => String(task.status) === 'DONE');
  const unassignedLeads = activeLeads.filter((lead) => !lead.ownerId);
  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const attentionItems = selectLeadAttentionItems(activeLeads, leadTasks);
  const newLeadDetails = activeLeads
    .filter((lead) => lead.status === 'NEW')
    .map((lead) => leadMetricItem(lead, `Owner: ${leadOwnerName(lead)}`));
  const overdueFollowUpDetails = overdueFollowUps
    .map((task) => taskMetricItem(task, leadById.get(task.entityId), 'Overdue follow-up', 'critical'));
  const dueTodayFollowUpDetails = dueTodayFollowUps
    .map((task) => taskMetricItem(task, leadById.get(task.entityId), 'Due today', 'warning'));

  const leadStatus = (Object.keys(STATUS_LABELS) as DashboardLeadStatus[]).map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: leads.filter((lead) => lead.status === status).length,
    active: ACTIVE_STATUSES.includes(status),
  }));

  const leadTemperature = (Object.keys(TEMPERATURE_LABELS) as DashboardLeadTemperature[]).map((temperature) => ({
    temperature,
    label: TEMPERATURE_LABELS[temperature],
    count: leads.filter((lead) => (lead.temperature ?? 'NOT_SET') === temperature).length,
  }));

  const sources = new Map<string, number>();
  for (const lead of leads) {
    sources.set(lead.source, (sources.get(lead.source) ?? 0) + 1);
  }

  const leadSources = Array.from(sources.entries())
    .map(([source, count]) => ({ source, label: sourceLabel(source), count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  const ownership = [
    ...DEMO_MEMBERSHIPS.map((membership) => {
      const ownerLeads = activeLeads.filter((lead) => lead.ownerId === membership.userId);
      return {
        ownerId: membership.userId,
        ownerName: [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email,
        activeLeadsCount: ownerLeads.length,
        needsAttentionCount: attentionItems.filter((item) => ownerLeads.some((lead) => lead.id === item.leadId)).length,
      };
    }),
    {
      ownerId: null,
      ownerName: 'Unassigned',
      activeLeadsCount: unassignedLeads.length,
      needsAttentionCount: unassignedLeads.length,
    },
  ];

  return {
    keyMetrics: {
      newLeadsCount: activeLeads.filter((lead) => lead.status === 'NEW').length,
      needsAttentionCount: attentionItems.length,
      followUpsDueTodayCount: dueTodayFollowUps.length,
      overdueFollowUpsCount: overdueFollowUps.length,
      hotLeadsCount: activeLeads.filter((lead) => lead.temperature === 'HOT').length,
      unassignedLeadsCount: unassignedLeads.length,
    },
    keyMetricDetails: {
      newLeads: newLeadDetails,
      needsAttention: attentionItems,
      followUpsDueToday: dueTodayFollowUpDetails,
      overdueFollowUps: overdueFollowUpDetails,
    },
    leadStatus,
    leadTemperature,
    leadSources,
    ownership,
    followUps: {
      overdueCount: overdueFollowUps.length,
      dueTodayCount: dueTodayFollowUps.length,
      upcomingCount: upcomingFollowUps.length,
      completedThisWeekCount: completedLeadTasks.length,
    },
    conversion: {
      activeCount: activeLeads.length,
      wonCount: leads.filter((lead) => lead.status === 'WON').length,
      lostCount: leads.filter((lead) => lead.status === 'LOST').length,
    },
    activities: {
      recent: [
        {
          id: 'lead-act-001',
          leadId: 'led-001',
          leadName: leadName(leads[0]),
          description: `${leadName(leads[0])} was created from Website.`,
          actorName: 'Website capture',
          createdAt: '2026-07-19T09:10:00.000Z',
        },
        {
          id: 'lead-act-002',
          leadId: 'led-003',
          leadName: leadName(leads[2]),
          description: `${leadName(leads[2])} moved to Follow-up Needed.`,
          actorName: 'Demo User',
          createdAt: '2026-07-18T15:30:00.000Z',
        },
        {
          id: 'lead-act-003',
          leadId: 'led-002',
          leadName: leadName(leads[1]),
          description: `${leadName(leads[1])} changed from Warm to Hot.`,
          actorName: 'Demo User',
          createdAt: '2026-07-18T11:15:00.000Z',
        },
        {
          id: 'lead-act-004',
          leadId: 'led-001',
          leadName: leadName(leads[0]),
          description: `Follow-up completed for ${leadName(leads[0])}.`,
          actorName: 'Demo User',
          createdAt: '2026-07-17T11:45:00.000Z',
        },
        {
          id: 'lead-act-005',
          leadId: 'led-004',
          leadName: leadName(leads[3]),
          description: `${leadName(leads[3])} was won.`,
          actorName: 'Demo User',
          createdAt: '2026-07-16T10:30:00.000Z',
        },
      ],
    },
  };
}

export function getDashboardSummary(_token: string): Promise<DashboardSummary> {
  return buildDashboardSummary(_token);
}
