// models/ChatSettings.ts
import { Schema, model, Types, Document } from "mongoose";

export interface IChatSettings extends Document {
  debtId: Types.ObjectId;
  userId: Types.ObjectId;
  isMuted: boolean;
  isArchived: boolean;
  isPinned: boolean;
  customNotification: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ChatSettingsSchema = new Schema<IChatSettings>(
  {
    debtId: {
      type: Schema.Types.ObjectId,
      ref: "Debt",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "GlobalIdentity",
      required: true,
    },
    isMuted: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    customNotification: {
      type: Boolean,
      default: false,
    },
  },
  { 
    timestamps: true,
    // Compound index to ensure unique settings per user per chat
}
);
ChatSettingsSchema.index({ debtId: 1, userId: 1 }, { unique: true });

export default model<IChatSettings>("ChatSettings", ChatSettingsSchema);