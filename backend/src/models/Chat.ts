import { Schema, model, Types, Document } from "mongoose";

export interface IChat extends Document {
  debtId: Types.ObjectId;
  participant1Id: Types.ObjectId;
  participant2Id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ChatSchema = new Schema<IChat>(
  {
    debtId: {
      type: Schema.Types.ObjectId,
      ref: "Debt",
      required: true,
      unique: true,
    },
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
  },
  { timestamps: true }
);

// Indekslarni alohida qo'shamiz
ChatSchema.index({ participant1Id: 1, updatedAt: -1 });
ChatSchema.index({ participant2Id: 1, updatedAt: -1 });
ChatSchema.index({ participant1Id: 1, participant2Id: 1 });

export default model<IChat>("Chat", ChatSchema);