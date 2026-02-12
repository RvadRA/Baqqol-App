import { Schema, model, Types, Document } from "mongoose";

export interface IContactMessage extends Document {
  contactChatId: Types.ObjectId;
  senderIdentityId: Types.ObjectId;
  text: string;
  type: "text" | "image" | "file" | "voice";
  fileUrl?: string;
  fileName?: string;
  fileSize?: string;
  read: boolean;
  readBy: Types.ObjectId[];
  replyTo?: Types.ObjectId;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ContactMessageSchema = new Schema<IContactMessage>(
  {
    contactChatId: {
      type: Schema.Types.ObjectId,
      ref: "ContactChat",
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
    fileUrl: { type: String },
    fileName: { type: String },
    fileSize: { type: String },
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
      ref: "ContactMessage",
    },
    deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

ContactMessageSchema.index({ contactChatId: 1, createdAt: -1 });
ContactMessageSchema.index({ senderIdentityId: 1 });
ContactMessageSchema.index({ "text": "text" });

export default model<IContactMessage>("ContactMessage", ContactMessageSchema);