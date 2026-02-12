import { Schema, model, Types, Document } from "mongoose";

export interface ICustomer extends Document {
  ownerIdentityId: Types.ObjectId;
  targetIdentityId: Types.ObjectId;
  localName: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    ownerIdentityId: {
      type: Schema.Types.ObjectId,
      ref: "GlobalIdentity",
      required: true,
    },
    targetIdentityId: {
      type: Schema.Types.ObjectId,
      ref: "GlobalIdentity",
      required: true,
    },
    localName: { 
      type: String, 
      required: true 
    },
    phone: { 
      type: String, 
      required: true 
    },
  },
  { timestamps: true }
);

// Indekslarni alohida qo'shamiz
CustomerSchema.index({ ownerIdentityId: 1, phone: 1 }, { unique: true });
CustomerSchema.index({ ownerIdentityId: 1, targetIdentityId: 1 }, { unique: true });

export default model<ICustomer>("Customer", CustomerSchema);