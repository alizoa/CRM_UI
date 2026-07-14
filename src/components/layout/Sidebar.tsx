import { NavLink } from 'react-router-dom';
import { SIDEBAR_LINKS } from '../../lib/constants';

const ICON_PATHS: Record<(typeof SIDEBAR_LINKS)[number]['label'], string> = {
  Account:
    'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm7 8a7 7 0 0 0-14 0',
  Contacts:
    'M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3ZM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 3a5 5 0 0 1 5 5M3 19a5 5 0 0 1 10 0',
  Leads:
    'M12 21a9 9 0 1 0-9-9m9 9v-4m0-8V5m-4 8h8',
  Orders:
    'M6 7h12l1 13H5L6 7Zm3 0V5a3 3 0 0 1 6 0v2M8 11h8',
  Dashboard:
    'M4 5h6v6H4V5Zm10 0h6v4h-6V5ZM4 15h6v4H4v-4Zm10-2h6v6h-6v-6Z',
  Deals:
    'M4 8h16v11H4V8Zm4 0V5h8v3M4 12h16',
  Team:
    'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2',
  Settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v3m0 12v3m9-9h-3M6 12H3m15.4-6.4-2.1 2.1M7.7 16.3l-2.1 2.1m12.8 0-2.1-2.1M7.7 7.7 5.6 5.6',
  Tasks:
    'M5 5h14v14H5V5Zm4 4h6M9 13h6M9 17h4',
  Today:
    'M5 6h14v13H5V6Zm3-3v4m8-4v4M5 10h14',
  WhatsApp:
    'M12 4a7 7 0 0 0-6 10.6L5 20l5.6-1A7 7 0 1 0 12 4Zm-2.2 4.8c.3 2 1.5 3.5 3.4 4.4l1.4-1.1 1.6.8c.2.1.3.3.3.5-.1.9-.8 1.6-1.7 1.6-3.5 0-6.8-3.2-6.8-6.8 0-.9.7-1.6 1.6-1.7.2 0 .4.1.5.3l.8 1.6-1.1 1.4Z',
};

type SidebarProps = {
  attentionCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onClose: () => void;
};

function SidebarIcon({ label }: { label: (typeof SIDEBAR_LINKS)[number]['label'] }) {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d={ICON_PATHS[label]} />
    </svg>
  );
}

function formatAttentionCount(count: number) {
  return count > 99 ? '99+' : String(count);
}

function whatsappAriaLabel(count: number) {
  return count > 0
    ? `WhatsApp, ${count} ${count === 1 ? 'conversation needs' : 'conversations need'} attention`
    : 'WhatsApp';
}

export function Sidebar({ attentionCount, collapsed, onToggleCollapse, mobileOpen, onClose }: SidebarProps) {
  const desktopWidth = collapsed ? 'w-16' : 'w-64';

  return (
    <>
      <aside
        className={[
          'fixed inset-y-0 left-0 hidden border-r border-gray-200 bg-white transition-all duration-200 lg:block',
          desktopWidth,
        ].join(' ')}
      >
        <div className={['flex h-12 items-center border-b border-gray-200 px-3', collapsed ? 'justify-center' : 'justify-between'].join(' ')}>
          {collapsed ? null : (
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-sm font-black text-white">
                A
              </span>
              <span className="truncate text-lg font-semibold text-gray-950">Alozix</span>
            </div>
          )}
          <button
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            type="button"
          >
            {collapsed ? '>' : '<'}
          </button>
        </div>
        <nav className={['flex flex-col gap-0.5 p-2.5', collapsed ? 'items-center px-2' : ''].join(' ')}>
          {SIDEBAR_LINKS.map((link) => (
            <NavLink
              aria-label={
                link.label === 'WhatsApp'
                  ? whatsappAriaLabel(attentionCount)
                  : collapsed
                    ? link.label
                    : undefined
              }
              className={({ isActive }) =>
                [
                  'relative rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                  collapsed ? 'flex h-9 w-9 items-center justify-center' : 'flex items-center gap-3',
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-900/10'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950',
                ].join(' ')
              }
              key={link.href}
              title={collapsed ? link.label : undefined}
              to={link.href}
            >
              <span className="relative shrink-0">
                <SidebarIcon label={link.label} />
                {collapsed && link.label === 'WhatsApp' && attentionCount > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2.5 -top-2.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-4 text-white ring-2 ring-white"
                  >
                    {formatAttentionCount(attentionCount)}
                  </span>
                ) : null}
              </span>
              {collapsed ? null : (
                <>
                  <span>{link.label}</span>
                  {link.label === 'WhatsApp' && attentionCount > 0 ? (
                    <span
                      aria-hidden="true"
                      className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-4 text-white"
                    >
                      {formatAttentionCount(attentionCount)}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-2.5 left-0 right-0 px-3">
          <div className={['rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-emerald-800', collapsed ? 'flex justify-center px-2' : ''].join(' ')}>
            <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-white" />
            {collapsed ? null : <p className="mt-1 text-xs font-semibold">Connected</p>}
          </div>
        </div>
      </aside>

      {mobileOpen && <button aria-label="Close sidebar" className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} type="button" />}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 w-64 border-r border-gray-200 bg-white transition-transform duration-200 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-12 items-center border-b border-gray-200 px-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-black text-white">
              A
            </span>
            <span className="text-lg font-semibold text-gray-950">Alozix</span>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {SIDEBAR_LINKS.map((link) => (
            <NavLink
              aria-label={
                link.label === 'WhatsApp' ? whatsappAriaLabel(attentionCount) : undefined
              }
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-semibold',
                  isActive ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950',
                ].join(' ')
              }
              key={link.href}
              onClick={onClose}
              to={link.href}
            >
              <SidebarIcon label={link.label} />
              <span>{link.label}</span>
              {link.label === 'WhatsApp' && attentionCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-4 text-white"
                >
                  {formatAttentionCount(attentionCount)}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
