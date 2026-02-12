import { Router } from "express";
import { searchIdentity } from "../controllers/identity.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get("/search", authMiddleware, searchIdentity);

export default router;