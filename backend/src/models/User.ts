import { Schema, model, Types, Document } from "mongoose";

export interface IUser extends Document {
  globalIdentityId: Types.ObjectId;
  name: string; // ✅ O'zgaradi: shopName → name
  phone: string;
  password: string;
  // ❌ role YO'Q! Hammasi bir xil user
}

const UserSchema = new Schema<IUser>(
  {
    globalIdentityId: {
      type: Schema.Types.ObjectId,
      ref: "GlobalIdentity",
      required: true,
    },
    name: { // ✅ O'zgargan: shopName → name
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    // ❌ role FIELDI YO'Q!
  },
  { timestamps: true }
);

export default model<IUser>("User", UserSchema);