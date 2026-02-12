// models/Debt.ts
import { Schema, model, Types, Document } from "mongoose";

interface IPendingPayment {
  amount: number;
  requestedAt: Date;
  requestedBy: Types.ObjectId;
  verifiedAt?: Date;
  isVerified?: boolean;
  paymentType: "receiver_to_sender" | "sender_to_receiver";
}

export interface IDebt extends Document {
  senderIdentityId: Types.ObjectId;
  receiverIdentityId: Types.ObjectId;
  amountTotal: number;
  amountRemaining: number;
  paymentStatus: "active" | "paid" | "pending_verification"; // Changed from 'status'
  overdueStatus: "on_time" | "overdue"; // New field
  description?: string;
  dueDate?: Date;
  reminders?: boolean[];
  pendingPayment?: IPendingPayment;
  createdAt: Date;
  updatedAt: Date;
}

const DebtSchema = new Schema<IDebt>(
  {
    senderIdentityId: {
      type: Schema.Types.ObjectId,
      ref: "GlobalIdentity",
      required: true,
    },
    receiverIdentityId: {
      type: Schema.Types.ObjectId,
      ref: "GlobalIdentity",
      required: true,
    },
    amountTotal: { 
      type: Number, 
      required: true,
      min: 0.01
    },
    amountRemaining: { 
      type: Number, 
      required: true,
      min: 0
    },
    paymentStatus: {
      type: String,
      enum: ["active", "paid", "pending_verification"],
      default: "active",
    },
    overdueStatus: {
      type: String,
      enum: ["on_time", "overdue"],
      default: "on_time",
    },
    description: {
      type: String,
      trim: true,
    },
    dueDate: {
      type: Date,
    },
    reminders: [{
      type: Boolean,
      default: false
    }],
    pendingPayment: {
      amount: { type: Number, min: 0.01 },
      requestedAt: { type: Date },
      requestedBy: { type: Schema.Types.ObjectId, ref: "GlobalIdentity" },
      verifiedAt: { type: Date },
      isVerified: { type: Boolean },
      paymentType: { 
        type: String, 
        enum: ["receiver_to_sender", "sender_to_receiver"] 
      }
    }
  },
  { timestamps: true }
);

DebtSchema.index({ senderIdentityId: 1, paymentStatus: 1 });
DebtSchema.index({ receiverIdentityId: 1, paymentStatus: 1 });
DebtSchema.index({ senderIdentityId: 1, receiverIdentityId: 1 });
DebtSchema.index({ overdueStatus: 1 });
DebtSchema.index({ dueDate: 1 });

export default model<IDebt>("Debt", DebtSchema);