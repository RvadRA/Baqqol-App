// routes/chat.routes.ts
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import multer from "multer";
import {
  getChatByDebt,
  getAllChats,
  sendMessage,
  markAsRead,
  markMessageAsRead,
  getChatSettings,
  updateChatSettings,
  deleteMessage,
  clearChat,
  deleteChat,
  searchMessages,
  uploadFile,
  exportChat,
  getChatMessages,
  getChatInfo
} from "../controllers/chat.controller";

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images, audio, and common document types
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'audio/mpeg',
      'audio/wav',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

router.use(authMiddleware);

// ✅ ALL CHATS (list)
router.get("/", getAllChats);

// 🔹 Get chat by debt
router.get("/:debtId", getChatByDebt);

// 🔹 Get chat messages with pagination (ADD THIS ROUTE!)
router.get("/:debtId/messages", getChatMessages);

router.get('/:debtId/info', getChatInfo);
// 🔹 Send message
router.post("/:debtId/messages", sendMessage);

// 🔹 Mark all as read
router.post("/:debtId/read", markAsRead);

// 🔹 Mark single message as read
router.post("/:debtId/messages/:messageId/read", markMessageAsRead);

// 🔹 Get chat settings
router.get("/:debtId/settings", getChatSettings);

// 🔹 Update chat settings
router.post("/:debtId/settings", updateChatSettings);

// 🔹 Delete message
router.delete("/:debtId/messages/:messageId", deleteMessage);

// 🔹 Clear chat (delete all messages)
router.delete("/:debtId/messages", clearChat);

// 🔹 Archive/Delete chat
router.delete("/:debtId", deleteChat);

// 🔹 Search messages in chat
router.get("/:debtId/search", searchMessages);

// 🔹 Upload file
router.post("/:debtId/files", upload.single('file'), uploadFile);

// 🔹 Export chat
router.get("/:debtId/export", exportChat);



export default router;