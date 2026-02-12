import { Request, Response } from "express";  
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";
import GlobalIdentity from "../models/GlobalIdentity";

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is missing");
  }
  return secret;
};

// SIGN UP
export const signup = async (req: Request, res: Response) => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        message: "Name, phone and password are required",
      });
    }

    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(409).json({
        message: "User with this phone already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // GlobalIdentity yaratish yoki topish
    let globalIdentity = await GlobalIdentity.findOne({ phone });
    
    if (!globalIdentity) {
      globalIdentity = await GlobalIdentity.create({
        phone,
        registeredName: name,
        trustScore: 50,
        prevTrustScore: 50,
        totalDebts: 0,
        
      });
    }else {
      // If GlobalIdentity exists but registeredName is empty or different, update it
      if (!globalIdentity.registeredName || globalIdentity.registeredName === "" || globalIdentity.registeredName !== name) {
        globalIdentity.registeredName = name;
        await globalIdentity.save();
      }
    }

    // User yaratish
    const user = await User.create({
      name,
      phone,
      password: hashedPassword,
      globalIdentityId: globalIdentity._id,
    });

    // Token yaratish
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        globalIdentityId: globalIdentity._id.toString(),
      },
      getJwtSecret(),
      { expiresIn: "30d" }
    );

    return res.status(201).json({
      message: "Signup successful",
      token,
      name: user.name,
      phone: user.phone,
      userId: user._id,
      globalIdentityId: globalIdentity._id,
    });
  } catch (error: any) {
    console.error("SIGNUP ERROR:", error);
    return res.status(500).json({
      message: error.message || "Signup failed",
    });
  }
};

// LOGIN
export const login = async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid phone or password" });
    }

    // Ensure user has globalIdentityId
    if (!user.globalIdentityId) {
      const identity = await GlobalIdentity.findOne({ phone });
      if (identity) {
        user.globalIdentityId = identity._id;
        await user.save();
      } else {
        const newIdentity = await GlobalIdentity.create({
          phone,
          registeredName: user.name,
          trustScore: 50,
          prevTrustScore: 50,
          totalDebts: 0,
        });
        user.globalIdentityId = newIdentity._id;
        await user.save();
      }
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        globalIdentityId: user.globalIdentityId.toString(),
      },
      getJwtSecret(),
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      name: user.name,
      phone: user.phone,
      userId: user._id,
      globalIdentityId: user.globalIdentityId,
    });
  } catch (error: any) {
    console.error("LOGIN ERROR:", error);
    return res.status(500).json({ message: "Login failed" });
  }
};