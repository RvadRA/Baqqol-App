// controllers/notification.controller.ts
import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import Notification, { INotification } from "../models/Notification";
import { io } from "../index"; // Make sure this is exported from your index file

const { ObjectId } = mongoose.Types;

// Helper function to create notifications
export const createNotification = async (
  userId: Types.ObjectId,
  type: INotification['type'],
  title: string,
  message: string,
  data?: any
) => {
  try {
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      data,
      read: false,
    });

    // Emit real-time notification
    // io is global Socket.io instance
    io?.to(`user:${userId.toString()}`).emit("notification:new", notification);

    return notification;
  } catch (error) {
    console.error("Create notification error:", error);
    throw error;
  }
};

// GET NOTIFICATIONS
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const identityId = (req as any).globalIdentityId; // Type assertion

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { limit = 50, offset = 0, unreadOnly = false } = req.query;

    const query: any = {
      userId: new ObjectId(identityId),
    };

    if (unreadOnly === "true") {
      query.read = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit));

    const unreadCount = await Notification.countDocuments({
      userId: new ObjectId(identityId),
      read: false,
    });

    res.json({
      notifications,
      unreadCount,
      total: await Notification.countDocuments({ userId: new ObjectId(identityId) }),
    });
  } catch (error: any) {
    console.error("GET NOTIFICATIONS ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// GET UNREAD COUNT
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const identityId = (req as any).globalIdentityId;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const count = await Notification.countDocuments({
      userId: new ObjectId(identityId),
      read: false,
    });

    res.json({ count });
  } catch (error: any) {
    console.error("GET UNREAD COUNT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// MARK AS READ
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const identityId = (req as any).globalIdentityId;
    const { id } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: new ObjectId(id),
        userId: new ObjectId(identityId),
      },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Emit real-time update
    io?.to(`user:${identityId}`).emit("notification:read", { id });

    res.json({ success: true, notification });
  } catch (error: any) {
    console.error("MARK AS READ ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// MARK ALL AS READ
export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const identityId = (req as any).globalIdentityId;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }


    const result = await Notification.updateMany(
      {
        userId: new ObjectId(identityId),
        read: false,
      },
      { read: true }
    );


    // Emit real-time update
    io?.to(`user:${identityId}`).emit("notification:all-read");

    res.json({ 
      success: true, 
      modifiedCount: result.modifiedCount 
    });
  } catch (error: any) {
    console.error("❌ Backend: MARK ALL AS READ ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// DELETE NOTIFICATION
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const identityId = (req as any).globalIdentityId;
    const { id } = req.params;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const notification = await Notification.findOneAndDelete({
      _id: new ObjectId(id),
      userId: new ObjectId(identityId),
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    // Emit real-time update
    io?.to(`user:${identityId}`).emit("notification:deleted", { id });

    res.json({ success: true });
  } catch (error: any) {
    console.error("DELETE NOTIFICATION ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// CLEAR ALL NOTIFICATIONS
export const clearAllNotifications = async (req: Request, res: Response) => {
  try {
    const identityId = (req as any).globalIdentityId;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }


    const result = await Notification.deleteMany({
      userId: new ObjectId(identityId),
    });


    // Emit real-time update
    io?.to(`user:${identityId}`).emit("notification:cleared");

    res.json({ 
      success: true, 
      deletedCount: result.deletedCount 
    });
  } catch (error: any) {
    console.error("❌ Backend: CLEAR ALL NOTIFICATIONS ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// Добавить новый эндпоинт для очистки старых прочитанных уведомлений
export const cleanupOldReadNotifications = async (req: Request, res: Response) => {
  try {
    const identityId = (req as any).globalIdentityId;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await Notification.deleteMany({
      userId: new ObjectId(identityId),
      read: true,
      createdAt: { $lt: thirtyDaysAgo }
    });


    res.json({ 
      success: true, 
      deletedCount: result.deletedCount 
    });
  } catch (error: any) {
    console.error("❌ CLEANUP OLD NOTIFICATIONS ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};
// В controllers/notification.controller.ts
export const markMessageNotificationsRead = async (req: Request, res: Response) => {
  try {
    const identityId = (req as any).globalIdentityId;
    const { chatId, messageId } = req.body;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const query: any = {
      userId: new ObjectId(identityId),
      type: 'new_message',
      'data.chatId': chatId,
      read: false
    };

    if (messageId) {
      query['data.messageId'] = messageId;
    }

    const result = await Notification.updateMany(
      query,
      { read: true }
    );


    // Emit real-time updates
    if (result.modifiedCount > 0) {
      io?.to(`user:${identityId}`).emit("notifications:batch-read", {
        chatId,
        messageId,
        count: result.modifiedCount
      });
    }

    res.json({ 
      success: true, 
      modifiedCount: result.modifiedCount 
    });
  } catch (error: any) {
    console.error("❌ MARK MESSAGE NOTIFICATIONS READ ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};