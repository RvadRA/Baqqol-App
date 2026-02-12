import { Router } from "express";
import {
  createLocalContact,
  getMyContacts,
  getCustomerById
} from "../controllers/customer.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// 🔐 Protect all customer routes
router.use(authMiddleware);

// ➕ Create local contact (CRM)
router.post("/", createLocalContact);

// 📋 Get my local contacts (CRM)
router.get("/", getMyContacts);
// 📋 Get customer by ID
router.get("/:id", getCustomerById);

export default router;