// src/lib/worklist.ts — demo mode

export const WORKLIST_PATH = '/api/worklist/summary';
export const NEXT_BEST_ACTIONS_PATH = '/api/worklist/next-actions';

export type WorklistEntityType = 'CONTACT' | 'DEAL' | 'LEAD';
export type NextBestActionEntityType = 'CONTACT' | 'DEAL' | 'LEAD' | 'TASK';
export type NextBestActionType =
  | 'ASSIGN_OWNER'
  | 'ADD_CONTACT_METHOD'
  | 'COMPLETE_OR_RESCHEDULE_TASK'
  | 'LINK_CONTACT'
  | 'FOLLOW_UP_BEFORE_CLOSE'
  | 'CREATE_FOLLOW_UP_TASK';
export type NextBestActionPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type WorklistTaskItem = {
  id: string;
  title: string;
  dueAt: string | null;
  entityType: WorklistEntityType;
  entityId: string;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string;
};

export type WorklistContactItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
};

export type WorklistLeadItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  temperature: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
};

export type WorklistDealItem = {
  id: string;
  title: string;
  value: string | null;
  currency: string | null;
  expectedCloseAt: string | null;
  status: string;
  createdAt: string;
  contactId: string | null;
  contactName: string | null;
  ownerId: string | null;
  ownerName: string | null;
};

export type WorklistSummary = {
  overdueTasksCount: number;
  dueTodayTasksCount: number;
  contactsMissingOwnerCount: number;
  dealsMissingOwnerCount: number;
  dealsMissingCloseDateCount: number;
  dealsMissingValueCount: number;
  contactsMissingContactMethodCount: number;
  newLeadsWithoutOwnerCount: number;
  dealsMissingContactCount: number;
  totalAttentionItems: number;
};

export type WorklistSummaryResponse = {
  summary: WorklistSummary;
  overdueTasks: WorklistTaskItem[];
  dueTodayTasks: WorklistTaskItem[];
  contactsMissingOwner: WorklistContactItem[];
  dealsMissingOwner: WorklistDealItem[];
  dealsMissingCloseDate: WorklistDealItem[];
  dealsMissingValue: WorklistDealItem[];
  contactsMissingContactMethod: WorklistContactItem[];
  newLeadsWithoutOwner: WorklistLeadItem[];
  dealsMissingContact: WorklistDealItem[];
};

export type NextBestAction = {
  id: string;
  entityType: NextBestActionEntityType;
  entityId: string;
  entityTitle: string;
  actionType: NextBestActionType;
  title: string;
  reason: string;
  priority: NextBestActionPriority;
  linkTo: string;
  createdFromRule: string;
  daysWaiting?: number;
};

export type NextBestActionsResponse = {
  actions: NextBestAction[];
  total: number;
};

const DEMO_WORKLIST_RESPONSE: WorklistSummaryResponse = {
  summary: {
    overdueTasksCount: 1,
    dueTodayTasksCount: 2,
    contactsMissingOwnerCount: 0,
    dealsMissingOwnerCount: 1,
    dealsMissingCloseDateCount: 1,
    dealsMissingValueCount: 0,
    contactsMissingContactMethodCount: 0,
    newLeadsWithoutOwnerCount: 1,
    dealsMissingContactCount: 0,
    totalAttentionItems: 3,
  },
  overdueTasks: [
    { id: 'tsk-003', title: 'Schedule intro call with Frank', dueAt: '2026-07-10T09:00:00.000Z', entityType: 'LEAD', entityId: 'led-001', assigneeId: 'usr-demo-1', assigneeName: 'Demo User', createdAt: '2024-09-10T10:00:00.000Z' },
  ],
  dueTodayTasks: [
    { id: 'tsk-001', title: 'Follow up with Alice', dueAt: '2026-07-15T09:00:00.000Z', entityType: 'CONTACT', entityId: 'cnt-001', assigneeId: 'usr-demo-1', assigneeName: 'Demo User', createdAt: '2024-09-01T10:00:00.000Z' },
    { id: 'tsk-002', title: 'Prepare sample deal contract', dueAt: '2026-07-18T09:00:00.000Z', entityType: 'DEAL', entityId: 'dea-001', assigneeId: 'usr-demo-1', assigneeName: 'Demo User', createdAt: '2024-09-05T10:00:00.000Z' },
  ],
  contactsMissingOwner: [],
  dealsMissingOwner: [
    { id: 'dea-004', title: 'Placeholder Enterprise Deal', value: '0', currency: 'USD', expectedCloseAt: null, status: 'LOST', createdAt: '2024-09-15T10:00:00.000Z', contactId: 'cnt-004', contactName: 'David Testuser', ownerId: null, ownerName: null },
  ],
  dealsMissingCloseDate: [
    { id: 'dea-002', title: 'Example Service Retainer', value: '2500', currency: 'USD', expectedCloseAt: null, status: 'OPEN', createdAt: '2024-10-10T10:00:00.000Z', contactId: 'cnt-002', contactName: 'Bob Sample', ownerId: 'usr-demo-1', ownerName: 'Demo User' },
  ],
  dealsMissingValue: [],
  contactsMissingContactMethod: [],
  newLeadsWithoutOwner: [
    { id: 'led-003', firstName: 'Henry', lastName: 'FakeLead', email: null, phone: '+1-555-0203', status: 'QUALIFIED', temperature: 'COLD', nextFollowUpAt: null, createdAt: '2024-07-10T10:00:00.000Z' },
  ],
  dealsMissingContact: [],
};

export function getWorklistSummary(_token: string): Promise<WorklistSummaryResponse> {
  return Promise.resolve(DEMO_WORKLIST_RESPONSE);
}

export function getNextBestActions(_token: string): Promise<NextBestActionsResponse> {
  return Promise.resolve({
    actions: [
      {
        id: 'nba-001',
        entityType: 'LEAD',
        entityId: 'led-001',
        entityTitle: 'Frank DemoLead',
        actionType: 'CREATE_FOLLOW_UP_TASK',
        title: 'Follow up with Frank DemoLead',
        reason: 'Hot lead with no recent activity',
        priority: 'HIGH',
        linkTo: '/leads/led-001',
        createdFromRule: 'hot-lead-follow-up',
      },
      {
        id: 'nba-002',
        entityType: 'TASK',
        entityId: 'tsk-001',
        entityTitle: 'Follow up with Alice',
        actionType: 'COMPLETE_OR_RESCHEDULE_TASK',
        title: 'Complete task: Follow up with Alice',
        reason: 'Task is due today',
        priority: 'MEDIUM',
        linkTo: '/tasks/tsk-001',
        createdFromRule: 'due-today-task',
      },
    ],
    total: 2,
  });
}
