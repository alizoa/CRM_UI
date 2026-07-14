// src/lib/notifications.ts — demo mode

export type NotificationEntityType = 'TASK' | 'DEAL' | 'CONTACT';

export type Notification = {
  id: string;
  entityType: NotificationEntityType;
  entityId: string;
  action: 'TASK_ASSIGNED' | 'DEAL_ASSIGNED' | 'CONTACT_ASSIGNED';
  title: string;
  body: string | null;
  parentEntityType: NotificationEntityType | null;
  parentEntityId: string | null;
  actorId: string;
  actorName: string;
  readAt: string | null;
  createdAt: string;
};

const DEMO_NOTIFS: Notification[] = [
  {
    id: 'notif-001',
    entityType: 'TASK',
    entityId: 'tsk-001',
    action: 'TASK_ASSIGNED',
    title: 'Task assigned to you',
    body: 'Follow up with Alice',
    parentEntityType: null,
    parentEntityId: null,
    actorId: 'usr-demo-1',
    actorName: 'Demo User',
    readAt: null,
    createdAt: '2024-09-01T10:00:00.000Z',
  },
  {
    id: 'notif-002',
    entityType: 'DEAL',
    entityId: 'dea-001',
    action: 'DEAL_ASSIGNED',
    title: 'Deal assigned to you',
    body: 'Demo Website Project',
    parentEntityType: null,
    parentEntityId: null,
    actorId: 'usr-demo-1',
    actorName: 'Demo User',
    readAt: null,
    createdAt: '2024-10-01T10:00:00.000Z',
  },
];

export function fetchNotifications(_token: string, _limit = 20, _cursor?: string): Promise<{ notifications: Notification[]; nextCursor: string | null }> {
  return Promise.resolve({ notifications: DEMO_NOTIFS, nextCursor: null });
}

export function fetchNotificationUnreadCount(_token: string): Promise<{ count: number }> {
  return Promise.resolve({ count: 2 });
}

export function markNotificationRead(_token: string, _id: string): Promise<{ success: true }> {
  return Promise.resolve({ success: true });
}

export function markAllNotificationsRead(_token: string): Promise<{ updated: number }> {
  return Promise.resolve({ updated: 2 });
}
