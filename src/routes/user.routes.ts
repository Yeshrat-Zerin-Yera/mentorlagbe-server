import { Router } from "express";
import {
    getMyProfile,
    updateMyProfile,
    getAllUsers,
    updateUserRole,
} from "../controllers/user.controller.js";

import {
    verifyToken,
    verifyAdmin,
} from "../middlewares/auth.middleware.js";

const router = Router();

// Current user's profile
router.get("/me", verifyToken, getMyProfile);
router.patch("/me", verifyToken, updateMyProfile);

// Admin-only routes
router.get("/", verifyToken, verifyAdmin, getAllUsers);
router.patch("/:id/role", verifyToken, verifyAdmin, updateUserRole);

export default router;