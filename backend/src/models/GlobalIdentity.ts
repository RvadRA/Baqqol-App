import { Schema, model, Types, Document } from "mongoose";

export interface IGlobalIdentity extends Document {
  phone: string;
  registeredName: string; // ✅ O'zgartirildi: globalName → registeredName
  email?: string;
  address?: string;
  bio?: string;
  trustScore: number;
  prevTrustScore: number;
  totalDebts: number;
  createdAt: Date;
  updatedAt: Date;
}

const GlobalIdentitySchema = new Schema<IGlobalIdentity>(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    registeredName: { // ✅ O'zgartirildi
      type: String,
      required: true,
    },
     email: {
      type: String,
      default: "",
    },
    address: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
      default: "",
    },
    trustScore: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    prevTrustScore: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    totalDebts: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default model<IGlobalIdentity>("GlobalIdentity", GlobalIdentitySchema);