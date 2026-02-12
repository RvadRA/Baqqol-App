// routes/user.routes.ts
import { Router } from "express";
import { checkUserRegistration } from "../controllers/user.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get("/by-identity/:identityId", authMiddleware, checkUserRegistration);

export default router;