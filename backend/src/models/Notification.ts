// models/Notification.ts
import { Schema, model, Types, Document } from "mongoose";

export interface INotification extends Document {
  userId: Types.ObjectId;
   type: "new_message" | "message_read" | "payment_requested" | "payment_confirmed" | 
         "payment_rejected" | "debt_created" | "chat_archived" | "chat_pinned" | 
         "debt_overdue" | "reminder" | "contact_message" | "contact_chat_pinned" | 
         "contact_chat_archived" | "contact_chat_muted";  title: string;
  message: string;
  data?: {
    debtId?: Types.ObjectId;
    chatId?: Types.ObjectId;
     contactChatId?: Types.ObjectId;
    messageId?: Types.ObjectId;
    amount?: number;
    fromUser?: Types.ObjectId;
    daysLeft?: number;
  };
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "GlobalIdentity",
      required: true,
    },
    type: {
      type: String,
       enum: [
    "new_message", "message_read", "payment_requested", "payment_confirmed", 
    "payment_rejected", "debt_created", "chat_archived", "chat_pinned", 
    "debt_overdue", "reminder", "contact_message", "contact_chat_pinned", 
    "contact_chat_archived", "contact_chat_muted"
  ],      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      debtId: { type: Schema.Types.ObjectId, ref: "Debt" },
      chatId: { type: Schema.Types.ObjectId, ref: "Chat" },
      contactChatId: { type: Schema.Types.ObjectId, ref: "ContactChat" },
      messageId: { type: Schema.Types.ObjectId, ref: "Message" },
      amount: { type: Number },
      fromUser: { type: Schema.Types.ObjectId, ref: "GlobalIdentity" },
       daysLeft: { type: Number }
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, type: 1, read: 1 });

export default model<INotification>("Notification", NotificationSchema);