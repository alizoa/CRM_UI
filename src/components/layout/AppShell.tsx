import { useEffect, useState, type ReactNode } from 'react';
import { useWhatsAppAttentionCount } from '../../hooks/useWhatsAppAttentionCount';
import { useNotificationUnreadCount } from '../../hooks/useNotificationUnreadCount';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';

type AppShellProps = {
  children: ReactNode;
  mainClassName?: string;
};

const SIDEBAR_COLLAPSED_KEY = 'alozix_admin_sidebar_collapsed';

function getInitialCollapsed() {
  try {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function AppShell({ children, mainClassName = 'p-6' }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { attentionCount } = useWhatsAppAttentionCount();
  const {
    notificationCount,
    decrement: decrementNotificationCount,
    clear: clearNotificationCount,
  } = useNotificationUnreadCount();

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // Ignore unavailable storage, such as private browsing restrictions.
    }
  }, [collapsed]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-100 text-gray-900">
      <Sidebar
        attentionCount={attentionCount}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onToggleCollapse={() => setCollapsed((current) => !current)}
      />
      <div className={['min-h-screen pl-0 transition-all duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-64'].join(' ')}>
        <TopNav
          attentionCount={attentionCount}
          notificationCount={notificationCount}
          onNotificationRead={decrementNotificationCount}
          onNotificationsReadAll={clearNotificationCount}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className={mainClassName}>{children}</main>
      </div>
    </div>
  );
}
