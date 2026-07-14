// src/lib/dashboard.ts — demo mode

export const DASHBOARD_SUMMARY_PATH = '/api/dashboard/summary';

export type DashboardSummary = {
  contacts: {
    totalLeads: number;
    totalCustomers: number;
    totalArchived: number;
  };
  deals: {
    openCount: number;
    openValue: string;
    wonCount: number;
    lostCount: number;
    byPipeline: Array<{
      pipelineId: string;
      pipelineName: string;
      openCount: number;
      openValue: string;
    }>;
    byStage: Array<{
      stageId: string;
      stageName: string;
      pipelineId: string;
      count: number;
      value: string;
    }>;
  };
  tasks: {
    overdueCount: number;
    dueTodayCount: number;
    upcomingCount: number;
    openCount: number;
  };
  activities: {
    recent: Array<{
      id: string;
      entityType: string;
      entityId: string;
      action: string;
      actorId: string | null;
      actorName: string | null;
      createdAt: string;
    }>;
  };
  leadSources: {
    summary: Array<{
      leadSourceId: string;
      name: string;
      contactCount: number;
      dealCount: number;
    }>;
  };
};

const DEMO_SUMMARY: DashboardSummary = {
  contacts: { totalLeads: 4, totalCustomers: 2, totalArchived: 1 },
  deals: {
    openCount: 2,
    openValue: '7500',
    wonCount: 1,
    lostCount: 1,
    byPipeline: [{ pipelineId: 'pip-main-1', pipelineName: 'Main Pipeline', openCount: 2, openValue: '7500' }],
    byStage: [
      { stageId: 'stg-prospect', stageName: 'Prospect', pipelineId: 'pip-main-1', count: 1, value: '2500' },
      { stageId: 'stg-proposal', stageName: 'Proposal', pipelineId: 'pip-main-1', count: 1, value: '5000' },
    ],
  },
  tasks: { overdueCount: 1, dueTodayCount: 2, upcomingCount: 2, openCount: 4 },
  activities: {
    recent: [
      { id: 'act-001', entityType: 'CONTACT', entityId: 'cnt-001', action: 'NOTE_ADDED', actorId: 'usr-demo-1', actorName: 'Demo User', createdAt: '2024-09-02T10:00:00.000Z' },
      { id: 'act-002', entityType: 'DEAL', entityId: 'dea-001', action: 'STAGE_CHANGED', actorId: 'usr-demo-1', actorName: 'Demo User', createdAt: '2024-10-02T10:00:00.000Z' },
    ],
  },
  leadSources: {
    summary: [
      { leadSourceId: 'ls-001', name: 'Website', contactCount: 2, dealCount: 1 },
    ],
  },
};

export function getDashboardSummary(_token: string): Promise<DashboardSummary> {
  return Promise.resolve(DEMO_SUMMARY);
}
