// routes/notification.routes.ts
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
  getUnreadCount,
   cleanupOldReadNotifications 
} from "../controllers/notification.controller";

const router = Router();

router.use(authMiddleware);

// 🔹 Get all notifications
router.get("/", getNotifications);

// 🔹 Get unread count
router.get("/unread-count", getUnreadCount);

// 🔹 Mark notification as read
router.post("/:id/read", markAsRead);

// 🔹 Mark all as read
router.post("/read-all", markAllAsRead);

// 🔹 Delete notification
router.delete("/:id", deleteNotification);

// 🔹 Clear all notifications
router.delete("/", clearAllNotifications);

router.post('/cleanup-old-read', cleanupOldReadNotifications);
export default router;