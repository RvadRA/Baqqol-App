import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import ContactChat from "../models/ContactChat";
import ContactMessage from "../models/ContactMessage";
import GlobalIdentity from "../models/GlobalIdentity";
import User from "../models/User";
import Customer from "../models/Customer";
import { io } from "../index";
import { createNotification } from "./notification.controller";
import { IGlobalIdentity } from "../models/GlobalIdentity";

// Типы для populated документов
interface PopulatedContactChat {
  _id: Types.ObjectId;
  participant1Id: IGlobalIdentity | Types.ObjectId;
  participant2Id: IGlobalIdentity | Types.ObjectId;
  lastMessage?: string;
  lastMessageType?: string;
  lastAt?: Date;
  isMuted: boolean;
  isArchived: boolean;
  isPinned: boolean;
  toObject(): any;
  save(): Promise<any>;
}

// Тип кастера для безопасного приведения
const castToGlobalIdentity = (obj: any): IGlobalIdentity => {
  return obj as IGlobalIdentity;
};
const { ObjectId } = mongoose.Types;
// Helper function to get other participant safely
const getOtherParticipant = (chat: any, currentUserId: string) => {
  const participant1Id = chat.participant1Id.toString();
  const participant2Id = chat.participant2Id.toString();
  
  return participant1Id === currentUserId 
    ? { id: chat.participant2Id, participant: chat.participant2Id }
    : { id: chat.participant1Id, participant: chat.participant1Id };
};

// Helper function to validate and convert to ObjectId
const toObjectId = (id: string | Types.ObjectId): Types.ObjectId => {
  if (id instanceof Types.ObjectId) {
    return id;
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`Invalid ObjectId: ${id}`);
  }
  return new Types.ObjectId(id);
};
// GET OR CREATE CONTACT CHAT
// GET OR CREATE CONTACT CHAT - УПРОЩЕННАЯ ВЕРСИЯ
// GET OR CREATE CONTACT CHAT - ИСПРАВЛЕННАЯ ВЕРСИЯ
export const getOrCreateContactChat = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { contactIdentityId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!contactIdentityId || !mongoose.Types.ObjectId.isValid(contactIdentityId)) {
      return res.status(400).json({ message: "Invalid contact ID" });
    }

    if (identityId === contactIdentityId) {
      return res.status(400).json({ message: "Cannot create chat with yourself" });
    }

    const identityObjectId = new Types.ObjectId(identityId);
    const contactObjectId = new Types.ObjectId(contactIdentityId);

    // Найти существующий чат
    let chat = await ContactChat.findOne({
      $or: [
        { participant1Id: identityObjectId, participant2Id: contactObjectId },
        { participant1Id: contactObjectId, participant2Id: identityObjectId }
      ]
    })
    .populate<{ participant1Id: IGlobalIdentity, participant2Id: IGlobalIdentity }>(
      ["participant1Id", "participant2Id"],
      "registeredName phone"
    ) as any;

    // Если чата нет - создать
    if (!chat) {
      const contactIdentity = await GlobalIdentity.findById(contactIdentityId);
      if (!contactIdentity) {
        return res.status(404).json({ message: "Контакт не найден. Пользователь должен быть зарегистрирован в системе." });
      }

      chat = await ContactChat.create({
        participant1Id: identityObjectId,
        participant2Id: contactObjectId,
      });

      // Заполнить данные
      chat = await ContactChat.findById(chat._id)
        .populate<{ participant1Id: IGlobalIdentity, participant2Id: IGlobalIdentity }>(
          ["participant1Id", "participant2Id"],
          "registeredName phone"
        ) as any;

      if (!chat) {
        return res.status(500).json({ message: "Failed to create chat" });
      }
    }

    // Приводим типы
    const populatedChat = chat as unknown as PopulatedContactChat;
    const participant1 = castToGlobalIdentity(populatedChat.participant1Id);
    const participant2 = castToGlobalIdentity(populatedChat.participant2Id);
    
    // Определить другого участника
    const otherParticipant = 
      participant1._id.toString() === identityId 
        ? participant2 
        : participant1;

    // Проверить регистрацию пользователя
    const userExists = await User.findOne({ 
      globalIdentityId: otherParticipant._id 
    });

    // Получить сообщения
    const messages = await ContactMessage.find({
      contactChatId: chat._id,
      deleted: { $ne: true }
    })
      .populate<{ senderIdentityId: IGlobalIdentity }>("senderIdentityId", "registeredName phone")
      .sort({ createdAt: 1 });

    // Подготовить данные для ответа
    const responseData = {
      chat: {
        chatId: chat._id.toString(),
        otherParticipant: {
          identityId: otherParticipant._id.toString(),
          name: otherParticipant.registeredName || "Без имени",
          phone: otherParticipant.phone || "",
          isRegistered: !!userExists,
        },
        settings: {
          isMuted: chat.isMuted || false,
          isArchived: chat.isArchived || false,
          isPinned: chat.isPinned || false,
        }
      },
      messages: messages.map(msg => {
        const sender = castToGlobalIdentity(msg.senderIdentityId);
        
        return {
          _id: msg._id.toString(),
          text: msg.text,
          senderId: sender._id.toString(),
          senderName: sender.registeredName || "Без имени",
          createdAt: msg.createdAt,
          read: msg.read,
          readBy: msg.readBy?.map((id: Types.ObjectId) => id.toString()) || [],
          isMine: sender._id.toString() === identityId,
          type: msg.type || "text",
          fileUrl: msg.fileUrl,
          fileName: msg.fileName,
          fileSize: msg.fileSize,
           replyTo: msg.replyTo ? msg.replyTo.toString() : undefined, 
        };
      }),
    };

    res.json(responseData);

  } catch (error: any) {
    console.error("GET/CREATE CONTACT CHAT ERROR:", error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ message: "Invalid ID format" });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ 
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// GET ALL MY CONTACT CHATS
// GET ALL MY CONTACT CHATS - ИСПРАВЛЕННАЯ ВЕРСИЯ
export const getAllContactChats = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const chats = await ContactChat.find({
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ],
      isArchived: false
    })
      .populate<{ participant1Id: IGlobalIdentity, participant2Id: IGlobalIdentity }>(
        ["participant1Id", "participant2Id"],
        "registeredName phone"
      )
      .sort({ lastAt: -1, isPinned: -1 });

    const result = await Promise.all(
      chats.map(async (chat) => {
        const chatDoc = chat as unknown as PopulatedContactChat;
        const participant1 = castToGlobalIdentity(chatDoc.participant1Id);
        const participant2 = castToGlobalIdentity(chatDoc.participant2Id);
        
        const otherParticipant = 
          participant1._id.toString() === identityId 
            ? participant2 
            : participant1;

        // Get last message
        const lastMessage = await ContactMessage.findOne({
          contactChatId: chat._id,
          deleted: { $ne: true }
        })
          .sort({ createdAt: -1 });

        // Get unread count
        const unreadCount = await ContactMessage.countDocuments({
          contactChatId: chat._id,
          senderIdentityId: { $ne: new ObjectId(identityId) },
          read: false,
        });

        // Check if user is registered
        const userExists = await User.findOne({ 
          globalIdentityId: otherParticipant._id 
        });

        return {
          chatId: chat._id.toString(),
          otherParticipant: {
            identityId: otherParticipant._id.toString(),
            name: otherParticipant.registeredName || "Без имени",
            phone: otherParticipant.phone || "",
            isRegistered: !!userExists,
          },
          lastMessage: lastMessage?.text || "",
          lastMessageType: lastMessage?.type || "text",
          lastAt: lastMessage?.createdAt || chat.lastAt,
          unreadCount,
          isPinned: chat.isPinned || false,
          isMuted: chat.isMuted || false,
          isArchived: chat.isArchived || false,
        };
      })
    );

    res.json(result);
  } catch (error: any) {
    console.error("GET ALL CONTACT CHATS ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// SEND MESSAGE TO CONTACT
// SEND MESSAGE TO CONTACT - УЛУЧШЕННАЯ ВЕРСИЯ
// SEND MESSAGE TO CONTACT - ИСПРАВЛЕННАЯ ВЕРСИЯ
export const sendContactMessage = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { contactChatId } = req.params;
    const { text, replyTo, type = "text", fileUrl, fileName, fileSize } = req.body;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (type === "text" && (!text || text.trim().length === 0)) {
      return res.status(400).json({ message: "Message text is required" });
    }

    if (type !== "text" && !fileUrl) {
      return res.status(400).json({ message: "File URL is required for non-text messages" });
    }

    const identityObjectId = new Types.ObjectId(identityId);
    const chatObjectId = new Types.ObjectId(contactChatId);

    // Найти чат
    const chat = await ContactChat.findOne({
      _id: chatObjectId,
      $or: [
        { participant1Id: identityObjectId },
        { participant2Id: identityObjectId }
      ]
    })
    .populate<{ participant1Id: IGlobalIdentity, participant2Id: IGlobalIdentity }>(
      ["participant1Id", "participant2Id"],
      "_id registeredName phone"
    ) as any;

    if (!chat) {
      return res.status(404).json({ message: "Chat not found or no access" });
    }

    const populatedChat = chat as unknown as PopulatedContactChat;
    const participant1 = castToGlobalIdentity(populatedChat.participant1Id);
    const participant2 = castToGlobalIdentity(populatedChat.participant2Id);

    // Создать сообщение
    const messageData: any = {
      contactChatId: chat._id,
      senderIdentityId: identityObjectId,
      read: false,
      type,
      readBy: [],
      deleted: false
    };

    if (type === "text") {
      messageData.text = text.trim();
    } else {
      messageData.text = fileName || "Файл";
      messageData.fileUrl = fileUrl;
      messageData.fileName = fileName;
      messageData.fileSize = fileSize;
    }

  if (replyTo) {
  // Save it as a string regardless of whether it's a valid ObjectId
  // This ensures localIds are stored and echoed back
  messageData.replyTo = replyTo; 
}

    const message = await ContactMessage.create(messageData);

    // Обновить информацию чата
    chat.lastMessage = type === "text" ? text : fileName || "Файл";
    chat.lastMessageType = type;
    chat.lastAt = new Date();
    await chat.save();

    // Получить полное сообщение с populate
    const populatedMessage = await ContactMessage.findById(message._id)
      .populate<{ senderIdentityId: IGlobalIdentity }>("senderIdentityId", "registeredName phone")
      .populate("replyTo");

    if (!populatedMessage) {
      return res.status(500).json({ message: "Failed to retrieve created message" });
    }

    // Подготовить данные для отправки
    const sender = castToGlobalIdentity(populatedMessage.senderIdentityId);
    
    const payload = {
      _id: populatedMessage._id.toString(),
      contactChatId: contactChatId,
      text: populatedMessage.text,
      senderId: sender._id.toString(),
      senderName: sender.registeredName || "Без имени",
      createdAt: populatedMessage.createdAt,
      read: populatedMessage.read,
      readBy: populatedMessage.readBy?.map((id: Types.ObjectId) => id.toString()) || [],
      type: populatedMessage.type,
      fileUrl: populatedMessage.fileUrl,
      fileName: populatedMessage.fileName,
      fileSize: populatedMessage.fileSize,
      replyTo: message.replyTo ? message.replyTo.toString() : undefined,
    };

    // Определить другого участника
    const otherParticipant = 
      participant1._id.toString() === identityId 
        ? participant2 
        : participant1;

    // Эмитировать через Socket.IO
    io.to(`contact-chat:${contactChatId}`).emit("contact-chat:new-message", payload);

    // Обновить список чатов для другого участника
    io.to(`user:${otherParticipant._id.toString()}`).emit("contact-chat:list-updated", {
      contactChatId,
      lastMessage: payload.text,
      lastMessageType: type,
      updatedAt: new Date(),
      unreadCount: 1
    });

    // Создать уведомление
    await createNotification(
      otherParticipant._id,
      "contact_message",
      "Новое сообщение",
      payload.text.length > 50 ? payload.text.substring(0, 50) + "..." : payload.text,
      {
        contactChatId: chat._id.toString(),
        messageId: message._id.toString(),
        fromUser: identityId,
      }
    );

    res.status(201).json(payload);

  } catch (error: any) {
    console.error("SEND CONTACT MESSAGE ERROR:", error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ 
      message: "Failed to send message",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
// MARK CONTACT MESSAGES AS READ
// MARK CONTACT MESSAGES AS READ - ИСПРАВЛЕННАЯ ВЕРСИЯ
// MARK CONTACT MESSAGES AS READ - ИСПРАВЛЕННАЯ ВЕРСИЯ
export const markContactMessagesAsRead = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { contactChatId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Найти чат - ИСПРАВЬТЕ ЭТО
    const chat = await ContactChat.findOne({
      _id: new Types.ObjectId(contactChatId), // Преобразовать в ObjectId
      $or: [
        { participant1Id: new Types.ObjectId(identityId) }, // Преобразовать в ObjectId
        { participant2Id: new Types.ObjectId(identityId) }  // Преобразовать в ObjectId
      ]
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found or no access" });
    }

    // Получить все непрочитанные сообщения - ИСПРАВЬТЕ ЭТО
    const unreadMessages = await ContactMessage.find({
      contactChatId: chat._id,
      senderIdentityId: { $ne: new Types.ObjectId(identityId) }, // Преобразовать в ObjectId
      read: false,
    });

    if (unreadMessages.length === 0) {
      return res.json({ 
        success: true, 
        count: 0,
        message: "No unread messages found"
      });
    }

    // Обновить все сообщения как прочитанные
    const updateResult = await ContactMessage.updateMany(
      {
        _id: { $in: unreadMessages.map(m => m._id) }
      },
      { 
        $set: { read: true },
        $addToSet: { readBy: new Types.ObjectId(identityId) }
      }
    );

    // Эмитировать события для КАЖДОГО сообщения через Socket.IO
    unreadMessages.forEach(async (message) => {
      // Обновить документ сообщения с populate
      const updatedMessage = await ContactMessage.findById(message._id)
        .populate("readBy", "_id");
      
      if (updatedMessage) {
        // Отправить событие для каждого сообщения
        io.to(`contact-chat:${contactChatId}`).emit("contact-chat:message-read", {
          contactChatId,
          messageId: message._id.toString(),
          readBy: identityId,
          readAt: new Date(),
          readByUsers: updatedMessage.readBy.map((user: any) => user._id.toString())
        });

        // Также отправить общее событие
        io.to(`contact-chat:${contactChatId}`).emit("contact-chat:all-read", {
          contactChatId,
          readBy: identityId,
          count: unreadMessages.length,
          timestamp: new Date(),
          messageIds: unreadMessages.map(m => m._id.toString())
        });

        // Получить информацию об отправителе для уведомления
        const messageWithSender = await ContactMessage.findById(message._id)
          .populate("senderIdentityId", "_id");
        
        if (messageWithSender && messageWithSender.senderIdentityId) {
          const senderId = (messageWithSender.senderIdentityId as any)._id.toString();
          
          // Отправить уведомление отправителю
          if (senderId !== identityId) {
            await createNotification(
              new Types.ObjectId(senderId),
              "message_read",
              "Сообщение прочитано",
              "Ваше сообщение было прочитано",
              {
                contactChatId: chat._id.toString(),
                messageId: message._id.toString(),
                fromUser: identityId,
              }
            );
          }
        }
      }
    });

    res.json({ 
      success: true, 
      count: updateResult.modifiedCount,
      messageIds: unreadMessages.map(m => m._id.toString())
    });

  } catch (error: any) {
    console.error("MARK CONTACT MESSAGES AS READ ERROR:", error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ message: "Invalid chat ID" });
    }
    
    res.status(500).json({ 
      message: "Failed to mark messages as read",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// MARK SINGLE MESSAGE AS READ - НОВАЯ ФУНКЦИЯ
// ДОБАВЬТЕ ЭТУ ФУНКЦИЮ
// В controllers/contactChat.controller.ts
export const markSingleMessageAsRead = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { contactChatId, messageId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Найти чат
    const chat = await ContactChat.findOne({
      _id: new Types.ObjectId(contactChatId),
      $or: [
        { participant1Id: new Types.ObjectId(identityId) },
        { participant2Id: new Types.ObjectId(identityId) }
      ]
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found or no access" });
    }

    // Найти сообщение - УБЕРИТЕ ПРОВЕРКУ senderIdentityId здесь
    const message = await ContactMessage.findOne({
      _id: new Types.ObjectId(messageId),
      contactChatId: chat._id,
      // УБЕРИТЕ ЭТУ СТРОКУ:
      // senderIdentityId: { $ne: new Types.ObjectId(identityId) },
      read: false
    });

    if (!message) {
      return res.status(404).json({ 
        success: false,
        message: "Message not found or already read"
      });
    }

    // Проверяем, не отправитель ли мы
    if (message.senderIdentityId.toString() === identityId) {
      return res.status(400).json({ 
        success: false,
        message: "You cannot mark your own messages as read"
      });
    }

    // Отметить как прочитанное
    message.read = true;
    if (!message.readBy.includes(new Types.ObjectId(identityId))) {
      message.readBy.push(new Types.ObjectId(identityId));
    }
    await message.save();

    // Получить обновленное сообщение с populate
    const updatedMessage = await ContactMessage.findById(message._id)
      .populate("readBy", "_id")
      .populate("senderIdentityId", "_id registeredName");

    // Эмитировать событие через Socket.IO
    if (updatedMessage) {
      const sender = updatedMessage.senderIdentityId as any;
      
      io.to(`contact-chat:${contactChatId}`).emit("contact-chat:message-read", {
        contactChatId,
        messageId: message._id.toString(),
        readBy: identityId,
        readAt: new Date(),
        readByUsers: updatedMessage.readBy.map((user: any) => user._id.toString()),
        senderId: sender?._id?.toString(),
        senderName: sender?.registeredName
      });

      // Отправить уведомление отправителю
      if (sender && sender._id.toString() !== identityId) {
        await createNotification(
          sender._id,
          "message_read",
          "Сообщение прочитано",
          "Ваше сообщение было прочитано",
          {
            contactChatId: chat._id.toString(),
            messageId: message._id.toString(),
            fromUser: identityId,
          }
        );
      }
    }

    res.json({ 
      success: true, 
      message: "Message marked as read",
      messageId: message._id.toString(),
      readAt: new Date()
    });

  } catch (error: any) {
    console.error("MARK SINGLE MESSAGE AS READ ERROR:", error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ message: "Invalid ID format" });
    }
    
    res.status(500).json({ 
      message: "Failed to mark message as read",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
// UPDATE CONTACT CHAT SETTINGS
export const updateContactChatSettings = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { contactChatId } = req.params;
    const { setting, value } = req.body;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const validSettings = ['isMuted', 'isPinned', 'isArchived'];
    if (!validSettings.includes(setting)) {
      return res.status(400).json({ message: "Invalid setting" });
    }

    const chat = await ContactChat.findOneAndUpdate(
      {
        _id: new ObjectId(contactChatId),
        $or: [
          { participant1Id: new ObjectId(identityId) },
          { participant2Id: new ObjectId(identityId) }
        ]
      },
      { [setting]: value },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Determine notification type based on setting
    let notificationType: "contact_chat_pinned" | "contact_chat_archived" | "contact_chat_muted" = "contact_chat_muted";
    
    if (setting === 'isPinned') {
      notificationType = "contact_chat_pinned";
    } else if (setting === 'isArchived') {
      notificationType = "contact_chat_archived";
    }

    // Create notification - convert string to ObjectId
    await createNotification(
      new ObjectId(identityId), // Convert to ObjectId
      notificationType,
      setting === 'isPinned' ? (value ? "Чат закреплён" : "Чат откреплён") : 
      setting === 'isArchived' ? (value ? "Чат архивирован" : "Чат восстановлен") : 
      (value ? "Уведомления отключены" : "Уведомления включены"),
      setting === 'isPinned' ? (value ? "Вы закрепили чат" : "Вы открепили чат") : 
      setting === 'isArchived' ? (value ? "Вы архивировали чат" : "Вы восстановили чат") : 
      (value ? "Вы отключили уведомления" : "Вы включили уведомления"),
      {
        contactChatId: chat._id.toString(),
        chatId: chat._id.toString(),
      }
    );

    res.json({ chat });
  } catch (error: any) {
    console.error("UPDATE CONTACT CHAT SETTINGS ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// SEARCH CONTACTS FOR CHAT
export const searchContactsForChat = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { q, limit = 20 } = req.query;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!q || typeof q !== "string" || q.length < 2) {
      return res.json({ contacts: [], globalIdentities: [] });
    }

    // Функция для экранирования специальных символов в регулярных выражениях
    const escapeRegex = (text: string) => {
      return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    // Очищаем поисковый запрос - убираем + и другие символы для поиска телефонов
    const cleanQuery = q.replace(/[^\d]/g, '');
    const escapedQuery = escapeRegex(q);

    // Поиск в локальных контактах (CRM)
    let localContacts = [];
    if (cleanQuery.length >= 2) {
      // Поиск по очищенному телефону (только цифры)
      localContacts = await Customer.find({
        ownerIdentityId: new ObjectId(identityId),
        $or: [
          { localName: { $regex: escapedQuery, $options: "i" } },
          { phone: { $regex: cleanQuery } }
        ]
      })
        .populate("targetIdentityId", "registeredName phone trustScore")
        .limit(parseInt(limit as string) || 10);
    } else {
      // Если запрос содержит только буквы
      localContacts = await Customer.find({
        ownerIdentityId: new ObjectId(identityId),
        localName: { $regex: escapedQuery, $options: "i" }
      })
        .populate("targetIdentityId", "registeredName phone trustScore")
        .limit(parseInt(limit as string) || 10);
    }

    // Поиск в глобальных идентификаторах (исключая себя)
    let globalIdentities = [];
    
    if (cleanQuery.length >= 2) {
      // Поиск по очищенному телефону (только цифры)
      globalIdentities = await GlobalIdentity.find({
        _id: { $ne: new ObjectId(identityId) },
        $or: [
          { registeredName: { $regex: escapedQuery, $options: "i" } },
          { phone: { $regex: cleanQuery } }
        ]
      })
        .select("registeredName phone trustScore")
        .limit(parseInt(limit as string) || 10);
    } else {
      // Если запрос содержит только буквы
      globalIdentities = await GlobalIdentity.find({
        _id: { $ne: new ObjectId(identityId) },
        registeredName: { $regex: escapedQuery, $options: "i" }
      })
        .select("registeredName phone trustScore")
        .limit(parseInt(limit as string) || 10);
    }

    // Проверяем, какие глобальные идентификаторы являются зарегистрированными пользователями
    const phones = globalIdentities.map((i: any) => i.phone);
    const users = await User.find({ phone: { $in: phones } }).select("phone");
    const userPhones = new Set(users.map((u: any) => u.phone));

    const enrichedGlobalIdentities = globalIdentities.map((i: any) => ({
      ...i.toObject(),
      isRegistered: userPhones.has(i.phone),
    }));

    // Проверяем существующие чаты с этими контактами
    const existingChats = await ContactChat.find({
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    }).select("participant1Id participant2Id");

    const existingContactIds = new Set();
    existingChats.forEach(chat => {
      const otherId = chat.participant1Id.toString() === identityId 
        ? chat.participant2Id.toString() 
        : chat.participant1Id.toString();
      existingContactIds.add(otherId);
    });

    // Форматируем ответ
    const contacts = localContacts.map((contact: any) => ({
      type: "local",
      identityId: contact.targetIdentityId?._id?.toString() || contact.targetIdentityId?.toString() || "",
      name: contact.localName,
      phone: contact.phone,
      trustScore: contact.targetIdentityId?.trustScore || 50,
      hasExistingChat: existingContactIds.has(contact.targetIdentityId?._id?.toString() || contact.targetIdentityId?.toString() || ""),
    }));

    const globalContacts = enrichedGlobalIdentities.map((identity: any) => ({
      type: "global",
      identityId: identity._id.toString(),
      name: identity.registeredName,
      phone: identity.phone,
      trustScore: identity.trustScore,
      isRegistered: identity.isRegistered,
      hasExistingChat: existingContactIds.has(identity._id.toString()),
    }));

    res.json({
      contacts: [...contacts, ...globalContacts],
      count: contacts.length + globalContacts.length,
    });
  } catch (error: any) {
    console.error("SEARCH CONTACTS FOR CHAT ERROR:", error);
    
    // Более информативные сообщения об ошибках
    if (error.message.includes("Regular expression")) {
      return res.status(400).json({ 
        message: "Некорректный поисковый запрос. Пожалуйста, используйте только буквы или цифры" 
      });
    }
    
    res.status(500).json({ 
      message: "Произошла ошибка при поиске контактов. Пожалуйста, попробуйте позже." 
    });
  }
};

// GET CONTACT CHAT BY ID
// GET CONTACT CHAT BY ID
// GET CONTACT CHAT BY ID - Fixed version
// GET CONTACT CHAT BY ID - Fixed version
export const getContactChatById = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { contactChatId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!contactChatId) {
      return res.status(400).json({ message: "Chat ID is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(contactChatId)) {
      return res.status(400).json({ message: "Invalid chat ID format" });
    }

    const chat = await ContactChat.findOne({
      _id: new ObjectId(contactChatId),
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    })
      .populate<{ participant1Id: IGlobalIdentity, participant2Id: IGlobalIdentity }>(
        ["participant1Id", "participant2Id"],
        "registeredName phone"
      ) as any;

    if (!chat) {
      return res.status(404).json({ 
        message: "Чат не найден или у вас нет доступа к этому чату" 
      });
    }

    const populatedChat = chat as unknown as PopulatedContactChat;
    const participant1 = castToGlobalIdentity(populatedChat.participant1Id);
    const participant2 = castToGlobalIdentity(populatedChat.participant2Id);
    
    const otherParticipant = 
      participant1._id.toString() === identityId 
        ? participant2 
        : participant1;

    // Check if user is registered
    let userExists = false;
    if (otherParticipant._id) {
      userExists = !!(await User.findOne({ 
        globalIdentityId: otherParticipant._id 
      }));
    }

    // Get messages for this chat
    const messages = await ContactMessage.find({
      contactChatId: chat._id,
      deleted: { $ne: true }
    })
      .populate<{ senderIdentityId: IGlobalIdentity }>("senderIdentityId", "registeredName phone")
      .sort({ createdAt: 1 });

    const mappedMessages = messages.map(msg => {
      const sender = castToGlobalIdentity(msg.senderIdentityId);
      
      return {
        _id: msg._id,
        text: msg.text,
        senderId: sender._id.toString(),
        senderName: sender.registeredName || "Без имени",
        createdAt: msg.createdAt,
        read: msg.read,
        readBy: msg.readBy || [],
        isMine: sender._id.toString() === identityId,
        type: msg.type || "text",
        fileUrl: msg.fileUrl,
        fileName: msg.fileName,
        fileSize: msg.fileSize,
        replyTo: msg.replyTo,
      };
    });

    res.json({
      chat: {
        chatId: chat._id.toString(),
        otherParticipant: {
          identityId: otherParticipant._id.toString(),
          name: otherParticipant.registeredName || "Без имени",
          phone: otherParticipant.phone || "",
          isRegistered: userExists,
        },
        settings: {
          isMuted: chat.isMuted || false,
          isArchived: chat.isArchived || false,
          isPinned: chat.isPinned || false,
        },
        lastMessage: chat.lastMessage,
        lastMessageType: chat.lastMessageType,
        lastAt: chat.lastAt,
      },
      messages: mappedMessages,
    });
  } catch (error: any) {
    console.error("GET CONTACT CHAT BY ID ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};
// GET CONTACT MESSAGES
export const getContactMessages = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { contactChatId } = req.params;
    const { limit = 50, before } = req.query;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if user has access to this chat
    const chat = await ContactChat.findOne({
      _id: new ObjectId(contactChatId),
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Build query for messages
    const query: any = {
      contactChatId: chat._id,
      deleted: { $ne: true }
    };

    // If before date is provided, get messages before that date
    if (before && typeof before === 'string') {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await ContactMessage.find(query)
      .populate("senderIdentityId", "registeredName phone")
      .populate("replyTo")
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    const mappedMessages = messages.reverse().map(msg => {
      const msgObj = msg.toObject();
      return {
        _id: msgObj._id,
        text: msgObj.text,
        senderId: (msgObj.senderIdentityId as any)._id.toString(),
        senderName: (msgObj.senderIdentityId as any).registeredName,
        createdAt: msgObj.createdAt,
        read: msgObj.read,
        readBy: msgObj.readBy || [],
        isMine: (msgObj.senderIdentityId as any)._id.toString() === identityId,
        type: msgObj.type || "text",
        fileUrl: msgObj.fileUrl,
        fileName: msgObj.fileName,
        fileSize: msgObj.fileSize,
       replyTo: msgObj.replyTo ? msgObj.replyTo.toString() : undefined,
      };
    });

    res.json({
      messages: mappedMessages,
      hasMore: messages.length === Number(limit),
    });
  } catch (error: any) {
    console.error("GET CONTACT MESSAGES ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// DELETE CONTACT MESSAGE
export const deleteContactMessage = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { contactChatId, messageId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if user has access to this chat
    const chat = await ContactChat.findOne({
      _id: new ObjectId(contactChatId),
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Check if message belongs to user
    const message = await ContactMessage.findOne({
      _id: new ObjectId(messageId),
      contactChatId: chat._id,
      senderIdentityId: new ObjectId(identityId)
    });

    if (!message) {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }

    // Soft delete
    message.deleted = true;
    await message.save();

    // Emit socket event
    io.to(`contact-chat:${contactChatId}`).emit("contact-chat:message-deleted", {
      contactChatId,
      messageId
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("DELETE CONTACT MESSAGE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// CLEAR CONTACT CHAT
export const clearContactChat = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { contactChatId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if user has access to this chat
    const chat = await ContactChat.findOne({
      _id: new ObjectId(contactChatId),
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Soft delete all messages
    await ContactMessage.updateMany(
      { contactChatId: chat._id },
      {
        deleted: true,
      }
    );

    // Update chat info - use $unset to remove the field instead of setting to undefined
    await ContactChat.findByIdAndUpdate(chat._id, {
      $set: { lastMessage: "" },
      $unset: { lastMessageType: "" }
    });

    // Emit socket event
    io.to(`contact-chat:${contactChatId}`).emit("contact-chat:cleared", {
      contactChatId,
      clearedBy: identityId
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("CLEAR CONTACT CHAT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};
// MARK ALL MESSAGES AS READ FOR A CHAT
export const markAllMessagesAsRead = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { contactChatId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Найти чат
    const chat = await ContactChat.findOne({
      _id: new Types.ObjectId(contactChatId),
      $or: [
        { participant1Id: new Types.ObjectId(identityId) },
        { participant2Id: new Types.ObjectId(identityId) }
      ]
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found or no access" });
    }

    // Получить ВСЕ непрочитанные сообщения от других пользователей
    const unreadMessages = await ContactMessage.find({
      contactChatId: chat._id,
      senderIdentityId: { $ne: new Types.ObjectId(identityId) },
      read: false,
    });

    if (unreadMessages.length === 0) {
      return res.json({ 
        success: true, 
        count: 0,
        message: "No unread messages found"
      });
    }

    // Обновить все сообщения как прочитанные
    const updateResult = await ContactMessage.updateMany(
      {
        contactChatId: chat._id,
        senderIdentityId: { $ne: new Types.ObjectId(identityId) },
        read: false
      },
      { 
        $set: { read: true },
        $addToSet: { readBy: new Types.ObjectId(identityId) }
      }
    );

    // Отправить сокет события
    const messageIds = unreadMessages.map(m => m._id.toString());
    
    io.to(`contact-chat:${contactChatId}`).emit("contact-chat:all-read", {
      contactChatId,
      readBy: identityId,
      count: updateResult.modifiedCount,
      timestamp: new Date(),
      messageIds
    });

    // Создать уведомления для отправителей
    for (const message of unreadMessages) {
      const senderId = message.senderIdentityId.toString();
      
      if (senderId !== identityId) {
        await createNotification(
          new Types.ObjectId(senderId),
          "message_read",
          "Все сообщения прочитаны",
          `Все ваши сообщения в чате были прочитаны`,
          {
            contactChatId: chat._id.toString(),
            fromUser: identityId,
          }
        );
      }
    }

    res.json({ 
      success: true, 
      count: updateResult.modifiedCount,
      messageIds
    });

  } catch (error: any) {
    console.error("MARK ALL MESSAGES AS READ ERROR:", error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ message: "Invalid chat ID" });
    }
    
    res.status(500).json({ 
      message: "Failed to mark all messages as read",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};