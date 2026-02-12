import { Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";
// controllers/user.controller.ts
export const checkUserRegistration = async (req: Request, res: Response) => {
  try {
    const { identityId } = req.params;
    
    // Check if a User document exists for this identityId
    const user = await User.findOne({ 
      globalIdentityId: new mongoose.Types.ObjectId(identityId) 
    });
    
    res.json({
      exists: !!user,
      user: user ? {
        name: user.name,
        phone: user.phone
      } : null
    });
  } catch (error: any) {
    console.error("Check registration error:", error);
    res.status(500).json({ message: error.message });
  }
};