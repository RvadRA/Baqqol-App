import { CronJob } from "cron";
import Debt from "../models/Debt";
import Chat from "../models/Chat";
import Message from "../models/Message";
import Notification from "../models/Notification";
import { io } from "../index";

// Отдельная функция для отправки уведомлений
const sendNotification = async (
  userId: any,
  type: string,
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
    io?.to(`user:${userId.toString()}`).emit("notification:new", notification);
    return notification;
  } catch (error) {
    console.error("Send notification error:", error);
    throw error;
  }
};

export const checkOverdueDebts = async () => {
  try {
    const now = new Date();
    const overdueDebts = await Debt.find({
      dueDate: { $lt: now },
      paymentStatus: "active",
      amountRemaining: { $gt: 0 },
      overdueStatus: "on_time" // Only mark as overdue if not already marked
    }).populate("senderIdentityId receiverIdentityId");

    for (const debt of overdueDebts) {
      // Set overdue status but keep payment status as active
      debt.overdueStatus = "overdue";
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

      // Отправляем уведомления
      await sendNotification(
        receiverId,
        "debt_overdue",
        "Долг просрочен",
        `Долг на сумму ${debt.amountRemaining} ₽ просрочен. Срок был: ${debt.dueDate?.toLocaleDateString('ru-RU')}`,
        { debtId: debt._id, amount: debt.amountRemaining }
      );

      await sendNotification(
        senderId,
        "debt_overdue",
        "Долг просрочен",
        `Ваш долг на сумму ${debt.amountRemaining} ₽ просрочен. Должник: ${(debt.receiverIdentityId as any).registeredName || "Неизвестно"}`,
        { debtId: debt._id, amount: debt.amountRemaining }
      );

      // Real-time уведомления
      io?.to(`user:${receiverId}`).emit("debt:overdue", {
        debtId: debt._id,
        amount: debt.amountRemaining,
        dueDate: debt.dueDate,
        message: "Долг просрочен!"
      });

      io?.to(`user:${senderId}`).emit("debt:overdue", {
        debtId: debt._id,
        amount: debt.amountRemaining,
        dueDate: debt.dueDate,
        message: "Долг просрочен!"
      });
    }

  } catch (error: any) {
    console.error("❌ Ошибка проверки просроченных долгов:", error);
  }
};

export const checkReminders = async () => {
  try {
    const now = new Date();
    
    // Проверяем долги с напоминаниями
    const debtsWithReminders = await Debt.find({
      dueDate: { $exists: true, $ne: null },
      paymentStatus: "active",
      amountRemaining: { $gt: 0 }
    }).populate("senderIdentityId receiverIdentityId");

    let sentReminders = 0;

    for (const debt of debtsWithReminders) {
      if (!debt.dueDate) continue;

      const timeUntilDue = debt.dueDate.getTime() - now.getTime();
      const daysUntilDue = Math.ceil(timeUntilDue / (1000 * 60 * 60 * 24));
      
      if (daysUntilDue < 0) continue; // Уже просроченные пропускаем

      // Проверяем напоминания
      if (debt.reminders && debt.reminders.length >= 3) {
        const receiverId = debt.receiverIdentityId._id || debt.receiverIdentityId;
        
        if (daysUntilDue === 3 && debt.reminders[0]) {
          await sendNotification(
            receiverId,
            "reminder",
            "Напоминание: 3 дня до срока",
            `Не забудьте вернуть долг ${debt.amountRemaining} ₽. Срок: ${debt.dueDate?.toLocaleDateString('ru-RU')}`,
            { debtId: debt._id, amount: debt.amountRemaining, daysLeft: daysUntilDue }
          );
          
          io?.to(`user:${receiverId}`).emit("debt:reminder", {
            debtId: debt._id,
            amount: debt.amountRemaining,
            daysLeft: daysUntilDue,
            message: `Напоминание: осталось ${daysUntilDue} дней до срока возврата`
          });
          
          sentReminders++;
        }
        
        if (daysUntilDue === 1 && debt.reminders[1]) {
          await sendNotification(
            receiverId,
            "reminder",
            "Напоминание: 1 день до срока",
            `Не забудьте вернуть долг ${debt.amountRemaining} ₽. Срок: ${debt.dueDate?.toLocaleDateString('ru-RU')}`,
            { debtId: debt._id, amount: debt.amountRemaining, daysLeft: daysUntilDue }
          );
          
          io?.to(`user:${receiverId}`).emit("debt:reminder", {
            debtId: debt._id,
            amount: debt.amountRemaining,
            daysLeft: daysUntilDue,
            message: `Напоминание: остался ${daysUntilDue} день до срока возврата`
          });
          
          sentReminders++;
        }
        
        if (daysUntilDue === 0 && debt.reminders[2]) {
          await sendNotification(
            receiverId,
            "reminder",
            "Напоминание: срок возврата сегодня",
            `Сегодня последний день для возврата долга ${debt.amountRemaining} ₽.`,
            { debtId: debt._id, amount: debt.amountRemaining, daysLeft: daysUntilDue }
          );
          
          io?.to(`user:${receiverId}`).emit("debt:reminder", {
            debtId: debt._id,
            amount: debt.amountRemaining,
            daysLeft: daysUntilDue,
            message: `Сегодня последний день для возврата долга`
          });
          
          sentReminders++;
        }
      }
    }

  } catch (error: any) {
    console.error("❌ Ошибка проверки напоминаний:", error);
  }
};

// Функция проверки напоминаний
export const startReminderCron = (socketIo?: any) => {
  try {
    
    
    // Проверка напоминаний каждый день в 9:00
    new CronJob(
      '0 9 * * *',
      async () => {
        await checkReminders();
      },
      null,
      true,
      'Europe/Moscow'
    );

    // Проверка просроченных каждый день в 10:00
    new CronJob(
      '0 10 * * *',
      async () => {
        await checkOverdueDebts();
      },
      null,
      true,
      'Europe/Moscow'
    );

    // Тестовая проверка каждые 10 минут (для отладки в разработке)
    if (process.env.NODE_ENV === 'development') {
      new CronJob(
        '*/10 * * * *',
        async () => {
          // await checkReminders();
          // await checkOverdueDebts();
        },
        null,
        true,
        'Europe/Moscow'
      );
    }

    
  } catch (error) {
    console.error('❌ Ошибка запуска cron задач:', error);
  }
};