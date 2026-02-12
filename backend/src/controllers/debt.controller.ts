// controllers/debt.controller.ts
import { Request, Response } from "express";
import mongoose from "mongoose";
import Debt from "../models/Debt";
import Chat from "../models/Chat";
import Message from "../models/Message";
import GlobalIdentity from "../models/GlobalIdentity";
import User from "../models/User";
import Customer from "../models/Customer";
import { io } from "../index";
import { createNotification } from "./notification.controller";

const { ObjectId } = mongoose.Types;

// CREATE DEBT (PEER-TO-PEER)
// controllers/debt.controller.ts - исправленная функция createDebt
export const createDebt = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const senderIdentityId = req.globalIdentityId;
    
    const { receiverPhone, receiverName, amount, description, dueDate, reminders } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    if (!receiverPhone) {
      return res.status(400).json({ message: "Receiver phone is required" });
    }

    if (!senderIdentityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Current user olish
    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 1. RECEIVER IDENTITYNI TOPISH YOKI YARATISH
    let receiverIdentity = await GlobalIdentity.findOne({ 
      phone: receiverPhone 
    });

    if (!receiverIdentity) {
      receiverIdentity = await GlobalIdentity.create({
        phone: receiverPhone,
        registeredName: receiverName || "No name",
        trustScore: 50,
        prevTrustScore: 50,
        totalDebts: 0,
      });
    }

    // 2. SELF-DEBT PROTECTION
    if (senderIdentityId.toString() === receiverIdentity._id.toString()) {
      return res.status(400).json({
        message: "You cannot create debt to yourself",
      });
    }

    // 3. LOCAL NAME (CRM) - Ixtiyoriy
    if (receiverName) {
      const existingCustomer = await Customer.findOne({
        ownerIdentityId: new ObjectId(senderIdentityId),
        targetIdentityId: receiverIdentity._id,
      });

      if (!existingCustomer) {
        await Customer.create({
          ownerIdentityId: new ObjectId(senderIdentityId),
          targetIdentityId: receiverIdentity._id,
          localName: receiverName,
          phone: receiverPhone,
        });
      }
    }

    // 4. CREATE DEBT (PEER-TO-PEER) - исправленная версия
const debtData: any = {
  senderIdentityId: new ObjectId(senderIdentityId),
  receiverIdentityId: receiverIdentity._id,
  amountTotal: amount,
  amountRemaining: amount,
  paymentStatus: "active", // Changed from status to paymentStatus
  overdueStatus: "on_time", // Default value
};


    // Добавляем опциональные поля только если они есть
    if (description) {
      debtData.description = description;
    }

    if (dueDate) {
      debtData.dueDate = new Date(dueDate);
    }

    if (reminders && Array.isArray(reminders)) {
      debtData.reminders = reminders;
    }

    const debt = await Debt.create(debtData);

    // Update global stats
    await GlobalIdentity.findByIdAndUpdate(receiverIdentity._id, {
      $inc: { totalDebts: 1 },
    });

    // 5. CREATE CHAT (PEER-TO-PEER)
    const chat = await Chat.create({
      debtId: debt._id,
      participant1Id: new ObjectId(senderIdentityId),
      participant2Id: receiverIdentity._id,
    });

    // 6. SYSTEM MESSAGE
    const messageText = `Создан долг: ${amount} ₽. ${dueDate ? `Срок возврата: ${new Date(dueDate).toLocaleDateString('ru-RU')}.` : ''} ${description ? `Описание: ${description}` : ''}`;
    
    await Message.create({
      chatId: chat._id,
      senderIdentityId: new ObjectId(senderIdentityId),
      text: messageText,
      isSystemMessage: true,
    });

    // 7. REAL-TIME NOTIFICATIONS
    // Receiver ga bildirishnoma
    io.to(`user:${receiverIdentity._id}`).emit("debt:created", {
      debtId: debt._id,
      debt,
      chatId: chat._id,
      createdAt: new Date(),
    });

    io.to(`user:${receiverIdentity._id}`).emit("chat:new-chat", {
      debtId: debt._id,
      participantName: user.name,
    });

    // Create notification for receiver
    await createNotification(
      receiverIdentity._id,
      "debt_created",
      "Новый долг",
      `${user.name} создал долг на сумму ${amount} ₽${dueDate ? ` до ${new Date(dueDate).toLocaleDateString('ru-RU')}` : ''}`,
      {
        debtId: debt._id,
        chatId: chat._id,
        amount: amount,
        fromUser: new ObjectId(senderIdentityId),
      }
    );

    return res.status(201).json({
      debt,
      chatId: chat._id,
      receiver: {
        name: receiverName || receiverIdentity.registeredName,
        phone: receiverPhone,
        identityId: receiverIdentity._id,
      },
    });
  } catch (error: any) {
    console.error("CREATE DEBT ERROR:", error);
    return res.status(500).json({ message: error.message });
  }
};

// GET MY DEBTS (BOTH SENT AND RECEIVED)
// В debt.controller.ts, функция getMyDebts:
export const getMyDebts = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const debts = await Debt.find({
      $or: [
        { senderIdentityId: new ObjectId(identityId) },
        { receiverIdentityId: new ObjectId(identityId) }
      ]
    })
      .populate("senderIdentityId", "registeredName phone")
      .populate("receiverIdentityId", "registeredName phone")
      .sort({ createdAt: -1 });

    // Получаем localName для каждого участника
    const debtsWithLocalNames = await Promise.all(
      debts.map(async (debt) => {
        const debtObj = debt.toObject();
        
        // Получаем Customer запись для sender (если есть)
        const senderCustomer = await Customer.findOne({
          ownerIdentityId: new ObjectId(identityId),
          targetIdentityId: debt.senderIdentityId._id || debt.senderIdentityId
        });
        
        // Получаем Customer запись для receiver (если есть)
        const receiverCustomer = await Customer.findOne({
          ownerIdentityId: new ObjectId(identityId),
          targetIdentityId: debt.receiverIdentityId._id || debt.receiverIdentityId
        });

        // Добавляем localName в результат
        return {
          ...debtObj,
          senderIdentityId: {
            ...debtObj.senderIdentityId,
            localName: senderCustomer?.localName || null
          },
          receiverIdentityId: {
            ...debtObj.receiverIdentityId,
            localName: receiverCustomer?.localName || null
          }
        };
      })
    );

    res.json(debtsWithLocalNames);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// PAY DEBT (RECEIVER to'laydi) - "Вернуть долг" - PENDING VERIFICATION KERAK
export const payDebt = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;
    const { amount } = req.body;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const debt = await Debt.findById(debtId)
      .populate("senderIdentityId", "registeredName phone")
      .populate("receiverIdentityId", "registeredName phone");

    if (!debt) {
      return res.status(404).json({ message: "Debt not found" });
    }

    const debtObj = debt.toObject();
    const receiverId = (debtObj.receiverIdentityId as any)?._id?.toString() || 
                      (debtObj.receiverIdentityId as any)?.toString();
    
    const senderId = (debtObj.senderIdentityId as any)?._id?.toString() || 
                    (debtObj.senderIdentityId as any)?.toString();

    // Faqat qarzdor (receiver) to'lashi mumkin
    if (receiverId !== identityId.toString()) {
      return res.status(403).json({ 
        message: "Только должник может вернуть долг" 
      });
    }

    // To'lov summasini tekshirish
    if (amount > debt.amountRemaining) {
      return res.status(400).json({ 
        message: "Сумма оплаты превышает остаток долга" 
      });
    }

    // Pending verification holatiga o'tkazamiz
debt.paymentStatus = "pending_verification"; // Changed from status to paymentStatus
debt.pendingPayment = {
  amount,
  requestedAt: new Date(),
  requestedBy: new ObjectId(receiverId),
  isVerified: false,
  paymentType: "receiver_to_sender" // Receiver -> Sender
};

    await debt.save();

    // Chat message
    const chat = await Chat.findOne({ debtId: debt._id });
    if (chat) {
      await Message.create({
        chatId: chat._id,
        senderIdentityId: new ObjectId(identityId),
        text: `💸 Должник вернул: ${amount} ₽. Ожидает подтверждения от кредитора.`,
        isSystemMessage: true,
      });
    }

    // Real-time notification - Sender ga (creditor)
  io.to(`user:${senderId}`).emit("debt:payment-requested", {
  debtId: debt._id,
  debt: debt.toObject(),
  amount,
  requestedBy: receiverId,
  message: "Должник вернул деньги. Подтвердите получение.",
  paymentType: "receiver_to_sender",
  createdAt: new Date(),
});
// Debt room'ga ham yuboramiz
io.to(`debt:${debtId}`).emit("debt:updated", {
  debtId: debt._id,
  debt: debt.toObject(),
  updatedAt: new Date(),
});

// Create notification for sender
await createNotification(
  senderId,
  "payment_requested",
  "Запрос на оплату",
  `Должник вернул ${amount} ₽. Требуется подтверждение.`,
  {
    debtId: debt._id,
    amount: amount,
    fromUser: new ObjectId(receiverId),
  }
);

    res.json({
      ...debt.toObject(),
      message: "Оплата отправлена. Ожидайте подтверждения от кредитора."
    });
  } catch (error: any) {
    console.error("PAY DEBT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// CUSTOMER TO'LAGANINI BILDIRISH (SENDER tomonidan) - "Принять оплату" - DARHOL
export const markAsPaidByCustomer = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;
    const { amount } = req.body;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const debt = await Debt.findById(debtId)
      .populate("senderIdentityId", "registeredName phone")
      .populate("receiverIdentityId", "registeredName phone");

    if (!debt) {
      return res.status(404).json({ message: "Debt not found" });
    }

    const debtObj = debt.toObject();
    const senderId = (debtObj.senderIdentityId as any)?._id?.toString() || 
                    (debtObj.senderIdentityId as any)?.toString();
    
    const receiverId = (debtObj.receiverIdentityId as any)?._id?.toString() || 
                      (debtObj.receiverIdentityId as any)?.toString();

    // Faqat sender (creditor) to'lovni kiritishi mumkin
    if (senderId !== identityId.toString()) {
      return res.status(403).json({ 
        message: "Только кредитор может принять оплату" 
      });
    }

    // To'lov summasini tekshirish
    if (amount > debt.amountRemaining) {
      return res.status(400).json({ 
        message: "Сумма оплаты превышает остаток долга" 
      });
    }

    // To'lovni darhol amalga oshirish
    const payAmount = Math.min(amount, debt.amountRemaining);
    debt.amountRemaining -= payAmount;

    if (debt.amountRemaining === 0) {
      debt.paymentStatus = "paid";
      
      // Trust score update - Customer to'lagani uchun
      const receiverIdentity = await GlobalIdentity.findById(receiverId);
      if (receiverIdentity) {
        receiverIdentity.prevTrustScore = receiverIdentity.trustScore;
        receiverIdentity.trustScore = Math.min(100, receiverIdentity.trustScore + 3);
        await receiverIdentity.save();
      }
    }

    await debt.save();

    // Chat message
    const chat = await Chat.findOne({ debtId: debt._id });
    if (chat) {
      await Message.create({
        chatId: chat._id,
        senderIdentityId: new ObjectId(identityId),
        text: `👤 Кредитор принял оплату: ${amount} ₽. Остаток: ${debt.amountRemaining} ₽`,
        isSystemMessage: true,
      });
    }

    // Real-time notification - Receiver ga (customer)
   io.to(`user:${receiverId}`).emit("debt:payment-accepted", {
  debtId,
  debt: debt.toObject(),
  amount: payAmount,
  remaining: debt.amountRemaining,
  message: "Кредитор принял вашу оплату",
  createdAt: new Date(),
});

    if (debt.paymentStatus === "paid") {
      io.to(`user:${receiverId}`).emit("debt:closed", {
        debtId,
        closedBy: identityId,
      });
    }
// Debt room'ga ham yuboramiz
io.to(`debt:${debtId}`).emit("debt:updated", {
  debtId,
  debt: debt.toObject(),
  updatedAt: new Date(),
});
    res.json({
      ...debt.toObject(),
      message: "Оплата принята успешно"
    });
  } catch (error: any) {
    console.error("MARK AS PAID ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};
// TO'LOVNI TASDIQLASH YOKI RAD ETISH
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { debtId } = req.params;
    const { isVerified } = req.body;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const debt = await Debt.findById(debtId)
      .populate("senderIdentityId", "registeredName phone")
      .populate("receiverIdentityId", "registeredName phone")
      .populate("pendingPayment.requestedBy", "registeredName");

    if (!debt) {
      return res.status(404).json({ message: "Debt not found" });
    }

    if (debt.paymentStatus  !== "pending_verification") {
      return res.status(400).json({ 
        message: "Долг не находится в состоянии ожидания подтверждения" 
      });
    }

    if (!debt.pendingPayment) {
      return res.status(400).json({ 
        message: "Нет ожидающих подтверждения платежей" 
      });
    }

    const pendingAmount = debt.pendingPayment.amount;
    const pendingPaymentType = debt.pendingPayment.paymentType;
    
    // Kim to'lovni tasdiqlashi kerakligini aniqlash
    let shouldVerify = false;
    
    if (pendingPaymentType === "receiver_to_sender") {
      // Receiver to'lagan, Sender tasdiqlashi kerak
      const senderId = (debt.senderIdentityId as any)?._id?.toString() || 
                      (debt.senderIdentityId as any)?.toString();
      shouldVerify = senderId === identityId.toString();
    } else if (pendingPaymentType === "sender_to_receiver") {
      // Sender to'lagan, Receiver tasdiqlashi kerak
      const receiverId = (debt.receiverIdentityId as any)?._id?.toString() || 
                        (debt.receiverIdentityId as any)?.toString();
      shouldVerify = receiverId === identityId.toString();
    }

    if (!shouldVerify) {
      return res.status(403).json({ 
        message: "Вы не можете подтвердить этот платеж" 
      });
    }

    if (isVerified) {
      // To'lov to'g'ri ekan
      debt.amountRemaining = Math.max(0, debt.amountRemaining - pendingAmount);
      debt.pendingPayment.isVerified = true;
      debt.pendingPayment.verifiedAt = new Date();
      
      if (debt.amountRemaining === 0) {
        debt.paymentStatus  = "paid";
        
        // Trust score update
        const receiverIdentity = await GlobalIdentity.findById(debt.receiverIdentityId);
        if (receiverIdentity) {
          receiverIdentity.prevTrustScore = receiverIdentity.trustScore;
          receiverIdentity.trustScore = Math.min(100, receiverIdentity.trustScore + 3);
          await receiverIdentity.save();
        }
      } else {
        debt.paymentStatus  = "active";
      }

      // Chat message
      const chat = await Chat.findOne({ debtId: debt._id });
      if (chat) {
        await Message.create({
          chatId: chat._id,
          senderIdentityId: new ObjectId(identityId),
          text: `✅ Оплата подтверждена: ${pendingAmount} ₽. Остаток: ${debt.amountRemaining} ₽`,
          isSystemMessage: true,
        });
      }

      // Real-time notification
      const otherPartyId = pendingPaymentType === "receiver_to_sender" 
        ? debt.receiverIdentityId 
        : debt.senderIdentityId;
        
       io.to(`user:${otherPartyId}`).emit("debt:payment-confirmed", {
    debtId,
    debt: debt.toObject(),
    amount: pendingAmount,
    remaining: debt.amountRemaining,
    message: "Ваша оплата подтверждена",
    createdAt: new Date(),
  });
 // Create notification for payer
  await createNotification(
    otherPartyId,
    "payment_confirmed",
    "Оплата подтверждена",
    `Ваша оплата на сумму ${pendingAmount} ₽ подтверждена`,
    {
      debtId: debt._id,
      amount: pendingAmount,
    }
  );
      if (debt.paymentStatus  === "paid") {
        io.to(`user:${otherPartyId}`).emit("debt:closed", {
          debtId,
          closedBy: identityId,
        });
      }

    } else {
      // To'lov noto'g'ri ekan
      debt.paymentStatus = "active";
      debt.pendingPayment.isVerified = false;
      debt.pendingPayment.verifiedAt = new Date();

      // Chat message
      const chat = await Chat.findOne({ debtId: debt._id });
      if (chat) {
        await Message.create({
          chatId: chat._id,
          senderIdentityId: new ObjectId(identityId),
          text: `❌ Оплата отклонена. Ожидаемая сумма: ${pendingAmount} ₽ не получена.`,
          isSystemMessage: true,
        });
      }

      // Real-time notification
      const otherPartyId = pendingPaymentType === "receiver_to_sender" 
        ? debt.receiverIdentityId 
        : debt.senderIdentityId;
        
        io.to(`user:${otherPartyId}`).emit("debt:payment-rejected", {
    debtId,
    debt: debt.toObject(),
    amount: pendingAmount,
    message: "Оплата отклонена. Пожалуйста, проверьте сумму.",
    createdAt: new Date(),
  });
    await createNotification(
    otherPartyId,
    "payment_rejected",
    "Оплата отклонена",
    `Оплата на сумму ${pendingAmount} ₽ отклонена`,
    {
      debtId: debt._id,
      amount: pendingAmount,
    }
  );
    }
// Debt room'ga yangilash
io.to(`debt:${debtId}`).emit("debt:updated", {
  debtId,
  debt: debt.toObject(),
  updatedAt: new Date(),
});
    // Agar to'lov to'liq to'lanmagan bo'lsa, pendingPayment'ni tozalaymiz
    if (debt.paymentStatus === "active") {
      delete debt.pendingPayment;
    }

    await debt.save();

    res.json({
      ...debt.toObject(),
      message: isVerified ? "Оплата подтверждена" : "Оплата отклонена"
    });
  } catch (error: any) {
    console.error("VERIFY PAYMENT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// Добавьте эту функцию в debt.controller.ts или создайте отдельный сервис
// В debt.controller.ts исправляем вызовы createNotification
export const checkOverdueDebts = async () => {
  try {
    const now = new Date();
    const overdueDebts = await Debt.find({
      dueDate: { $lt: now },
      paymentStatus: "active", // Changed from status to paymentStatus
      overdueStatus: "on_time", // Only mark as overdue if not already marked
      amountRemaining: { $gt: 0 }
    }).populate("senderIdentityId receiverIdentityId");

    for (const debt of overdueDebts) {
      // Обновляем статус на просроченный
      debt.overdueStatus  = "overdue";
      await debt.save();

      // Создаём системное сообщение в чате
      const chat = await Chat.findOne({ debtId: debt._id });
      if (chat) {
        await Message.create({
          chatId: chat._id,
          senderIdentityId: debt.senderIdentityId,
          text: `⚠️ Долг просрочен! Срок возврата был: ${debt.dueDate?.toLocaleDateString('ru-RU')}`,
          isSystemMessage: true,
        });
      }

      // Получаем ID пользователей
      const receiverId = debt.receiverIdentityId._id || debt.receiverIdentityId;
      const senderId = debt.senderIdentityId._id || debt.senderIdentityId;

      // Отправляем уведомления с правильным типом
      await createNotification(
        receiverId,
        "debt_overdue", // Теперь это допустимый тип
        "Долг просрочен",
        `Долг на сумму ${debt.amountRemaining} ₽ просрочен. Срок был: ${debt.dueDate?.toLocaleDateString('ru-RU')}`,
        {
          debtId: debt._id,
          amount: debt.amountRemaining,
        }
      );

      await createNotification(
        senderId,
        "debt_overdue", // Теперь это допустимый тип
        "Долг просрочен",
        `Ваш долг на сумму ${debt.amountRemaining} ₽ просрочен. Должник: ${(debt.receiverIdentityId as any).registeredName || "Неизвестно"}`,
        {
          debtId: debt._id,
          amount: debt.amountRemaining,
        }
      );

      // Real-time уведомления
      io.to(`user:${receiverId}`).emit("debt:overdue", {
        debtId: debt._id,
        amount: debt.amountRemaining,
        dueDate: debt.dueDate,
        message: "Долг просрочен!"
      });

      io.to(`user:${senderId}`).emit("debt:overdue", {
        debtId: debt._id,
        amount: debt.amountRemaining,
        dueDate: debt.dueDate,
        message: "Долг просрочен!"
      });
    }

  } catch (error: any) {
    console.error("CHECK OVERDUE DEBTS ERROR:", error);
  }
};
// Добавьте эту функцию в debt.controller.ts
export const checkReminders = async () => {
  try {
    const now = new Date();
    
    // Проверяем долги с напоминаниями
    const debtsWithReminders = await Debt.find({
      dueDate: { $exists: true, $ne: null },
      paymentStatus: "active",
      amountRemaining: { $gt: 0 }
    }).populate("senderIdentityId receiverIdentityId");


    let remindersSent = 0;

    for (const debt of debtsWithReminders) {
      if (!debt.dueDate) continue;

      // Рассчитываем разницу в днях (целое число)
      const timeDiff = debt.dueDate.getTime() - now.getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24)); // Округляем вниз
      

      // Проверяем, нужно ли отправлять напоминание
      if (debt.reminders && debt.reminders.length >= 3) {
        // 1. Напоминание за 3 дня
        if (daysDiff === 3 && debt.reminders[0]) {
          await sendReminder(debt, "за 3 дня", 3);
          remindersSent++;
        }
        
        // 2. Напоминание за 1 день
        if (daysDiff === 1 && debt.reminders[1]) {
          await sendReminder(debt, "за 1 день", 1);
          remindersSent++;
        }
        
        // 3. Напоминание в день оплаты (сегодня)
        // День сегодня, если разница в днях равна 0
        if (daysDiff === 0 && debt.reminders[2]) {
          await sendReminder(debt, "сегодня", 0);
          remindersSent++;
        }

        // 4. Дополнительно: напоминание за 7 дней (если нужно)
        // if (daysDiff === 7 && debt.reminders.length > 3 && debt.reminders[3]) {
        //   await sendReminder(debt, "за 7 дней", 7);
        //   remindersSent++;
        // }
      }
    }

    return remindersSent;
  } catch (error: any) {
    console.error("❌ CHECK REMINDERS ERROR:", error);
    throw error;
  }
};

// В той же функции checkReminders
const sendReminder = async (debt: any, when: string, daysLeft: number) => {
  try {
    const receiverId = debt.receiverIdentityId._id || debt.receiverIdentityId;
    
    // Уведомление получателю (должнику)
    await createNotification(
      receiverId,
      "reminder", // Теперь это допустимый тип
      `Напоминание: ${when} до срока`,
      `Не забудьте вернуть долг ${debt.amountRemaining} ₽. Срок: ${debt.dueDate?.toLocaleDateString('ru-RU')}`,
      {
        debtId: debt._id,
        amount: debt.amountRemaining,
        daysLeft
      }
    );

    // Real-time уведомление
    io.to(`user:${receiverId}`).emit("debt:reminder", {
      debtId: debt._id,
      amount: debt.amountRemaining,
      daysLeft,
      message: `Напоминание: осталось ${daysLeft} дней до срока возврата`
    });

  } catch (error) {
    console.error("Send reminder error:", error);
  }
};

// Добавьте эти функции в ваш контроллер, если они используются:

// GET SINGLE DEBT
export const getDebt = async (req: Request, res: Response) => {
  try {
    const { debtId } = req.params;
    const identityId = req.globalIdentityId;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const debt = await Debt.findById(debtId)
      .populate("senderIdentityId", "registeredName phone trustScore")
      .populate("receiverIdentityId", "registeredName phone trustScore");

    if (!debt) {
      return res.status(404).json({ message: "Debt not found" });
    }

    // Проверяем, имеет ли пользователь доступ к этому долгу
    const isParticipant = 
      debt.senderIdentityId._id.toString() === identityId.toString() ||
      debt.receiverIdentityId._id.toString() === identityId.toString();

    if (!isParticipant) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Добавляем статус просроченности
    const now = new Date();
    const isOverdue = debt.overdueStatus === "overdue" || 
                     (debt.dueDate && debt.dueDate < now && 
                      debt.paymentStatus === "active" && 
                      debt.amountRemaining > 0);

    res.json({
      ...debt.toObject(),
      isOverdue
    });
  } catch (error: any) {
    console.error("GET DEBT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// UPDATE DEBT (только активные долги)
export const updateDebt = async (req: Request, res: Response) => {
  try {
    const { debtId } = req.params;
    const identityId = req.globalIdentityId;
    const { description, dueDate, reminders } = req.body;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const debt = await Debt.findById(debtId);

    if (!debt) {
      return res.status(404).json({ message: "Debt not found" });
    }

    // Только отправитель может обновить долг
    if (debt.senderIdentityId.toString() !== identityId.toString()) {
      return res.status(403).json({ 
        message: "Только кредитор может изменить условия долга" 
      });
    }

    // Можно обновлять только активные долги
    if (debt.paymentStatus !== "active") {
      return res.status(400).json({ 
        message: "Можно изменять только активные долги" 
      });
    }

    // Обновляем поля
    if (description !== undefined) {
      debt.description = description;
    }

    if (dueDate !== undefined) {
      debt.dueDate = new Date(dueDate);
      // Сбрасываем статус просроченности при изменении даты
      if (debt.dueDate > new Date()) {
        debt.overdueStatus = "on_time";
      }
    }

    if (reminders && Array.isArray(reminders)) {
      debt.reminders = reminders;
    }

    await debt.save();

    // Chat message
    const chat = await Chat.findOne({ debtId: debt._id });
    if (chat) {
      await Message.create({
        chatId: chat._id,
        senderIdentityId: new ObjectId(identityId),
        text: "💼 Условия долга обновлены",
        isSystemMessage: true,
      });
    }

    // Real-time уведомление
    const otherPartyId = debt.receiverIdentityId;
    io.to(`user:${otherPartyId}`).emit("debt:updated", {
      debtId,
      debt: debt.toObject(),
      updatedAt: new Date(),
    });

    res.json({
      ...debt.toObject(),
      message: "Долг успешно обновлен"
    });
  } catch (error: any) {
    console.error("UPDATE DEBT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// DELETE/CANCEL DEBT (только для активных)
export const cancelDebt = async (req: Request, res: Response) => {
  try {
    const { debtId } = req.params;
    const identityId = req.globalIdentityId;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const debt = await Debt.findById(debtId)
      .populate("senderIdentityId receiverIdentityId");

    if (!debt) {
      return res.status(404).json({ message: "Debt not found" });
    }

    // Только отправитель может отменить долг
    if (debt.senderIdentityId._id.toString() !== identityId.toString()) {
      return res.status(403).json({ 
        message: "Только кредитор может отменить долг" 
      });
    }

    // Можно отменять только активные долги
    if (debt.paymentStatus !== "active") {
      return res.status(400).json({ 
        message: "Можно отменять только активные долги" 
      });
    }

    // Мягкое удаление (помечаем как оплаченный с нулевым остатком)
    debt.paymentStatus = "paid";
    debt.amountRemaining = 0;
    debt.description = debt.description ? 
      `${debt.description} [Отменен кредитором]` : "Отменен кредитором";
    
    await debt.save();

    // Chat message
    const chat = await Chat.findOne({ debtId: debt._id });
    if (chat) {
      await Message.create({
        chatId: chat._id,
        senderIdentityId: new ObjectId(identityId),
        text: "🚫 Долг отменен кредитором",
        isSystemMessage: true,
      });
    }

    // Real-time уведомление
    const receiverId = debt.receiverIdentityId._id;
    io.to(`user:${receiverId}`).emit("debt:cancelled", {
      debtId,
      cancelledBy: identityId,
      message: "Кредитор отменил долг",
      createdAt: new Date(),
    });

    res.json({
      ...debt.toObject(),
      message: "Долг успешно отменен"
    });
  } catch (error: any) {
    console.error("CANCEL DEBT ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};


