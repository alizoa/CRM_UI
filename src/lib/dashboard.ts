// src/lib/dashboard.ts - lead-management demo summary
import { DEMO_LEADS, DEMO_MEMBERSHIPS, DEMO_TASKS } from './mock-data';

export type DashboardLeadStatus = 'NEW' | 'CONTACTED' | 'FOLLOW_UP_NEEDED' | 'QUALIFIED' | 'WON' | 'LOST';
export type DashboardLeadTemperature = 'HOT' | 'WARM' | 'COLD' | 'NOT_SET';

export type DashboardSummary = {
  keyMetrics: {
    newLeadsCount: number;
    needsAttentionCount: number;
    followUpsDueTodayCount: number;
    overdueFollowUpsCount: number;
    hotLeadsCount: number;
    unassignedLeadsCount: number;
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
  attention: Array<{
    id: string;
    title: string;
    count: number;
    description: string;
    tone: 'critical' | 'warning' | 'neutral' | 'positive';
    href: string;
  }>;
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

function leadName(lead: (typeof DEMO_LEADS)[number]) {
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

function isLeadTask(task: (typeof DEMO_TASKS)[number]) {
  return task.entityType === 'LEAD';
}

function isOpenTask(task: (typeof DEMO_TASKS)[number]) {
  return String(task.status) !== 'DONE';
}

function getDueBucket(task: (typeof DEMO_TASKS)[number]) {
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

function buildDashboardSummary(): DashboardSummary {
  const activeLeads = DEMO_LEADS.filter((lead) => ACTIVE_STATUSES.includes(lead.status));
  const leadTasks = DEMO_TASKS.filter(isLeadTask);
  const openLeadTasks = leadTasks.filter(isOpenTask);
  const overdueFollowUps = openLeadTasks.filter((task) => getDueBucket(task) === 'overdue');
  const dueTodayFollowUps = openLeadTasks.filter((task) => getDueBucket(task) === 'today');
  const upcomingFollowUps = openLeadTasks.filter((task) => getDueBucket(task) === 'upcoming');
  const completedLeadTasks = leadTasks.filter((task) => String(task.status) === 'DONE');
  const unassignedLeads = activeLeads.filter((lead) => !lead.ownerId);
  const leadsWithoutOpenTask = activeLeads.filter((lead) => !openLeadTasks.some((task) => task.entityId === lead.id));
  const hotLeadsWithoutOpenTask = leadsWithoutOpenTask.filter((lead) => lead.temperature === 'HOT');
  const followUpNeededLeads = activeLeads.filter((lead) => lead.status === 'FOLLOW_UP_NEEDED');
  const needsAttentionCount = overdueFollowUps.length + dueTodayFollowUps.length + unassignedLeads.length + followUpNeededLeads.length;

  const leadStatus = (Object.keys(STATUS_LABELS) as DashboardLeadStatus[]).map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: DEMO_LEADS.filter((lead) => lead.status === status).length,
    active: ACTIVE_STATUSES.includes(status),
  }));

  const leadTemperature = (Object.keys(TEMPERATURE_LABELS) as DashboardLeadTemperature[]).map((temperature) => ({
    temperature,
    label: TEMPERATURE_LABELS[temperature],
    count: DEMO_LEADS.filter((lead) => (lead.temperature ?? 'NOT_SET') === temperature).length,
  }));

  const sources = new Map<string, number>();
  for (const lead of DEMO_LEADS) {
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
        needsAttentionCount: ownerLeads.filter((lead) => lead.status === 'FOLLOW_UP_NEEDED' || lead.temperature === 'HOT').length,
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
      needsAttentionCount,
      followUpsDueTodayCount: dueTodayFollowUps.length,
      overdueFollowUpsCount: overdueFollowUps.length,
      hotLeadsCount: activeLeads.filter((lead) => lead.temperature === 'HOT').length,
      unassignedLeadsCount: unassignedLeads.length,
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
    attention: [
      {
        id: 'overdue-followups',
        title: 'Overdue follow-ups',
        count: overdueFollowUps.length,
        description: 'Lead follow-up tasks past their due date.',
        tone: overdueFollowUps.length > 0 ? 'critical' : 'positive',
        href: '/tasks',
      },
      {
        id: 'today-followups',
        title: 'Follow-ups due today',
        count: dueTodayFollowUps.length,
        description: 'Lead work scheduled for today.',
        tone: dueTodayFollowUps.length > 0 ? 'warning' : 'positive',
        href: '/today',
      },
      {
        id: 'unassigned-leads',
        title: 'Unassigned leads',
        count: unassignedLeads.length,
        description: 'Active leads waiting for an owner.',
        tone: unassignedLeads.length > 0 ? 'warning' : 'positive',
        href: '/leads',
      },
      {
        id: 'follow-up-needed',
        title: 'Follow-up Needed status',
        count: followUpNeededLeads.length,
        description: 'Leads explicitly waiting on the next touch.',
        tone: followUpNeededLeads.length > 0 ? 'neutral' : 'positive',
        href: '/leads',
      },
      {
        id: 'hot-no-task',
        title: 'Hot leads without open tasks',
        count: hotLeadsWithoutOpenTask.length,
        description: 'High-priority leads that need a planned follow-up.',
        tone: hotLeadsWithoutOpenTask.length > 0 ? 'warning' : 'positive',
        href: '/leads',
      },
    ],
    conversion: {
      activeCount: activeLeads.length,
      wonCount: DEMO_LEADS.filter((lead) => lead.status === 'WON').length,
      lostCount: DEMO_LEADS.filter((lead) => lead.status === 'LOST').length,
    },
    activities: {
      recent: [
        {
          id: 'lead-act-001',
          leadId: 'led-001',
          leadName: leadName(DEMO_LEADS[0]),
          description: `${leadName(DEMO_LEADS[0])} was created from Website.`,
          actorName: 'Website capture',
          createdAt: '2026-07-19T09:10:00.000Z',
        },
        {
          id: 'lead-act-002',
          leadId: 'led-003',
          leadName: leadName(DEMO_LEADS[2]),
          description: `${leadName(DEMO_LEADS[2])} moved to Follow-up Needed.`,
          actorName: 'Demo User',
          createdAt: '2026-07-18T15:30:00.000Z',
        },
        {
          id: 'lead-act-003',
          leadId: 'led-002',
          leadName: leadName(DEMO_LEADS[1]),
          description: `${leadName(DEMO_LEADS[1])} changed from Warm to Hot.`,
          actorName: 'Demo User',
          createdAt: '2026-07-18T11:15:00.000Z',
        },
        {
          id: 'lead-act-004',
          leadId: 'led-001',
          leadName: leadName(DEMO_LEADS[0]),
          description: `Follow-up completed for ${leadName(DEMO_LEADS[0])}.`,
          actorName: 'Demo User',
          createdAt: '2026-07-17T11:45:00.000Z',
        },
        {
          id: 'lead-act-005',
          leadId: 'led-004',
          leadName: leadName(DEMO_LEADS[3]),
          description: `${leadName(DEMO_LEADS[3])} was won.`,
          actorName: 'Demo User',
          createdAt: '2026-07-16T10:30:00.000Z',
        },
      ],
    },
  };
}

export function getDashboardSummary(_token: string): Promise<DashboardSummary> {
  return Promise.resolve(buildDashboardSummary());
}
