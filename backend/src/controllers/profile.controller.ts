// controllers/profile.controller.js
import { Request, Response } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import GlobalIdentity from "../models/GlobalIdentity";
import User from "../models/User";
import Debt from "../models/Debt";

// In profile.controller.ts - update getMyProfile function
export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const userId = req.userId; // Get userId from auth middleware
    
    if (!identityId || !userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get GlobalIdentity
    const identity = await GlobalIdentity.findById(identityId);
    if (!identity) {
      return res.status(404).json({ message: "Identity not found" });
    }

    // Get User to get the correct name
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Calculate debt statistics
    const sentDebts = await Debt.find({ 
      senderIdentityId: new mongoose.Types.ObjectId(identityId),
      status: "active"
    });
    
    const receivedDebts = await Debt.find({ 
      receiverIdentityId: new mongoose.Types.ObjectId(identityId),
      status: "active"
    });

    const totalOwed = sentDebts.reduce((sum, debt) => sum + debt.amountRemaining, 0);
    const totalDebt = receivedDebts.reduce((sum, debt) => sum + debt.amountRemaining, 0);

    // IMPORTANT: Return user.name from User model, not registeredName
    res.json({
      identity: {
        ...identity.toObject(),
        registeredName: user.name, // Use user's name from User model
      },
      stats: {
        totalOwed,
        totalDebt,
        sentDebtsCount: sentDebts.length,
        receivedDebtsCount: receivedDebts.length,
      },
    });
  } catch (error: any) {
    console.error("GET PROFILE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};

// ✅ Add this function
// In profile.controller.ts - update updateProfile function
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const userId = req.userId;
    const { name, email, address, bio } = req.body;

    if (!identityId || !userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // First update User name
    if (name) {
      await User.findByIdAndUpdate(
        userId,
        { name },
        { new: true, runValidators: true }
      );
    }

    // Then update GlobalIdentity with registeredName (but keep it separate from local contacts)
    const updateData: any = {
      email: email || undefined,
      address: address || undefined,
      bio: bio || undefined,
      updatedAt: new Date()
    };

    // Only update registeredName in GlobalIdentity if it's different
    if (name) {
      updateData.registeredName = name;
    }

    const updatedIdentity = await GlobalIdentity.findByIdAndUpdate(
      identityId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedIdentity) {
      return res.status(404).json({ message: "Identity not found" });
    }

    res.json({ 
      success: true,
      message: "Профиль успешно обновлен",
      identity: updatedIdentity
    });
  } catch (error: any) {
    console.error("UPDATE PROFILE ERROR:", error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: "Email уже используется другим пользователем" 
      });
    }
    
    res.status(500).json({ 
      message: error.message || "Ошибка при обновлении профиля" 
    });
  }
};

// ✅ Add this function
export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: "Текущий пароль и новый пароль обязательны" 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        message: "Новый пароль должен содержать минимум 6 символов" 
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ 
        message: "Текущий пароль неверен" 
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    res.json({ 
      success: true,
      message: "Пароль успешно изменен" 
    });
  } catch (error: any) {
    console.error("CHANGE PASSWORD ERROR:", error);
    res.status(500).json({ 
      message: error.message || "Ошибка при смене пароля" 
    });
  }
};
// Add this to profile.controller.ts
export const updateGlobalIdentityName = async (req: Request, res: Response) => {
  try {
    const identityId = req.globalIdentityId;
    const { registeredName } = req.body;

    if (!identityId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!registeredName || registeredName.trim().length === 0) {
      return res.status(400).json({ message: "Registered name is required" });
    }

    // Update GlobalIdentity registeredName
    const updatedIdentity = await GlobalIdentity.findByIdAndUpdate(
      identityId,
      { 
        registeredName: registeredName.trim(),
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );

    if (!updatedIdentity) {
      return res.status(404).json({ message: "Identity not found" });
    }

    // Also update User name
    await User.findOneAndUpdate(
      { globalIdentityId: identityId },
      { name: registeredName.trim() },
      { new: true, runValidators: true }
    );

    res.json({ 
      success: true,
      message: "Registered name updated",
      registeredName: updatedIdentity.registeredName
    });
  } catch (error: any) {
    console.error("UPDATE REGISTERED NAME ERROR:", error);
    res.status(500).json({ 
      message: error.message || "Error updating registered name" 
    });
  }
};