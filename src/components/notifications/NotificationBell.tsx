import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from '../../lib/notifications';

type Props = {
  unreadCount: number;
  onReadOne: () => void;
  onReadAll: () => void;
};

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function destination(notification: Notification): string {
  if (notification.entityType === 'CONTACT') return `/contacts/${notification.entityId}`;
  if (notification.entityType === 'DEAL') return `/deals/${notification.entityId}`;
  if (notification.parentEntityType === 'CONTACT' && notification.parentEntityId) {
    return `/contacts/${notification.parentEntityId}`;
  }
  if (notification.parentEntityType === 'DEAL' && notification.parentEntityId) {
    return `/deals/${notification.parentEntityId}`;
  }
  return '/tasks';
}

export function NotificationBell({ unreadCount, onReadOne, onReadAll }: Props) {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load() {
    if (!accessToken) return;
    setLoading(true);
    setError(false);
    try {
      const result = await fetchNotifications(accessToken);
      setItems(result.notifications);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  function openNotification(notification: Notification) {
    if (!accessToken) return;
    if (!notification.readAt) {
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      );
      onReadOne();
      void markNotificationRead(accessToken, notification.id);
    }
    setOpen(false);
    navigate(destination(notification));
  }

  function markAll() {
    if (!accessToken || unreadCount === 0) return;
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
    onReadAll();
    void markAllNotificationsRead(accessToken);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label="Notifications"
        className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-2 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed left-3 right-3 top-14 z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-9 sm:w-[380px]">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-950">Notifications</h2>
            {items.length > 0 ? (
              <button className="text-xs font-medium text-blue-600 disabled:text-gray-400" disabled={unreadCount === 0} onClick={markAll} type="button">
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-[25rem] overflow-y-auto">
            {loading ? (
              <div className="space-y-3 p-4">{[1, 2, 3].map((n) => <div className="h-16 animate-pulse rounded bg-gray-100" key={n} />)}</div>
            ) : error ? (
              <div className="p-8 text-center text-sm text-gray-500">Could not load notifications. <button className="font-medium text-blue-600" onClick={() => void load()} type="button">Try again</button></div>
            ) : items.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-500"><div className="mb-2 text-2xl">✓</div>No new notifications</div>
            ) : (
              items.map((item) => (
                <button
                  className={`block w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${item.readAt ? '' : 'border-l-2 border-l-blue-500 bg-blue-50/40'}`}
                  key={item.id}
                  onClick={() => openNotification(item)}
                  type="button"
                >
                  <div className="flex justify-between gap-3">
                    <span className={`text-sm ${item.readAt ? 'text-gray-600' : 'font-semibold text-gray-950'}`}>{item.title}</span>
                    <span className="shrink-0 text-[11px] text-gray-400">{relativeTime(item.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-600">{item.body}</p>
                  <p className="mt-1 text-[11px] text-gray-400">Assigned by {item.actorName}</p>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
