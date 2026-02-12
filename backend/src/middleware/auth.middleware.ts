import { RequestHandler } from "express";
import jwt from "jsonwebtoken";

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is missing");
  }
  return secret;
};

export const authMiddleware: RequestHandler = (req, res, next) => {
  
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    console.warn("❌ No authorization header");
    res.status(401).json({ message: "Authorization header missing" });
    return;
  }

  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    console.warn("❌ Invalid token format");
    res.status(401).json({ message: "Invalid token format" });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      userId: string;
      globalIdentityId: string;
    };

    
    req.userId = decoded.userId;
    req.globalIdentityId = decoded.globalIdentityId;

  

    next();
  } catch (error: any) {
    console.error("❌ Auth error:", error.message);
    console.error("📝 Token that failed:", token.substring(0, 50) + "...");
    res.status(401).json({ message: "Invalid or expired token" });
  }
};