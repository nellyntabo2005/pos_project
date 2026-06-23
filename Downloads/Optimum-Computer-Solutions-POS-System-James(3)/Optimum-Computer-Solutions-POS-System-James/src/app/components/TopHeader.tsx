import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { buildNotificationsWebSocketUrl, loadNotifications, markAllNotificationsRead, markNotificationRead, type BackendNotification } from '../services/api';
import { useAppLanguage } from '../services/language';

type SocketNotificationPayload = {
  type?: string;
  message?: Partial<BackendNotification>;
};

type LocalNotificationPayload = Partial<BackendNotification> & {
  title: string;
  message: string;
};

const LOCAL_NOTIFICATION_STORAGE_KEY = 'pos-local-notifications';

const getStatusClassName = (notification: BackendNotification) => {
  if (notification.severity === 'warning') return 'bg-orange-500';
  if (notification.severity === 'error') return 'bg-red-500';
  if (notification.severity === 'success') return 'bg-green-500';
  return 'bg-blue-500';
};

const formatRelativeTime = (dateText: string) => {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(dateText).getTime()) / 1000));
  if (diffSeconds < 60) return 'now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
};

const normalizeSocketNotification = (notification: Partial<BackendNotification>): BackendNotification | null => {
  if (!notification.id || !notification.title || !notification.message) return null;

  const priority = notification.priority || 'medium';
  const severityByPriority: Record<string, BackendNotification['severity']> = {
    low: 'info',
    medium: 'info',
    high: 'warning',
    urgent: 'error',
    critical: 'error'
  };

  return {
    ...notification,
    id: notification.id,
    channel: notification.channel_name || String(notification.channel || 'in_app'),
    severity: notification.severity || severityByPriority[priority] || 'info',
    priority,
    status: notification.status || 'pending',
    title: notification.title,
    message: notification.message,
    is_read: notification.is_read ?? notification.status === 'read',
    created_at: notification.created_at || new Date().toISOString()
  } as BackendNotification;
};

const mergeNotification = (items: BackendNotification[], incoming: BackendNotification) => {
  if (incoming.is_read) {
    return items.filter(item => item.id !== incoming.id);
  }

  const nextItems = [incoming, ...items.filter(item => item.id !== incoming.id)];
  return nextItems
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);
};

const combineNotifications = (backendNotifications: BackendNotification[], localNotifications: BackendNotification[]) => {
  const combined = [...localNotifications, ...backendNotifications];
  const uniqueNotifications = combined.filter((notification, index) =>
    combined.findIndex(item => item.id === notification.id) === index
  );

  return uniqueNotifications
    .filter(notification => !notification.is_read)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);
};

const readLocalNotifications = () => {
  try {
    const saved = window.localStorage.getItem(LOCAL_NOTIFICATION_STORAGE_KEY);
    if (!saved) return [];
    const notifications = JSON.parse(saved) as BackendNotification[];
    return notifications.filter(notification => notification.id < 0 && !notification.is_read);
  } catch {
    return [];
  }
};

const saveLocalNotifications = (notifications: BackendNotification[]) => {
  window.localStorage.setItem(LOCAL_NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications.slice(0, 20)));
};

const createLocalNotification = (notification: LocalNotificationPayload): BackendNotification => ({
  id: notification.id || -(Date.now() + Math.floor(Math.random() * 1000)),
  channel: notification.channel || 'in_app',
  severity: notification.severity || 'info',
  priority: notification.priority || 'medium',
  status: 'pending',
  title: notification.title,
  message: notification.message,
  is_read: false,
  created_at: notification.created_at || new Date().toISOString()
});

export function TopHeader() {
  const { t } = useAppLanguage();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notifications, setNotifications] = useState<BackendNotification[]>(() => readLocalNotifications());
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'live' | 'polling'>('connecting');
  const localNotifications = useRef<BackendNotification[]>(readLocalNotifications());

  const notificationCount = notifications.length;

  const refreshNotifications = async () => {
    setIsLoadingNotifications(true);
    try {
      const nextNotifications = await loadNotifications(true);
      localNotifications.current = readLocalNotifications();
      setNotifications(combineNotifications(nextNotifications, localNotifications.current));
    } catch (error) {
      console.warn('Unable to load notifications.', error);
      localNotifications.current = readLocalNotifications();
      setNotifications(localNotifications.current);
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    refreshNotifications();

    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let closedByComponent = false;

    const connectSocket = () => {
      const wsUrl = buildNotificationsWebSocketUrl();

      try {
        setConnectionState('connecting');
        socket = new WebSocket(wsUrl);
        socket.addEventListener('open', () => {
          setConnectionState('live');
        });
        socket.addEventListener('message', (event) => {
          try {
            const payload = JSON.parse(event.data) as SocketNotificationPayload;
            const incoming = normalizeSocketNotification(payload.message || {});
            if (incoming) {
              setNotifications(previousNotifications => mergeNotification(previousNotifications, incoming));
              return;
            }
          } catch {
            // Fall through to a refresh for legacy socket payloads.
          }

          refreshNotifications();
        });
        socket.addEventListener('close', () => {
          if (!closedByComponent) {
            setConnectionState('polling');
            reconnectTimer = window.setTimeout(connectSocket, 5000);
          }
        });
        socket.addEventListener('error', () => {
          setConnectionState('polling');
          socket?.close();
        });
      } catch (e) {
        socket = null;
        setConnectionState('polling');
      }
    };

    connectSocket();

    const timer = window.setInterval(refreshNotifications, 15000);
    const handleLocalNotification = (event: Event) => {
      const notification = (event as CustomEvent<LocalNotificationPayload>).detail;
      if (!notification?.title || !notification.message) return;
      const incomingNotification = createLocalNotification(notification);
      localNotifications.current = mergeNotification(localNotifications.current, incomingNotification);
      saveLocalNotifications(localNotifications.current);
      setNotifications(previousNotifications => mergeNotification(previousNotifications, incomingNotification));
    };
    const handleWindowFocus = () => refreshNotifications();
    window.addEventListener('pos:notifications-changed', refreshNotifications);
    window.addEventListener('pos:local-notification', handleLocalNotification);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.clearInterval(timer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.removeEventListener('pos:notifications-changed', refreshNotifications);
      window.removeEventListener('pos:local-notification', handleLocalNotification);
      window.removeEventListener('focus', handleWindowFocus);
      closedByComponent = true;
      if (socket) {
        try { socket.close(); } catch {}
      }
    };
  }, []);

  const handleMarkRead = async (notificationId: number) => {
    setNotifications(previousNotifications => previousNotifications.filter(notification => notification.id !== notificationId));
    if (notificationId < 0) {
      localNotifications.current = localNotifications.current.filter(notification => notification.id !== notificationId);
      saveLocalNotifications(localNotifications.current);
      return;
    }
    try {
      await markNotificationRead(notificationId);
    } catch (error) {
      console.warn('Unable to mark notification read.', error);
      refreshNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    const previousNotifications = notifications;
    const backendNotifications = previousNotifications.filter(notification => notification.id > 0);
    setNotifications([]);
    localNotifications.current = [];
    saveLocalNotifications([]);
    if (backendNotifications.length === 0) return;
    try {
      await markAllNotificationsRead();
    } catch (error) {
      console.warn('Unable to mark all notifications read.', error);
      setNotifications(backendNotifications);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="sticky top-0 z-50 flex min-w-0 items-center justify-between border-b border-gray-200 bg-white px-3 py-2 shadow-sm sm:px-8 sm:py-4">
      <div />

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-6">
        <div className="hidden text-right text-gray-700 sm:block">
          <div className="text-sm">
            <div className="font-semibold text-base">{formatTime(currentTime)}</div>
            <div className="text-xs text-gray-500">{formatDate(currentTime)}</div>
          </div>
        </div>

        <Popover onOpenChange={(open) => open && refreshNotifications()}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative rounded-lg p-2.5 text-gray-600 transition-colors hover:bg-gray-100"
              aria-label="View notifications"
            >
              <Bell className="w-5 h-5" />
              {notificationCount > 0 && (
                <Badge
                  variant="default"
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center bg-red-500 p-0 text-xs hover:bg-red-600"
                >
                  {notificationCount > 9 ? '9+' : notificationCount}
                </Badge>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="mr-1 w-[calc(100vw-1rem)] max-w-[420px] border-gray-200 bg-white p-0 sm:mr-0 sm:w-[420px]">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-3 py-3 sm:px-4">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900">{t('Notifications')}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>{isLoadingNotifications ? t('Refreshing...') : notificationCount > 0 ? `${notificationCount} unread updates` : t('No unread updates')}</span>
                  <span className={connectionState === 'live' ? 'text-green-600' : 'text-orange-600'}>
                    {connectionState === 'live' ? 'Live' : connectionState === 'connecting' ? 'Connecting' : 'Polling'}
                  </span>
                </div>
              </div>
              {notificationCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllRead}
                  className="h-8 shrink-0 px-2 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  {t('Mark all read')}
                </Button>
              )}
            </div>

            <div className="max-h-[min(70vh,32rem)] overflow-y-auto">
              {notificationCount > 0 ? (
                notifications.map((notification) => {
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleMarkRead(notification.id)}
                      className="flex w-full gap-3 border-b border-gray-100 px-3 py-3 text-left last:border-b-0 hover:bg-gray-50 sm:px-4"
                    >
                      <span className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${getStatusClassName(notification)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                          <p className="break-words text-sm font-medium text-gray-900">{notification.title}</p>
                          <span className="whitespace-nowrap text-xs text-gray-400">{formatRelativeTime(notification.created_at)}</span>
                        </div>
                        <p className="mt-1 break-words text-xs leading-relaxed text-gray-600">{notification.message}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm font-medium text-gray-900">{t("You're all caught up")}</p>
                  <p className="mt-1 text-xs text-gray-500">{t('New backend updates will appear here automatically.')}</p>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
