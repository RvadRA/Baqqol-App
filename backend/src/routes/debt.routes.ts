// routes/debt.routes.ts
import { Router } from "express";
import {
  createDebt,
  getMyDebts,
  payDebt,
  markAsPaidByCustomer,
  verifyPayment,
    checkOverdueDebts,
  checkReminders,
    getDebt,
  updateDebt,
  cancelDebt
} from "../controllers/debt.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// 🔐 Protect all debt routes
router.use(authMiddleware);

// ➕ Create new debt
router.post("/", createDebt);

// 📋 Get my debts
router.get("/my", getMyDebts);
router.get("/overdue", checkOverdueDebts); // Для ручной проверки
router.get("/reminders", checkReminders); // Для ручной проверки

// 💸 Вернуть долг (Receiver to'laydi)
router.post("/:debtId/pay", payDebt);

// 👤 Отметить оплату от клиента (Sender tomonidan)
router.post("/:debtId/mark-paid", markAsPaidByCustomer);

// ✅ Подтвердить/отклонить оплату
router.post("/:debtId/verify", verifyPayment);
router.put("/:debtId/update",  updateDebt);
router.delete("/:debtId/cancel", cancelDebt);
router.get("/:debtId", getDebt);

export default router;