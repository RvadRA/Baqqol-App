import { Schema, model, Types, Document } from "mongoose";

export interface IContactChat extends Document {
  participant1Id: Types.ObjectId;
  participant2Id: Types.ObjectId;
  lastMessage?: string;
  lastMessageType?: "text" | "image" | "file" | "voice"| undefined;
  lastAt?: Date;
  isPinned?: boolean;
  isArchived?: boolean;
  isMuted?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ContactChatSchema = new Schema<IContactChat>(
  {
    participant1Id: {
      type: Schema.Types.ObjectId,
      ref: "GlobalIdentity",
      required: true,
    },
    participant2Id: {
      type: Schema.Types.ObjectId,
      ref: "GlobalIdentity",
      required: true,
    },
    lastMessage: { type: String },
    lastMessageType: {
      type: String,
      enum: ["text", "image", "file", "voice"],
    },
    lastAt: { type: Date },
    isPinned: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    isMuted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Ensure one chat per pair of participants
ContactChatSchema.index(
  { participant1Id: 1, participant2Id: 1 },
  { unique: true }
);

// For sorting by last message time
ContactChatSchema.index({ participant1Id: 1, lastAt: -1 });
ContactChatSchema.index({ participant2Id: 1, lastAt: -1 });

export default model<IContactChat>("ContactChat", ContactChatSchema);