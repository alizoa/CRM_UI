// src/lib/whatsapp.ts — demo mode

export const WHATSAPP_CONVERSATIONS_PATH = '/api/integrations/whatsapp/conversations';
export const WHATSAPP_MESSAGES_PATH = '/api/integrations/whatsapp/messages';
export const WHATSAPP_ATTENTION_COUNT_PATH = '/api/integrations/whatsapp/attention-count';

export type WhatsappConversationStatus = 'OPEN' | 'CLOSED';
export type WhatsappMessageDirection = 'INBOUND' | 'OUTBOUND';
export type WhatsappMessageStatus = 'RECEIVED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export type WhatsappContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status?: 'PROSPECT' | 'CUSTOMER' | 'ARCHIVED';
  owner?: WhatsappAssignedUser | null;
  tags?: Array<{
    tag: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
};

export type WhatsappAssignedUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export type WhatsappMessage = {
  id: string;
  conversationId: string;
  waMessageId: string | null;
  direction: WhatsappMessageDirection;
  status: WhatsappMessageStatus;
  text: string | null;
  messageType: string | null;
  templateName: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WhatsappConversation = {
  id: string;
  contactId: string | null;
  assignedUserId: string | null;
  waContactPhone: string;
  waProfileName: string | null;
  channel: string;
  status: WhatsappConversationStatus;
  unreadCount: number;
  hasUnread: boolean;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  replyEligible: boolean;
  replyWindowExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: WhatsappContact | null;
  assignedUser?: WhatsappAssignedUser | null;
  messages?: WhatsappMessage[];
};

export type WhatsappConversationListItem = WhatsappConversation & {
  waitingForReply: boolean;
  waitingSince?: string | null;
};

export type WhatsappConversationFilters = {
  status?: WhatsappConversationStatus;
  phone?: string;
  mine?: boolean;
  unassigned?: boolean;
  unread?: boolean;
  waitingForReply?: boolean;
  contactStatus?: 'PROSPECT' | 'CUSTOMER' | 'ARCHIVED';
  linkState?: 'linked' | 'unlinked';
};

export type WhatsappAttentionCountResponse = {
  count: number;
};

export type SendWhatsappMessageInput = {
  conversationId: string;
  body: string;
};

export type SendWhatsappMessageResponse = Omit<WhatsappMessage, 'text'> & {
  companyId: string;
  body: string | null;
};

export type CreateContactFromWhatsappConversationInput = {
  firstName?: string;
  lastName?: string;
};

export type WhatsappCrmContext = {
  tasks: Array<{
    id: string;
    title: string;
    dueAt: string | null;
    isOverdue: boolean;
    assignee: {
      id: string;
      name: string;
    } | null;
  }>;
  deals: Array<{
    id: string;
    title: string;
    value: number | null;
    currency: string;
    status: string;
    expectedCloseAt: string | null;
    stage: {
      id: string;
      name: string;
    };
    pipeline: {
      id: string;
      name: string;
    };
  }>;
  orders: Array<{
    id: string;
    title: string;
    status: string;
    paymentStatus: string;
    totalAmount: number | null;
    currency: string | null;
    updatedAt: string;
  }>;
  latestNote: {
    id: string;
    body: string;
    createdAt: string;
    author: {
      id: string;
      name: string;
    } | null;
  } | null;
};

export type CreateWhatsappConversationTaskInput = {
  title: string;
  description?: string;
  dueAt?: string | null;
  assigneeId?: string | null;
};

export type CreateWhatsappConversationNoteInput = {
  body: string;
};

export type CreateWhatsappConversationDealInput = {
  title: string;
  value?: string | number;
  currency?: string;
  pipelineId: string;
  stageId: string;
  ownerId?: string | null;
  expectedCloseAt?: string | null;
};

export type SendWhatsappApprovedTemplateInput = {
  templateId: string;
  variables: string[];
};

const DEMO_CONVERSATIONS: WhatsappConversationListItem[] = [
  {
    id: 'wa-conv-001',
    contactId: null,
    assignedUserId: null,
    waContactPhone: '+15550201',
    waProfileName: 'Frank DemoLead',
    channel: 'whatsapp',
    status: 'OPEN',
    unreadCount: 1,
    hasUnread: true,
    lastMessageAt: '2026-07-13T15:30:00.000Z',
    lastInboundAt: '2026-07-13T15:30:00.000Z',
    replyEligible: true,
    replyWindowExpiresAt: null,
    createdAt: '2026-07-13T15:00:00.000Z',
    updatedAt: '2026-07-13T15:30:00.000Z',
    waitingForReply: true,
    waitingSince: '2026-07-13T15:30:00.000Z',
    messages: [
      {
        id: 'msg-001',
        conversationId: 'wa-conv-001',
        waMessageId: null,
        direction: 'INBOUND',
        status: 'RECEIVED',
        text: 'Hi, I am interested in your services.',
        messageType: 'text',
        templateName: null,
        sentAt: '2026-07-13T15:30:00.000Z',
        createdAt: '2026-07-13T15:30:00.000Z',
        updatedAt: '2026-07-13T15:30:00.000Z',
      },
    ],
  },
  {
    id: 'wa-conv-002',
    contactId: 'cnt-001',
    assignedUserId: 'usr-demo-1',
    waContactPhone: '+15550101',
    waProfileName: 'Alice Example',
    channel: 'whatsapp',
    status: 'OPEN',
    unreadCount: 0,
    hasUnread: false,
    lastMessageAt: '2026-07-12T10:00:00.000Z',
    lastInboundAt: '2026-07-12T10:00:00.000Z',
    replyEligible: false,
    replyWindowExpiresAt: null,
    createdAt: '2026-07-12T09:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
    waitingForReply: false,
    waitingSince: null,
    contact: { id: 'cnt-001', firstName: 'Alice', lastName: 'Example', email: 'alice@example.com', phone: '+1-555-0101', status: 'CUSTOMER' },
    assignedUser: { id: 'usr-demo-1', email: 'demo@alozix.com', firstName: 'Demo', lastName: 'User' },
    messages: [
      {
        id: 'msg-002',
        conversationId: 'wa-conv-002',
        waMessageId: null,
        direction: 'INBOUND',
        status: 'READ',
        text: 'Thanks for the proposal!',
        messageType: 'text',
        templateName: null,
        sentAt: '2026-07-12T10:00:00.000Z',
        createdAt: '2026-07-12T10:00:00.000Z',
        updatedAt: '2026-07-12T10:00:00.000Z',
      },
    ],
  },
];

export function listWhatsappConversations(_token: string, _filters: WhatsappConversationFilters = {}): Promise<WhatsappConversationListItem[]> {
  return Promise.resolve(DEMO_CONVERSATIONS);
}

export function getWhatsappAttentionCount(_token: string): Promise<WhatsappAttentionCountResponse> {
  return Promise.resolve({ count: 1 });
}

export function getWhatsappConversationMessages(_token: string, conversationId: string): Promise<WhatsappMessage[]> {
  const conv = DEMO_CONVERSATIONS.find(c => c.id === conversationId);
  return Promise.resolve(conv?.messages ?? []);
}

export function getWhatsappConversationCrmContext(
  _token: string,
  _conversationId: string,
  _signal?: AbortSignal,
): Promise<WhatsappCrmContext> {
  return Promise.resolve({ tasks: [], deals: [], orders: [], latestNote: null });
}

export function createWhatsappConversationTask(
  _token: string,
  _conversationId: string,
  _input: CreateWhatsappConversationTaskInput,
): Promise<unknown> {
  return Promise.resolve({});
}

export function createWhatsappConversationNote(
  _token: string,
  _conversationId: string,
  _input: CreateWhatsappConversationNoteInput,
): Promise<unknown> {
  return Promise.resolve({});
}

export function createWhatsappConversationDeal(
  _token: string,
  _conversationId: string,
  _input: CreateWhatsappConversationDealInput,
): Promise<unknown> {
  return Promise.resolve({});
}

export function sendWhatsappMessage(_token: string, _input: SendWhatsappMessageInput): Promise<SendWhatsappMessageResponse> {
  return Promise.resolve({
    id: `msg-${Date.now()}`,
    conversationId: _input.conversationId,
    waMessageId: null,
    direction: 'OUTBOUND' as const,
    status: 'SENT' as const,
    messageType: 'text',
    templateName: null,
    sentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    companyId: 'cmp-demo',
    body: _input.body,
  });
}

export function sendWhatsappRestartTemplate(_token: string, _conversationId: string): Promise<SendWhatsappMessageResponse> {
  return Promise.resolve({
    id: `msg-${Date.now()}`,
    conversationId: _conversationId,
    waMessageId: null,
    direction: 'OUTBOUND' as const,
    status: 'SENT' as const,
    messageType: 'template',
    templateName: 'restart',
    sentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    companyId: 'cmp-demo',
    body: null,
  });
}

export function updateWhatsappConversationAssignment(
  _token: string,
  conversationId: string,
  _assignedUserId: string | null,
): Promise<WhatsappConversation> {
  return Promise.resolve(DEMO_CONVERSATIONS.find(c => c.id === conversationId) ?? DEMO_CONVERSATIONS[0]);
}

export function markWhatsappConversationRead(_token: string, conversationId: string): Promise<WhatsappConversation> {
  return Promise.resolve(DEMO_CONVERSATIONS.find(c => c.id === conversationId) ?? DEMO_CONVERSATIONS[0]);
}

export function closeWhatsappConversation(_token: string, conversationId: string): Promise<WhatsappConversation> {
  const conv = DEMO_CONVERSATIONS.find(c => c.id === conversationId) ?? DEMO_CONVERSATIONS[0];
  return Promise.resolve({ ...conv, status: 'CLOSED' as const });
}

export function reopenWhatsappConversation(_token: string, conversationId: string): Promise<WhatsappConversation> {
  const conv = DEMO_CONVERSATIONS.find(c => c.id === conversationId) ?? DEMO_CONVERSATIONS[0];
  return Promise.resolve({ ...conv, status: 'OPEN' as const });
}

export function linkWhatsappConversationContact(_token: string, conversationId: string, _contactId: string): Promise<WhatsappConversation> {
  return Promise.resolve(DEMO_CONVERSATIONS.find(c => c.id === conversationId) ?? DEMO_CONVERSATIONS[0]);
}

export function unlinkWhatsappConversationContact(_token: string, conversationId: string): Promise<WhatsappConversation> {
  return Promise.resolve(DEMO_CONVERSATIONS.find(c => c.id === conversationId) ?? DEMO_CONVERSATIONS[0]);
}

export function sendWhatsappApprovedTemplate(
  _token: string,
  _conversationId: string,
  _input: SendWhatsappApprovedTemplateInput,
): Promise<SendWhatsappMessageResponse> {
  return Promise.resolve({
    id: `msg-${Date.now()}`,
    conversationId: _conversationId,
    waMessageId: null,
    direction: 'OUTBOUND' as const,
    status: 'SENT' as const,
    messageType: 'template',
    templateName: _input.templateId,
    sentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    companyId: 'cmp-demo',
    body: null,
  });
}

export function createContactFromWhatsappConversation(
  _token: string,
  conversationId: string,
  _input: CreateContactFromWhatsappConversationInput,
): Promise<WhatsappConversation> {
  return Promise.resolve(DEMO_CONVERSATIONS.find(c => c.id === conversationId) ?? DEMO_CONVERSATIONS[0]);
}
