// controllers/chat.controller.ts
import { Request, Response } from "express";
import mongoose from "mongoose";
import Chat from "../models/Chat";
import Message from "../models/Message";
import ChatSettings from "../models/ChatSettings";
import { io } from "../index";
import { createNotification } from "./notification.controller";
import User from "../models/User";

const { ObjectId } = mongoose.Types;

// GET CHAT BY DEBT
// controllers/chat.controller.ts - добавьте пагинацию к getChatByDebt
// GET CHAT BY DEBT - ИСПРАВЛЕННАЯ ВЕРСИЯ
export const getChatByDebt = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const chat = await Chat.findOne({
      debtId: new ObjectId(debtId),
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    })
      .populate("participant1Id", "registeredName phone localName") // Добавьте localName
      .populate("participant2Id", "registeredName phone localName"); // Добавьте localName

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Get chat settings
    const chatSettings = await ChatSettings.findOne({
      debtId: new ObjectId(debtId),
      userId: new ObjectId(identityId)
    });

    // Определяем участников
    const chatObj = chat.toObject();
    const otherParticipant = 
      (chatObj.participant1Id as any)._id.toString() === identityId 
        ? chatObj.participant2Id 
        : chatObj.participant1Id;

    // Используем localName если есть, иначе registeredName
    const participantName = (otherParticipant as any).localName || 
                            (otherParticipant as any).registeredName;

    // Получаем сообщения с пагинацией
    const messages = await Message.find({
      chatId: chat._id,
    })
      .populate("senderIdentityId", "registeredName phone localName") // Добавьте localName
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Обратный порядок для отображения (старые первыми)
    const sortedMessages = messages.reverse();

    const mappedMessages = sortedMessages.map(msg => {
      const msgObj = msg.toObject();
      const senderName = (msgObj.senderIdentityId as any).localName || 
                         (msgObj.senderIdentityId as any).registeredName;
      return {
        _id: msgObj._id,
        text: msgObj.text,
        senderId: (msgObj.senderIdentityId as any)._id.toString(),
        senderName: senderName, // Используем localName
        createdAt: msgObj.createdAt,
        read: msgObj.read,
        readBy: msgObj.readBy || [],
        isMine: (msgObj.senderIdentityId as any)._id.toString() === identityId,
        isSystemMessage: msgObj.isSystemMessage,
        type: msgObj.type || "text",
        fileUrl: msgObj.fileUrl,
        fileName: msgObj.fileName,
        fileSize: msgObj.fileSize,
        replyTo: msgObj.replyTo ? msgObj.replyTo.toString() : undefined,
      };
    });

    // Получаем общее количество сообщений
    const totalMessages = await Message.countDocuments({
      chatId: chat._id,
    });

    const userExists = await User.findOne({ 
      globalIdentityId: (otherParticipant as any)._id 
    });

    res.json({
      chat: {
        debtId: chat.debtId,
        otherParticipant: {
          identityId: (otherParticipant as any)._id,
          name: participantName, // Используем localName
          localName: (otherParticipant as any).localName, // Добавляем отдельно
          phone: (otherParticipant as any).phone,
          isRegistered: !!userExists,
        },
        settings: chatSettings ? {
          isMuted: chatSettings.isMuted,
          isArchived: chatSettings.isArchived,
          isPinned: chatSettings.isPinned,
          customNotification: chatSettings.customNotification
        } : {
          isMuted: false,
          isArchived: false,
          isPinned: false,
          customNotification: false
        }
      },
      messages: mappedMessages,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalMessages,
        pages: Math.ceil(totalMessages / limitNum)
      }
    });
  } catch (error: any) {
    console.error("GET CHAT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET ALL MY CHATS
// GET ALL MY CHATS - ИСПРАВЛЕННАЯ ВЕРСИЯ
export const getAllChats = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const chats = await Chat.find({
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    })
      .populate("participant1Id", "localName phone registeredName") // Добавьте localName
      .populate("participant2Id", "localName phone registeredName") // Добавьте localName
      .sort({ updatedAt: -1 });

    const result = await Promise.all(
      chats.map(async (chat) => {
        const chatObj = chat.toObject();
        const lastMessage = await Message.findOne({ chatId: chat._id })
          .populate("senderIdentityId", "registeredName localName") // Добавьте localName
          .sort({ createdAt: -1 });

        // Get chat settings
        const chatSettings = await ChatSettings.findOne({
          debtId: chat.debtId,
          userId: new ObjectId(identityId)
        });

        // Skip archived chats if not showing archived
        if (chatSettings?.isArchived && !req.query.showArchived) {
          return null;
        }

        // Kim qaysi participant ekanligini aniqlash
        const otherParticipant = 
          (chatObj.participant1Id as any)._id.toString() === identityId 
            ? chatObj.participant2Id 
            : chatObj.participant1Id;

        // Use localName if available, otherwise fallback to registeredName
        const participantName = (otherParticipant as any).localName || 
                                (otherParticipant as any).registeredName;

        return {
          debtId: chat.debtId,
          chatId: chat._id,
          otherParticipant: {
            identityId: (otherParticipant as any)._id,
            name: participantName, // Используем localName
            localName: (otherParticipant as any).localName, // Добавляем localName в ответ
            registeredName: (otherParticipant as any).registeredName, // Оставляем для совместимости
            phone: (otherParticipant as any).phone,
          },
          lastMessage: lastMessage?.text || "",
          lastMessageType: lastMessage?.type || "text",
          lastAt: lastMessage?.createdAt,
          unreadCount: await Message.countDocuments({
            chatId: chat._id,
            read: false,
            senderIdentityId: { $ne: new ObjectId(identityId) }
          }),
          isPinned: chatSettings?.isPinned || false,
          isMuted: chatSettings?.isMuted || false,
          isArchived: chatSettings?.isArchived || false,
        };
      })
    );

    // Filter out null values and sort: pinned first, then by last message date
    const filteredResult = result.filter(chat => chat !== null);
    filteredResult.sort((a, b) => {
      if (a!.isPinned && !b!.isPinned) return -1;
      if (!a!.isPinned && b!.isPinned) return 1;
      return new Date(b!.lastAt!).getTime() - new Date(a!.lastAt!).getTime();
    });

    res.json(filteredResult);
  } catch (error: any) {
    console.error("GET ALL CHATS ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// SEND MESSAGE
// SEND MESSAGE - UPDATED VERSION
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;
    const { text, replyTo, type = "text", fileUrl, fileName, fileSize } = req.body;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (type === "text" && !text?.trim()) {
      return res.status(400).json({ message: "Message text is required" });
    }

    if (type !== "text" && !fileUrl) {
      return res.status(400).json({ message: "File URL is required for non-text messages" });
    }

    const chat = await Chat.findOne({
      debtId: new ObjectId(debtId),
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Message yaratish - FIXED
    const messageData: any = {
      chatId: chat._id,
      senderIdentityId: new ObjectId(identityId),
      read: false, // Initially not read
      isSystemMessage: false,
      type,
      readBy: [new ObjectId(identityId)] // Sender automatically reads their own message
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
      messageData.replyTo = new ObjectId(replyTo);
    }

    const message = await Message.create(messageData);

    const populatedMessage = await Message.findById(message._id)
      .populate("senderIdentityId", "registeredName phone localName");

    if (!populatedMessage) {
      return res.status(500).json({ message: "Failed to create message" });
    }

    const messageObj = populatedMessage.toObject();
    
    // IMPORTANT: For sender, message is already read (by sender)
    const isMine = (messageObj.senderIdentityId as any)._id.toString() === identityId;
        const senderName = (messageObj.senderIdentityId as any).localName || 
                      (messageObj.senderIdentityId as any).registeredName;
    const payload = {
      _id: messageObj._id,
      debtId,
      text: messageObj.text,
      senderId: identityId,
      senderName: senderName,
      createdAt: messageObj.createdAt,
      read: isMine, // For sender, it's already read
      readBy: [identityId], // Sender read it
      isSystemMessage: false,
      type: messageObj.type,
      fileUrl: messageObj.fileUrl,
      fileName: messageObj.fileName,
      fileSize: messageObj.fileSize,
       replyTo: messageObj.replyTo ? messageObj.replyTo.toString() : undefined, // ADD THIS LINE
    };

    // Update chat's updatedAt
    await Chat.findByIdAndUpdate(chat._id, { updatedAt: new Date() });

    // Real-time notification to debt room
    io.to(`debt:${debtId}`).emit("chat:new-message", payload);

    // Notify other participant
    const otherParticipantId = 
      chat.participant1Id.toString() === identityId 
        ? chat.participant2Id 
        : chat.participant1Id;
    
    // Update chat list for other participant
    io.to(`user:${otherParticipantId}`).emit("chat:list-updated", {
      debtId,
      lastMessage: text || fileName || "Файл",
      lastMessageType: type,
      updatedAt: new Date()
    });

    // Create notification for other participant
    await createNotification(
      otherParticipantId,
      "new_message",
      "Новое сообщение",
      text || "Вложение",
      {
        debtId: new ObjectId(debtId),
        chatId: chat._id,
        messageId: message._id,
        fromUser: new ObjectId(identityId),
      }
    );

    res.status(201).json(payload);
  } catch (error: any) {
    console.error("SEND MESSAGE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// MARK AS READ
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const chat = await Chat.findOne({
      debtId: new ObjectId(debtId),
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Faqat men yozmagan xabarlarni o'qilgan qilish
    const result = await Message.updateMany(
      {
        chatId: chat._id,
        senderIdentityId: { $ne: new ObjectId(identityId) },
        read: false,
      },
      { 
        read: true,
        $addToSet: { readBy: new ObjectId(identityId) }
      }
    );

    // Emit socket event for all messages marked as read
    io.to(`debt:${debtId}`).emit("chat:all-read", {
      debtId,
      readBy: identityId,
      count: result.modifiedCount,
      timestamp: new Date()
    });

    // In markAsRead function, after marking messages as read:
if (result.modifiedCount > 0) {
  const chatObj = chat.toObject();
  const otherParticipantId = 
    chatObj.participant1Id.toString() === identityId 
      ? chatObj.participant2Id 
      : chatObj.participant1Id;

  // Create notification for sender that message was read
  await createNotification(
    otherParticipantId,
    "message_read",
    "Сообщение прочитано",
    `Ваше сообщение было прочитано`,
    {
      debtId: new ObjectId(debtId),
      chatId: chat._id,
      fromUser: new ObjectId(identityId),
    }
  );
}
    res.json({ 
      success: true, 
      count: result.modifiedCount 
    });
  } catch (error: any) {
    console.error("MARK AS READ ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// MARK SINGLE MESSAGE AS READ
// MARK SINGLE MESSAGE AS READ - UPDATED VERSION
// В controllers/chat.controller.ts исправьте markMessageAsRead:
// В controllers/chat.controller.ts исправьте markMessageAsRead:
// MARK SINGLE MESSAGE AS READ - UPDATED VERSION WITH PROPER SOCKET EMITS
export const markMessageAsRead = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId, messageId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Получаем чат
    const chat = await Chat.findOne({
      debtId: new ObjectId(debtId),
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Получаем сообщение
    const message = await Message.findOne({
      _id: new ObjectId(messageId),
      chatId: chat._id
    })
      .populate("senderIdentityId", "_id registeredName phone")
      .populate("readBy", "_id registeredName");

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Если это мое сообщение - не отмечаем как прочитанное
    if (message.senderIdentityId._id.toString() === identityId) {
      return res.status(200).json({ 
        success: true, 
        message: "Cannot mark own message as read" 
      });
    }

    // Проверяем, не прочитано ли уже этим пользователем
    const alreadyRead = message.readBy.some(
      (reader: any) => reader._id.toString() === identityId
    );

    let updateResult: any = {
      alreadyRead,
      updated: false,
      newReadBy: []
    };

    if (!alreadyRead) {
      // Добавляем пользователя в список прочитавших
      message.readBy.push(new ObjectId(identityId));
      
      // Если это первый читатель (помимо отправителя), помечаем как прочитанное
      if (message.readBy.length >= 1) {
        message.read = true;
      }
      
      await message.save();

      // Получаем обновленное сообщение с данными о читателях
      const updatedMessage = await Message.findById(message._id)
        .populate("senderIdentityId", "_id registeredName")
        .populate("readBy", "_id registeredName");

      if (!updatedMessage) {
        return res.status(500).json({ message: "Failed to retrieve updated message" });
      }

      const readByUsers = updatedMessage.readBy.map((reader: any) => ({
        id: reader._id.toString(),
        name: reader.registeredName || 'Пользователь'
      }));

      updateResult = {
        alreadyRead: false,
        updated: true,
        newReadBy: readByUsers,
        totalReaders: readByUsers.length
      };

      // ========== СВОБЫТИЯ SOCKET ==========
      
      // 1. Событие для комнаты чата (все участники видят, что сообщение прочитано)
      const chatRoomData = {
        debtId,
        messageId,
        readerId: identityId,
        readBy: updatedMessage.readBy.map((reader: any) => reader._id.toString()),
        readByUsers,
        timestamp: new Date(),
        isRead: true
      };
      
      // Отправляем в комнату чата
      io.to(`debt:${debtId}`).emit("chat:message-read", chatRoomData);

      // 2. КРИТИЧЕСКО: Отдельное событие для отправителя сообщения
      if (message.senderIdentityId._id.toString() !== identityId) {
        const senderRoomData = {
          debtId,
          messageId,
          readBy: identityId,
          readerId: identityId,
          readAt: new Date(),
          isReadByOthers: true
        };
        
        // Отправляем отправителю в его персональную комнату
        io.to(`user:${message.senderIdentityId._id}`).emit("chat:your-message-read", senderRoomData);
        
      }

      // 3. Уведомляем отправителя через notification
      await createNotification(
        message.senderIdentityId._id,
        "message_read",
        "Сообщение прочитано",
        `Ваше сообщение было прочитано`,
        {
          debtId: new ObjectId(debtId),
          chatId: chat._id,
          messageId: message._id,
          readerId: new ObjectId(identityId),
        }
      );

    } 

    // Подготавливаем ответ для клиента
    const finalReadBy = alreadyRead 
      ? message.readBy.map((reader: any) => ({
          id: reader._id?.toString() || reader.toString(),
          name: reader.registeredName || 'Пользователь'
        }))
      : updateResult.newReadBy;

    res.json({ 
      success: true,
      message: alreadyRead ? "Message was already read" : "Message marked as read",
      readBy: finalReadBy,
      totalReaders: finalReadBy.length,
      alreadyRead,
      updated: !alreadyRead
    });

  } catch (error: any) {
    console.error("❌ MARK MESSAGE AS READ ERROR:", {
      message: error.message,
      stack: error.stack,
      debtId: req.params.debtId,
      messageId: req.params.messageId
    });
    
    res.status(500).json({ 
      message: "Internal server error",
      error: error.message 
    });
  }
};

// GET CHAT SETTINGS
export const getChatSettings = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get or create chat settings
    let settings = await ChatSettings.findOne({
      debtId: new ObjectId(debtId),
      userId: new ObjectId(identityId)
    });

    if (!settings) {
      settings = await ChatSettings.create({
        debtId: new ObjectId(debtId),
        userId: new ObjectId(identityId),
        isMuted: false,
        isPinned: false,
        isArchived: false,
        customNotification: false
      });
    }

    res.json({ settings });
  } catch (error: any) {
    console.error("GET CHAT SETTINGS ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// UPDATE CHAT SETTINGS
export const updateChatSettings = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;
    const { setting, value } = req.body;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const validSettings = ['isMuted', 'isPinned', 'isArchived', 'customNotification'];
    if (!validSettings.includes(setting)) {
      return res.status(400).json({ message: "Invalid setting" });
    }

    const settings = await ChatSettings.findOneAndUpdate(
      {
        debtId: new ObjectId(debtId),
        userId: new ObjectId(identityId)
      },
      { [setting]: value },
      { new: true, upsert: true }
    );
// In updateChatSettings function:
if (setting === 'isPinned') {
  // Create notification for chat pinned/unpinned
  await createNotification(
    new ObjectId(identityId),
    "chat_pinned",
    value ? "Чат закреплён" : "Чат откреплён",
    value ? "Вы закрепили чат" : "Вы открепили чат",
    {
      debtId: new ObjectId(debtId),
    }
  );
} else if (setting === 'isArchived') {
  await createNotification(
    new ObjectId(identityId),
    "chat_archived",
    value ? "Чат архивирован" : "Чат восстановлен",
    value ? "Вы архивировали чат" : "Вы восстановили чат",
    {
      debtId: new ObjectId(debtId),
    }
  );
}
    res.json({ settings });
  } catch (error: any) {
    console.error("UPDATE CHAT SETTINGS ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// DELETE MESSAGE
export const deleteMessage = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId, messageId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const chat = await Chat.findOne({
      debtId: new ObjectId(debtId),
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Check if message belongs to user
    const message = await Message.findOne({
      _id: new ObjectId(messageId),
      chatId: chat._id,
      senderIdentityId: new ObjectId(identityId)
    });

    if (!message) {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }

    // Soft delete - just mark as deleted
    await Message.findByIdAndUpdate(messageId, {
      deleted: true,
      text: "Сообщение удалено",
      fileUrl: null,
      fileName: null,
      fileSize: null
    });

    // Emit socket event
    io.to(`debt:${debtId}`).emit("chat:message-deleted", {
      debtId,
      messageId
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("DELETE MESSAGE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// CLEAR CHAT
export const clearChat = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const chat = await Chat.findOne({
      debtId: new ObjectId(debtId),
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Soft delete all messages
    await Message.updateMany(
      { chatId: chat._id },
      {
        deleted: true,
        text: "Сообщение удалено",
        fileUrl: null,
        fileName: null,
        fileSize: null
      }
    );

    // Emit socket event
    io.to(`debt:${debtId}`).emit("chat:cleared", {
      debtId,
      clearedBy: identityId
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("CLEAR CHAT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// DELETE CHAT
export const deleteChat = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Archive the chat instead of deleting
    await ChatSettings.findOneAndUpdate(
      {
        debtId: new ObjectId(debtId),
        userId: new ObjectId(identityId)
      },
      { isArchived: true },
      { upsert: true }
    );

    // Emit socket event
    io.to(`user:${identityId}`).emit("chat:archived", {
      debtId
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("DELETE CHAT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// SEARCH MESSAGES
// SEARCH MESSAGES - ИСПРАВЛЕННАЯ ВЕРСИЯ
export const searchMessages = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;
    const { query } = req.query;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: "Search query is required" });
    }

    const chat = await Chat.findOne({
      debtId: new ObjectId(debtId),
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    const messages = await Message.find({
      chatId: chat._id,
      text: { $regex: query, $options: 'i' },
      deleted: { $ne: true }
    })
      .populate("senderIdentityId", "registeredName phone localName") // Добавьте localName
      .sort({ createdAt: -1 })
      .limit(50);

    const mappedMessages = messages.map(msg => {
      const msgObj = msg.toObject();
      const senderName = (msgObj.senderIdentityId as any).localName || 
                         (msgObj.senderIdentityId as any).registeredName;
      return {
        _id: msgObj._id,
        text: msgObj.text,
        senderId: (msgObj.senderIdentityId as any)._id.toString(),
        senderName: senderName, // ИСПРАВЛЕНО: используем localName
        createdAt: msgObj.createdAt,
        read: msgObj.read,
        isMine: (msgObj.senderIdentityId as any)._id.toString() === identityId,
        isSystemMessage: msgObj.isSystemMessage,
        type: msgObj.type,
      };
    });

    res.json({ messages: mappedMessages, count: messages.length });
  } catch (error: any) {
    console.error("SEARCH MESSAGES ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// UPLOAD FILE
// UPLOAD FILE - ИСПРАВЛЕННАЯ ВЕРСИЯ
export const uploadFile = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;
    const file = (req as any).file;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Chat topish
    const chat = await Chat.findOne({
      debtId: new ObjectId(debtId),
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Determine file type
    const fileType = file.mimetype.startsWith('image/') ? 'image' :
                    file.mimetype.startsWith('audio/') ? 'voice' : 'file';

    // Upload to cloud storage (implement your own logic here)
    // For now, we'll just return the file info
    const fileUrl = `/uploads/${file.filename}`;
    
    // Send the file as a message
    const messageData: any = {
      chatId: chat._id,
      senderIdentityId: new ObjectId(identityId),
      text: file.originalname,
      fileUrl,
      fileName: file.originalname,
      fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      type: fileType,
      read: false,
      isSystemMessage: false,
      readBy: []
    };

    const message = await Message.create(messageData);

    const populatedMessage = await Message.findById(message._id)
      .populate("senderIdentityId", "registeredName phone localName"); // Добавьте localName

    const messageObj = populatedMessage!.toObject();
    
    // ИСПРАВЛЕНО: Используем localName
    const senderName = (messageObj.senderIdentityId as any).localName || 
                      (messageObj.senderIdentityId as any).registeredName;
    
    const payload = {
      _id: messageObj._id,
      debtId,
      text: messageObj.text,
      senderId: identityId,
      senderName: senderName, // ИСПРАВЛЕНО: используем localName
      createdAt: messageObj.createdAt,
      read: false,
      readBy: [],
      isSystemMessage: false,
      type: messageObj.type,
      fileUrl: messageObj.fileUrl,
      fileName: messageObj.fileName,
      fileSize: messageObj.fileSize,
    };

    // Update chat's updatedAt
    await Chat.findByIdAndUpdate(chat._id, { updatedAt: new Date() });

    // Real-time notification
    io.to(`debt:${debtId}`).emit("chat:new-message", payload);

    // Notify other participant
    const otherParticipantId = 
      chat.participant1Id.toString() === identityId 
        ? chat.participant2Id 
        : chat.participant1Id;
    
    io.to(`user:${otherParticipantId}`).emit("chat:list-updated", {
      debtId,
      lastMessage: file.originalname,
      lastMessageType: fileType,
      updatedAt: new Date()
    });

    res.status(201).json(payload);
  } catch (error: any) {
    console.error("UPLOAD FILE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// EXPORT CHAT
// EXPORT CHAT - ИСПРАВЛЕННАЯ ВЕРСИЯ
export const exportChat = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const chat = await Chat.findOne({
      debtId: new ObjectId(debtId),
      $or: [
        { participant1Id: new ObjectId(identityId) },
        { participant2Id: new ObjectId(identityId) }
      ]
    })
      .populate("participant1Id", "registeredName phone localName") // Добавьте localName
      .populate("participant2Id", "registeredName phone localName"); // Добавьте localName

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    const messages = await Message.find({
      chatId: chat._id,
      deleted: { $ne: true }
    })
      .populate("senderIdentityId", "registeredName localName") // Добавьте localName
      .sort({ createdAt: 1 });

    // Kim qaysi participant ekanligini aniqlash
    const chatObj = chat.toObject();
    const otherParticipant = 
      (chatObj.participant1Id as any)._id.toString() === identityId 
        ? chatObj.participant2Id 
        : chatObj.participant1Id;

    // Используем localName если есть
    const otherParticipantName = (otherParticipant as any).localName || 
                                 (otherParticipant as any).registeredName;

    // Create export text
    let exportText = `Чат с ${otherParticipantName}\n`;
    exportText += `Телефон: ${(otherParticipant as any).phone || "—"}\n`;
    exportText += `Дата экспорта: ${new Date().toLocaleString('ru-RU')}\n\n`;
    exportText += "=".repeat(50) + "\n\n";

    messages.forEach((msg: any) => {
      const date = new Date(msg.createdAt).toLocaleString('ru-RU');
      const isMine = msg.senderIdentityId._id.toString() === identityId;
      const senderName = isMine ? 'Вы' : 
                        (msg.senderIdentityId as any).localName || 
                        (msg.senderIdentityId as any).registeredName;
      exportText += `[${date}] ${senderName}:\n`;
      exportText += `${msg.text}\n\n`;
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="chat_${debtId}_${new Date().toISOString().split('T')[0]}.txt"`);
    
    res.send(exportText);
  } catch (error: any) {
    console.error("EXPORT CHAT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// controllers/chat.controller.ts
// controllers/chat.controller.ts - Add this function
export const getChatMessages = async (req: Request, res: Response) => {
  try {
    const { debtId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const skip = (Number(page) - 1) * Number(limit);
    
    // Find messages for this chat
    const messages = await Message.find({ debtId })
      .sort({ createdAt: -1 }) // Get newest first
      .skip(skip)
      .limit(Number(limit))
      .lean();
    
    // Get total count
    const total = await Message.countDocuments({ debtId });
    
    // Reverse to show oldest first (for proper display)
    const reversedMessages = messages.reverse();
    
    res.json({
      success: true,
      messages: reversedMessages,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        hasMore: skip + messages.length < total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error("Error getting chat messages:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch messages" 
    });
  }
};
// In your chat.controller.ts
// In your chat.controller.ts
export const getChatInfo = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Find chat
    const chat = await Chat.findOne({ debtId: new ObjectId(debtId) })
      .populate("participant1Id", "registeredName phone localName") // Добавьте localName
      .populate("participant2Id", "registeredName phone localName"); // Добавьте localName

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Check access
    const isParticipant = 
      chat.participant1Id._id.toString() === identityId.toString() ||
      chat.participant2Id._id.toString() === identityId.toString();
    
    if (!isParticipant) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get other participant
    const chatObj = chat.toObject();
    const otherParticipant = 
      (chatObj.participant1Id as any)._id.toString() === identityId 
        ? chatObj.participant2Id 
        : chatObj.participant1Id;

    // Check if other participant is registered
    const userExists = await User.findOne({ 
      globalIdentityId: (otherParticipant as any)._id 
    });

    // Use localName if available
    const participantName = (otherParticipant as any).localName || 
                            (otherParticipant as any).registeredName || "Без имени";

    // Get chat settings
    const chatSettings = await ChatSettings.findOne({
      debtId: new ObjectId(debtId),
      userId: new ObjectId(identityId)
    });

    res.json({
      debtId,
      otherParticipant: {
        identityId: (otherParticipant as any)._id,
        name: participantName, // Используем localName
        localName: (otherParticipant as any).localName, // Добавляем отдельно
        phone: (otherParticipant as any).phone || "Неизвестен",
        isRegistered: !!userExists,
      },
      settings: chatSettings ? {
        isMuted: chatSettings.isMuted,
        isArchived: chatSettings.isArchived,
        isPinned: chatSettings.isPinned,
        customNotification: chatSettings.customNotification
      } : {
        isMuted: false,
        isArchived: false,
        isPinned: false,
        customNotification: false
      }
    });
  } catch (error: any) {
    console.error("GET CHAT INFO ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};