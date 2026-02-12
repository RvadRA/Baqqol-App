import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { socket } from '../socket';
import api from '../api/axios';
import { NOTIFICATION_CONFIG } from '../config/notifications.config';

interface NotificationData {
  debtId?: string;
  chatId?: string;
  messageId?: string;
  amount?: number;
  fromUser?: string;
  contactChatId?: string;
}

export interface Notification {
  _id: string;
  userId: string;
  type: 'new_message' | 'message_read' | 'payment_requested' | 'payment_confirmed' | 
        'payment_rejected' | 'debt_created' | 'chat_archived' | 'chat_pinned' | 
        'debt_overdue' | 'reminder' | 'contact_message' | 'contact_chat_pinned' | 
        'contact_chat_archived' | 'contact_chat_muted';
  title: string;
  message: string;
  data?: NotificationData;
  read: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  debtNotificationCount: number;
  isLoading: boolean;
  fetchNotifications: (limit?: number, offset?: number) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  subscribeToNotifications: () => void;
  unsubscribeFromNotifications: () => void;
  updateMessageNotifications: (chatId: string, messageId?: string) => Promise<void>;
  cleanupOldReadNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};

// Кастомная debounce функция с правильной типизацией
function createDebouncedFunction<T extends (...args: any[]) => Promise<any>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => Promise<void> {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>): Promise<void> => {
    return new Promise((resolve) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      
      timeout = setTimeout(async () => {
        try {
          await func(...args);
          resolve();
        } catch (error) {
          console.error('Debounced function error:', error);
          resolve();
        }
      }, wait);
    });
  };
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  // Рассчитываем счетчики
  const unreadCount = notifications.filter(n => !n.read).length;
  const debtNotificationCount = notifications.filter(n => 
    (n.type === 'debt_overdue' || n.type === 'reminder') && !n.read
  ).length;

  // Функция загрузки с пагинацией
  const fetchNotifications = useCallback(async (limit = 50, offset = 0) => {
    if (!user) return;

    try {
      setIsLoading(true);
      const response = await api.get('/notifications', {
        params: { limit, offset }
      });
      
      if (response.data) {
        setNotifications(prev => {
          // Объединяем старые и новые уведомления, удаляя дубликаты
          const allNotifications = [...prev, ...(response.data.notifications || [])];
          const uniqueNotifications = Array.from(
            new Map(allNotifications.map(n => [n._id, n])).values()
          );
          return uniqueNotifications;
        });
      }
    } catch (error) {
      console.error('❌ Error fetching notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Функция очистки старых прочитанных уведомлений
  const cleanupOldReadNotifications = useCallback(async () => {
    if (!user || notifications.length === 0) return;

    try {
      if (!NOTIFICATION_CONFIG.AUTO_CLEANUP.ENABLED) return;

      const readDaysAgo = new Date();
      readDaysAgo.setDate(readDaysAgo.getDate() - NOTIFICATION_CONFIG.AUTO_CLEANUP.READ_NOTIFICATIONS_DAYS);
      
      const oldReadNotifications = notifications.filter(notification => 
        notification.read && 
        new Date(notification.createdAt) < readDaysAgo
      );

      if (oldReadNotifications.length > 0) {
        console.log(`🗑️ Auto-deleting ${oldReadNotifications.length} old read notifications`);
        
        // Удаляем на сервере
        await api.post('/notifications/cleanup-old-read');
        
        // Обновляем локальное состояние
        setNotifications(prev => 
          prev.filter(notification => 
            !oldReadNotifications.some(old => old._id === notification._id)
          )
        );
      }
    } catch (error) {
      console.error('❌ Error cleaning up old notifications:', error);
    }
  }, [user, notifications]);

  // Обычные функции (без дебаунса) для использования в useCallback
  const markAsReadImpl = useCallback(async (id: string) => {
    try {
      // Update locally first
      setNotifications(prev => prev.map(notification =>
        notification._id === id ? { ...notification, read: true } : notification
      ));
      
      // Update on server
      await api.post(`/notifications/${id}/read`);
      
      // Emit socket event
      if (socket.connected) {
        socket.emit('notification:read', { notificationId: id });
      }
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
    }
  }, []);

  const updateMessageNotificationsImpl = useCallback(async (chatId: string, messageId?: string) => {
    console.log('🔄 Updating message notifications:', { chatId, messageId });
    
    // Находим уведомления для обновления
    const notificationsToUpdate = notifications.filter(notification => 
      (notification.data?.chatId === chatId || notification.data?.contactChatId === chatId) && 
      (notification.type === 'new_message' || notification.type === 'contact_message') && 
      !notification.read &&
      (!messageId || notification.data?.messageId === messageId)
    );

    if (notificationsToUpdate.length === 0) return;

    // Обновляем локально
    setNotifications(prev => prev.map(notification => {
      if (notificationsToUpdate.some(n => n._id === notification._id)) {
        return { ...notification, read: true };
      }
      return notification;
    }));

    // Массово обновляем на сервере
    try {
      await api.post('/notifications/mark-messages-read', {
        chatId,
        messageId
      });
    } catch (error) {
      console.error('❌ Error updating message notifications on server:', error);
    }
  }, [notifications]);

  // Дебаунсированные версии функций
  const debouncedMarkAsRead = useCallback(
    createDebouncedFunction(markAsReadImpl, 300),
    [markAsReadImpl]
  );

  const debouncedUpdateMessages = useCallback(
    createDebouncedFunction(updateMessageNotificationsImpl, 500),
    [updateMessageNotificationsImpl]
  );

  // Публичные API методы
  const markAsRead = useCallback(async (id: string) => {
    await debouncedMarkAsRead(id);
  }, [debouncedMarkAsRead]);

  const updateMessageNotifications = useCallback(async (chatId: string, messageId?: string) => {
    await debouncedUpdateMessages(chatId, messageId);
  }, [debouncedUpdateMessages]);

  const markAllAsRead = useCallback(async () => {
    console.log('🔄 Marking all notifications as read...');
    
    try {
      // Update locally first
      setNotifications(prev => prev.map(notification => ({ ...notification, read: true })));
      console.log('✅ Updated locally');
      
      // Update on server
      const response = await api.post('/notifications/read-all');
      console.log('✅ Server response:', response.status, response.data);
      
      // Emit socket event
      if (socket.connected) {
        console.log('📡 Emitting socket event');
        socket.emit('notification:all-read');
      }
      
      console.log('✅ Successfully marked all as read');
      
    } catch (error: any) {
      console.error('❌ Error marking all notifications as read:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      
      // Revert local changes
      await fetchNotifications();
    }
  }, [fetchNotifications]);

  const deleteNotification = useCallback(async (id: string) => {
    try {
      // Update locally first
      setNotifications(prev => prev.filter(notification => notification._id !== id));
      
      // Delete from server
      await api.delete(`/notifications/${id}`);
      
      // Emit socket event
      if (socket.connected) {
        socket.emit('notification:deleted', { id });
      }
    } catch (error) {
      console.error('❌ Error deleting notification:', error);
      await fetchNotifications();
    }
  }, [fetchNotifications]);

  const clearAllNotifications = useCallback(async () => {
    console.log('🗑️ Clearing all notifications...');
    
    try {
      // Update locally first
      setNotifications([]);
      console.log('✅ Cleared locally');
      
      // Clear on server
      const response = await api.delete('/notifications');
      console.log('✅ Server response:', response.status, response.data);
      
      // Emit socket event
      if (socket.connected) {
        console.log('📡 Emitting cleared event');
        socket.emit('notification:cleared');
      }
      
      console.log('✅ Successfully cleared all notifications');
      
    } catch (error: any) {
      console.error('❌ Error clearing all notifications:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      
      // Revert by fetching again
      await fetchNotifications();
    }
  }, [fetchNotifications]);

  const subscribeToNotifications = useCallback(() => {
    if (socket.connected) {
      console.log('🔔 Subscribing to notifications...');
      socket.emit('notification:subscribe');
    } else {
      console.warn('⚠️ Socket not connected, cannot subscribe to notifications');
    }
  }, []);

  const unsubscribeFromNotifications = useCallback(() => {
    if (socket.connected) {
      console.log('🔕 Unsubscribing from notifications...');
      socket.emit('notification:unsubscribe');
    }
  }, []);

  // Setup Socket.IO listeners
  useEffect(() => {
    if (!user) return;

    console.log('🔌 Setting up notification socket listeners...');

    const handleNewNotification = (notification: Notification) => {
      console.log('🔔 Новое уведомление:', notification);
      
      // Проверяем тип уведомления и показываем соответствующий toast
      if (NOTIFICATION_CONFIG.UI.SHOW_BROWSER_NOTIFICATIONS) {
        switch (notification.type) {
          case 'debt_overdue':
            showBrowserNotification({
              ...notification,
              title: '⚠️ ' + notification.title
            });
            break;
          case 'reminder':
            showBrowserNotification({
              ...notification,
              title: '⏰ ' + notification.title
            });
            break;
          default:
            showBrowserNotification(notification);
        }
      }
      
      setNotifications(prev => {
        const exists = prev.some(n => n._id === notification._id);
        if (exists) return prev;
        return [notification, ...prev];
      });
    };

    const handleNotificationRead = ({ id }: { id: string }) => {
      console.log('📌 Notification read:', id);
      setNotifications(prev => prev.map(notification =>
        notification._id === id ? { ...notification, read: true } : notification
      ));
    };

    const handleNotificationDeleted = ({ id }: { id: string }) => {
      console.log('🗑️ Notification deleted:', id);
      setNotifications(prev => prev.filter(notification => notification._id !== id));
    };

    const handleAllNotificationsRead = () => {
      console.log('✅ All notifications marked as read');
      setNotifications(prev => prev.map(notification => ({ ...notification, read: true })));
    };

    const handleNotificationsCleared = () => {
      console.log('🧹 All notifications cleared');
      setNotifications([]);
    };

    const handleBatchRead = (data: { 
      chatId: string; 
      messageId?: string;
      count: number;
    }) => {
      console.log(`✅ ${data.count} notifications marked as read for chat ${data.chatId}`);
      
      setNotifications(prev => prev.map(notification => {
        if ((notification.data?.chatId === data.chatId || notification.data?.contactChatId === data.chatId) && 
            (!data.messageId || notification.data?.messageId === data.messageId) &&
            (notification.type === 'new_message' || notification.type === 'contact_message') &&
            !notification.read) {
          return { ...notification, read: true };
        }
        return notification;
      }));
    };

    const handleConnect = () => {
      console.log('🔌 Socket connected, subscribing to notifications...');
      setTimeout(() => {
        subscribeToNotifications();
      }, 500);
    };

    // Subscribe to socket events
    socket.on('connect', handleConnect);
    socket.on('notification:new', handleNewNotification);
    socket.on('notification:read', handleNotificationRead);
    socket.on('notification:deleted', handleNotificationDeleted);
    socket.on('notification:all-read', handleAllNotificationsRead);
    socket.on('notification:cleared', handleNotificationsCleared);
    socket.on('notifications:batch-read', handleBatchRead);

    // Connect socket if not connected
    if (!socket.connected) {
      console.log('🔌 Connecting socket...');
      socket.connect();
    } else {
      subscribeToNotifications();
    }

    return () => {
      console.log('🔌 Cleaning up notification socket listeners...');
      socket.off('connect', handleConnect);
      socket.off('notification:new', handleNewNotification);
      socket.off('notification:read', handleNotificationRead);
      socket.off('notification:deleted', handleNotificationDeleted);
      socket.off('notification:all-read', handleAllNotificationsRead);
      socket.off('notification:cleared', handleNotificationsCleared);
      socket.off('notifications:batch-read', handleBatchRead);
    };
  }, [user, subscribeToNotifications]);

  // Fetch notifications on mount and when user changes
  useEffect(() => {
    if (user) {
      console.log('👤 User authenticated, fetching notifications...');
      fetchNotifications();
    } else {
      setNotifications([]);
    }
  }, [user, fetchNotifications]);

  // Периодическая очистка старых уведомлений
  useEffect(() => {
    if (!user) return;

    const cleanupInterval = setInterval(
      cleanupOldReadNotifications, 
      NOTIFICATION_CONFIG.AUTO_CLEANUP.CHECK_INTERVAL_MINUTES * 60 * 1000
    );
    
    // Запускаем очистку при монтировании
    cleanupOldReadNotifications();
    
    return () => clearInterval(cleanupInterval);
  }, [user, cleanupOldReadNotifications]);

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default' && 
        NOTIFICATION_CONFIG.UI.SHOW_BROWSER_NOTIFICATIONS) {
      Notification.requestPermission().then(permission => {
        console.log('🔔 Browser notification permission:', permission);
      });
    }
  }, []);

  const showBrowserNotification = (notification: Notification) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notificationOptions = {
        body: notification.message,
        icon: '/favicon.ico',
        tag: notification._id,
        timestamp: Date.now(),
        data: notification.data,
      };

      const browserNotification = new Notification(notification.title, notificationOptions);

      browserNotification.onclick = () => {
        window.focus();
        browserNotification.close();
        
        if (notification.data?.debtId) {
          window.location.href = `/debts/${notification.data.debtId}`;
        } else if (notification.data?.chatId) {
          window.location.href = `/chats/${notification.data.chatId}`;
        } else if (notification.data?.contactChatId) {
          window.location.href = `/contact-chats/${notification.data.contactChatId}`;
        }
      };

      setTimeout(() => browserNotification.close(), NOTIFICATION_CONFIG.UI.NOTIFICATION_TIMEOUT_MS);
    }
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      debtNotificationCount,
      isLoading,
      fetchNotifications,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearAllNotifications,
      subscribeToNotifications,
      unsubscribeFromNotifications,
      updateMessageNotifications,
      cleanupOldReadNotifications,
    }}>
      {children}
    </NotificationContext.Provider>
  );
};