import { Schema, model, Types } from "mongoose";

const LocalContactSchema = new Schema(
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
      required: true,
    },
  },
  { timestamps: true }
);

LocalContactSchema.index(
  { ownerIdentityId: 1, targetIdentityId: 1, localName: 1 },
  { unique: true }
);

export default model("LocalContact", LocalContactSchema);
