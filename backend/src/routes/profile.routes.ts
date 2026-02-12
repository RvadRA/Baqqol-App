import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { getMyProfile,
    updateProfile, changePassword,
    updateGlobalIdentityName

 } from "../controllers/profile.controller";

const router = Router();

router.get("/me", authMiddleware, getMyProfile);
router.put("/update", authMiddleware, updateProfile);
router.put("/change-password", authMiddleware, changePassword);
router.put("/update-registered-name", authMiddleware, updateGlobalIdentityName);
export default router;
