import { Request, Response } from "express";
import mongoose from "mongoose";
import Customer from "../models/Customer";
import GlobalIdentity from "../models/GlobalIdentity";
import Debt from "../models/Debt";
// =======================
// CREATE LOCAL CONTACT (CRM)
// =======================
export const createLocalContact = async (req: Request, res: Response) => {
  try {
    const ownerIdentityId = req.globalIdentityId;
    const { name: localName, phone } = req.body;

    if (!ownerIdentityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!localName  || !phone) {
      return res.status(400).json({ message: "Name and phone are required" });
    }

    // GlobalIdentity ni topish yoki yaratish
    let identity = await GlobalIdentity.findOne({ phone });

    if (!identity) {
      identity = await GlobalIdentity.create({
        phone,
        registeredName: "",
        trustScore: 50,
        prevTrustScore: 50,
        totalDebts: 0,
      });
    }
    // 3. Check if this contact already exists as a local contact
    const existingContact = await Customer.findOne({
      ownerIdentityId: new mongoose.Types.ObjectId(ownerIdentityId),
      targetIdentityId: identity._id,
    });

    if (existingContact) {
      // Update existing contact's localName
      existingContact.localName = localName;
      await existingContact.save();
      
      return res.status(200).json({
        ...existingContact.toObject(),
        targetIdentity: {
          ...identity.toObject(),
          hasRegisteredName: !!identity.registeredName,
        }
      });
    }

    // Local contact yaratish (CRM uchun)
    const customer = await Customer.create({
      ownerIdentityId: new mongoose.Types.ObjectId(ownerIdentityId),
      targetIdentityId: identity._id,
      localName: localName,
      phone,
    });

     return res.status(201).json({
      ...customer.toObject(),
      targetIdentity: {
        ...identity.toObject(),
        hasRegisteredName: !!identity.registeredName,
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// =======================
// GET MY LOCAL CONTACTS (CRM) WITH STATS
// =======================
export const getMyContacts = async (req: Request, res: Response) => {
  try {
    const ownerIdentityId = req.globalIdentityId;


    if (!ownerIdentityId) {
      console.error("❌ No ownerIdentityId in request");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const objectId = new mongoose.Types.ObjectId(ownerIdentityId);

    // Get customers with populated targetIdentity
    const contacts = await Customer.find({
      ownerIdentityId: objectId,
    })
      .populate("targetIdentityId", "registeredName phone trustScore")
      .sort({ localName: 1 });


    // Har bir customer uchun debt statistikasini hisoblash
  // controllers/customer.controller.ts
// In the getMyContacts function, update the debt filtering:
const contactsWithStats = await Promise.all(
  contacts.map(async (customer) => {
    const targetIdentityId = (customer.targetIdentityId as any)._id;
    const currentUserIdentityId = objectId;

    // Peer-to-peer debts ni filter qilish
    const debts = await Debt.find({
      $or: [
        { senderIdentityId: currentUserIdentityId, receiverIdentityId: targetIdentityId },
        { senderIdentityId: targetIdentityId, receiverIdentityId: currentUserIdentityId }
      ]
    });

    const now = new Date();
    const overdueCount = debts.filter((d: any) => {
      const isActive = d.paymentStatus === 'active';
      const isOverdueStatus = d.overdueStatus === 'overdue';
      const isPastDue = d.dueDate && new Date(d.dueDate) < now;
      
      return isActive && d.amountRemaining > 0 && (isOverdueStatus || isPastDue);
    }).length;
    // Statistikani hisoblash - UPDATED: use paymentStatus instead of status
    const activeDebts = debts.filter(d => d.paymentStatus === "active");
    const totalActiveDebt = activeDebts.reduce((sum, debt) => sum + debt.amountRemaining, 0);

    return {
      _id: customer._id,
      localName: customer.localName,
      phone: customer.phone,
      trustScore: (customer.targetIdentityId as any)?.trustScore || 50,
      totalActiveDebt,
      overdueCount,
      totalDebts: debts.length,
      targetIdentity: customer.targetIdentityId
    };
  })
);

    

    res.json(contactsWithStats);
  } catch (error: any) {
    console.error("❌ GET /customers error:", error);
    res.status(500).json({ 
      message: "Internal server error",
      error: error.message
    });
  }
};

// =======================
// GET CUSTOMER BY ID WITH DEBTS STATS
// =======================
export const getCustomerById = async (req: Request, res: Response) => {
  try {
    const ownerIdentityId = req.globalIdentityId;
    const { id } = req.params;

    if (!ownerIdentityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    const customer = await Customer.findOne({
      _id: new mongoose.Types.ObjectId(id),
      ownerIdentityId: new mongoose.Types.ObjectId(ownerIdentityId),
    })
      .populate("targetIdentityId", "registeredName phone trustScore totalDebts");

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json({
      _id: customer._id,
      localName: customer.localName,
      phone: customer.phone,
      targetIdentityId: customer.targetIdentityId,
      createdAt: customer.createdAt,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};