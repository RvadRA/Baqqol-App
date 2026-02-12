import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import debtRoutes from "./routes/debt.routes";
import chatRoutes from "./routes/chat.routes";
import customerRoutes from "./routes/customer.routes";
import identityRoutes from "./routes/identity.routes";
import profileRoutes from "./routes/profile.routes";
import notificationRoutes from "./routes/notification.routes";
import userRoutes from "./routes/user.routes";
import { startReminderCron } from "./services/reminder.service";
import contactChatRoutes from "./routes/contact-chat.routes";
const app = express();

// =======================
// MIDDLEWARE
// =======================
app.use(cors());
app.use(express.json());

// =======================
// ROUTES
// =======================
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/debts", debtRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/identities", identityRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/contact-chats", contactChatRoutes);
// =======================
// HEALTH CHECK
// =======================
app.get("/", (_req, res) => {
  res.send("🚀 Baqqol API is running");
});

// =======================
// ERROR HANDLING
// =======================
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});
startReminderCron();
export default app;