import dotenv from "dotenv";
dotenv.config();

import http from "http";
import mongoose from "mongoose";
import { initSocket } from "./socket";
import app from "./app";

// =======================
// ENV VALIDATION
// =======================
if (!process.env.MONGO_URI) {
  throw new Error("❌ MONGO_URI is not defined");
}

if (!process.env.JWT_SECRET) {
  throw new Error("❌ JWT_SECRET is not defined");
}

// =======================
// DATABASE
// =======================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB error:", err);
    process.exit(1);
  });

// =======================
// HTTP + SOCKET
// =======================
const server = http.createServer(app);

// 🔥 SINGLE SOURCE OF SOCKET.IO
export const io = initSocket(server);

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🔥 Server + Socket.IO running on port ${PORT}`);
});