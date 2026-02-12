// models/Message.ts - Updated
import { Schema, model, Types, Document } from "mongoose";

export interface IMessage extends Document {
  chatId: Types.ObjectId;
  senderIdentityId: Types.ObjectId;
  text: string;
  type: "text" | "image" | "file" | "voice";
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  isSystemMessage: boolean;
  read: boolean;
  readBy: Types.ObjectId[];
  replyTo?: Types.ObjectId;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    senderIdentityId: {
      type: Schema.Types.ObjectId,
      ref: "GlobalIdentity",
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["text", "image", "file", "voice"],
      default: "text",
    },
    fileUrl: {
      type: String,
    },
    fileName: {
      type: String,
    },
    fileSize: {
      type: String,
    },
    isSystemMessage: {
      type: Boolean,
      default: false,
    },
    read: {
      type: Boolean,
      default: false,
    },
    readBy: [{
      type: Schema.Types.ObjectId,
      ref: "GlobalIdentity",
    }],
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ senderIdentityId: 1 });
MessageSchema.index({ "text": "text" }); // For text search

export default model<IMessage>("Message", MessageSchema);