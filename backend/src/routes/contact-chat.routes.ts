import express from "express";
import {
  getOrCreateContactChat,
  getAllContactChats,
  sendContactMessage,
  markContactMessagesAsRead,
  markSingleMessageAsRead,
  updateContactChatSettings,
  searchContactsForChat,
  getContactChatById,
  getContactMessages,
  deleteContactMessage,
  clearContactChat,
  markAllMessagesAsRead 
} from "../controllers/contact-chat.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Search contacts for chat
router.get("/search", searchContactsForChat);

// Get all contact chats
router.get("/", getAllContactChats);

// Get or create contact chat by contact identity
router.get("/by-contact/:contactIdentityId", getOrCreateContactChat);

// Get contact chat by chat ID
router.get("/:contactChatId", getContactChatById);

// Get messages for contact chat
router.get("/:contactChatId/messages", getContactMessages);

// Send message to contact
router.post("/:contactChatId/messages", sendContactMessage);
router.post('/:contactChatId/mark-all-read', markAllMessagesAsRead);
// Mark messages as read
router.post("/:contactChatId/read", markContactMessagesAsRead);
router.post("/:contactChatId/messages/:messageId/read", markSingleMessageAsRead);

// Update chat settings
router.post("/:contactChatId/settings", updateContactChatSettings);

// Delete message
router.delete("/:contactChatId/messages/:messageId", deleteContactMessage);

// Clear chat
router.delete("/:contactChatId/clear", clearContactChat);

export default router;