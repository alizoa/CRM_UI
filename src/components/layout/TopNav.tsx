import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NotificationBell } from '../notifications/NotificationBell';

type TopNavProps = {
  attentionCount: number;
  notificationCount: number;
  onNotificationRead: () => void;
  onNotificationsReadAll: () => void;
  onMenuClick: () => void;
};

export function TopNav({
  attentionCount,
  notificationCount,
  onNotificationRead,
  onNotificationsReadAll,
  onMenuClick,
}: TopNavProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="flex h-12 items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 shadow-sm shadow-gray-100/70 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <button
          aria-label="Open navigation"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-semibold text-gray-700 shadow-sm hover:bg-gray-50 lg:hidden"
          onClick={onMenuClick}
          type="button"
        >
          =
        </button>
        <div className="hidden min-w-0 items-center gap-2 lg:flex">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-sm font-black text-white">
            A
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-4 text-gray-950">Alozix</p>
            <p className="truncate text-[10px] font-medium leading-3 text-gray-500">Customer system</p>
          </div>
        </div>
        <span className="min-w-0 truncate text-base font-semibold text-gray-950 lg:hidden">Alozix Admin</span>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
        <div className="relative hidden w-full max-w-[17rem] md:block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
            Search
          </span>
          <input
            aria-label="Search across Alozix"
            disabled
            placeholder="Search across Alozix..."
            className="h-8 w-full rounded-lg border border-gray-200 bg-gray-50 pl-14 pr-12 text-xs text-gray-500 shadow-inner placeholder:text-gray-400"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">
            Ctrl K
          </span>
        </div>
        <button
          aria-label="Create"
          disabled
          title="Create placeholder"
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-base font-semibold text-white shadow-sm opacity-80 md:inline-flex disabled:cursor-not-allowed"
          type="button"
        >
          +
        </button>
        {attentionCount > 0 ? (
          <button
            aria-label={`WhatsApp — ${attentionCount} ${
              attentionCount === 1 ? 'conversation needs' : 'conversations need'
            } attention`}
            title={`WhatsApp — ${attentionCount} ${
              attentionCount === 1 ? 'conversation needs' : 'conversations need'
            } attention`}
            className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-emerald-700 shadow-sm hover:bg-gray-50"
            onClick={() => navigate('/whatsapp')}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path d="M12 4a7 7 0 0 0-6 10.6L5 20l5.6-1A7 7 0 1 0 12 4Z" />
              <path d="M9.8 8.8c.3 2 1.5 3.5 3.4 4.4l1.4-1.1 1.6.8c.2.1.3.3.3.5-.1.9-.8 1.6-1.7 1.6-3.5 0-6.8-3.2-6.8-6.8 0-.9.7-1.6 1.6-1.7.2 0 .4.1.5.3l.8 1.6-1.1 1.4Z" />
            </svg>
            <span
              aria-hidden="true"
              className="absolute -right-2 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-white"
            >
              {attentionCount > 99 ? '99+' : attentionCount}
            </span>
          </button>
        ) : null}
        <NotificationBell
          unreadCount={notificationCount}
          onReadOne={onNotificationRead}
          onReadAll={onNotificationsReadAll}
        />
        <button
          aria-label="Help"
          disabled
          title="Help placeholder"
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-semibold text-gray-500 shadow-sm md:inline-flex disabled:cursor-not-allowed"
          type="button"
        >
          ?
        </button>
        <div className="hidden items-center gap-2 border-l border-gray-200 pl-2.5 md:flex">
          <div className="text-right">
            <p className="text-xs font-semibold leading-4 text-gray-900">Alozix Admin</p>
            <p className="text-[11px] leading-4 text-gray-500">Administrator</p>
          </div>
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-[11px] font-bold text-gray-800">
            AA
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
          </span>
        </div>
        <button
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
          onClick={handleLogout}
          type="button"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
