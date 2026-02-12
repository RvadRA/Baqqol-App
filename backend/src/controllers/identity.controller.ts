import { Request, Response } from "express";
import GlobalIdentity from "../models/GlobalIdentity";
import Customer from "../models/Customer";
import User from "../models/User";

export const searchIdentity = async (req: Request, res: Response) => {
  try {
    const q = req.query.q;

    if (!q || typeof q !== "string" || q.length < 3) {
      return res.json({ identities: [], locals: [] });
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // 1️⃣ GLOBAL IDENTITIES
    const identities = await GlobalIdentity.find({
      $or: [
        { phone: { $regex: escaped } },
        { registeredName: { $regex: escaped, $options: "i" } },
      ],
    })
      .select("phone registeredName trustScore")
      .limit(5)
      .lean();

    // 2️⃣ REGISTERED USERS
    const phones = identities.map((i: any) => i.phone);

    const users = await User.find({
      phone: { $in: phones },
    }).select("phone");

    const userPhones = new Set(users.map((u) => u.phone));

    const enrichedIdentities = identities.map((i: any) => ({
      ...i,
      isRegistered: userPhones.has(i.phone),
    }));

    // 3️⃣ LOCAL NAMES
    const ownerIdentityId = req.globalIdentityId;
    if (!ownerIdentityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const locals = await Customer.find({
      localName: { $regex: escaped, $options: "i" },
      ownerIdentityId: ownerIdentityId,
    })
      .populate({
        path: "targetIdentityId",
        select: "phone registeredName trustScore",
      })
      .select("localName targetIdentityId")
      .limit(5);

    return res.json({
      identities: enrichedIdentities,
      locals,
    });
  } catch (err: any) {
    console.error("❌ searchIdentity error:", err);

    if (!res.headersSent) {
      return res.status(500).json({ message: "Search failed" });
    }
  }
};