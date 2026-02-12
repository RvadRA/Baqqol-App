// socket.ts - ФИНАЛЬНАЯ УПРОЩЕННАЯ ВЕРСИЯ
import { io, Socket } from "socket.io-client";
// Create socket instance
export const socket: Socket = io("http://localhost:5000", {
  autoConnect: false, // НЕ подключаться автоматически
  auth: (cb) => {
    const token = localStorage.getItem("token");
    console.log("🔐 Socket auth token:", token ? "Present" : "Missing");
    cb({ token: token || null });
  },
  transports: ['websocket', 'polling'],
  reconnection: true, // Включить переподключение
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
  withCredentials: true,
});
// Добавить обработчик массового обновления
export const setupNotificationListeners = (setNotifications: React.Dispatch<React.SetStateAction<any[]>>) => {
  socket.on("notifications:batch-read", (data: { 
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
  });
};

// Глобальные обработчики только для логирования
socket.on("connect_error", (err) => {
  console.error("🔴 Socket connection error:", err.message);
  
  if (err.message.includes("401") || err.message.includes("Unauthorized")) {
    console.warn("🚫 Unauthorized - clearing token");
    localStorage.removeItem("token");
    // Перенаправить на логин если на странице требует авторизации
    if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/signup')) {
      window.location.href = '/login';
    }
  }
});

socket.on("disconnect", (reason) => {
  console.log("🔌 Socket disconnected:", reason);
  
  // Автоматическое переподключение только для определенных причин
  if (reason === "io server disconnect" || reason === "transport close") {
    console.log("🔄 Will attempt to reconnect...");
  }
});

socket.on("connect", () => {
  console.log("✅ Socket connected with ID:", socket.id);
});


socket.on("reconnect_attempt", (attemptNumber) => {
  console.log(`🔄 Reconnect attempt ${attemptNumber}`);
});

socket.on("reconnect", (attemptNumber) => {
  console.log(`✅ Reconnected after ${attemptNumber} attempts`);
});

socket.on("reconnect_failed", () => {
  console.error("❌ Failed to reconnect");
});


// Socket service для управления комнатами чатов
class SocketService {
  private static instance: SocketService;
  private currentDebtId: string | null = null;
  private currentContactChatId: string | null = null;

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  // =========== ДОЛГОВЫЕ ЧАТЫ (DEBT CHATS) ===========
  
  joinDebtRoom(debtId: string) {
    if (this.currentDebtId !== debtId) {
      if (this.currentDebtId) {
        this.leaveDebtRoom(this.currentDebtId);
      }
      this.currentDebtId = debtId;
      console.log(`🔗 Joining debt room: ${debtId}`);
      if (socket.connected) {
        socket.emit("join-debt", debtId);
      } else {
        console.warn("⚠️ Socket not connected, cannot join debt room");
      }
    }
  }

  leaveDebtRoom(debtId: string) {
    if (this.currentDebtId === debtId) {
      console.log(`🚪 Leaving debt room: ${debtId}`);
      if (socket.connected) {
        socket.emit("leave-debt", debtId);
      }
      this.currentDebtId = null;
    }
  }

  // =========== КОНТАКТНЫЕ ЧАТЫ (CONTACT CHATS) ===========
  
  joinContactChatRoom(contactChatId: string) {
    if (this.currentContactChatId !== contactChatId) {
      if (this.currentContactChatId) {
        this.leaveContactChatRoom(this.currentContactChatId);
      }
      this.currentContactChatId = contactChatId;
      console.log(`🔗 Joining contact chat room: ${contactChatId}`);
      if (socket.connected) {
        socket.emit("join-contact-chat", contactChatId);
      } else {
        console.warn("⚠️ Socket not connected, cannot join contact chat room");
      }
    }
  }

  leaveContactChatRoom(contactChatId: string) {
    if (this.currentContactChatId === contactChatId) {
      console.log(`🚪 Leaving contact chat room: ${contactChatId}`);
      if (socket.connected) {
        socket.emit("leave-contact-chat", contactChatId);
      }
      this.currentContactChatId = null;
    }
  }

  // =========== ОБЩИЕ МЕТОДЫ ===========
  
  sendTypingIndicator(debtId: string, isTyping: boolean) {
    if (socket.connected) {
      socket.emit("chat:typing", { debtId, isTyping });
    }
  }

  sendContactTypingIndicator(contactChatId: string, isTyping: boolean) {
    if (socket.connected) {
      socket.emit("contact-chat:typing", { contactChatId, isTyping });
    }
  }

  markMessageAsRead(debtId: string, messageId: string, readerId: string) {
    if (socket.connected) {
      socket.emit("chat:message-read", { 
        debtId, 
        messageId, 
        readerId,
        timestamp: Date.now() 
      });
    }
  }

  markContactMessageAsRead(contactChatId: string, messageId: string, readerId: string) {
    if (socket.connected) {
      socket.emit("contact-chat:message-read", { 
        contactChatId, 
        messageId, 
        readBy: readerId
      });
    }
  }

  markAllMessagesAsRead(debtId: string, messageIds: string[], readerId: string) {
    if (socket.connected) {
      socket.emit("chat:mark-read", { 
        debtId, 
        messageIds, 
        readerId, 
        allRead: true 
      });
    }
  }

  markAllContactMessagesAsRead(contactChatId: string, readerId: string) {
    if (socket.connected) {
      socket.emit("contact-chat:all-read", { 
        contactChatId,
        readBy: readerId
      });
    }
  }

  deleteMessage(debtId: string, messageId: string) {
    if (socket.connected) {
      socket.emit("chat:message-deleted", { debtId, messageId });
    }
  }

  deleteContactMessage(contactChatId: string, messageId: string) {
    if (socket.connected) {
      socket.emit("contact-chat:message-deleted", { contactChatId, messageId });
    }
  }

  clearChat(debtId: string) {
    if (socket.connected) {
      socket.emit("chat:clear", { debtId });
    }
  }

  clearContactChat(contactChatId: string) {
    if (socket.connected) {
      socket.emit("contact-chat:clear", { contactChatId });
    }
  }

  // Подписка на уведомления пользователя
  subscribeToNotifications(userId: string) {
    if (socket.connected) {
      socket.emit("notification:subscribe", { userId });
    }
  }

  unsubscribeFromNotifications(userId: string) {
    if (socket.connected) {
      socket.emit("notification:unsubscribe", { userId });
    }
  }

  
  // Подписка на обновления долгов
  subscribeToDebt(debtId: string) {
    if (socket.connected) {
      socket.emit("debt:subscribe", debtId);
    }
  }

  subscribeToCustomer(customerId: string, userId: string) {
    if (socket.connected) {
      socket.emit("customer:subscribe", { customerId, userId });
    }
  }

  // Статусные методы
  isConnected() {
    return socket.connected;
  }

  getCurrentDebtId() {
    return this.currentDebtId;
  }

  getCurrentContactChatId() {
    return this.currentContactChatId;
  }

  // Методы для очистки
  cleanup() {
    if (this.currentDebtId) {
      this.leaveDebtRoom(this.currentDebtId);
    }
    if (this.currentContactChatId) {
      this.leaveContactChatRoom(this.currentContactChatId);
    }
  }
}

export const socketService = SocketService.getInstance();