import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, AtSign, Bell, CheckCheck, CheckCircle2 } from 'lucide-react';
import { NotificationItem } from '../types';
import { formatRelativeDate } from '../utils/format';

interface NotificationsMenuProps {
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
  onSelectNotification: (notif: NotificationItem) => void;
}

export function NotificationsMenu({
  notifications,
  onMarkAllRead,
  onSelectNotification,
}: NotificationsMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200/80 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="cs-accent-btn absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 font-mono text-[10px] font-bold text-white shadow-xs">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications list"
          className="cs-surface absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl sm:w-96 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-2.5 dark:border-zinc-800">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                <CheckCheck className="h-3 w-3" aria-hidden="true" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 cs-scrollbar dark:divide-zinc-800/80">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
                All caught up.
              </p>
            ) : (
              notifications.map((item) => {
                const Icon =
                  item.type === 'job_done'
                    ? CheckCircle2
                    : item.type === 'job_failed'
                      ? AlertCircle
                      : AtSign;
                const iconColor =
                  item.type === 'job_done'
                    ? 'text-emerald-500'
                    : item.type === 'job_failed'
                      ? 'text-rose-500'
                      : 'text-indigo-500';

                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSelectNotification(item);
                      setOpen(false);
                    }}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                      !item.read ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                    }`}
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {item.title}
                        </p>
                        <span className="shrink-0 text-[10px] text-zinc-400">
                          {formatRelativeDate(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                        {item.message}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
