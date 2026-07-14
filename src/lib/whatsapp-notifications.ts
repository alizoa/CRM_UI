// src/lib/whatsapp-notifications.ts — demo mode (no real notifications)
import type { WhatsappConversationListItem } from './whatsapp';

export type WhatsappNotificationPermission = NotificationPermission | 'unsupported';

export function getWhatsappNotificationPermission(): WhatsappNotificationPermission {
  return typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission
    : 'unsupported';
}

export function canSendWhatsappDesktopNotifications() {
  return getWhatsappNotificationPermission() === 'granted';
}

export async function requestWhatsappNotificationPermission(): Promise<WhatsappNotificationPermission> {
  if (getWhatsappNotificationPermission() === 'unsupported') {
    return 'unsupported';
  }
  return Notification.requestPermission();
}

type SyncOptions = {
  attentionCount: number;
  conversations: WhatsappConversationListItem[];
  currentUserId: string | null;
  pathname: string;
  notify: boolean;
};

export function syncWhatsappAttentionNotifications(_options: SyncOptions) {
  // no-op in demo mode
}
