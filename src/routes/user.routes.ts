
import { Router } from "express";
import multer from "multer";

import {
    getMyProfile,
    updateMyProfile,
    getAllUsers,
    updateUserRole,
    getAdminDashboardStats,
} from "../controllers/user.controller.js";

import { uploadImage } from "../controllers/upload.controller.js";

import {
    verifyToken,
    verifyAdmin,
} from "../middlewares/auth.middleware.js";

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: (_req, file, callback) => {
        if (file.mimetype.startsWith("image/")) {
            callback(null, true);
        } else {
            callback(new Error("Only image files are allowed"));
        }
    },
});

// Current user's profile
router.get("/me", verifyToken, getMyProfile);
router.patch("/me", verifyToken, updateMyProfile);

// Authenticated profile image upload
router.post(
    "/profile-image",
    verifyToken,
    upload.single("image"),
    uploadImage
);

// Admin-only routes
router.get("/", verifyToken, verifyAdmin, getAllUsers);
router.patch("/:id/role", verifyToken, verifyAdmin, updateUserRole);
router.get("/admin/stats", verifyToken, verifyAdmin, getAdminDashboardStats);

export default router;
