// socket.ts (server)
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import Notification from "./models/Notification";
import User from "./models/User";
import Debt from "./models/Debt";
export const initSocket = (httpServer: any) => {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Middleware для аутентификации
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.token;
      if (!token) {
        return next(new Error("No token provided"));
      }

      const decoded = jwt.verify(
        token as string,
        process.env.JWT_SECRET as string
      ) as {
        userId: string;
        globalIdentityId: string;
      };

      socket.data.user = decoded;
      next();
    } catch (error: any) {
      console.error("Socket auth error:", error.message);
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const { globalIdentityId } = socket.data.user;
    const now = new Date();


    // 1. ОБНОВЛЯЕМ СТАТУС ПОЛЬЗОВАТЕЛЯ НА ONLINE
    try {
      await User.findOneAndUpdate(
        { globalIdentityId }, 
        { status: "online", lastSeen: now }
      );
      
      // Уведомляем всех пользователей об изменении статуса
      io.emit("user:status-changed", {
        identityId: globalIdentityId,
        status: "online",
        lastSeen: now.toISOString()
      });
    } catch (err) {
      console.error("❌ Error updating user online status:", err);
    }

    // Присоединяем пользователя к его персональной комнате
    socket.join(`user:${globalIdentityId}`);

    // ===================== ДОЛГОВЫЕ ЧАТЫ (DEBT CHATS) =====================
    socket.on("join-debt", (debtId: string) => {
      socket.join(`debt:${debtId}`);
    });

    socket.on("leave-debt", (debtId: string) => {
      socket.leave(`debt:${debtId}`);
    });


    
    // ===================== КОНТАКТНЫЕ ЧАТЫ (CONTACT CHATS) =====================
    socket.on("join-contact-chat", (contactChatId: string) => {
      socket.join(`contact-chat:${contactChatId}`);
    });

    socket.on("leave-contact-chat", (contactChatId: string) => {
      socket.leave(`contact-chat:${contactChatId}`);
    });

    // ===================== ПЕРСОНАЛЬНЫЕ КОМНАТЫ =====================
    socket.on("join-user", (userId: string) => {
      socket.join(`user:${userId}`);
    });

    // ===================== УВЕДОМЛЕНИЯ =====================
    socket.on("notification:subscribe", () => {
      socket.join(`notifications:${globalIdentityId}`);
    });

    socket.on("notification:unsubscribe", () => {
      socket.leave(`notifications:${globalIdentityId}`);
    });

    socket.on("notification:read", async (data: { notificationId: string }) => {
      try {
        await Notification.findByIdAndUpdate(data.notificationId, { read: true });
        socket.to(`notifications:${globalIdentityId}`).emit("notification:read", data);
      } catch (error) {
        console.error("❌ Socket notification read error:", error);
      }
    });

    socket.on("notification:all-read", () => {
      socket.to(`notifications:${globalIdentityId}`).emit("notification:all-read");
    });

    // ===================== ИНДИКАТОРЫ НАБОРА =====================
    // Индикатор набора в долговом чате
    socket.on("chat:typing", (data: { debtId: string; isTyping: boolean }) => {
      socket.to(`debt:${data.debtId}`).emit("chat:typing", {
        ...data,
        identityId: globalIdentityId,
      });
    });

    // Индикатор набора в контактном чате
    socket.on("contact-chat:typing", (data: { contactChatId: string; isTyping: boolean }) => {
      socket.to(`contact-chat:${data.contactChatId}`).emit("contact-chat:typing", {
        ...data,
        identityId: globalIdentityId,
      });
    });

    // ===================== СОБЫТИЯ ПРОЧТЕНИЯ СООБЩЕНИЙ =====================
    // Сообщение прочитано в долговом чате
    socket.on("chat:message-read", (data: { 
      debtId: string; 
      messageId: string;
      readerId?: string;
    }) => {
      const { debtId, messageId } = data;
      const readerId = data.readerId || globalIdentityId;
      
     
      
      // Уведомляем всех в комнате чата
      socket.to(`debt:${debtId}`).emit("chat:message-read", {
        debtId,
        messageId,
        readBy: readerId,
        readerId,
        readAt: new Date()
      });
    });

    // Сообщение прочитано в контактном чате
    socket.on("contact-chat:message-read", (data: { 
      contactChatId: string; 
      messageId: string;
      readBy?: string;
    }) => {
      const { contactChatId, messageId } = data;
      const readBy = data.readBy || globalIdentityId;
      
      
      
      socket.to(`contact-chat:${contactChatId}`).emit("contact-chat:message-read", {
        contactChatId,
        messageId,
        readBy,
        readAt: new Date()
      });
    });

    // ===================== ВСЕ СООБЩЕНИЯ ПРОЧИТАНЫ =====================
    socket.on("chat:mark-read", (data: { 
      debtId: string; 
      messageIds: string[];
      readerId?: string;
      allRead?: boolean;
    }) => {
      const { debtId } = data;
      const readerId = data.readerId || globalIdentityId;
      
    
      
      socket.to(`debt:${debtId}`).emit("chat:all-read", {
        debtId,
        readBy: readerId,
        readerId,
        count: data.messageIds?.length || 0,
        allRead: true,
        timestamp: new Date()
      });
    });

    socket.on("contact-chat:all-read", (data: { 
      contactChatId: string;
      readBy?: string;
    }) => {
      const { contactChatId } = data;
      const readBy = data.readBy || globalIdentityId;
      
      
      
      socket.to(`contact-chat:${contactChatId}`).emit("contact-chat:all-read", {
        contactChatId,
        readBy,
        timestamp: new Date()
      });
    });

    // ===================== УДАЛЕНИЕ СООБЩЕНИЙ =====================
    socket.on("chat:message-deleted", (data: { 
      debtId: string; 
      messageId: string;
      deletedBy?: string;
    }) => {
      const { debtId, messageId } = data;
      
    
      
      socket.to(`debt:${debtId}`).emit("chat:message-deleted", {
        debtId,
        messageId,
        deletedBy: globalIdentityId
      });
    });

    socket.on("contact-chat:message-deleted", (data: { 
      contactChatId: string; 
      messageId: string;
      deletedBy?: string;
    }) => {
      const { contactChatId, messageId } = data;
      
    
      socket.to(`contact-chat:${contactChatId}`).emit("contact-chat:message-deleted", {
        contactChatId,
        messageId,
        deletedBy: globalIdentityId
      });
    });

    // ===================== ОЧИСТКА ЧАТА =====================
    socket.on("chat:clear", (data: { 
      debtId: string;
      clearedBy?: string;
    }) => {
      const { debtId } = data;
      
     
      
      socket.to(`debt:${debtId}`).emit("chat:cleared", {
        debtId,
        clearedBy: globalIdentityId
      });
    });

    socket.on("contact-chat:clear", (data: { 
      contactChatId: string;
      clearedBy?: string;
    }) => {
      const { contactChatId } = data;
      
      
      
      socket.to(`contact-chat:${contactChatId}`).emit("contact-chat:cleared", {
        contactChatId,
        clearedBy: globalIdentityId
      });
    });

    // ===================== АРХИВАЦИЯ ЧАТА =====================
    socket.on("chat:archive", (data: { 
      debtId: string;
      archivedBy?: string;
    }) => {
      const { debtId } = data;
    
      
      // Отправляем только отправителю события
      socket.emit("chat:archived", {
        debtId,
        archivedBy: globalIdentityId
      });
    });

    socket.on("contact-chat:archive", (data: { 
      contactChatId: string;
      archivedBy?: string;
    }) => {
      const { contactChatId } = data;
      
     
      
      socket.emit("contact-chat:archived", {
        contactChatId,
        archivedBy: globalIdentityId
      });
    });

    // ===================== ПОДПИСКА НА ОБНОВЛЕНИЯ ДОЛГОВ =====================
    socket.on("debt:subscribe", (debtId: string) => {
      socket.join(`debt:${debtId}`);
    });

    socket.on("customer:subscribe", (customerId: string) => {
      socket.join(`customer:${customerId}:${globalIdentityId}`);
    });


    
// ===================== ОБРАБОТЧИКИ ПЛАТЕЖЕЙ =====================
socket.on("debt:payment-requested", (data: { 
  debtId: string; 
  amount: number; 
  senderId: string;
}) => {
 
  // Отправляем всем в комнате долга, КРОМЕ отправителя
  socket.to(`debt:${data.debtId}`).emit("debt:payment-requested", {
    ...data,
    senderId: globalIdentityId,
    timestamp: new Date().toISOString()
  });
  
});

socket.on("debt:payment-accepted", (data: { 
  debtId: string; 
  amount: number; 
  acceptorId: string;
}) => {

  
  // Отправляем всем в комнате долга, КРОМЕ отправителя
  socket.to(`debt:${data.debtId}`).emit("debt:payment-accepted", {
    ...data,
    acceptorId: globalIdentityId,
    timestamp: new Date().toISOString()
  });
  
});

socket.on("debt:payment-rejected", (data: { 
  debtId: string; 
  amount: number; 
  rejectorId: string;
}) => {

  
  // Отправляем всем в комнате долга, КРОМЕ отправителя
  socket.to(`debt:${data.debtId}`).emit("debt:payment-rejected", {
    ...data,
    rejectorId: globalIdentityId,
    timestamp: new Date().toISOString()
  });
  
});

socket.on("debt:payment-confirmed", (data: { 
  debtId: string; 
  amount: number; 
  confirmerId: string;
}) => {
   
  // Отправляем всем в комнате долга, КРОМЕ отправителя
  socket.to(`debt:${data.debtId}`).emit("debt:payment-confirmed", {
    ...data,
    confirmerId: globalIdentityId,
    timestamp: new Date().toISOString()
  });
  
});

// Общий обработчик для обновления долга
socket.on("debt:updated", (data: { 
  debtId: string; 
  debt: any;
}) => {

  
  // Отправляем всем в комнате долга, КРОМЕ отправителя
  socket.to(`debt:${data.debtId}`).emit("debt:updated", {
    ...data,
    updatedBy: globalIdentityId,
    timestamp: new Date().toISOString()
  });
  
});

    // ===================== PING/PONG =====================
    socket.on("ping", (data: { timestamp: number }) => {
      socket.emit("pong", { 
        timestamp: data.timestamp, 
        receivedAt: Date.now() 
      });
    });

    // ===================== ОТКЛЮЧЕНИЕ =====================
    socket.on("disconnect", async (reason) => {
      const lastSeenTime = new Date();
      

      try {
        await User.findOneAndUpdate(
          { globalIdentityId }, 
          { status: "offline", lastSeen: lastSeenTime }
        );

        io.emit("user:status-changed", {
          identityId: globalIdentityId,
          status: "offline",
          lastSeen: lastSeenTime.toISOString()
        });
        
      } catch (err) {
        console.error("❌ Error updating user offline status:", err);
      }
    });

    // ===================== ОБРАБОТЧИК ОШИБОК =====================
    socket.on("error", (error) => {
      console.error("🔴 Socket error:", {
        userId: globalIdentityId,
        error: error.message
      });
    });
  });

  // Логирование событий на уровне сервера
  io.engine.on("connection_error", (err) => {
    console.error("🔴 Engine connection error:", err);
  });

  return io;
};