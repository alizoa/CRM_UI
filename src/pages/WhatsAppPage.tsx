import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { EntityActivitiesPanel } from '../components/activities/EntityActivitiesPanel';
import { ContactLinkPanel } from '../components/whatsapp/ContactLinkPanel';
import { CrmContextPanel } from '../components/whatsapp/CrmContextPanel';
import { ContactOrdersPanel } from '../components/orders/ContactOrdersPanel';
import { useAuth } from '../context/AuthContext';
import { markConversationAttentionCleared } from '../hooks/useWhatsAppAttentionCount';
import type { HttpError } from '../lib/http';
import { listContacts, type Contact } from '../lib/contacts';
import { listMembershipOptions, type MembershipOption } from '../lib/memberships';
import {
  closeWhatsappConversation,
  createContactFromWhatsappConversation,
  getWhatsappConversationCrmContext,
  getWhatsappConversationMessages,
  linkWhatsappConversationContact,
  listWhatsappConversations,
  markWhatsappConversationRead,
  reopenWhatsappConversation,
  sendWhatsappApprovedTemplate,
  sendWhatsappMessage,
  sendWhatsappRestartTemplate,
  unlinkWhatsappConversationContact,
  updateWhatsappConversationAssignment,
  type WhatsappConversation,
  type WhatsappConversationListItem,
  type WhatsappConversationStatus,
  type WhatsappCrmContext,
  type WhatsappMessage,
} from '../lib/whatsapp';
import {
  getWhatsappNotificationPermission,
  requestWhatsappNotificationPermission,
} from '../lib/whatsapp-notifications';
import {
  listApprovedTemplates,
  type WhatsappApprovedTemplate,
} from '../lib/whatsapp-approved-templates';
import {
  createSavedReply,
  deleteSavedReply,
  listSavedReplies,
  updateSavedReply,
  type WhatsappSavedReply,
} from '../lib/whatsapp-saved-replies';

type RequestError = {
  status: number;
  message: string;
  code?: string;
};

type StatusFilter = 'ALL' | WhatsappConversationStatus;
type AssignmentFilter = 'ALL' | 'MINE' | 'UNASSIGNED';
type ContactStatusFilter = 'ALL' | 'PROSPECT' | 'CUSTOMER' | 'ARCHIVED';
type LinkStateFilter = 'ALL' | 'linked' | 'unlinked';
type CrmRailTab = 'CRM' | 'DETAILS' | 'AUTOMATION' | 'HISTORY';
type MobileConversationTab = 'CHAT' | 'CRM';

// Temporary: replace with SSE or WebSocket push before multi-operator production scale.
const CONVERSATION_LIST_POLL_INTERVAL_ACTIVE_MS = 4_000;
const CONVERSATION_LIST_POLL_INTERVAL_IDLE_MS = 10_000;
const SELECTED_THREAD_POLL_INTERVAL_MS = 4_000;
const NEAR_BOTTOM_THRESHOLD_PX = 120;

function toRequestError(error: unknown, fallback: string): RequestError {
  if (error && typeof error === 'object' && 'status' in error && 'message' in error) {
    const httpError = error as HttpError;
    return { status: httpError.status, message: httpError.message || fallback, code: httpError.code };
  }

  return { status: 0, message: fallback };
}

const WHATSAPP_SEND_ERROR_MESSAGES: Record<string, string> = {
  WHATSAPP_SERVICE_WINDOW_EXPIRED:
    "This customer's 24-hour reply window has closed. A WhatsApp template is required to restart the conversation.",
  WHATSAPP_TOKEN_INVALID: 'WhatsApp credentials have expired. Ask an admin to reconnect WhatsApp in Settings.',
  WHATSAPP_PERMISSION_ERROR:
    'WhatsApp does not have permission to send this message. Ask an admin to check the WhatsApp setup.',
  WHATSAPP_RATE_LIMITED: 'Too many WhatsApp messages were sent. Please wait and try again.',
  WHATSAPP_RECIPIENT_NOT_REACHABLE: 'This WhatsApp number cannot receive messages.',
  WHATSAPP_NOT_CONFIGURED: 'WhatsApp is not set up for this company.',
  WHATSAPP_ACCOUNT_DISABLED: 'WhatsApp integration is disabled.',
  WHATSAPP_PROVIDER_ERROR: 'WhatsApp could not send the message. Please try again.',
};

function getWhatsappSendErrorMessage(code: string | undefined) {
  return (code && WHATSAPP_SEND_ERROR_MESSAGES[code]) || 'Could not send the message. Please try again.';
}

const WHATSAPP_TEMPLATE_ERROR_MESSAGES: Record<string, string> = {
  WHATSAPP_TEMPLATE_NOT_CONFIGURED:
    'No restart template is configured. Add the approved template name and language in WhatsApp settings.',
  WHATSAPP_TEMPLATE_SEND_FAILED:
    'WhatsApp could not send the restart template. Check that the template name and language are approved in Meta.',
  WHATSAPP_TEMPLATE_NOT_FOUND:
    'Template not found on WhatsApp. Confirm it is approved in your Meta Business account.',
  WHATSAPP_TOKEN_INVALID: 'WhatsApp credentials have expired. Ask an admin to reconnect WhatsApp in Settings.',
  WHATSAPP_PERMISSION_ERROR:
    'WhatsApp does not have permission to send this template. Ask an admin to check the WhatsApp setup.',
  WHATSAPP_RATE_LIMITED: 'Too many WhatsApp messages were sent. Please wait and try again.',
  WHATSAPP_NOT_CONFIGURED: 'WhatsApp is not set up for this company.',
  WHATSAPP_ACCOUNT_DISABLED: 'WhatsApp integration is disabled.',
  WHATSAPP_PROVIDER_ERROR: 'WhatsApp could not send the template. Please try again.',
  WHATSAPP_TEMPLATE_VARIABLE_COUNT_MISMATCH:
    'The number of variables does not match this template. Check the template definition.',
  WHATSAPP_TEMPLATE_VARIABLE_MISSING: 'All template variable values are required before sending.',
  WHATSAPP_APPROVED_TEMPLATE_NOT_FOUND:
    'The selected template was not found or has been deactivated.',
  WHATSAPP_RECIPIENT_NOT_REACHABLE:
    "The customer's WhatsApp number could not be reached. Check that it is valid and active.",
};

function getWhatsappTemplateErrorMessage(code: string | undefined) {
  return (
    (code && WHATSAPP_TEMPLATE_ERROR_MESSAGES[code]) ||
    'Could not send the restart template. Please try again.'
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatListTime(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  return new Intl.DateTimeFormat(undefined, sameDay ? { timeStyle: 'short' } : { month: 'short', day: 'numeric' }).format(
    date,
  );
}

function getWaitingLabel(value: string | null | undefined) {
  if (!value) return 'Needs reply';

  const waitingMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(waitingMs) || waitingMs < 0) return 'Needs reply';

  const hours = Math.floor(waitingMs / 3_600_000);
  if (hours < 1) return 'Needs reply';
  if (hours < 24) return `Waiting ${hours}h`;
  return `Waiting ${Math.floor(hours / 24)}d`;
}

function getMessageDateKey(message: WhatsappMessage) {
  const value = message.sentAt ?? message.createdAt;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatMessageDate(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (candidate: Date) =>
    date.getFullYear() === candidate.getFullYear() &&
    date.getMonth() === candidate.getMonth() &&
    date.getDate() === candidate.getDate();

  if (sameDay(today)) {
    return 'Today';
  }

  if (sameDay(yesterday)) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function getContactName(conversation: WhatsappConversation) {
  if (conversation.contact) {
    return (
      [conversation.contact.firstName, conversation.contact.lastName].filter(Boolean).join(' ') ||
      conversation.contact.email ||
      conversation.contact.phone
    );
  }

  return conversation.waProfileName;
}

function getAssignedUserName(conversation: WhatsappConversation) {
  if (!conversation.assignedUser) {
    return 'Unassigned';
  }

  return (
    [conversation.assignedUser.firstName, conversation.assignedUser.lastName].filter(Boolean).join(' ') ||
    conversation.assignedUser.email
  );
}

function getConversationInitials(conversation: WhatsappConversation) {
  const displayName = getContactName(conversation);
  if (displayName) {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    return parts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  return conversation.waContactPhone.replace(/^\+/, '').trim().charAt(0).toUpperCase() || '?';
}

function getContactDisplayName(contact: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || contact.phone || 'Unnamed contact';
}

function getMembershipName(membership: MembershipOption) {
  return [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email;
}

function getAssignmentErrorMessage(error: RequestError) {
  if (error.status === 409 || error.message.toLocaleLowerCase().includes('assigned to another user')) {
    return 'This conversation is already assigned to another team member.';
  }

  if (error.status === 403) {
    return 'You do not have permission to assign this conversation.';
  }

  if (error.status === 400 || error.status === 404) {
    return 'This user cannot be assigned.';
  }

  return 'Could not update assignment.';
}

function getLatestMessage(conversation: WhatsappConversation) {
  return conversation.messages?.[0];
}

function getEmptyStateMessage({
  unreadFilter,
  waitingForReplyFilter,
  contactStatusFilter,
  linkStateFilter,
}: {
  unreadFilter: boolean;
  waitingForReplyFilter: boolean;
  contactStatusFilter: ContactStatusFilter;
  linkStateFilter: LinkStateFilter;
}) {
  const activeCount =
    (unreadFilter ? 1 : 0) +
    (waitingForReplyFilter ? 1 : 0) +
    (contactStatusFilter !== 'ALL' ? 1 : 0) +
    (linkStateFilter !== 'ALL' ? 1 : 0);

  if (activeCount > 1) return 'No conversations match these filters.';
  if (unreadFilter) return 'No unread conversations.';
  if (waitingForReplyFilter) return 'No conversations waiting for a reply.';
  if (contactStatusFilter === 'PROSPECT') return 'No prospect contact conversations found.';
  if (contactStatusFilter === 'CUSTOMER') return 'No customer conversations found.';
  if (contactStatusFilter === 'ARCHIVED') return 'No archived-contact conversations found.';
  if (linkStateFilter === 'linked') return 'No linked conversations found.';
  if (linkStateFilter === 'unlinked') return 'No unlinked conversations found.';
  return 'No WhatsApp conversations yet.';
}

function conversationHasUnread(conversation: WhatsappConversation | null | undefined) {
  return Boolean(
    conversation &&
      (conversation.unreadCount > 0 || ('hasUnread' in conversation && conversation.hasUnread === true)),
  );
}

function normalizePhoneSearch(value: string) {
  return value.replace(/\D/g, '');
}

function conversationMatchesSearch(conversation: WhatsappConversation, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const contactName = conversation.contact
    ? [conversation.contact.firstName, conversation.contact.lastName].filter(Boolean).join(' ')
    : '';
  const searchableValues = [
    contactName,
    conversation.waProfileName,
    conversation.waContactPhone,
    conversation.contact?.phone,
    conversation.contact?.email,
  ];

  if (searchableValues.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))) {
    return true;
  }

  const normalizedPhoneQuery = normalizePhoneSearch(normalizedQuery);
  return (
    normalizedPhoneQuery.length > 0 &&
    [conversation.waContactPhone, conversation.contact?.phone].some((phone) =>
      normalizePhoneSearch(phone ?? '').includes(normalizedPhoneQuery),
    )
  );
}

function mergeConversation<T extends WhatsappConversation>(current: T, update: WhatsappConversation): T {
  return {
    ...current,
    ...update,
    contact: 'contact' in update ? update.contact ?? null : current.contact,
    assignedUser: 'assignedUser' in update ? update.assignedUser ?? null : current.assignedUser,
    messages: current.messages,
  } as T;
}

function areMessagesEqual(current: WhatsappMessage[], next: WhatsappMessage[]) {
  return (
    current.length === next.length &&
    current.every((message, index) => {
      const nextMessage = next[index];
      return (
        nextMessage !== undefined &&
        message.id === nextMessage.id &&
        message.status === nextMessage.status &&
        message.text === nextMessage.text &&
        message.sentAt === nextMessage.sentAt &&
        message.updatedAt === nextMessage.updatedAt
      );
    })
  );
}

function getMessageActivityTime(message: WhatsappMessage) {
  return message.sentAt ?? message.createdAt;
}

function syncConversationLatestMessage(
  conversations: WhatsappConversationListItem[],
  conversationId: string,
  latestMessage: WhatsappMessage,
): WhatsappConversationListItem[] {
  const conversationIndex = conversations.findIndex((conversation) => conversation.id === conversationId);
  if (conversationIndex === -1) {
    return conversations;
  }

  const conversation = conversations[conversationIndex];
  const currentLatestMessage = getLatestMessage(conversation);
  const lastMessageAt = getMessageActivityTime(latestMessage);
  const currentActivityTime = new Date(conversation.lastMessageAt ?? conversation.createdAt).getTime();
  const nextActivityTime = new Date(lastMessageAt).getTime();
  const currentMessageCreatedAt = currentLatestMessage
    ? new Date(currentLatestMessage.createdAt).getTime()
    : Number.NEGATIVE_INFINITY;
  const nextMessageCreatedAt = new Date(latestMessage.createdAt).getTime();
  if (
    currentActivityTime > nextActivityTime ||
    (currentActivityTime === nextActivityTime && currentMessageCreatedAt > nextMessageCreatedAt)
  ) {
    return conversations;
  }

  const unchanged =
    conversation.lastMessageAt === lastMessageAt &&
    currentLatestMessage?.id === latestMessage.id &&
    currentLatestMessage.status === latestMessage.status &&
    currentLatestMessage.text === latestMessage.text &&
    currentLatestMessage.updatedAt === latestMessage.updatedAt;

  if (unchanged) {
    return conversations;
  }

  const updatedConversation: WhatsappConversationListItem = {
    ...conversation,
    lastMessageAt,
    messages: [latestMessage],
  };
  const next = [...conversations];
  next[conversationIndex] = updatedConversation;
  next.sort(
    (left, right) =>
      new Date(right.lastMessageAt ?? right.createdAt).getTime() -
      new Date(left.lastMessageAt ?? left.createdAt).getTime(),
  );
  return next;
}

export function WhatsAppPage() {
  const { accessToken, logout, user } = useAuth();
  const [conversations, setConversations] = useState<WhatsappConversationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const [mobileConversationTab, setMobileConversationTab] = useState<MobileConversationTab>('CHAT');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN');
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadFilter, setUnreadFilter] = useState(false);
  const [waitingForReplyFilter, setWaitingForReplyFilter] = useState(false);
  const [contactStatusFilter, setContactStatusFilter] = useState<ContactStatusFilter>('ALL');
  const [linkStateFilter, setLinkStateFilter] = useState<LinkStateFilter>('ALL');
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<RequestError | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [membershipWarning, setMembershipWarning] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<RequestError | null>(null);
  const [messagesRefreshKey, setMessagesRefreshKey] = useState(0);
  const [hasNewMessagesBelow, setHasNewMessagesBelow] = useState(false);
  const [readWarning, setReadWarning] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentSuccess, setAssignmentSuccess] = useState<string | null>(null);
  const [composerBody, setComposerBody] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateSuccess, setTemplateSuccess] = useState<string | null>(null);
  const [approvedTemplateModalOpen, setApprovedTemplateModalOpen] = useState(false);
  const [approvedTemplateSuccess, setApprovedTemplateSuccess] = useState<string | null>(null);
  const [savedRepliesOpen, setSavedRepliesOpen] = useState(false);
  const [contactModal, setContactModal] = useState<'link' | 'create' | null>(null);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [contactSearchLoading, setContactSearchLoading] = useState(false);
  const [contactActionLoading, setContactActionLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [createContactFirstName, setCreateContactFirstName] = useState('');
  const [createContactLastName, setCreateContactLastName] = useState('');
  const [crmRailTab, setCrmRailTab] = useState<CrmRailTab>('CRM');
  const [isCrmRailOpen, setIsCrmRailOpen] = useState(true);
  const [crmContextRefreshKey, setCrmContextRefreshKey] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState(
    getWhatsappNotificationPermission,
  );
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<WhatsappMessage[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const selectedHasUnreadRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const activeSearchQuery = searchQuery.trim();
  const filteredConversations = useMemo(
    () => conversations.filter((conversation) => conversationMatchesSearch(conversation, activeSearchQuery)),
    [activeSearchQuery, conversations],
  );
  const assignableMemberships = useMemo(
    () => memberships.filter((membership) => membership.role !== 'VIEWER'),
    [memberships],
  );
  const assignmentFilters = useMemo(() => {
    if (assignmentFilter === 'MINE') {
      return { mine: true };
    }

    if (assignmentFilter === 'UNASSIGNED') {
      return { unassigned: true };
    }

    return {};
  }, [assignmentFilter]);

  const triageFilters = useMemo(() => {
    const filters: {
      unread?: boolean;
      waitingForReply?: boolean;
      contactStatus?: 'PROSPECT' | 'CUSTOMER' | 'ARCHIVED';
      linkState?: 'linked' | 'unlinked';
    } = {};
    if (unreadFilter) filters.unread = true;
    if (waitingForReplyFilter) filters.waitingForReply = true;
    if (contactStatusFilter !== 'ALL') filters.contactStatus = contactStatusFilter;
    if (linkStateFilter !== 'ALL') filters.linkState = linkStateFilter;
    return filters;
  }, [contactStatusFilter, linkStateFilter, unreadFilter, waitingForReplyFilter]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMobileView('list');
    }
  }, [selectedId]);

  useEffect(() => {
    selectedHasUnreadRef.current = conversationHasUnread(selectedConversation);
  }, [selectedConversation]);

  useEffect(() => {
    if (!accessToken) {
      setConversations([]);
      setListLoading(false);
      setListError(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchConversations() {
      setListLoading(true);
      setListError(null);

      try {
        const response =
          statusFilter === 'ALL'
            ? (
                await Promise.all([
                  listWhatsappConversations(token, { status: 'OPEN', ...assignmentFilters, ...triageFilters }),
                  listWhatsappConversations(token, { status: 'CLOSED', ...assignmentFilters, ...triageFilters }),
                ])
              )
                .flat()
                .sort(
                  (left, right) =>
                    new Date(right.lastMessageAt ?? right.createdAt).getTime() -
                    new Date(left.lastMessageAt ?? left.createdAt).getTime(),
                )
            : await listWhatsappConversations(token, { status: statusFilter, ...assignmentFilters, ...triageFilters });

        if (!active) {
          return;
        }

        const selectedConversationId = selectedIdRef.current;
        const latestSelectedMessage = messagesRef.current[messagesRef.current.length - 1];
        setConversations(
          selectedConversationId && latestSelectedMessage
            ? syncConversationLatestMessage(response, selectedConversationId, latestSelectedMessage)
            : response,
        );
        setSelectedId((current) =>
          current && response.some((conversation) => conversation.id === current) ? current : null,
        );
      } catch (error) {
        if (!active) {
          return;
        }

        setListError(toRequestError(error, 'Could not load WhatsApp conversations.'));
      } finally {
        if (active) {
          setListLoading(false);
        }
      }
    }

    void fetchConversations();

    return () => {
      active = false;
    };
  }, [accessToken, assignmentFilters, listRefreshKey, statusFilter, triageFilters]);

  useEffect(() => {
    if (!accessToken) {
      setMemberships([]);
      setMembershipsLoading(false);
      setMembershipWarning(null);
      return;
    }

    let active = true;
    const token = accessToken;

    async function fetchMemberships() {
      setMembershipsLoading(true);
      setMembershipWarning(null);

      try {
        const response = await listMembershipOptions(token);
        if (active) {
          setMemberships(response);
        }
      } catch (error) {
        if (active) {
          setMembershipWarning(toRequestError(error, 'Could not load team members.').message);
        }
      } finally {
        if (active) {
          setMembershipsLoading(false);
        }
      }
    }

    void fetchMemberships();

    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedId) {
      setMessages([]);
      setMessagesLoading(false);
      setMessagesError(null);
      setReadWarning(null);
      return;
    }

    let active = true;
    const token = accessToken;
    const conversationId = selectedId;

    async function fetchMessages() {
      setMessagesLoading(true);
      setMessagesError(null);
      setReadWarning(null);

      try {
        const response = await getWhatsappConversationMessages(token, conversationId);
        if (active) {
          const current = messagesRef.current;
          if (!areMessagesEqual(current, response)) {
            const currentLastMessageId = current[current.length - 1]?.id;
            const nextLastMessageId = response[response.length - 1]?.id;
            const receivedNewMessage =
              current.length > 0 &&
              response.length >= current.length &&
              currentLastMessageId !== nextLastMessageId;

            messagesRef.current = response;
            setMessages(response);

            const latestMessage = response[response.length - 1];
            if (latestMessage) {
              setConversations((currentConversations) =>
                syncConversationLatestMessage(currentConversations, conversationId, latestMessage),
              );
            }

            if (receivedNewMessage && !shouldAutoScrollRef.current) {
              setHasNewMessagesBelow(true);
            }
          }
        }
      } catch (error) {
        if (active) {
          setMessagesError(toRequestError(error, 'Could not load messages.'));
        }
      } finally {
        if (active) {
          setMessagesLoading(false);
        }
      }

      if (selectedHasUnreadRef.current) {
        try {
          const updated = await markWhatsappConversationRead(token, conversationId);
          if (active) {
            selectedHasUnreadRef.current = false;
            setConversations((current) =>
              current.map((conversation) =>
                conversation.id === conversationId ? mergeConversation(conversation, updated) : conversation,
              ),
            );
            markConversationAttentionCleared();
          }
        } catch (error) {
          if (active) {
            setReadWarning(toRequestError(error, 'Could not mark this conversation as read.').message);
          }
        }
      }
    }

    void fetchMessages();

    return () => {
      active = false;
    };
  }, [accessToken, messagesRefreshKey, selectedId]);

  useEffect(() => {
    if (listError?.status === 401 || messagesError?.status === 401) {
      void logout();
    }
  }, [listError?.status, logout, messagesError?.status]);

  useEffect(() => {
    setComposerBody('');
    setSendError(null);
    setTemplateError(null);
    setTemplateSuccess(null);
    setApprovedTemplateSuccess(null);
    setApprovedTemplateModalOpen(false);
    setSavedRepliesOpen(false);
    setAssignmentError(null);
    setAssignmentSuccess(null);
    setContactModal(null);
    setContactError(null);
    setContactResults([]);
    setMessages([]);
    messagesRef.current = [];
    setHasNewMessagesBelow(false);
    shouldAutoScrollRef.current = true;
  }, [selectedId]);

  useEffect(() => {
    if (!accessToken || contactModal !== 'link') {
      setContactSearchLoading(false);
      return;
    }

    const query = contactSearchQuery.trim();
    let active = true;
    const timeoutId = window.setTimeout(async () => {
      setContactSearchLoading(true);
      setContactError(null);

      try {
        const response = await listContacts(accessToken, {
          search: query || undefined,
          page: 1,
          limit: 8,
        });
        if (active) {
          setContactResults(response.data);
        }
      } catch (error) {
        if (active) {
          const requestError = toRequestError(error, 'Could not search contacts.');
          setContactError(requestError.message);
          if (requestError.status === 401) {
            void logout();
          }
        }
      } finally {
        if (active) {
          setContactSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [accessToken, contactModal, contactSearchQuery, logout]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const interval = selectedId
      ? CONVERSATION_LIST_POLL_INTERVAL_ACTIVE_MS
      : CONVERSATION_LIST_POLL_INTERVAL_IDLE_MS;

    const listIntervalId = window.setInterval(() => {
      if (document.hidden) {
        return;
      }

      setListRefreshKey((current) => current + 1);
    }, interval);

    return () => {
      window.clearInterval(listIntervalId);
    };
  }, [accessToken, selectedId]);

  useEffect(() => {
    if (!accessToken || !selectedId) {
      return;
    }

    const threadIntervalId = window.setInterval(() => {
      if (document.hidden) {
        return;
      }

      setMessagesRefreshKey((current) => current + 1);
    }, SELECTED_THREAD_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(threadIntervalId);
    };
  }, [accessToken, selectedId]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (!accessToken || document.hidden) {
        return;
      }

      setListRefreshKey((current) => current + 1);
      if (selectedId) {
        setMessagesRefreshKey((current) => current + 1);
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [accessToken, selectedId]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList || !shouldAutoScrollRef.current) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      messageList.scrollTo({ top: messageList.scrollHeight, behavior: 'smooth' });
      setHasNewMessagesBelow(false);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [messages, selectedId]);

  function refreshInbox() {
    scrollToLatestMessage();
    setListRefreshKey((current) => current + 1);
    if (selectedId) {
      setMessagesRefreshKey((current) => current + 1);
    }
  }

  async function enableDesktopAlerts() {
    const permission = await requestWhatsappNotificationPermission();
    setNotificationPermission(permission);
  }

  function handleMessageListScroll() {
    const messageList = messageListRef.current;
    if (!messageList) {
      return;
    }

    const distanceFromBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;
    if (shouldAutoScrollRef.current) {
      setHasNewMessagesBelow(false);
    }
  }

  function scrollToLatestMessage() {
    const messageList = messageListRef.current;
    if (!messageList) {
      return;
    }

    shouldAutoScrollRef.current = true;
    setHasNewMessagesBelow(false);
    messageList.scrollTo({ top: messageList.scrollHeight, behavior: 'smooth' });
  }

  async function handleConversationAction() {
    if (!accessToken || !selectedConversation) {
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      const updated =
        selectedConversation.status === 'OPEN'
          ? await closeWhatsappConversation(accessToken, selectedConversation.id)
          : await reopenWhatsappConversation(accessToken, selectedConversation.id);

      setConversations((current) => {
        if (statusFilter !== 'ALL' && updated.status !== statusFilter) {
          return current.filter((conversation) => conversation.id !== updated.id);
        }

        return current.map((conversation) =>
          conversation.id === updated.id ? mergeConversation(conversation, updated) : conversation,
        );
      });

      if (statusFilter !== 'ALL' && updated.status !== statusFilter) {
        setSelectedId(null);
        setMobileView('list');
      }
    } catch (error) {
      const requestError = toRequestError(error, 'Could not update the conversation.');
      setActionError(requestError.message);
      if (requestError.status === 401) {
        void logout();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUpdateAssignment(assignedUserId: string | null) {
    if (!accessToken || !selectedConversation || assignmentLoading) {
      return;
    }

    setAssignmentLoading(true);
    setAssignmentError(null);
    setAssignmentSuccess(null);

    try {
      const updated = await updateWhatsappConversationAssignment(accessToken, selectedConversation.id, assignedUserId);
      setConversations((current) => {
        const updatedCurrent = current.map((conversation) =>
          conversation.id === updated.id ? mergeConversation(conversation, updated) : conversation,
        );

        if (
          (assignmentFilter === 'MINE' && updated.assignedUserId !== user?.id) ||
          (assignmentFilter === 'UNASSIGNED' && updated.assignedUserId !== null)
        ) {
          return updatedCurrent.filter((conversation) => conversation.id !== updated.id);
        }

        return updatedCurrent;
      });

      if (
        (assignmentFilter === 'MINE' && updated.assignedUserId !== user?.id) ||
        (assignmentFilter === 'UNASSIGNED' && updated.assignedUserId !== null)
      ) {
        setSelectedId(null);
        setMobileView('list');
      }

      setAssignmentSuccess(assignedUserId ? 'Conversation assigned.' : 'Conversation unassigned.');
      setListRefreshKey((current) => current + 1);
    } catch (error) {
      const requestError = toRequestError(error, 'Could not update assignment.');
      setAssignmentError(getAssignmentErrorMessage(requestError));

      if (requestError.status === 401) {
        void logout();
      }
    } finally {
      setAssignmentLoading(false);
    }
  }

  function applyConversationUpdate(updated: WhatsappConversation) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === updated.id ? mergeConversation(conversation, updated) : conversation,
      ),
    );
  }

  function openLinkContactModal() {
    if (!selectedConversation) {
      return;
    }

    setContactSearchQuery(selectedConversation.waContactPhone);
    setContactResults([]);
    setContactError(null);
    setContactModal('link');
  }

  function openCreateContactModal() {
    if (!selectedConversation) {
      return;
    }

    setCreateContactFirstName(selectedConversation.waProfileName ?? '');
    setCreateContactLastName('');
    setContactError(null);
    setContactModal('create');
  }

  async function handleLinkContact(contactId: string) {
    if (!accessToken || !selectedConversation || contactActionLoading) {
      return;
    }

    setContactActionLoading(true);
    setContactError(null);

    try {
      const updated = await linkWhatsappConversationContact(accessToken, selectedConversation.id, contactId);
      applyConversationUpdate(updated);
      setContactModal(null);
      setListRefreshKey((current) => current + 1);
    } catch (error) {
      const requestError = toRequestError(error, 'Could not link this contact.');
      setContactError(requestError.status === 404 ? 'Contact or conversation not found.' : requestError.message);
      if (requestError.status === 401) {
        void logout();
      }
    } finally {
      setContactActionLoading(false);
    }
  }

  async function handleUnlinkContact() {
    if (!accessToken || !selectedConversation || !selectedConversation.contact || contactActionLoading) {
      return;
    }

    setContactActionLoading(true);
    setContactError(null);

    try {
      const updated = await unlinkWhatsappConversationContact(accessToken, selectedConversation.id);
      applyConversationUpdate(updated);
      setListRefreshKey((current) => current + 1);
    } catch (error) {
      const requestError = toRequestError(error, 'Could not unlink this contact.');
      setContactError(requestError.message);
      if (requestError.status === 401) {
        void logout();
      }
    } finally {
      setContactActionLoading(false);
    }
  }

  async function handleCreateContactFromConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !selectedConversation || contactActionLoading) {
      return;
    }

    setContactActionLoading(true);
    setContactError(null);

    try {
      const updated = await createContactFromWhatsappConversation(accessToken, selectedConversation.id, {
        firstName: createContactFirstName.trim() || undefined,
        lastName: createContactLastName.trim() || undefined,
      });
      applyConversationUpdate(updated);
      setContactModal(null);
      setListRefreshKey((current) => current + 1);
    } catch (error) {
      const requestError = toRequestError(error, 'Could not create this contact.');
      setContactError(
        requestError.status === 409 ? 'This conversation is already linked to a contact.' : requestError.message,
      );
      if (requestError.status === 401) {
        void logout();
      }
    } finally {
      setContactActionLoading(false);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = composerBody.trim();
    if (!accessToken || !selectedConversation || !selectedConversation.replyEligible || !body || sendLoading) {
      return;
    }

    setSendLoading(true);
    setSendError(null);

    try {
      await sendWhatsappMessage(accessToken, {
        conversationId: selectedConversation.id,
        body,
      });
      setComposerBody('');
      setMessagesRefreshKey((current) => current + 1);
      setListRefreshKey((current) => current + 1);
    } catch (error) {
      const requestError = toRequestError(error, 'Could not send the message. Please try again.');
      setSendError(getWhatsappSendErrorMessage(requestError.code));

      if (requestError.status === 401) {
        void logout();
      }
    } finally {
      setSendLoading(false);
    }
  }

  async function handleSendRestartTemplate() {
    if (!accessToken || !selectedConversation || selectedConversation.replyEligible || templateLoading) {
      return;
    }

    setTemplateLoading(true);
    setTemplateError(null);
    setTemplateSuccess(null);
    setSendError(null);

    try {
      await sendWhatsappRestartTemplate(accessToken, selectedConversation.id);
      setTemplateSuccess('Restart template sent.');
      setMessagesRefreshKey((current) => current + 1);
      setListRefreshKey((current) => current + 1);
    } catch (error) {
      const requestError = toRequestError(error, 'Could not send the restart template. Please try again.');
      setTemplateError(getWhatsappTemplateErrorMessage(requestError.code));

      if (requestError.status === 401) {
        void logout();
      }
    } finally {
      setTemplateLoading(false);
    }
  }

  function handleApprovedTemplateSent() {
    setApprovedTemplateModalOpen(false);
    setApprovedTemplateSuccess('Approved template sent.');
    setMessagesRefreshKey((current) => current + 1);
    setListRefreshKey((current) => current + 1);
  }

  return (
    <AppShell mainClassName="p-0">
      <div className="flex h-[calc(100dvh-7.25rem-env(safe-area-inset-bottom))] min-h-0 min-w-0 flex-col overflow-x-hidden bg-gray-100 lg:h-[calc(100dvh-3rem)] lg:p-2">
        <div
          className={[
            'mx-auto grid min-h-0 min-w-0 w-full max-w-full flex-1 overflow-hidden border border-gray-200 bg-white shadow-sm lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:rounded-xl',
            isCrmRailOpen
              ? 'xl:grid-cols-[18.5rem_minmax(500px,1fr)_20.5rem] 2xl:grid-cols-[19rem_minmax(520px,1fr)_21rem]'
              : 'xl:grid-cols-[18.5rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(0,1fr)]',
          ].join(' ')}
        >
          <section
            className={`min-h-0 min-w-0 overflow-hidden flex-col border-gray-200 bg-white lg:flex lg:border-r ${
              mobileView === 'list' ? 'flex' : 'hidden'
            }`}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-white px-3.5 py-2">
              <div className="min-w-0">
                <h1 className="text-lg font-semibold leading-5 text-gray-950">WhatsApp</h1>
                <p className="text-[11px] font-semibold text-gray-500">Business inbox</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {notificationPermission === 'default' ? (
                  <button
                    type="button"
                    onClick={() => void enableDesktopAlerts()}
                    className="inline-flex h-7 shrink-0 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 shadow-sm hover:border-emerald-300 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
                  >
                    Enable desktop alerts
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={refreshInbox}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-700 shadow-sm hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="border-b border-gray-100 bg-white px-3.5 py-2">
              <div>
                <label htmlFor="whatsapp-conversation-search" className="sr-only">
                  Search conversations
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    Search
                  </span>
                  <input
                    id="whatsapp-conversation-search"
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by name or phone"
                    autoComplete="off"
                    className={`block h-9 w-full rounded-lg border border-gray-200 bg-white py-1 pl-16 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 ${
                      activeSearchQuery ? 'pr-16' : 'pr-3'
                    }`}
                  />
                  {activeSearchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-1 my-1 rounded px-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      aria-label="Clear conversation search"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <label className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600 shadow-sm">
                  <span className="shrink-0">Status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                    className="min-w-0 flex-1 border-0 bg-transparent py-0 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-0"
                  >
                    <option value="ALL">All</option>
                    <option value="OPEN">Open</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </label>
                <label className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600 shadow-sm">
                  <span className="shrink-0">Assign</span>
                  <select
                    value={assignmentFilter}
                    onChange={(event) => setAssignmentFilter(event.target.value as AssignmentFilter)}
                    className="min-w-0 flex-1 border-0 bg-transparent py-0 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-0"
                  >
                    <option value="ALL">All</option>
                    <option value="MINE">Mine</option>
                    <option value="UNASSIGNED">Unassigned</option>
                  </select>
                </label>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <label className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600 shadow-sm">
                  <span className="shrink-0">Contact</span>
                  <select
                    value={contactStatusFilter}
                    onChange={(event) => setContactStatusFilter(event.target.value as ContactStatusFilter)}
                    className="min-w-0 flex-1 border-0 bg-transparent py-0 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-0"
                  >
                    <option value="ALL">All</option>
                    <option value="PROSPECT">Prospect contacts</option>
                    <option value="CUSTOMER">Customers</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </label>
                <label className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600 shadow-sm">
                  <span className="shrink-0">Link</span>
                  <select
                    value={linkStateFilter}
                    onChange={(event) => setLinkStateFilter(event.target.value as LinkStateFilter)}
                    className="min-w-0 flex-1 border-0 bg-transparent py-0 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-0"
                  >
                    <option value="ALL">All</option>
                    <option value="linked">Linked</option>
                    <option value="unlinked">Unlinked</option>
                  </select>
                </label>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setUnreadFilter((v) => !v)}
                  aria-pressed={unreadFilter}
                  className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 ${
                    unreadFilter
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Unread
                </button>
                <button
                  type="button"
                  onClick={() => setWaitingForReplyFilter((v) => !v)}
                  aria-pressed={waitingForReplyFilter}
                  className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 ${
                    waitingForReplyFilter
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Waiting for reply
                </button>
              </div>
              {activeSearchQuery ? (
                <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 text-xs text-gray-500">
                  <p className="min-w-0 truncate">
                    Showing results for{' '}
                    <span className="font-medium text-gray-700">&ldquo;{activeSearchQuery}&rdquo;</span>
                  </p>
                  <span className="shrink-0 font-medium text-gray-600">
                    {filteredConversations.length} {filteredConversations.length === 1 ? 'result' : 'results'}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {listLoading && conversations.length === 0 ? <ConversationListLoading /> : null}

              {!listLoading && listError && conversations.length === 0 ? (
                <div className="p-5">
                  <p className="text-sm font-semibold text-red-900">Could not load conversations</p>
                  <p className="mt-2 text-sm text-red-700">{listError.message}</p>
                  <button
                    type="button"
                    onClick={() => setListRefreshKey((current) => current + 1)}
                    className="mt-4 rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800"
                  >
                    Retry
                  </button>
                </div>
              ) : null}

              {!listLoading && listError && conversations.length > 0 ? (
                <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
                  Could not update conversations. Showing the latest loaded results.
                </p>
              ) : null}

              {!listLoading && !listError && conversations.length === 0 && !activeSearchQuery ? (
                <p className="p-6 text-center text-sm text-gray-500">
                  {getEmptyStateMessage({
                    unreadFilter,
                    waitingForReplyFilter,
                    contactStatusFilter,
                    linkStateFilter,
                  })}
                </p>
              ) : null}

              {!listLoading && !listError && activeSearchQuery && filteredConversations.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm font-semibold text-gray-800">No conversations found</p>
                  <p className="mt-1.5 text-sm leading-5 text-gray-500">Try a different name or phone number.</p>
                </div>
              ) : null}

              {filteredConversations.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  conversation={conversation}
                  selected={conversation.id === selectedId}
                  onSelect={() => {
                    setSelectedId(conversation.id);
                    setMobileView('thread');
                    setMobileConversationTab('CHAT');
                    setActionError(null);
                    setAssignmentError(null);
                    setAssignmentSuccess(null);
                    setSendError(null);
                  }}
                />
              ))}
            </div>
          </section>

          <div className={`min-h-0 min-w-0 ${mobileView === 'thread' ? 'flex' : 'hidden'} lg:contents`}>
            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f3f6f5]">
              {!selectedConversation ? (
                <div className="flex flex-1 items-center justify-center p-8 text-center">
                  <div className="max-w-sm rounded-2xl border border-gray-200 bg-white px-8 py-10 shadow-sm">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-lg font-semibold text-emerald-700">
                      W
                    </div>
                    <p className="mt-4 text-base font-semibold text-gray-800">No conversation selected</p>
                    <p className="mt-1.5 text-sm leading-6 text-gray-500">
                      Choose a conversation from the inbox to view its messages.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <ConversationHeader
                    conversation={selectedConversation}
                    crmContextRefreshKey={crmContextRefreshKey}
                    actionError={actionError}
                    actionLoading={actionLoading}
                    assignableMemberships={assignableMemberships}
                    assignmentError={assignmentError}
                    assignmentLoading={assignmentLoading}
                    assignmentSuccess={assignmentSuccess}
                    membershipsLoading={membershipsLoading}
                    membershipWarning={membershipWarning}
                    onBack={() => {
                      setMobileView('list');
                      setMobileConversationTab('CHAT');
                    }}
                    onAction={() => void handleConversationAction()}
                    onAssignToMe={() => void handleUpdateAssignment(user?.id ?? null)}
                    onSelectAssignee={(assignedUserId) => void handleUpdateAssignment(assignedUserId)}
                    onUnassign={() => void handleUpdateAssignment(null)}
                    onShowCrmRail={() => setIsCrmRailOpen(true)}
                    showCrmRailControl={!isCrmRailOpen}
                    userId={user?.id ?? null}
                  />

                  <MobileConversationTabs
                    activeTab={mobileConversationTab}
                    onTabChange={setMobileConversationTab}
                  />

                  <div
                    className={`shrink-0 border-b border-gray-200 bg-slate-50 lg:block xl:hidden ${
                      mobileConversationTab === 'CHAT' ? 'block' : 'hidden'
                    }`}
                  >
                    <ContactLinkPanel
                      conversation={selectedConversation}
                      error={contactModal ? null : contactError}
                      loading={contactActionLoading}
                      onCreate={openCreateContactModal}
                      onLink={openLinkContactModal}
                      onUnlink={() => void handleUnlinkContact()}
                      variant="compact"
                    />

                    <div className="hidden lg:block">
                      {selectedConversation.contactId ? (
                        <CrmContextPanel
                          conversation={selectedConversation}
                          onContextChanged={() => setCrmContextRefreshKey((current) => current + 1)}
                          variant="compact"
                        />
                      ) : null}
                    </div>
                  </div>

                  {mobileConversationTab === 'CRM' ? (
                    <MobileCrmPanel
                      conversation={selectedConversation}
                      contactError={contactModal ? null : contactError}
                      contactLoading={contactActionLoading}
                      onContextChanged={() => setCrmContextRefreshKey((current) => current + 1)}
                      onCreateContact={openCreateContactModal}
                      onLinkContact={openLinkContactModal}
                      onUnlinkContact={() => void handleUnlinkContact()}
                    />
                  ) : null}

                  <div className={`${mobileConversationTab === 'CHAT' ? 'contents' : 'hidden'} lg:contents`}>
                  {readWarning ? (
                    <p className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
                      {readWarning}
                    </p>
                  ) : null}

                  <div className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.06)_1px,transparent_0)] [background-size:22px_22px]">
                    <div
                      ref={messageListRef}
                      onScroll={handleMessageListScroll}
                      className="h-full overflow-y-auto overscroll-contain px-3 py-2 sm:px-5 sm:py-3"
                    >
                      <div className="mx-auto h-full min-h-full w-full max-w-5xl">
                        {messagesLoading && messages.length === 0 ? <MessagesLoading /> : null}

                        {!messagesLoading && messagesError && messages.length === 0 ? (
                          <div className="rounded border border-red-200 bg-white p-5">
                            <p className="text-sm font-semibold text-red-900">Could not load messages</p>
                            <p className="mt-2 text-sm text-red-700">{messagesError.message}</p>
                            <button
                              type="button"
                              onClick={() => setMessagesRefreshKey((current) => current + 1)}
                              className="mt-4 rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800"
                            >
                              Retry
                            </button>
                          </div>
                        ) : null}

                        {!messagesLoading && messagesError && messages.length > 0 ? (
                          <p className="mb-3 rounded border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                            Could not update messages. Showing the latest loaded messages.
                          </p>
                        ) : null}

                        {!messagesLoading && !messagesError && messages.length === 0 ? (
                          <div className="flex h-full items-center justify-center text-center">
                            <p className="text-sm text-gray-500">No messages in this conversation yet.</p>
                          </div>
                        ) : null}

                        {messages.length > 0 ? (
                          <div className="space-y-1.5 sm:space-y-2">
                            {messages.map((message, index) => {
                              const previousMessage = messages[index - 1];
                              const showDateDivider =
                                !previousMessage || getMessageDateKey(previousMessage) !== getMessageDateKey(message);

                              return (
                                <div key={message.id} className="space-y-1.5 sm:space-y-2">
                                  {showDateDivider ? (
                                    <div className="flex justify-center">
                                      <span className="rounded-full border border-gray-200 bg-white/85 px-2.5 py-0.5 text-[10px] font-semibold text-gray-500 shadow-sm">
                                        {formatMessageDate(message.sentAt ?? message.createdAt)}
                                      </span>
                                    </div>
                                  ) : null}
                                  <MessageBubble message={message} />
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {hasNewMessagesBelow ? (
                      <button
                        type="button"
                        onClick={scrollToLatestMessage}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-800 shadow-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                      >
                        New messages
                      </button>
                    ) : null}
                  </div>

                  <form
                    onSubmit={handleSendMessage}
                    className="flex-shrink-0 border-t border-gray-200 bg-white/95 px-3 py-1 sm:px-5 sm:py-1.5"
                  >
                    <div className="mx-auto w-full max-w-5xl">
                      {!selectedConversation.replyEligible ? (
                        <div
                          role="status"
                          className="mb-1 rounded-lg border border-amber-100 bg-white px-2.5 py-1 text-[11px] leading-4 text-amber-900 shadow-sm"
                        >
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                            <p className="min-w-0">
                              {selectedConversation.replyWindowExpiresAt
                                ? "This customer's 24-hour reply window has closed. A WhatsApp template is required to restart the conversation."
                                : 'Waiting for the customer to message first before free-form replies are allowed. The customer must reply after receiving the template.'}
                            </p>
                            <div className="flex shrink-0 flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  void handleSendRestartTemplate();
                                }}
                                disabled={templateLoading}
                                className="rounded-full bg-amber-900 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-amber-300"
                              >
                                {templateLoading ? 'Sending...' : 'Send restart template'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setApprovedTemplateModalOpen(true)}
                                className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-amber-900 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-1"
                              >
                                Use approved template
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {templateError ? (
                        <p className="mb-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          {templateError}
                        </p>
                      ) : null}
                      {templateSuccess ? (
                        <p className="mb-2.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                          {templateSuccess}
                        </p>
                      ) : null}
                      {approvedTemplateSuccess ? (
                        <p className="mb-2.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                          {approvedTemplateSuccess}
                        </p>
                      ) : null}
                      <div className="rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
                        {/* Row 1: Reply/Note tabs + Ctrl+Enter hint */}
                        <div className="mb-0.5 flex items-center justify-between gap-2 px-1">
                          <div className="flex items-center gap-2.5 text-xs font-semibold">
                            <span className="border-b-2 border-emerald-600 pb-0.5 text-emerald-700">Reply</span>
                            <button
                              type="button"
                              disabled
                              className="pb-0.5 text-gray-400 disabled:cursor-not-allowed"
                              title="Note composer placeholder"
                            >
                              Note
                            </button>
                          </div>
                          <span className="hidden text-[10px] font-medium text-gray-400 sm:inline">Ctrl Enter to send</span>
                        </div>
                        {/* Row 2: Full-width textarea */}
                        <label htmlFor="whatsapp-message" className="sr-only">
                          Message
                        </label>
                        <textarea
                          id="whatsapp-message"
                          value={composerBody}
                          onChange={(event) => {
                            setComposerBody(event.target.value);
                            if (sendError) {
                              setSendError(null);
                            }
                            if (templateSuccess) {
                              setTemplateSuccess(null);
                            }
                            if (approvedTemplateSuccess) {
                              setApprovedTemplateSuccess(null);
                            }
                          }}
                          rows={3}
                          maxLength={4096}
                          placeholder={
                            selectedConversation.replyEligible
                              ? 'Type your message...'
                              : 'Free-form replies are unavailable'
                          }
                          disabled={sendLoading || !selectedConversation.replyEligible}
                          className="w-full resize-none rounded border border-transparent bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                        />
                        {/* Row 3: Attach/emoji left, action buttons right */}
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              disabled
                              aria-label="Attach file"
                              title="Attachments placeholder"
                              className="inline-flex h-7 w-7 items-center justify-center rounded text-sm font-semibold text-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              disabled
                              aria-label="Emoji"
                              title="Emoji placeholder"
                              className="inline-flex h-7 w-7 items-center justify-center rounded text-sm font-semibold text-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed"
                            >
                              :)
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setApprovedTemplateModalOpen(true)}
                              className="inline-flex h-7 shrink-0 items-center justify-center rounded border border-gray-200 bg-white px-2 text-[10px] font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                            >
                              Use template
                            </button>
                            {selectedConversation.replyEligible ? (
                              <button
                                type="button"
                                onClick={() => setSavedRepliesOpen(true)}
                                className="inline-flex h-7 shrink-0 items-center justify-center rounded border border-gray-200 bg-white px-2 text-[10px] font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                              >
                                Saved replies
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled
                              title="AI Assist placeholder"
                              className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-gray-200 bg-white px-2 text-[10px] font-semibold text-gray-400 disabled:cursor-not-allowed"
                            >
                              AI Assist
                              <span className="rounded-full bg-emerald-50 px-1 py-px text-[9px] text-emerald-700">New</span>
                            </button>
                            <button
                              type="submit"
                              disabled={!selectedConversation.replyEligible || !composerBody.trim() || sendLoading}
                              className="inline-flex h-7 shrink-0 items-center rounded bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-gray-300"
                            >
                              {sendLoading ? 'Sending...' : 'Send'}
                            </button>
                          </div>
                        </div>
                      </div>
                      {sendError ? <p className="mt-2 text-sm text-red-700">{sendError}</p> : null}
                    </div>
                  </form>
                  </div>
                </>
              )}
            </section>
            {isCrmRailOpen ? (
              <aside className="hidden min-h-0 min-w-0 overflow-x-hidden border-l border-gray-200 bg-white xl:flex xl:flex-col">
                {selectedConversation ? (
                  <RightCrmRail
                    activeTab={crmRailTab}
                    conversation={selectedConversation}
                    contactError={contactModal ? null : contactError}
                    contactLoading={contactActionLoading}
                    onContextChanged={() => setCrmContextRefreshKey((current) => current + 1)}
                    onCreateContact={openCreateContactModal}
                    onHide={() => setIsCrmRailOpen(false)}
                    onLinkContact={openLinkContactModal}
                    onTabChange={setCrmRailTab}
                    onUnlinkContact={() => void handleUnlinkContact()}
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center p-6 text-center">
                    <p className="text-sm text-gray-500">CRM details appear after selecting a conversation.</p>
                  </div>
                )}
              </aside>
            ) : null}
          </div>
        </div>
      </div>
      <MobileBottomNavigation />
      {selectedConversation && contactModal === 'link' ? (
        <LinkContactModal
          conversation={selectedConversation}
          contacts={contactResults}
          error={contactError}
          loading={contactSearchLoading}
          actionLoading={contactActionLoading}
          query={contactSearchQuery}
          onChangeQuery={setContactSearchQuery}
          onClose={() => setContactModal(null)}
          onSelect={(contactId) => void handleLinkContact(contactId)}
        />
      ) : null}
      {selectedConversation && contactModal === 'create' ? (
        <CreateContactFromConversationModal
          conversation={selectedConversation}
          error={contactError}
          loading={contactActionLoading}
          firstName={createContactFirstName}
          lastName={createContactLastName}
          onChangeFirstName={setCreateContactFirstName}
          onChangeLastName={setCreateContactLastName}
          onClose={() => setContactModal(null)}
          onSubmit={handleCreateContactFromConversation}
        />
      ) : null}
      {savedRepliesOpen && selectedConversation && accessToken ? (
        <SavedRepliesMenu
          token={accessToken}
          onClose={() => setSavedRepliesOpen(false)}
          onInsert={(body) => {
            const contact = selectedConversation.contact;
            const contactName = contact
              ? [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim()
              : '';
            const phone = selectedConversation.waContactPhone ?? '';
            const resolved = body
              .replace(/\{\{customerName\}\}/g, contactName || '{{customerName}}')
              .replace(/\{\{contactName\}\}/g, contactName || '{{contactName}}')
              .replace(/\{\{phone\}\}/g, phone || '{{phone}}');
            setComposerBody(resolved);
            setSavedRepliesOpen(false);
          }}
        />
      ) : null}
      {approvedTemplateModalOpen && selectedConversation && accessToken ? (
        <ApprovedTemplateModal
          conversationId={selectedConversation.id}
          replyEligible={selectedConversation.replyEligible}
          token={accessToken}
          onClose={() => setApprovedTemplateModalOpen(false)}
          onSent={handleApprovedTemplateSent}
        />
      ) : null}
    </AppShell>
  );
}

function LinkContactModal({
  actionLoading,
  contacts,
  conversation,
  error,
  loading,
  onChangeQuery,
  onClose,
  onSelect,
  query,
}: {
  actionLoading: boolean;
  contacts: Contact[];
  conversation: WhatsappConversation;
  error: string | null;
  loading: boolean;
  onChangeQuery: (value: string) => void;
  onClose: () => void;
  onSelect: (contactId: string) => void;
  query: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 px-4 py-6">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Link existing contact</h2>
              <p className="mt-1 text-sm text-gray-500">WhatsApp phone: {conversation.waContactPhone}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              Close
            </button>
          </div>
        </div>
        <div className="px-5 py-4">
          <label htmlFor="contact-search" className="sr-only">
            Search contacts
          </label>
          <input
            id="contact-search"
            value={query}
            onChange={(event) => onChangeQuery(event.target.value)}
            placeholder="Search by name, phone, or email"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
          <div className="mt-4 max-h-80 overflow-y-auto rounded-lg border border-gray-200">
            {loading ? <p className="px-4 py-5 text-center text-sm text-gray-500">Searching contacts...</p> : null}
            {!loading && contacts.length === 0 ? (
              <p className="px-4 py-5 text-center text-sm text-gray-500">No contacts found.</p>
            ) : null}
            {!loading
              ? contacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => onSelect(contact.id)}
                    disabled={actionLoading}
                    className="block w-full border-b border-gray-100 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50 focus:bg-emerald-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{getContactDisplayName(contact)}</p>
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {[contact.phone, contact.email].filter(Boolean).join(' / ') || 'No phone or email'}
                        </p>
                      </div>
                      <ContactStatusBadge status={contact.status} />
                    </div>
                  </button>
                ))
              : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateContactFromConversationModal({
  conversation,
  error,
  firstName,
  lastName,
  loading,
  onChangeFirstName,
  onChangeLastName,
  onClose,
  onSubmit,
}: {
  conversation: WhatsappConversation;
  error: string | null;
  firstName: string;
  lastName: string;
  loading: boolean;
  onChangeFirstName: (value: string) => void;
  onChangeLastName: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 px-4 py-6">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Create contact</h2>
              <p className="mt-1 text-sm text-gray-500">Phone will be copied from the WhatsApp conversation.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              Close
            </button>
          </div>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600" htmlFor="contact-phone">
              Phone
            </label>
            <input
              id="contact-phone"
              value={conversation.waContactPhone}
              readOnly
              className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-700"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600" htmlFor="contact-first-name">
                First name
              </label>
              <input
                id="contact-first-name"
                value={firstName}
                onChange={(event) => onChangeFirstName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600" htmlFor="contact-last-name">
                Last name
              </label>
              <input
                id="contact-last-name"
                value={lastName}
                onChange={(event) => onChangeLastName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {loading ? 'Creating...' : 'Create and link'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ApprovedTemplateModal({
  conversationId,
  replyEligible,
  token,
  onClose,
  onSent,
}: {
  conversationId: string;
  replyEligible: boolean;
  token: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [templates, setTemplates] = useState<WhatsappApprovedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsappApprovedTemplate | null>(null);
  const [variableValues, setVariableValues] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  function loadTemplates() {
    setLoading(true);
    setLoadError(null);
    let cancelled = false;
    listApprovedTemplates(token)
      .then((result) => {
        if (!cancelled) {
          setTemplates(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Could not load approved templates. Please try again.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }

  useEffect(loadTemplates, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedVariables = useMemo(
    () =>
      selectedTemplate
        ? [...selectedTemplate.variables].sort((a, b) => a.position - b.position)
        : [],
    [selectedTemplate],
  );

  const previewText = useMemo(() => {
    if (!selectedTemplate?.bodyPreview) return null;
    return sortedVariables.reduce((text, v, i) => {
      const val = variableValues[i]?.trim();
      return text.split(`{{${v.position}}}`).join(val || `{{${v.position}}}`);
    }, selectedTemplate.bodyPreview);
  }, [selectedTemplate, sortedVariables, variableValues]);

  const allVariablesFilled =
    sortedVariables.length === 0 || variableValues.every((v) => v.trim().length > 0);

  function handleSelectTemplate(template: WhatsappApprovedTemplate) {
    const sorted = [...template.variables].sort((a, b) => a.position - b.position);
    setVariableValues(sorted.map(() => ''));
    setSelectedTemplate(template);
    setSendError(null);
  }

  function handleBack() {
    setSelectedTemplate(null);
    setSendError(null);
  }

  async function handleSend() {
    if (!selectedTemplate || !allVariablesFilled || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await sendWhatsappApprovedTemplate(token, conversationId, {
        templateId: selectedTemplate.id,
        variables: variableValues.map((v) => v.trim()),
      });
      onSent();
    } catch (error) {
      const err = toRequestError(error, 'Could not send the template. Please try again.');
      setSendError(
        (err.code && WHATSAPP_TEMPLATE_ERROR_MESSAGES[err.code]) || err.message,
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white sm:bg-gray-950/40 sm:items-end sm:justify-end md:items-center md:justify-center md:p-4">
      <div className="flex flex-1 flex-col overflow-hidden bg-white sm:flex-initial sm:w-full sm:max-w-lg sm:rounded-xl sm:shadow-xl md:max-h-[85vh]">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
          {selectedTemplate ? (
            <button
              type="button"
              onClick={handleBack}
              className="shrink-0 rounded-md p-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              aria-label="Back to template list"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-gray-900">
              {selectedTemplate ? selectedTemplate.name : 'Send Approved Template'}
            </h2>
            {!selectedTemplate ? (
              <p className="text-xs text-gray-500">Meta-approved WhatsApp templates</p>
            ) : (
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500">{selectedTemplate.languageCode}</span>
                {selectedTemplate.category ? (
                  <span className="text-xs text-gray-400">· {selectedTemplate.category}</span>
                ) : null}
                {selectedTemplate.variables.length > 0 ? (
                  <span className="text-xs text-gray-400">
                    · {selectedTemplate.variables.length} variable
                    {selectedTemplate.variables.length !== 1 ? 's' : ''}
                  </span>
                ) : null}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            Close
          </button>
        </div>

        {/* Reply window note */}
        {!replyEligible ? (
          <div className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-2 sm:px-5">
            <p className="text-xs text-amber-800">
              Approved templates can be sent outside the 24-hour reply window.
            </p>
          </div>
        ) : null}

        {/* Template list */}
        {!selectedTemplate ? (
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-5 py-8 text-center text-sm text-gray-500">Loading templates...</p>
            ) : loadError ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-red-700">{loadError}</p>
                <button
                  type="button"
                  onClick={() => { void loadTemplates(); }}
                  className="mt-3 text-sm font-semibold text-emerald-700 underline hover:no-underline focus:outline-none"
                >
                  Retry
                </button>
              </div>
            ) : templates.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-semibold text-gray-700">No approved templates registered yet.</p>
                <p className="mt-1 text-sm text-gray-500">
                  Add them in{' '}
                  <Link
                    to="/settings"
                    onClick={onClose}
                    className="text-emerald-700 underline hover:no-underline"
                  >
                    Settings
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleSelectTemplate(template)}
                    className="block w-full px-4 py-3.5 text-left hover:bg-gray-50 focus:bg-emerald-50 focus:outline-none sm:px-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-gray-900">{template.name}</span>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            {template.languageCode}
                          </span>
                          {template.category ? (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                              {template.category}
                            </span>
                          ) : null}
                          {template.variables.length > 0 ? (
                            <span className="text-[10px] text-gray-400">
                              {template.variables.length} var{template.variables.length !== 1 ? 's' : ''}
                            </span>
                          ) : null}
                        </div>
                        {template.bodyPreview ? (
                          <p className="mt-1 line-clamp-2 text-xs text-gray-500">{template.bodyPreview}</p>
                        ) : null}
                      </div>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Template detail: variables + preview */
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {sortedVariables.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Fill in variables</p>
                {sortedVariables.map((v, i) => (
                  <div key={v.id}>
                    <label
                      className="mb-1 block text-sm font-medium text-gray-700"
                      htmlFor={`tpl-var-${v.id}`}
                    >
                      {`{{${v.position}}}`} — {v.label}
                    </label>
                    <input
                      id={`tpl-var-${v.id}`}
                      type="text"
                      value={variableValues[i] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVariableValues((prev) => {
                          const next = [...prev];
                          next[i] = val;
                          return next;
                        });
                      }}
                      placeholder={`Enter ${v.label.toLowerCase()}`}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {selectedTemplate.bodyPreview ? (
              <div className={sortedVariables.length > 0 ? 'mt-5' : ''}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {sortedVariables.length > 0 ? 'Preview' : 'Message'}
                </p>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm text-gray-800">{previewText}</p>
                </div>
              </div>
            ) : null}

            {!selectedTemplate.bodyPreview && sortedVariables.length === 0 ? (
              <p className="text-sm text-gray-500">
                This template has no body preview or variables. Confirm to send it.
              </p>
            ) : null}

            {sendError ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {sendError}
              </p>
            ) : null}
          </div>
        )}

        {/* Footer */}
        {selectedTemplate ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={handleBack}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSend();
              }}
              disabled={!allVariablesFilled || sending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {sending ? 'Sending...' : 'Send template'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SavedRepliesMenu({
  token,
  onClose,
  onInsert,
}: {
  token: string;
  onClose: () => void;
  onInsert: (body: string) => void;
}) {
  const [replies, setReplies] = useState<WhatsappSavedReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'pick' | 'manage' | 'create' | 'edit'>('pick');
  const [editTarget, setEditTarget] = useState<WhatsappSavedReply | null>(null);
  const [formName, setFormName] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  function load() {
    setLoading(true);
    setLoadError(null);
    let cancelled = false;
    listSavedReplies(token)
      .then((result) => {
        if (!cancelled) {
          setReplies(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Could not load saved replies. Please try again.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }

  useEffect(load, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredReplies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return replies;
    return replies.filter(
      (r) => r.name.toLowerCase().includes(q) || r.body.toLowerCase().includes(q),
    );
  }, [replies, search]);

  function openCreate() {
    setFormName('');
    setFormBody('');
    setFormError(null);
    setView('create');
  }

  function openEdit(reply: WhatsappSavedReply) {
    setEditTarget(reply);
    setFormName(reply.name);
    setFormBody(reply.body);
    setFormError(null);
    setView('edit');
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = formName.trim();
    const body = formBody.trim();
    if (!name || !body || formLoading) return;
    setFormLoading(true);
    setFormError(null);
    try {
      const created = await createSavedReply(token, { name, body });
      setReplies((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setView('manage');
    } catch {
      setFormError('Could not create saved reply. The name may already be in use.');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleUpdate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editTarget) return;
    const name = formName.trim();
    const body = formBody.trim();
    if (!name || !body || formLoading) return;
    setFormLoading(true);
    setFormError(null);
    try {
      const updated = await updateSavedReply(token, editTarget.id, { name, body });
      setReplies((prev) =>
        prev
          .map((r) => (r.id === updated.id ? updated : r))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setView('manage');
    } catch {
      setFormError('Could not update saved reply. The name may already be in use.');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSavedReply(token, id);
      setReplies((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // Non-critical — item stays visible; user can retry.
    }
  }

  const backTarget: typeof view = view === 'manage' ? 'pick' : 'manage';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white sm:bg-gray-950/40 sm:items-end sm:justify-end md:items-center md:justify-center md:p-4">
      <div className="flex flex-1 flex-col overflow-hidden bg-white sm:flex-initial sm:w-full sm:max-w-lg sm:rounded-xl sm:shadow-xl md:max-h-[75vh]">

        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-3 sm:px-5">
          {view !== 'pick' ? (
            <button
              type="button"
              onClick={() => setView(backTarget)}
              className="shrink-0 rounded-md p-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              aria-label="Back"
            >
              ← Back
            </button>
          ) : null}
          <h2 className="flex-1 text-sm font-semibold text-gray-900">
            {view === 'pick' && 'Saved replies'}
            {view === 'manage' && 'Manage saved replies'}
            {view === 'create' && 'New saved reply'}
            {view === 'edit' && 'Edit saved reply'}
          </h2>
          {view === 'pick' ? (
            <button
              type="button"
              onClick={() => setView('manage')}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              Manage
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            ✕
          </button>
        </div>

        {/* Picker view */}
        {view === 'pick' ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="shrink-0 px-4 py-2 sm:px-5">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search saved replies..."
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">Loading…</p>
              ) : loadError ? (
                <div className="px-5 py-4">
                  <p className="text-sm text-red-600">{loadError}</p>
                  <button
                    type="button"
                    onClick={load}
                    className="mt-2 text-xs font-medium text-emerald-700 hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : filteredReplies.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">
                  {search
                    ? 'No replies match your search.'
                    : 'No saved replies yet. Click Manage to create one.'}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filteredReplies.map((reply) => (
                    <li key={reply.id}>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none sm:px-5"
                        onClick={() => onInsert(reply.body)}
                      >
                        <p className="text-sm font-semibold text-gray-800">{reply.name}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{reply.body}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {/* Manage view */}
        {view === 'manage' ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="shrink-0 px-4 py-2 sm:px-5">
              <button
                type="button"
                onClick={openCreate}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                + New saved reply
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">Loading…</p>
              ) : replies.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">
                  No saved replies yet.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {replies.map((reply) => (
                    <li key={reply.id} className="flex items-start gap-2 px-4 py-3 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800">{reply.name}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{reply.body}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(reply)}
                          className="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(reply.id)}
                          className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-1 focus:ring-red-500"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {/* Create / Edit form */}
        {view === 'create' || view === 'edit' ? (
          <form
            onSubmit={view === 'create' ? handleCreate : handleUpdate}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
              {formError ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {formError}
                </p>
              ) : null}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Title</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Ask for location"
                  maxLength={120}
                  required
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Message</label>
                <textarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder={'Hi {{customerName}}, could you share your location?'}
                  rows={5}
                  maxLength={4096}
                  required
                  className="w-full resize-y rounded-md border border-gray-200 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  {'Variables: {{customerName}}, {{phone}}, {{businessName}}'}
                </p>
              </div>
            </div>
            <div className="shrink-0 border-t border-gray-100 px-4 py-3 sm:px-5">
              <button
                type="submit"
                disabled={formLoading || !formName.trim() || !formBody.trim()}
                className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {formLoading ? 'Saving…' : view === 'create' ? 'Create' : 'Save'}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function ContactStatusBadge({ status }: { status: 'PROSPECT' | 'CUSTOMER' | 'ARCHIVED' }) {
  const className =
    status === 'CUSTOMER'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : status === 'ARCHIVED'
        ? 'border-gray-200 bg-gray-100 text-gray-600'
        : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {status === 'PROSPECT' ? 'Prospect' : status === 'CUSTOMER' ? 'Customer' : 'Archived'}
    </span>
  );
}

function ConversationListLoading() {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="px-4 py-3">
          <div className="h-4 w-36 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-gray-100" />
          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

function ConversationListItem({
  conversation,
  onSelect,
  selected,
}: {
  conversation: WhatsappConversationListItem;
  onSelect: () => void;
  selected: boolean;
}) {
  const contactName = getContactName(conversation);
  const assignedUserName = getAssignedUserName(conversation);
  const latestMessage = getLatestMessage(conversation);
  const isUnread = conversationHasUnread(conversation);
  const unreadLabel = conversation.unreadCount > 0 ? String(conversation.unreadCount) : 'New';
  const initials = getConversationInitials(conversation);
  const urgencyLabel =
    conversation.status === 'CLOSED'
      ? 'Closed'
      : conversation.waitingForReply
        ? getWaitingLabel(conversation.waitingSince ?? conversation.lastInboundAt)
        : !conversation.assignedUserId
          ? 'Unassigned'
          : null;
  const urgencyClass =
    conversation.status === 'CLOSED'
      ? 'border-gray-200 bg-gray-100 text-gray-600'
      : conversation.waitingForReply
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-sky-200 bg-sky-50 text-sky-700';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative block min-h-[78px] w-full border-b border-gray-100 px-3 py-2 text-left transition focus:z-10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-600 ${
        selected
          ? 'bg-emerald-50 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-emerald-600'
          : isUnread
            ? 'bg-emerald-50/35 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-emerald-500 hover:bg-emerald-50/60'
            : 'bg-white hover:bg-gray-50'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            selected || isUnread ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className={`truncate text-sm leading-4 ${
                  selected
                    ? 'font-semibold text-emerald-950'
                    : isUnread
                      ? 'font-bold text-gray-950'
                      : 'font-semibold text-gray-900'
                }`}
              >
                {contactName || conversation.waContactPhone}
              </p>
              {contactName ? (
                <p className="truncate text-[11px] leading-4 text-gray-500">{conversation.waContactPhone}</p>
              ) : null}
            </div>
            <span className="shrink-0 pt-0.5 text-[10px] font-medium text-gray-500">
              {formatListTime(conversation.lastMessageAt ?? latestMessage?.createdAt)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p
              className={`min-w-0 truncate text-[13px] leading-4 ${
                isUnread ? 'font-semibold text-gray-800' : 'text-gray-600'
              }`}
            >
              {latestMessage?.text || 'No message preview'}
            </p>
            {isUnread ? (
              <span className="shrink-0 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {unreadLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1 text-xs text-gray-500">
            {urgencyLabel ? (
              <span className={`rounded-full border px-1.5 py-px text-[10px] font-semibold ${urgencyClass}`}>
                {urgencyLabel}
              </span>
            ) : null}
            {conversation.contact?.status ? (
              <RowContactStatusBadge status={conversation.contact.status} />
            ) : null}
            <span
              className="inline-flex min-w-0 items-center gap-1 truncate text-[10px] font-medium text-gray-500"
              title={conversation.contactId ? 'Linked contact' : 'Not linked to a contact'}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  conversation.contactId ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              />
              {conversation.contactId ? 'Linked' : 'Not linked'}
            </span>
            {conversation.assignedUserId || urgencyLabel !== 'Unassigned' ? (
              <span className="min-w-0 truncate text-[10px] font-medium text-gray-500">
                {conversation.assignedUserId ? assignedUserName : 'Unassigned'}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function ConversationHeader({
  actionError,
  actionLoading,
  assignableMemberships,
  assignmentError,
  assignmentLoading,
  assignmentSuccess,
  conversation,
  crmContextRefreshKey,
  membershipsLoading,
  membershipWarning,
  onBack,
  onAction,
  onAssignToMe,
  onSelectAssignee,
  onShowCrmRail,
  onUnassign,
  showCrmRailControl,
  userId,
}: {
  actionError: string | null;
  actionLoading: boolean;
  assignableMemberships: MembershipOption[];
  assignmentError: string | null;
  assignmentLoading: boolean;
  assignmentSuccess: string | null;
  conversation: WhatsappConversation;
  crmContextRefreshKey: number;
  membershipsLoading: boolean;
  membershipWarning: string | null;
  onBack: () => void;
  onAction: () => void;
  onAssignToMe: () => void;
  onSelectAssignee: (assignedUserId: string) => void;
  onShowCrmRail: () => void;
  onUnassign: () => void;
  showCrmRailControl: boolean;
  userId: string | null;
}) {
  const contactName = getContactName(conversation);
  const assignedUserName = getAssignedUserName(conversation);
  const initials = getConversationInitials(conversation);
  const selectedAssigneeId = conversation.assignedUserId ?? '';
  const assignmentChipClass = conversation.assignedUserId
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-gray-200 bg-gray-100 text-gray-600';

  return (
    <header className="shrink-0 border-b border-gray-100 bg-white px-3 py-1 lg:border-gray-200 lg:px-3.5">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex items-center gap-1.5 lg:gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 lg:hidden"
          >
            <span aria-hidden="true" className="text-base">&larr;</span> Inbox
          </button>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-900">
            {initials}
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-1.5 lg:flex-col lg:items-stretch lg:gap-1 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1 lg:flex-wrap lg:gap-1.5">
                <h2 className="min-w-0 truncate text-sm font-semibold leading-5 text-gray-950">
                  {contactName || conversation.waContactPhone}
                </h2>
                <StatusBadge status={conversation.status} />
                <span className="hidden lg:inline">{!conversation.replyEligible ? <ReplyWindowBadge conversation={conversation} /> : null}</span>
              </div>
              <div className="flex min-w-0 items-center gap-1 overflow-hidden text-[10px] text-gray-500 lg:flex-wrap lg:gap-x-1.5 lg:gap-y-0.5">
                {contactName ? <span className="truncate">{conversation.waContactPhone}</span> : null}
                <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-gray-300 lg:hidden" />
                <span className="shrink-0 text-emerald-600">WhatsApp</span>
                {conversation.contact?.status ? (
                  <span className="hidden sm:inline"><RowContactStatusBadge status={conversation.contact.status} /></span>
                ) : null}
                <span className="hidden min-w-0 items-center gap-1 truncate text-[10px] font-medium text-gray-500 sm:inline-flex">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      conversation.contactId ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  />
                  {conversation.contactId ? 'Linked contact' : 'Not linked'}
                </span>
                <span
                  className={`hidden min-w-0 max-w-full truncate rounded-full border px-1.5 py-px text-[10px] font-semibold sm:inline ${assignmentChipClass}`}
                >
                  {conversation.assignedUserId ? `Assigned to ${assignedUserName}` : 'Unassigned'}
                </span>
              </div>
            </div>
            <details className="relative shrink-0 lg:hidden">
              <summary
                aria-label="More conversation actions"
                className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-lg font-bold tracking-widest text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 [&::-webkit-details-marker]:hidden"
              >
                ...
              </summary>
              <div className="fixed right-3 top-[6.25rem] z-50 w-64 rounded-xl border border-gray-200 bg-white p-2.5 shadow-xl">
                <div className={`mb-2 rounded-lg border px-2.5 py-2 text-xs font-semibold ${assignmentChipClass}`}>
                  {conversation.assignedUserId ? `Assigned to ${assignedUserName}` : 'Unassigned'}
                </div>
                {!conversation.replyEligible ? (
                  <div className="mb-2"><ReplyWindowBadge conversation={conversation} /></div>
                ) : null}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={onAssignToMe}
                    disabled={assignmentLoading || !userId || conversation.assignedUserId === userId}
                    className="h-9 rounded-lg border border-gray-200 px-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                  >
                    {assignmentLoading ? 'Updating...' : 'Assign to me'}
                  </button>
                  <button
                    type="button"
                    onClick={onUnassign}
                    disabled={assignmentLoading || !conversation.assignedUserId}
                    className="h-9 rounded-lg border border-gray-200 px-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                  >
                    Clear assignee
                  </button>
                </div>
                <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-gray-500" htmlFor="whatsapp-assignee-mobile">
                  Change assignee
                </label>
                <select
                  id="whatsapp-assignee-mobile"
                  value={selectedAssigneeId}
                  onChange={(event) => {
                    if (event.target.value) onSelectAssignee(event.target.value);
                  }}
                  disabled={assignmentLoading || membershipsLoading || assignableMemberships.length === 0}
                  className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:bg-gray-100"
                >
                  <option value="">
                    {membershipsLoading ? 'Loading team...' : assignableMemberships.length > 0 ? 'Select teammate' : 'No assignable teammates'}
                  </option>
                  {assignableMemberships.map((membership) => (
                    <option key={membership.id} value={membership.userId}>{getMembershipName(membership)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onAction}
                  disabled={actionLoading}
                  className={`mt-2 h-9 w-full rounded-lg text-xs font-semibold ${
                    conversation.status === 'OPEN'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300'
                      : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {actionLoading ? 'Updating...' : conversation.status === 'OPEN' ? 'Close conversation' : 'Reopen conversation'}
                </button>
              </div>
            </details>
            <div className="hidden shrink-0 flex-wrap items-center gap-1 lg:flex xl:flex-nowrap xl:justify-end">
              {showCrmRailControl ? (
                <button
                  type="button"
                  onClick={onShowCrmRail}
                  className="hidden h-6 items-center justify-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 xl:inline-flex"
                >
                  <span aria-hidden="true">&larr;</span>
                  Show CRM
                </button>
              ) : null}
              <button
                type="button"
                onClick={onAssignToMe}
                disabled={assignmentLoading || !userId || conversation.assignedUserId === userId}
                className="inline-flex h-6 items-center justify-center rounded border border-emerald-200 bg-white px-1.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
              >
                {assignmentLoading ? '...' : 'Assign me'}
              </button>
              <label className="sr-only" htmlFor="whatsapp-assignee">
                Assign team member
              </label>
              <select
                id="whatsapp-assignee"
                value={selectedAssigneeId}
                onChange={(event) => {
                  if (event.target.value) {
                    onSelectAssignee(event.target.value);
                  }
                }}
                disabled={assignmentLoading || membershipsLoading || assignableMemberships.length === 0}
                className="h-6 min-w-0 rounded border border-gray-300 bg-white px-1.5 text-[10px] text-gray-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 sm:w-32"
              >
                <option value="">
                  {membershipsLoading
                    ? 'Loading team...'
                    : assignableMemberships.length > 0
                      ? 'Change assignee'
                      : 'No assignable teammates'}
                </option>
                {assignableMemberships.map((membership) => (
                  <option key={membership.id} value={membership.userId}>
                    {getMembershipName(membership)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onUnassign}
                disabled={assignmentLoading || !conversation.assignedUserId}
                className="inline-flex h-6 items-center justify-center rounded border border-gray-200 bg-white px-1.5 text-[10px] font-semibold text-gray-600 hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={onAction}
                disabled={actionLoading}
                className={`inline-flex h-6 items-center justify-center rounded px-2 text-[10px] font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1 disabled:cursor-not-allowed ${
                  conversation.status === 'OPEN'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300'
                    : 'border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 disabled:text-gray-400'
                }`}
              >
                {actionLoading ? 'Updating...' : conversation.status === 'OPEN' ? 'Close' : 'Reopen'}
              </button>
              <button
                type="button"
                disabled
                aria-label="More conversation actions"
                title="More actions placeholder"
                className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-white text-[10px] font-bold text-gray-400 shadow-sm disabled:cursor-not-allowed"
              >
                ...
              </button>
            </div>
          </div>
        </div>
        <SelectedConversationContextStrip conversation={conversation} refreshKey={crmContextRefreshKey} />
      </div>
      {actionError ? <p className="mx-auto mt-2 max-w-6xl text-xs text-red-700">{actionError}</p> : null}
      {assignmentError ? <p className="mx-auto mt-2 max-w-6xl text-xs text-red-700">{assignmentError}</p> : null}
      {assignmentSuccess ? (
        <p className="mx-auto mt-2 max-w-6xl text-xs text-emerald-700">{assignmentSuccess}</p>
      ) : null}
      {membershipWarning ? <p className="mx-auto mt-2 max-w-6xl text-xs text-amber-700">{membershipWarning}</p> : null}
    </header>
  );
}

function SelectedConversationContextStrip({
  conversation,
  refreshKey,
}: {
  conversation: WhatsappConversation;
  refreshKey: number;
}) {
  const { accessToken } = useAuth();
  const [context, setContext] = useState<WhatsappCrmContext | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accessToken || !conversation.contactId) {
      setContext(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setContext(null);
    setLoading(true);
    getWhatsappConversationCrmContext(accessToken, conversation.id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setContext(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setContext(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [accessToken, conversation.contactId, conversation.id, refreshKey]);

  if (!conversation.contactId) {
    return (
      <p className="mt-1 hidden h-5 min-w-0 items-center truncate border-t border-gray-100 text-[10px] text-gray-500 sm:flex">
        Link contact to see tasks, deals, and orders
      </p>
    );
  }

  if (loading || !context) {
    return (
      <div className="mt-1 hidden h-5 items-center border-t border-gray-100 sm:flex">
        {loading ? <span className="h-1.5 w-28 animate-pulse rounded-full bg-gray-200" /> : null}
      </div>
    );
  }

  const shorten = (value: string, fallback: string) => {
    const title = value.trim() || fallback;
    return title.length > 34 ? `${title.slice(0, 33).trimEnd()}…` : title;
  };
  const today = new Date();
  const isToday = (value: string | null) => {
    if (!value) return false;
    const date = new Date(value);
    return (
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  const overdueTask = context.tasks.find((task) => task.isOverdue);
  const todayTask = context.tasks.find((task) => !task.isOverdue && isToday(task.dueAt));
  const priorityTask = overdueTask ?? todayTask ?? context.tasks[0];
  const taskSummary = priorityTask
    ? overdueTask
      ? context.tasks.length > 1
        ? `⚠ ${context.tasks.length} tasks: ${shorten(priorityTask.title, 'Task')}`
        : `⚠ Task overdue: ${shorten(priorityTask.title, 'Task')}`
      : todayTask
        ? context.tasks.length > 1
          ? `${context.tasks.length} tasks: ${shorten(priorityTask.title, 'Task')} today`
          : `Today: ${shorten(priorityTask.title, 'Task')}`
        : context.tasks.length > 1
          ? `${context.tasks.length} tasks: ${shorten(priorityTask.title, 'Task')}`
          : `Task: ${shorten(priorityTask.title, 'Task')}`
    : null;

  const pastCloseDeal = context.deals.find(
    (deal) => deal.expectedCloseAt && new Date(deal.expectedCloseAt).getTime() < today.getTime(),
  );
  const priorityDeal = pastCloseDeal ?? context.deals[0];
  const dealSummary = priorityDeal
    ? pastCloseDeal
      ? context.deals.length > 1
        ? `⚠ ${context.deals.length} deals: ${shorten(priorityDeal.title, 'Deal')}`
        : `⚠ Deal past close: ${shorten(priorityDeal.title, 'Deal')}`
      : context.deals.length > 1
        ? `${context.deals.length} deals: ${shorten(priorityDeal.title, 'Deal')}`
        : `Deal: ${shorten(priorityDeal.title, 'Deal')}`
    : null;

  const priorityOrder =
    context.orders.find((order) => order.status === 'READY') ??
    context.orders.find((order) => order.status === 'IN_PROGRESS') ??
    context.orders[0];
  const orderSummary = priorityOrder
    ? context.orders.length > 1
      ? `${context.orders.length} orders: ${shorten(priorityOrder.title, 'Order')}`
      : priorityOrder.status === 'READY'
        ? `Order ready: ${shorten(priorityOrder.title, 'Order')}`
        : priorityOrder.status === 'IN_PROGRESS'
          ? `Order in progress: ${shorten(priorityOrder.title, 'Order')}`
          : `Order: ${shorten(priorityOrder.title, 'Order')}`
    : null;

  const items = [
    overdueTask ? taskSummary : null,
    dealSummary,
    orderSummary,
    overdueTask ? null : taskSummary,
  ]
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);

  return (
    <div className="mt-1 hidden h-5 min-w-0 items-center gap-1.5 overflow-hidden border-t border-gray-100 text-[10px] text-gray-600 sm:flex">
      <span className="shrink-0 font-semibold text-gray-700">Active work</span>
      {items.length > 0 ? (
        <span className="min-w-0 truncate">{items.join(' · ')}</span>
      ) : (
        <span className="min-w-0 truncate text-gray-400">None open</span>
      )}
    </div>
  );
}

function ReplyWindowBadge({ conversation }: { conversation: WhatsappConversation }) {
  const label = conversation.replyEligible
    ? 'Reply window open'
    : conversation.replyWindowExpiresAt
      ? 'Reply window closed'
      : 'Waiting for customer message';

  return (
    <span
      className={`rounded-full border px-1.5 py-px text-[10px] font-semibold ${
        conversation.replyEligible
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : conversation.replyWindowExpiresAt
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-sky-200 bg-sky-50 text-sky-800'
      }`}
    >
      {label}
    </span>
  );
}

function RowContactStatusBadge({ status }: { status: 'PROSPECT' | 'CUSTOMER' | 'ARCHIVED' }) {
  const className =
    status === 'CUSTOMER'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : status === 'ARCHIVED'
        ? 'border-gray-200 bg-gray-100 text-gray-600'
        : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <span className={`rounded-full border px-1.5 py-px text-[10px] font-semibold ${className}`}>
      {status === 'PROSPECT' ? 'Prospect' : status === 'CUSTOMER' ? 'Customer' : 'Archived'}
    </span>
  );
}

function StatusBadge({ status }: { status: WhatsappConversationStatus }) {
  return (
    <span
      className={`rounded-full border px-1.5 py-px text-[10px] font-semibold ${
        status === 'OPEN'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-gray-200 bg-gray-100 text-gray-600'
      }`}
    >
      {status === 'OPEN' ? 'Open' : 'Closed'}
    </span>
  );
}

function MessagesLoading() {
  return (
    <div className="space-y-4">
      <div className="h-16 w-3/4 animate-pulse rounded bg-white" />
      <div className="ml-auto h-20 w-2/3 animate-pulse rounded bg-gray-200" />
      <div className="h-14 w-1/2 animate-pulse rounded bg-white" />
    </div>
  );
}

function MessageBubble({ message }: { message: WhatsappMessage }) {
  const outbound = message.direction === 'OUTBOUND';
  const statusLabel = message.status.toLowerCase();
  const isTemplate = message.messageType === 'template';

  return (
    <div className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
      <article
        className={`max-w-[86%] rounded-xl px-2.5 py-1 shadow-sm sm:max-w-[72%] lg:max-w-[40rem] ${
          outbound
            ? 'rounded-br-md bg-emerald-600 text-white shadow-emerald-900/10'
            : 'rounded-bl-md bg-white text-gray-900 ring-1 ring-gray-100'
        }`}
      >
        {isTemplate ? (
          <div className={`mb-1 flex items-center gap-1 border-b pb-1 text-[10px] font-semibold uppercase tracking-wider ${
            outbound ? 'border-emerald-500 text-emerald-200' : 'border-gray-100 text-gray-400'
          }`}>
            <span>Template</span>
            {message.templateName ? (
              <span className="font-normal normal-case tracking-normal opacity-75">
                · {message.templateName}
              </span>
            ) : null}
          </div>
        ) : null}
        <p className="whitespace-pre-wrap break-words text-[13px] leading-5">{message.text || 'No text content'}</p>
        <div className={`mt-0.5 flex flex-wrap justify-end gap-x-2 text-[10px] ${outbound ? 'text-emerald-50' : 'text-gray-500'}`}>
          <span>{formatDateTime(message.sentAt ?? message.createdAt)}</span>
          <span className="capitalize">{statusLabel}</span>
        </div>
      </article>
    </div>
  );
}

function MobileConversationTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: MobileConversationTab;
  onTabChange: (tab: MobileConversationTab) => void;
}) {
  return (
    <div className="grid h-10 shrink-0 grid-cols-2 border-b border-gray-100 bg-white px-5 lg:hidden">
      {(['CHAT', 'CRM'] as const).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onTabChange(tab)}
          aria-pressed={activeTab === tab}
          className={`relative text-xs font-semibold transition after:absolute after:inset-x-5 after:bottom-0 after:h-0.5 after:rounded-full after:transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-600 ${
            activeTab === tab
              ? 'text-emerald-700 after:bg-emerald-600'
              : 'text-gray-500 after:bg-transparent hover:text-gray-800'
          }`}
        >
          {tab === 'CHAT' ? 'Chat' : 'CRM'}
        </button>
      ))}
    </div>
  );
}

function MobileCrmPanel({
  contactError,
  contactLoading,
  conversation,
  onCreateContact,
  onContextChanged,
  onLinkContact,
  onUnlinkContact,
}: {
  contactError: string | null;
  contactLoading: boolean;
  conversation: WhatsappConversation;
  onCreateContact: () => void;
  onContextChanged: () => void;
  onLinkContact: () => void;
  onUnlinkContact: () => void;
}) {
  const [openCreateOrderSignal, setOpenCreateOrderSignal] = useState(0);

  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-[#f5f7f6] px-2.5 pb-4 pt-2.5 lg:hidden">
      <div className="mx-auto grid min-w-0 max-w-2xl grid-cols-2 gap-2">
        <div className="col-span-2 min-w-0 [&>section>div]:shadow-none">
          <ContactLinkPanel
            conversation={conversation}
            error={contactError}
            loading={contactLoading}
            onCreate={onCreateContact}
            onLink={onLinkContact}
            onUnlink={onUnlinkContact}
            variant="sidebar"
          />
        </div>

        <div className="col-span-2 min-w-0 [&>section]:shadow-none">
          <ContactOrdersPanel
            contactId={conversation.contactId}
            conversationId={conversation.id}
            onContextChanged={onContextChanged}
            openCreateSignal={openCreateOrderSignal}
            variant="sidebar"
          />
        </div>

        {conversation.contactId ? (
          <>
            <div className="col-span-2 min-w-0 [&_section]:shadow-none">
              <CrmContextPanel
                conversation={conversation}
                onCreateOrder={() => setOpenCreateOrderSignal((current) => current + 1)}
                onContextChanged={onContextChanged}
                variant="mobile"
              />
            </div>
            <div className="col-span-2 min-w-0 [&>section]:shadow-none">
              <EntityActivitiesPanel
                entityType="CONTACT"
                entityId={conversation.contactId}
                title="Recent activity"
                variant="mobile"
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

const MOBILE_NAV_ITEMS = [
  { label: 'WhatsApp', href: '/whatsapp', icon: 'M12 4a7 7 0 0 0-6 10.6L5 20l5.6-1A7 7 0 1 0 12 4Z' },
  { label: 'Contacts', href: '/contacts', icon: 'M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3ZM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 3a5 5 0 0 1 5 5M3 19a5 5 0 0 1 10 0' },
  { label: 'Deals', href: '/deals', icon: 'M4 8h16v11H4V8Zm4 0V5h8v3M4 12h16' },
  { label: 'Tasks', href: '/tasks', icon: 'M5 5h14v14H5V5Zm4 4h6M9 13h6M9 17h4' },
] as const;

function MobileNavIcon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d={path} />
    </svg>
  );
}

function MobileBottomNavigation() {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreLinks = [
    ['Dashboard', '/dashboard'],
    ['Today', '/today'],
    ['Orders', '/orders'],
    ['Settings', '/settings'],
    ['Account', '/account'],
  ] as const;

  return (
    <>
      {moreOpen ? (
        <button aria-label="Close more navigation" className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMoreOpen(false)} type="button" />
      ) : null}
      {moreOpen ? (
        <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-3 right-3 z-50 grid grid-cols-2 gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl lg:hidden">
          {moreLinks.map(([label, href]) => (
            <Link key={href} to={href} onClick={() => setMoreOpen(false)} className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-800">
              {label}
            </Link>
          ))}
        </div>
      ) : null}
      <nav aria-label="Mobile app navigation" className="fixed inset-x-0 bottom-0 z-50 grid h-[calc(4.25rem+env(safe-area-inset-bottom))] grid-cols-5 border-t border-gray-200 bg-white px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-3px_12px_rgba(15,23,42,0.05)] lg:hidden">
        {MOBILE_NAV_ITEMS.map((item) => (
          <NavLink key={item.href} to={item.href} className={({ isActive }) => `mx-0.5 my-1 flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500'}`}>
            <MobileNavIcon path={item.icon} />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
        <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((current) => !current)} className={`mx-0.5 my-1 flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${moreOpen ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500'}`}>
          <MobileNavIcon path="M5 6h.01M12 6h.01M19 6h.01M5 12h.01M12 12h.01M19 12h.01M5 18h.01M12 18h.01M19 18h.01" />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}

function RightCrmRail({
  activeTab,
  contactError,
  contactLoading,
  conversation,
  onCreateContact,
  onContextChanged,
  onHide,
  onLinkContact,
  onTabChange,
  onUnlinkContact,
}: {
  activeTab: CrmRailTab;
  contactError: string | null;
  contactLoading: boolean;
  conversation: WhatsappConversation;
  onCreateContact: () => void;
  onContextChanged: () => void;
  onHide: () => void;
  onLinkContact: () => void;
  onTabChange: (tab: CrmRailTab) => void;
  onUnlinkContact: () => void;
}) {
  const tabs: CrmRailTab[] = ['CRM', 'DETAILS', 'AUTOMATION', 'HISTORY'];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-white">
      <div className="min-w-0 shrink-0 overflow-hidden border-b border-gray-200 bg-white px-2">
        <div className="flex h-7 items-center justify-between gap-2 border-b border-gray-100 px-1">
          <span className="text-[10px] font-semibold uppercase text-gray-400">CRM workspace</span>
          <button
            type="button"
            onClick={onHide}
            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            Hide CRM
            <span aria-hidden="true">&rarr;</span>
          </button>
        </div>
        <div className="grid min-w-0 grid-cols-4 gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={`min-w-0 truncate h-8 border-b-2 px-1 text-[10px] font-semibold transition ${
                activeTab === tab
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab === 'CRM' ? 'CRM' : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 px-2 py-2">
        {activeTab === 'CRM' ? (
          <div className="space-y-2">
            <ContactLinkPanel
              conversation={conversation}
              error={contactError}
              loading={contactLoading}
              onCreate={onCreateContact}
              onLink={onLinkContact}
              onUnlink={onUnlinkContact}
              variant="sidebar"
            />

            <ContactOrdersPanel
              contactId={conversation.contactId}
              conversationId={conversation.id}
              onContextChanged={onContextChanged}
              variant="sidebar"
            />

            {conversation.contactId ? (
              <CrmContextPanel
                conversation={conversation}
                onContextChanged={onContextChanged}
                variant="sidebar"
              />
            ) : null}

            <div className="pt-1">
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Coming next
              </p>
              <div className="space-y-2">
                <PlaceholderCard title="Files" body="Customer files and attachments will be available here." />
                <PlaceholderCard title="Smart actions" body="Helpful suggestions for the next customer step are coming soon." />
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'DETAILS' ? (
          <div className="space-y-3">
            <RailCard title="Conversation details">
              <DetailRow label="Phone" value={conversation.waContactPhone} />
              <DetailRow label="Profile" value={conversation.waProfileName || '-'} />
              <DetailRow label="Channel" value={conversation.channel} />
              <DetailRow label="Status" value={conversation.status === 'OPEN' ? 'Open' : 'Closed'} />
              <DetailRow label="Last inbound" value={formatDateTime(conversation.lastInboundAt)} />
              <DetailRow label="Reply window" value={conversation.replyEligible ? 'Open' : 'Closed'} />
              <DetailRow label="Created" value={formatDateTime(conversation.createdAt)} />
            </RailCard>
          </div>
        ) : null}

        {activeTab === 'AUTOMATION' ? (
          <PlaceholderCard title="Automation" body="Automation setup is coming soon and is disabled in this visual pass." />
        ) : null}

        {activeTab === 'HISTORY' ? (
          conversation.contactId ? (
            <EntityActivitiesPanel entityType="CONTACT" entityId={conversation.contactId} title="Activity history" />
          ) : (
            <PlaceholderCard title="History" body="Link a contact to see their activity history." />
          )
        ) : null}
      </div>
    </div>
  );
}

function RailCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-950">{title}</h2>
        <span className="text-gray-400">...</span>
      </div>
      {children}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-gray-100 py-1.5 first:border-t-0 first:pt-0 last:pb-0">
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      <span className="min-w-0 text-right text-xs font-medium text-gray-800">{value || '-'}</span>
    </div>
  );
}

function PlaceholderCard({ body, title }: { body: string; title: string }) {
  return (
    <section aria-disabled="true" className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-3 text-gray-500">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500">Coming soon</span>
      </div>
      <p className="text-xs leading-5">{body}</p>
    </section>
  );
}
